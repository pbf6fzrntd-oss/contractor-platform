import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { BusinessForm } from "./business-form";

export const metadata: Metadata = { title: "Business details" };

export default async function BusinessSettingsPage() {
  const { org, role } = await requireAppContext();
  return (
    <>
      <PageHeader title="Business details" backHref="/settings" />
      <BusinessForm org={org} canEdit={role === "owner"} />
    </>
  );
}
