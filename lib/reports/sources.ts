/**
 * "Where did the work come from?" Pure function for the dashboard and AI
 * assistants: counts leads and bookings by source, and how many were won.
 */

export const SOURCE_LABEL: Record<string, string> = {
  missed_call: "Missed calls (texted back)",
  inbound_text: "Texted in",
  campaign: "Campaign replies",
  manual: "Added by hand",
  booking_page: "Online booking page",
  customer_link: "Online booking page",
  outside_agent: "Customers' AI agents",
  voice: "Phone assistant",
  ai_assistant: "Your AI assistant",
  owner: "Booked by you or your team",
  team: "Booked by you or your team",
};

export type SourceRow = { key: string; label: string; leads: number; won: number; bookings: number };

export function summarizeSources(
  leads: { source: string; stage: string }[],
  bookings: { source: string; status: string }[],
): SourceRow[] {
  const rows = new Map<string, SourceRow>();
  const row = (source: string) => {
    const label = SOURCE_LABEL[source] ?? source.replace(/_/g, " ");
    const r = rows.get(label) ?? { key: source, label, leads: 0, won: 0, bookings: 0 };
    rows.set(label, r);
    return r;
  };
  for (const l of leads) {
    const r = row(l.source);
    r.leads += 1;
    if (l.stage === "won") r.won += 1;
  }
  for (const b of bookings) if (b.status !== "canceled") row(b.source).bookings += 1;
  return [...rows.values()].sort((a, b) => b.leads + b.bookings - (a.leads + a.bookings) || a.label.localeCompare(b.label));
}
