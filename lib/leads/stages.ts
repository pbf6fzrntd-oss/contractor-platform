import type { BusinessType } from "@/lib/business-types";

/**
 * Automation always works off these five fixed stages. Each business type
 * only changes the words shown on screen.
 */
export const LEAD_STAGES = ["new", "contacted", "estimate_sent", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

const LABELS: Record<BusinessType, Record<LeadStage, string>> = {
  project: {
    new: "New",
    contacted: "Contacted",
    estimate_sent: "Estimate sent",
    won: "Won",
    lost: "Lost",
  },
  recurring: {
    new: "New",
    contacted: "Contacted",
    estimate_sent: "Quote sent",
    won: "Signed up",
    lost: "Lost",
  },
};

export function stageLabel(businessType: BusinessType, stage: LeadStage): string {
  return LABELS[businessType][stage];
}
