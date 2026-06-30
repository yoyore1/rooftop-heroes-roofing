# Rooftop Heroes — Backend Setup

When someone submits the inspection form, the backend now:

1. **Saves the lead** to a Supabase database (never lost),
2. **Emails** the owner a nicely formatted alert (Resend),
3. **Texts** the owner a short alert (Twilio),
4. and the owner can log into a private **dashboard at `/admin`** to view every
   lead live and mark each one `New → Called → Quoted → Won / Lost`.

Each notification channel is independent — if email or SMS isn't configured (or
fails), the lead is still saved and the others still fire.

```
Form → /api/estimate → save to Supabase ─┬─ 📧 email (Resend)
                                         └─ 📱 SMS (Twilio)
                         /admin dashboard ── reads /api/leads (password-gated)
```

---

## What's already done

- ✅ Supabase project **`rooftop-heroes`** created, `leads` table live (RLS on).
- ✅ All backend code: `api/estimate.js`, `api/leads.js`, `api/login.js`, `lib/*`.
- ✅ Dashboard: `admin.html` + `assets/js/admin.js` (served at `/admin`).

## What you need to do (≈15 min)

Set environment variables in **Vercel → Project → Settings → Environment
Variables** (see `.env.example` for the full list), then redeploy.

### 1. Database (required) — Supabase
- `SUPABASE_URL` = `https://mvocjfefkradjpbijbnr.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase → **Project Settings → API → `service_role`** (the secret one, *not* anon). Server-side only — never put it in front-end code.

### 2. Dashboard login (required)
- `ADMIN_PASSWORD` = whatever the owner will type to sign in.
- `SESSION_SECRET` = a long random string. Generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `SITE_URL` = your live URL, no trailing slash (e.g. `https://rooftopheroes.com`). Adds a "View dashboard" link to alerts.

### 3. Email alerts — Resend
- Sign up at <https://resend.com> (free tier: 100/day) → create an API key.
- `RESEND_API_KEY` = that key.
- `LEAD_EMAIL` = the owner's inbox.
- `LEAD_FROM` = leave as `onboarding@resend.dev` to start. **To email any
  address reliably, verify your domain in Resend** and set this to something
  like `Rooftop Heroes <leads@rooftopheroes.com>`. (Until a domain is verified,
  Resend only delivers to your own account email.)

### 4. SMS alerts — Twilio
- Sign up at <https://twilio.com>, buy a number, and (US) complete **A2P 10DLC**
  registration for business texting.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` = from the Twilio console.
- `TWILIO_FROM` = your Twilio number, E.164 (e.g. `+15015550100`).
- `LEAD_SMS_TO` = the owner's mobile, E.164 (e.g. `+15017728243`).
- Want SMS later? Just leave these blank for now — email + dashboard work without it.

### 5. Redeploy
Push to your connected branch (or hit **Redeploy** in Vercel) so the new env
vars take effect.

---

## Test locally first

```bash
npm run preview      # http://localhost:3200
```

The preview server stubs the API with **sample data**, so:
- the homepage form submits and a fake lead appears,
- `/admin` opens straight into the dashboard (no password locally) with 3 sample
  leads — try the status dropdowns, notes, search, and filters.

> Local preview uses fake data only. Real email/SMS/database happen on Vercel
> once the env vars above are set.

## Verify in production
1. Open your live site, submit the form with your own phone/email.
2. You should get the email + text within a few seconds.
3. Open `/admin`, sign in with `ADMIN_PASSWORD`, confirm the lead is there.
4. Check the lead row in Supabase → Table Editor → `leads` too.

If something doesn't arrive, check **Vercel → Deployment → Functions logs** —
every lead is logged as `[lead] {...}` and channel errors are logged with the
reason, so you can see exactly what happened.

## Notes
- No new dependencies — everything uses built-in `fetch`. No build step.
- Security headers / CSP already allow the dashboard (same-origin only).
- The `service_role` key bypasses RLS and lives only in serverless env vars; the
  browser never sees it. Leads can't be read or written by the public.
