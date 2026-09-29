# Build Plan — Contractor Text & Follow-up Platform (MVP)

Status: **Approved.** Milestone 0 complete; see CLAUDE.md for current status.
Last updated: 2026-09-29

---

## 0. Summary

A texting and follow-up tool for small home-service contractors around Charleston and Summerville. It serves two kinds of business from **one app and one database**:

| | Project-based trades | Lawn / landscaping |
|---|---|---|
| Who | Roofers, HVAC, electricians, remodelers | Lawn care, landscapers |
| Revenue shape | One-off, high-ticket, quote-driven | Weekly/biweekly recurring + seasonal upsells |
| Main pain | Missed calls, estimates nobody follows up on, no reviews | Same, plus rain delays, spring rush, off-season churn, upsells |
| Features they see | Core: 1–4 and 8 | Core, plus 5–7 (Customers, Today/Rain delay, Campaigns) |

**The core (features 1–4 and 8) sells to both segments.** The landscaping layer (5–7) is built on top without changing the core.

---

## 1. Stack review: keep it, with four small additions

Your stack works for a solo founder. Next.js, Supabase, Twilio, Stripe and Vercel are popular and well documented, and each has a free or cheap starting tier. I'd keep all of it. I'm adding four small pieces and one working habit:

| Addition | Why | Cost |
|---|---|---|
| **Vercel Pro** (not Hobby) | Vercel's free Hobby plan doesn't allow commercial use, and it can only run scheduled jobs once a day. Pro lets a job run every minute, which is what sends follow-ups and scheduled texts on time. | $20/mo |
| **Resend** (email) | Supabase's built-in email for logins and password resets has a very low sending limit and shouldn't be used in production. Resend plugs into Supabase in about 5 minutes. | Free tier |
| **Sentry** (error alerts) | Emails you when something breaks, such as a text that failed to send, so you hear about it before a customer does. | Free tier |
| **Vitest** (testing tool) | Runs the automated tests for follow-up timing, opt-outs and recipient selection. | Free |

**Working habit: two Supabase projects (dev + prod) instead of running a database on your laptop.** Running Supabase locally requires Docker, which is one more thing to break. With a "dev" cloud project, plus Vercel's automatic preview links for each change, you can test on your phone without installing anything.

**Deliberately left out:** a separate job-queue service (Inngest, Trigger.dev), Redis, a mobile app, and an AI/chatbot layer. A database table plus a once-a-minute job covers everything in the MVP. The web app will be built so it can be installed to a phone's home screen, which is good enough for trucks and job sites.

---

## 2. Three decisions that shape everything (plain language)

### 2a. "Decide at send time" — how all automated texts work
Every future text (follow-ups, review requests, campaigns, scheduled bulk texts) goes into one **outbox** table with a send time. Once a minute, a job picks up whatever is due and **checks again right before sending**:
- Is the lead still "estimate sent"? Did the customer reply? Did they opt out? Is it inside allowed sending hours? Does the business still have an active plan?

If any check fails, the text is skipped and the reason is logged. We never have to hunt down and cancel future messages when something changes, because the check happens at the last moment. This is the most important design choice for reliability. It's also where most of the tests will be.

### 2b. Fixed lead stages, customizable labels
The automation keys off five fixed stages: `new → contacted → estimate_sent → won / lost`. Each business type gets its own **display labels**. A roofer sees "Estimate sent"; a lawn company can see "Quote sent" and "Signed up". The logic stays simple, and each industry still sees its own words.

### 2c. Three message categories, each with its own consent rule
Every template and every text is tagged with a category. The category decides who can receive it and when:

| Category | Examples | Who can receive it | Sending hours (default) |
|---|---|---|---|
| **Conversational** | Missed-call text-back, owner's manual replies | Anyone who called or texted the business | Any time |
| **Informational** | Estimate follow-ups, review requests, rain delays, schedule changes | Existing leads or customers of that business who haven't opted out | Follow-ups/reviews: 9am–7pm. Rain delays: from 6:30am, with a warning before 7am |
| **Marketing** | Seasonal campaigns (aeration, pine straw, leaf cleanup) | **Only** contacts with a recorded marketing consent (written/express) | 8am–8pm, hard block outside it |

