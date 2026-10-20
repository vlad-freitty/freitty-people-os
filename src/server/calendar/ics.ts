import { isIsoDate } from "@/lib/dates";

/**
 * Minimal iCalendar support for all-day holiday calendars: parsing VEVENTs for import (PRD 5) and writing the
 * personal subscription feed. Timed events are imported by their start date.
 */

export type ParsedEvent = { title: string; date: string; endDate: string | null; recurrence: "none" | "yearly" };

function unfold(text: string): string[] {
  // RFC 5545: lines starting with a space or tab continue the previous line
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescape(v: string) {
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

function parseDate(v: string): string | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return isIsoDate(iso) ? iso : null;
}

export function parseIcs(text: string): { events: ParsedEvent[]; errors: string[] } {
  const events: ParsedEvent[] = [];
  const errors: string[] = [];
  let current: Record<string, string> | null = null;
  let index = 0;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      index++;
      continue;
    }
    if (line === "END:VEVENT" && current) {
      const date = current.DTSTART ? parseDate(current.DTSTART) : null;
      const title = current.SUMMARY ? unescape(current.SUMMARY) : "";
      if (!date || !title) {
        errors.push(`event ${index}: missing DTSTART or SUMMARY`);
      } else {
        // DTEND of all-day events is exclusive
        let endDate = current.DTEND ? parseDate(current.DTEND) : null;
        if (endDate && current.DTEND_IS_DATE === "1") {
          const d = new Date(`${endDate}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() - 1);
          endDate = d.toISOString().slice(0, 10);
        }
        if (endDate && endDate <= date) endDate = null;
        const recurrence = /FREQ=YEARLY/i.test(current.RRULE ?? "") ? "yearly" : "none";
        events.push({ title, date, endDate, recurrence });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(";");
    const value = line.slice(colon + 1);
    current[name.toUpperCase()] = value;
    if (name.toUpperCase() === "DTEND" && (params.some((p) => /VALUE=DATE$/i.test(p)) || /^\d{8}$/.test(value))) current.DTEND_IS_DATE = "1";
  }
  return { events, errors };
}

function escape(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

const compact = (iso: string) => iso.replace(/-/g, "");

/** Folds long lines at 75 octets-ish (characters are fine for calendar clients in practice). */
function fold(line: string) {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 73) parts.push((i ? " " : "") + line.slice(i, i + 73));
  return parts.join("\r\n");
}

export type FeedEvent = { uid: string; title: string; date: string; endDate?: string | null; yearly?: boolean; description?: string };

export function buildIcs(name: string, events: FeedEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FREITTY//People OS//UK", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${escape(name)}`];
  for (const e of events) {
    const end = e.endDate ?? e.date;
    const exclusiveEnd = new Date(`${end}T00:00:00Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@people-os`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(exclusiveEnd.toISOString().slice(0, 10))}`,
      `SUMMARY:${escape(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
      ...(e.yearly ? ["RRULE:FREQ=YEARLY"] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
