// Minimal static preview server for local viewing (not used in production).
// Stubs POST /api/estimate so the lead form can be tested locally.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || process.argv[2] || 3200;
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };

http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url.startsWith("/api/estimate")) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/" || p.endsWith("/")) p += "index.html";
  let file = join(ROOT, p);
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(buf);
  } catch {
    try { const buf = await readFile(join(ROOT, "index.html")); res.writeHead(200, { "content-type": "text/html" }); res.end(buf); }
    catch { res.writeHead(404); res.end("not found"); }
  }
}).listen(PORT, () => console.log("rooftop-heroes-pro → http://localhost:" + PORT));
