# Industry Modules Plan (Editions & Add-ons)

Status: **Approved 2026-09-29; M14–M22 in progress.** Progress log: `docs/MODULES_PROGRESS.md`.
Date: 2026-09-29 · Builds on milestones M0–M13 (see CLAUDE.md).

---

## 1. What exists today (verified by reading the code)

### Built and working (M0–M13, 254 automated tests, all passing)
| Area | What's there |
|---|---|
| Accounts & security | Businesses (organizations), owner + office manager roles, invite links, row-level security on every table, isolation tests |
| Phone & texting | Business number (Twilio or simulator), missed-call text-back, press-1 call screening, STOP/HELP/START (EN/ES), consent log, one send pipeline enforcing opt-outs, consent category, sending hours, plan limits, carrier approval |
| Leads | Inbox, two-way texting, 5 fixed stages with per-type labels, manual leads |
| Automations | Outbox scheduler, estimate follow-ups, review requests (once per customer; Nth visit for recurring) |
| Lawn layer | Recurring customers (weekly/biweekly/4-weekly, pause/cancel), CSV import, Today + rain delay, mark day complete, seasonal campaigns (written-consent only) |
| Reporting | Owner dashboard (core + recurring metrics) |
| Billing | Stripe subscriptions: **one plan per business**, 3 on/off feature columns |
| Compliance | Carrier (A2P) registration workflow, platform admin, legal pages |
| AI assistant | Owner-facing MCP server (`/api/mcp`): one-tap connect (OAuth) or keys, 3 access levels, 24 tools, activity log |

### Described in the brief but NOT in this codebase
Searched the whole repository (one branch; no other repo in your account looks like this product):

