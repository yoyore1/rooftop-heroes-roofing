-- Rooftop Heroes — database schema (already applied to the Supabase project).
-- Kept here for reference / re-creation. Run in Supabase → SQL Editor if needed.

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  phone       text not null,
  address     text,
  service     text,
  message     text,
  status      text not null default 'new'
              check (status in ('new','called','quoted','won','lost')),
  notes       text,
  source      text not null default 'website'
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx on public.leads (status);

-- All access is server-side via the service_role key (which bypasses RLS).
-- With RLS enabled and no policies, the public anon/publishable key can
-- neither read nor write this table.
alter table public.leads enable row level security;
