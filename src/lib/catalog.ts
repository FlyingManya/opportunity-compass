import type { Opportunity, Profile, Category } from "./types";
const date = (month: number, day: number) => {
  const n = new Date();
  return new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + month, day, 12),
  ).toISOString();
};
export const categoryLabels: Record<Category, string> = {
  all: "For you",
  jobs: "Jobs & internships",
  hackathons: "Hackathons",
  "women-tech": "Competitions & events",
  custom: "Explore something new",
};
export const catalog: Opportunity[] = [
  {
    id: "sample-build-weekend",
    title: "Build something that matters.",
    organizer: "Orbit AI · Sample organizer",
    category: "hackathons",
    kind: "AI Hackathon",
    description:
      "A collaborative weekend to turn an everyday problem into a useful AI prototype. Bring an idea, meet a team, and learn by building.",
    format: "Remote",
    location: "Worldwide",
    deadline: date(1, 12),
    eventDate: date(1, 20),
    funding: "Free entry · sample prize pool",
    tags: ["AI", "Beginner friendly", "Teams of 1–4"],
    skills: ["Python", "JavaScript", "AI"],
    requirements: [
      "Open to participants aged 18 and over",
      "Individual builders and teams welcome",
      "Submit a working demo and project description",
    ],
    tasks: [
      "Read the participation requirements",
      "Choose an idea and find a teammate if needed",
      "Prepare a short project proposal",
      "Complete registration",
      "Build and submit your demo",
    ],
    color: "lilac",
    art: 1,
    sample: true,
  },
  {
    id: "sample-fellowship",
    title: "Your next chapter in tech.",
    organizer: "Her Next Chapter · Sample organizer",
    category: "custom",
    kind: "Fellowship",
    description:
      "A mentorship-led fellowship for women exploring technology leadership, community, and their next professional chapter.",
    format: "Hybrid",
    location: "India",
    deadline: date(1, 16),
    eventDate: date(2, 5),
    funding: "Partial scholarships · sample",
    tags: ["Mentorship", "Women in tech", "Community"],
    skills: ["Leadership", "Communication", "Technology"],
    requirements: [
      "Program is intended for women in technology",
      "Share a learning goal and relevant experience",
      "Availability for weekly sessions is required",
    ],
    tasks: [
      "Review the program eligibility",
      "Update your résumé",
      "Write a personal statement",
      "Prepare one project example",
      "Submit your application",
    ],
    color: "peach",
    art: 2,
    sample: true,
  },
  {
    id: "sample-frontend",
    title: "Build a more thoughtful web.",
    organizer: "Northstar Studio · Sample employer",
    category: "jobs",
    kind: "Frontend opportunity",
    description:
      "Work with a small design-minded team on accessible web experiences. A sample role for exploring how career opportunities appear in your dashboard.",
    format: "Remote",
    location: "India",
    deadline: date(1, 22),
    eventDate: date(2, 10),
    funding: "Compensation not stated",
    tags: ["React", "Early career", "Design-minded"],
    skills: ["React", "JavaScript", "CSS"],
    requirements: [
      "Share examples of frontend work",
      "Comfort working with JavaScript and CSS",
      "Work authorization needs confirmation",
    ],
    tasks: [
      "Review the role requirements",
      "Choose relevant portfolio projects",
      "Tailor your résumé",
      "Draft an introduction",
      "Complete the application",
    ],
    color: "mint",
    art: 0,
    sample: true,
  },
  {
    id: "sample-pottery",
    title: "Make a little room for making.",
    organizer: "Clay & Company · Sample studio",
    category: "custom",
    kind: "Pottery workshop",
    description:
      "A gentle introduction to working with clay. Explore a creative interest, learn a new skill, and make something with your hands.",
    format: "In person",
    location: "Bengaluru · sample location",
    deadline: date(1, 8),
    eventDate: date(1, 15),
    funding: "₹1,200 · sample price",
    tags: ["Creative", "Weekend", "No experience needed"],
    skills: ["Pottery", "Art", "Craft"],
    requirements: [
      "No previous pottery experience required",
      "In-person attendance is needed",
      "Check location and accessibility with the organizer",
    ],
    tasks: [
      "Confirm the studio location",
      "Check available weekend sessions",
      "Review the materials and cancellation policy",
      "Reserve your place",
    ],
    color: "butter",
    art: 3,
    sample: true,
  },
  {
    id: "sample-cloud-sprint",
    title: "A fresh challenge in the cloud.",
    organizer: "Cloud Commons · Sample organizer",
    category: "hackathons",
    kind: "Developer challenge",
    description:
      "Explore cloud tools through a small team challenge focused on useful applications and clear demonstrations.",
    format: "Remote",
    location: "Worldwide",
    deadline: date(2, 7),
    eventDate: date(2, 14),
    funding: "Free entry · sample",
    tags: ["Cloud", "Open source", "Teamwork"],
    skills: ["Python", "Cloud", "DevOps"],
    requirements: [
      "Beginner and experienced developers welcome",
      "A public project repository is required",
      "Complete the project during the challenge",
    ],
    tasks: [
      "Review the challenge brief",
      "Set up your project repository",
      "Register your team",
      "Build and document your project",
      "Record a short demo",
    ],
    color: "mint",
    art: 1,
    sample: true,
  },
  {
    id: "sample-tech-community",
    title: "Find your people in tech.",
    organizer: "Women Build Together · Sample community",
    category: "women-tech",
    kind: "Community event",
    description:
      "A welcoming day of practical workshops, conversations, and new connections for women building careers in technology.",
    format: "In person",
    location: "New Delhi · sample location",
    deadline: date(1, 25),
    eventDate: date(2, 2),
    funding: "Student tickets · sample",
    tags: ["Networking", "Workshops", "Students"],
    skills: ["Technology", "Communication", "Networking"],
    requirements: [
      "Open to students and professionals",
      "Travel support is not stated",
      "Check registration availability before making plans",
    ],
    tasks: [
      "Check the event agenda",
      "Confirm ticket eligibility",
      "Review travel requirements",
      "Register for the event",
    ],
    color: "peach",
    art: 2,
    sample: true,
  },
  {
    id: "sample-data-internship",
    title: "Turn your curiosity into insight.",
    organizer: "Fieldnotes Labs · Sample employer",
    category: "jobs",
    kind: "Data internship",
    description:
      "An illustrative early-career opportunity for people who enjoy exploring data and explaining what they discover.",
    format: "Hybrid",
    location: "Bengaluru · sample location",
    deadline: date(2, 12),
    eventDate: date(2, 24),
    funding: "Stipend not stated",
    tags: ["Python", "Data", "Internship"],
    skills: ["Python", "SQL", "Data analysis"],
    requirements: [
      "Basic Python or SQL experience",
      "Student eligibility needs confirmation",
      "Availability and location need confirmation",
    ],
    tasks: [
      "Review the internship requirements",
      "Prepare a data project example",
      "Update your résumé",
      "Submit your application",
    ],
    color: "lilac",
    art: 0,
    sample: true,
  },
  {
    id: "sample-dance",
    title: "A new rhythm for your weekends.",
    organizer: "Movement Club · Sample studio",
    category: "custom",
    kind: "Dance workshop",
    description:
      "A sample introductory movement class showing how your dashboard can support interests outside your profession.",
    format: "In person",
    location: "Mumbai · sample location",
    deadline: date(2, 15),
    eventDate: date(2, 21),
    funding: "₹800 · sample price",
    tags: ["Dance", "Weekend", "Beginner friendly"],
    skills: ["Dance", "Music", "Movement"],
    requirements: [
      "Beginners welcome",
      "Confirm location and physical access",
      "No performance experience needed",
    ],
    tasks: [
      "Check the class style and location",
      "Confirm what to bring",
      "Reserve a session",
    ],
    color: "butter",
    art: 3,
    sample: true,
  },
];
export function relevance(o: Opportunity, p: Profile) {
  const skills = p.skills.map((s) => s.toLowerCase());
  const interests = p.interests.map((s) => s.toLowerCase());
  const matches = o.skills.filter((s) =>
    skills.some(
      (k) => s.toLowerCase().includes(k) || k.includes(s.toLowerCase()),
    ),
  );
  const interested = interests.some((i) =>
    (o.category + " " + o.tags.join(" ") + " " + o.kind)
      .toLowerCase()
      .includes(i),
  );
  const location =
    p.city && o.location.toLowerCase().includes(p.city.toLowerCase());
  const ineligible =
    p.age !== null && p.age < 18 && o.id === "sample-build-weekend";
  return {
    score: ineligible
      ? -100
      : matches.length * 3 + (interested ? 2 : 0) + (location ? 1 : 0),
    matches,
    reason: ineligible
      ? "This sample requires age 18 or over."
      : matches.length
        ? `Connects with your ${matches.slice(0, 2).join(" and ")} experience.`
        : interested
          ? "Connects with an interest in your profile."
          : "Explore the requirements to see whether this could fit.",
    ineligible,
  };
}
export function filterCatalog(
  items: Opportunity[],
  category: Category,
  query: string,
  month: string,
  dateType: "deadline" | "event",
  profile: Profile,
) {
  const q = query.toLowerCase().trim();
  return items
    .filter(
      (o) =>
        (category === "all" ||
          (category === "women-tech"
            ? o.category === "women-tech" ||
              o.category === "hackathons" ||
              /competition|challenge|workshop|event/i.test(o.kind)
            : o.category === category)) &&
        (!q ||
          `${o.title} ${o.description} ${o.kind} ${o.location} ${o.tags.join(" ")}`
            .toLowerCase()
            .includes(q)) &&
        (!month ||
          (dateType === "deadline" ? o.deadline : o.eventDate).slice(0, 7) ===
            month),
    )
    .sort((a, b) => relevance(b, profile).score - relevance(a, profile).score);
}
