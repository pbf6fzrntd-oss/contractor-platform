import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { bookingIdFromToken } from "@/lib/booking/manage-link";
import { publicLang, words } from "@/lib/public/i18n";
import { bookingWhen, loadBookingData, openingsOn } from "@/lib/services/booking";
import { canChange, loadManagedBooking } from "@/lib/services/booking-manage";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, localDateString } from "@/lib/time";
import { cancelBooking, moveBooking } from "./actions";
import { CancelForm, MoveForm } from "./forms";

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

/**
 * A customer's private booking link (from their texts). Shows ONLY this
 * booking's service, time and status: never notes, address, pets, vehicles
 * or anything else about the customer or the business.
 */
export default async function ManageBookingPage({ params, searchParams }: PageProps<"/m/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const id = bookingIdFromToken(token);
  if (!id) notFound();
  const db = createAdminClient();
  const m = await loadManagedBooking(db, id);
  if (!m) notFound();
  const { booking, org } = m;
  const lang = sp.lang ? publicLang(sp.lang) : m.contact.preferred_language === "es" ? "es" : "en";
  const t = words(lang);
  const now = new Date().getTime();
  const changeable = canChange(booking, now);

  // Openings for moving (same rules as online booking), for the picked day.
  const today = localDateString(new Date(), org.timezone);
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day >= today ? sp.day : booking.service_date >= today ? booking.service_date : today;
  const isStay = booking.mode === "multi_day_reservation";
  let choices: { value: Record<string, string>; label: string }[] = [];
  if (changeable && booking.service_id && !isStay) {
    const data = await loadBookingData(db, org, day, addDays(day, 1));
    const row = data.services.find((s) => s.id === booking.service_id);
    const time = (ms: number) => new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: org.timezone }).format(new Date(ms));
    choices = row
      ? openingsOn(data, row, day, org, now, booking.service_zip)
          .filter((o) => o.kind === "day" || o.startMs !== Date.parse(booking.starts_at))
          .slice(0, 24)
          .map((o) =>
            o.kind === "day"
              ? { value: { date: o.date, start_ms: "" }, label: t.anyTime }
              : { value: { start_ms: String(o.startMs), date: "" }, label: o.kind === "window" ? `${t.arrive} ${o.label}` : time(o.startMs) },
          )
      : [];
  }

  const done = sp.done === "canceled" ? t.canceledDone : sp.done === "moved" ? t.movedDone : sp.done === "requested" ? t.movedPending : null;

  return (
    <>
      <div className="mb-2 flex justify-end">
        <Link href={`/m/${token}?lang=${lang === "es" ? "en" : "es"}`} className="inline-flex min-h-10 items-center text-sm font-medium text-brand-700">{t.switchTo}</Link>
      </div>
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{org.name}</p>
      <h1 className="mb-4 text-2xl font-bold">{t.yourBooking}</h1>

      {done && <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-3 text-emerald-900" role="status">{done}</p>}

      <section className="card mb-4 flex flex-col gap-1">
        <p className="text-lg font-semibold">{m.serviceName}</p>
        <p className="text-slate-700">{bookingWhen(booking, org.timezone, lang)}</p>
        <p className="text-sm text-slate-500">{t.status[booking.status] ?? booking.status}</p>
      </section>

      {changeable ? (
        <>
          <section className="card mb-4">
            <h2 className="mb-3 text-lg font-semibold">{t.moveBooking}</h2>
            {!isStay && (
              <form method="get" className="mb-3 flex items-end gap-2">
                {lang === "es" && <input type="hidden" name="lang" value="es" />}
                <label className="flex-1 text-sm">
                  {t.pickDay}
                  <input type="date" name="day" className="input" defaultValue={day} min={today} />
                </label>
                <button type="submit" className="btn-secondary">{t.seeTimes}</button>
              </form>
            )}
            {!isStay && choices.length === 0 ? (
              <p className="text-slate-600">{t.nothingOpen(org.name)}</p>
            ) : (
              <MoveForm
                action={moveBooking.bind(null, token, lang)}
                choices={choices}
                stay={isStay ? { checkIn: booking.check_in ?? day, checkOut: booking.check_out ?? addDays(day, 1), min: today } : null}
                label={t.moveBooking}
                pending={t.moving}
                legend={t.pickNewTime}
                dropOff={t.dropOff}
                pickUp={t.pickUp}
              />
            )}
          </section>
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">{t.cancelBooking}</h2>
            <CancelForm action={cancelBooking.bind(null, token, lang)} label={t.cancelBooking} pending={t.canceling} confirm={t.cancelSure} />
          </section>
        </>
      ) : (
        !done && <p className="card text-slate-600">{t.cantChange}</p>
      )}
    </>
  );
}
