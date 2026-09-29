import "server-only";
import { campaignSendTime } from "@/lib/automation/campaigns";
import type { CampaignAudience } from "@/lib/automation/recipients";
import type { Org } from "@/lib/org";
import { createCampaign } from "@/lib/services/broadcasts";
import type { AdminClient } from "@/lib/supabase/admin";
import { localDateString } from "@/lib/time";

/**
 * Schedules a campaign (8am–8pm only; consented customers only). Shared by
 * the Campaigns screen and the AI assistant. The caller starts sending if
 * `sendAt` has already arrived.
 */
export async function scheduleCampaign(
  db: AdminClient,
  org: Pick<Org, "id" | "timezone">,
  input: {
    name: string;
    templateKey: string | null;
    bodyEn: string;
    bodyEs: string | null;
    audience: CampaignAudience;
    requestedAt: Date;
    userId: string | null;
  },
) {
  const sendAt = campaignSendTime(input.requestedAt, org.timezone);
  const result = await createCampaign(db, org.id, {
    name: input.name,
    templateKey: input.templateKey,
    bodyEn: input.bodyEn,
    bodyEs: input.bodyEs,
    audience: input.audience,
    sendAt,
    today: localDateString(new Date(), org.timezone),
    userId: input.userId,
  });
  return { ...result, sendAt };
}
