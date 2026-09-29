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
| M16 Industry configs for every industry | not started |
| M17 Sales audit tool (admin only) | not started |
| M18 Customer records, private data, files, licenses | not started |
| M19 Booking engine | not started |
| M20 Approval rules + source reporting | not started |
| M21 Editions, add-ons, Executive & Enterprise | not started |
| M22 Agent Ready | not started |

## Next up
M16: add the configs for every module industry (cleaning, pest, pool, moving, pressure washing, junk removal, grooming, boarding, mobile vet, training, detailing, repair, mobile mechanic, tinting) as `coming_soon` in `lib/industries/`.

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
