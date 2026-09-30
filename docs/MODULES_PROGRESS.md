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
| M18 Customer records, private data, files, licenses | ✅ done |
| M19 Booking engine | ✅ done |
| M20 Approval rules + source reporting | ✅ done |
| M21 Editions, add-ons, Executive & Enterprise | ✅ done |
| M22 Agent Ready | ✅ done |

## Next up
M14–M22 (the shared foundations) are done. Next, per docs/MODULES_PLAN.md: **Module A, Recurring Home Services** (M23–M25):
- `modules/recurring-home/` manifest;
- switch cleaning/pest/pool to `available`;
- service agreements with renewal reminders, a visit log with notes and photos, a "service complete" text, and industry campaign presets in the Campaigns screen.

Before that: the founder's live tests in docs/LAUNCH_CHECKLIST.md Part 4 ("Agent Ready").

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

### M18: Customer records, private data, files, licenses
**What changed**
- Each lead now has a card for the customer's **property** (trades, lawn, cleaning…), **pets** (pet care) or **vehicles** (automotive), set by the industry. Property is the default for generic businesses; the card starts closed, so nothing else on the lead page moves.
- Private details are in a separate table (`subject_private`): gate/lockbox/alarm codes and access notes, VINs, and pet behavior and care notes. Only the business's own team sees them in the app. They're never in texts, AI assistant answers or public pages. A test plants a secret value in every private field and proves the shareable view drops it.
- Photos and documents go to **private storage** (Supabase bucket `private-files`, created by the migration). The file type is checked from the file's own bytes (JPG/PNG/WebP/HEIC/PDF only; SVG/HTML/programs refused). Max 4 MB, because Vercel caps uploads at 4.5 MB, and phones shrink photos before uploading. Links expire after 5 minutes. `FILE_STORAGE=local` keeps files in a local folder for demos and tests, like the texting simulator.
- Settings → **Licenses & insurance**: industry suggestions with one tap, number, issuer and expiry. Items expiring within 30 days are flagged. Checked items will show on the public profile (M22); expired ones won't.
- The inbox list shows pets and vehicles next to each lead. The AI assistant's conversation view includes records (shareable fields only).
- Migration `20260929180000_m18_subjects_files_credentials.sql` (additive); rollback script included.
- Click-through tested: a roofer added a property with a gate code and a photo. A fake "photo" (HTML) was refused. The signed link worked, and tampered or expired links got 403. The AI assistant saw "house, 2 stories" but not the gate code. A license was added from a suggestion and flagged as expiring soon.

**How to test**
1. Open a lead → "Add property details" → address, type, gate code → Save. The card shows the 🔒 note.
2. "Add photo or file" → pick a phone photo; it uploads and shows as a thumbnail. Tap it: it opens. Copy the link and try it again in 10 minutes: it no longer works.
3. Settings → Licenses & insurance → tap a suggestion → add number and expiry.
4. Log in as the office manager: you see and edit property notes, but can't change licenses.
5. **Before real customers:** in Supabase → Storage, confirm the `private-files` bucket exists and is **not public**.

### M19: Booking engine
**What changed**
- One engine, 7 modes, all pure rules in `lib/booking/rules.ts`:
  - **arrival windows** (8–10am…, N visits per window);
  - **set-time appointments** on a groomer, bay or technician (no overlaps);
  - **whole-day jobs** (N per day, e.g. moves);
  - **overnight stays** (every night checked against kennel capacity by size);
  - **repeat routes** (a daily cap);
  - **visits at the customer's place** (service ZIPs plus travel time between stops, before *and* after);
  - **package sessions** (count down, stop at zero, expiry).
