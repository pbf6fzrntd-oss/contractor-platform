"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { runSimulatedScheduler } from "./actions";

export function SchedulerControls() {
  const [dueState, dueAction] = useActionState(runSimulatedScheduler.bind(null, false), undefined);
  const [skipState, skipAction] = useActionState(runSimulatedScheduler.bind(null, true), undefined);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <form action={dueAction}>
          <SubmitButton className="btn-secondary w-full text-sm" pendingText="Sending…">
            Send what&apos;s due
          </SubmitButton>
        </form>
        <form action={skipAction}>
          <SubmitButton className="btn-primary w-full text-sm" pendingText="Sending…">
            ⏩ Skip ahead
          </SubmitButton>
        </form>
      </div>
      <p className="hint">&quot;Skip ahead&quot; sends everything scheduled as if the day had come. All other rules still apply.</p>
      <FormMessage state={skipState ?? dueState} />
    </div>
  );
}
