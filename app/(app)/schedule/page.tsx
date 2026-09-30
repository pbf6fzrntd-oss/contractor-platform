import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireAppContext } from "@/lib/auth/context";
import { bookingOn } from "@/lib/entitlements";
import { formatUSPhone } from "@/lib/phone";
import { bookingWhen } from "@/lib/services/booking";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDateString } from "@/lib/time";
import { changeBookingStatus } from "./actions";

export const metadata: Metadata = { title: "Schedule" };

const STATUS: Record<string, { label: string; className: string }> = {
  requested: { label: "Requested", className: "bg-amber-100 text-amber-900" },
  pending_approval: { label: "Needs your OK", className: "bg-amber-100 text-amber-900" },
  confirmed: { label: "Confirmed", className: "bg-brand-50 text-brand-800" },
  in_progress: { label: "In progress", className: "bg-blue-50 text-blue-800" },
  completed: { label: "Done", className: "bg-slate-100 text-slate-600" },
  no_show: { label: "No-show", className: "bg-red-50 text-red-800" },
  canceled: { label: "Canceled", className: "bg-slate-100 text-slate-500 line-through" },
};
const SOURCE: Record<string, string> = { owner: "", team: "", customer_link: "Booked online", ai_assistant: "Via AI assistant", outside_agent: "Via customer's AI agent", voice: "Via phone assistant" };

export default async function SchedulePage() {
  const { org, plan, modules } = await requireAppContext();
  if (!bookingOn(org, plan, modules)) redirect("/settings/booking");
  const today = localDateString(new Date(), org.timezone);
  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("org_id", org.id)
    .or(`and(service_date.gte.${today},service_date.lte.${addDays(today, 14)}),and(check_out.gt.${today},check_in.lte.${today}),status.in.(requested,pending_approval)`)
    .order("starts_at")
    .limit(300);
  const list = bookings ?? [];
  const [{ data: contacts }, { data: services }, { data: subjects }, { data: resources }, { data: approvals }] = await Promise.all([
    supabase.from("contacts").select("id, name, phone").in("id", [...new Set(list.map((b) => b.contact_id))]),
    supabase.from("service_catalog").select("id, name").eq("org_id", org.id),
    supabase.from("subjects").select("id, label").in("id", list.map((b) => b.subject_id).filter((x): x is string => Boolean(x))),
    supabase.from("resources").select("id, name").eq("org_id", org.id),
    supabase.from("approval_requests").select("booking_id, reasons").eq("org_id", org.id).eq("status", "pending"),
  ]);
  const reasons = new Map((approvals ?? []).map((a) => [a.booking_id, a.reasons]));
  const name = <T extends { id: string }>(rows: T[] | null, id: string | null, pick: (r: T) => string) => (id ? (rows?.find((r) => r.id === id) ? pick(rows.find((r) => r.id === id)!) : null) : null);
  const waiting = list.filter((b) => b.status === "requested" || b.status === "pending_approval");
  const days = new Map<string, typeof list>();
  for (const b of list.filter((x) => !waiting.includes(x))) days.set(b.service_date, [...(days.get(b.service_date) ?? []), b]);
  const dayTitle = (d: string) =>
    d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

  const Row = ({ b }: { b: (typeof list)[number] }) => {
    const c = contacts?.find((x) => x.id === b.contact_id);
    const s = STATUS[b.status];
    const actions: [string, string, string][] =
      b.status === "requested" || b.status === "pending_approval"
        ? [["confirm", "Confirm", "btn-primary"], ["cancel", "Decline", "btn-secondary"]]
        : b.status === "confirmed" || b.status === "in_progress"
          ? [["complete", "Done", "btn-primary"], ["no_show", "No-show", "btn-secondary"], ["cancel", "Cancel", "btn-secondary"]]
          : [];
    return (
      <li className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-medium">{bookingWhen(b, org.timezone)}</span>
            <span className="block text-sm text-slate-700">
              {name(services, b.service_id, (x) => x.name) ?? "Visit"}
              {b.subject_id ? ` · ${name(subjects, b.subject_id, (x) => x.label)}` : ""}
              {b.resource_id ? ` · ${name(resources, b.resource_id, (x) => x.name)}` : ""}
            </span>
            <span className="block text-sm text-slate-600">
              {b.lead_id ? <Link href={`/inbox/${b.lead_id}`} className="text-brand-700 underline">{c?.name ?? (c ? formatUSPhone(c.phone) : "Customer")}</Link> : (c?.name ?? (c ? formatUSPhone(c.phone) : "Customer"))}
              {SOURCE[b.source] ? ` · ${SOURCE[b.source]}` : ""}
            </span>
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>
        </div>
        {reasons.get(b.id)?.length ? <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900">Why: {reasons.get(b.id)!.join(" · ")}</p> : null}
        {actions.length > 0 && (
          <div className="flex gap-2">
            {actions.map(([a, label, cls]) => (
              <form key={a} action={changeBookingStatus.bind(null, b.id, a as "confirm")} className="flex-1">
                <SubmitButton className={`${cls} min-h-11 w-full px-2 text-sm`} pendingText="…">{label}</SubmitButton>
              </form>
            ))}
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Schedule" subtitle="Bookings for the next two weeks." />
      {waiting.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-800">Waiting for you ({waiting.length})</h2>
          <ul className="card divide-y divide-slate-100 p-0">{waiting.map((b) => <Row key={b.id} b={b} />)}</ul>
        </section>
      )}
      {days.size === 0 && waiting.length === 0 && (
        <p className="card text-slate-600">Nothing booked yet. Open a lead and tap &quot;Book a visit&quot;.</p>
      )}
      {[...days.entries()].map(([d, items]) => (
        <section key={d} className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">{dayTitle(d)}</h2>
          <ul className="card divide-y divide-slate-100 p-0">{items.map((b) => <Row key={b.id} b={b} />)}</ul>
        </section>
      ))}
    </>
  );
}
