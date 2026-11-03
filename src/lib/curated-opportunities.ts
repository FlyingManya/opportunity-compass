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
    sourceUrl: "https://ugreenhackathon.devpost.com/",
    title: "UGREEN Hackathon 2026 on AI NAS",
    organizer: "UGREEN · Devpost",
    description:
      "An online challenge to build an AI Skill for UGREEN AI NAS. Round 1 submissions close 15 November 2026 at 11:45 PM Pacific Time. A NAS is not needed for round 1; check the official rules for country and age eligibility.",
    deadline: "2026-11-15",
    reason:
      "A current online AI development challenge with a first round open to eligible individual developers.",
    provenance: "curated",
  },
  {
    sourceUrl: "https://firebasehybridaihackathon.devpost.com/",
    title: "#BuildHybridAI 2026",
    organizer: "Firebase AI Logic · Devpost",
    description:
      "An online challenge to build AI apps that run on-device and in the cloud. Registration is open; submissions run 9–30 November 2026 and close at 2:00 PM Pacific Time on 30 November. Full rules are scheduled for release on 9 November.",
    deadline: "2026-11-30",
    reason:
      "A current online AI app-building challenge. Check the full rules when published before submitting.",
    provenance: "curated",
  },
  {
    sourceUrl: "https://codegeist2026.devpost.com/",
    title: "Codegeist 2026",
    organizer: "Atlassian · Devpost",
    description:
      "Atlassian's online hackathon to build an app on Forge that extends an Atlassian product. Submissions close 22 December 2026 at 12:00 PM Pacific Time. Adults in eligible countries can enter; review the official rules for exclusions.",
    deadline: "2026-12-22",
    reason:
      "An open developer challenge with an AI theme and a longer submission window.",
    provenance: "curated",
  },
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
