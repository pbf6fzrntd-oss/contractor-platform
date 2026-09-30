# Launch checklist: what to connect and what to test

All 11 milestones are built. This list covers what's left before a real contractor uses the app: accounts to create, how the pieces connect, what has already been tested, and what can only be tested with real phones, real money or real people.

Legend: ☐ = to do · ✅ = already verified in development

---

## Part 1: Accounts to create

| # | Service | When | What you get | Where it goes |
|---|---|---|---|---|
| 1 | **Supabase** (2 projects: dev, prod) | Now (free) | URL, publishable key, secret key, DB connection string | `.env.local` / Vercel env vars |
| 2 | **Vercel** | Now (free to try; Pro $20/mo before charging) | A public https address | `NEXT_PUBLIC_SITE_URL` |
| 3 | **Twilio** | For real calls/texts | Account SID, Auth Token | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `SMS_PROVIDER=twilio` |
| 4 | **LLC + EIN** | Before your own Twilio brand registration, Stripe and live customers | Legal name, EIN | Twilio, Stripe, legal pages |
| 5 | **Domain name** | Before launch (optional for testing) | e.g. yourapp.com | Vercel domain, `NEXT_PUBLIC_SITE_URL`, Supabase auth URLs |
| 6 | **Resend** (or other SMTP) | Before real sign-ups | SMTP credentials | Supabase → Authentication → Emails |
| 7 | **Stripe** | When you stop invoicing by hand | Secret key, webhook secret, price IDs | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, /admin → Plans |
| 8 | **Attorney** (TCPA/SMS) | Before the first campaign | Reviewed legal pages and consent wording | `/privacy`, `/terms`, `/sms-terms`, templates |
| 9 | **Sentry** (optional) | Before pilots | Error alerts | Not wired in yet: ask me to add it |

## Part 2: Connecting the pieces (in this order)

☐ **A. Database:** create the dev Supabase project → run `npm run db:push` → put the 3 keys in `.env.local` → `npm run dev` → sign up works. *(README §3)*

☐ **B. Security tests against your real database:** set `TEST_DATABASE_URL` to the **dev** project → `npm run test` → all 18 data-isolation tests pass. *(These pass on a stand-in Postgres here; run them once on real Supabase.)*

☐ **C. Deploy to Vercel:** env vars set, prod migrations pushed, Supabase auth redirect URLs include the Vercel/production address, `NEXT_PUBLIC_SITE_URL` set to the public address.

☐ **D. Scheduler:** create the `pg_cron` job (README §5) pointing at `/api/cron/dispatch` with your `CRON_SECRET`. Check: in Supabase, `select * from cron.job_run_details order by start_time desc limit 5;` shows successful runs, and visiting `/api/cron/dispatch` in a browser returns "unauthorized".

☐ **E. Twilio:** `SMS_PROVIDER=twilio` plus keys → Settings → Phone number → Get my business number → in the Twilio console, confirm the number's Voice and Messaging URLs point at your site.

☐ **F. First carrier registration (yours, as a test business):** fill in Settings → Carrier registration → copy from /admin into Twilio → create a Messaging Service, add the number, set incoming to "Defer to sender's webhook" → paste the SIDs into /admin → mark approved once Twilio approves.

☐ **G. Stripe (later):** products and prices → price IDs in /admin → webhook endpoint → customer portal on → buy a plan in test mode.

☐ **H. Email:** custom SMTP in Supabase; "Confirm email" ON in prod; test sign-up confirmation and password reset emails arrive and their links work.

## Part 3: What's already been tested (you don't need to redo these)

