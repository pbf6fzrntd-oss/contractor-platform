import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { InboxList, parseStageFilter } from "./inbox-list";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const { org } = await requireAppContext("/inbox");
  const filter = parseStageFilter((await searchParams).stage);

  return (
    <div data-wide className="lg:grid lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:gap-8">
      <AutoRefresh seconds={15} />
      <div>
        <div className="flex items-start justify-between gap-3">
          <PageHeader title="Inbox" />
          <Link href="/inbox/new" className="btn-secondary min-h-10 px-3 text-sm">
            + Add lead
          </Link>
        </div>
        <InboxList org={org} filter={filter} />
      </div>
      {/* Laptops: the right side waits for a conversation to be picked. */}
      <div className="hidden lg:block">
        <div className="card sticky top-8 flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center text-slate-500">
          <p className="text-4xl">💬</p>
          <p className="text-lg font-medium text-slate-700">Pick a conversation</p>
          <p className="max-w-sm text-sm">Missed calls and texts land here, with the automatic text-back already sent.</p>
        </div>
      </div>
    </div>
  );
}
