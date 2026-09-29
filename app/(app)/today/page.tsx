import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const { org } = await requireAppContext("/today");
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: org.timezone,
  }).format(new Date());

  return (
    <>
      <PageHeader title="Today" subtitle={today} />
      <button type="button" className="btn-primary mb-4 w-full text-lg" disabled>
        Rain delay: text today&apos;s customers
      </button>
      <ComingSoon milestone="Milestone 7">
        Today&apos;s customers, the one-tap rain delay text, and &quot;mark day complete.&quot;
      </ComingSoon>
    </>
  );
}
