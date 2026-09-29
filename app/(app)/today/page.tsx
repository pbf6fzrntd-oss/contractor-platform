import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { selectNoticeRecipients } from "@/lib/automation/recipients";
import { isScheduledOn } from "@/lib/automation/schedule";
import { loadRecipientData } from "@/lib/services/broadcasts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDateString } from "@/lib/time";
import { CompleteDayButton } from "./complete-day";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const { org } = await requireAppContext("/today");
  const params = await searchParams;
  const today = localDateString(new Date(), org.timezone);
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const sentId = typeof params.sent === "string" ? params.sent : null;

  // Recipient data is read with the admin client, scoped to this business.
  const data = await loadRecipientData(createAdminClient(), org.id);
  const contactById = new Map(data.contacts.map((c) => [c.id, c]));
  const scheduled = data.services.filter((s) => isScheduledOn(s, date, data.moves));
  const movedIn = new Set(data.moves.filter((m) => m.to_date === date).map((m) => m.recurring_service_id));
  const textable = selectNoticeRecipients(data.services, data.contacts, date, data.moves);

  const supabase = await createClient();
  const [{ data: visits }, { data: notices }] = await Promise.all([
    supabase.from("jobs").select("recurring_service_id").eq("org_id", org.id).eq("completed_on", date),
    supabase
      .from("broadcasts")
      .select("id, name, recipient_count, created_at")
      .eq("org_id", org.id)
      .eq("kind", "service_notice")
      .eq("service_date", date)
      .order("created_at", { ascending: false }),
  ]);
  const doneIds = new Set((visits ?? []).map((v) => v.recurring_service_id));
  const remaining = scheduled.filter((s) => !doneIds.has(s.id)).length;

  let sentStatus: { sent: number; pending: number; total: number } | null = null;
  if (sentId) {
    const { data: rows } = await supabase.from("scheduled_messages").select("status").eq("broadcast_id", sentId);
    const r = rows ?? [];
    sentStatus = {
      sent: r.filter((x) => x.status === "sent").length,
      pending: r.filter((x) => x.status === "pending" || x.status === "processing").length,
      total: r.length,
    };
  }

  const title = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(date),
  );
  const noticeHref = (type: string) => `/today/notice?type=${type}&date=${date}`;

  return (
    <>
      {sentStatus && sentStatus.pending > 0 && <AutoRefresh seconds={4} />}
      <PageHeader title={date === today ? "Today" : title} subtitle={date === today ? title : undefined} />

      <nav className="-mt-2 mb-4 flex items-center justify-between gap-2" aria-label="Change day">
        <Link href={`/today?date=${addDays(date, -1)}`} className="btn-secondary min-h-10 px-3 text-sm">← Prev</Link>
        {date !== today && <Link href="/today" className="text-sm font-medium text-brand-700">Back to today</Link>}
        <Link href={`/today?date=${addDays(date, 1)}`} className="btn-secondary min-h-10 px-3 text-sm">Next →</Link>
      </nav>

      {sentStatus && (
        <p role="status" className="mb-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
          {sentStatus.pending > 0
            ? `Sending… ${sentStatus.sent} of ${sentStatus.total} sent`
            : `✓ Sent to ${sentStatus.sent} customer${sentStatus.sent === 1 ? "" : "s"}`}
          {sentStatus.total - sentStatus.sent - sentStatus.pending > 0 &&
            ` (${sentStatus.total - sentStatus.sent - sentStatus.pending} not sent. Check the conversation for why.)`}
        </p>
      )}

      <div className="mb-3 flex flex-col gap-2">
        <Link href={noticeHref("rain_delay")} className="btn-primary min-h-14 text-lg">
          🌧 Rain delay: text {textable.recipients.length} customer{textable.recipients.length === 1 ? "" : "s"}
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Link href={noticeHref("running_late")} className="btn-secondary text-sm">Running late</Link>
          <Link href={noticeHref("custom")} className="btn-secondary text-sm">Custom message</Link>
        </div>
      </div>

      {(notices ?? []).length > 0 && (
        <ul className="mb-3 text-sm text-slate-600">
          {(notices ?? []).map((n) => (
            <li key={n.id}>
              ✉ {n.name} sent to {n.recipient_count} ·{" "}
              {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: org.timezone }).format(new Date(n.created_at))}
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">
          {scheduled.length} scheduled{remaining < scheduled.length ? ` · ${scheduled.length - remaining} done` : ""}
        </h2>
        {scheduled.length === 0 ? (
          <p className="card text-center text-slate-600">Nobody is scheduled for this day.</p>
        ) : (
          <ul className="card mb-3 divide-y divide-slate-100 p-0">
            {scheduled.map((s) => {
              const c = contactById.get(s.contact_id);
              const done = doneIds.has(s.id);
              return (
                <li key={s.id}>
                  <Link href={`/customers/${s.id}`} className="flex items-center gap-3 px-4 py-3">
                    <span className={`text-lg ${done ? "text-emerald-600" : "text-slate-300"}`} aria-label={done ? "Done" : "Not done"}>
                      {done ? "✓" : "○"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c?.name ?? c?.phone}</span>
                      <span className="block truncate text-sm text-slate-600">
                        {s.service_type}
                        {c?.address ? ` · ${c.address}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {movedIn.has(s.id) && "moved here "}
                      {c?.preferred_language === "es" && "ES "}
                      {c?.opted_out_at && "no texts"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {scheduled.length > 0 && <CompleteDayButton date={date} remaining={remaining} />}
      </section>
    </>
  );
}