**Automated tests: 202 business-rule tests + 18 database security tests, all passing.** They cover:
✅ Follow-up timing (days 2/5/10 at 10am, late-night sends, daylight saving, custom days) · ✅ every follow-up stop condition (won, lost, re-sent estimate, customer replied, opted out, do-not-autotext) · ✅ STOP/HELP/START in English and Spanish, CANCEL flagging, "please stop texting me" detection · ✅ opt-out footer rules · ✅ marketing consent and 8am–8pm window · ✅ missed-call 12-hour guardrail · ✅ review once-only and Nth-visit rules · ✅ weekly/biweekly/every-4-weeks schedules, pauses, rain-delay moves · ✅ bulk-send and campaign recipient selection · ✅ CSV import parsing · ✅ dashboard and churn math · ✅ Stripe status mapping · ✅ Twilio signature check (against Twilio's own reference value) · ✅ one business can't see or change another's data; office managers can't change owner-only settings.

**Click-through tests on a phone-sized screen**, against a local stand-in for Supabase (the same open-source auth + database pieces Supabase runs), in simulator mode, on a production build with a fresh database:
✅ Sign up → onboarding (both business types) → correct menus
✅ Team invite link → manager joins → can't edit business; reused link rejected; removed member loses access
✅ Get a number → missed call → instant text-back + owner alert → second call within 12h not re-texted
✅ STOP → confirmation + opted out + composer disabled · AYUDA → Spanish help reply
✅ Inbox, reply (New → Contacted automatically), add lead by hand
✅ Template editor (typo caught) · estimate sent → 3 follow-ups scheduled → sent → customer reply stops the rest
✅ Job done → review request once; second job says "already asked"; missing review link explained
✅ Dashboard numbers for both business types
✅ Add customer, CSV import (bad row explained), pause with auto-resume, cancel with reason
✅ Rain delay: 3 taps, texts in each customer's language, visits move to the new day · mark day complete → visits recorded
✅ Campaign: only consented customers, excluded count shown, "YES" reply → campaign lead in the inbox
✅ Stripe webhook: signed event switches plan; cancellation stops texting; forged event rejected
✅ Carrier registration form → admin approves → owner sees "texting is on"; non-admins get "not found" at /admin
✅ Twilio webhooks: forged request rejected (403), duplicate delivery ignored, spoken greeting + missed-call handling, delivery status updates
✅ One-tap connect, tested with the official MCP library's own sign-in functions: discovery from a 401, app registration, owner login → Allow (with access level), PKCE-checked code exchange, code reuse refused, token refresh (old token stops working), Disconnect locks the app out
✅ Full owner coverage: add customer (refused without consent confirmation), pause/resume, running-late preview → send, campaign preview (consented customers only) → schedule → cancel, wording change (refuses dropping the business name), settings change (refuses out-of-range values), cancel follow-ups, update contact
✅ AI assistant (MCP), tested with the official MCP client: keys created in Settings; overview, leads, conversations, schedule, customers; reply marked "via AI assistant" and New→Contacted; stage change schedules follow-ups; job done schedules review; rain delay preview → confirm → texts sent and visits moved; read-only keys can't see action tools; missing/fake keys rejected (401); every call logged

**Industry modules program (M14–M22):** click-through tested on the same local setup:
✅ Industry picker at sign-up, tailored wording, "questions to ask" on leads
✅ Office manager connects their own AI tool (capped), which stops working when they're removed
✅ Sales audit of a sample website (blocked AI crawler, missing booking and generic type detected), printable report
✅ Property record with private gate code and photo; fake photo refused; signed links expire; AI assistant never sees the code
✅ Booking from a lead, full windows disappear, AI assistant books, "Done" records the job
✅ Approval rules hold bookings; confirm/decline with texts
✅ Plans and add-ons through signed Stripe test events (Agent Ready on/off, Executive, canceled)
✅ Public profile with schema.org data, online booking with consent → "We got your request" text (with STOP) → owner confirms → "You're booked" text; customers' AI agent books; another business's services refused; no private data in any public output; rate limits

## Part 4: What needs a live test (real phones, money, people)

Do these with 2 phones (yours + a friend's) once Twilio is connected.

**Calls and texts**
- ☐ "Keep your number": dial the carrier forwarding code shown in Settings → Phone number (Verizon `*71…`, AT&T/T-Mobile `**004*1…#`) → call your cell from another phone and let it ring out → the text arrives in under 60 seconds. *(The codes vary by carrier and plan, so test on each carrier your customers use.)*
- ☐ Caller ID survives forwarding (the text goes to the caller, not to your own cell). Some carriers replace it; if so, "new number" mode is the fallback.
- ☐ "New number" mode: call the business number → your cell rings → pressing 1 connects; letting voicemail answer (not pressing 1) counts as missed and texts the caller.
- ☐ Customer replies land in the inbox within a few seconds; the owner alert text reaches your cell with a working link.
- ☐ Twilio's own STOP reply + our opt-out: only one confirmation arrives (Twilio sends it for English keywords; ours is only for Spanish ones).
- ☐ Delivery status shows "delivered" in the conversation.
- ☐ Spanish texts with accents display correctly on iPhone and Android.
- ☐ Rain delay to ~20 real numbers: all arrive within a minute or two.

**Scheduler (needs real time to pass)**
- ☐ With a short follow-up setting (e.g. 1 day), a real follow-up arrives the next day at 10am without using the simulator.
- ☐ A review request arrives ~2 hours after "Job done".
- ☐ A campaign scheduled for tomorrow 10am goes out then, and not at night.

**Phones and browsers**
- ☐ iPhone Safari and Android Chrome: log in, Add to Home Screen, and it opens like an app with the icon.
- ☐ Bottom menu and Send buttons aren't hidden behind the iPhone home bar.
- ☐ Try it with work gloves and in bright sun (big buttons, contrast).

**Money**
- ☐ Stripe test mode: buy a plan → plan changes; failed card → "past due" but texting continues; cancel in the portal → texting stops.
- ☐ Switch to live keys only after a full test-mode run.

**AI assistant (MCP)**
- ☐ Connect a real assistant app to the deployed `/api/mcp` with a key (Claude Code or another MCP-capable app) and try: "any new leads?", "reply to …", "rain delay today to tomorrow". Confirm it asks before sending.
- ☐ Decide whether AI access is included in every plan or only higher plans (it's on for all plans now).
- ☐ One-tap connect from inside the Claude and ChatGPT apps (add a custom connector with `https://YOUR-DOMAIN/api/mcp`): log in, tap Allow, then ask it to do real work. Each app's connector rules change often. If one refuses, check its current requirements (for example, some need the site on https with a real domain).
- ☐ Try each access level once (Read only / Read and act / Everything) and confirm the assistant can't do more than its level.

**Agent Ready (after deploy, with a real domain)**
- ☐ Supabase → Storage: the `private-files` bucket exists and is **not public**. Upload a photo from a phone on cell service and open it.
- ☐ Turn on a pilot's public profile, paste `https://YOUR-DOMAIN/b/<slug>` into Google's Rich Results Test and fix anything it flags.
- ☐ Add `https://YOUR-DOMAIN/api/agent/<slug>` as a custom connector in ChatGPT or Claude (as a "customer") and ask it to book a visit. Confirm the owner gets the request and the customer gets texts.
- ☐ Book from the public page on iPhone and Android; check the consent checkbox wording with your attorney.
- ☐ Twilio Messaging Service → Advanced Opt-Out: remove **YES** from the opt-in keywords (customers reply YES to confirm an AI agent's booking; keep START/UNSTOP for re-subscribing).
- ☐ A real booking reminder arrives at 5pm the day before; reply C and R from a real phone.
- ☐ Run 3–5 sales audits on real Charleston/Summerville businesses and sanity-check the scores.

**People**
- ☐ Native Spanish speaker reviews every Spanish template (Settings → Message templates → Spanish).
- ☐ Attorney reviews the legal pages and consent wording (see `docs/COMPLIANCE.md`).
- ☐ 2–3 pilot contractors (at least one roofer/HVAC and one lawn company) use it for 2 weeks; watch for confusing screens.
- ☐ Ask a lawn company when they actually sell aeration/overseeding in the Lowcountry (warm-season grasses differ from the "fall aeration" playbook) and adjust campaign timing.

## Part 5: Known limits and next decisions

1. **Carrier registration is manual in Twilio** (by design for your first ~10 customers). Automating it through Twilio's API is the next step once the manual process is clear.
2. **One Twilio account for all businesses** (no per-business sub-accounts yet). Fine for pilots; sub-accounts make per-customer billing and suspension cleaner later.
3. **One business per login in the UI.** The data model supports more, but there's no business switcher yet.
4. **Owner alerts** go by text to the owner's cell; there are no push notifications or an in-app notification list yet.
5. **No voicemail recording**: missed callers hear a short greeting and get the text. Voicemail-to-inbox would be a small addition.
6. **Crew-lead logins** aren't built (only owner and office manager), as you decided.
7. **Error alerts (Sentry)** aren't wired in; errors go to Vercel logs.
8. **Phone-only**: there's no desktop-optimized layout (it works on desktop, just narrow).
9. The end-to-end click-through scripts I used live outside the repo. I can turn them into a maintained automated test suite (Playwright) that runs on every change.
