# Lowcountry Leads (working name)

A texting and follow-up app for small home-service contractors: missed-call text-back, a lead inbox, estimate follow-ups, Google review requests, and, for lawn care companies, recurring customers, rain-delay bulk texts and seasonal campaigns.

- Product plan and milestones: [`docs/PLAN.md`](docs/PLAN.md)
- Project conventions (read before changing code): [`CLAUDE.md`](CLAUDE.md)

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind v4) · Supabase (Postgres, auth, row-level security) · Twilio · Stripe (later) · Vercel · Vitest

---

## 1. Prerequisites

- Node.js 22 or newer (`node -v`)
- A free [Supabase](https://supabase.com) account. Create **two projects**: `yourapp-dev` and `yourapp-prod`. Use dev for everything below.
- Git and a GitHub account with access to this repo

You do **not** need Docker. Development runs against the dev Supabase project in the cloud.

## 2. Install

```bash
git clone <repo-url>
cd contractor-platform
npm install
cp .env.example .env.local
```

## 3. Set up the Supabase dev project

1. **Keys:** in the Supabase dashboard, go to *Project Settings → API Keys* and copy the project URL and the **publishable** key into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
2. **Database tables:** apply the migrations in `supabase/migrations/`:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-dev-project-ref>
   npm run db:push
   ```
   (Alternative: paste each migration file, in order, into the dashboard's *SQL Editor* and run it.)
3. **Auth settings** (*Authentication → URL Configuration*):
   - Site URL: `http://localhost:3000` (production: your real domain)
   - Redirect URLs: add `http://localhost:3000/auth/confirm` (and `https://<your-domain>/auth/confirm` for production, plus `https://*.vercel.app/auth/confirm` if you use Vercel preview links)
4. **Email confirmation:** on the dev project, you can turn off *Authentication → Sign In / Providers → Email → Confirm email* so test sign-ups log in right away. Keep it **on** in production, and set up custom SMTP (e.g. Resend) before real customers sign up; Supabase's built-in email is heavily rate-limited.

## 4. Run it

```bash
npm run dev
```

Open http://localhost:3000. To try it on your phone, deploy a Vercel preview (step 6) or open `http://<your-computer's-LAN-IP>:3000` while on the same Wi-Fi.

## 5. Tests and checks

```bash
npm run test       # unit tests
npm run check      # lint + typecheck + tests + production build (run before every commit)
```

**Database security tests** (`tests/db/rls.test.ts`) prove that one business can never see or change another business's data. They run only when `TEST_DATABASE_URL` is set:

- **Against your dev Supabase project** (easiest): set `TEST_DATABASE_URL` in `.env.local` to the dev project's *Session pooler* connection string (dashboard → *Connect*), then run `TEST_DATABASE_URL=... npm run test`. Every test runs inside a transaction that is rolled back, so no data is left behind. **Never point this at production.**
- **Against a plain local Postgres 15+** (e.g. in CI):
  ```bash
  export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/cp_test
  npm run db:test:setup   # creates the DB, adds a small Supabase stand-in, applies migrations
  npm run test
  ```

## 6. Deploy (Vercel)

1. Import the GitHub repo in Vercel.
2. Add the environment variables from `.env.example` (use the **prod** Supabase project for Production and the **dev** project for Preview).
3. Set `NEXT_PUBLIC_SITE_URL` to the deployed address.
4. Apply migrations to prod: `npx supabase link --project-ref <prod-ref> && npm run db:push`.

Vercel's free Hobby plan doesn't allow commercial use. Switch to Pro before charging customers (it's also needed for the once-a-minute scheduler in Milestone 3).

## 7. Project layout

```
app/                    Pages (Next.js App Router)
  (auth)/               Login and signup
  onboarding/           First-time business setup
  invite/[token]/       Team invite links
  (app)/                Logged-in app (bottom navigation)
  auth/                 Email confirmation + logout endpoints
components/             Shared UI pieces
lib/                    Business rules and helpers (plain TypeScript)
  templates/            Default EN/ES message templates + placeholder filling
  supabase/             Database clients (server + session refresh)
  auth/context.ts       "Who is logged in and which business" for every page
  navigation.ts         Which screens each business type sees
  entitlements.ts       Plan limits and feature switches
supabase/migrations/    Database tables, security rules, functions (in order)
tests/unit/             Tests for business rules
tests/db/               Data-isolation (row-level security) tests
proxy.ts                Runs before each page: refreshes login, redirects logged-out users
```

## 8. Environment variables

| Name | Where to find it | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys (publishable) | No (protected by row-level security) |
| `NEXT_PUBLIC_SITE_URL` | Your app's address | No |
| `TEST_DATABASE_URL` | Dev project → Connect → Session pooler | **Yes**, tests only |

Later milestones add Twilio, cron and Stripe secrets (listed in `.env.example`). Never commit `.env.local`, and never give a secret a `NEXT_PUBLIC_` prefix.
