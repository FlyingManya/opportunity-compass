import type { OpportunityIdentity } from "./opportunity-duplicates";
import { publicLink } from "./shared-links";

type SearchSource = { title: string; url: string };
const nonEventDevpostHosts = new Set([
  "secure", "info", "blog", "help", "support", "www", "api", "docs",
]);

export function plausibleEventSource(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!host.endsWith(".devpost.com")) return true;
    return !nonEventDevpostHosts.has(host.split(".")[0]);
  } catch {
    return false;
  }
}

export function isDevpostEventSource(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().endsWith(".devpost.com") &&
      plausibleEventSource(url);
  } catch {
    return false;
  }
}

// Devpost publishes event dates and attendance mode in JSON-LD on each event page.
// Search citations alone can point to closed or in-person events.
export async function currentDevpostEvent(
  sourceUrl: string,
  today: string,
  remoteOnly = false,
  fetcher: typeof fetch = fetch,
) {
  if (!isDevpostEventSource(sourceUrl)) return false;
  const eventUrl = new URL(sourceUrl);
  eventUrl.pathname = "/";
  eventUrl.search = "";
  const response = await fetcher(eventUrl.toString(), {
    redirect: "manual",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return false;
  const html = await response.text();
  const jsonLd = html.match(
    /<script\b(?=[^>]*\bid=["']challenge-json-ld["'])[^>]*>([\s\S]*?)<\/script>/i,
  )?.[1];
  if (!jsonLd) return false;
  try {
    const event = JSON.parse(jsonLd) as {
      endDate?: string;
      eventAttendanceMode?: string;
    };
    if (!event.endDate || event.endDate.slice(0, 10) < today) return false;
    if (remoteOnly && !/OnlineEventAttendanceMode/i.test(event.eventAttendanceMode || ""))
      return false;
    return true;
  } catch {
    return false;
  }
}

// A search citation is a lead, not proof that registration is still open.
export function hackathonLeadsFromSources(
  sources: SearchSource[],
  request: string,
  known: OpportunityIdentity[],
  today: string,
) {
  if (!/\bhackathons?\b/i.test(request)) return [];
  const year = Number(today.slice(0, 4));
  const seen = new Set(
    known.map((item) => new URL(item.sourceUrl).hostname.toLowerCase()),
  );
  const leads: { title: string; organizer: string; sourceUrl: string }[] = [];
  for (const source of sources) {
    const url = publicLink(source.url);
    if (!url) continue;
    const host = new URL(url).hostname.toLowerCase();
    if (!host.endsWith(".devpost.com") || !plausibleEventSource(url))
      continue;
    if (seen.has(host)) continue;
    const title = source.title
      .replace(/\s*[|–-]\s*Devpost.*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (
      title.length < 8 ||
      /^(devpost|hackathons?|rules|schedule)$/i.test(title)
    )
      continue;
    const years = [...`${title} ${host}`.matchAll(/\b20\d{2}\b/g)].map(
      (match) => Number(match[0]),
    );
    if (years.length && Math.max(...years) < year) continue;
    if (
      /\b(ai|artificial intelligence|machine learning)\b/i.test(request) &&
      !/\b(ai|artificial intelligence|machine learning|agent)\b/i.test(
        `${title} ${host}`,
      )
    )
      continue;
    seen.add(host);
    leads.push({
      title: title.slice(0, 180),
      organizer: "Devpost event",
      sourceUrl: url,
    });
    if (leads.length === 4) break;
  }
  return leads;
}