- **Required records**: a service can require documents (e.g. `rabies`). They must be on file for the pet or vehicle and valid through the last day of the visit (the check-out day for stays).
- Database: `service_catalog`, `resources`, `packages`, `bookings` (+ `booking_enabled`, `booking_settings` on organizations). Only `book_slot()` can create bookings. It locks per business and re-checks capacity, and a database constraint makes overlapping visits on the same resource impossible. A test with two real connections racing for the last spot proves only one wins.
- Screens (only after the owner turns booking on; off for everyone by default):
  - **Settings → Online booking**: days, hours, arrival windows, ZIPs, services (one tap adds the industry's usual ones), and people/bays/kennels.
  - **Schedule** in the menu: the next 2 weeks, "Waiting for you", and Confirm/Done/No-show/Cancel. "Done" records the job and review request, like the lead page.
  - **Book a visit** on each lead.
- The business's AI assistant gets `list_bookings`, `find_open_times` and `book_visit` (only when booking is on), using the same rules.
- Migration `20260929190000_m19_booking.sql` (additive; enables `btree_gist`); rollback included. The type generator now skips extension functions.
- Click-through tested (roofer): turned booking on, added "Roof inspection", booked 8–10am Monday from a lead. The full window vanished for the next lead. The AI assistant booked 10–12 and was refused a full window. The schedule showed both, and "Done" recorded the job.

**How to test**
1. Settings → Online booking → check "Take bookings in the app", set hours → Save → "+ Add the usual … services".
2. The menu now shows **Schedule**. Open a lead → "Book a visit" → pick the service and day → See times → tap a time.
3. Set "Visits per window" to 1 and try the same window on another lead: it's gone.
4. Schedule → Done on a visit → the lead shows the job and a review request.
5. A business that never turns booking on sees no change anywhere.

### M20: Approval rules + source reporting
**What changed**
- Pure approval rules (`lib/approvals/rules.ts`):
  - core rules: outside channels, your own AI assistant, new customer, price over $X, short notice, outside service ZIPs;
  - module rules: pet behavior warning, vaccine problems, move over X miles, repair estimate over $X, quote over $X.
  - Defaults: anything booked online, by a customer's AI agent or by the phone assistant **waits for your OK**. Bookings by you or your team never do.
- Bookings that match a rule are saved as "Needs your OK" with the reasons (`approval_requests`). The slot is held while waiting, so nobody else can take it.
- Schedule → "Waiting for you" shows **why**. Confirm/Decline records who decided, and texts the customer when they booked from outside. The text goes through the normal pipeline (opt-outs, hours, STOP footer).
- A pet's behavior notes stay private: only a yes/no "warning" flag is used for the rule.
- Settings → **Approval rules** (owner). Each business sees only the rules for its modules.
- Dashboard → **Where your work came from** (last 90 days): leads, wins and bookings per source (missed calls, texts, campaigns, online page, customers' AI agents, phone assistant, your AI assistant). Lead sources now also allow `booking_page`, `outside_agent`, `voice`, `ai_assistant` (the list was only widened).
- AI assistant: `list_bookings` shows why a booking is waiting; new `decide_booking` tool. It says honestly whether the customer got a text.
- Migration `20260929200000_m20_approvals_sources.sql`; rollback included.
- Click-through tested: turned on "hold my AI assistant's bookings". The assistant's booking showed as waiting with its reason and was confirmed from the Schedule. A second one was declined by the assistant and couldn't be decided twice. The dashboard showed sources.

**How to test**
1. Settings → Approval rules → check "Bookings made by your own AI assistant" → Save.
2. Ask your AI assistant to book a visit. Schedule → "Waiting for you" shows it with "Why: Booked by your AI assistant". Tap Confirm.
3. Dashboard → "Where your work came from".
4. Customer texts on approve/decline are tested end-to-end with the public booking page in M22.

### M21: Editions, add-ons, Executive & Enterprise
**What changed**
- New plans **Executive** ($449, public) and **Enterprise** ($899, by quote, hidden), with every AI feature. New plan switches: `feature_agent_ready`, `feature_booking`, `feature_approvals`, `feature_ai_voice`, plus `included_addons`. Existing plans keep all their switches; Pilot gets everything.
- **Add-on catalog** (`addon_catalog`), each add-on its own Stripe product:
  - **Agent Ready** ($99; unlocks booking + approvals + profile for Pro/Core);
  - the four industry modules ($79 each, "coming soon" until built).
- `organizations.edition` (default Home Services). `org_modules` records where each module came from (edition / add-on / included / pilot / admin) and its Stripe item.
- All checks go through `lib/entitlements.ts` (`canUse`, `bookingOn`). Booking, approval rules and the Schedule now need Executive, Pilot or Agent Ready, and show a friendly "see plans" note otherwise.
- Stripe:
  - checkout can include add-ons;
  - subscribers can add or remove add-ons on the Billing page (prorated);
  - the webhook reads every subscription item and switches paid add-ons on or off. It never touches edition, pilot or admin-granted modules. Add-ons stay on while a card is retried (past due) and turn off when canceled or unpaid.
- /admin:
  - each business: industry (including coming-soon ones for pilots), edition, and module on/off switches;
  - Plans: all switches shown, plus add-on prices and Stripe price IDs.
- Migration `20260929210000_m21_editions_addons.sql`; rollback included.
- Click-through tested with signed test webhooks:
  - Core couldn't book;
  - Pro + Agent Ready unlocked Schedule, and removing the add-on locked it again;
  - Executive unlocked it;
  - canceling kept paid add-ons off;
  - admin switched Pet Care on for a pilot.

**Before you charge anyone**
1. In Stripe, create products and monthly prices for Core, Pro, Executive and Agent Ready (and later each module).
2. /admin → Plans & prices: enter the prices (suggested: Core $149, Pro $249, Executive $449; Core and Pro still show $0) and paste each Stripe price ID, including the add-ons.
3. Test mode: buy Pro with "Add Agent Ready" ticked → Settings shows Online booking unlocked.

### M22: Agent Ready
**What changed**
- Settings → **Public profile** (Executive, Pilot, or the Agent Ready add-on): on/off, web address, "about", area served, show prices.
- **`/b/<slug>`**: a mobile profile page with call/text/book buttons, services and typical prices, hours, licenses (unexpired, marked public) and the review link. It includes **schema.org JSON-LD** (the industry's verified type, offers with price ranges, hours, area and ZIPs, credentials, and a ReserveAction to book).
- **`/b/<slug>/llms.txt`**: a plain summary for AI crawlers, including the agent connection address.
- **`/b/<slug>/book`**: the public booking page. It works without JavaScript and has a bot trap. The customer ticks an exact consent statement, which is saved in the consent log. It uses the same booking rules, and online bookings **wait for the owner's OK** by default. The customer gets "We got your request", then "You're booked" or "Sorry…", through the normal send pipeline (STOP footer on the first text).
- **`/api/agent/<slug>`**: a public MCP for **customers' AI agents**, no key needed. Tools: `get_business_info`, `list_services`, `find_open_times` (times only, never who else is booked), `request_booking` (requires `customer_agreed_to_texts: true`; logged as `ai_agent_request`). The industry's voice "never" rules are in its instructions. Modules can add public tools through the `publicAgentTools` hook.
- **Safety:**
  - All public data comes from `public_business_profile()`, a database allow-list, parsed with strict schemas. Anything unexpected is refused.
  - The business is found only from the slug. Every service id is re-checked against that business.
  - Rate limits: 120 lookups per 10 minutes and 5 bookings per hour per visitor, plus 60 bookings a day per business. IPs are stored only as salted hashes.
  - Tests plant secret values in every private field and prove they never appear.
- Public pages were added to the login guard's allow-list (`/b`).
- Migration `20260929220000_m22_agent_ready.sql`; rollback included.
- Click-through tested end-to-end (see LAUNCH_CHECKLIST Part 3).

**How to test**
1. As the owner (Pilot or Executive): Settings → Online booking → on, add services. Settings → Licenses → add one. Settings → Public profile → on → Save → open the profile link.
2. Log out (or use a private window) → open the profile → Book online → pick a time, fill in details, tick the consent box → "Request sent".
3. Simulator: the customer got "We got your request…" with "Reply STOP to opt out." Schedule → Waiting for you → Confirm. The customer got "You're booked…".
4. Dashboard → "Where your work came from" shows "Online booking page".
