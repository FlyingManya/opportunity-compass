import { publicLink } from "./shared-links";

type Source = { title: string; url: string };

function canonical(url: string) {
  const parsed = new URL(url);
  return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
}

function titleWords(title: string) {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(
        (word) =>
          word.length > 2 &&
          !/^(the|and|for|with|open|apply|event|20\d\d)$/.test(word),
      ),
  );
}

export function matchedDiscoverySource(
  candidateUrl: string,
  candidateTitle: string,
  sources: Source[],
  request: string,
) {
  const url = publicLink(candidateUrl);
  if (!url) return null;
  const exact = sources.find(
    (source) => canonical(source.url) === canonical(url),
  );
  if (exact) return url;

  const host = new URL(url).hostname.replace(/^www\./, "");
  const sameSite = sources.filter(
    (source) => new URL(source.url).hostname.replace(/^www\./, "") === host,
  );
  if (request.includes(url) && sameSite.length) return url;

  const words = titleWords(candidateTitle);
  if (words.size < 2) return null;
  const matching = sameSite.filter((source) => {
    const sourceWords = titleWords(source.title);
    const overlap = [...words].filter((word) => sourceWords.has(word)).length;
    return overlap >= 2 && overlap / words.size >= 0.6;
  });
  // Use the actual search-result page, not a model-generated variation of its URL.
  return matching.length === 1 ? matching[0].url : null;
}
