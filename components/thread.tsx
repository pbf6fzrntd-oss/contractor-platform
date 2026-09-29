import { BLOCK_REASON_TEXT, type BlockReason } from "@/lib/messaging/gate";

export type ThreadItem =
  | {
      type: "message";
      id: string;
      created_at: string;
      direction: string;
      body: string;
      status: string;
      error: string | null;
      sender_type: string;
      flag: string | null;
    }
  | { type: "call"; id: string; created_at: string; status: string; text_back_sent: boolean };

const FLAG_TEXT: Record<string, string> = {
  opt_out: "Opted out",
  opt_in: "Opted back in",
  help: "Asked for help",
  cancel_keyword: "Said CANCEL: opted out of texts. Did they mean to cancel service?",
  possible_opt_out: "Might want to stop texts. Check and confirm.",
};

function time(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * A text-message style conversation. `perspective="business"` puts the
 * business's texts on the right (inbox); "customer" flips it (simulator).
 */
export function Thread({
  items,
  timeZone,
  perspective = "business",
}: {
  items: ThreadItem[];
  timeZone: string;
  perspective?: "business" | "customer";
}) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-slate-500">No messages yet.</p>;

  return (
    <ol className="flex flex-col gap-2">
      {items.map((item) => {
        if (item.type === "call") {
          return (
            <li key={`c-${item.id}`} className="my-1 text-center text-xs text-slate-500">
              📞 {item.status === "answered" ? "Answered call" : item.status === "missed" ? "Missed call" : "Call"} ·{" "}
              {time(item.created_at, timeZone)}
              {item.text_back_sent ? " · auto-text sent" : ""}
            </li>
          );
        }
        const fromBusiness = item.direction === "outbound";
        const right = perspective === "business" ? fromBusiness : !fromBusiness;
        const notSent = item.status === "blocked" || item.status === "failed" || item.status === "undelivered";
        return (
          <li key={`m-${item.id}`} className={`flex flex-col ${right ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[15px] leading-snug ${
                notSent
                  ? "border border-dashed border-red-300 bg-red-50 text-slate-700"
                  : right
                    ? "rounded-br-sm bg-brand-600 text-white"
                    : "rounded-bl-sm bg-white text-slate-900 ring-1 ring-slate-200"
              }`}
            >
              {item.body}
            </div>
            <p className="mt-0.5 px-1 text-xs text-slate-500">
              {time(item.created_at, timeZone)}
              {fromBusiness && item.sender_type === "automation" ? " · automatic" : ""}
              {fromBusiness && item.sender_type === "assistant" ? " · via AI assistant" : ""}
              {item.status === "delivered" && fromBusiness ? " · delivered" : ""}
            </p>
            {notSent && (
              <p className="px-1 text-xs text-red-700">
                {BLOCK_REASON_TEXT[item.error as BlockReason] ?? `Not sent: ${item.error ?? item.status}`}
              </p>
            )}
            {item.flag && FLAG_TEXT[item.flag] && (
              <p className="px-1 text-xs font-medium text-amber-700">⚠ {FLAG_TEXT[item.flag]}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