Opted-out contacts get nothing except the single "you're unsubscribed" confirmation. The app enforces these rules in code, so an owner can't text a past customer a promotion by accident.

---

## 3. Data model

Every business is an **organization**. Every table (except the global `plans` table) has an `org_id` column. Supabase row-level security (RLS) ensures a logged-in user can only read or write rows whose `org_id` belongs to an organization they're a member of. The same rule runs on every table.

Twilio webhooks (incoming calls and texts) run server-side with an admin key. They look up the organization **from the Twilio phone number that was called**, never from anything the caller sends.

### Accounts & billing
| Table | What it holds |
|---|---|
| `organizations` | Name, `business_type` (`project` \| `recurring`), timezone (default America/New_York), Google review link, default language, owner's cell for alerts, automation settings (follow-up days `[2,5,10]`, review delay, "review after N visits" = 3, sending hours), `plan_id` |
| `memberships` | Which users (Supabase auth) belong to which org, with a `role` of `owner` or `member` |
| `plans` | Plan name, Stripe price ID, and **feature limits**: max users, max phone numbers, monthly text allowance, and on/off switches for `bulk_messaging`, `campaigns`, `recurring_customers` |
| `subscriptions` | Copy of Stripe status: customer ID, subscription ID, status, period end (filled in once Stripe is added) |
| `usage_counters` | Texts sent per org per month, used to enforce plan limits |

### Phone & compliance
| Table | What it holds |
|---|---|
| `phone_numbers` | The org's Twilio number, Twilio IDs (subaccount, messaging service), setup mode (`new_number` or `forward_when_unanswered`), and the number to ring first |
| `a2p_registrations` | Status of each business's carrier registration (brand, campaign, approved/pending/rejected). Tracked manually at first (see §6) |
| `consent_events` | **Append-only log.** Every consent granted or revoked: contact, category (informational/marketing), method (called in, texted in, web form, signed agreement, imported with owner attestation, STOP keyword), the evidence text, who recorded it, and when. Nothing is ever edited or deleted |

`contacts` also stores the current consent state (opted out at, marketing consent at) for fast lookups. Both the log and that state are updated by a single function, so they can't disagree.

### People, leads & conversations
| Table | What it holds |
|---|---|
| `contacts` | Name, phone (standard +1 format, unique per org), email, address, `preferred_language` (`en`/`es`), `do_not_autotext` flag (for suppliers, family, etc.), `review_requested_at` |
| `leads` | Contact, stage, source (`missed_call`, `inbound_text`, `campaign`, `manual`), campaign link, estimate amount, timestamps for each stage, `first_human_response_at` |
| `calls` | Every inbound call: Twilio ID, answered or missed, duration, whether a text-back was sent |
| `messages` | Every text in or out: direction, body, category, sent by (user or automation), Twilio ID and delivery status, linked contact/lead |
| `message_templates` | Per org, per template key, per language. Keys like `missed_call_reply`, `estimate_followup_1..3`, `review_request`, `rain_delay`. Seeded from built-in defaults at onboarding |
| `scheduled_messages` | **The outbox** (§2a): what to send, to whom, when, why (`estimate_followup`, `review_request`, `broadcast`), status (`pending`, `sent`, `skipped`, `failed`) and skip reason |

