import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import customers" };

export default async function ImportPage() {
  const { org } = await requireAppContext("/customers");
  return (
    <>
      <PageHeader title="Import customers" subtitle="Bring in your whole list at once." backHref="/customers" />
      <ImportForm defaultLanguage={org.default_language} />
    </>
  );
}
