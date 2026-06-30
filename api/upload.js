// Accepts a raw image body and stores it in Supabase Storage (lead-photos bucket).
// Returns the public URL to include in the lead record.
// No auth required — this is called during public form submission.

export const config = { api: { bodyParser: false } };

const ALLOWED = new Set(["image/jpeg","image/png","image/webp","image/gif","image/heic","image/heif"]);
const EXTS = { "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/heic":"heic","image/heif":"heif" };
const MAX = 10 * 1024 * 1024; // 10 MB

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !KEY) return res.status(500).json({ ok: false, error: "Storage not configured" });

  const contentType = (req.headers["content-type"] || "image/jpeg").split(";")[0].trim();
  if (!ALLOWED.has(contentType)) {
    return res.status(400).json({ ok: false, error: "File must be an image (JPEG, PNG, WebP, GIF, HEIC)" });
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX) return res.status(413).json({ ok: false, error: "Photo too large (max 10 MB)" });
    chunks.push(chunk);
  }
  if (!chunks.length) return res.status(400).json({ ok: false, error: "No file received" });
  const buffer = Buffer.concat(chunks);

  const ext = EXTS[contentType] || "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/lead-photos/${filename}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": contentType },
    body: buffer,
  });

  if (!r.ok) {
    console.error("[upload] storage error:", (await r.text()).slice(0, 200));
    return res.status(500).json({ ok: false, error: "Upload failed" });
  }

  const url = `${SUPABASE_URL}/storage/v1/object/public/lead-photos/${filename}`;
  return res.status(200).json({ ok: true, url });
}
