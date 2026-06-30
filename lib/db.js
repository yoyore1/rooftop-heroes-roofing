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

// Most recent leads first.
export async function listLeads({ limit = 300 } = {}) {
  const r = await fetch(
    `${URL}/rest/v1/leads?select=*&order=created_at.desc&limit=${limit}`,
    { headers: headers() }
  );
  if (!r.ok) throw new Error(`supabase list ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Patch a single lead (status / notes / followup_date) and return the updated row.
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

export async function deleteLead(id) {
  const r = await fetch(
    `${URL}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: headers() }
  );
  if (!r.ok) throw new Error(`supabase delete ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
