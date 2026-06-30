// Vercel serverless function: receives free-inspection / lead submissions.
// Validates, blocks spam, SAVES the lead to Supabase, then notifies the owner
// by email (Resend) and SMS (Twilio). Saving and notifying are independent —
// a lead is never lost just because one channel is misconfigured or down.

import { insertLead, dbConfigured, isDuplicateLead } from "../lib/db.js";
import { notifyLead } from "../lib/notify.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const b = (req.body && typeof req.body === "object") ? req.body : safeParse(req.body);

  // spam: honeypot filled or submitted suspiciously fast -> fake success, don't deliver
  const tooFast = b._ts && Date.now() - Number(b._ts) < 2500;
  if ((b.company && String(b.company).length) || tooFast) {
    return res.status(200).json({ ok: true });
  }

  const name = String(b.name || "").trim();
  const phone = String(b.phone || "").trim();
  const email = String(b.email || "").trim();
  if (name.length < 2) return res.status(400).json({ ok: false, error: "Please enter your name" });
  if (phone.replace(/\D/g, "").length < 7) return res.status(400).json({ ok: false, error: "Please enter a valid phone number" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: "Please enter a valid email address" });

  // Drop accidental double-submits (same phone within a few minutes) before saving.
  try {
    if (dbConfigured() && await isDuplicateLead(phone)) {
      console.log("[estimate] duplicate within 3min, skipping:", phone);
      return res.status(200).json({ ok: true });
    }
  } catch (e) { console.error("[estimate] dup check failed:", e.message); }

  const lead = {
    name: name.slice(0, 80),
    phone: phone.slice(0, 30),
    email: email.slice(0, 120),
    address: String(b.address || "").trim().slice(0, 200) || null,
    service: String(b.service || "").trim().slice(0, 80) || null,
    message: String(b.message || "").trim().slice(0, 2000) || null,
    source: "website",
  };

  // Persist first so the lead survives even if notifications fail. If the DB
  // isn't configured yet, fall back to an in-memory record so we can still
  // notify + log.
  let saved = { ...lead, created_at: new Date().toISOString() };
  try {
    if (dbConfigured()) saved = await insertLead(lead);
    else console.warn("[estimate] DB not configured — lead not persisted, logging only");
  } catch (e) {
    console.error("[estimate] save failed:", e.message);
  }

  console.log("[lead]", JSON.stringify(saved));

  try { await notifyLead(saved); } catch (e) { console.error("[estimate] notify failed:", e.message); }

  return res.status(200).json({ ok: true });
}

function safeParse(body) {
  if (!body) return {};
  try { return JSON.parse(body); } catch { return {}; }
}
