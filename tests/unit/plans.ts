import type { Plan } from "@/lib/entitlements";

/** Test plans matching the rows seeded in the foundation migration. */
export const PILOT: Plan = {
  id: "pilot",
  max_users: 3,
  max_phone_numbers: 1,
  monthly_sms_limit: 2000,
  feature_recurring_customers: true,
  feature_bulk_messaging: true,
  feature_campaigns: true,
  feature_team_ai: true,
  feature_agent_ready: true,
  feature_booking: true,
  feature_approvals: true,
  feature_ai_voice: true,
};

export const CORE: Plan = {
  ...PILOT,
  id: "core",
  max_users: 2,
  feature_recurring_customers: false,
  feature_bulk_messaging: false,
  feature_campaigns: false,
  feature_team_ai: false,
  feature_agent_ready: false,
  feature_booking: false,
  feature_approvals: false,
  feature_ai_voice: false,
};
