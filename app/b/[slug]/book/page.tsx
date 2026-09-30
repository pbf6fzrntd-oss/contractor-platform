import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { priceText } from "@/lib/public/profile";
import { bookingConsentText } from "@/lib/public/consent";
import { loadBookingData, openingsOn } from "@/lib/services/booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, localDateString } from "@/lib/time";
import { getPublicBusiness } from "../data";
import { publicBook } from "./actions";
import { PublicBookingForm, type Choice } from "./form";

export const metadata: Metadata = { title: "Book online", robots: { index: false } };

/** Public booking: pick a service and day, then a time, then your details. */
export default async function PublicBookingPage({ params, searchParams }: PageProps<"/b/[slug]/book">) {
  const { slug } = await params;
  const sp = await searchParams;
  const biz = await getPublicBusiness(slug);
  if (!biz || !biz.profile.booking_available) notFound();
  const { org, profile } = biz;
  const today = localDateString(new Date(), org.timezone);
  const service = profile.services.find((s) => s.id === sp.service);
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day >= today ? sp.day : addDays(today, 1);
  const time = (ms: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: org.timezone }).format(new Date(ms));

  let choices: Choice[] = [];
  if (service && service.booking_mode !== "multi_day_reservation") {
    const data = await loadBookingData(createAdminClient(), org, day, addDays(day, 1));
    const row = data.services.find((s) => s.id === service.id);
    // Only times, windows or "spots left": never who else is booked.
    choices = row
      ? openingsOn(data, row, day, org, new Date().getTime()).slice(0, 24).map((o) =>
          o.kind === "day"
            ? { value: { date: o.date, start_ms: "" }, label: "Any time that day" }
            : { value: { start_ms: String(o.startMs), date: "" }, label: o.kind === "window" ? `Arrive ${o.label}` : time(o.startMs) },
        )
      : [];
  }

  return (
    <>
      <Link href={`/b/${slug}`} className="mb-2 inline-flex min-h-10 items-center text-sm font-medium text-brand-700">← {profile.name}</Link>
      <h1 className="mb-4 text-2xl font-bold">Book with {profile.name}</h1>

      <form method="get" className="card mb-4 flex flex-col gap-3">
        <div>
          <label htmlFor="service" className="label">Service</label>
          <select id="service" name="service" className="input" defaultValue={service?.id ?? ""} required>
            <option value="" disabled>Pick a service</option>
            {profile.services.map((s) => <option key={s.id} value={s.id}>{s.name}{priceText(s) ? ` · ${priceText(s)}` : ""}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="day" className="label">Day</label>
          <input id="day" name="day" type="date" className="input" defaultValue={day} min={today} />
        </div>
        <button type="submit" className="btn-secondary">See available times</button>
      </form>

      {service && (
        service.booking_mode !== "multi_day_reservation" && choices.length === 0 ? (
          <p className="card text-slate-600">Nothing open that day. Try another day, or call or text {profile.name}.</p>
        ) : (
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">{service.name}</h2>
            {service.requires.length > 0 && (
              <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                You&apos;ll need to share up-to-date records ({service.requires.join(", ")}) with {profile.name} before your visit.
              </p>
            )}
            <PublicBookingForm
              action={publicBook.bind(null, slug, service.id)}
              choices={choices}
              stay={service.booking_mode === "multi_day_reservation" ? { checkIn: day, checkOut: addDays(day, 1), min: today } : null}
              needsZip={service.booking_mode === "mobile_appointment" && profile.service_zips.length > 0}
              consentText={bookingConsentText(profile.name)}
            />
          </section>
        )
      )}
    </>
  );
}
