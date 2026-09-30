# Industry modules: progress log (resume here)

The plan is `docs/MODULES_PLAN.md` and pricing is `docs/PRICING.md`. Update this file at the end of every milestone, and whenever work pauses mid-milestone.

## How to resume in a new session
1. Read `CLAUDE.md`, then this file.
2. `git log --oneline | head` shows the last finished milestone.
3. Database tests: `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/cp_test npm run db:test:setup && TEST_DATABASE_URL=... npm run test`.
4. Continue from "Next up" below.

## Status

| Milestone | Status |
|---|---|
| M14 Safety net + team AI access | ✅ done |
| M15 Module framework + industry picker | ✅ done |
| M16 Industry configs for every industry | ✅ done |
| M17 Sales audit tool (admin only) | ✅ done |
| M18 Customer records, private data, files, licenses | not started |
| M19 Booking engine | not started |
| M20 Approval rules + source reporting | not started |
| M21 Editions, add-ons, Executive & Enterprise | not started |
| M22 Agent Ready | not started |

## Next up
M18: `subjects` + `subject_private` + `files` (private bucket, signed links, limits in `lib/files/validate.ts`) + `business_credentials`; property card on leads; Settings → Licenses & insurance.

## Milestone notes and "how to test"
(Added as each milestone finishes.)

### M14: Safety net + office managers' AI tools
**What changed**
- `tests/unit/golden.test.ts` snapshots today's menus, stage words, starting templates, plan switches, automation defaults, texting rules and the AI tool lists for every business type, plan and access level. If a later change alters any of it, the test fails.
- Office managers can connect their own AI tools (Settings → AI assistants, or one-tap connect from Claude/ChatGPT) on plans with `feature_team_ai` (Pilot now; Executive in M21). Their connections are capped at "Read and act"; campaigns, wording and settings stay with the owner.
- A connection only works while its person is on the team (checked on every use and every token refresh). Removing a manager also revokes their connections.
- Owners see every connection with "Connected by …"; managers see only their own.
- Migration `20260929140000_m14_team_ai.sql` (additive), rollback in `supabase/rollbacks/`.

**How to test**
1. Log in as the owner → Settings → Team → invite an office manager and accept in another browser.
2. As the manager: Settings → AI assistants → create a key. Only "Read only" and "Read and act" are offered.
3. As the owner: the key shows "Connected by <manager>". Revoke works.
4. Owner removes the manager → the manager's key gets "401 no longer on the team".
5. Switch the business to the Core plan in /admin → the manager sees "part of the Executive plan"; the owner's keys still work.

### M15: Module framework + industry picker
**What changed**
- `organizations.industry` (optional) + `org_modules` (every business has `home_services`). Migration `20260929150000_m15_industries_modules.sql` (additive; `create_organization` gained an optional `p_industry`, so old calls still work). Rollback script included.
- `lib/industries/`: industry configs as data. 12 home-services industries so far (roofing, HVAC, plumbing, electrical, remodeling, painting, gutters, fencing, tree service, handyman, lawn care, landscaping), each with services and price ranges, industry wording for the missed-call text, questions to ask, a voice script, licenses/insurance, audit checks, and a verified schema.org type (`lib/industries/schema-org.ts`).
- Onboarding and Settings → Business use an industry picker instead of the two business-type buttons. "Other trade" / "Other lawn or yard service" keep the old generic behavior.
- Tailoring: industry wording for new businesses' templates, a "Questions to ask" card on each lead, service suggestions on the customer form, and industry-aware AI assistant instructions.
- Module framework: `lib/modules/types.ts` (contract + helpers), `modules/registry.ts` (the only file that lists modules), `modules/home-services`. A lint rule and a test stop `lib/` from importing `modules/`. `requireModule()` guards module pages.
- Click-through tested (local stack, production build): HVAC sign-up with the picker, HVAC missed-call wording, questions on the lead page, roofer questions, and a manager's AI key (20 tools, no campaigns, stops working after removal).

**How to test**
1. Sign up a new account → onboarding → "What's your industry?" → pick Heating & air → Finish.
2. Settings shows "Heating & air (HVAC)". Settings → Message templates → Missed-call text-back mentions AC or heat.
3. Inbox → + → add a lead → the lead page shows "Questions to ask".
4. An existing business that never picked an industry looks exactly like before (Settings → Business shows "Other trade" / "Other lawn or yard service").

### M16: Industry configs for every industry
**What changed**
- 14 more industries as data, all `coming_soon` (can't be picked at sign-up yet; the admin can set one for a pilot):
  - Module A: house cleaning, pest control, pool service.
  - Module B: moving, pressure washing, junk removal.
  - Module C: pet grooming, pet boarding & daycare, mobile vet, dog training.
  - Module D: auto detailing, auto repair, mobile mechanic, window tinting.
- Each has services with price ranges and booking modes, stage words (e.g. "Booked", "Reserved", "Enrolled"), EN/ES wording for the missed-call text (plus review and weather-delay texts where the lawn wording didn't fit), seasonal campaign ideas by month, questions to ask, a voice script with hard limits, suggested licenses/insurance (marked "verify with the regulator"), audit checks, and a verified schema.org type.
- Pet care voice scripts never give medical advice and hand emergencies to the owner and the business's emergency vet. The mobile vet script also refuses medical records.
- Tests check every industry: real schema.org types, template rules (placeholders, business name, no STOP line), campaign rules, medical limits for pet care, and the right record type (vehicle/pet/property).

**How to check**
Nothing new to click yet. The configs show up in the sales audit (M17) and on hosted profiles (M22). To review the wording, open the files in `lib/industries/`. Have a native speaker review the Spanish.

### M17: Sales audit tool (admin only)
**What changed**
- /admin → **Sales audits**: pick any of the 26 industries (including coming-soon ones), enter the prospect's website, and tap Yes / No / Not sure for 6 call questions.
- The app visits the home page, robots.txt and llms.txt. It checks https, phone-friendliness, schema.org business details (and whether the type fits the industry), tap-to-call, hours, whether AI crawlers (ChatGPT, Claude, Perplexity, Google) are blocked, reviews, and each industry's own checks (license shown, prices, service area, online booking, photos…).
- Score 0–100 ("Ready" / "Getting there" / "Invisible to AI"). Questions you haven't answered don't count against them. "What we'd fix first" maps each gap to the product feature that fixes it. "Print / save as PDF" gives a clean report to send after the call.
- Safety: it only visits public web addresses on normal ports, re-checks every redirect, and never reads private networks or cloud metadata. Pages are limited to 1.5 MB and 8 seconds. Audits live in a server-only table (`audit_reports`) that no business or visitor can read; non-admins get "not found".
- Click-through tested with a sample pest control site: score 51, flagged GPTBot blocked, generic business type, no online booking, no https.

**How to test**
1. Log in with your admin email → Settings → Platform admin → Sales audits → New audit.
2. Enter a real local business (e.g. a roofer's website), pick the industry, answer what you know → Run audit.
3. Read the report, then "Print / save as PDF". Change an answer at the bottom and save to see the score update.
4. Log in as a non-admin: /admin/audit shows "not found".
