import type { Profile } from "./types";

export type QuickLookTopic = { label: string; query: string };

const topic = (label: string): QuickLookTopic => ({
  label,
  query: `Find current ${label.toLowerCase()} opportunities with future deadlines that fit my profile.`,
});

export function quickLookFallback(
  profile: Profile,
  brief = "",
  resumeText = "",
) {
  const words = [
    profile.profession,
    ...profile.interests,
    ...profile.skills,
    ...profile.experience.map((item) => item.field),
    brief,
    resumeText.slice(0, 4000),
  ]
    .join(" ")
    .toLowerCase();
  const labels: string[] = [];
  const add = (...values: string[]) => {
    for (const value of values) if (!labels.includes(value)) labels.push(value);
  };
  if (
    /medic|clinical|health|nurs|pharma|biology|biomedical|research/.test(words)
  )
    add(
      "Medical research",
      "Biology research",
      "Health fellowships",
      "Medical competitions",
    );
  if (/ai\b|machine learning|data science|artificial intelligence/.test(words))
    add("AI hackathons", "AI fellowships");
  if (
    /software|developer|engineer|frontend|backend|programming|coding|react|python/.test(
      words,
    )
  )
    add("Tech hackathons", "Developer roles", "Open source programs");
  if (/women|woman|female/.test(words))
    add("Women in tech", "Women fellowships");
  if (/design|art|illustrat|creative/.test(words))
    add("Design challenges", "Creative workshops");
  if (/dance|sing|music|theatre|performance/.test(words))
    add("Arts competitions", "Creative fellowships");
  if (/pottery|ceramic|craft/.test(words))
    add("Pottery workshops", "Craft classes");
  for (const interest of profile.interests) {
    const label = interest.trim().replace(/\s+/g, " ").slice(0, 32);
    const suggested =
      /opportunit|event|hackathon|competition|fellowship|research|workshop|class/i.test(
        label,
      )
        ? label
        : `${label} opportunities`;
    if (
      label &&
      !labels.some((item) => item.toLowerCase().includes(label.toLowerCase()))
    )
      add(suggested);
  }
  return labels.slice(0, 6).map(topic);
}

export function parseQuickLookReply(value: string): QuickLookTopic[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      value.slice(value.indexOf("["), value.lastIndexOf("]") + 1),
    );
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return [
    ...new Set(
      parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().replace(/\s+/g, " "))
        .filter((item) => item.length >= 3 && item.length <= 35),
    ),
  ]
    .slice(0, 6)
    .map(topic);
}
