# Pricing (suggested, value-based)

Status: **suggestion for the founder**, 2026-09-29. Prices live in the database (`plans` table) and can be changed any time in /admin → Plans. Stripe prices are created by you in the Stripe dashboard (see README §Stripe).

## What the market charges (checked September 2026)

| Product | What it does | Price |
|---|---|---|
| [Podium](https://www.capterra.com/p/164285/Podium/pricing/) | Texting inbox + reviews | $399/mo Core, $599/mo Pro, annual contract |
| [Housecall Pro](https://costbench.com/software/field-service-management/housecall-pro/) | Field-service software | $59–$299/mo (annual), 1–8 users |
| [Jobber](https://costbench.com/compare/housecall-pro-vs-jobber/) | Field-service software | from ~$19 solo to ~$97+ for a 5-person team |
| [AI receptionists](https://trtc.io/blog/details/ai-receptionist-cost-pricing-guide) | Answer calls with AI | $30–$80 entry, $150–$400 for 300–1,000 minutes |
| Missed-call text-back tools ([example](https://www.capterra.com/p/10043407/MissedCalls/)) | One feature | ~$25–$100/mo |

## The value math a contractor understands

- **Roofer / HVAC:** one extra job saved from a missed call is $500–$15,000. One per quarter pays for a year.
- **Lawn / pest / pool / cleaning:** a recurring customer is worth ~$150/month for 2–3 years (≈ $4,000+). Keeping 1 customer from leaving or winning 1 new one per quarter pays for the plan.
- **Office time:** rain-delay texts, follow-ups and review requests save 3–6 hours a week (≈ $300–$600/month of an office manager's time).

Price at about **10% of the value delivered**, and below Podium so the switch is easy.

## Suggested tiers

| | **Starter** | **Pro** | **Executive** (all AI) | **Enterprise** |
|---|---|---|---|---|
| Monthly | **$149** | **$249** | **$449** | **from $899**, by quote |
| Annual (2 months free) | $1,490/yr | $2,490/yr | $4,490/yr | custom |
| Users | 2 | 5 | 10 | unlimited (fair use) |
| Texts / month | 1,000 | 3,000 | 10,000 | custom |
| Missed-call text-back, inbox, follow-ups, reviews, dashboard | ✓ | ✓ | ✓ | ✓ |
| Recurring customers, rain delay, campaigns | – | ✓ | ✓ | ✓ |
| Owner's AI assistant (Claude/ChatGPT connect) | ✓ | ✓ | ✓ | ✓ |
| **Office managers connect their own AI tools** | – | – | ✓ | ✓ |
| **Agent Ready:** hosted profile, booking page, outside AI agents can book | – | add-on $99 | ✓ | ✓ |
| **Online booking + approval rules** | – | add-on (with Agent Ready) | ✓ | ✓ |
| **Lead-source reports** | – | ✓ | ✓ | ✓ |
| **AI voice line** (when built, M35) | – | – | ✓ incl. 300 min | ✓ custom minutes |
| Industry add-on modules included | – | – | 1 | all |
| Multiple locations, priority onboarding, custom integrations (e.g. shop software) | – | – | – | ✓ |

**Industry add-on modules:** $79/month each (e.g. a lawn company adds Pest & Mosquito). A business's **edition** (Home Services, Recurring Home Services, Project & Quote, Pet Care, Automotive) is included with any tier; extra modules are add-ons.

**Setup fee:** $249, waived on annual plans. Covers phone setup, carrier registration and template review.

**Founding pilots:** keep "Pilot" (everything on, billed by hand). Offer the first 10 paying customers **40% off for life** in exchange for a testimonial and a case study.

## How this maps to the app

- Tiers are rows in `plans`: `core` = Starter, `pro` = Pro, plus the new `executive` and `enterprise` rows (M21). Existing plan IDs don't change, so current businesses are unaffected.
- AI and Agent Ready switches are plan columns (`feature_team_ai`, `feature_agent_ready`, `feature_booking`, `feature_approvals`, `feature_ai_voice`), checked only through `lib/entitlements.ts`.
- Modules and add-ons are rows in `org_modules`, each tied to its own Stripe product.

## Things to test with prospects

1. Does "$449 for everything AI" land better than "$249 + add-ons"? Try both on sales calls.
2. Would lawn companies pay $79 for a Pest & Mosquito add-on, or expect it included?
3. Is annual prepay attractive in winter (the slow season) for lawn companies?
