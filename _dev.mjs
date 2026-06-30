// Local DEV server — runs the REAL /api functions against your real .env
// (Supabase + Resend + Twilio + password login), no Vercel CLI needed.
//   npm run dev   →   http://localhost:3200   (dashboard: /admin)
// This mirrors how Vercel invokes the handlers, so behaviour matches production.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

// ---- load .env into process.env BEFORE importing handlers (they read env at load) ----
(function loadEnv() {
  let txt;
  try { txt = readFileSync(new URL("./.env", import.meta.url), "utf8"); }
  catch { console.warn("⚠  no .env found — API calls will be unconfigured"); return; }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || process.argv[2] || 3200;
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };

// real handlers (dynamic import so the env loader above runs first)
const handlers = {
  "/api/estimate": (await import("./api/estimate.js")).default,
  "/api/login": (await import("./api/login.js")).default,
  "/api/leads": (await import("./api/leads.js")).default,
};

const readRaw = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });

// minimal Vercel-style req.body + res.status().json() shims
function adapt(req, res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(obj)); return res;
  };
  return res;
}

http.createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);

  if (handlers[path]) {
    const raw = await readRaw(req);
    if (raw) { try { req.body = JSON.parse(raw); } catch { req.body = raw; } }
    adapt(req, res);
    try {
      await handlers[path](req, res);
    } catch (e) {
      console.error("[dev] handler error:", e);
      if (!res.headersSent) { res.statusCode = 500; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: false, error: e.message })); }
    }
    return;
  }

  // static files with clean-URL fallback (/admin -> admin.html)
  let p = path;
  if (p === "/" || p.endsWith("/")) p += "index.html";
  let file = join(ROOT, p);
  try {
    const s = await stat(file).catch(() => null);
    if (!s && !extname(p)) file = join(ROOT, p + ".html");
    else if (s && s.isDirectory()) file = join(file, "index.html");
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(buf);
  } catch {
    try { const buf = await readFile(join(ROOT, "index.html")); res.writeHead(200, { "content-type": "text/html" }); res.end(buf); }
    catch { res.writeHead(404); res.end("not found"); }
  }
}).listen(PORT, () => console.log("rooftop-heroes DEV (real backend) → http://localhost:" + PORT + "  (dashboard: /admin)"));
