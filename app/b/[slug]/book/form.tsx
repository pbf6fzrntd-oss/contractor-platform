"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { words, type PublicLang } from "@/lib/public/i18n";

export type Choice = { value: Record<string, string>; label: string };

export function PublicBookingForm({
  action,
  choices,
  stay,
  needsZip,
  consentText,
  lang = "en",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  choices: Choice[];
  stay?: { checkIn: string; checkOut: string; min: string } | null;
  needsZip: boolean;
  consentText: string;
  lang?: PublicLang;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const t = words(lang);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="language" value={lang} />
      {stay ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">{t.dropOff}<input type="date" name="check_in" className="input" defaultValue={stay.checkIn} min={stay.min} required /></label>
          <label className="text-sm">{t.pickUp}<input type="date" name="check_out" className="input" defaultValue={stay.checkOut} min={stay.min} required /></label>
        </div>
      ) : (
        <fieldset>
          <legend className="label">{t.pickTime}</legend>
          <div className="grid grid-cols-2 gap-2">
            {choices.map((c, i) => (
              <label key={i} className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-2 text-center text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:font-semibold">
                <input
                  type="radio"
                  name="choice"
                  value={JSON.stringify(c.value)}
                  required
                  className="sr-only"
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div>
        <label htmlFor="name" className="label">{t.yourName}</label>
        <input id="name" name="name" className="input" autoComplete="name" required />
      </div>
      <div>
        <label htmlFor="phone" className="label">{t.mobile}</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className="input" placeholder="(843) 555-1234" required />
      </div>
      {needsZip && (
        <div>
          <label htmlFor="zip" className="label">{t.zip}</label>
          <input id="zip" name="zip" inputMode="numeric" className="input" maxLength={5} required />
        </div>
      )}
      <div>
        <label htmlFor="notes" className="label">{t.notes} <span className="font-normal text-slate-500">{t.optional}</span></label>
        <textarea id="notes" name="notes" className="input min-h-20" maxLength={1000} />
      </div>
      {/* Bots fill this hidden field; people never see it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="flex items-start gap-3 rounded-xl bg-slate-100 p-3 text-sm">
        <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
        <span>{consentText}</span>
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText={t.booking}>{t.request}</SubmitButton>
    </form>
  );
}
