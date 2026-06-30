// Lead notifications: a richly structured email (Resend) and a concise SMS
// (Twilio). Channels are independent — if one is unconfigured or errors, the
// other still fires, and the lead is already saved in the database either way.

const TZ = "America/Chicago"; // Arkansas — Central Time

export async function notifyLead(lead) {
  const results = await Promise.allSettled([sendEmail(lead), sendSms(lead)]);
  const labels = ["email", "sms"];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[notify] ${labels[i]} failed:`, r.reason?.message || r.reason);
    }
  });
}

/* ---------- formatting helpers ---------- */

function when(iso) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: TZ, weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    }) + " CT";
  } catch { return iso || "just now"; }
}

// Normalize to an E.164-ish tel: target for click-to-call.
function telHref(phone) {
  const cleaned = String(phone).replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  const digits = cleaned.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

function dashboardUrl() {
  const base = process.env.SITE_URL;
  return base ? `${base.replace(/\/$/, "")}/admin` : null;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* ---------- Email (Resend) ---------- */

async function sendEmail(lead) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_EMAIL;
  if (!key || !to) return; // not configured — skip silently
  const from = process.env.LEAD_FROM || "Rooftop Heroes Leads <onboarding@resend.dev>";
  const dash = dashboardUrl();

  const subject = `🦸 New Lead: ${lead.name} — ${lead.service || "Roofing"}`;
  const rows = [
    ["Name", lead.name],
    ["Phone", lead.phone],
    ["Service", lead.service || "—"],
    ["Best time", lead.best_time || "Anytime"],
    ["Address", lead.address || "—"],
    ["Submitted", when(lead.created_at)],
  ];

  const text = [
    "NEW ROOFING LEAD",
    "==================",
    "",
    ...rows.map(([k, v]) => `${(k + ":").padEnd(11)} ${v}`),
    "",
    "Message:",
    lead.message || "—",
    "",
    `Call now:  ${telHref(lead.phone)}`,
    dash ? `Dashboard: ${dash}` : "",
    lead.photo_url ? `Photo:     ${lead.photo_url}` : "",
  ].filter(Boolean).join("\n");

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html: emailHtml(lead, rows, dash) }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

function emailHtml(lead, rows, dash) {
  const tel = telHref(lead.phone);
  const rowsHtml = rows.map(([k, v]) => `
    <tr>
      <td style="padding:9px 14px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;border-top:1px solid #f1f3f5">${esc(k)}</td>
      <td style="padding:9px 14px;color:#111827;font-size:15px;font-weight:600;border-top:1px solid #f1f3f5">${esc(v)}</td>
    </tr>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="background:#b91c1c;padding:20px 24px">
          <div style="color:#fff;font-size:12px;letter-spacing:.6px;text-transform:uppercase;opacity:.85">Rooftop Heroes — new website lead</div>
          <div style="color:#fff;font-size:22px;font-weight:800;margin-top:4px">🦸 ${esc(lead.name)}</div>
        </td></tr>
        <tr><td style="padding:6px 10px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
        </td></tr>
        <tr><td style="padding:14px 24px 0">
          <div style="color:#6b7280;font-size:13px;margin-bottom:5px">Message</div>
          <div style="background:#f9fafb;border:1px solid #eef0f3;border-radius:10px;padding:12px 14px;color:#111827;font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(lead.message || "—")}</div>
        </td></tr>
        ${lead.photo_url ? `
        <tr><td style="padding:14px 24px 0">
          <div style="color:#6b7280;font-size:13px;margin-bottom:6px">Roof Photo</div>
          <img src="${esc(lead.photo_url)}" alt="Roof photo" style="width:100%;max-height:300px;object-fit:cover;border-radius:10px;display:block">
        </td></tr>` : ""}
        <tr><td style="padding:20px 24px 24px">
          <a href="tel:${esc(tel)}" style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:10px">📞 Call ${esc(lead.phone)}</a>
          ${dash ? `<a href="${esc(dash)}" style="display:inline-block;margin:8px 0 0 8px;background:#111827;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:10px">View dashboard</a>` : ""}
        </td></tr>
      </table>
      <div style="color:#9ca3af;font-size:12px;margin-top:14px">Sent automatically by your website lead form • ${esc(when(lead.created_at))}</div>
    </td></tr>
  </table></body></html>`;
}

/* ---------- SMS (Twilio) ---------- */

async function sendSms(lead) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.LEAD_SMS_TO;
  if (!sid || !token || !from || !to) return; // not configured — skip silently

  const msg = (lead.message || "").trim().replace(/\s+/g, " ");
  const preview = msg ? `"${msg.slice(0, 90)}${msg.length > 90 ? "…" : ""}"` : "";
  const body = [
    "🦸 NEW ROOFING LEAD",
    lead.name,
    `📞 ${lead.phone}`,
    `Needs: ${lead.service || "—"}`,
    `Call: ${lead.best_time || "Anytime"}`,
    lead.address ? `At: ${lead.address}` : "",
    preview,
  ].filter(Boolean).join("\n");

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  if (lead.photo_url) params.append("MediaUrl1", lead.photo_url);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!r.ok) throw new Error(`twilio ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
