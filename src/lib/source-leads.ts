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
export async function devpostEventDetails(
  sourceUrl: string,
  today: string,
  remoteOnly = false,
  fetcher: typeof fetch = fetch,
) {
  if (!isDevpostEventSource(sourceUrl)) return null;
  const eventUrl = new URL(sourceUrl);
  eventUrl.pathname = "/";
  eventUrl.search = "";
  const response = await fetcher(eventUrl.toString(), {
    redirect: "manual",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return null;
  const html = await response.text();
  const jsonLd = html.match(
    /<script\b(?=[^>]*\bid=["']challenge-json-ld["'])[^>]*>([\s\S]*?)<\/script>/i,
  )?.[1];
  if (!jsonLd) return null;
  try {
    const event = JSON.parse(jsonLd) as {
      name?: string;
      organizer?: { name?: string };
      endDate?: string;
      eventAttendanceMode?: string;
    };
    if (!event.endDate || event.endDate.slice(0, 10) < today) return null;
    if (remoteOnly && !/OnlineEventAttendanceMode/i.test(event.eventAttendanceMode || ""))
      return null;
    return {
      deadline: event.endDate.slice(0, 10),
      title: event.name || "Hackathon",
      organizer: event.organizer?.name || "Devpost event",
    };
  } catch {
    return null;
  }
}

export async function currentDevpostEvent(
  sourceUrl: string,
  today: string,
  remoteOnly = false,
  fetcher: typeof fetch = fetch,
) {
  return !!(await devpostEventDetails(sourceUrl, today, remoteOnly, fetcher));
}

export async function liveDevpostHackathons(
  request: string,
  today: string,
  known: OpportunityIdentity[],
  fetcher: typeof fetch = fetch,
) {
  if (!/\bhackathons?\b/i.test(request)) return [];
  const aiOnly = /\b(ai|artificial intelligence|machine learning)\b/i.test(request);
  const remoteOnly = /\b(remote|online|virtual)\b/i.test(request);
  const params = new URLSearchParams({ search: aiOnly ? "AI" : "hackathon" });
  params.append("status[]", "open");
  if (remoteOnly) params.append("challenge_type[]", "online");
  let listed: {
    hackathons?: Array<{
      title?: string;
      url?: string;
      open_state?: string;
      displayed_location?: { location?: string };
      themes?: Array<{ name?: string }>;
    }>;
  };
  try {
    const response = await fetcher(`https://devpost.com/api/hackathons?${params}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];
    listed = await response.json();
  } catch {
    return [];
  }
  const seen = new Set(known.map((item) => new URL(item.sourceUrl).hostname));
  const results: Array<{ title: string; organizer: string; sourceUrl: string; deadline: string }> = [];
  for (const item of (listed.hackathons || []).slice(0, 20)) {
    const sourceUrl = item.url && publicLink(item.url);
    if (!sourceUrl || !isDevpostEventSource(sourceUrl)) continue;
    const host = new URL(sourceUrl).hostname;
    if (seen.has(host) || item.open_state !== "open") continue;
    if (remoteOnly && item.displayed_location?.location !== "Online") continue;
    if (aiOnly && !/\b(ai|artificial intelligence|machine learning|agent)\b/i.test(
      `${item.title || ""} ${(item.themes || []).map((theme) => theme.name).join(" ")}`,
    )) continue;
    try {
      const details = await devpostEventDetails(sourceUrl, today, remoteOnly, fetcher);
      if (!details) continue;
      seen.add(host);
      results.push({ ...details, sourceUrl });
      if (results.length >= 4) break;
    } catch {
      // A broken event page is not a verified opportunity.
    }
  }
  return results;
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
