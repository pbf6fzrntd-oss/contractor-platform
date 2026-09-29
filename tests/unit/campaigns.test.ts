import { describe, expect, it } from "vitest";
import { campaignSendTime, CAMPAIGN_TEMPLATES, summarizeCampaign } from "@/lib/automation/campaigns";
import { DEFAULT_TEMPLATES } from "@/lib/templates/defaults";

const NY = "America/New_York";

describe("campaign timing", () => {
  it("sends during 8am–8pm as requested", () => {
    const tenAm = new Date("2026-10-01T14:00:00Z");
    expect(campaignSendTime(tenAm, NY)).toEqual(tenAm);
  });
  it("moves a 9pm or 6am request to the next 8am", () => {
    expect(campaignSendTime(new Date("2026-10-02T01:00:00Z"), NY).toISOString()).toBe("2026-10-02T12:00:00.000Z");
    expect(campaignSendTime(new Date("2026-10-01T10:00:00Z"), NY).toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });
});

describe("campaign results", () => {
  it("counts sends, unique replies, leads and wins", () => {
    expect(
      summarizeCampaign({
        scheduledStatuses: ["sent", "sent", "skipped", "pending"],
        replyContactIds: ["a", "a", "b"],
        leadStages: ["new", "won"],
      }),
    ).toEqual({ sent: 2, notSent: 1, pending: 1, replies: 2, leads: 2, won: 1 });
  });
});

describe("campaign templates", () => {
  it("every offer on the campaign screen has a default marketing template", () => {
    for (const t of CAMPAIGN_TEMPLATES) {
      const def = DEFAULT_TEMPLATES.find((d) => d.key === t.key);
      expect(def?.category, t.key).toBe("marketing");
    }
  });
});
