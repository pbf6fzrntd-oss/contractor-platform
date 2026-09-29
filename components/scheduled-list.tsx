import { SKIP_REASON_TEXT } from "@/lib/automation/outbox";
import { BLOCK_REASON_TEXT, type BlockReason } from "@/lib/messaging/gate";

export type ScheduledSummary = {
  id: string;
  kind: string;
  template_key: string | null;
  send_at: string;
  status: string;
  skip_reason: string | null;
};

const KIND: Record<string, string> = {
  estimate_followup: "Follow-up",
  review_request: "Review request",
  broadcast: "Bulk text",
};

function label(item: ScheduledSummary) {
  const step = item.template_key?.match(/_(\d)$/)?.[1];
  return item.kind === "estimate_followup" && step ? `Follow-up #${step}` : (KIND[item.kind] ?? item.kind);
}

/** Upcoming and recent automatic texts, with why any were skipped. */
export function ScheduledList({ items, timeZone }: { items: ScheduledSummary[]; timeZone: string }) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {items.map((item) => {
        const why = item.skip_reason
          ? (SKIP_REASON_TEXT[item.skip_reason] ?? BLOCK_REASON_TEXT[item.skip_reason as BlockReason] ?? item.skip_reason)
          : null;
        return (
          <li key={item.id} className="flex items-baseline justify-between gap-2">
            <span className={item.status === "pending" ? "font-medium" : "text-slate-500"}>{label(item)}</span>
            <span className="text-right text-slate-600">
              {item.status === "pending" && fmt.format(new Date(item.send_at))}
              {item.status === "sent" && `Sent ${fmt.format(new Date(item.send_at))}`}
              {(item.status === "skipped" || item.status === "canceled" || item.status === "failed") &&
                `Not sent${why ? `: ${why.replace(/^Not sent: /, "")}` : ""}`}
              {item.status === "processing" && "Sending…"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
