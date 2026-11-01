export type AgentMode = {
  connected: boolean;
  label: string;
  destination: string;
  search: boolean;
};
export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources?: { title: string; url: string }[];
};
export type ResearchedSaved = {
  id: string;
  sourceUrl: string;
  title: string;
  organizer: string;
  description: string;
  deadline: string;
  savedAt: string;
};
export type SharedLead = {
  id: string;
  url: string;
  platform: "Instagram" | "LinkedIn" | "Website";
  title: string;
  caption: string;
  metadata: "public-preview" | "provided-text" | "link-only";
  createdAt: string;
  archived: boolean;
};
export type AgentPreferences = {
  brief: string;
  sources: string[];
  useProfile: boolean;
  useResume?: boolean;
  useMetaContext?: boolean;
};
export const emptyAgentPreferences: AgentPreferences = {
  brief: "",
  sources: [],
  useProfile: false,
  useResume: false,
  useMetaContext: false,
};
