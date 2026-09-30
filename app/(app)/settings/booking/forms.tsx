"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { BookingSettings } from "@/lib/booking/settings";
import { addResource, addService, saveBookingSettings } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayOffLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const hourLabel = (h: number) => (h === 0 || h === 24 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`);

export function BookingSettingsForm({ enabled, settings, pets = false }: { enabled: boolean; settings: BookingSettings; pets?: boolean }) {
  const [state, action] = useActionState(saveBookingSettings, undefined);
  return (
    <form action={action} className="card flex flex-col gap-4">
      <label className="flex items-center gap-3 font-semibold">
        <input type="checkbox" name="booking_enabled" defaultChecked={enabled} className="h-6 w-6 accent-brand-600" />
        Take bookings in the app
      </label>
      <fieldset>
        <legend className="label">Days you take bookings</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <label key={d} className="flex min-h-11 min-w-12 cursor-pointer items-center justify-center rounded-xl border border-slate-300 px-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:font-semibold">
              <input type="checkbox" name="openDays" value={i} defaultChecked={settings.openDays.includes(i)} className="sr-only" />
              {d}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="openHour" className="label">Opens</label>
          <select id="openHour" name="openHour" className="input" defaultValue={settings.openHour}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="closeHour" className="label">Closes</label>
          <select id="closeHour" name="closeHour" className="input" defaultValue={settings.closeHour}>
            {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="windowMinutes" className="label">Arrival window</label>
          <select id="windowMinutes" name="windowMinutes" className="input" defaultValue={settings.windowMinutes}>
            {[60, 120, 180, 240].map((m) => <option key={m} value={m}>{m / 60} hour{m > 60 ? "s" : ""}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="windowCapacity" className="label">Visits per window</label>
          <input id="windowCapacity" name="windowCapacity" type="number" min={1} max={50} className="input" defaultValue={settings.windowCapacity} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="stepMinutes" className="label">Appointment times every</label>
          <select id="stepMinutes" name="stepMinutes" className="input" defaultValue={settings.stepMinutes}>
            {[15, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="maxDaysAhead" className="label">Book up to (days ahead)</label>
          <input id="maxDaysAhead" name="maxDaysAhead" type="number" min={1} max={365} className="input" defaultValue={settings.maxDaysAhead} />
        </div>
      </div>
      <div>
        <label htmlFor="serviceZips" className="label">ZIP codes you serve <span className="font-normal text-slate-500">(mobile visits; blank = anywhere)</span></label>
        <input id="serviceZips" name="serviceZips" className="input" inputMode="numeric" defaultValue={settings.serviceZips.join(", ")} placeholder="29483, 29485, 29445" />
      </div>
      <fieldset>
        <legend className="label">Days off <span className="font-normal text-slate-500">(holidays, vacation: no bookings these days)</span></legend>
        {settings.closedDates.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {settings.closedDates.map((d) => (
              <label key={d} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input type="checkbox" name="closedDates" value={d} defaultChecked className="h-4 w-4 accent-brand-600" />
                {dayOffLabel(d)}
              </label>
            ))}
          </div>
        )}
        <label htmlFor="addClosedDate" className="sr-only">Add a day off</label>
        <input id="addClosedDate" name="addClosedDate" type="date" className="input" />
        <p className="mt-1 text-xs text-slate-500">Pick a date and save to add it. Untick a date to remove it.</p>
      </fieldset>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" name="remindersEnabled" defaultChecked={settings.remindersEnabled} className="h-6 w-6 accent-brand-600" />
        <span>Text customers a reminder the day before <span className="block text-sm text-slate-500">They can reply C to confirm or use their link to move or cancel.</span></span>
      </label>
      {pets && (
        <label className="flex min-h-12 items-center gap-3">
          <input type="hidden" name="vaccineRemindersShown" value="1" />
          <input type="checkbox" name="vaccineReminders" defaultChecked={settings.vaccineReminders} className="h-6 w-6 accent-brand-600" />
          <span>Remind customers when a vaccine record on file is about to expire <span className="block text-sm text-slate-500">2 weeks before. They can reply with a photo of the new one.</span></span>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="approvalHoldHours" className="label">Hold requests for my OK</label>
          <select id="approvalHoldHours" name="approvalHoldHours" className="input" defaultValue={settings.approvalHoldHours}>
            {[4, 12, 24, 48, 72, 168].map((h) => <option key={h} value={h}>{h < 48 ? `${h} hours` : `${h / 24} days`}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="agentVerifyMinutes" className="label">AI-booked: wait for customer&apos;s YES</label>
          <select id="agentVerifyMinutes" name="agentVerifyMinutes" className="input" defaultValue={settings.agentVerifyMinutes}>
            {[30, 60, 120, 240, 720, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : m < 1440 ? `${m / 60} hour${m > 60 ? "s" : ""}` : "1 day"}</option>)}
          </select>
        </div>
      </div>
      <p className="-mt-2 text-xs text-slate-500">After that, the time is released and the customer is told.</p>
      <FormMessage state={state} />
      <SubmitButton>Save booking settings</SubmitButton>
    </form>
  );
}

const MODES = [
  ["arrival_window", "Arrival window (e.g. 8–10am)"],
  ["fixed_appointment", "Appointment at a set time"],
  ["mobile_appointment", "Appointment at the customer's place"],
  ["day_capacity", "Whole day (limited jobs per day)"],
  ["multi_day_reservation", "Overnight stay (boarding)"],
  ["package_sessions", "Session from a package"],
] as const;

export function AddServiceForm() {
  const [state, action] = useActionState(addService, undefined);
  return (
    <form action={action} className="card flex flex-col gap-3">
      <div>
        <label htmlFor="svc-name" className="label">Service name</label>
        <input id="svc-name" name="name" className="input" required />
      </div>
      <div>
        <label htmlFor="booking_mode" className="label">How it&apos;s booked</label>
        <select id="booking_mode" name="booking_mode" className="input">
          {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="duration_minutes" className="label">Length (minutes)</label>
          <input id="duration_minutes" name="duration_minutes" type="number" min={5} className="input" defaultValue={60} />
        </div>
        <div>
          <label htmlFor="daily_capacity" className="label">Jobs per day <span className="font-normal text-slate-500">(whole-day)</span></label>
          <input id="daily_capacity" name="daily_capacity" type="number" min={1} className="input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="price_from" className="label">Price from</label>
          <input id="price_from" name="price_from" inputMode="decimal" className="input" placeholder="$" />
        </div>
        <div>
          <label htmlFor="price_to" className="label">Price to</label>
          <input id="price_to" name="price_to" inputMode="decimal" className="input" placeholder="$" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="resource_kind" className="label">Done by <span className="font-normal text-slate-500">(optional)</span></label>
          <input id="resource_kind" name="resource_kind" className="input" placeholder="groomer, bay, tech" />
        </div>
        <div>
          <label htmlFor="min_notice_hours" className="label">Notice needed (hours)</label>
          <input id="min_notice_hours" name="min_notice_hours" type="number" min={0} className="input" defaultValue={0} />
        </div>
      </div>
      <div>
        <label htmlFor="required_documents" className="label">Required records <span className="font-normal text-slate-500">(optional)</span></label>
        <input id="required_documents" name="required_documents" className="input" placeholder="rabies, bordetella" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary w-full">Add service</SubmitButton>
    </form>
  );
}

export function AddResourceForm() {
  const [state, action] = useActionState(addResource, undefined);
  return (
    <form action={action} className="card flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="res-name" className="label">Name</label>
          <input id="res-name" name="name" className="input" placeholder="Sam, Bay 1, Van 2" required />
        </div>
        <div>
          <label htmlFor="res-kind" className="label">Type</label>
          <input id="res-kind" name="kind" className="input" placeholder="groomer, bay, tech, run" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="res-capacity" className="label">How many at once</label>
          <input id="res-capacity" name="capacity" type="number" min={1} className="input" defaultValue={1} />
        </div>
        <div>
          <label htmlFor="res-class" className="label">Size <span className="font-normal text-slate-500">(kennels)</span></label>
          <input id="res-class" name="unit_class" className="input" placeholder="standard, large" />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary w-full">Add</SubmitButton>
    </form>
  );
}
