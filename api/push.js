// Web Push subscription endpoint.
//   GET    -> { configured, key }   public VAPID key for the browser to subscribe
//   POST   -> { subscription }       save a subscription (auth required)
//   DELETE -> { endpoint }           remove a subscription (auth required)

import { isAuthed } from "../lib/auth.js";
import { insertSubscription, deleteSubscriptionByEndpoint, dbConfigured } from "../lib/db.js";
import { pushConfigured, vapidPublicKey } from "../lib/push.js";

export default async function handler(req, res) {
  // The VAPID public key is not secret — the browser needs it to subscribe.
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, configured: pushConfigured(), key: vapidPublicKey });
  }

  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "Not authenticated" });
  if (!dbConfigured()) return res.status(500).json({ ok: false, error: "Database not configured" });

  if (req.method === "POST") {
    const b = (req.body && typeof req.body === "object") ? req.body : safeParse(req.body);
    const sub = b.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return res.status(400).json({ ok: false, error: "Invalid subscription" });
    }
    try {
      await insertSubscription(sub);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("[push] save failed:", e.message);
      return res.status(500).json({ ok: false, error: "Could not save subscription" });
    }
  }

  if (req.method === "DELETE") {
    const b = (req.body && typeof req.body === "object") ? req.body : safeParse(req.body);
    const endpoint = String(b.endpoint || "");
    if (!endpoint) return res.status(400).json({ ok: false, error: "Missing endpoint" });
    try {
      await deleteSubscriptionByEndpoint(endpoint);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("[push] delete failed:", e.message);
      return res.status(500).json({ ok: false, error: "Could not remove subscription" });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

function safeParse(body) {
  if (!body) return {};
  try { return JSON.parse(body); } catch { return {}; }
}
