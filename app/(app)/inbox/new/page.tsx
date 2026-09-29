import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { NewLeadForm } from "./form";

export const metadata: Metadata = { title: "Add lead" };

export default async function NewLeadPage() {
  const { org } = await requireAppContext("/inbox");
  return (
    <>
      <PageHeader title="Add a lead" subtitle="For referrals, walk-ups or calls you answered." backHref="/inbox" />
      <NewLeadForm defaultLanguage={org.default_language} />
    </>
  );
}
