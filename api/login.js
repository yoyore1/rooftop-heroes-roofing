// Dashboard auth endpoint.
//   GET    -> { authed, configured }   (used by the page to decide what to show)
//   POST   -> { password }             (sets the session cookie on success)
//   DELETE -> logout                   (clears the session cookie)

import {
  passwordOk, makeSessionCookie, clearSessionCookie, isAuthed, authConfigured,
} from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, authed: isAuthed(req), configured: authConfigured() });
  }

  if (req.method === "POST") {
    if (!authConfigured()) {
      return res.status(500).json({ ok: false, error: "Dashboard login isn't configured yet (set ADMIN_PASSWORD and SESSION_SECRET)." });
    }
    const b = (req.body && typeof req.body === "object") ? req.body : safeParse(req.body);
    if (!passwordOk(b.password)) {
      return res.status(401).json({ ok: false, error: "Incorrect password." });
    }
    res.setHeader("Set-Cookie", makeSessionCookie());
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

function safeParse(body) {
  if (!body) return {};
  try { return JSON.parse(body); } catch { return {}; }
}