### Jobs & recurring service (landscaping layer; jobs used by both)
| Table | What it holds |
|---|---|
| `jobs` | A completed piece of work: contact, lead (if any), recurring service (if any), completed date, amount. Marking a job complete triggers the review request |
| `recurring_services` | Contact, service type (mowing, full service, etc.), frequency (`weekly`, `biweekly`, `monthly`), service day, start date (tells biweekly customers which week they're on), price, status (`active`, `paused`, `canceled`), paused-until date, cancel reason |
| `broadcasts` | One table for both bulk sends: `kind` = `service_notice` (rain delay; informational) or `campaign` (seasonal; marketing). Stores the audience rule, message per language, scheduled time, and status. Each recipient becomes a row in `scheduled_messages` |

### What the dashboard uses
There are no dashboard tables. Every number is computed from the tables above with database views, for example leads this week, median time to first human reply, open estimates, win rate, reviews requested, active recurring customers, and churn (cancellations ÷ active customers at the start of the period).

---

## 4. Folder structure

```
contractor-platform/
├── CLAUDE.md                  # Project rules for future AI sessions
├── README.md                  # Setup guide for any developer
├── docs/
│   ├── PLAN.md                # This file
│   └── COMPLIANCE.md          # A2P/TCPA checklist and what the app enforces
├── app/                       # Next.js pages (App Router)
│   ├── (marketing)/           # Public site: home, privacy, terms, SMS terms (required for A2P)
│   ├── (auth)/                # Login, signup
│   ├── onboarding/            # Pick business type → number → templates → done
│   ├── (app)/                 # Logged-in app, with mobile bottom navigation
│   │   ├── inbox/             # Lead inbox + conversation view
│   │   ├── today/             # Lawn: today's customers, Rain Delay button, mark day done
│   │   ├── customers/         # Lawn: recurring customers
│   │   ├── campaigns/         # Lawn: seasonal campaigns
│   │   ├── dashboard/
│   │   └── settings/          # Templates, automations, phone, team, billing
│   └── api/
│       ├── twilio/            # Webhooks: voice, dial result, sms, delivery status
│       ├── cron/dispatch/     # The once-a-minute outbox sender
│       └── stripe/webhook/    # Added in the billing milestone
├── lib/
│   ├── automation/            # PURE rules, no database: follow-up timing, send-time checks,
│   │                          #   quiet hours, recipient selection, review rules, opt-out parsing
│   ├── messaging/             # The single "send a text" function (every send goes through it)
│   ├── twilio/                # Twilio client + webhook signature check
│   ├── supabase/              # Browser client, server client, admin client (server only)
│   ├── templates/             # Default templates (EN + ES, per business type) + fill-in-the-blanks
│   ├── consent/               # Record/revoke consent (writes log + contact state together)
│   └── entitlements/          # "Can this org use feature X / send N more texts?"
├── components/                # Shared UI pieces
├── supabase/
│   ├── migrations/            # Database changes, in order, including RLS policies
│   └── seed.sql               # Plans + demo data for dev
└── tests/                     # Vitest tests (automation rules + RLS isolation)
```

**Main rule: the automation logic in `lib/automation/` is plain functions.** They receive data and return a decision, without touching the database or Twilio. That makes them easy to test and easy to reason about. **All outgoing texts go through one function in `lib/messaging/`,** which applies the opt-out, consent, sending-hours and plan-limit checks in one place.

---

## 5. Services to sign up for

| Service | When | What you need | Approx. cost* |
|---|---|---|---|
| **GitHub** | Now (done) | — | Free |
| **Supabase** | Milestone 0 | Two projects: `dev` and `prod` | Free to start. Pro ($25/mo) before real customers, for daily backups and so the project doesn't pause when idle |
| **Vercel** | Milestone 0 | Connect the GitHub repo | Pro $20/mo once you're live |
| **Domain name** | Milestone 0 | e.g. from Cloudflare or Namecheap | ~$12/yr |
| **Resend** | Milestone 0 | Verify your domain | Free tier |
| **Twilio** | Milestone 1 | Upgrade out of trial (trial accounts can only text verified numbers). Start **your own A2P brand registration right away**. It needs your EIN, legal business name and a live website with a privacy policy | Local number ~$1.15/mo; each text ~1–2¢ including carrier fees; A2P brand ~$4–$45 one-time; campaign vetting ~$15 one-time + ~$2–$10/mo per campaign |
| **Sentry** | Milestone 5 | — | Free tier |
| **Stripe** | Billing milestone | Business bank account, EIN | 2.9% + 30¢ per charge |
| **Business entity + EIN** | Before Twilio A2P | LLC with an EIN, if you don't already have one | SC LLC filing ~$110 |
| **SMS/TCPA attorney** | Before first campaign goes out | One-time review of consent flows and terms. The TCPA carries $500–$1,500 **per text** penalties, so a few hours of legal review is worth it | A few hundred to low thousands, one-time |

\* Prices change. Check current pricing on each vendor's site. Plan on **roughly $3–$15/month of fixed Twilio cost per customer business** (number + A2P campaign fee) plus per-text costs. Your pricing needs to cover this.

---

## 6. SMS compliance: what to know (not legal advice)

### A2P 10DLC (carrier registration). This affects "live in 15 minutes"
- US carriers block business texts from local numbers unless the sending **business** is registered. **Each contractor you sign up is its own "brand"** and needs its own registered "campaign" (use case). You register them through your Twilio account, as a software provider.
- **Approval takes days, sometimes a couple of weeks.** So "live in 15 minutes" means: account set up, number working, calls forwarding, templates ready, and the missed-call log capturing leads right away. **Outbound texting switches on when the carrier approves.** The app will show "Texting pending carrier approval" so there are no surprises.
- Very small operators without an EIN can use Twilio's **Sole Proprietor** registration. It has lower limits (1 number, lower daily volume), which is fine for a one-truck lawn company.
- **For your first ~10 customers, do registration by hand in the Twilio console** (I'll write a step-by-step checklist). Automate it through Twilio's API once the manual steps are clear. This saves weeks of building.
- Register each campaign as **"Mixed" (customer care + marketing)** so seasonal campaigns are covered. Sample messages and the opt-in description must match what the app actually sends.
- Required on your website: privacy policy stating that phone numbers and consent are **not shared with third parties for marketing**, plus SMS terms (message frequency, "Msg & data rates may apply", STOP/HELP). These are built in Milestone 1.

### Opt-out (STOP/HELP)
- Standard keywords (STOP, UNSUBSCRIBE, END, QUIT, STOPALL, REVOKE, OPTOUT) and Spanish equivalents (PARA, ALTO, BAJA, CANCELAR SUSCRIPCIÓN) → mark opted out, log it, send one confirmation.
- **Lawn-care catch: "CANCEL".** Carriers and Twilio treat CANCEL as an opt-out by default. A lawn customer texting "cancel" might mean "cancel this week's mow." We'll honor it as an opt-out, as the rules require, but **flag it in the inbox** so the owner can call them. The confirmation will say how to rejoin (reply START).
- FCC rules (2025) require honoring opt-outs sent in **any reasonable way**, including "please stop texting me." The app will flag messages that look like opt-outs even without a keyword, so the owner can confirm with one tap.
- HELP / AYUDA → auto-reply with business name and contact info.
- Opt-outs apply **per business**. Opting out of Joe's Lawn doesn't affect Bob's Roofing.

### TCPA / South Carolina
- **Marketing texts need prior express written consent.** A past customer who never agreed to promotional texts can't be sent a seasonal campaign. The app automatically excludes them and shows the count ("42 customers excluded — no marketing consent"). Your campaign lists will be smaller than your customers' full customer lists, so set expectations when selling.
- Ways to get marketing consent that the app will support: a checkbox on the web estimate/sign-up form, a line in the service agreement (the owner records it), or the customer texting a keyword like "YES" in reply to a one-time request that the attorney approves.
- **Imported customer lists:** the owner must confirm how consent was obtained. The app logs that confirmation with a timestamp.
- Sending hours: federal law and the SC Telephone Privacy Protection Act limit solicitations to roughly 8am–9pm. Marketing defaults to 8am–8pm to leave a margin.
- Missed-call text-back is a reply to someone who just called you: one text, informational, no promotions. The default template is written that way.

All of this goes into `docs/COMPLIANCE.md` as a checklist, marked by what the app enforces automatically and what you or the attorney need to do.

---

## 7. How missed-call text-back works (and the two setup options)

**Option A — "Keep your number" (recommended default; easiest to sell).** The contractor keeps the number painted on their truck. In their phone carrier's settings they turn on **"forward when unanswered/busy"** to their new Twilio number. Their phone rings as usual. If they don't pick up, the call goes to Twilio, which plays a short greeting, logs the call, and **texts the caller within seconds**. The text comes from the Twilio number, and replies land in the inbox.

**Option B — "New business number".** The contractor uses a new local 843 number (e.g. for Google Business Profile or ads). Calls ring their cell through Twilio. If there's no answer, the text-back fires.

**Voicemail catch (Option B):** if the owner's cell voicemail picks up, Twilio thinks the call was answered. We solve this with a **"press 1 to accept" prompt** when the owner answers. If nobody presses 1, the call counts as missed. Voicemail can't press 1.

**Guardrails:** no text-back to the same number more than once every 12 hours, none to contacts marked "do not auto-text", and none if the owner is already texting with that person.

**Owner alert:** each new lead also sends a short text to the owner's cell ("New lead: (843) 555-… missed call — tap to reply"), because owners won't be watching the inbox while on a roof.

---

## 8. Build sequence (milestones)

Each milestone ends with something you can test on your phone. After each one I'll give you a "how to test" and a "check before moving on" list.

### Core — sellable to both segments after Milestone 5

**M0 — Foundation (accounts, businesses, security)**
- Project scaffold, CLAUDE.md, README, dev/prod Supabase, Vercel deploy
- Sign up / log in, create organization, invite a teammate
- Onboarding: pick business type → sets navigation, lead labels, default templates (EN + ES)
- Mobile layout with bottom navigation, installable to home screen
- RLS on every table, plus an automated test proving Business A can't see Business B's data
- *You test:* create two businesses on two logins and confirm neither can see the other. Onboarding takes under 5 minutes.

**M1 — Phone number + missed-call text-back (Feature 1) + opt-out**
- Connect a Twilio number to an org (both setup options from §7)
- Missed call → text-back → call and message logged → owner alert
- STOP/HELP/START handling in English and Spanish, consent log
- Texting simulator (fake incoming calls/texts) so everything works before carrier registration
- Public website pages: privacy policy, terms, SMS terms (needed for A2P)
- *Start your own A2P registration during this milestone.*
- *You test:* call the number from your cell, don't answer, and time the text (goal: under 60 seconds, usually about 5). Reply STOP, then confirm nothing else is sent and the opt-out appears in the log.

**M2 — Lead inbox + two-way texting (Feature 2)**
- Inbox list: newest first, filter by stage, unread badges
- Conversation view: full text + call history, reply box, change stage in one tap, add notes
- New inbound texts create a lead automatically; screen updates live
- Add a lead by hand (e.g. from a referral)
- *You test:* text the number from a second phone and reply from the app. Move a lead through each stage.

**M3 — Outbox + estimate follow-ups + template editor (Feature 3)**
- The outbox and once-a-minute sender (§2a)
- Marking "estimate sent" schedules follow-ups on day 2, 5 and 10 (configurable), inside sending hours
- Stops automatically if the stage changes, the customer replies, or they opt out
- Template editor: English and Spanish side by side, preview with sample names, fill-in fields like `{first_name}`, `{business_name}`
- **Tests:** follow-up timing (incl. weekends/after-hours shifting), every stop condition
- *You test:* set the follow-up interval to minutes in dev, mark a lead "estimate sent", watch the texts arrive, then reply and confirm the next one is skipped.

**M4 — Jobs + review requests (Feature 4)**
- "Mark job complete" (from a won lead or a contact)
- Review request after configurable delay (default 2 hours, inside sending hours), with the Google review link
- Rule: **each contact is asked at most once, ever** (can be manually overridden)
- **Tests:** once-only rule, delay/sending-hours timing
- *You test:* complete a job, receive the review text, complete a second job for the same person → no second request.

**M5 — Owner dashboard (Feature 8, core metrics) + launch hardening**
- Leads this week, median time to first human reply, open estimates ($ and count), win rate, reviews requested
- Error alerts (Sentry), delivery-failure visibility, daily backups (Supabase Pro)
- **Pilot checkpoint:** sign 2–3 pilot customers (one trade, one lawn company) and bill them by hand until Stripe is in.

### Landscaping layer

**M6 — Recurring customers (Feature 5)**
- Customer list with frequency, service day, service type, price, status
- Pause (with resume date), cancel (with reason), reactivate
- **CSV import** (lawn companies arrive with a customer list in a spreadsheet), including the consent confirmation step
- Review rule for recurring: send once after the Nth completed visit (default 3)
- Navigation items appear only for lawn/landscaping businesses

**M7 — Today screen + bulk messaging (Feature 6)**
- **Today** opens to today's scheduled customers (handles biweekly weeks, excludes paused/canceled)
- Big **"Rain delay"** button: pick day (defaults to today) → pick new day → message is pre-filled in each customer's language → review count → send. **Goal: 3 taps and under 20 seconds.**
- Saved quick messages ("Running late", "Crew on the way")
- "Mark day complete" in one tap (creates visit records that feed review requests and churn stats)
- **Tests:** recipient selection (weekly/biweekly weeks, paused, canceled, opted out, Spanish vs English)

**M8 — Seasonal campaigns (Feature 7)**
- Pick audience (active, past, both; filter by service type), pick a template (fall aeration, overseeding, leaf cleanup, spring cleanup, mulch, pine straw), schedule
- **Marketing consent enforced**, with the excluded count shown
- Replies within 14 days become new leads tagged with the campaign
- Campaign results: sent, replies, leads, won

**M9 — Dashboard, recurring metrics**
- Active recurring customers, new vs. canceled this month, churn rate, paused count, off-season retention

### Business layer

**M10 — Stripe subscriptions + plan limits**
- Plans with feature switches and monthly text allowances (the data model is ready from M0)
- Checkout, customer billing portal, webhook to keep status in sync, grace period for failed payments
- *Can be moved earlier (right after M5) if you'd rather not invoice pilots by hand.*

**M11 — Self-serve A2P registration** (after ~10 manual registrations)
- Collect registration details during onboarding and submit through Twilio's API; show approval status in the app

---

## 9. Tests (what gets automatic checks)

| Area | Examples of what's checked |
|---|---|
| Follow-up timing | Day 2/5/10 from "estimate sent"; moves to the next allowed hour if it falls at night; custom intervals |
| Send-time checks | Skipped if stage changed, customer replied, opted out, `do_not_autotext`, plan inactive or over limit |
| Opt-outs | STOP/stop/Stop., Spanish keywords, "CANCEL" flagging, START re-subscribe, "please stop texting me" flagged |
| Bulk recipients | Weekly vs biweekly parity, paused until date, canceled, opted out, language selection, no duplicates |
| Marketing consent | Excludes contacts without marketing consent; counts exclusions |
| Reviews | Once per contact ever; recurring → only after Nth visit |
| Missed-call guardrails | 12-hour de-dupe, suppression list |
| Data isolation | A user from org A gets nothing back when querying org B's rows |

---

## 10. Decisions made (2026-09-29)

1. **Default phone setup:** "keep your number" (forward unanswered calls to the Twilio number). "New number" stays available as an option.
2. **Billing:** pilot customers are invoiced by hand until Stripe is added in M10.
3. **LLC, EIN and domain:** come later, after the founder has seen the whole prototype. Consequences:
   - Carrier (A2P) registration can't start yet, so real texting to the public waits.
   - M1 adds a **texting simulator**: a screen that fakes an incoming call or text and shows what the app would send, so every feature can be built and demoed without Twilio approval. A Twilio trial account can also be used to text *your own verified phone numbers* for live testing.
   - Until there's a domain, the app runs on a free `*.vercel.app` address.
4. **Team:** owner + office manager roles only. Crew-lead logins can come later.
