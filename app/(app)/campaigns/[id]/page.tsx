import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { SubmitButton } from "@/components/submit-button";
import { requireAppContext } from "@/lib/auth/context";
import { summarizeCampaign } from "@/lib/automation/campaigns";
import { CAMPAIGN_ATTRIBUTION_DAYS } from "@/lib/services/conversations";
import { formatUSPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { cancelCampaign } from "../actions";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: PageProps<"/campaigns/[id]">) {
  const { org } = await requireAppContext("/campaigns");
  const { id } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("broadcasts").select("*").eq("id", id).eq("org_id", org.id).eq("kind", "campaign").maybeSingle();
  if (!c) notFound();

  const [{ data: scheduled }, { data: leads }] = await Promise.all([
    supabase.from("scheduled_messages").select("status, contact_id").eq("broadcast_id", id),
    supabase.from("leads").select("id, stage, contact_id, created_at").eq("broadcast_id", id).order("created_at", { ascending: false }),
  ]);
  const recipientIds = [...new Set((scheduled ?? []).map((s) => s.contact_id))];
  const until = new Date(Date.parse(c.scheduled_at) + CAMPAIGN_ATTRIBUTION_DAYS * 86_400_000).toISOString();
  const { data: replies } = recipientIds.length
    ? await supabase
        .from("messages")
        .select("contact_id")
        .eq("org_id", org.id)
        .eq("direction", "inbound")
        .in("contact_id", recipientIds)
        .gte("created_at", c.scheduled_at)
        .lte("created_at", until)
    : { data: [] };
  const { data: leadContacts } = (leads ?? []).length
    ? await supabase.from("contacts").select("id, name, phone").in("id", (leads ?? []).map((l) => l.contact_id))
    : { data: [] };

  const r = summarizeCampaign({
    scheduledStatuses: (scheduled ?? []).map((s) => s.status),
    replyContactIds: (replies ?? []).map((m) => m.contact_id),
    leadStages: (leads ?? []).map((l) => l.stage),
  });
  const excluded = (c.excluded ?? {}) as { no_marketing_consent?: number; opted_out?: number };
  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: org.timezone });
  const upcoming = c.status !== "canceled" && r.pending > 0;
  const nowMs = new Date().getTime();

  return (
    <>
      {upcoming && Date.parse(c.scheduled_at) <= nowMs && <AutoRefresh seconds={5} />}
      <PageHeader
        title={c.name}
        subtitle={c.status === "canceled" ? "Canceled" : upcoming ? `Sending ${fmt.format(new Date(c.scheduled_at))}` : `Sent ${fmt.format(new Date(c.scheduled_at))}`}
        backHref="/campaigns"
      />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile label="Sent" value={String(r.sent)} detail={r.pending ? `${r.pending} still to go` : r.notSent ? `${r.notSent} not sent` : undefined} />
        <StatTile label="Replies" value={String(r.replies)} />
        <StatTile label="New leads" value={String(r.leads)} />
        <StatTile label="Won" value={String(r.won)} />
      </div>
      {(excluded.no_marketing_consent ?? 0) > 0 && (
        <p className="mb-4 text-sm text-slate-600">
          {excluded.no_marketing_consent} customer(s) were left out because there&apos;s no written consent for offers on file.
          Record consent on their customer page to include them next time.
        </p>
      )}
      <section className="card mb-4">
        <p className="mb-1 text-sm font-semibold text-slate-600">Message</p>
        <p className="whitespace-pre-wrap text-[15px]">{c.body_en}</p>
      </section>
      {(leads ?? []).length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 font-semibold">Leads from this campaign</h2>
          <ul className="card divide-y divide-slate-100 p-0">
            {(leads ?? []).map((l) => {
              const ct = (leadContacts ?? []).find((x) => x.id === l.contact_id);
              return (
                <li key={l.id}>
                  <Link href={`/inbox/${l.id}`} className="flex justify-between px-4 py-3">
                    <span className="font-medium">{ct?.name ?? (ct ? formatUSPhone(ct.phone) : "")}</span>
                    <span className="text-sm text-slate-600">{l.stage === "won" ? "Won" : l.stage === "lost" ? "Lost" : "Open"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {upcoming && Date.parse(c.scheduled_at) > nowMs && (
        <form action={cancelCampaign.bind(null, id)}>
          <SubmitButton className="btn-danger w-full" pendingText="Canceling…">Cancel campaign</SubmitButton>
        </form>
      )}
    </>
  );
}
