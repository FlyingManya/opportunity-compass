import type { Opportunity } from "./types";
import type { ResearchedSaved } from "./agent-types";
const escape = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
// RFC 5545 folds content lines at 75 octets without splitting UTF-8 code points.
function fold(line: string) {
  const encoder = new TextEncoder();
  let result = "",
    part = "",
    size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 75) {
      result += part + "\r\n";
      part = " ";
      size = 1;
    }
    part += char;
    size += bytes;
  }
  return result + part;
}
export function calendarFile(
  items: (Opportunity | ResearchedSaved)[],
  kind: "deadline" | "event" = "deadline",
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Opportunity Compass//Starter//EN",
    "CALSCALE:GREGORIAN",
    ...items.flatMap((o) => {
      const sample = "sample" in o && o.sample;
      if (!sample && kind === "event") return [];
      if (!o.deadline && kind === "deadline") return [];
      const iso =
        kind === "deadline" ? o.deadline : (o as Opportunity).eventDate;
      const day = iso.slice(0, 10).replaceAll("-", "");
      const next = new Date(iso);
      next.setUTCDate(next.getUTCDate() + 1);
      return [
        "BEGIN:VEVENT",
        `UID:${o.id}-${kind}@opportunity-compass.local`,
        `DTSTAMP:${new Date()
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}/, "")}`,
        `DTSTART;VALUE=DATE:${day}`,
        `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replaceAll("-", "")}`,
        `SUMMARY:${escape(`${sample ? "[SAMPLE] " : ""}${kind === "deadline" ? "Application deadline: " : ""}${o.title}`)}`,
        `DESCRIPTION:${escape(sample ? "Fictional sample opportunity for testing Opportunity Compass. This date is not an actual application deadline. Exact cutoff time and timezone are not specified.\n" + o.description : `Check the official page for the exact cutoff time and eligibility.\n${o.description}\n${(o as ResearchedSaved).sourceUrl}`)}`,
        ...(sample ? [`LOCATION:${escape((o as Opportunity).location)}`] : []),
        "END:VEVENT",
      ];
    }),
    "END:VCALENDAR",
    "",
  ];
  return lines.map(fold).join("\r\n");
}
