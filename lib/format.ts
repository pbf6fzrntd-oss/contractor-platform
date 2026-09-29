/** Short, friendly time for lists: "3:42 PM", "Tue", or "Sep 12". */
export function shortTime(iso: string, timeZone: string, now = new Date()): string {
  const date = new Date(iso);
  const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
  const opts: Intl.DateTimeFormatOptions =
    ageDays < 1 ? { hour: "numeric", minute: "2-digit" } : ageDays < 7 ? { weekday: "short" } : { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(date);
}

export function money(cents: number | null | undefined): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

/** "$1,250" or "1250.50" -> cents. Returns null for blank, undefined for invalid. */
export function parseDollars(input: string | null | undefined): number | null | undefined {
  const cleaned = (input ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}