| Brief says exists | Reality |
|---|---|
| Agent-readiness audit tool | **Not built** |
| "Agent Ready" tier: hosted profile with structured data (schema.org) | **Not built** (no public business pages, no JSON-LD) |
| Public booking page | **Not built** (no appointment booking of any kind) |
| Agent booking API and MCP server (for outside AI agents booking on a consumer's behalf) | **Not built.** The MCP server that exists acts for the *owner* only |
| AI voice line | **Not built.** Calls are forwarded to the owner; missed calls get a text |
| Approval rules | **Not built** |
| Source reporting | Partial: leads have a `source` (missed call / text / campaign / manual); there's no report |
| "Estimate windows (existing)" booking mode | **Not built.** Leads have an "estimate sent" stage, but there's no scheduling of estimate visits |

If this work lives somewhere else (another repo, a zip, a contractor's branch), give me access before we start. Otherwise the plan below builds the minimum of it that the modules need.

### How "vertical configuration" works today
There are **two coarse business types, not industries**:
- `organizations.business_type` = `project` (trades) or `recurring` (lawn care), picked at onboarding.
- Type-specific behavior lives in 4 lookup files: `lib/business-types.ts` (names), `lib/navigation.ts` (which menus show), `lib/leads/stages.ts` (stage wording), `lib/templates/defaults.ts` (which templates each type gets).
- Plus about 50 inline `business_type`/`isLawn` checks across 22 files (dashboard, agent tools, carrier-registration wording, settings pages).
- Features are also gated by 3 plan flags (`feature_recurring_customers`, `feature_bulk_messaging`, `feature_campaigns`).
- There's no notion of a specific industry (roofing vs HVAC), no service catalog, no schema.org type, no module concept, no file storage, and no add-on billing.

---

## 2. Vocabulary (plain language)

- **Industry**: a specific trade: roofing, pest control, pet grooming, auto detailing. Drives wording, templates, services, audit checks, voice script, schema.org type.
- **Module**: a package of code that adds capabilities (screens, tables, booking modes, AI tools). Example: "Pet Care" adds pet profiles, vaccine records and boarding.
- **Edition**: what a business buys as its main product. It's built from one or more modules. Home Services (today's product) stays the flagship edition.
- **Add-on**: an extra module a business can add to its edition (e.g. a lawn company adds the Recurring Home Services module to sell mosquito spraying; any edition adds "Agent Ready").

A business has **one edition + any add-ons**, and **one primary industry** (plus optional secondary industries).

---

## 3. Module framework

### Shape
```
modules/
  registry.ts                  ← the ONLY place that imports modules
  home-services/               ← today's product, wrapped (no behavior change)
  recurring-home/              ← Module A: cleaning, pest control, pool
  project-quote/               ← Module B: moving, pressure washing, junk removal
  pet-care/                    ← Module C: grooming, boarding, mobile vet, training
  automotive/                  ← Module D: detailing, repair, mobile mechanic, tint
lib/modules/                   ← core-side contracts (types) + hook runners
```

Each module exports one **manifest** (a typed object):
- `id`, `name`, `industries` (keys of the industries it serves; the industry configs themselves are core data in `lib/industries/`, so the audit tool and onboarding work before a module exists)
- `subjectTypes` (property / pet / vehicle, with field definitions and which fields are private)
- `bookingModes` it uses (§4)
- `templates` (EN + ES), `campaignPresets`, `voiceScripts` (data), `auditChecks`
- `approvalRuleTypes`, `metrics`, `navItems`, `leadPanels` (what shows on a lead)
- `ownerAgentTools(server, ctx)` and `publicAgentTools(server, ctx)` (registration functions)
- `featureFlags`, `stripeLookupKeys` (billing), `credentialKinds` (licenses/insurance)

### Rules
1. **Core never imports module code.** `lib/` and core `app/` screens call hook runners (`getNavItems(org)`, `getLeadPanels(org, lead)`, `registerAgentTools(server, ctx)` …) that read from `modules/registry.ts`. Enforced with a lint rule (`no-restricted-imports`) plus a test.
2. **Enabling a module is a settings change:** a row in `org_modules`. No code deploy per customer.
3. **Module screens** live in their own route folders (e.g. `app/(app)/(pet-care)/pets/…`) and start with `requireModule("pet_care")`, like today's `requireAppContext`.
4. **Module tables** live in the normal `supabase/migrations/` folder, prefixed with the module name, with the same RLS pattern and isolation tests.
5. **Pure rules first** (booking math, approval rules, reminders) in `modules/<id>/rules/` with unit tests. Same as today's `lib/automation/`.
6. **Home Services becomes a module first**, wrapping existing behavior exactly. Golden tests (§8) prove nothing changed.

---

## 4. Shared booking engine

One engine, several **modes**. Each mode is a small pure function set: "is this request valid?", "is there room?", "suggest open slots". The engine handles storage, locking and approvals.

| Mode | Used by | Rule |
|---|---|---|
| `arrival_window` (new; brief called it "estimate windows") | Trades estimates, cleaning, pest | Customer picks a window (e.g. 8–10am); max N per window |
| `fixed_appointment` | Grooming, mobile vet, detailing, tint, repair bays | Start + duration on a resource (groomer, bay, tech); no overlap per resource; business hours |
| `day_capacity` | Moving, junk removal, pressure washing | Max N jobs per day (e.g. 2 moves/day), optionally per crew |
| `multi_day_reservation` | Boarding | Check-in/out dates + drop-off/pick-up times; nightly capacity per kennel/run size; every night in the range must have room |
| `recurring` (existing) | Lawn, cleaning, pest, pool | Adapter over today's `recurring_services`; no change to lawn behavior |
| `mobile_appointment` | Mobile vet, mobile mechanic, mobile detailing | `fixed_appointment` + service area (ZIP list or radius) + travel buffer between consecutive jobs for the same tech |
| `package_sessions` | Dog training | Sessions bought/used/remaining; booking consumes one; can't book past zero |

### Data (new, additive)
- `resources`: crews, bays, technicians, kennel runs (with size class and count), vans
- `service_catalog`: per business: name, industry, booking mode, duration, price range, price by size class, deposit, required subject type
- `bookings`: contact, lead, subject, service, mode, status (`requested → pending_approval → confirmed → in_progress → completed / canceled / no_show`), start/end or dates, resource, address, travel buffer, drop-off/pick-up, **source** (owner, customer link, AI assistant, outside agent, voice)
- `capacity_rules`: per-day / per-window / per-night limits
- `packages` + `package_redemptions`: session tracking

### Double-booking protection (defense in depth)
- A Postgres function `book_slot()` re-checks capacity inside a locked transaction, so two customers can't grab the last slot at the same moment.
- A database overlap constraint on (resource, time range) for fixed appointments.

---

## 5. Subjects, private data, files, credentials

- **`subjects`**: one table for "the thing we service": `property`, `pet`, `vehicle`. It has contact, module, type, display name, and `attributes` (validated by the module's field definitions). The inbox, bookings, voice and agents reference `subject_id` without industry special-cases.
- **`subject_private`**: a *separate* table for private fields: property access notes (gate codes, pets, lockbox), VINs. Public pages, agent APIs and SMS read only `subjects` through allow-listed serializers, so private fields can't leak by accident. Crews and owners see them in the app.
- **Files**: Supabase Storage **private bucket**, paths `org_id/…`, storage RLS, short-lived signed URLs (e.g. 5 minutes), size limits (photos ≤10 MB, documents ≤10 MB), type allowlist (JPEG/PNG/HEIC/WebP, PDF for vaccine records). A `files` table records owner, kind (quote photo, visit photo, vaccine record, pet/vehicle photo) and subject.
- **Vaccinations**: `vaccination_records` (pet, vaccine, expiration date, file, verified by/at). Reminders before expiry; bookings blocked or sent for approval when required vaccines are expired.
- **Credentials**: `business_credentials` (license / certification / insurance / registration, number, issuer, expiration, show-on-profile). Industry configs suggest which ones. Credentials still need verifying with each SC regulator; examples: the pesticide applicator license for pest control, mover authority for intrastate household-goods moves.

### How private data is guaranteed not to leak
1. Structural: private fields live in a separate table that public/agent code never queries.
2. Templates can't reference private fields (the placeholder allowlist doesn't include them).
3. **Sentinel tests**: seed private fields with unique marker strings, call every public endpoint, agent tool and SMS render, and assert the markers never appear.

---

## 6. Industry configs (all industries, data only)

Each industry config defines: service catalog (with optional price ranges), stage wording, EN + ES templates, campaign presets by month, voice script + qualifying questions, schema.org type, suggested credentials, subject type, booking modes, navigation, audit checks, approval rule defaults, metrics.

### schema.org types
Checked against the schema.org vocabulary (via the `schema-dts` package; schema.org itself isn't reachable from this environment). Where no specific type exists, we use the closest real parent.

| Industry | schema.org type | Note |
|---|---|---|
| Roofing | `RoofingContractor` | exists |
| HVAC | `HVACBusiness` | exists |
| Electrical | `Electrician` | exists |
| Plumbing | `Plumber` | exists |
| Remodeling | `GeneralContractor` | exists |
| Lawn care / landscaping | `HomeAndConstructionBusiness` | no lawn-specific type |
| Residential cleaning | `HomeAndConstructionBusiness` | no cleaning type ("services around homes") |
| Pest control | `HomeAndConstructionBusiness` | no pest type |
| Pool service | `HomeAndConstructionBusiness` | no pool type |
| Moving | `MovingCompany` | exists |
| Pressure washing | `HomeAndConstructionBusiness` | no specific type |
| Junk removal | `HomeAndConstructionBusiness` | no specific type |
| Pet grooming | `LocalBusiness` | no grooming type (`PetStore` is retail; wrong) |
| Pet boarding | `LocalBusiness` | `LodgingBusiness` is for people; `AnimalShelter` is adoption |
| Mobile veterinary | `VeterinaryCare` **+** `LocalBusiness` | `VeterinaryCare` sits under MedicalOrganization, so also list LocalBusiness for hours and service area |
| Dog training | `LocalBusiness` | no specific type |
| Auto detailing | `AutomotiveBusiness` | `AutoWash` exists but means car wash; detailing is broader |
| Auto repair | `AutoRepair` | exists |
| Mobile mechanic | `AutoRepair` | with service area instead of a storefront |
| Window tinting | `AutomotiveBusiness` | no specific type |

`ProfessionalService` is deprecated by schema.org and won't be used. A unit test will assert every configured type exists in the vocabulary.

---

## 7. Extending existing features

| Feature | How modules plug in |
|---|---|
| Lead inbox | `leadPanels` hook shows the subject card (pet / vehicle / property, non-private fields) and module fields (move date, vehicle size, vaccine status) |
| Owner AI assistant (existing MCP) | `ownerAgentTools` hook; existing 24 tools untouched |
| Outside-agent booking API + MCP (new, public) | `publicAgentTools` hook (`get_pricing_by_vehicle_size`, `check_boarding_availability`, `request_quote_with_photos`, `check_route_availability` …); allow-listed serializers; per-business rate limits |
| Voice agent (new) | Module scripts and qualifying questions are data; same AI disclosure, recording notice and approval rules. Mobile vet: never medical advice; emergencies go straight to the owner and the emergency vet listed in settings (**required setting before mobile vet can be turned on**) |
| Approval rules (new engine) | Pure evaluators registered by modules: aggressive-pet notes, expired vaccines, move distance over X, repair estimate over $X, quote over $X, outside service area |
| Audit tool (new) | Checks are data per industry, so the audit works for **every industry before its module exists** |
| Reporting | `metrics` hook: boarding occupancy, quote acceptance rate, rebooking rate, agreement renewals, booking source |
| Billing | `org_modules` + Stripe subscription with several items (edition + add-ons); one Stripe product per module; `hasModule()` check alongside today's plan flags |
| SMS | Unchanged: every module sends through the one send pipeline, so opt-outs, consent, hours and footers apply automatically |

---

## 8. Data model changes & migration plan

### New or changed (all additive)
- `organizations`: **add** `industry text` (nullable) and `secondary_industries text[]` (default empty). **Keep** `business_type` exactly as is.
- New: `org_modules`, `industries_enabled` (if needed), `service_catalog`, `resources`, `capacity_rules`, `bookings`, `packages`, `package_redemptions`, `subjects`, `subject_private`, `files`, `vaccination_records`, `business_credentials`, `service_agreements`, `visit_logs`, `quotes` + `quote_lines`, `approval_rules`, `approval_requests`, `audit_reports`, `org_emergency_contacts` (mobile vet).
- `leads` / `messages`: **add** nullable `subject_id`, `booking_id`.
- `api_keys` (existing): **add** `audience` (`owner` | `public_agent`) with default `owner`, so today's keys behave exactly as now.

### Backward-compatibility rules
1. Only add tables, add nullable/defaulted columns, and widen check constraints. **No drops, renames or type changes** of existing columns during this program.
2. Backfill: every existing business gets `org_modules = home_services` (enabled) and `industry = null`, which means "generic trades" or "lawn care" from `business_type`. Owners can pick a specific industry later; nothing changes until they do.
3. Code reads `industry ?? fallbackFrom(business_type)`, so old rows keep working.
4. New features are behind module flags that default **off**.

### Deploy order (every migration)
1. Apply the additive migration (old code keeps working).
2. Deploy code that tolerates both old and new data.
3. Run the backfill (idempotent, re-runnable).
4. Switch reads to the new data behind a flag.

### Rollback notes
- Each migration gets a matching hand-run rollback script in `supabase/rollbacks/` that drops **only** the objects it added.
- Because nothing existing is altered, rolling back code is enough to restore old behavior. Rolling back the database is only needed to remove unused tables.
- Turning a module off (`org_modules.enabled = false`) hides it for that business immediately, with its data kept.

### Safety net before refactoring (golden tests)
Before touching the core, snapshot today's behavior for both business types: navigation, stage labels, default templates, dashboard metrics, agent tool lists per access level, texting outcomes. These must stay green throughout.

---

## 9. Build order

Founder decisions (2026-09-29, second round), which shaped this order:
- The Agent Ready features and the audit tool don't exist anywhere else, so we build them here.
- **Managers can plug their own AI tools in** (not just owners), capped below the owner's level.
- **The audit tool is for sales calls only**: it lives in /admin and is never public.
- **Each business picks its specific industry**, and the app tailors itself to it.
- **Pricing:** there's an Executive tier with every AI feature, and Enterprise is by quote. Details are in `docs/PRICING.md`.

Industry configs are **core data** (`lib/industries/`), not module code. The audit tool and onboarding need every industry before its module is built. Modules add *behavior* (tables, screens, booking rules, AI tools).

| # | Milestone | What it delivers |
|---|---|---|
| M14 | **Safety net + team AI access** | Snapshot ("golden") tests of today's menus, stage words, templates, settings and AI tool lists. Office managers connect their own AI tools (capped at "Read and act"); owners see and can disconnect every connection; a connection stops working the moment its person leaves the team. Plan switch `feature_team_ai`. |
| M15 | **Module framework + industry picker** | `organizations.industry` (optional). Onboarding and Settings let owners pick their industry. `lib/industries/` for configs, `modules/registry.ts` (the only place that lists modules), and a lint rule so `lib/` never imports `modules/`. Tailoring: stage words, missed-call wording, service quick-picks, "questions to ask" on each lead, AI instructions. |
| M16 | **Industry configs for every industry** | All ~27 industries: service catalogs with price ranges, stage words, EN/ES templates, campaign presets, voice script + qualifying questions, verified schema.org type, suggested licenses/insurance, subject type, booking modes, audit checks, approval defaults. Tests check every one. |
| M17 | **Sales audit tool (admin only)** | /admin/audit: pick industry, enter the prospect's website and answer a few questions on the call. The app checks the website (structured data, phone, hours, booking link, mobile, https) and scores "AI-agent readiness" with plain-language fixes. Printable report (save as PDF). Saved in a server-only table. |
| M18 | **Customer records, private data, files, licenses** | `subjects` (property / pet / vehicle) + `subject_private` (gate codes, VINs, access notes) + `files` (private bucket, signed links, size/type limits) + `business_credentials`. Property card with private access notes and photos on each lead. Settings → Licenses & insurance. |
| M19 | **Booking engine** | Pure rules for all 7 modes (arrival windows, fixed appointments, day capacity, multi-night stays, recurring, mobile with travel buffers, session packages) + document requirements (e.g. vaccines). Tables: services, resources, capacity, bookings, packages. `book_slot()` locks capacity inside the database. Schedule screen and "Book estimate visit" from a lead, off until the booking switch is on. |
| M20 | **Approval rules + source reporting** | Pure approval rules (outside-agent bookings, price over $X, outside service area, short notice, new customer, plus module rule types). Approvals list with approve/decline + customer texts. "Where leads and bookings came from" report. |
| M21 | **Editions, add-ons, Executive & Enterprise** | `org_modules` (edition + add-ons), new plan rows (Executive, Enterprise) and switches (`feature_agent_ready`, `feature_booking`, `feature_approvals`, `feature_ai_voice`). Stripe checkout with several items; the webhook keeps modules in sync. Admin can switch modules on per business. |
| M22 | **Agent Ready** | Hosted business profile `/b/[slug]` with schema.org JSON-LD and licenses; public booking page with SMS consent capture; public agent booking MCP for outside AI agents (read services, check availability, request a booking that goes to approval). Serves only an allow-listed public view through database functions. Isolation tests for every public endpoint and tool. |
| M23–25 | **Module A: Recurring Home Services** | First module (see below) |
| M26–28 | **Module B: Project & Quote Services** | Photo quotes, quote builder, deposits, day capacity |
| M29–31 | **Module D: Automotive** | Vehicles, size-class pricing, bays, line-item approvals, status texts |
| M32–34 | **Module C: Pet Care** | Pets, vaccines, boarding, packages, mobile-vet guardrails |
| M35 | **AI voice line** + module voice scripts | Scripts are ready as data from M16 |

Every milestone ends with `npm run check`, database tests, a commit/push, and a "how to test" list in `docs/MODULES_PROGRESS.md`. Progress notes are written so any future session can resume mid-program.

---

## 10. Recommendation: build Module A (Recurring Home Services) first

**Reuse (most of it already exists):**
- Cleaning, pest control and pool service all run on the same weekly/biweekly/monthly routes lawn care does. Today's recurring customers, Today screen, rain/weather delays, bulk texting, campaigns, review-after-Nth-visit and churn metrics work nearly as-is.
- The new pieces are small and self-contained: access notes, service agreements with renewal reminders, a visit log with notes/photos, a "service complete" text, and industry campaign presets.

**Charleston/Summerville market (what I know, not verified market data):**
- Pest control and mosquito control are year-round, recurring and big in the humid Lowcountry.
- Pool service is seasonal (openings in spring, closings in fall).
- Cleaning demand comes from fast-growing Summerville/Nexton neighborhoods, vacation rentals and move-outs, including Joint Base Charleston relocations.
- **Cross-sell:** your lawn customers can add pest/mosquito spraying as an add-on, which is the first real test of editions + add-ons.

**Why the others come later:**
- **B (moving / pressure washing / junk removal):** a strong local market (humidity, mildew, pollen; relocations), but it needs photo quotes, a quote builder, Stripe deposits and day capacity. That's all new.
- **D (automotive):** vehicle profiles, size-class pricing, bays and line-item approvals are new, and shops already use shop-management software.
- **C (pet care):** the most new data and rules (vaccine records, boarding capacity, packages, medical guardrails for mobile vets) and the most sensitive uploads. Could jump ahead of D if you land a groomer or boarder early; grooming-only is much simpler than boarding.

---

## 11. Decisions

Answered 2026-09-29: build Agent Ready + audit here (audit is admin-only), managers get their own AI connections, every business picks an industry, and there's an Executive/Enterprise AI tier (see `docs/PRICING.md`).

Still open (not blocking M14–M22):
1. **Voice line vendor and budget** (M35): affects cost per business and recording-consent wording. Have your attorney confirm SC recording consent.
2. **Existing pilots' industry:** they stay generic until the owner picks one in Settings. Nothing changes for them otherwise.
3. **Final price points** before turning on Stripe (M21 ships with the suggested prices; you can edit them in /admin → Plans).
