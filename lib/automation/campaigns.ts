import { MARKETING_WINDOW } from "@/lib/automation/compliance";
import { nextTimeInWindow } from "@/lib/time";

/** Seasonal campaign templates, in the order shown to owners (roughly by season in the Lowcountry). */
export const CAMPAIGN_TEMPLATES = [
  { key: "campaign_spring_cleanup", label: "Spring cleanup", season: "Feb–Mar" },
  { key: "campaign_pine_straw", label: "Pine straw", season: "Feb–Apr, Sep–Oct" },
  { key: "campaign_mulch", label: "Mulch", season: "Mar–May" },
  { key: "campaign_aeration", label: "Aeration", season: "May–Jun (warm-season lawns)" },
  { key: "campaign_overseeding", label: "Overseeding", season: "Sep–Oct" },
  { key: "campaign_leaf_cleanup", label: "Leaf cleanup", season: "Nov–Dec" },
] as const;

/** Campaigns never go out before 8am or after 8pm; a time outside that moves to the next 8am. */
export function campaignSendTime(requested: Date, timezone: string): Date {
  return nextTimeInWindow(requested, timezone, MARKETING_WINDOW);
}

export type CampaignResults = { sent: number; notSent: number; pending: number; replies: number; leads: number; won: number };

export function summarizeCampaign(input: {
  scheduledStatuses: string[];
  /** Contacts who texted back within the attribution window. */
  replyContactIds: string[];
  leadStages: string[];
}): CampaignResults {
  const s = input.scheduledStatuses;
  return {
    sent: s.filter((x) => x === "sent").length,
    pending: s.filter((x) => x === "pending" || x === "processing").length,
    notSent: s.filter((x) => x === "skipped" || x === "failed" || x === "canceled").length,
    replies: new Set(input.replyContactIds).size,
    leads: input.leadStages.length,
    won: input.leadStages.filter((x) => x === "won").length,
  };
}
