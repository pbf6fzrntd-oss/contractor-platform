import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireOwner } from "@/lib/auth/context";
import { parseBookingSettings } from "@/lib/booking/settings";
import { money } from "@/lib/format";
import { getIndustry } from "@/lib/industries";
import { createClient } from "@/lib/supabase/server";
import { addIndustryServices, setResourceActive, setServiceActive } from "./actions";
import { AddResourceForm, AddServiceForm, BookingSettingsForm } from "./forms";

export const metadata: Metadata = { title: "Online booking" };

const MODE_LABEL: Record<string, string> = {
  arrival_window: "Arrival window",
  fixed_appointment: "Set time",
  mobile_appointment: "At customer's place",
  day_capacity: "Whole day",
  multi_day_reservation: "Overnight stay",
  package_sessions: "Package session",
};

export default async function BookingSettingsPage() {
  const { org } = await requireOwner();
  const supabase = await createClient();
  const [{ data: services }, { data: resources }] = await Promise.all([
    supabase.from("service_catalog").select("*").eq("org_id", org.id).order("sort_order").order("name"),
    supabase.from("resources").select("*").eq("org_id", org.id).order("name"),
  ]);
  const industry = getIndustry(org.industry);

  return (
    <>
      <PageHeader
        title="Online booking"
        subtitle="Set what customers can book and when. The same rules apply when you, your team, an AI assistant or (soon) customers book."
        backHref="/settings"
      />
      <BookingSettingsForm enabled={org.booking_enabled} settings={parseBookingSettings(org.booking_settings)} />

      <h2 className="mb-2 mt-6 text-lg font-semibold">Services</h2>
      {industry && (
        <form action={addIndustryServices} className="mb-3">
          <SubmitButton className="btn-secondary w-full" pendingText="Adding…">+ Add the usual {industry.label.toLowerCase()} services</SubmitButton>
        </form>
      )}
      {(services ?? []).length > 0 && (
        <ul className="card mb-3 divide-y divide-slate-100 p-0">
          {(services ?? []).map((s) => (
            <li key={s.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${s.active ? "" : "opacity-50"}`}>
              <span className="min-w-0">
                <span className="block font-medium">{s.name}</span>
                <span className="block text-sm text-slate-600">
                  {MODE_LABEL[s.booking_mode] ?? s.booking_mode}
                  {s.booking_mode !== "multi_day_reservation" && s.booking_mode !== "day_capacity" ? ` · ${s.duration_minutes} min` : ""}
                  {s.daily_capacity ? ` · ${s.daily_capacity}/day` : ""}
                  {s.price_from_cents !== null ? ` · ${money(s.price_from_cents)}${s.price_to_cents ? `–${money(s.price_to_cents)}` : "+"}` : ""}
                </span>
                {s.required_documents.length > 0 && <span className="block text-xs text-slate-500">Requires: {s.required_documents.join(", ")}</span>}
              </span>
              <form action={setServiceActive.bind(null, s.id, !s.active)}>
                <SubmitButton className="btn-secondary min-h-10 px-3 text-xs" pendingText="…">{s.active ? "Pause" : "Turn on"}</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <details className="mb-6">
        <summary className="cursor-pointer font-medium text-brand-700">Add a service by hand</summary>
        <div className="mt-2"><AddServiceForm /></div>
      </details>

      <h2 className="mb-1 text-lg font-semibold">People, bays and kennels</h2>
      <p className="mb-2 text-sm text-slate-600">Optional. Add them so two visits never land on the same groomer, bay or technician at once.</p>
      {(resources ?? []).length > 0 && (
        <ul className="card mb-3 divide-y divide-slate-100 p-0">
          {(resources ?? []).map((r) => (
            <li key={r.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${r.active ? "" : "opacity-50"}`}>
              <span>
                <span className="block font-medium">{r.name}</span>
                <span className="block text-sm text-slate-600">
                  {r.kind}
                  {r.unit_class ? ` · ${r.unit_class}` : ""}
                  {r.capacity > 1 ? ` · holds ${r.capacity}` : ""}
                </span>
              </span>
              <form action={setResourceActive.bind(null, r.id, !r.active)}>
                <SubmitButton className="btn-secondary min-h-10 px-3 text-xs" pendingText="…">{r.active ? "Pause" : "Turn on"}</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <AddResourceForm />
    </>
  );
}
