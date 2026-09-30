import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireOwner } from "@/lib/auth/context";
import { calendarFeedUrl } from "@/lib/services/calendar";
import { createClient } from "@/lib/supabase/server";
import { resetCalendarLink, turnOffCalendarLink } from "./actions";

export const metadata: Metadata = { title: "Calendar" };

/** Owner: a private link that puts bookings (and the lawn route) in Google/Apple Calendar. */
export default async function CalendarSettingsPage() {
  const { org } = await requireOwner();
  // Read fresh (the saved business details can be from before the button was pressed).
  const { data: fresh } = await (await createClient()).from("organizations").select("calendar_token").eq("id", org.id).single();
  const url = fresh?.calendar_token ? calendarFeedUrl(fresh.calendar_token) : null;
  const webcal = url?.replace(/^https?:/, "webcal:");

  return (
    <>
      <PageHeader title="Calendar" subtitle="See your bookings in the calendar you already use." backHref="/settings" />
      {url ? (
        <section className="card flex flex-col gap-3">
          <p className="text-sm text-slate-700">
            Bookings{org.business_type === "recurring" ? " and each day's route" : ""} show up in your calendar and update about every hour. It includes customer names, services and addresses, never private notes.
          </p>
          <label className="text-sm font-medium" htmlFor="feed">Your private calendar address</label>
          <input id="feed" readOnly value={url} className="input font-mono text-xs" />
          <a href={webcal} className="btn-primary">Add to Apple Calendar or Outlook</a>
          <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal!)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            Add to Google Calendar
          </a>
          <p className="text-xs text-slate-500">Anyone with this address can see your bookings. If it gets shared by mistake, make a new one.</p>
          <div className="grid grid-cols-2 gap-2">
            <form action={resetCalendarLink}><SubmitButton className="btn-secondary w-full text-sm">Make a new address</SubmitButton></form>
            <form action={turnOffCalendarLink}><SubmitButton className="btn-secondary w-full text-sm">Turn off</SubmitButton></form>
          </div>
        </section>
      ) : (
        <section className="card flex flex-col gap-3">
          <p className="text-slate-700">Get a private link that puts your bookings{org.business_type === "recurring" ? " and daily route" : ""} in Google Calendar, Apple Calendar or Outlook.</p>
          <form action={resetCalendarLink}><SubmitButton className="btn-primary w-full">Create my calendar link</SubmitButton></form>
        </section>
      )}
    </>
  );
}
