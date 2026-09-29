"use client";

import { usePathname, useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { smsSegments } from "@/lib/automation/segments";
import { renderTemplate } from "@/lib/templates/render";
import { scheduleCampaign } from "../actions";

type Props = {
  templateKey: string;
  templates: { key: string; label: string; season: string }[];
  initialName: string;
  initialEn: string;
  initialEs: string;
  statuses: string[];
  serviceTypes: string[];
  allServiceTypes: string[];
  counts: { recipients: number; spanish: number; noConsent: number; optedOut: number };
  businessName: string;
  today: string;
};

export function CampaignForm(p: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, action] = useActionState(scheduleCampaign, undefined);
  const [bodyEn, setBodyEn] = useState(p.initialEn);
  const [bodyEs, setBodyEs] = useState(p.initialEs);
  const [when, setWhen] = useState<"now" | "later">("now");
  // Checkboxes update instantly; the recipient count refreshes from the server.
  const [statuses, setStatuses] = useState(p.statuses);
  const [types, setTypes] = useState(p.serviceTypes);

  function go(next: { template?: string; statuses?: string[]; types?: string[] }) {
    if (next.statuses) setStatuses(next.statuses);
    if (next.types) setTypes(next.types);
    const q = new URLSearchParams();
    q.set("template", next.template ?? p.templateKey);
    for (const s of next.statuses ?? statuses) q.append("status", s);
    if ((next.statuses ?? statuses).length === 0) q.set("status", "");
    for (const t of next.types ?? types) q.append("type", t);
    router.replace(`${pathname}?${q}`, { scroll: false });
  }
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const preview = renderTemplate(bodyEn, { business_name: p.businessName, first_name: "Mike" });
  const seg = smsSegments(`${preview}\nReply STOP to opt out.`);

  return (
    <form action={action} className="flex flex-col gap-5">
      <section>
        <p className="label">Offer</p>
        <div className="flex flex-wrap gap-2">
          {p.templates.map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => go({ template: t.key })}
              className={`rounded-full px-3 py-2 text-sm font-medium ring-1 ${
                t.key === p.templateKey ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="hint">Typical season: {p.templates.find((t) => t.key === p.templateKey)?.season}</p>
      </section>

      <input type="hidden" name="template_key" value={p.templateKey} />
      <div>
        <label htmlFor="name" className="label">Campaign name</label>
        <input id="name" name="name" key={p.initialName} defaultValue={p.initialName} className="input" required />
      </div>

      <section className="card flex flex-col gap-3">
        <p className="font-semibold">Who gets it</p>
        <div className="flex flex-col gap-2">
          {[
            { v: "active", l: "Current customers" },
            { v: "past", l: "Past customers (canceled): win them back" },
          ].map((o) => (
            <label key={o.v} className="flex items-center gap-3">
              <input
                type="checkbox"
                name="statuses"
                value={o.v}
                checked={statuses.includes(o.v)}
                onChange={() => go({ statuses: toggle(statuses, o.v) })}
                className="h-5 w-5 accent-brand-600"
              />
              {o.l}
            </label>
          ))}
        </div>
        {p.allServiceTypes.length > 1 && (
          <div>
            <p className="label">Only customers with (optional)</p>
            <div className="flex flex-wrap gap-2">
              {p.allServiceTypes.map((t) => (
                <label key={t} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="service_types"
                    value={t}
                    checked={types.includes(t)}
                    onChange={() => go({ types: toggle(types, t) })}
                    className="accent-brand-600"
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
        )}
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">
          <strong>{p.counts.recipients}</strong> customer{p.counts.recipients === 1 ? "" : "s"} will get this
          {p.counts.spanish ? ` (${p.counts.spanish} in Spanish)` : ""}.
          {p.counts.noConsent > 0 && (
            <> {p.counts.noConsent} left out: no written consent for offers on file.</>
          )}
          {p.counts.optedOut > 0 && <> {p.counts.optedOut} opted out.</>}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <label htmlFor="body_en" className="label">English</label>
          <textarea id="body_en" name="body_en" rows={4} className="input py-2" value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="body_es" className="label">Spanish</label>
          <textarea id="body_es" name="body_es" rows={4} className="input py-2" value={bodyEs} onChange={(e) => setBodyEs(e.target.value)} />
        </div>
        <p className="text-xs text-slate-500">Preview:</p>
        <p className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-[15px]">
          {preview}
          {"\n"}Reply STOP to opt out.
        </p>
        <p className="text-xs text-slate-500">
          {seg.segments === 1 ? "1 text" : `${seg.segments} texts`} per customer. &quot;Reply STOP to opt out&quot; is always added to offers.
        </p>
      </section>

      <section className="card flex flex-col gap-3">
        <p className="font-semibold">When</p>
        <label className="flex items-center gap-3">
          <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} className="h-5 w-5 accent-brand-600" />
          Send now (or 8am if it&apos;s after hours)
        </label>
        <label className="flex items-center gap-3">
          <input type="radio" name="when" value="later" checked={when === "later"} onChange={() => setWhen("later")} className="h-5 w-5 accent-brand-600" />
          Schedule for later
        </label>
        {when === "later" && (
          <div className="grid grid-cols-2 gap-2">
            <input type="date" name="send_date" min={p.today} defaultValue={p.today} className="input" aria-label="Date" />
            <input type="time" name="send_time" defaultValue="10:00" className="input" aria-label="Time" />
          </div>
        )}
        <p className="hint">Offers only go out between 8am and 8pm.</p>
      </section>

      <FormMessage state={state} />
      <SubmitButton pendingText="Scheduling…" className="btn-primary min-h-14 w-full text-lg">
        {when === "now" ? `Send to ${p.counts.recipients}` : `Schedule for ${p.counts.recipients}`}
      </SubmitButton>
    </form>
  );
}
