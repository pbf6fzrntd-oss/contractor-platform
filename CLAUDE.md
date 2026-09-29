@AGENTS.md

# Project: texting & follow-up platform for home-service contractors

Read this before every session. The full plan (data model, milestones, compliance) is in `docs/PLAN.md`.

## Who this is for
- **Founder:** solo, non-technical, sales background. Explain decisions in plain language, avoid jargon, keep the architecture simple enough to maintain with AI help. After each milestone, give: how to test it locally and what to check before moving on.
- **Market:** small home-service contractors in Charleston / Summerville, SC.
- **Two segments, one app** (`organizations.business_type`):
  - `project`: roofers, HVAC, electricians, remodelers. One-off, high-ticket, quote-driven jobs.
  - `recurring`: lawn care and landscapers. Weekly/biweekly service, seasonal upsells, weather-dependent schedules.
- **Core features (both segments):** missed-call text-back, lead inbox, estimate follow-ups, review requests, owner dashboard.
- **Lawn layer (`recurring` only):** recurring customers, bulk "rain delay" texts (the most-used feature: must be fast on a phone), seasonal campaigns.

## Stack
Next.js 16 (App Router, TypeScript, Tailwind v4) · Supabase (Postgres, auth, row-level security) · Twilio (numbers, calls, SMS) · Stripe (Milestone 10) · Vercel · Vitest.

**Next.js 16 differs from older versions:** `middleware.ts` is now `proxy.ts`; `params`, `searchParams`, `cookies()` and `headers()` are async; use the global `PageProps<"/route">` / `LayoutProps<"/route">` types. Check `node_modules/next/dist/docs/` before using an API you're unsure about.

## Milestone status
- [x] M0 Foundation: auth, businesses, team invites, onboarding, RLS, mobile shell, default templates
- [x] M1 Twilio number + missed-call text-back + STOP/HELP (+ texting simulator, since carrier registration waits on the founder's LLC/EIN)
- [x] M2 Lead inbox + two-way texting
- [ ] M3 Outbox/scheduler + estimate follow-ups + template editor
- [ ] M4 Jobs + review requests
- [ ] M5 Dashboard + hardening → pilots
- [ ] M6 Recurring customers + CSV import · M7 Today/rain delay · M8 Campaigns · M9 Recurring metrics
- [ ] M10 Stripe · M11 Self-serve A2P registration

Founder decisions (2026-09-29): default phone setup is "keep your number" (conditional forwarding); pilots are billed by hand until M10; LLC/EIN/domain come later, so build and demo without real carrier registration; team roles are owner + office manager only.

## Conventions

### One codebase, no forks
- Business type only changes **what's shown** and **which words are used**: `lib/navigation.ts` (menus), `lib/leads/stages.ts` (labels), `lib/templates/defaults.ts` (templates). Never duplicate a feature per type.
- Plan limits and feature switches are only checked through `lib/entitlements.ts`.

### Data & security (multi-tenant)
- Every business-owned table has `org_id`, has row-level security enabled, and its policies use `public.is_org_member(org_id)` / `public.has_org_role(org_id, 'owner')`.
- Roles: `owner` (everything) and `manager` (office manager: daily work, no business settings/team/billing).
- Multi-step writes that must succeed or fail together go in a Postgres function (see `create_organization`, `accept_invitation`).
- Webhooks (Twilio/Stripe/cron) use the server-only admin client and must find the business from trusted data (e.g. the Twilio number that was called), never from user input.
- **Migrations:** add a new file in `supabase/migrations/` (timestamp prefix). Never edit a migration that has been applied. Update `lib/database.types.ts` to match.
- Every new table gets tests in `tests/db/rls.test.ts` showing another business can't read or change it.
- Store times as `timestamptz` (UTC); use `organizations.timezone` (default America/New_York) for display and scheduling. Store phones as E.164 (`+18435551234`) via `lib/phone.ts`.

### Messaging & compliance
- **Every outbound text goes through one send function** (`lib/messaging/`, built in M1). It enforces opt-outs, consent category, sending hours and plan limits, and adds "Reply STOP to opt out" to a contact's first text and to every marketing text. Templates must not include that line.
- Three categories on every template and message:
  - `conversational`: replies to someone who contacted the business. Any time.
  - `informational`: about their estimate, job or service. Contacts who haven't opted out; business hours.
  - `marketing`: promotions/campaigns. Only contacts with recorded marketing consent; 8am–8pm.
- Opt-outs are per business. STOP-type keywords in English and Spanish; "CANCEL" is honored as an opt-out but flagged for the owner (lawn customers may mean "cancel this week").
- Consent changes are appended to a log and never edited or deleted.
- Templates: every default needs `en` and `es`, must name `{business_name}`, and may only use the placeholders listed in `TEMPLATE_VARIABLES`. Spanish text should be reviewed by a native speaker before launch.

### Automation logic
- Put rules (timing, who receives what, stop conditions, keyword parsing) in **pure functions** under `lib/automation/`: data in, decision out, no database or Twilio calls. Test them in `tests/unit/`.
- Scheduled texts use the outbox pattern: queue with a send time, and **re-check every condition right before sending**.

### UI
- Mobile-first: design for a phone held in one hand. Tap targets ≥ 48px (`btn-*`, `input` utilities in `app/globals.css`), bottom navigation, max width `max-w-lg`.
- Server Components by default; small Client Components only for interactivity. Forms use Server Actions + `useActionState`, validated with Zod, returning friendly error messages.
- Plain, friendly wording aimed at contractors. No technical terms in the UI.
- Product name is a placeholder in `lib/brand.ts`.

### Secrets
- Never hardcode keys. All settings come from environment variables; document every new one in `.env.example` and the README. Anything secret must not start with `NEXT_PUBLIC_`.

## Commands
```
npm run dev            # start locally at http://localhost:3000
npm run test           # unit tests (+ database tests if TEST_DATABASE_URL is set)
npm run check          # lint + typecheck + tests + build: run before every commit
npm run db:push        # apply new migrations to the linked Supabase project
```
Definition of done for a milestone: `npm run check` passes, database tests pass against a real database, and the founder has a "how to test" checklist.
