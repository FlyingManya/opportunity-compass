"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  FileText,
  Link as LinkIcon,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import type {
  AgentMessage,
  AgentMode,
  AgentPreferences,
  SharedLead,
} from "@/lib/agent-types";
import { emptyAgentPreferences } from "@/lib/agent-types";
import "./agent.css";

type Draft = { url: string; title: string; caption: string };
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
async function request(path: string, method = "GET", data?: unknown) {
  const response = await fetch(`/api/agent/${path}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(50000),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Please try again.");
  return result;
}
export default function AgentPanel() {
  const [tab, setTab] = useState<"chat" | "links" | "brief">("chat");
  const [mode, setMode] = useState<AgentMode>({
    connected: false,
    label: "Checking connection",
    destination: "",
    search: false,
  });
  const [preferences, setPreferences] = useState<AgentPreferences>(
    emptyAgentPreferences,
  );
  const [sources, setSources] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [leads, setLeads] = useState<SharedLead[]>([]);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Draft>({
    url: "",
    title: "",
    caption: "",
  });
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const importPanel = useRef<HTMLDivElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);

  function closeImport() {
    if (busy) return;
    setImporting(false);
    try {
      sessionStorage.removeItem("compass-shared-draft");
    } catch {}
  }
  useEffect(() => {
    let active = true;
    request("state")
      .then((result) => {
        if (!active) return;
        setMode(result.mode);
        setMessages(result.messages);
        setLeads(result.leads);
        setPreferences(result.preferences);
        setSources(result.preferences.sources.join("\n"));
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    try {
      const shared = sessionStorage.getItem("compass-shared-draft");
      if (shared) {
        const value = JSON.parse(shared);
        setDraft({
          url: typeof value.url === "string" ? value.url.slice(0, 2048) : "",
          title:
            typeof value.title === "string" ? value.title.slice(0, 180) : "",
          caption:
            typeof value.caption === "string"
              ? value.caption.slice(0, 6000)
              : "",
        });
        setTab("links");
        setImporting(true);
      }
    } catch {
      setNotice("Please paste your shared link again.");
    }
    function installable(event: Event) {
      event.preventDefault();
      setInstall(event as InstallEvent);
    }
    window.addEventListener("beforeinstallprompt", installable);
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", installable);
    };
  }, []);
  useEffect(() => {
    if (messages.length)
      end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length]);
  useEffect(() => {
    if (!importing) return;
    priorFocus.current = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    importPanel.current?.querySelector<HTMLInputElement>("input")?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) closeImport();
      if (event.key !== "Tab") return;
      const nodes = importPanel.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input,textarea",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      priorFocus.current?.focus();
    };
  }, [importing, busy]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("chat", "POST", { message });
      setMessages((previous) => [
        ...previous,
        result.sent,
        ...(result.reply ? [result.reply] : []),
      ]);
      setMessage("");
      setNotice(result.notice || "");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveBrief(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("preferences", "PUT", {
        ...preferences,
        sources: sources
          .split("\n")
          .map((source) => source.trim())
          .filter(Boolean),
      });
      setPreferences(result.preferences);
      setSources(result.preferences.sources.join("\n"));
      setNotice("Your search brief is saved privately.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveLink(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("links", "POST", draft);
      setLeads((previous) => [
        result.lead,
        ...previous.filter((lead) => lead.id !== result.lead.id),
      ]);
      sessionStorage.removeItem("compass-shared-draft");
      setDraft({ url: "", title: "", caption: "" });
      setImporting(false);
      setTab("links");
      setNotice(
        result.duplicate
          ? "Updated your existing shared link."
          : "Link saved to your private inbox. Review the official source before applying.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive(lead: SharedLead) {
    setBusy(true);
    setError("");
    try {
      await request("link-archive", "PUT", {
        id: lead.id,
        archived: !lead.archived,
      });
      setLeads((previous) =>
        previous.map((item) =>
          item.id === lead.id ? { ...item, archived: !item.archived } : item,
        ),
      );
      setNotice(
        lead.archived
          ? "Link restored."
          : "Link archived. You can restore it from Archived links.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visibleLeads = leads.filter((lead) => lead.archived === showArchived);
  return (
    <section className="agent-space">
      <div className="greeting-row">
        <div>
          <p className="eyebrow">FROM A THOUGHT TO A POSSIBILITY</p>
          <h1>Your opportunity companion.</h1>
          <p className="subtitle">
            Talk it through. Bring a link. Find your next step.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            setError("");
            setImporting(true);
          }}
        >
          <Plus size={17} /> Add a link
        </button>
      </div>
      <div
        className="agent-tabs"
        role="tablist"
        aria-label="Opportunity companion sections"
      >
        {(
          [
            { id: "chat", label: "Conversation", Icon: MessageCircle },
            { id: "links", label: "Shared links", Icon: LinkIcon },
            { id: "brief", label: "My search brief", Icon: Settings2 },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            id={`agent-${id}-tab`}
            aria-selected={tab === id}
            aria-controls={`agent-${id}-panel`}
            onClick={() => {
              setTab(id);
              setError("");
              setNotice("");
            }}
          >
            <Icon size={17} />
            {label}
            {id === "links" && (
              <span>{leads.filter((lead) => !lead.archived).length}</span>
            )}
          </button>
        ))}
      </div>
      {error && (
        <p className="agent-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="agent-notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <div className="agent-loading">
          <LoaderCircle size={22} className="spin" /> Opening your private
          space…
        </div>
      ) : (
        <>
          <div className="agent-connection">
            <Sparkles size={18} />
            <div>
              <strong>{mode.label}</strong>
              <p>
                {mode.connected
                  ? mode.search
                    ? "AI replies can use live web search. Check cited sources before applying."
                    : "AI replies use your supplied text. This model connection has no live web search."
                  : "Your notes, brief, and links are saved. AI replies and research need a Meta model connection."}
              </p>
            </div>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                try {
                  const state = await request("state");
                  setMode(state.mode);
                  setNotice(
                    state.mode.connected
                      ? "AI connection settings are available. Send a message to try it."
                      : "No Meta model is configured yet. Your notes and links still work.",
                  );
                } catch {
                  setError("Could not check the connection.");
                }
              }}
            >
              Recheck
            </button>
          </div>
          {tab === "chat" && (
            <div
              className="agent-chat-layout"
              role="tabpanel"
              id="agent-chat-panel"
              aria-labelledby="agent-chat-tab"
            >
              <div className="agent-conversation">
                <div
                  className="agent-messages"
                  aria-label="Your conversation"
                  role="log"
                  aria-live="polite"
                >
                  {!messages.length && (
                    <div className="agent-empty">
                      <span>
                        <MessageCircle size={28} />
                      </span>
                      <h2>What would you like to try?</h2>
                      <p>
                        Start with an opportunity you want to find, a deadline
                        you’re working toward, or a post you’ve spotted.
                      </p>
                      <div className="agent-prompts">
                        {[
                          "I’m looking for beginner-friendly medical research opportunities.",
                          "Help me find an AI hackathon I can join remotely.",
                          "Help me understand a competition I saw on Instagram.",
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => {
                              setMessage(prompt);
                              composer.current?.focus();
                            }}
                          >
                            {prompt}
                            <ArrowUpRight size={15} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((item) => (
                    <article
                      key={item.id}
                      className={`agent-message ${item.role}`}
                    >
                      <span>
                        {item.role === "user" ? "You" : "Opportunity Compass"}
                      </span>
                      <p>{item.content}</p>
                      {!!item.sources?.length && (
                        <div className="agent-citations">
                          {item.sources.map((source) => (
                            <a
                              key={source.url}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {source.title}
                              <ArrowUpRight size={14} />
                            </a>
                          ))}
                        </div>
                      )}
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </article>
                  ))}
                  <div ref={end} />
                </div>
                <form className="agent-composer" onSubmit={send}>
                  <label htmlFor="agent-message">
                    {mode.connected
                      ? "Message your companion"
                      : "Save a note for your companion"}
                  </label>
                  <textarea
                    id="agent-message"
                    ref={composer}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    maxLength={4000}
                    rows={3}
                    placeholder="Tell me what you’re looking for…"
                    required
                    disabled={busy}
                  />
                  <div>
                    <span>
                      {mode.connected
                        ? "Replies can be mistaken. Verify deadlines and eligibility."
                        : "Notes mode · no AI-generated replies yet"}
                    </span>
                    <button
                      className="primary"
                      disabled={busy || !message.trim()}
                    >
                      {busy ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <Send size={17} />
                      )}
                      {mode.connected ? "Send" : "Save note"}
                    </button>
                  </div>
                </form>
              </div>
              <aside className="agent-chat-aside">
                <p className="eyebrow">A LITTLE DIRECTION</p>
                <h3>Make it more personal.</h3>
                <p>
                  Add a search brief and websites you trust. You can decide
                  whether to include profile details in AI requests.
                </p>
                <button className="secondary" onClick={() => setTab("brief")}>
                  Edit my search brief
                  <ArrowRight size={16} />
                </button>
                <div className="agent-aside-divider" />
                <LinkIcon size={23} />
                <h3>Found it somewhere else?</h3>
                <p>
                  Bring an Instagram reel, LinkedIn post, or application link.
                  Add a caption if the post isn’t publicly readable.
                </p>
                <button
                  className="text-button"
                  onClick={() => setImporting(true)}
                >
                  Save a shared link
                  <Plus size={16} />
                </button>
              </aside>
            </div>
          )}
          {tab === "brief" && (
            <form
              className="agent-brief"
              role="tabpanel"
              id="agent-brief-panel"
              aria-labelledby="agent-brief-tab"
              onSubmit={saveBrief}
            >
              <span className="agent-section-icon">
                <FileText size={24} />
              </span>
              <h2>What are you looking for?</h2>
              <p>
                Your brief stays in your account. It gives the connected
                assistant context; saving it doesn’t automatically run a search.
              </p>
              <label>
                My opportunity brief
                <textarea
                  rows={5}
                  maxLength={4000}
                  value={preferences.brief}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      brief: event.target.value,
                    })
                  }
                  placeholder="For example: medical research internships for second-year students, remote or in India, during June–August. Beginner friendly and preferably funded."
                />
              </label>
              <label>
                Websites I already know
                <textarea
                  rows={4}
                  value={sources}
                  onChange={(event) => setSources(event.target.value)}
                  maxLength={30000}
                  placeholder={
                    "https://devpost.com/\nhttps://example.org/opportunities"
                  }
                />
                <small>
                  One HTTPS link per line, up to 15. These guide research when
                  live search is available.
                </small>
              </label>
              <label className="agent-profile-consent">
                <input
                  type="checkbox"
                  checked={preferences.useProfile}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      useProfile: event.target.checked,
                    })
                  }
                />
                <span>
                  Include my profile in AI requests
                  <small>
                    Shares profession, location, skills, interests, and
                    experience{" "}
                    {mode.destination
                      ? `with ${mode.destination}`
                      : "with the configured model when connected"}
                    . Your email, password, age, and résumé are excluded.
                    Messages, brief, and active shared links are used as
                    conversation context.
                  </small>
                </span>
              </label>
              <button className="primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Check size={17} />
                )}
                Save my brief
              </button>
            </form>
          )}
          {tab === "links" && (
            <div
              role="tabpanel"
              id="agent-links-panel"
              aria-labelledby="agent-links-tab"
            >
              <div className="agent-links-header">
                <div>
                  <h2>A little inbox of possibilities.</h2>
                  <p>
                    Shared leads are unverified until you check their official
                    application pages.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setShowArchived(!showArchived)}
                >
                  {showArchived ? "Active links" : "Archived links"}
                </button>
              </div>
              <div className="agent-link-grid">
                {!visibleLeads.length && (
                  <div className="agent-empty agent-links-empty">
                    <LinkIcon size={28} />
                    <h3>
                      {showArchived
                        ? "Nothing archived."
                        : "Saw something worth keeping?"}
                    </h3>
                    <p>
                      Paste the link and caption of a reel, post, competition,
                      or event. It stays in your account.
                    </p>
                    {!showArchived && (
                      <button
                        className="secondary"
                        onClick={() => setImporting(true)}
                      >
                        Add my first link
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                )}
                {visibleLeads.map((lead) => (
                  <article className="agent-link-card" key={lead.id}>
                    <div className="agent-lead-label">
                      <span>{lead.platform}</span>
                      <small>UNVERIFIED LEAD</small>
                    </div>
                    <h3>{lead.title}</h3>
                    <a
                      className="agent-source-url"
                      href={lead.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {new URL(lead.url).hostname}
                      <ArrowUpRight size={14} />
                    </a>
                    <p className="agent-lead-caption">
                      {lead.caption ||
                        "Only the link was accessible. Add the post’s caption so your companion has something to work with."}
                    </p>
                    <small className="agent-preview-status">
                      {lead.metadata === "public-preview"
                        ? "Public page preview · may be incomplete"
                        : lead.metadata === "provided-text"
                          ? "Caption provided by you"
                          : "Link saved · caption needed"}
                    </small>
                    <div className="agent-link-actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          setDraft({
                            url: lead.url,
                            title: lead.title,
                            caption: lead.caption,
                          });
                          setImporting(true);
                        }}
                      >
                        Edit details
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setMessage(
                            `Help me understand this opportunity and find its official application page if live search is available. Clearly separate confirmed facts from unknowns.\n${lead.title}\n${lead.url}\n${lead.caption}`.slice(
                              0,
                              4000,
                            ),
                          );
                          setTab("chat");
                        }}
                      >
                        Discuss this
                        <ArrowRight size={16} />
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => archive(lead)}
                      >
                        {lead.archived ? "Restore" : "Archive"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <details className="agent-phone-help">
                <summary>
                  <Smartphone size={19} /> Share from Instagram or LinkedIn
                </summary>
                <p>
                  On supported phones, install Opportunity Compass, then choose
                  it from the other app’s Share menu. Review the shared link
                  before saving. Share-menu support varies by phone and browser;
                  you can always copy the link and paste it here.
                </p>
                {install && (
                  <button
                    className="secondary"
                    onClick={async () => {
                      await install.prompt();
                      await install.userChoice;
                      setInstall(null);
                    }}
                  >
                    Install Opportunity Compass
                    <ArrowUpRight size={16} />
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        window.location.origin + "/share",
                      );
                      setNotice("Share-receiver link copied.");
                    } catch {
                      setNotice(
                        "Open /share on this website to review a shared link.",
                      );
                    }
                  }}
                >
                  <Copy size={15} />
                  Copy share-receiver address
                </button>
              </details>
            </div>
          )}
        </>
      )}
      {importing && (
        <div className="agent-import-overlay">
          <div
            className="agent-import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-import-title"
            ref={importPanel}
          >
            <button
              className="icon-button agent-import-close"
              aria-label="Close link import"
              disabled={busy}
              onClick={closeImport}
            >
              <X size={21} />
            </button>
            <span className="agent-section-icon">
              <LinkIcon size={25} />
            </span>
            <h2 id="agent-import-title">Bring a possibility with you.</h2>
            <p>
              Paste an Instagram reel, LinkedIn post, or website link. We’ll try
              a public social-page preview; we can’t automatically watch private
              reels or retrieve their audio.
            </p>
            <form onSubmit={saveLink}>
              <label>
                Opportunity link
                <input
                  type="url"
                  value={draft.url}
                  onChange={(event) =>
                    setDraft({ ...draft, url: event.target.value })
                  }
                  required
                  maxLength={2048}
                  placeholder="https://www.instagram.com/reel/…"
                />
              </label>
              <label>
                A title to remember it by
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  maxLength={180}
                  placeholder="Summer research program"
                />
              </label>
              <label>
                Caption or details
                <textarea
                  rows={5}
                  value={draft.caption}
                  onChange={(event) =>
                    setDraft({ ...draft, caption: event.target.value })
                  }
                  maxLength={6000}
                  placeholder="Paste the caption, event name, or information you saw. This helps when the original post can’t be read."
                />
              </label>
              {error && (
                <p className="agent-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Plus size={17} />
                )}
                Save to my inbox
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
