import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireAppContext("/customers");
  return (
    <>
      <PageHeader title="Customers" subtitle="Your recurring service customers." />
      <ComingSoon milestone="Milestone 6">
        Service day, frequency and status for each customer, with pause/cancel and spreadsheet import.
      </ComingSoon>
    </>
  );
}
