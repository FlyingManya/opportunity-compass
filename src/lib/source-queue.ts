import { publicLink } from "./shared-links";
import { sameOpportunity, type OpportunityIdentity } from "./opportunity-duplicates";

type Source = { title: string; url: string };
const generic = new Set([
  "find", "search", "show", "looking", "current", "new", "remote", "online",
  "virtual", "opportunity", "opportunities", "event", "events", "competition",
  "competitions", "hackathon", "hackathons", "program", "programs", "join",
  "the", "and", "for", "with", "from", "that", "can", "want", "some", "please",
]);
const words = (value: string) =>
  [...new Set((value.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((word) => word.length > 2 && !generic.has(word)))];

export function sourceQueue(
  sources: Source[],
  request: string,
  profileKeywords: string[],
  known: OpportunityIdentity[],
  limit = 20,
  today = new Date().toISOString().slice(0, 10),
) {
  const topicWords = words(request.split(/\bfor\b/i)[0]);
  const requestWords = topicWords.length ? topicWords : words(request);
  const contextWords = words(request);
  const profileWords = words(profileKeywords.join(" "));
  const knownUrls = new Set(known.map((item) => publicLink(item.sourceUrl)).filter(Boolean));
  const seen = new Set<string>();
  return sources
    .map((source) => {
      const sourceUrl = publicLink(source.url);
      if (!sourceUrl || knownUrls.has(sourceUrl) || seen.has(sourceUrl)) return null;
      seen.add(sourceUrl);
      const title = source.title.replace(/\s+/g, " ").trim().slice(0, 180);
      if (title.length < 8 || /^(search results|home|log in|sign up|privacy|terms)$/i.test(title)) return null;
      if (known.some((item) => sameOpportunity(item, {
        title, sourceUrl, organizer: new URL(sourceUrl).hostname, deadline: "",
      }))) return null;
      const years = [...`${title} ${new URL(sourceUrl).pathname}`.matchAll(/\b20\d{2}\b/g)]
        .map((match) => Number(match[0]));
      if (years.length && Math.max(...years) < Number(today.slice(0, 4))) return null;
      const text = `${title} ${new URL(sourceUrl).pathname}`.toLowerCase();
      const requestHits = requestWords.filter((word) => text.includes(word)).length;
      if (requestWords.length && !requestHits) return null;
      const contextHits = contextWords.filter((word) => text.includes(word)).length;
      const profileHits = profileWords.filter((word) => text.includes(word)).length;
      return {
        title,
        sourceUrl,
        organizer: new URL(sourceUrl).hostname.replace(/^www\./, ""),
        score: requestHits * 10 + contextHits * 2 + profileHits,
      };
    })
    .filter((item) => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...item }) => item);
}
