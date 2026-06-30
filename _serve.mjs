// Minimal static preview server for local viewing (not used in production).
// Stubs the /api routes with in-memory sample data so the lead form AND the
// /admin dashboard can both be exercised locally without Supabase/Resend/Twilio.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || process.argv[2] || 3200;
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };

// in-memory sample leads (local preview only)
let SEQ = 3;
const leads = [
  { id: "s1", name: "Maria Gonzalez", phone: "(501) 555-0142", address: "1820 Oak Ridge Dr, Little Rock", service: "Storm / hail damage", message: "Big hail storm last week — saw a few shingles in the yard. Insurance said to get an inspection.", status: "new", notes: "", created_at: new Date(Date.now() - 9 * 60000).toISOString() },
  { id: "s2", name: "Dale Whitmore", phone: "(501) 555-0177", address: "44 Pinewood Ln, Conway", service: "Roof replacement", message: "Roof is 22 years old. Want a quote on a full replacement before winter.", status: "called", notes: "Left VM 6/28", created_at: new Date(Date.now() - 5 * 3600000).toISOString() },
  { id: "s3", name: "Janet Pruitt", phone: "(501) 555-0193", address: "", service: "Free roof inspection", message: "", status: "won", notes: "Booked 7/2", created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
];

const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);

  // ---- API stubs ----
  if (path.startsWith("/api/")) {
    if (path === "/api/estimate" && req.method === "POST") {
      const b = await readBody(req);
      leads.unshift({ id: "s" + ++SEQ, name: b.name || "New Lead", phone: b.phone || "", address: b.address || "", service: b.service || "", message: b.message || "", status: "new", notes: "", created_at: new Date().toISOString() });
      return json(res, 200, { ok: true });
    }
    if (path === "/api/login") {
      if (req.method === "GET") return json(res, 200, { ok: true, authed: true, configured: true }); // open in local preview
      if (req.method === "POST") return json(res, 200, { ok: true });
      if (req.method === "DELETE") return json(res, 200, { ok: true });
    }
    if (path === "/api/leads") {
      if (req.method === "GET") return json(res, 200, { ok: true, leads });
      if (req.method === "PATCH") {
        const b = await readBody(req);
        const l = leads.find((x) => x.id === b.id);
        if (l) { if (b.status != null) l.status = b.status; if (b.notes != null) l.notes = b.notes; }
        return json(res, 200, { ok: true, lead: l });
      }
    }
    return json(res, 404, { ok: false, error: "not found" });
  }

  // ---- static files (with clean-URL fallback to <path>.html) ----
  let p = path;
  if (p === "/" || p.endsWith("/")) p += "index.html";
  let file = join(ROOT, p);
  try {
    const s = await stat(file).catch(() => null);
    if (!s && !extname(p)) file = join(ROOT, p + ".html"); // /admin -> admin.html
    else if (s && s.isDirectory()) file = join(file, "index.html");
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(buf);
  } catch {
    try { const buf = await readFile(join(ROOT, "index.html")); res.writeHead(200, { "content-type": "text/html" }); res.end(buf); }
    catch { res.writeHead(404); res.end("not found"); }
  }
}).listen(PORT, () => console.log("rooftop-heroes-pro → http://localhost:" + PORT + "  (dashboard: /admin)"));
