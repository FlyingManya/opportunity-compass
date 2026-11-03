// Manually reviewed, account-scoped cards for recording the product demo.
// Do not invent deadlines for programs or events that publish none.
export type DemoOpportunity = {
  sourceUrl: string;
  title: string;
  organizer: string;
  description: string;
  deadline: string;
  eventDate?: string;
  reason: string;
  provenance: "demo";
};

export const demoOpportunities: DemoOpportunity[] = [
  {
    sourceUrl: "https://kiroween.devpost.com/",
    title: "Kiroween 2026",
    organizer: "Kiro · Devpost",
    description:
      "An online hackathon to build an application using Kiro. Submissions close 4 December 2026 at 2:00 PM Pacific Time; check the official rules for eligibility.",
    deadline: "2026-12-04",
    reason:
      "A current developer hackathon with an AI and agent-building focus.",
    provenance: "demo",
  },
  {
    sourceUrl: "https://paypalaihackathon.devpost.com/",
    title: "PayPal AI Hackathon",
    organizer: "PayPal · Devpost",
    description:
      "A global online challenge to build with PayPal and AI. Submissions close 12 November 2026 at 12:00 PM Pacific Standard Time; check country exceptions in the rules.",
    deadline: "2026-11-12",
    reason: "A current AI-building challenge for developers and other makers.",
    provenance: "demo",
  },
  {
    sourceUrl:
      "https://www.eventbrite.com/e/womenhack-india-remote-november-18-2026-tickets-2003043392708",
    title: "WomenHack India (Remote)",
    organizer: "WomenHack",
    description:
      "A virtual women-in-tech networking and speed-hiring event scheduled for 18 November 2026, 6:00–8:00 PM IST. Attendance is invite-only; the listing does not state an application deadline.",
    deadline: "",
    eventDate: "2026-11-18",
    reason: "An India-friendly virtual event for meeting tech hiring teams.",
    provenance: "demo",
  },
  {
    sourceUrl:
      "https://amazon.jobs/content/en/career-programs/university/women-of-the-world",
    title: "Amazon Women of the World (WoW)",
    organizer: "Amazon",
    description:
      "A career-readiness community for women university students, with technical-skills resources, networking, and events. Amazon does not publish a current application deadline on this program page.",
    deadline: "",
    reason:
      "A women-in-tech program to explore; check current eligibility and registration on Amazon's page.",
    provenance: "demo",
  },
];
