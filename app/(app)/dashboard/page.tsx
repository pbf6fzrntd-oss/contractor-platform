import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { org } = await requireAppContext("/dashboard");
  return (
    <>
      <PageHeader title="Dashboard" subtitle={org.name} />
      <ComingSoon milestone="Milestone 5">
        Leads this week, response time, open estimates, win rate and reviews requested.
      </ComingSoon>
    </>
  );
}
