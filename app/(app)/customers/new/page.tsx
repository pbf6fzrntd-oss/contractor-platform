import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { localDateString } from "@/lib/time";
import { NewCustomerForm } from "./form";

export const metadata: Metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  const { org } = await requireAppContext("/customers");
  return (
    <>
      <PageHeader title="Add a customer" backHref="/customers" />
      <NewCustomerForm defaultLanguage={org.default_language} today={localDateString(new Date(), org.timezone)} />
    </>
  );
}
