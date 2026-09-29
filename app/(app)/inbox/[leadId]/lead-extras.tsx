import type { AppContext } from "@/lib/auth/context";
import type { Tables } from "@/lib/database.types";

/**
 * Extra panels on the conversation screen: scheduled follow-ups (Milestone 3)
 * and job completion / review requests (Milestone 4).
 */
export async function LeadExtras(_props: { ctx: AppContext; lead: Tables<"leads">; contact: Tables<"contacts"> }) {
  return null;
}
