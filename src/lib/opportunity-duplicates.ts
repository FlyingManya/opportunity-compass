export type OpportunityIdentity = {
  title: string;
  deadline: string;
  sourceUrl: string;
  organizer: string;
};

function page(url: string) {
  const parsed = new URL(url);
  return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
}

function words(title: string) {
  const normalized = title
    .toLowerCase()
    .replace(/capture the flag\s*\(ctf\)/g, "capture the flag")
    .replace(/\bctf\b/g, "capture the flag");
  return new Set(
    normalized
      .split(/[^a-z0-9]+/)
      .filter(
        (word) =>
          word.length > 2 && !["the", "and", "for", "with"].includes(word),
      ),
  );
}

export function sameOpportunity(
  left: OpportunityIdentity,
  right: OpportunityIdentity,
) {
  if (page(left.sourceUrl) === page(right.sourceUrl)) return true;
  if (left.deadline !== right.deadline) return false;
  const leftWords = words(left.title);
  const rightWords = words(right.title);
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  if (shared < 4 || shared / union < 0.8) return false;
  const sameSite =
    new URL(left.sourceUrl).hostname.replace(/^www\./, "") ===
    new URL(right.sourceUrl).hostname.replace(/^www\./, "");
  const organizerWords = words(left.organizer);
  const sameOrganizer = [...words(right.organizer)].some((word) =>
    organizerWords.has(word),
  );
  return sameSite || sameOrganizer;
}

export function uniqueOpportunities<T extends OpportunityIdentity>(items: T[]) {
  const unique: T[] = [];
  for (const item of items)
    if (!unique.some((existing) => sameOpportunity(existing, item)))
      unique.push(item);
  return unique;
}
