export type Category = "all" | "jobs" | "hackathons" | "women-tech" | "custom";
export type Status = "interested" | "preparing" | "submitted";
export type Profile = {
  name: string;
  age: number | null;
  profession: string;
  city: string;
  country: string;
  timezone: string;
  skills: string[];
  interests: string[];
  experience: { field: string; years: number }[];
  onboarded: boolean;
};
export type User = {
  id: string;
  email: string;
  profile: Profile;
  resume: { name: string; size: number } | null;
};
export type Opportunity = {
  id: string;
  title: string;
  organizer: string;
  category: Exclude<Category, "all">;
  kind: string;
  description: string;
  format: "Remote" | "In person" | "Hybrid";
  location: string;
  deadline: string;
  eventDate: string;
  funding: string;
  tags: string[];
  skills: string[];
  requirements: string[];
  tasks: string[];
  color: string;
  art: number;
  sample: true;
};
export type Saved = {
  opportunityId: string;
  status: Status;
  completedTasks: number[];
  savedAt: string;
};
export const emptyProfile: Profile = {
  name: "",
  age: null,
  profession: "",
  city: "",
  country: "",
  timezone: "Asia/Kolkata",
  skills: [],
  interests: [],
  experience: [],
  onboarded: false,
};
