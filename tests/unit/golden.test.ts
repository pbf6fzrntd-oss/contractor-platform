/**
 * GOLDEN TESTS: a snapshot of how the app behaves for today's home-service
 * businesses (trades and lawn care) before the industry modules program.
 *
 * If one of these fails, a change altered existing behavior. That's only OK
 * when the founder asked for it: then update the snapshot on purpose with
 * `npx vitest run -u tests/unit/golden.test.ts` and say why in the commit.
 */
import { describe, expect, it } from "vitest";
import { buildAgentServer, type AgentContext } from "@/lib/agent/server";
import { ACCESS_LEVELS, type AccessLevel } from "@/lib/agent/oauth";
import { addComplianceFooter, automatedSendWindow, checkSendPolicy, MARKETING_WINDOW, SERVICE_NOTICE_WINDOW } from "@/lib/automation/compliance";
import { CAMPAIGN_TEMPLATES } from "@/lib/automation/campaigns";
import { BUSINESS_TYPE_INFO, BUSINESS_TYPES, type BusinessType } from "@/lib/business-types";
import { hasFeature, type Plan, type PlanFeature } from "@/lib/entitlements";
import { LEAD_STAGES, stageLabel } from "@/lib/leads/stages";
import { BLOCK_REASON_TEXT } from "@/lib/messaging/gate";
import { buildNavigation, canVisit, homePath } from "@/lib/navigation";
import type { Org } from "@/lib/org";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { DEFAULT_TEMPLATES, defaultTemplatesFor, TEMPLATE_VARIABLES, templateTitle } from "@/lib/templates/defaults";
import { CORE, PILOT } from "./plans";

const PLANS: Record<string, Plan> = { pilot: PILOT, core: CORE };
/** The plan switches that existed before the modules program (new ones are additive). */
const ORIGINAL_FEATURES: PlanFeature[] = ["recurring_customers", "bulk_messaging", "campaigns"];
const PATHS = ["/today", "/inbox", "/inbox/abc", "/customers", "/customers/new", "/campaigns", "/dashboard", "/settings", "/settings/assistants", "/simulator"];

function fakeOrg(businessType: BusinessType): Org {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Golden Co",
    business_type: businessType,
    timezone: "America/New_York",
    default_language: "en",
    alert_phone: null,
    google_review_url: null,
    settings: {},
    plan_id: "pilot",
    created_at: "2026-09-29T00:00:00Z",
    updated_at: "2026-09-29T00:00:00Z",
  } as Org;
}

/** Names of the tools an AI assistant sees, without calling any of them. */
function toolNames(businessType: BusinessType, plan: Plan, access: AccessLevel): string[] {
  const ctx = { db: {} as AgentContext["db"], org: fakeOrg(businessType), plan, keyId: "k", access, userId: null } as AgentContext;
  const server = buildAgentServer(ctx) as unknown as { _registeredTools: Record<string, unknown> };
  return Object.keys(server._registeredTools).sort();
}

describe("golden: today's behavior for home-service businesses", () => {
  for (const type of BUSINESS_TYPES) {
    for (const [planName, plan] of Object.entries(PLANS)) {
      it(`menus for ${type} on ${planName}`, () => {
        expect({
          navigation: buildNavigation(type, plan),
          home: homePath(type, plan),
          canVisit: Object.fromEntries(PATHS.map((p) => [p, canVisit(p, type, plan)])),
        }).toMatchSnapshot();
      });

      it(`AI assistant tools for ${type} on ${planName}`, () => {
        expect(Object.fromEntries(ACCESS_LEVELS.map((a) => [a, toolNames(type, plan, a)]))).toMatchSnapshot();
      });
    }

    it(`stage words and label for ${type}`, () => {
      expect({ info: BUSINESS_TYPE_INFO[type], stages: LEAD_STAGES.map((s) => stageLabel(type, s)) }).toMatchSnapshot();
    });

    it(`starting templates for ${type}`, () => {
      expect(defaultTemplatesFor(type)).toMatchSnapshot();
      expect(Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.key, templateTitle(t.key, type)]))).toMatchSnapshot();
    });
  }

  it("plan switches", () => {
    expect(Object.fromEntries(Object.entries(PLANS).map(([n, p]) => [n, ORIGINAL_FEATURES.map((f) => [f, hasFeature(p, f)])]))).toMatchSnapshot();
  });

  it("automation defaults, placeholders, campaigns", () => {
    expect({ DEFAULT_SETTINGS, TEMPLATE_VARIABLES, CAMPAIGN_TEMPLATES }).toMatchSnapshot();
  });

  it("texting rules", () => {
    const consent = (o: Partial<{ opted_out_at: string | null; marketing_consent_at: string | null }>) => ({
      opted_out_at: null,
      marketing_consent_at: null,
      ...o,
    });
    expect({
      windows: { MARKETING_WINDOW, SERVICE_NOTICE_WINDOW },
      automated: ["conversational", "informational", "marketing"].map((c) => automatedSendWindow(c as never, DEFAULT_SETTINGS)),
      policy: [
        checkSendPolicy("informational", consent({})),
        checkSendPolicy("marketing", consent({})),
        checkSendPolicy("marketing", consent({ marketing_consent_at: "x" })),
        checkSendPolicy("conversational", consent({ opted_out_at: "x" })),
        checkSendPolicy("conversational", consent({ opted_out_at: "x" }), "opt_out_confirmation"),
      ],
      footers: [
        addComplianceFooter("Hi", { category: "conversational", isFirstMessage: true, language: "en" }),
        addComplianceFooter("Hi", { category: "conversational", isFirstMessage: false, language: "en" }),
        addComplianceFooter("Hola", { category: "marketing", isFirstMessage: false, language: "es" }),
      ],
      blockReasons: BLOCK_REASON_TEXT,
    }).toMatchSnapshot();
  });
});
