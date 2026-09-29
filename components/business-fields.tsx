import { LANGUAGE_LABELS, LANGUAGES } from "@/lib/business-types";
import { industryChoiceFor, industryGroups } from "@/lib/industries";
import type { Org as FullOrg } from "@/lib/org";
import { formatUSPhone } from "@/lib/phone";

type Org = Pick<
  FullOrg,
  "name" | "business_type" | "industry" | "default_language" | "alert_phone" | "google_review_url"
>;

/** Form fields for business details, used by onboarding and settings. */
export function BusinessFields({ org, disabled = false }: { org?: Org; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-5">
      <div>
        <label htmlFor="name" className="label">
          Business name
        </label>
        <input
          id="name"
          name="name"
          className="input"
          defaultValue={org?.name}
          placeholder="e.g. Summerville Lawn Pros"
          required
        />
        <p className="hint">Customers see this at the start of every text.</p>
      </div>

      <div>
        <label htmlFor="industry" className="label">
          What&apos;s your industry?
        </label>
        <select id="industry" name="industry" className="input" defaultValue={org ? industryChoiceFor(org) : ""} required>
          {!org && (
            <option value="" disabled>
              Pick one
            </option>
          )}
          {industryGroups(org?.industry).map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="hint">We tailor your texts, lead questions and menus to your industry.</p>
      </div>

      <div>
        <label htmlFor="alert_phone" className="label">
          Your cell phone (for new-lead alerts)
        </label>
        <input
          id="alert_phone"
          name="alert_phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="input"
          defaultValue={org?.alert_phone ? formatUSPhone(org.alert_phone) : ""}
          placeholder="(843) 555-1234"
        />
        <p className="hint">We&apos;ll text you here when a new lead comes in.</p>
      </div>

      <div>
        <label htmlFor="default_language" className="label">
          Default language for customer texts
        </label>
        <select
          id="default_language"
          name="default_language"
          className="input"
          defaultValue={org?.default_language ?? "en"}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {LANGUAGE_LABELS[lang]}
            </option>
          ))}
        </select>
        <p className="hint">You can set English or Spanish for each customer later.</p>
      </div>

      <div>
        <label htmlFor="google_review_url" className="label">
          Google review link <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="google_review_url"
          name="google_review_url"
          type="url"
          inputMode="url"
          className="input"
          defaultValue={org?.google_review_url ?? ""}
          placeholder="https://g.page/r/..."
        />
        <p className="hint">
          In your Google Business Profile, tap &quot;Ask for reviews&quot; and copy the link. You can add this later.
        </p>
      </div>
    </fieldset>
  );
}
