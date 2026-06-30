// Supabase REST helpers (PostgREST). Server-side ONLY — these use the
// service_role key, which bypasses row-level security. Never expose
// SUPABASE_SERVICE_ROLE_KEY to the browser or commit it to the repo.

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function dbConfigured() {
  return Boolean(URL && KEY);
}

function headers(extra = {}) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// Insert a lead and return the stored row (with id + created_at).
export async function insertLead(lead) {
  const r = await fetch(`${URL}/rest/v1/leads`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(lead),
  });
  if (!r.ok) throw new Error(`supabase insert ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json();
  return rows[0];
}

// True if an identical phone already submitted within the last `minutes`.
// Guards against accidental double-submits (refresh / re-tap) reaching the DB.
export async function isDuplicateLead(phone, minutes = 3) {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const r = await fetch(
    `${URL}/rest/v1/leads?select=id&phone=eq.${encodeURIComponent(phone)}&created_at=gte.${encodeURIComponent(since)}&limit=1`,
    { headers: headers() }
  );
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

// Most recent leads first. Pass trash:true to list soft-deleted leads instead.
export async function listLeads({ limit = 300, trash = false } = {}) {
  const filter = trash ? "is_deleted=eq.true" : "is_deleted=eq.false";
  const r = await fetch(
    `${URL}/rest/v1/leads?select=*&${filter}&order=created_at.desc&limit=${limit}`,
    { headers: headers() }
  );
  if (!r.ok) throw new Error(`supabase list ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Patch a single lead (status / notes / followup_date / is_deleted) and return the updated row.
export async function updateLead(id, patch) {
  const r = await fetch(
    `${URL}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    }
  );
  if (!r.ok) throw new Error(`supabase update ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json();
  return rows[0];
}

// Soft-delete: hides from the main list but can be restored.
export async function deleteLead(id) {
  const r = await fetch(
    `${URL}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({ is_deleted: true }),
    }
  );
  if (!r.ok) throw new Error(`supabase soft-delete ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
