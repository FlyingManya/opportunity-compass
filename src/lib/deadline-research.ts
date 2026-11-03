import { publicLink } from "./shared-links";

export type DeadlineResearch = {
  deadline: string;
  evidence: string;
  sourceUrl: string;
  expired: boolean;
};

function relatedPage(candidate: string, original: string) {
  const a = new URL(candidate);
  const b = new URL(original);
  const host = (value: string) => value.replace(/^www\./, "").toLowerCase();
  const path = (value: string) => value.replace(/\/+$/, "") || "/";
  const aPath = path(a.pathname);
  const bPath = path(b.pathname);
  return (
    host(a.hostname) === host(b.hostname) &&
    (aPath === bPath || (bPath !== "/" && aPath.startsWith(`${bPath}/`)))
  );
}

export function parseDeadlineResearch(
  content: string,
  sources: { url: string }[],
  originalUrl: string,
  today: string,
): DeadlineResearch | null {
  const raw = content.replace(/^```(?:json)?\s*|\s*```$/g, "");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  if (
    typeof data.deadline !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.deadline) ||
    !Number.isFinite(Date.parse(data.deadline)) ||
    new Date(data.deadline).toISOString().slice(0, 10) !== data.deadline ||
    typeof data.evidence !== "string" ||
    data.evidence.trim().length < 8 ||
    typeof data.sourceUrl !== "string"
  )
    return null;
  const sourceUrl = publicLink(data.sourceUrl);
  if (!sourceUrl || !relatedPage(sourceUrl, originalUrl)) return null;
  const cited = sources.some((source) => {
    const url = publicLink(source.url);
    return url && relatedPage(url, sourceUrl);
  });
  if (!cited) return null;
  return {
    deadline: data.deadline,
    evidence: data.evidence.trim().slice(0, 300),
    sourceUrl,
    expired: data.deadline < today,
  };
}
