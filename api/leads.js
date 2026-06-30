// Dashboard data endpoint (auth required via the session cookie).
//   GET    -> { leads: [...] }                    most recent first (active only)
//   GET ?trash=1 -> { leads: [...] }              soft-deleted leads for trash view
//   PATCH  -> { id, status?, notes?, followup_date?, restore? }
//   DELETE -> { id }                              soft-delete (recoverable from trash)

import { isAuthed } from "../lib/auth.js";
import { listLeads, updateLead, deleteLead, dbConfigured } from "../lib/db.js";

const STATUSES = ["new", "called", "quoted", "won", "lost"];

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: "Not authenticated" });
  if (!dbConfigured()) return res.status(500).json({ ok: false, error: "Database not configured" });

  try {
    if (req.method === "GET") {
      const trash = req.query?.trash === "1";
      const leads = await listLeads({ limit: 300, trash });
      return res.status(200).json({ ok: true, leads });
    }

    if (req.method === "PATCH") {
      const b = (req.body && typeof req.body === "object") ? req.body : safeParse(req.body);
      const id = String(b.id || "");
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

      const patch = {};
      if (b.restore === true) {
        patch.is_deleted = false;
      } else {
        if (b.status != null) {
          if (!STATUSES.includes(b.status)) return res.status(400).json({ ok: false, error: "Invalid status" });
          patch.status = b.status;
        }
        if (b.notes != null) patch.notes = String(b.notes).slice(0, 2000);
        if ("followup_date" in b) {
          const fd = b.followup_date;
          if (fd !== null && fd !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(fd))) {
            return res.status(400).json({ ok: false, error: "Invalid followup_date" });
          }
          patch.followup_date = fd || null;
        }
      }
      if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: "Nothing to update" });

      const lead = await updateLead(id, patch);
      return res.status(200).json({ ok: true, lead });
    }

    if (req.method === "DELETE") {
      const b = (req.body && typeof req.body === "object") ? req.body : safeParse(req.body);
      const id = String(b.id || "");
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      await deleteLead(id);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("[leads]", e.message);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

function safeParse(body) {
  if (!body) return {};
  try { return JSON.parse(body); } catch { return {}; }
}
