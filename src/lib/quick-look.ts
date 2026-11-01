import type { Profile } from "./types";
import type { AgentPreferences } from "./agent-types";

export type QuickLookTopic = { label: string; query: string };

const topic = (label: string): QuickLookTopic => ({
  label,
  query: `Find current ${label.toLowerCase()} opportunities with future deadlines that fit my profile.`,
});

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

export function quickLookMetaPrompt(
  profile: Profile,
  preferences: AgentPreferences,
  resumeText = "",
) {
  const profileDetails = preferences.useProfile
    ? `Profile: ${JSON.stringify({ profession: profile.profession, skills: profile.skills, interests: profile.interests, experience: profile.experience })}`
    : "";
  const resumeDetails =
    preferences.useResume && resumeText
      ? `Résumé text: ${JSON.stringify(resumeText.slice(0, 8000))}`
      : "";
  return `Suggest 4 to 6 short opportunity topics tailored to this person. Return ONLY a JSON array of strings, each 1 to 3 words. Use only the supplied interests, profession, experience, search brief, and résumé to choose relevant fields; vary the topics for each person. Do not invent events or deadlines.\n${profileDetails}\nSearch brief: ${JSON.stringify(preferences.brief)}\n${resumeDetails}`;
}
