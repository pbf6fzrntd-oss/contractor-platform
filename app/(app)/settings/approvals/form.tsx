"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { ApprovalRuleInfo, ApprovalSettings } from "@/lib/approvals/rules";
import { saveApprovalRules } from "./actions";

export function ApprovalRulesForm({ rules, settings }: { rules: ApprovalRuleInfo[]; settings: ApprovalSettings }) {
  const [state, action] = useActionState(saveApprovalRules, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <ul className="card divide-y divide-slate-100 p-0">
        {rules.map((r) => (
          <li key={r.key} className="flex items-center gap-3 px-4 py-3">
            <input type="hidden" name={`${r.key}_shown`} value="1" />
            <label className="flex flex-1 items-center gap-3">
              <input type="checkbox" name={`${r.key}_on`} defaultChecked={settings[r.key].on} className="h-6 w-6 shrink-0 accent-brand-600" />
              <span>{r.label}</span>
            </label>
            {r.valueLabel && (
              <input
                name={`${r.key}_value`}
                type="number"
                min={0}
                aria-label={r.valueLabel}
                defaultValue={settings[r.key].value}
                className="input w-24 shrink-0"
              />
            )}
          </li>
        ))}
      </ul>
      <FormMessage state={state} />
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
