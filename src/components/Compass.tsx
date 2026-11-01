"use client";
import AgentPanel from "./AgentPanel";
import DiscoveryFeed from "./DiscoveryFeed";
import QuickLook from "./QuickLook";
import { useState, useEffect, useRef } from "react";
import {
  MessageCircle,
  Compass as CompassIcon,
  LayoutGrid,
  Bookmark,
  CalendarDays,
  UserRound,
  Search,
  ArrowUpRight,
  ArrowRight,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  MapPin,
  Clock,
  Check,
  SlidersHorizontal,
  BriefcaseBusiness,
  Code2,
  HeartHandshake,
  Trophy,
  Palette,
  LogOut,
  Database,
  Upload,
  FileText,
  Download,
  ExternalLink,
  Play,
  Pause,
  Menu,
  CheckCircle2,
  LoaderCircle,
  Settings2,
  Bell,
  Globe,
  Trash2,
} from "lucide-react";
import type {
  Category,
  Opportunity,
  Profile,
  User,
  Saved,
  Status,
} from "@/lib/types";
import { emptyProfile } from "@/lib/types";
import {
  catalog,
  categoryLabels,
  filterCatalog,
  relevance,
} from "@/lib/catalog";
import { calendarFile } from "@/lib/calendar";
import type { ResearchedSaved } from "@/lib/agent-types";
type View = "discover" | "saved" | "calendar" | "profile" | "agent";
const categoryIcons = {
  all: Sparkles,
  jobs: BriefcaseBusiness,
  hackathons: Code2,
  "women-tech": Trophy,
  custom: Palette,
};
async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "Something went wrong. Please try again.");
  return b;
}
function fmt(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}
function Art({ o, className = "" }: { o: Opportunity; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Illustration for ${o.kind}`}
      className={`op-art ${className}`}
      style={{
        backgroundPosition: `${o.art % 2 ? 100 : 0}% ${o.art > 1 ? 100 : 0}%`,
      }}
    />
  );
}
export default function Compass({ initialUser }: { initialUser: User }) {
  const [view, setView] = useState<View>("discover"),
    [category, setCategory] = useState<Category>("all"),
    [query, setQuery] = useState(""),
    [month, setMonth] = useState(""),
    [dateType, setDateType] = useState<"deadline" | "event">("deadline"),
    [format, setFormat] = useState("all");
  const [user, setUser] = useState<User | null>(initialUser),
    [previewProfile, setPreviewProfile] = useState<Profile>(emptyProfile),
    [saved, setSaved] = useState<Saved[]>([]),
    [researchedSaved, setResearchedSaved] = useState<ResearchedSaved[]>([]),
    [db, setDb] = useState("checking"),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false);
  const [auth, setAuth] = useState<"login" | "signup" | null>(null),
    [integration, setIntegration] = useState(false),
    [onboarding, setOnboarding] = useState(!initialUser.profile.onboarded),
    [selected, setSelected] = useState<Opportunity | null>(null),
    [story, setStory] = useState<number | null>(null),
    [playing, setPlaying] = useState(false),
    [storyTick, setStoryTick] = useState(0),
    [calendarMonth, setCalendarMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  const profile = user?.profile || previewProfile;
  const [draft, setDraft] = useState<Profile>(initialUser.profile);
  const [newField, setNewField] = useState(""),
    [newYears, setNewYears] = useState("");
  const fileRef = useRef<HTMLInputElement>(null),
    searchRef = useRef<HTMLInputElement>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [savingResearch, setSavingResearch] = useState("");
  const [openStatusSignal, setOpenStatusSignal] = useState(0);
  const [agentPrompt, setAgentPrompt] = useState("");
  const results = filterCatalog(
    catalog,
    category,
    query,
    month,
    dateType,
    profile,
  ).filter((o) => format === "all" || o.format === format);
  const savedItems = saved
    .map((s) => catalog.find((o) => o.id === s.opportunityId))
    .filter((o): o is Opportunity => !!o);
  const calendarEntries = [
    ...savedItems.flatMap((o) => [
      {
        id: `${o.id}-deadline`,
        date: o.deadline.slice(0, 10),
        label: `Deadline: ${o.title}`,
        sample: o,
      },
      {
        id: `${o.id}-event`,
        date: o.eventDate.slice(0, 10),
        label: `Event: ${o.title}`,
        sample: o,
      },
    ]),
    ...researchedSaved.map((item) => ({
      id: item.id,
      date: item.deadline.slice(0, 10),
      label: `Deadline: ${item.title}`,
      sourceUrl: item.sourceUrl,
    })),
  ];
  const calendarMonthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthlyCalendarEntries = calendarEntries
    .filter((entry) => entry.date.startsWith(calendarMonthKey))
    .sort((a, b) => a.date.localeCompare(b.date));
  const storyList = results.length ? results : catalog;
  const currentStory = story === null ? null : storyList[story];
  const modalOpen = !!(
    auth ||
    integration ||
    selected ||
    onboarding ||
    currentStory
  );
  useEffect(() => {
    let alive = true;
    try {
      if (
        new URLSearchParams(window.location.search).get("view") === "agent" ||
        sessionStorage.getItem("compass-shared-draft")
      )
        setView("agent");
    } catch {
      /* The shared link can still be pasted manually. */
    }
    (async () => {
      try {
        const [status, me] = await Promise.all([api("status"), api("me")]);
        if (!alive) return;
        setDb(status.database);
        if (me.user) {
          setUser(me.user);
          setDraft(me.user.profile);
          const [s, researched] = await Promise.all([
            api("saved"),
            api("agent/interested"),
          ]);
          if (alive) {
            setSaved(s.items);
            setResearchedSaved(researched.items);
          }
        } else {
          setUser(null);
          window.location.replace("/");
        }
      } catch {
        if (alive) setDb("unavailable");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[role="dialog"]');
      el?.querySelector<HTMLElement>("button,input,select,textarea")?.focus();
    }, 30);
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAuth(null);
        setSelected(null);
        setIntegration(false);
        setOnboarding(false);
        setStory(null);
        setPlaying(false);
        setError("");
      }
      if (e.key === "Tab") {
        const el = document.querySelector('[role="dialog"]');
        const nodes = [
          ...(el?.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),textarea,select,a[href]",
          ) || []),
        ].filter((n) => n.offsetParent !== null);
        if (nodes.length) {
          const first = nodes[0],
            last = nodes.at(-1)!;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(id);
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [modalOpen]);
  useEffect(() => {
    setStoryTick(0);
  }, [story]);
  useEffect(() => {
    if (!playing || story === null) return;
    const id = setInterval(() => setStoryTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [playing, story]);
  useEffect(() => {
    if (storyTick >= 80) {
      if (story !== null && story < storyList.length - 1) setStory(story + 1);
      else {
        setPlaying(false);
        setStoryTick(0);
      }
    }
  }, [storyTick, story, storyList.length]);
  function navigate(v: View) {
    setView(v);
    setMobile(false);
    setError("");
    if (v === "profile") setDraft(profile);
  }
  async function saveOpportunity(o: Opportunity) {
    if (busy) return;
    const exists = saved.find((s) => s.opportunityId === o.id);
    setBusy(true);
    try {
      if (user)
        await api("saved", exists ? "DELETE" : "PUT", { opportunityId: o.id });
      setSaved((old) =>
        exists
          ? old.filter((s) => s.opportunityId !== o.id)
          : [
              ...old,
              {
                opportunityId: o.id,
                status: "interested",
                completedTasks: [],
                savedAt: new Date().toISOString(),
              },
            ],
      );
      setToast(
        exists
          ? "Removed from your interested list."
          : user
            ? "Saved to your account."
            : "Saved for this preview session.",
      );
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleResearched(item: {
    sourceUrl: string;
    title: string;
    deadline: string;
  }) {
    if (savingResearch) return;
    const existing = researchedSaved.find(
      (entry) => entry.sourceUrl === item.sourceUrl,
    );
    setSavingResearch(item.sourceUrl);
    try {
      const result = await api(
        "agent/interested",
        existing ? "DELETE" : "POST",
        { sourceUrl: item.sourceUrl },
      );
      setResearchedSaved((previous) =>
        existing
          ? previous.filter((entry) => entry.sourceUrl !== item.sourceUrl)
          : [result.item, ...previous],
      );
      setToast(
        existing
          ? "Removed from Interested and your calendar."
          : `${item.title} added to Interested and your calendar.`,
      );
    } catch (cause) {
      setToast((cause as Error).message);
    } finally {
      setSavingResearch("");
    }
  }
  async function updateSaved(o: Opportunity, changes: Partial<Saved>) {
    const old = saved.find((s) => s.opportunityId === o.id);
    if (!old) return;
    const next = { ...old, ...changes };
    setBusy(true);
    try {
      if (user) await api("saved", "PUT", next);
      setSaved((all) => all.map((s) => (s.opportunityId === o.id ? next : s)));
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportCalendar(
    items: (Opportunity | ResearchedSaved)[],
    kind: "deadline" | "event" = "deadline",
  ) {
    if (!items.length) {
      setToast("Save an opportunity first.");
      return;
    }
    const blob = new Blob([calendarFile(items, kind)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "compass-" + kind + "s.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(
      "Downloaded calendar dates. Check official deadlines before relying on them.",
    );
  }
  async function authenticate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const b = await api(
        "auth/" + auth,
        "POST",
        auth === "signup" ? { name, email, password } : { email, password },
      );
      setUser(b.user);
      setDraft(b.user.profile);
      setAuth(null);
      setPassword("");
      const [sampleSaves, researchSaves] = await Promise.all([
        api("saved"),
        api("agent/interested"),
      ]);
      setSaved(sampleSaves.items);
      setResearchedSaved(researchSaves.items);
      if (!b.user.profile.onboarded) setOnboarding(true);
      setToast("Welcome to your personal space.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = {
        ...draft,
        skills: draft.skills.map((s) => s.trim()).filter(Boolean),
        interests: draft.interests.map((s) => s.trim()).filter(Boolean),
        onboarded: true,
      };
      if (user) {
        const b = await api("profile", "PUT", next);
        setUser(b.user);
      } else setPreviewProfile(next);
      setOnboarding(false);
      setToast(
        user
          ? "Profile saved to MongoDB."
          : "Preview profile updated for this page session.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadResume(file: File) {
    if (!user) {
      setAuth("signup");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setToast("Choose a PDF or text file up to 2 MB.");
      return;
    }
    setResumeBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const b = await api("resume", "POST", {
        name: file.name,
        type: file.type || "text/plain",
        data,
      });
      setUser({ ...user, resume: b.resume });
      setToast("Résumé stored privately in your account.");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setResumeBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function signOut() {
    try {
      await api("auth/logout", "POST");
      setUser(null);
      setPreviewProfile(emptyProfile);
      setSaved([]);
      setResearchedSaved([]);
      sessionStorage.removeItem("compass-preview-saved");
      window.location.replace("/");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  const profileForm = (compact = false) => (
    <form className="profile-form" onSubmit={saveProfile}>
      <div className="field-grid">
        <label>
          Your name
          <input
            required
            maxLength={120}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="What should we call you?"
          />
        </label>
        <label>
          Age <span className="optional">optional</span>
          <input
            type="number"
            min="13"
            max="120"
            value={draft.age ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                age: e.target.value ? Number(e.target.value) : null,
              })
            }
            placeholder="For age-specific eligibility"
          />
        </label>
        <label>
          Current profession
          <input
            maxLength={120}
            value={draft.profession}
            onChange={(e) => setDraft({ ...draft, profession: e.target.value })}
            placeholder="Student, developer, artist…"
          />
        </label>
        <label>
          City
          <input
            maxLength={120}
            value={draft.city}
            onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            placeholder="For opportunities nearby"
          />
        </label>
        <label>
          Country
          <input
            maxLength={120}
            value={draft.country}
            onChange={(e) => setDraft({ ...draft, country: e.target.value })}
            placeholder="Your country"
          />
        </label>
        <label>
          Timezone
          <select
            value={draft.timezone}
            onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
          >
            {[
              "Asia/Kolkata",
              "UTC",
              "America/New_York",
              "America/Los_Angeles",
              "Europe/London",
              "Europe/Paris",
              "Asia/Singapore",
              "Australia/Sydney",
            ].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Skills <span className="optional">separate with commas</span>
        <input
          maxLength={1200}
          value={draft.skills.join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              skills: e.target.value.split(",").map((s) => s.trimStart()),
            })
          }
          placeholder="Python, React, public speaking, dance"
        />
      </label>
      <label>
        Interests <span className="optional">separate with commas</span>
        <input
          maxLength={1200}
          value={draft.interests.join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              interests: e.target.value.split(",").map((s) => s.trimStart()),
            })
          }
          placeholder="AI, mentorship, pottery, hackathons"
        />
      </label>
      <div className="experience-field">
        <div className="label-row">
          <span>Experience, in any field</span>
          <span className="optional">You’re more than your résumé.</span>
        </div>
        {draft.experience.map((x, i) => (
          <div className="experience-item" key={i}>
            <span>{x.field}</span>
            <small>{x.years} years</small>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${x.field} experience`}
              onClick={() =>
                setDraft({
                  ...draft,
                  experience: draft.experience.filter((_, j) => i !== j),
                })
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <div className="experience-add">
          <input
            aria-label="Experience field"
            value={newField}
            maxLength={120}
            onChange={(e) => setNewField(e.target.value)}
            placeholder="Software, singing, dance…"
          />
          <input
            aria-label="Years of experience"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={newYears}
            onChange={(e) => setNewYears(e.target.value)}
            placeholder="Years"
          />
          <button
            type="button"
            className="secondary"
            disabled={
              !newField.trim() ||
              newYears === "" ||
              Number(newYears) < 0 ||
              Number(newYears) > 100 ||
              draft.experience.length >= 20
            }
            onClick={() => {
              setDraft({
                ...draft,
                experience: [
                  ...draft.experience,
                  { field: newField.trim(), years: Number(newYears) },
                ],
              });
              setNewField("");
              setNewYears("");
            }}
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      <button className="primary" disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Check size={16} />
        )}{" "}
        {user
          ? "Save my profile"
          : compact
            ? "Explore with this profile"
            : "Update preview profile"}
      </button>
      {!user && (
        <p className="fineprint">
          Preview changes stay in this page session. Sign in with a connected
          Atlas database to save a persistent profile.
        </p>
      )}
    </form>
  );
  if (!user)
    return <p className="session-redirect">Returning to the welcome page…</p>;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a className="logo" href="/" aria-label="Opportunity Compass home">
          <span>
            <CompassIcon size={26} />
          </span>
          <div>
            opportunity<small>COMPASS</small>
          </div>
        </a>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <div className="workspace-label">
          YOUR LITTLE WORLD OF POSSIBILITIES
        </div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "discover", name: "Discover", Icon: LayoutGrid },
              { id: "agent", name: "Chat & links", Icon: MessageCircle },
              { id: "saved", name: "Interested", Icon: Bookmark },
              { id: "calendar", name: "My calendar", Icon: CalendarDays },
              { id: "profile", name: "My profile", Icon: UserRound },
            ] as const
          ).map(({ id, name, Icon }) => (
            <button
              key={id}
              className={view === id ? "nav-active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              {name}
              {id === "saved" && saved.length + researchedSaved.length > 0 && (
                <span className="nav-count">
                  {saved.length + researchedSaved.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-line" />
        <div className="workspace-label">FIND YOUR NEXT</div>
        <div className="category-nav">
          {(["hackathons", "women-tech", "custom", "jobs"] as Category[]).map(
            (c) => {
              const Icon = categoryIcons[c];
              return (
                <button
                  key={c}
                  onClick={() => {
                    setCategory(c);
                    navigate("discover");
                  }}
                >
                  <Icon size={16} />
                  {categoryLabels[c]}
                  <ChevronRight size={12} />
                </button>
              );
            },
          )}
        </div>
        <div className="sidebar-promo">
          <div className="promo-stars">
            ✦ <span>✧</span>
          </div>
          <h3>
            Good things
            <br />
            start with curiosity.
          </h3>
          <p>
            There’s more out there
            <br />
            than you think.
          </p>
          <button
            onClick={() => {
              navigate("discover");
              searchRef.current?.focus();
            }}
          >
            Explore a possibility <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button className="setup-button" onClick={() => setIntegration(true)}>
            <Settings2 size={16} /> Connections{" "}
            <span
              className={db === "connected" ? "connected-dot" : "setup-dot"}
            />
          </button>
          {user ? (
            <button
              className="account-button"
              onClick={() => navigate("profile")}
            >
              <span className="avatar">
                {profile.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{profile.name}</strong>
                <small>Your personal space</small>
              </div>
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              className="account-button"
              onClick={() => setAuth("signup")}
            >
              <span className="avatar">
                <UserRound size={17} />
              </span>
              <div>
                <strong>Make this space yours</strong>
                <small>Create a free account</small>
              </div>
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Your space</span>
            <ChevronRight size={12} />
            <strong>
              {view === "agent"
                ? "Chat & links"
                : view === "discover"
                  ? "Discover"
                  : view === "saved"
                    ? "Interested"
                    : view === "calendar"
                      ? "My calendar"
                      : "My profile"}
            </strong>
          </div>
          <div className="top-actions">
            <button
              className="collection-badge"
              onClick={() => setIntegration(true)}
            >
              <span /> Sample collection
            </button>
            <button
              className="icon-button notification"
              aria-label="View upcoming deadlines"
              onClick={() => navigate("calendar")}
            >
              <Bell size={18} />
              {saved.length > 0 && <i />}
            </button>
            {user ? (
              <>
                <span className="avatar small-avatar">
                  {profile.name.charAt(0)}
                </span>
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  onClick={signOut}
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button
                className="top-signin"
                onClick={() => {
                  setAuth("login");
                  setError("");
                }}
              >
                Sign in <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </header>
        <main className="main-content">
          {view === "agent" && (
            <AgentPanel
              initialPrompt={agentPrompt}
              onPromptConsumed={() => setAgentPrompt("")}
            />
          )}
          {view === "discover" && (
            <>
              <div className="greeting-row">
                <div>
                  <p className="eyebrow">
                    A LITTLE CURIOSITY. A WORLD OF POSSIBILITY.
                  </p>
                  <h1>
                    {profile.name
                      ? `${profile.name.split(" ")[0]}, what’s next?`
                      : "Find your next possibility."}
                  </h1>
                  <p className="subtitle">
                    Opportunities for who you are—and who you’re becoming.
                  </p>
                </div>
                <button
                  className="secondary stories-launch"
                  onClick={() => {
                    setOpenStatusSignal((value) => value + 1);
                  }}
                >
                  <Play size={15} /> View stories
                </button>
              </div>
              <div className="hero-grid">
                <section className="hero">
                  <div className="hero-copy">
                    <span className="hero-label">
                      <Sparkles size={13} /> MADE FOR YOUR NEXT CHAPTER
                    </span>
                    <h2>
                      A new skill.
                      <br />A bigger stage.
                      <br />
                      <em>Your next step.</em>
                    </h2>
                    <p>
                      Discover a chance worth taking.
                      <br />
                      Keep the possibilities that feel like you.
                    </p>
                    <button
                      className="hero-button"
                      onClick={() => {
                        searchRef.current?.focus();
                        document.querySelector(".search-card")?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                    >
                      Let’s find something <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="hero-illustration" aria-hidden="true">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <div className="hero-spark">✳</div>
                    <div className="floating-note note-one">
                      <Code2 size={18} />
                      <span>Build something new</span>
                      <i>↗</i>
                    </div>
                    <div className="floating-note note-two">
                      <HeartHandshake size={18} />
                      <span>Find your people</span>
                      <i>↗</i>
                    </div>
                    <div className="floating-note note-three">
                      <Palette size={18} />
                      <span>Follow your curiosity</span>
                      <i>↗</i>
                    </div>
                    <span className="tiny-spark spark-one">✦</span>
                    <span className="tiny-spark spark-two">✦</span>
                  </div>
                </section>
                <section className="profile-nudge">
                  <div className="nudge-top">
                    <span className="nudge-icon">
                      <UserRound size={21} />
                    </span>
                    <span className="small-tag">YOUR COMPASS</span>
                  </div>
                  <h3>
                    {profile.onboarded
                      ? "A little more you."
                      : "Better possibilities\nstart with you."}
                  </h3>
                  <p>
                    {profile.onboarded
                      ? "Your interests and experience help put relevant possibilities first."
                      : "Tell us your interests and skills to make this space feel more personal."}
                  </p>
                  <div className="profile-meter">
                    <span
                      style={{ width: profile.onboarded ? "100%" : "25%" }}
                    />
                  </div>
                  <div className="nudge-bottom">
                    <span>
                      {profile.onboarded
                        ? "Profile ready to explore"
                        : "Let’s get to know you"}
                    </span>
                    <button
                      aria-label="Complete your profile"
                      onClick={() => {
                        setDraft(profile);
                        setOnboarding(true);
                      }}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                </section>
              </div>
              <QuickLook
                profile={profile}
                resume={user.resume}
                onChoose={(prompt) => {
                  setAgentPrompt(prompt);
                  navigate("agent");
                }}
              />
              <section className="search-card">
                <div className="search-input">
                  <Search size={19} />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="AI hackathons, a new role, pottery near you…"
                    aria-label="Search sample opportunities"
                  />
                  {query && (
                    <button
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                  <span className="search-shortcut">SAMPLE SEARCH</span>
                </div>
                <div className="search-filters">
                  <label>
                    <CalendarDays size={14} />
                    <input
                      type="month"
                      aria-label="Filter by month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Date filter type"
                    value={dateType}
                    onChange={(e) =>
                      setDateType(e.target.value as "deadline" | "event")
                    }
                  >
                    <option value="deadline">Applications close</option>
                    <option value="event">Events happen</option>
                  </select>
                  <select
                    aria-label="Opportunity format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="all">Any format</option>
                    <option>Remote</option>
                    <option>In person</option>
                    <option>Hybrid</option>
                  </select>
                  {month && (
                    <button
                      className="text-button"
                      onClick={() => setMonth("")}
                    >
                      Clear month
                    </button>
                  )}
                </div>
              </section>
              <div className="section-heading">
                <div
                  className="category-tabs"
                  role="tablist"
                  aria-label="Opportunity categories"
                >
                  {(
                    [
                      "all",
                      "hackathons",
                      "women-tech",
                      "custom",
                      "jobs",
                    ] as Category[]
                  ).map((c) => (
                    <button
                      role="tab"
                      aria-selected={category === c}
                      key={c}
                      className={category === c ? "active" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c === "all" && <Sparkles size={13} />}{" "}
                      {c === "jobs"
                        ? "Jobs"
                        : c === "custom"
                          ? "Something new"
                          : categoryLabels[c]}
                    </button>
                  ))}
                </div>
                <span className="sort-note">
                  <SlidersHorizontal size={13} />
                  {profile.onboarded ? "Profile relevance" : "Explore all"}
                </span>
              </div>
              <DiscoveryFeed
                openStatusSignal={openStatusSignal}
                savedSourceUrls={researchedSaved.map(
                  (entry) => entry.sourceUrl,
                )}
                savingSourceUrl={savingResearch}
                onToggleInterested={toggleResearched}
              />
              <div className="sample-note">
                <span className="sample-dot" />
                <p>
                  <strong>A preview of what’s possible.</strong> These{" "}
                  {catalog.length} opportunities below are fictional samples.
                </p>
              </div>
              {results.length ? (
                <div className="opportunity-grid">
                  {results.map((o) => (
                    <OpportunityCard
                      key={o.id}
                      o={o}
                      saved={!!saved.find((s) => s.opportunityId === o.id)}
                      profile={profile}
                      onOpen={() => setSelected(o)}
                      onSave={() => saveOpportunity(o)}
                      busy={busy}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={28} />
                  <h3>No sample opportunities match yet.</h3>
                  <p>
                    This searches the starter collection, not the live web. Try
                    a category or a broader term.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                      setMonth("");
                      setFormat("all");
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              )}
              <div className="bottom-prompt">
                <span>✧</span>
                <div>
                  <h3>There’s more than one kind of next step.</h3>
                  <p>
                    A dream job, a weekend workshop, or a community that gets
                    you.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setCategory("custom");
                    setQuery("");
                  }}
                >
                  Try something different <ArrowUpRight size={14} />
                </button>
              </div>
            </>
          )}
          {view === "saved" && (
            <>
              <div className="greeting-row">
                <div>
                  <p className="eyebrow">FROM SOMEDAY TO A SMALL NEXT STEP</p>
                  <h1>Your interested list.</h1>
                  <p className="subtitle">
                    Keep what catches your eye. Make a little room to follow
                    through.
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={!saved.length && !researchedSaved.length}
                  onClick={() =>
                    exportCalendar([...savedItems, ...researchedSaved])
                  }
                >
                  <Download size={15} /> Export deadlines
                </button>
              </div>
              {!user && (
                <div className="sample-note">
                  <span className="sample-dot" />
                  <p>
                    Preview saves are kept in this browser tab session. Sign in
                    to store them in your MongoDB account.
                  </p>
                </div>
              )}
              {savedItems.length || researchedSaved.length ? (
                <div className="saved-grid">
                  {researchedSaved.map((item) => (
                    <section
                      className="saved-card researched-saved-card"
                      key={item.id}
                    >
                      <div className="saved-card-top">
                        <div
                          className="op-art"
                          role="img"
                          aria-label="Opportunity illustration"
                        />
                        <div>
                          <span className="eyebrow">
                            RESEARCHED OPPORTUNITY
                          </span>
                          <h3>
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {item.title}
                            </a>
                          </h3>
                          <p>
                            <Clock size={12} /> Application deadline{" "}
                            {fmt(item.deadline)}
                          </p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${item.title} from Interested`}
                          disabled={!!savingResearch}
                          onClick={() => toggleResearched(item)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <p className="researched-saved-description">
                        {item.description}
                      </p>
                      <div className="researched-saved-actions">
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Official page <ArrowUpRight size={14} />
                        </a>
                        <button
                          className="text-button"
                          onClick={() => exportCalendar([item])}
                        >
                          <CalendarDays size={14} /> Export deadline
                        </button>
                      </div>
                    </section>
                  ))}
                  {savedItems.map((o) => {
                    const s = saved.find((s) => s.opportunityId === o.id)!;
                    return (
                      <section className="saved-card" key={o.id}>
                        <div className="saved-card-top">
                          <Art o={o} />
                          <div>
                            <span className="eyebrow">{o.kind} · SAMPLE</span>
                            <h3>
                              <button onClick={() => setSelected(o)}>
                                {o.title}
                              </button>
                            </h3>
                            <p>
                              <Clock size={12} /> Sample deadline{" "}
                              {fmt(o.deadline)}
                            </p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Remove ${o.title} from interested`}
                            onClick={() => saveOpportunity(o)}
                            disabled={busy}
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <label className="status-label">
                          Application status
                          <select
                            value={s.status}
                            disabled={busy}
                            onChange={(e) =>
                              updateSaved(o, {
                                status: e.target.value as Status,
                              })
                            }
                          >
                            <option value="interested">Interested</option>
                            <option value="preparing">Preparing</option>
                            <option value="submitted">Submitted</option>
                          </select>
                        </label>
                        <div className="checklist-heading">
                          <strong>Your next steps</strong>
                          <span>
                            {s.completedTasks.length}/{o.tasks.length}
                          </span>
                        </div>
                        <div className="task-progress">
                          <i
                            style={{
                              width: `${(s.completedTasks.length / o.tasks.length) * 100}%`,
                            }}
                          />
                        </div>
                        {o.tasks.map((t, i) => (
                          <label
                            className={`task ${s.completedTasks.includes(i) ? "complete" : ""}`}
                            key={t}
                          >
                            <input
                              type="checkbox"
                              checked={s.completedTasks.includes(i)}
                              disabled={busy}
                              onChange={() =>
                                updateSaved(o, {
                                  completedTasks: s.completedTasks.includes(i)
                                    ? s.completedTasks.filter((n) => n !== i)
                                    : [...s.completedTasks, i],
                                })
                              }
                            />
                            <span>{t}</span>
                          </label>
                        ))}
                        <button
                          className="text-button saved-export"
                          onClick={() => exportCalendar([o])}
                        >
                          <CalendarDays size={14} /> Export sample deadline{" "}
                          <ArrowUpRight size={13} />
                        </button>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  icon={<Bookmark size={30} />}
                  title="Keep a possibility close."
                  text="Tap the bookmark on an opportunity to keep it here. Research-backed deadlines will also appear in your calendar."
                  action={() => navigate("discover")}
                  label="Explore opportunities"
                />
              )}
            </>
          )}
          {view === "calendar" && (
            <>
              <div className="greeting-row">
                <div>
                  <p className="eyebrow">A LITTLE SPACE FOR WHAT MATTERS</p>
                  <h1>Make room for what’s next.</h1>
                  <p className="subtitle">
                    Your saved application deadlines and event dates, in one
                    place.
                  </p>
                </div>
                <span className="storage-status is-connected">
                  <CalendarDays size={14} /> In-app calendar
                </span>
              </div>
              <div className="calendar-layout">
                <section className="calendar-card">
                  <div className="calendar-head">
                    <h2>
                      {calendarMonth.toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric",
                      })}
                    </h2>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="Previous month"
                        onClick={() =>
                          setCalendarMonth(
                            new Date(
                              calendarMonth.getFullYear(),
                              calendarMonth.getMonth() - 1,
                              1,
                            ),
                          )
                        }
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Next month"
                        onClick={() =>
                          setCalendarMonth(
                            new Date(
                              calendarMonth.getFullYear(),
                              calendarMonth.getMonth() + 1,
                              1,
                            ),
                          )
                        }
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="calendar-week">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (d) => (
                        <span key={d}>{d}</span>
                      ),
                    )}
                  </div>
                  <div className="calendar-days">
                    {Array.from({ length: calendarMonth.getDay() }, (_, i) => (
                      <div className="blank-day" key={"b" + i} />
                    ))}
                    {Array.from(
                      {
                        length: new Date(
                          calendarMonth.getFullYear(),
                          calendarMonth.getMonth() + 1,
                          0,
                        ).getDate(),
                      },
                      (_, i) => {
                        const day = i + 1;
                        const key = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const events = calendarEntries.filter(
                          (entry) => entry.date === key,
                        );
                        return (
                          <div className="calendar-day" key={day}>
                            <span>{day}</span>
                            {events.map((e) => (
                              <button
                                key={e.id}
                                className={
                                  e.label.startsWith("Deadline:")
                                    ? "apply-event"
                                    : "date-event"
                                }
                                onClick={() =>
                                  "sample" in e
                                    ? setSelected(e.sample)
                                    : window.open(
                                        e.sourceUrl,
                                        "_blank",
                                        "noopener,noreferrer",
                                      )
                                }
                                title={e.label}
                              >
                                {e.label}
                              </button>
                            ))}
                          </div>
                        );
                      },
                    )}
                  </div>
                  <div className="calendar-legend">
                    <span>
                      <i /> Application deadline
                    </span>
                    <span>
                      <i /> Sample event date
                    </span>
                  </div>
                  <div className="calendar-agenda">
                    <h3>This month</h3>
                    {monthlyCalendarEntries.length ? (
                      monthlyCalendarEntries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() =>
                            "sample" in entry
                              ? setSelected(entry.sample)
                              : window.open(
                                  entry.sourceUrl,
                                  "_blank",
                                  "noopener,noreferrer",
                                )
                          }
                        >
                          <strong>
                            {new Intl.DateTimeFormat("en-IN", {
                              day: "numeric",
                              month: "short",
                              timeZone: "UTC",
                            }).format(new Date(`${entry.date}T12:00:00Z`))}
                          </strong>
                          <span>{entry.label}</span>
                        </button>
                      ))
                    ) : (
                      <p>No interested deadlines or event dates this month.</p>
                    )}
                  </div>
                </section>
                <aside className="calendar-aside">
                  <div className="aside-icon">
                    <CalendarDays size={23} />
                  </div>
                  <h3>Plan a little ahead.</h3>
                  <p>
                    Opportunities you mark Interested appear here automatically.
                    Check official pages for exact cutoff times.
                  </p>
                  <button
                    className="primary"
                    disabled={!savedItems.length && !researchedSaved.length}
                    onClick={() =>
                      exportCalendar([...savedItems, ...researchedSaved])
                    }
                  >
                    <Download size={15} /> Export deadlines
                  </button>
                  <button
                    className="secondary"
                    disabled={!savedItems.length}
                    onClick={() => exportCalendar(savedItems, "event")}
                  >
                    Export event dates
                  </button>
                  <div className="aside-note">
                    <strong>Your in-app calendar is ready.</strong>
                    <p>
                      Interested deadlines stay in this account. Export a file
                      if you also want them in another calendar.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
          {view === "profile" && (
            <>
              <div className="greeting-row">
                <div>
                  <p className="eyebrow">MORE THAN A JOB TITLE</p>
                  <h1>A little more about you.</h1>
                  <p className="subtitle">
                    Your skills, interests, and experience help guide the
                    possibilities you see.
                  </p>
                </div>
                <span
                  className={`storage-status ${user ? "is-connected" : ""}`}
                >
                  <Database size={13} />
                  {user ? "Saved in MongoDB" : "Preview profile"}
                </span>
              </div>
              <div className="profile-layout">
                <section className="profile-card">
                  <div className="card-heading">
                    <UserRound size={19} />
                    <h2>Your details</h2>
                  </div>
                  {profileForm()}
                </section>
                <aside>
                  <section className="resume-card">
                    <div className="aside-icon">
                      <FileText size={23} />
                    </div>
                    <h3>Your résumé, when you need it.</h3>
                    <p>
                      Keep a PDF or text résumé alongside your profile. You can
                      still explore without one.
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      className="visually-hidden"
                      accept="application/pdf,text/plain,.pdf,.txt"
                      aria-label="Upload résumé"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadResume(f);
                      }}
                    />
                    {user?.resume ? (
                      <div className="resume-file">
                        <FileText size={18} />
                        <span>
                          {user.resume.name}
                          <small>{Math.ceil(user.resume.size / 1024)} KB</small>
                        </span>
                        <a href="/api/resume" aria-label="Download your résumé">
                          <Download size={16} />
                        </a>
                        <button
                          className="icon-button"
                          aria-label="Delete your résumé"
                          onClick={async () => {
                            try {
                              await api("resume", "DELETE");
                              setUser({ ...user, resume: null });
                              setToast("Résumé removed.");
                            } catch (e) {
                              setToast((e as Error).message);
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="upload-zone">
                        <Upload size={22} />
                        <strong>A little context goes a long way.</strong>
                        <span>PDF or TXT · up to 2 MB</span>
                      </div>
                    )}
                    <button
                      className="secondary"
                      disabled={resumeBusy}
                      onClick={() =>
                        user ? fileRef.current?.click() : setAuth("signup")
                      }
                    >
                      {resumeBusy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Upload size={15} />
                      )}{" "}
                      {user?.resume ? "Replace résumé" : "Upload résumé"}
                    </button>
                    <p className="fineprint">
                      Your résumé stays in your account. If you enable résumé
                      sharing in Chat & links, Claude can use it when you ask
                      for opportunities. You can also add skills above.
                    </p>
                  </section>
                  <section className="profile-tip">
                    <Sparkles size={19} />
                    <h3>All your experience counts.</h3>
                    <p>
                      Three years of coding and ten years of dance can both
                      belong here. Different opportunities call for different
                      parts of you.
                    </p>
                  </section>
                </aside>
              </div>
            </>
          )}
          <footer className="main-footer">
            <span>
              <CompassIcon size={13} /> A little direction. A world of
              possibility.
            </span>
            <span>Built for your next chapter.</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {auth && (
        <Modal
          label={auth === "signup" ? "Create your account" : "Welcome back"}
          onClose={() => {
            setAuth(null);
            setError("");
            setPassword("");
          }}
        >
          <div className="auth-mark">
            <CompassIcon size={29} />
          </div>
          <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
          <h2>
            {auth === "signup"
              ? "Make this space yours."
              : "Good to see you again."}
          </h2>
          <p className="modal-subtitle">
            {auth === "signup"
              ? "One profile. A world of possibilities."
              : "Sign in to your saved possibilities."}
          </p>
          {db !== "connected" && (
            <div className="connection-notice">
              <Database size={18} />
              <div>
                <strong>Account connection needed</strong>
                <p>
                  {db === "not-configured"
                    ? "Accounts are not enabled in this preview yet."
                    : "The account service is currently unavailable."}{" "}
                  You can explore the sample dashboard now; accounts become
                  available after setup.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setAuth(null);
                    setIntegration(true);
                  }}
                >
                  View connection details <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          )}
          <form className="auth-form" onSubmit={authenticate}>
            {auth === "signup" && (
              <label>
                Your name
                <input
                  required
                  maxLength={120}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                required
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength={auth === "signup" ? 10 : 1}
                maxLength={128}
                autoComplete={
                  auth === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  auth === "signup" ? "At least 10 characters" : "Your password"
                }
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              className="primary full-width"
              disabled={busy || db !== "connected"}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : null}
              {auth === "signup" ? "Create account" : "Sign in"}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="auth-switch">
            {auth === "signup"
              ? "Already have an account?"
              : "New around here?"}{" "}
            <button
              onClick={() => {
                setAuth(auth === "signup" ? "login" : "signup");
                setError("");
                setPassword("");
              }}
            >
              {auth === "signup" ? "Sign in" : "Create an account"}
            </button>
          </p>
          <button className="preview-link" onClick={() => setAuth(null)}>
            Explore the sample dashboard first <ArrowUpRight size={13} />
          </button>
        </Modal>
      )}
      {onboarding && (
        <Modal
          label="Tell us about yourself"
          onClose={() => setOnboarding(false)}
          wide
        >
          <p className="eyebrow">LET’S POINT YOUR COMPASS</p>
          <h2>Start with a little about you.</h2>
          <p className="modal-subtitle">
            A few details help make your discoveries more relevant.
          </p>
          {profileForm(true)}
        </Modal>
      )}
      {integration && (
        <Modal label="Your connections" onClose={() => setIntegration(false)}>
          <p className="eyebrow">BEHIND YOUR PERSONAL SPACE</p>
          <h2>Your connections.</h2>
          <p className="modal-subtitle">
            A clear view of what’s ready and what needs connecting.
          </p>
          <div className="integration-row">
            <Database />
            <div>
              <strong>MongoDB Atlas</strong>
              <span>
                {db === "connected"
                  ? "Connected · opportunity_compass database"
                  : db === "checking"
                    ? "Checking connection…"
                    : db === "not-configured"
                      ? "Setup required · no local database"
                      : "Connection unavailable"}
              </span>
            </div>
            <span
              className={`status-chip ${db === "connected" ? "ready" : ""}`}
            >
              {db === "connected" ? "Ready" : "Not connected"}
            </span>
          </div>
          <div className="integration-row">
            <Sparkles />
            <div>
              <strong>Opportunity discovery</strong>
              <span>
                Fictional sample collection · live research is not implemented
                yet
              </span>
            </div>
            <span className="status-chip">Samples</span>
          </div>
          <div className="integration-row">
            <CalendarDays />
            <div>
              <strong>Google Calendar</strong>
              <span>Calendar-file export works · direct sync comes later</span>
            </div>
            <span className="status-chip">Export only</span>
          </div>
          <div className="setup-instructions">
            <strong>Connecting Atlas</strong>
            <p>
              When you’re ready, provide a working database connection through
              the server’s private <code>MONGODB_URI</code> setting. The app
              uses its own <code>opportunity_compass</code> database. Your
              existing cluster has been left paused.
            </p>
            <p>
              Credentials stay on the server. No password or connection string
              needs to be pasted into this dashboard.
            </p>
          </div>
          <button
            className="secondary full-width"
            onClick={async () => {
              setDb("checking");
              try {
                setDb((await api("status")).database);
              } catch {
                setDb("unavailable");
              }
            }}
          >
            Recheck database connection
          </button>
        </Modal>
      )}
      {selected && (
        <Modal label={selected.title} onClose={() => setSelected(null)} wide>
          <Art o={selected} className="detail-art" />
          <div className="detail-heading">
            <span className={`category-pill ${selected.color}`}>
              {selected.kind}
            </span>
            <span className="sample-label">FICTIONAL SAMPLE</span>
          </div>
          <h2>{selected.title}</h2>
          <p className="modal-subtitle">{selected.organizer}</p>
          <p className="detail-description">{selected.description}</p>
          <div className="detail-facts">
            <div>
              <Clock size={17} />
              <small>Application deadline</small>
              <strong>{fmt(selected.deadline)} · Sample date</strong>
            </div>
            <div>
              <CalendarDays size={17} />
              <small>Event date</small>
              <strong>{fmt(selected.eventDate)} · Sample date</strong>
            </div>
            <div>
              <MapPin size={17} />
              <small>Location & format</small>
              <strong>
                {selected.format} · {selected.location}
              </strong>
            </div>
            <div>
              <Globe size={17} />
              <small>Cost & support</small>
              <strong>{selected.funding}</strong>
            </div>
          </div>
          <div className="match-note">
            <Sparkles size={18} />
            <div>
              <strong>A possibility to explore</strong>
              <p>
                {relevance(selected, profile).reason} This is a sample
                comparison, not verified eligibility.
              </p>
            </div>
          </div>
          <h3 className="detail-section-title">What to check</h3>
          <ul className="requirements">
            {selected.requirements.map((r) => (
              <li key={r}>
                <Check size={14} />
                {r}
              </li>
            ))}
          </ul>
          <div className="source-notice">
            <strong>About this listing</strong>
            <p>
              This organizer and listing are fictional. There is no verified
              application page. Sample dates have no confirmed cutoff time or
              timezone.
            </p>
          </div>
          <div className="detail-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => saveOpportunity(selected)}
            >
              <Bookmark
                size={16}
                fill={
                  saved.some((s) => s.opportunityId === selected.id)
                    ? "currentColor"
                    : "none"
                }
              />
              {saved.some((s) => s.opportunityId === selected.id)
                ? "Remove from interested"
                : "I’m interested"}
            </button>
            <button
              className="secondary"
              onClick={() => exportCalendar([selected])}
            >
              <CalendarDays size={15} /> Export sample date
            </button>
          </div>
          <a
            className="video-search"
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(selected.kind + " preparation guide")}`}
            target="_blank"
            rel="noreferrer"
          >
            <Play size={14} /> Search YouTube for general preparation videos{" "}
            <ExternalLink size={12} />
          </a>
          <p className="fineprint">
            This opens a YouTube search, not verified videos about the fictional
            listing.
          </p>
        </Modal>
      )}
      {currentStory && (
        <div
          className="story-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Opportunity stories"
        >
          <button
            className="story-close icon-button"
            aria-label="Close stories"
            onClick={() => {
              setStory(null);
              setPlaying(false);
            }}
          >
            <X size={24} />
          </button>
          <button
            className="story-prev icon-button"
            aria-label="Previous story"
            disabled={story === 0}
            onClick={() => setStory((s) => Math.max(0, (s || 0) - 1))}
          >
            <ChevronLeft size={26} />
          </button>
          <article className={`story-card ${currentStory.color}`}>
            <Art o={currentStory} className="story-art" />
            <div className="story-shade" />
            <div className="story-controls">
              <div className="story-progress">
                {storyList.map((o, i) => (
                  <span key={o.id}>
                    <i
                      style={{
                        width:
                          i < story!
                            ? "100%"
                            : i === story
                              ? `${playing ? (storyTick / 80) * 100 : 0}%`
                              : "0%",
                      }}
                    />
                  </span>
                ))}
              </div>
              <div className="story-brand">
                <CompassIcon size={17} /> Opportunity Compass
                <button
                  aria-label={playing ? "Pause stories" : "Play stories"}
                  className="icon-button"
                  onClick={() => setPlaying(!playing)}
                >
                  {playing ? <Pause size={17} /> : <Play size={17} />}
                </button>
              </div>
            </div>
            <div className="story-body">
              <span className="story-sample">
                FICTIONAL SAMPLE · {currentStory.kind}
              </span>
              <h2>{currentStory.title}</h2>
              <p>{currentStory.description}</p>
              <div className="story-facts">
                <span>
                  <MapPin size={14} />
                  {currentStory.format}
                </span>
                <span>
                  <Clock size={14} />
                  Sample deadline {fmt(currentStory.deadline)}
                </span>
              </div>
              <div className="story-reason">
                <Sparkles size={15} />
                {relevance(currentStory, profile).reason}
              </div>
              <button
                className="story-save"
                disabled={busy}
                onClick={() => saveOpportunity(currentStory)}
              >
                <Bookmark
                  size={16}
                  fill={
                    saved.some((s) => s.opportunityId === currentStory.id)
                      ? "currentColor"
                      : "none"
                  }
                />
                {saved.some((s) => s.opportunityId === currentStory.id)
                  ? "Saved to interested"
                  : "I’m interested"}
                <ArrowUpRight size={18} />
              </button>
              <button
                className="story-details"
                onClick={() => {
                  setSelected(currentStory);
                  setStory(null);
                  setPlaying(false);
                }}
              >
                See the details <ArrowRight size={14} />
              </button>
            </div>
          </article>
          <button
            className="story-next icon-button"
            aria-label="Next story"
            disabled={story === storyList.length - 1}
            onClick={() =>
              setStory((s) => Math.min(storyList.length - 1, (s || 0) + 1))
            }
          >
            <ChevronRight size={26} />
          </button>
        </div>
      )}
    </div>
  );
}
function Modal({
  children,
  label,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  label: string;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <button
          className="modal-close icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {children}
      </section>
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  label,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action: () => void;
  label: string;
}) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="primary" onClick={action}>
        {label}
        <ArrowUpRight size={14} />
      </button>
    </div>
  );
}
function OpportunityCard({
  o,
  saved,
  profile,
  onOpen,
  onSave,
  busy,
}: {
  o: Opportunity;
  saved: boolean;
  profile: Profile;
  onOpen: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  const r = relevance(o, profile);
  return (
    <article className="op-card">
      <div className="card-art-wrap">
        <button
          className="art-open"
          onClick={onOpen}
          aria-label={`View ${o.title}`}
        >
          <Art o={o} />
        </button>
        <span className="art-badge">SAMPLE</span>
        <button
          className={`bookmark-button ${saved ? "is-saved" : ""}`}
          disabled={busy}
          aria-label={saved ? `Unsave ${o.title}` : `Save ${o.title}`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="op-card-body">
        <div className="card-category-row">
          <span className={`category-pill ${o.color}`}>{o.kind}</span>
          <span className="card-format">{o.format}</span>
        </div>
        <h3>
          <button onClick={onOpen}>{o.title}</button>
        </h3>
        <p className="organizer">{o.organizer}</p>
        <div className="card-tags">
          {o.tags.slice(0, 2).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="card-bottom">
          <span>
            <Clock size={12} /> Apply by {fmt(o.deadline)}
          </span>
          <button onClick={onOpen} aria-label={`Explore ${o.title}`}>
            <ArrowUpRight size={18} />
          </button>
        </div>
        {profile.onboarded && (
          <p className={`relevance ${r.ineligible ? "ineligible" : ""}`}>
            <Sparkles size={11} />
            {r.reason}
          </p>
        )}
      </div>
    </article>
  );
}
