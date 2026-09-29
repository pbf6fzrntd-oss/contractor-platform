import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const { org } = await requireAppContext("/campaigns");
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("broadcasts")
    .select("id, name, status, scheduled_at, recipient_count")
    .eq("org_id", org.id)
    .eq("kind", "campaign")
    .order("scheduled_at", { ascending: false })
    .limit(50);
  const ids = (campaigns ?? []).map((c) => c.id);
  const { data: leads } = ids.length
    ? await supabase.from("leads").select("broadcast_id, stage").in("broadcast_id", ids)
    : { data: [] };
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: org.timezone });
  const now = Date.now();

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <PageHeader title="Campaigns" subtitle="Seasonal offers to customers who agreed to get them." />
        <Link href="/campaigns/new" className="btn-primary min-h-10 shrink-0 px-3 text-sm">+ New</Link>
      </div>
      {(campaigns ?? []).length === 0 ? (
        <div className="card text-center text-slate-600">
          <p>No campaigns yet.</p>
          <p className="mt-1 text-sm">Try pine straw or aeration: replies show up in your inbox as new leads.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100 p-0">
          {(campaigns ?? []).map((c) => {
            const theirs = (leads ?? []).filter((l) => l.broadcast_id === c.id);
            const upcoming = c.status === "scheduled" && Date.parse(c.scheduled_at) > now;
            return (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-sm text-slate-600">
                      {c.status === "canceled" ? "Canceled" : upcoming ? `Scheduled ${fmt.format(new Date(c.scheduled_at))}` : `Sent ${fmt.format(new Date(c.scheduled_at))}`} · {c.recipient_count} customers
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <span className="block font-semibold">{theirs.length} leads</span>
                    <span className="block text-slate-500">{theirs.filter((l) => l.stage === "won").length} won</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
