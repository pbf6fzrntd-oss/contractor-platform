# SMS compliance: what the app enforces vs. what you must do

Not legal advice. Have an attorney who knows the TCPA review this before launch.

## Enforced automatically by the app

| Rule | Where it lives |
|---|---|
| Every outgoing text goes through one pipeline that checks all the rules below | `lib/messaging/send.ts` |
| Opted-out contacts get nothing except the single opt-out confirmation (and HELP replies) | `lib/automation/compliance.ts` → `checkSendPolicy` |
| STOP, STOPALL, UNSUBSCRIBE, END, QUIT, REVOKE, OPT OUT, CANCEL + Spanish PARA, PARAR, ALTO, BAJA, DETENER, CANCELAR → opt-out, logged | `lib/automation/keywords.ts`, `lib/services/inbound.ts` |
| "CANCEL" honored as opt-out **and** flagged to the owner (lawn customers may mean "cancel this week") | same |
| Messages that look like opt-outs ("please stop texting me") are flagged for the owner to confirm with one tap (FCC "any reasonable means" rule) | same, plus inbox banner |
| START/UNSTOP/YES/SÍ re-subscribes someone who opted out; HELP/INFO/AYUDA gets business contact info | same |
| When the phone company reports a number unsubscribed (Twilio error 21610), we record the opt-out | `lib/messaging/send.ts` |
| Opt-outs are per business | database design (`contacts.org_id`) |
| Consent history is append-only (who, when, how, evidence); state changes only through `record_consent_event()` | migration M1 |
| "Reply STOP to opt out" on the first text to any contact and on **every** marketing text, in their language | `addComplianceFooter` |
| Marketing (campaigns) only to contacts with recorded **written** consent; the owner sees how many were excluded | `lib/automation/recipients.ts` |
| Marketing only 8am–8pm local; automatic follow-ups and review requests only in business hours (default 9am–7pm) | `lib/automation/compliance.ts`, `lib/automation/outbox.ts` |
| Owner-sent service notices (rain delays) allowed 6am–9pm, with a warning before 7am | same |
| Missed-call text-back: one text, no promotions, not repeated within 12 hours | `lib/automation/missed-call.ts` |
| Texting to the public is off until carrier (A2P) registration is marked approved | `lib/messaging/send.ts` → `loadSendingContext` |
| Imports and manually added customers require the owner to confirm service-text consent; marketing consent requires choosing how it was given | Customers → Add / Import |
| AI assistants (MCP) send texts only through the same pipeline; bulk texts and campaigns need a preview + confirm; campaigns need the owner's "Everything" level and still only reach customers with written consent; adding a customer requires the owner to confirm service-text consent; every action is logged; texts are labeled "via AI assistant" | `lib/agent/server.ts` |
| Online booking (public page): customer must tick a consent box with the exact wording (business name, frequency, rates, STOP/HELP); the wording is saved in the consent log (`web_form`). A customer's AI agent must affirm the customer agreed (`ai_agent_request`) | `lib/public/consent.ts`, `lib/services/public-booking.ts` |
| Customer's AI agent bookings: the customer must reply YES to a verification text before the request goes to the owner; if they don't, nothing more is sent to that number. Booking reminders are informational, sent in business hours, re-checked before sending, and skipped for opted-out or do-not-auto-text contacts | `lib/services/public-booking.ts`, `lib/services/booking-replies.ts`, `lib/automation/outbox.ts` |
| Service agreement renewal reminders and "service complete" visit texts are informational (about the customer's own plan or visit), business hours, re-checked before sending (skipped if the end date changed or the crew unticked "text the customer"), at most once per reminder or visit. Crew notes, access notes and visit photos are never texted | `modules/recurring-home/agreements.ts`, `modules/recurring-home/visits.ts`, `lib/automation/outbox.ts` |
| Vaccine record reminders are informational (about the customer's own pet's record), once per record, business hours, re-checked before sending. Photos customers text in go to private storage only (never AI assistants, public pages or texts) | `lib/services/daily.ts`, `lib/services/inbound-media.ts` |
| Booking texts (received / confirmed / declined / canceled / expired) are informational, about the customer's own request, and go through the same pipeline (opt-outs honored; people who opted out aren't re-subscribed by booking) | `lib/services/approvals.ts` |
| Private details (gate codes, access notes, VINs, pet behavior/care notes, uploaded files) never appear in texts, AI answers or public pages; mobile vet: scheduling and intake only, no medical records or advice | `lib/subjects/fields.ts` (`shareableSubject`), `public_business_profile()`, industry voice rules |
| Public profile, booking page and agent connection are rate limited per visitor and business; IPs stored only as salted hashes | `lib/public/rate-limit.ts` |
| Public privacy policy (with required "no sharing of mobile information" language), terms, and SMS terms (frequency, rates, STOP/HELP) | `/privacy`, `/terms`, `/sms-terms` |

## Your to-do list

1. **Company:** form your LLC and get an EIN. You need both for your own A2P brand as the software provider, for Stripe, and to look legitimate to carriers.
2. **Legal pages:** set `NEXT_PUBLIC_LEGAL_COMPANY_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL` and `NEXT_PUBLIC_LEGAL_ADDRESS`, then have an attorney review `/privacy`, `/terms` and `/sms-terms`.
3. **Attorney review of consent flows**, especially:
   - wording for customers' service agreements or web forms that capture **written** marketing consent;
   - whether a one-time "Reply YES to get seasonal offers" request is acceptable for your use;
   - South Carolina Telephone Privacy Protection Act requirements (solicitation hours and identification).
4. **Carrier registration for each customer business** (Settings → Carrier registration, then Admin → copy into the Twilio console). Register each campaign as **Mixed** (customer care + marketing) for lawn businesses.
5. **Twilio opt-out settings:** keep Twilio's default opt-out handling on. The app mirrors it and doesn't double-reply to standard English keywords.
6. **Spanish:** have a native speaker review every Spanish template before launch.
7. **Online booking consent:** have your attorney review the booking consent wording (`lib/public/consent.ts`) and the AI-agent attestation. Consider whether bookings made by a customer's AI agent need a follow-up "reply YES to confirm" text before any non-booking texts.
8. **Record keeping:** don't delete contacts who opted out. The consent log is your evidence if a complaint comes in.
