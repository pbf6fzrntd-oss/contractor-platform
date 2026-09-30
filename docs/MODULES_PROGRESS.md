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
| M23 Booking hardening: approval expiry, reminders, reschedule/cancel link, closed dates, YES check for agent bookings, Spanish booking page | ✅ done |
| M24 Expiry reminders (licenses, vaccines) + photos texted in | ✅ done |
| Demo-ready UI (founder request) | ✅ done |
| M27 Module A foundation: industries, agreements + renewals, access notes | ✅ done |
| M28 Module A visit reports, service-complete text, AI tools, demo trades | not started |
| M25 Quality: click-through suite in the repo, automatic checks on GitHub, daily cleanup, error alerts | ✅ done |
| M26 Selling: demo business per industry, setup checklist, audit→customer link, calendar feed | ✅ done |

## Next up
Founder approved items 1–16 of the post-M22 recommendations (2026-09-30), as M23–M26 above. Module A (Recurring Home Services) moves to M27+.
Module A (Recurring Home Services) is in progress: M27 done, next M28 (visit reports with checklists/readings and photos, optional "service complete" text, more AI tools, the three trades in the live demo).

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

### M23: Booking hardening
**What changed**
- **Days off:** Settings → Online booking → "Days off". Pick a date and save; untick to remove. No bookings (page, AI agents, team) on those days; stays can't drop off or pick up on them. Past dates drop off automatically.
- **Reminder texts:** 5pm (business time) the day before, for confirmed bookings, with the customer's private link. It goes through the outbox and is re-checked right before sending (skipped if the booking was canceled or moved, the customer opted out, or it's "do not auto-text"). The customer can reply **C** (confirm → "✓ Customer confirmed" on the Schedule) or **R** (they get their link; the owner gets a note). C/R only count after a reminder went out and the visit is within 3 days; otherwise they're ordinary messages. On/off switch in settings (default on).
- **Private reschedule/cancel link** `/m/<token>`: shows only the service, time and status (never notes, address, pets, vehicles). The customer can pick a new day and time (same rules and approvals as online booking) or cancel. The token is the booking id plus a signature (no database storage); a changed link returns "not found". Rate limited like online booking. It's in the confirmation and reminder texts.
- **Owner approval expiry:** requests waiting for the owner's OK longer than the hold time (default 24 hours, 2 hours–7 days) are released by the every-minute scheduler. The customer is told ("Sorry, we couldn't confirm…"), the owner gets a note, and the approval shows as expired.
- **"Reply YES" for AI-agent bookings:** a request from a customer's AI agent now holds the time and texts the customer "Reply YES within 2 hours to confirm it was you". YES (or SÍ) sends it on to the owner's approval queue (or confirms it if no rule applies). No YES in time → released quietly (no more texts to a number that may not be theirs). Wait time is set in settings (15 minutes–1 day). The Schedule shows "Waiting for customer's YES" with only a Decline button.
- **Spanish public pages:** profile, booking, "done" and manage pages have an "Español" switch (`?lang=es`). Spanish service names are used, and Spanish bookings save the customer's language so every later text is in Spanish. The manage page opens in the customer's language.
- Schedule also shows "Canceled by customer" and "Moved by customer".
- Migration `20260930010000_m23_booking_hardening.sql` (additive: new nullable columns, widened status lists, `book_slot()` saves the new fields and stays server-only). Rollback in `supabase/rollbacks/`.
- Tests: `tests/unit/booking-hardening.test.ts` (days off, reminder timing incl. clock change, C/R/YES parsing, expiry, link tampering, outbox re-checks, texts have no STOP line, Spanish word lists complete); DB tests for the new columns and that visitors can't call `book_slot()`.

**How to test**
1. Settings → Online booking: add a day off (e.g. next Wednesday), set "Hold requests for my OK" to 2 days → Save. Open your booking page for that Wednesday: "Nothing open that day".
2. Open your profile, tap **Español**, book a time in Spanish. The "done" page and the texts are in Spanish.
3. Schedule → Confirm it. The "You're booked" text has a link. Open it: you can move or cancel. Move it → the Schedule shows the new time ("Moved by customer") and you get a note. Cancel it → "Canceled by customer".
4. Reminders: the next day at 5pm the customer gets a reminder. Reply **C** in the Simulator → "✓ Customer confirmed". Reply **R** → the customer gets their link.
5. AI agents: book through `/api/agent/<slug>` → the customer gets "Reply YES…". The Schedule shows "Waiting for customer's YES". Reply YES in the Simulator → it moves to "Waiting for you".
6. **Before launch:** in Twilio's Advanced Opt-Out settings, remove **YES** from the opt-in keywords (keep START/UNSTOP). Otherwise Twilio also answers a customer's "YES" with its own re-subscribe message.

