import { FREQUENCIES, FREQUENCY_LABEL } from "@/lib/automation/schedule";
import { MARKETING_CONSENT_METHODS } from "@/lib/consent";
import { getIndustry } from "@/lib/industries";
import { DAY_NAMES } from "@/lib/time";

export const SERVICE_SUGGESTIONS = ["Mowing", "Mow, edge & blow", "Full service", "Shrub trimming", "Leaf service", "Weed control"];

/** Service name suggestions: the industry's repeat services, or the original lawn list. */
export function serviceSuggestions(industry: string | null): string[] {
  const repeat = getIndustry(industry)?.services.filter((s) => s.bookingMode === "recurring").map((s) => s.name.en) ?? [];
  return repeat.length ? repeat : SERVICE_SUGGESTIONS;
}

export function ServiceFields({
  defaults,
  suggestions = SERVICE_SUGGESTIONS,
}: {
  defaults?: { service_type?: string; frequency?: string; service_day?: number; price?: string; start_date?: string };
  suggestions?: string[];
}) {
  return (
    <>
      <div>
        <label htmlFor="service_type" className="label">Service</label>
        <input id="service_type" name="service_type" list="service-suggestions" className="input" defaultValue={defaults?.service_type ?? suggestions[0]} required />
        <datalist id="service-suggestions">
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="service_day" className="label">Day</label>
          <select id="service_day" name="service_day" className="input" defaultValue={defaults?.service_day ?? 1}>
            {DAY_NAMES.en.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="frequency" className="label">How often</label>
          <select id="frequency" name="frequency" className="input" defaultValue={defaults?.frequency ?? "weekly"}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="price" className="label">Price per visit</label>
          <input id="price" name="price" inputMode="decimal" className="input" defaultValue={defaults?.price ?? ""} placeholder="$45" />
        </div>
        <div>
          <label htmlFor="start_date" className="label">First visit</label>
          <input id="start_date" name="start_date" type="date" className="input" defaultValue={defaults?.start_date} />
        </div>
      </div>
    </>
  );
}

export function ConsentFields({ plural = false }: { plural?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl bg-slate-100 p-3">
      <legend className="sr-only">Text message permission</legend>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="service_texts" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" required />
        <span>
          {plural ? "These customers" : "This customer"} agreed to get texts about {plural ? "their" : "their"} service
          (schedule changes, rain delays, reminders). <strong>Required.</strong>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="marketing_consent" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
        <span>
          {plural ? "They" : "They"} also agreed <strong>in writing</strong> to get offers and seasonal promotions by text.
          Only check this if it&apos;s true. Promotions without written consent can cost $500+ per text in fines.
        </span>
      </label>
      <div>
        <label htmlFor="marketing_method" className="label">How they agreed to offers</label>
        <select id="marketing_method" name="marketing_method" className="input" defaultValue="written_agreement">
          {Object.entries(MARKETING_CONSENT_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </fieldset>
  );
}
