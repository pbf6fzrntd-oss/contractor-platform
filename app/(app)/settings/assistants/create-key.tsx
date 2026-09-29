"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createAssistantKey } from "./actions";

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex gap-2">
        <input readOnly value={value} className="input font-mono text-xs" aria-label={label} onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn-secondary shrink-0 px-3 text-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* select-and-copy by hand */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function CreateKeyForm({ endpoint }: { endpoint: string }) {
  const [state, action] = useActionState(createAssistantKey, undefined);
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="card flex flex-col gap-3">
        <div>
          <label htmlFor="name" className="label">Name</label>
          <input id="name" name="name" className="input" placeholder="Claude on my phone" required />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="label">What can it do?</legend>
          <label className="flex items-start gap-3">
            <input type="radio" name="access" value="read_write" defaultChecked className="mt-1 h-5 w-5 accent-brand-600" />
            <span>
              <span className="block font-medium">Read and act</span>
              <span className="block text-sm text-slate-600">
                Check leads and numbers, reply to leads, change stages, mark jobs done, send rain delays (after you confirm).
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="radio" name="access" value="read" className="mt-1 h-5 w-5 accent-brand-600" />
            <span>
              <span className="block font-medium">Read only</span>
              <span className="block text-sm text-slate-600">Look things up. Can&apos;t text anyone or change anything.</span>
            </span>
          </label>
        </fieldset>
        <FormMessage state={state?.key ? undefined : state} />
        <SubmitButton pendingText="Creating…">Create key</SubmitButton>
      </form>

      {state?.key && (
        <section className="card flex flex-col gap-3 border-brand-600">
          <p className="font-semibold text-brand-800">{state.success}</p>
          <CopyBox label="Your key" value={state.key} />
          <CopyBox label="Server address" value={endpoint} />
          <div className="text-sm text-slate-700">
            <p className="mb-1 font-semibold">Connect it</p>
            <p>
              In any AI app that supports <strong>MCP servers</strong>, add a server with the address above and the header{" "}
              <code className="rounded bg-slate-100 px-1">Authorization: Bearer &lt;your key&gt;</code>.
            </p>
            <p className="mt-2">Claude Code (on a computer):</p>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs">{`claude mcp add --transport http lowcountry-leads ${endpoint} --header "Authorization: Bearer ${state.key}"`}</pre>
          </div>
        </section>
      )}
    </div>
  );
}
