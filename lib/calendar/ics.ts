/**
 * Calendar feed in the standard iCalendar format (.ics), which Google,
 * Apple and Outlook calendars subscribe to. Pure: events in, text out.
 */

export type CalendarEvent =
  | { uid: string; kind: "timed"; start: string; end: string; title: string; location?: string | null; description?: string | null; status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED" }
  | { uid: string; kind: "allday"; date: string; title: string; description?: string | null };

/** Escapes text per the iCalendar rules (backslash, semicolon, comma, new lines). */
export function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 bytes are folded (continued on the next line after a space). */
export function foldLine(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (bytes.encode(current + ch).length > (out.length ? 74 : 75)) {
      out.push(current);
      current = ch;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** 2026-10-01T13:00:00.000Z → 20261001T130000Z */
export function icsTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const icsDate = (d: string) => d.replace(/-/g, "");

export function buildCalendar(name: string, events: CalendarEvent[], now: Date): string {
  const stamp = icsTime(now.toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lowcountry Leads//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.kind === "timed") {
      lines.push(`DTSTART:${icsTime(e.start)}`, `DTEND:${icsTime(e.end)}`);
      if (e.status) lines.push(`STATUS:${e.status}`);
      if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    } else {
      const next = new Date(`${e.date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(next.toISOString().slice(0, 10))}`, "TRANSP:TRANSPARENT");
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
