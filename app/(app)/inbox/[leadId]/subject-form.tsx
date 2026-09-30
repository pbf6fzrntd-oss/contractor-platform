"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { SubjectType } from "@/lib/industries/types";
import { PRIVATE_FIELDS, SUBJECT_FIELDS } from "@/lib/subjects/fields";
import { saveSubjectAction } from "./subject-actions";

export function SubjectForm({
  leadId,
  subjectId,
  kind,
  values = {},
  privateValues = {},
}: {
  leadId: string;
  subjectId: string | null;
  kind: SubjectType;
  values?: Record<string, unknown>;
  privateValues?: Record<string, string | null>;
}) {
  const [state, action] = useActionState(saveSubjectAction.bind(null, leadId, subjectId), undefined);
  const id = (k: string) => `${subjectId ?? "new"}-${k}`;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />
      {SUBJECT_FIELDS[kind].map((f) => {
        const v = values[f.key];
        if (f.type === "boolean") {
          return (
            <label key={f.key} className="flex items-center gap-3 text-sm">
              <input type="checkbox" name={f.key} defaultChecked={v === true} className="h-5 w-5 accent-brand-600" />
              {f.label}
            </label>
          );
        }
        return (
          <div key={f.key}>
            <label htmlFor={id(f.key)} className="label">{f.label}</label>
            {f.type === "select" ? (
              <select id={id(f.key)} name={f.key} className="input" defaultValue={typeof v === "string" ? v : ""}>
                <option value="">—</option>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                id={id(f.key)}
                name={f.key}
                className="input"
                inputMode={f.type === "number" ? "numeric" : undefined}
                defaultValue={v === undefined ? "" : String(v)}
                placeholder={f.placeholder}
              />
            )}
          </div>
        );
      })}
      {PRIVATE_FIELDS[kind].map((f) => (
        <div key={f.key} className="rounded-xl bg-amber-50 p-3">
          <label htmlFor={id(f.key)} className="label">🔒 {f.label}</label>
          {f.key === "vin" ? (
            <input id={id(f.key)} name={f.key} className="input font-mono uppercase" autoComplete="off" defaultValue={privateValues[f.key] ?? ""} placeholder={f.placeholder} />
          ) : (
            <textarea id={id(f.key)} name={f.key} className="input min-h-20" autoComplete="off" defaultValue={privateValues[f.key] ?? ""} placeholder={f.placeholder} />
          )}
          <p className="hint">{f.hint}</p>
        </div>
      ))}
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary w-full">Save</SubmitButton>
    </form>
  );
}
