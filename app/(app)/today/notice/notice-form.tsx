"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { renderTemplate } from "@/lib/templates/render";
import { DAY_NAMES, weekdayOf } from "@/lib/time";
import { sendNotice } from "../actions";

type Props = {
  type: "rain_delay" | "running_late" | "custom";
  date: string;
  dayOptions: string[];
  templates: { en: string; es: string };
  businessName: string;
  recipients: number;
  spanishRecipients: number;
  optedOut: number;
  earlyWarning: boolean;
};

const chipDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function NoticeForm(props: Props) {
  const [state, action] = useActionState(sendNotice, undefined);
  const [newDate, setNewDate] = useState(props.dayOptions[0]);
  const [bodyEn, setBodyEn] = useState(props.templates.en);
  const [bodyEs, setBodyEs] = useState(props.templates.es);
  const [editing, setEditing] = useState(props.type === "custom");

  const values = (lang: "en" | "es") => ({
    business_name: props.businessName,
    first_name: lang === "es" ? "María" : "Mike",
    service_day: DAY_NAMES[lang][weekdayOf(props.date)],
    new_day: DAY_NAMES[lang][weekdayOf(newDate)],
  });

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="type" value={props.type} />
      <input type="hidden" name="date" value={props.date} />

      {props.type === "rain_delay" && (
        <div>
          <p className="label">Move them to</p>
          <div className="grid grid-cols-3 gap-2">
            {props.dayOptions.map((d) => (
              <label
                key={d}
                className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-white text-center text-sm font-semibold ring-1 ring-slate-300 has-[:checked]:bg-brand-600 has-[:checked]:text-white has-[:checked]:ring-brand-600"
              >
                <input type="radio" name="new_date" value={d} checked={newDate === d} onChange={() => setNewDate(d)} className="sr-only" />
                {chipDate.format(new Date(d))}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card flex flex-col gap-2">
        <p className="text-sm font-semibold text-slate-600">What customers will get</p>
        <p className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-[15px]">{renderTemplate(bodyEn, values("en"))}</p>
        {props.spanishRecipients > 0 && (
          <>
            <p className="text-xs text-slate-500">Spanish speakers ({props.spanishRecipients}) get:</p>
            <p className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-[15px]">
              {renderTemplate(bodyEs || bodyEn, values("es"))}
            </p>
          </>
        )}
        {!editing && (
          <button type="button" className="self-start text-sm font-medium text-brand-700" onClick={() => setEditing(true)}>
            Edit wording
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="body_en" className="label">English</label>
            <textarea id="body_en" name="body_en" rows={4} className="input py-2" value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="body_es" className="label">Spanish (leave blank to send English to everyone)</label>
            <textarea id="body_es" name="body_es" rows={4} className="input py-2" value={bodyEs} onChange={(e) => setBodyEs(e.target.value)} />
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="body_en" value={bodyEn} />
          <input type="hidden" name="body_es" value={bodyEs} />
        </>
      )}

      {props.earlyWarning && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">It&apos;s before 7am. Customers will get this right away.</p>
      )}
      {props.optedOut > 0 && <p className="text-sm text-slate-600">{props.optedOut} opted-out customer(s) won&apos;t be texted.</p>}
      <FormMessage state={state} />
      <div className="sticky bottom-20 z-10 bg-slate-50/95 py-2 backdrop-blur">
        <SubmitButton className="btn-primary min-h-14 w-full text-lg shadow-lg" pendingText="Sending…">
          Send to {props.recipients} customer{props.recipients === 1 ? "" : "s"}
        </SubmitButton>
      </div>
    </form>
  );
}
