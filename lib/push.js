// Web Push (VAPID). Sends an encrypted push to a stored browser subscription
// using the `web-push` library, which handles VAPID JWT signing and the
// RFC 8291 payload encryption. The library is imported lazily so a missing
// module (e.g. local dev without `npm install`) never breaks lead capture —
// push just no-ops and email/SMS still fire.

const PUBLIC = process.env.VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:leads@rooftopheroesroofing.com";

export const vapidPublicKey = PUBLIC || null;

export function pushConfigured() {
  return Boolean(PUBLIC && PRIVATE);
}

let webpush = null;
let initTried = false;
async function getWebpush() {
  if (initTried) return webpush;
  initTried = true;
  if (!pushConfigured()) return null;
  try {
    const mod = await import("web-push");
    const wp = mod.default || mod;
    wp.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    webpush = wp;
  } catch (e) {
    console.error("[push] web-push unavailable:", e.message);
    webpush = null;
  }
  return webpush;
}

// Send to one subscription ({ endpoint, keys: { p256dh, auth } }).
// Returns { ok } on success, { gone:true } if the push service reports the
// subscription is dead (404/410) so the caller can prune it, or throws on
// a transient error.
export async function sendOne(sub, payload) {
  const wp = await getWebpush();
  if (!wp) return { skipped: true };
  try {
    await wp.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
    return { ok: true };
  } catch (e) {
    const code = e?.statusCode;
    if (code === 404 || code === 410) return { gone: true };
    throw e;
  }
}
