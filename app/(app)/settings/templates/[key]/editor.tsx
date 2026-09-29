"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { smsSegments } from "@/lib/automation/segments";
import { TEMPLATE_VARIABLES } from "@/lib/templates/defaults";
import { findUnknownVariables, renderTemplate, type TemplateValues } from "@/lib/templates/render";
import { saveTemplate } from "./actions";

type Lang = "en" | "es";

const VARIABLE_HELP: Record<string, string> = {
  business_name: "your business name",
  business_phone: "your business number",
  first_name: "customer's first name",
  review_link: "your Google review link",
  service_day: "their usual service day",
  new_day: "the new day",
};

export function TemplateEditor({
  templateKey,
  initial,
  defaults,
  samples,
  canEdit,
}: {
  templateKey: string;
  initial: Record<Lang, string>;
  defaults: Record<Lang, string>;
  samples: Record<Lang, TemplateValues>;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(saveTemplate.bind(null, templateKey), undefined);
  const [text, setText] = useState(initial);

  return (
    <form action={action} className="flex flex-col gap-6">
      {(["en", "es"] as const).map((lang) => {
        const preview = renderTemplate(text[lang], samples[lang]);
        const seg = smsSegments(preview);
        const unknown = findUnknownVariables(text[lang]);
        return (
          <section key={lang} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor={`body_${lang}`} className="label mb-0 text-base">
                {lang === "en" ? "English" : "Spanish"}
              </label>
              {canEdit && text[lang] !== defaults[lang] && (
                <button
                  type="button"
                  className="text-sm font-medium text-brand-700"
                  onClick={() => setText((t) => ({ ...t, [lang]: defaults[lang] }))}
                >
                  Reset to default
                </button>
              )}
            </div>
            <textarea
              id={`body_${lang}`}
              name={`body_${lang}`}
              rows={5}
              className="input py-2"
              value={text[lang]}
              onChange={(e) => setText((t) => ({ ...t, [lang]: e.target.value }))}
              disabled={!canEdit}
            />
            {unknown.length > 0 && (
              <p className="text-sm text-red-700">Unknown placeholder: {unknown.map((u) => `{${u}}`).join(", ")}</p>
            )}
            <p className="text-xs text-slate-500">Preview:</p>
            <p className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-[15px] leading-snug">
              {preview}
            </p>
            <p className="text-xs text-slate-500">
              {seg.characters} characters · {seg.segments === 1 ? "1 text" : `${seg.segments} texts (billed as ${seg.segments})`}
              {seg.encoding === "UCS-2" && " · accents/emoji use more space"}
            </p>
          </section>
        );
      })}

      <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
        <p className="mb-1 font-semibold">Fill-in-the-blanks you can use:</p>
        <ul className="grid grid-cols-1 gap-0.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <li key={v}>
              <code className="text-brand-700">{`{${v}}`}</code> = {VARIABLE_HELP[v]}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-slate-600">&quot;Reply STOP to opt out&quot; is added automatically when required.</p>
      </div>

      <FormMessage state={state} />
      {canEdit && <SubmitButton>Save both languages</SubmitButton>}
    </form>
  );
}
