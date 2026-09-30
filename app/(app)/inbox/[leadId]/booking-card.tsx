import Link from "next/link";
import type { AppContext } from "@/lib/auth/context";
import { bookingWhen, loadBookingData, openingsOn } from "@/lib/services/booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDateString } from "@/lib/time";
import { bookForLead } from "./booking-actions";
import { BookForm } from "./book-button";

/**
 * "Book a visit" on a lead (only when the business turned booking on).
 * Picking a service and day reloads the page with the openings; tapping one books it.
 */
export async function BookingCard({ ctx, leadId, contactId, service, day, booked }: { ctx: AppContext; leadId: string; contactId: string; service?: string; day?: string; booked?: boolean }) {
  const { org } = ctx;
  const supabase = await createClient();
  const today = localDateString(new Date(), org.timezone);
  const [{ data: services }, { data: upcoming }, { data: subjects }] = await Promise.all([
    supabase.from("service_catalog").select("id, name, booking_mode, required_documents").eq("org_id", org.id).eq("active", true).neq("booking_mode", "recurring").order("sort_order").order("name"),
    supabase.from("bookings").select("id, mode, status, starts_at, ends_at, check_in, check_out, service_date, service_id").eq("org_id", org.id).eq("contact_id", contactId).gte("service_date", addDays(today, -1)).in("status", ["requested", "pending_approval", "confirmed", "in_progress"]).order("starts_at"),
    supabase.from("subjects").select("id, label").eq("org_id", org.id).eq("contact_id", contactId).is("archived_at", null),
  ]);
  const chosen = (services ?? []).find((s) => s.id === service);
  const date = day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= today ? day : today;
  const data = chosen ? await loadBookingData(createAdminClient(), org, date, addDays(date, 1)) : null;
  const fullService = chosen && data?.services.find((s) => s.id === chosen.id);
  const openings = fullService && data ? openingsOn(data, fullService, date, org, new Date().getTime()) : [];
  const action = chosen ? bookForLead.bind(null, leadId, chosen.id) : null;
  const time = (ms: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: org.timezone }).format(new Date(ms));
  const subjectChoices = (subjects ?? []).map((s) => ({ id: s.id, label: `For: ${s.label}` }));

  return (
    <details className="card mb-4" open={Boolean(service) || booked}>
      <summary className="cursor-pointer font-semibold">
        {(upcoming ?? []).length ? `Booked: ${bookingWhen(upcoming![0], org.timezone)}` : "Book a visit"}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {booked && <p role="status" className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">Booked. It&apos;s on the Schedule.</p>}
        {(upcoming ?? []).length > 0 && (
          <ul className="text-sm">
            {upcoming!.map((b) => (
              <li key={b.id}>
                📅 {bookingWhen(b, org.timezone)} · {(services ?? []).find((s) => s.id === b.service_id)?.name ?? "Visit"}
                {b.status === "pending_approval" ? " (needs your OK)" : ""}
              </li>
            ))}
          </ul>
        )}
        {(services ?? []).length === 0 ? (
          <p className="text-sm text-slate-600">
            No services set up yet. <Link href="/settings/booking" className="text-brand-700 underline">Add services</Link>
          </p>
        ) : (
          <form method="get" className="grid grid-cols-2 gap-2">
            <select name="book" className="input col-span-2" defaultValue={chosen?.id ?? ""} aria-label="Service">
              <option value="" disabled>Pick a service</option>
              {(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" name="day" className="input" defaultValue={date} min={today} aria-label="Day" />
            <button type="submit" className="btn-secondary">See times</button>
          </form>
        )}
        {chosen && action && chosen.booking_mode === "multi_day_reservation" && (
          <BookForm action={action} fields={{}} label="Book this stay" subjects={subjectChoices}>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Check-in<input type="date" name="check_in" className="input" defaultValue={date} min={today} required /></label>
              <label className="text-sm">Check-out<input type="date" name="check_out" className="input" defaultValue={addDays(date, 1)} min={addDays(today, 1)} required /></label>
            </div>
          </BookForm>
        )}
        {chosen && action && chosen.booking_mode !== "multi_day_reservation" && (
          openings.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing open that day. Try another day.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {openings.slice(0, 16).map((o) =>
                o.kind === "day" ? (
                  <BookForm key={o.date} action={action} fields={{ date: o.date }} label={`Book this day (${o.left} left)`} subjects={chosen.required_documents.length ? subjectChoices : undefined} />
                ) : (
                  <BookForm
                    key={o.startMs}
                    action={action}
                    fields={{ start_ms: String(o.startMs) }}
                    label={o.kind === "window" ? `${o.label} (${o.left} left)` : time(o.startMs)}
                    subjects={chosen.required_documents.length ? subjectChoices : undefined}
                  />
                ),
              )}
            </div>
          )
        )}
      </div>
    </details>
  );
}