### M24: Expiry alerts + photos texted in
**What changed**
- **Once-a-day jobs** run from the existing every-minute scheduler (first call after 12:00 UTC, about 7–8am in Charleston), so nothing new needs setting up. The `job_runs` table makes each job run once per day. Later milestones add jobs with `addDailyJob` (`lib/services/daily.ts`).
- **License & insurance alerts to the owner:** 30 days before, 7 days before, and when expired (in-app notice plus the owner's alert text if set). Each is sent once per expiry date; entering a renewed date starts over. Expired items already drop off the public profile.
- **Vaccine records:** a pet's card on the lead page now has "💉 Add vaccine record" (vaccine type and expiry date). Two weeks before a record expires, the customer gets a text asking for a photo of the new one. It goes through the outbox, in business hours, and is skipped if a newer record was added, the record was deleted, or the customer opted out. There's an on/off switch in Settings → Online booking (pet businesses only; default on).
- **Photos texted in (MMS):** saved to private storage and shown in the conversation. Downloads come only from Twilio's own media address, with the Twilio login, a 10-second timeout and the 4 MB cap. The real file type is checked from its first bytes (photos and PDFs only). A photo-only text shows as "📷 Photo". On the lead page, "Texted in, not filed yet" lets the team file a photo under a pet/property/vehicle, optionally as a vaccine record with its expiry date. AI assistants never see photos or file links (a test checks this).
- The Simulator can attach a photo to a pretend text.
- Migration `20260930020000_m24_expiry_and_photos.sql` (additive); rollback included.

**How to test**
1. Simulator → type a message, attach a photo → Send. Open the lead: the photo shows in the conversation. Try attaching a non-photo file: "The photo wasn't saved".
2. Pet business (industry "Pet care"): open a customer → add a pet → "💉 Add vaccine record" → rabies, expiring in 10 days. The next morning (or after 12:00 UTC with the scheduler running) the customer gets the reminder in the Simulator. Reply with a photo → file it under the pet as a new rabies record.
3. Settings → Licenses: add one expiring in 20 days. The next morning there's a notice: "Your … expires in 20 days".

### Demo-ready UI (founder request after M24: "an actual usable front end I can demo to prospects")
**What changed**
- **Laptop/tablet layout:** a side menu replaces the bottom bar at laptop width. The inbox shows the list next to the open conversation; on wide screens the lead page puts the conversation beside the customer details. The dashboard, Today and the recurring metrics use the width. Phone layout is unchanged.
- **Dashboard:** new top row: "Won, last 30 days" ($), "Saved from missed calls" (and what they became), plus a "New leads per week" chart for 12 weeks (`lib/automation/trend.ts`, pure). The existing numbers are unchanged (golden tests).
- **"Try it live" demo at `/demo`** (only when `DEMO_MODE=on`):
  - Pick one of the 12 trades; you get a private demo business in about 1 second.
  - It has about 50 leads with full conversations, jobs, review requests, follow-ups (sent, skipped and waiting), booked visits and licenses. Lawn/landscaping also get 26 recurring customers, today's route, a rain delay and a campaign.
  - The story comes from `lib/demo/scenario.ts` (pure, seeded) and `lib/demo/content.ts` (wording per trade).
  - Rate limited (8 per visitor per hour, 300 per day site-wide).
  - Demo businesses are on the Executive plan and have `is_demo`. They're deleted with their login after 24 hours by the scheduler.
- **Safety:**
  - A pretend (simulator) number ALWAYS uses the simulator, even when the site texts through Twilio (`getProvider(phone)`). Before this, a pretend number on a live site would have tried Twilio.
  - Demo businesses use 555 area-code numbers.
  - They can't buy a number, bill or submit registration, and their public pages aren't indexed.
  - Owners can't change `is_demo` or `demo_expires_at` (DB test).
- **Live demo buttons** (yellow 🎬 Demo bar, demo businesses only; `lib/services/demo-live.ts`):
  - miss a call (text-back plus the customer's reply, through the same code as a real call);
  - a customer texts in (English or Spanish);
  - jump ahead in time (sends waiting follow-ups);
  - see the customer's phone (simulator);
  - book online as a customer, or send a rain delay.
  - After a button, the conversation shows a "What just happened" note.
- **Home page:** "▶ Try the live demo" when the demo is on.
- Migration `20260930030000_demo_sandboxes.sql` (additive); rollback included.
- Tests: `tests/unit/demo.test.ts` (every trade's story is complete and consistent, no leftover placeholders, no replies before the question, the business is growing, the trend math, and simulator numbers never use Twilio); DB test for the demo columns. Click-through: all 12 trades on laptop and phone.

**How to test**
1. Set `DEMO_MODE=on` in `.env.local`, then run `npm run dev`. Open http://localhost:3000 → **▶ Try the live demo** → pick Roofing.
2. **▶ Try it** → **Miss a call from a new customer**. You land in the conversation: the automatic text and the customer's reply, with "What just happened".
3. Reply, set the stage to **Estimate sent**, press **⏩ Jump ahead in time**. The follow-ups go out.
4. **Dashboard**: money won, saved calls, the weekly chart. On a laptop: side menu; on a phone: bottom bar.
5. **Pick another trade** → Lawn care → **Today** → rain delay.
6. The script for sales calls is in `docs/DEMO.md`.

### M25: Quality
**What changed**
- **Click-through tests in the repo** (`e2e/`, Playwright; `npm run e2e`). They run at laptop and phone size:
  - a missed call → text-back → reply → estimate → follow-ups;
  - the dashboard numbers and chart;
  - a customer booking online, and the owner seeing it;
  - Spanish replies;
  - a lawn rain delay;
  - sign-up → onboarding → pretend number → simulated missed call;
  - logged-out visitors blocked, bad booking links refused, the scheduler needing its secret.
  They start their own demo businesses, so no seed data is needed.
- **Automatic checks on GitHub** (`.github/workflows/ci.yml`) on every push:
  1. lint, typecheck, unit + database tests (Postgres service), build;
  2. local Supabase (all migrations), the built app, then the click-through tests. Screenshots and traces are kept for failures.
- **Daily cleanup** (the scheduler's once-a-day job): deletes old rate-limit records (2 days), used/expired AI sign-in codes (1 day), expired unaccepted invites (30 days), job-run records (90 days), old notices (180 days) and AI activity older than a year. Rules: `lib/automation/retention.ts`. Conversations, consent history, jobs, bookings and files are never deleted by it.
- **Error alerts (Sentry)**, off until `SENTRY_DSN` is set. Server errors (`instrumentation.ts` → `onRequestError`) and browser errors ("Something went wrong" screens → `/api/client-errors`, max 20/minute) are sent straight to Sentry's API. There's no SDK. What's sent is scrubbed: no phone numbers, emails, secrets, long tokens or query strings, and never message text.
- `DEMO_STARTS_PER_HOUR` setting (default 8) so the tests can start many demos.

**How to test**
1. GitHub → the repository → **Actions**: every push shows "CI" with two checks (green = good). Click a failed run to see which step failed. The click-through step keeps screenshots under "Artifacts".
2. Locally: run the app with `DEMO_MODE=on` and `DEMO_STARTS_PER_HOUR=500`, then `npm run e2e`.
3. Error alerts: create a free Sentry project (Next.js), put its DSN in `SENTRY_DSN` on Vercel, redeploy. Visit a page that errors; the alert email arrives within a minute.

### M26: Selling tools
**What changed**
- **A demo business per industry (item 12):** covered by "Try it live" (`/demo`, all 12 trades businesses can pick today). See "Demo-ready UI" above and `docs/DEMO.md`.
- **Setup checklist (item 13):**
  - New owners see "Finish setting up" at the top of Inbox (trades) or Today (lawn), with a progress bar and the next step.
  - Settings → **Setup checklist** has the full list:
    1. business number;
    2. new-lead alerts;
    3. forward and test (or try the simulator);
    4. carrier registration;
    5. Google review link;
    6. lawn only: add your customers;
    7. optional: license & insurance, online booking, public profile, invite your office manager.
  - Steps tick themselves off from what the business has actually done. The card goes away when the must-do steps are done, or when the owner hides it.
  - Never shown to office managers or in demo businesses. Rules: `lib/setup/checklist.ts` (pure).
- **Audit → customer link + re-audit (item 14):**
  - On an audit report (admin), choose which business the prospect signed up as. The business's admin page lists its audits.
  - **Re-run audit** checks the website again with the same call answers and shows "Before: 42 → now 78 (+36 points)", good for renewals and case studies.
  - Demo businesses are left out of the admin business list.
- **Calendar feed (item 16):**
  - Settings → **Calendar** → "Create my calendar link", then Add to Google / Apple / Outlook.
  - The feed has bookings (2 weeks back, 3 months ahead; waiting requests marked "(Waiting)") and, for lawn businesses, an all-day "Route: N customers" for the next 3 weeks.
  - It shows names, services and addresses only, never notes or gate codes.
  - The secret address can be replaced or turned off, and only the server sets it (DB test). A wrong address returns "not found" (click-through test).
- Migration `20260930040000_m26_selling.sql` (additive); rollback included.

**How to test**
1. Sign up as a new owner: "Finish setting up" appears on the Inbox. Follow "Next" through the steps and watch them tick off. Settings → Setup checklist → Hide.
2. Settings → Calendar → Create my calendar link → Add to Google Calendar. On a live site, bookings appear within about an hour.
3. Admin → Sales audits → open one → "Signed up as" → pick the business → Save. Then **Re-run audit**: the new report shows before and after.

### M27: Module A (Recurring Home Services) foundation
**What changed**
- **House cleaning, pest control and pool service can sign up.** They're route businesses like lawn care: routes, Today, rain delays, bulk texts, campaigns, recurring metrics. Picking one of them at sign-up (or later in Settings → Business details) switches on the Recurring Home Services module (`lib/services/editions.ts`). Home Services stays on too. Lawn companies can get the module as an add-on (now "available" in the catalog), e.g. to sell mosquito plans.
- **Service agreements** (`rh_agreements`, menu **Agreements**):
  - quarterly pest plans, termite bonds, mosquito and pool seasons, cleaning plans, with a price, how it's charged, the term, end date and "renews on its own";
  - quick picks per trade;
  - the list shows what's coming up, what's active, and what it's all worth per year;
  - each customer's page shows their agreements with "+ Add".
- **Automatic renewal reminders:** a once-a-day job (the module's `dailyJobs`) does three things:
  - texts the customer N days before the end date (default 30). The text is "Your "Termite bond" renews on October 31…", or "…ends on… Reply YES to renew";
  - rolls auto-renewing agreements forward once the date passes, and ends the others;
  - sends the owner a summary.
  Reminders use a new general outbox kind, `module_notice`, so they get the same business hours, opt-outs, STOP line and last-moment re-check as every other text. The reminder is skipped if the agreement's end date changes before it goes out. There's also a "Text the reminder now" button and "Renew now".
- **Access notes** (gate code, lockbox, alarm, dogs): edit them on the customer page. They show with a 🔑 on Today's route for the crew. They're kept in the private property record, never texted or shared with AI assistants. Shown for all route businesses (lawn included); display only, behavior unchanged.
- AI assistants: new read-only tool `list_service_agreements` (no access notes).
- Module plug-in points added to the framework: `dailyJobs`, `customerPanels`.
- Migration `20260930050000_m27_recurring_home.sql` (additive); rollback included. Tests: agreement rules, form, texts, outbox module notices, module wiring (unit); isolation and permissions for agreements (DB); a pest control company end to end (click-through).

**How to test**
1. Sign up choosing **Pest control**. You land on Today; the menu (More) has **Agreements**.
2. Customers → Add (due today). On their page, type access notes → Save. **Today** shows 🔑 with the notes.
3. Agreements → + New → pick the customer → **Termite bond** → price → start date about a year ago → Save. It shows "Renewing soon" and the exact reminder text. Tap **Text the reminder now**: the customer gets it in business hours (Simulator).
4. The next morning the daily job sends reminders for anything inside its notice window and tells you what it did.

