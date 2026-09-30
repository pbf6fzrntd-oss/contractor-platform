"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { saveProfile } from "./actions";

export function ProfileForm({ enabled, slug, about, area, showPrices, site }: { enabled: boolean; slug: string; about: string; area: string; showPrices: boolean; site: string }) {
  const [state, action] = useActionState(saveProfile, undefined);
  return (
    <form action={action} className="card flex flex-col gap-4">
      <label className="flex items-center gap-3 font-semibold">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="h-6 w-6 accent-brand-600" />
        Show my public profile
      </label>
      <div>
        <label htmlFor="slug" className="label">Web address</label>
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-sm text-slate-500">{site.replace(/^https?:\/\//, "")}/b/</span>
          <input id="slug" name="slug" className="input" defaultValue={slug} required />
        </div>
      </div>
      <div>
        <label htmlFor="about" className="label">About your business</label>
        <textarea id="about" name="about" className="input min-h-28" maxLength={1000} defaultValue={about} placeholder="Family-owned roofer in Summerville since 2009. Free inspections, storm and insurance work, 10-year workmanship warranty." />
        <p className="hint">Plain facts help AI assistants recommend you: what you do, since when, warranties, what makes you different.</p>
      </div>
      <div>
        <label htmlFor="service_area" className="label">Area you serve</label>
        <input id="service_area" name="service_area" className="input" maxLength={300} defaultValue={area} placeholder="Summerville, Goose Creek, Mount Pleasant and Charleston" />
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="show_prices" defaultChecked={showPrices} className="h-5 w-5 accent-brand-600" />
        Show typical price ranges (people and AI assistants look for them)
      </label>
      <FormMessage state={state} />
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}
