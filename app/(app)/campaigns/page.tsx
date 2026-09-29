import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  await requireAppContext("/campaigns");
  return (
    <>
      <PageHeader title="Campaigns" subtitle="Seasonal offers: aeration, leaf cleanup, pine straw and more." />
      <ComingSoon milestone="Milestone 8">
        Schedule a seasonal text to your customers. Replies land in your inbox as new leads.
      </ComingSoon>
    </>
  );
}
