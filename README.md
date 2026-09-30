# Lowcountry Leads (working name)

A texting and follow-up app for small home-service contractors: missed-call text-back, a lead inbox, estimate follow-ups, Google review requests, an owner dashboard and, for lawn care companies, recurring customers, one-tap rain-delay texts and seasonal campaigns.

- Product plan and milestones: [`docs/PLAN.md`](docs/PLAN.md)
- What still needs testing/connecting before launch: [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md)
- SMS compliance (what the app enforces, what you must do): [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md)
- Project conventions (read before changing code): [`CLAUDE.md`](CLAUDE.md)

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind v4) · Supabase (Postgres, auth, row-level security) · Twilio · Stripe · Vercel · Vitest

---

## 1. Prerequisites

- Node.js 22+
- A [Supabase](https://supabase.com) account with **two projects**: `yourapp-dev` and `yourapp-prod`
- Later: [Twilio](https://twilio.com), [Stripe](https://stripe.com), [Vercel](https://vercel.com) accounts

No Docker needed: development runs against the dev Supabase project.

## 2. Install

```bash
git clone <repo-url> && cd contractor-platform
npm install
cp .env.example .env.local
```

## 3. Supabase (dev project first)

1. **Keys** (*Project Settings → API Keys*): put the project URL, the **publishable** key and the **secret** key into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`). The secret key bypasses security rules: server-only, never `NEXT_PUBLIC_`.
2. **Tables:** apply all migrations in `supabase/migrations/`:
   ```bash
   npx supabase login
   npx supabase link --project-ref <dev-project-ref>
   npm run db:push
   ```
3. **Auth** (*Authentication → URL Configuration*): Site URL `http://localhost:3000`; Redirect URLs `http://localhost:3000/auth/confirm` (add your production and `https://*.vercel.app/auth/confirm` later).
4. **Email:** on dev you can turn off *Confirm email* so sign-ups log straight in. In production keep it on and add custom SMTP (e.g. Resend) under *Authentication → Emails*.
5. **Types (after future migrations):** `npx supabase gen types typescript --linked > lib/database.types.ts` and re-add the two helper types at the bottom (`Tables`, `TablesInsert`). Or use `DATABASE_URL=... npm run db:types`.

## 4. Run it (simulator mode, with no phone company needed)

```bash
npm run dev
```

Open http://localhost:3000, sign up, and set up a business. Then:

1. **Settings → Phone number → Get my business number.** In simulator mode (`SMS_PROVIDER=simulator`, the default) you get a pretend 555 number.
2. **Settings → Simulator:** fake a missed call or an incoming text and see exactly what the customer receives. "Skip ahead" sends scheduled follow-ups and review requests immediately so you don't wait days.
3. Add your email to `PLATFORM_ADMIN_EMAILS` to see **/admin** (all businesses, registrations, plans).

## 5. The every-minute scheduler

Follow-ups, review requests, rain delays and campaigns sit in an outbox until they're due. Something must call `/api/cron/dispatch` every minute with the header `Authorization: Bearer <CRON_SECRET>`.

**Option A: Supabase pg_cron (free; works with any Vercel plan).** In the prod project's SQL editor (enable the `pg_cron` and `pg_net` extensions under *Database → Extensions* first):

```sql
select cron.schedule('send-due-texts', '* * * * *', $$
  select net.http_get(
    url := 'https://YOUR-DOMAIN/api/cron/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
$$);
```

**Option B: Vercel Cron (needs Vercel Pro).** Add a `vercel.json` with `{"crons":[{"path":"/api/cron/dispatch","schedule":"* * * * *"}]}` and set `CRON_SECRET` in Vercel; Vercel sends the header automatically. Don't add this on the free Hobby plan: deploys with per-minute crons fail there.

Locally, the Simulator's buttons do the scheduler's job.

## 6. Twilio (real calls and texts)

1. Create a Twilio account and upgrade from trial. Copy the **Account SID** and **Auth Token** into `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`, and set `SMS_PROVIDER=twilio`.
2. `NEXT_PUBLIC_SITE_URL` **must be the public https address** of the deployed app before buying numbers. Numbers bought from **Settings → Phone number** get their webhooks set automatically to:
   - Voice: `POST {SITE}/api/twilio/voice`
   - Messaging: `POST {SITE}/api/twilio/sms`
   - (Delivery updates arrive at `/api/twilio/status`.)
   For a number bought in the Twilio console, set those two URLs yourself and assign it in **/admin → business → Phone number**.
3. **Carrier registration (A2P 10DLC):** each business fills in **Settings → Carrier registration**. You copy the details from **/admin** into Twilio (*Messaging → Regulatory compliance*), create a Messaging Service per business, add their number to it, set the service's incoming messages to **"Defer to sender's webhook"**, then paste the Brand, Campaign and Messaging Service IDs into /admin and mark it **approved**. Texting to customers turns on at that moment.
4. **Testing before approval:** with a Twilio *trial* account you can text your own verified phones. Set `ALLOW_UNREGISTERED_TEXTING=true` in dev only.
5. Webhooks verify Twilio's signature. If you see 403s, check that `NEXT_PUBLIC_SITE_URL` exactly matches the URL Twilio calls.

## 7. Stripe (when you stop invoicing by hand)

1. In Stripe, create a Product per plan with a **monthly Price** (Core, Pro, Executive), plus one Product per **add-on** (Agent Ready, and each industry module when it ships). Paste each `price_...` ID into **/admin → Plans & prices** (add-ons are at the bottom). Suggested prices: `docs/PRICING.md`.
2. Set `STRIPE_SECRET_KEY`. Add a webhook endpoint `{SITE}/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Turn on the **Customer portal** in Stripe settings (for card updates and cancellations).
4. Until `STRIPE_SECRET_KEY` is set, billing shows "billed by invoice" and pilots keep working.

## 7b. AI assistants (MCP)

Owners can let an AI assistant (Claude, ChatGPT, or any app that supports **MCP servers**) run their inbox, customers and texts. Team, billing and carrier registration always stay with the owner.

**Connect, the easy way (one-tap, OAuth):** in the AI app, add a custom connector / MCP server with the address `{SITE}/api/mcp`. The app discovers our sign-in automatically, sends the owner to log in, and the owner picks an access level and taps **Allow**. Connections refresh themselves and appear under **Settings → AI assistants**, where the owner can disconnect them.

**Connect with a key:** for apps that ask for a key, the owner creates one in **Settings → AI assistants** and the app sends `Authorization: Bearer <key>`. Claude Code example: `claude mcp add --transport http lowcountry-leads https://YOUR-DOMAIN/api/mcp --header "Authorization: Bearer llk_..."`.

**Access levels:**
- **Read only:** `get_business_overview`, `list_leads`, `get_conversation`, `find_contact`, `list_message_templates`, `get_automation_settings`; lawn care adds `get_schedule`, `list_customers`, `list_campaigns`.
- **Read and act** adds day-to-day work: `send_text`, `update_lead_stage`, `add_lead`, `mark_job_done`, `update_contact`, `cancel_follow_ups`; lawn care adds `add_customer`, `change_customer_status`, `send_rain_delay`, `text_scheduled_customers`, `mark_day_complete`.
- **Everything** adds `send_campaign`, `cancel_campaign`, `update_message_template`, `update_automation_settings`.

Anything that texts many people (rain delays, running-late texts, campaigns) returns a **preview first** and only sends with `confirm: true`.

**Safety:** keys and tokens are stored only as hashes; connected-app tokens last 1 hour and refresh for 60 days (each refresh replaces the old token); sign-in uses PKCE; each business's tools only see that business; every call is logged for the owner; 60 calls per minute per connection; texts go through the same send pipeline (opt-outs, consent, hours, plan limits) and are labeled "via AI assistant"; `add_customer` requires the owner to confirm service-text consent, and offers go only to customers with recorded written consent.

**Sign-in endpoints:** `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/api/oauth/register` (dynamic client registration), `/oauth/authorize` (owner's Allow screen), `/api/oauth/token`.

**Demo data:** `npm run demo:seed` loads two realistic demo businesses into a **dev** database (`dana@lawn.test` and `rick@roof.test`, password `password123`).

**Office managers** can connect their own AI tools on plans with team AI (Executive, Pilot), capped at "Read and act". A connection stops working the moment its person leaves the team.

## 7c. Industries, modules and Agent Ready (M14–M22)

- **Industries:** onboarding and Settings → Business have an industry picker (`lib/industries/`). The industry tailors templates, lead questions, service lists, stage words and AI instructions. "Other trade" / "Other lawn" keep the original generic behavior.
- **Modules:** feature packages live in `modules/` and are listed only in `modules/registry.ts`. The core (`lib/`) never imports them (lint rule). Businesses get a module when their `org_modules` row is on (billing add-on, or /admin).
- **Private files:** photos and vaccine records go to the private Supabase Storage bucket `private-files` (created by the M18 migration) through 5-minute signed links. `FILE_STORAGE=local` keeps them in `.data/uploads` for demos and tests. **Check in Supabase that the bucket is not public.**
- **Booking:** Settings → Online booking (Executive, Pilot, or the Agent Ready add-on). Rules for all modes are in `lib/booking/rules.ts`; `book_slot()` locks capacity in the database.
- **Agent Ready:** Settings → Public profile turns on:
  - `{SITE}/b/<slug>`: the profile, with schema.org JSON-LD;
  - `{SITE}/b/<slug>/book`: public booking with texting consent;
  - `{SITE}/b/<slug>/llms.txt`: an AI summary;
  - `{SITE}/api/agent/<slug>`: a public MCP for customers' AI agents (read the business, check times, request a booking).

  - `{SITE}/m/<token>`: a customer's private link to move or cancel one booking (sent in confirmation and reminder texts);
  - add `?lang=es` to any public page for Spanish.
  Reminders go out at 5pm the day before (reply C to confirm, R to reschedule). Requests from customers' AI agents need the customer to text YES first. Requests the owner doesn't answer within the hold time are released by `/api/cron/dispatch`.
  Outside bookings wait for the owner's OK by default (Settings → Approval rules). Public data comes only from the `public_business_profile()` database function (an allow-list).
- **Sales audit:** /admin → Sales audits (admin only).

## 8. Deploy (Vercel)

1. Import the repo in Vercel. Add every variable from `.env.example` (prod Supabase for Production, dev for Preview).
2. Apply migrations to prod: `npx supabase link --project-ref <prod-ref> && npm run db:push`.
3. Set up the scheduler (section 5), Twilio (section 6) and Stripe (section 7).
4. Vercel Hobby doesn't allow commercial use. Switch to Pro before charging customers.

## 9. Tests

```bash
npm run test       # business rules (+ database security tests if TEST_DATABASE_URL is set)
npm run check      # lint + typecheck + tests + production build: run before every commit
```

**Database security tests** (`tests/db/rls.test.ts`) prove one business can never see or change another's data. They run when `TEST_DATABASE_URL` is set: either your **dev** project's *Session pooler* connection string (tests roll back, leaving nothing behind; **never production**), or a plain local Postgres prepared with `npm run db:test:setup`.

## 10. Project layout

```
app/
  (auth)/          login, signup, forgot password
  (legal)/         privacy, terms, SMS terms (carriers check these)
  onboarding/      first-time business setup
  invite/[token]/  team invite links
  (app)/           logged-in app with bottom navigation:
                   inbox, today, customers, campaigns, dashboard, simulator, settings/*
  admin/           platform admin (PLATFORM_ADMIN_EMAILS only)
  api/twilio/*     call and text webhooks
  api/cron/        the every-minute scheduler
  api/stripe/      Stripe webhook
  api/mcp/         AI assistant access (MCP) for the business's own team
  api/agent/[slug] public MCP for customers' AI agents (Agent Ready)
  b/[slug]/        public business profile, booking page, llms.txt
  m/[token]/       customer's private manage-booking page
  api/oauth/, oauth/, .well-known/   one-tap connect for AI apps (OAuth sign-in)
lib/
  automation/      PURE business rules (tested): keywords, compliance, follow-ups,
                   outbox checks, reviews, schedules, recipients, metrics, campaigns
  messaging/       the single send pipeline + phone company adapters (Twilio, simulator)
  services/        database work: inbound calls/texts, outbox, jobs, broadcasts, customers
  templates/       default EN/ES templates + placeholder filling
  billing/         Stripe
  agent/           AI assistant (MCP) tools, keys and date parsing; public-server.ts for customers' agents
  industries/      industry configs (data): services, prices, templates, questions, voice, schema.org
  modules/         module contract (the registry itself is modules/registry.ts)
  booking/         PURE booking rules for every mode + settings
  approvals/       PURE approval rules
  audit/           sales audit: website reader, SSRF-safe fetch, scoring
  files/           upload rules + private storage
  public/          public profile allow-list, JSON-LD, consent wording, rate limits
modules/           industry modules (home-services today; more to come)
supabase/migrations/  tables, security rules and database functions, in order
supabase/rollbacks/   hand-run undo scripts for M14+ (never run by db:push)
tests/unit/        business-rule tests          tests/db/  data-isolation tests
```

## 11. Environment variables

See `.env.example` for the full, commented list. Secrets: `SUPABASE_SECRET_KEY`, `TWILIO_AUTH_TOKEN`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TEST_DATABASE_URL`. Never commit `.env.local`.
