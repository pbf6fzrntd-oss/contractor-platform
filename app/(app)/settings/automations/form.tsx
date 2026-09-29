"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { OrgSettings } from "@/lib/settings";
import { saveAutomations } from "./actions";

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function Toggle({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-6 w-6 shrink-0 accent-brand-600" />
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-slate-600">{hint}</span>}
      </span>
    </label>
  );
}

export function AutomationsForm({
  settings,
  canEdit,
  isRecurring,
  estimateWord,
}: {
  settings: OrgSettings;
  canEdit: boolean;
  isRecurring: boolean;
  estimateWord: string;
}) {
  const [state, action] = useActionState(saveAutomations, undefined);
  return (
    <form action={action}>
      <fieldset disabled={!canEdit} className="flex flex-col gap-5">
        <section className="card flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Missed calls</h2>
          <Toggle
            name="missedCallTextEnabled"
            label="Text people back when I miss their call"
            defaultChecked={settings.missedCallTextEnabled}
          />
        </section>

        <section className="card flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{estimateWord} follow-ups</h2>
          <Toggle
            name="followUpsEnabled"
            label={`Follow up automatically after I mark "${estimateWord.toLowerCase()} sent"`}
            defaultChecked={settings.followUpsEnabled}
          />
          <div>
            <label htmlFor="followUpDays" className="label">Days after sending</label>
            <input id="followUpDays" name="followUpDays" className="input" defaultValue={settings.followUpDays.join(", ")} />
            <p className="hint">Up to 5, separated by commas. Default: 2, 5, 10.</p>
          </div>
          <div>
            <label htmlFor="followUpHour" className="label">Time of day</label>
            <select id="followUpHour" name="followUpHour" className="input" defaultValue={settings.followUpHour}>
              {range(8, 18).map((h) => (
                <option key={h} value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </div>
          <Toggle
            name="stopFollowUpsOnReply"
            label="Stop follow-ups when the customer replies"
            defaultChecked={settings.stopFollowUpsOnReply}
            hint="Recommended. Once they reply, you're talking to them yourself."
          />
        </section>

        <section className="card flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Google review requests</h2>
          <Toggle name="reviewsEnabled" label="Ask for a review after a job is done" defaultChecked={settings.reviewsEnabled} hint="Each customer is only ever asked once." />
          <div>
            <label htmlFor="reviewDelayHours" className="label">Hours after the job</label>
            <input id="reviewDelayHours" name="reviewDelayHours" type="number" min={0} max={72} className="input" defaultValue={settings.reviewDelayHours} />
          </div>
          <div className={isRecurring ? "" : "hidden"}>
            <label htmlFor="reviewAfterVisits" className="label">Recurring customers: ask after visit number</label>
            <input id="reviewAfterVisits" name="reviewAfterVisits" type="number" min={1} max={20} className="input" defaultValue={settings.reviewAfterVisits} />
          </div>
        </section>

        <section className="card flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Business hours for automatic texts</h2>
          <p className="text-sm text-slate-600">Follow-ups and review requests wait until these hours. Replies to missed calls go out anytime.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="businessHoursStart" className="label">From</label>
              <select id="businessHoursStart" name="businessHoursStart" className="input" defaultValue={settings.businessHoursStart}>
                {range(7, 12).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="businessHoursEnd" className="label">Until</label>
              <select id="businessHoursEnd" name="businessHoursEnd" className="input" defaultValue={settings.businessHoursEnd}>
                {range(15, 21).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </div>
          </div>
        </section>
        <FormMessage state={state} />
        {canEdit ? <SubmitButton>Save</SubmitButton> : <p className="hint">Only the owner can change these.</p>}
      </fieldset>
    </form>
  );
}
