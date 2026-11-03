import type { OpportunityIdentity } from "./opportunity-duplicates";
import { publicLink } from "./shared-links";

type SearchSource = { title: string; url: string };

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
    if (!host.endsWith(".devpost.com") || host === "secure.devpost.com")
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
      !/\b(ai|artificial intelligence|machine learning|agent|hackathon|build|code)\b/i.test(
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
