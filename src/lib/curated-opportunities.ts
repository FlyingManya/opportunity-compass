import type { AgentMessage, AgentPreferences, SharedLead } from "./agent-types";

export type CuratedOpportunity = {
  sourceUrl: string;
  title: string;
  organizer: string;
  description: string;
  deadline: string;
  reason: string;
  provenance: "curated";
};

// Each entry must have a dated application window on its official organizer page.
// Keep this list small and recheck entries before changing their dates.
const opportunities: CuratedOpportunity[] = [
  {
    sourceUrl:
      "https://www.wicys.org/event/bloomberg-x-wicys-2026-ctf-application-open/",
    title: "Bloomberg x WiCyS 2026 Capture the Flag",
    organizer: "Women in CyberSecurity (WiCyS)",
    description:
      "A virtual cybersecurity competition on 3–4 December 2026. Applications close 13 November 2026 at 1:00 PM Central Time. Places are for eligible early- and mid-career WiCyS global members and students.",
    deadline: "2026-11-13",
    reason:
      "A current women-in-tech competition to explore if you are interested in cybersecurity and meet the WiCyS membership requirements.",
    provenance: "curated",
  },
];
const aiHackathons: CuratedOpportunity[] = [
  {
    sourceUrl: "https://paypalaihackathon.devpost.com/",
    title: "PayPal AI Hackathon",
    organizer: "PayPal · Devpost",
    description:
      "A global online hackathon for building an app or agent that meaningfully uses both PayPal and AI. The official Devpost page lists a 12 November 2026 deadline at 12:00 PM Pacific Standard Time. Check the full rules and country exceptions before joining.",
    deadline: "2026-11-12",
    reason:
      "An open AI-building challenge for developers, designers, founders, and students.",
    provenance: "curated",
  },
];

export function curatedForUser(
  preferences: AgentPreferences,
  messages: AgentMessage[],
  leads: SharedLead[],
  today: string,
): CuratedOpportunity[] {
  const interests = [
    preferences.brief,
    ...preferences.sources,
    ...messages
      .filter((item) => item.role === "user")
      .map((item) => item.content),
    ...leads.filter((item) => !item.archived).map((item) => item.url),
  ].join(" ");
  const wantsWomenInTech =
    /\b(women|woman|female|girls|wicys)\b/i.test(interests) ||
    /rewritingthecode\.org|ghc\.anitab\.org|womenhack\.com/i.test(interests);
  const wantsAiHackathon =
    /\b(ai|artificial intelligence|machine learning|paypal)\b/i.test(
      interests,
    ) && /\b(hackathons?|competitions?|challenges?|paypal)\b/i.test(interests);
  return [
    ...(wantsWomenInTech ? opportunities : []),
    ...(wantsAiHackathon ? aiHackathons : []),
  ].filter((item) => item.deadline >= today);
}
