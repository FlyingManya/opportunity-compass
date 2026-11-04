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
  RotateCcw,
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
import { sourceExamples } from "@/lib/source-examples";
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
    signal: AbortSignal.timeout(path === "chat" ? 220000 : 50000),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Please try again.");
  return result;
}
export default function AgentPanel({
  initialPrompt = "",
  onPromptConsumed,
}: {
  initialPrompt?: string;
  onPromptConsumed?: () => void;
}) {
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
  const [pendingChat, setPendingChat] = useState<
    "research" | "reply" | "note" | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const importPanel = useRef<HTMLDivElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (initialPrompt) {
      setTab("chat");
      setMessage(initialPrompt);
      composer.current?.focus();
      onPromptConsumed?.();
    }
  }, [initialPrompt, onPromptConsumed]);

  function openLinkForm() {
    setTab("links");
    setShowArchived(false);
    setError("");
    linkInput.current?.focus();
  }
  useEffect(() => {
    if (tab === "links" && !loading && !importing) linkInput.current?.focus();
  }, [tab, loading, importing]);

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
  }, [messages.length, pendingChat]);
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
    const content = message.trim();
    if (!content || busy) return;
    const submittedAt = Date.now();
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const researching =
      mode.search &&
      /\b(find|search|show|recommend|discover|looking for|opportunit(?:y|ies)|hackathons?|fellowships?|scholarships?|competitions?|events?|jobs?|programs?)\b/i.test(
        content,
      );
    setBusy(true);
    setPendingChat(
      mode.connected ? (researching ? "research" : "reply") : "note",
    );
    setError("");
    setNotice("");
    setMessages((previous) => [
      ...previous,
      {
        id: optimisticId,
        role: "user",
        content,
        createdAt: new Date(submittedAt).toISOString(),
      },
    ]);
    setMessage("");
    try {
      const result = await request("chat", "POST", { message: content });
      setMessages((previous) => [
        ...previous.map((item) =>
          item.id === optimisticId ? result.sent : item,
        ),
        ...(result.reply ? [result.reply] : []),
      ]);
      setNotice(result.notice || "");
    } catch (cause) {
      try {
        const state = await request("state");
        const saved = (state.messages as AgentMessage[]).some(
          (item) =>
            item.role === "user" &&
            item.content === content &&
            new Date(item.createdAt).getTime() >= submittedAt - 10000,
        );
        if (saved) {
          setMessages(state.messages);
          setNotice(
            "Your message was saved, but the response could not be confirmed. Please check again in a moment.",
          );
        } else {
          setMessages((previous) =>
            previous.filter((item) => item.id !== optimisticId),
          );
          setMessage((previous) => previous || content);
          setError((cause as Error).message);
        }
      } catch {
        setMessages((previous) =>
          previous.filter((item) => item.id !== optimisticId),
        );
        setMessage((previous) => previous || content);
        setError((cause as Error).message);
      }
    } finally {
      setPendingChat(null);
      setBusy(false);
    }
  }
  async function startFresh() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request("chat/new", "POST");
      setMessages([]);
      setNotice(
        "Fresh conversation started. Your earlier messages remain saved in your account.",
      );
      composer.current?.focus();
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
      void fetch("/api/agent/quick-look", { method: "POST" })
        .then(() =>
          window.dispatchEvent(new Event("compass-quick-look-updated")),
        )
        .catch(() => {});
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
        <button className="secondary" onClick={openLinkForm}>
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
                <div className="agent-chat-toolbar">
                  <span>Conversation</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={startFresh}
                    disabled={busy || !messages.length}
                  >
                    <RotateCcw size={15} /> New chat
                  </button>
                </div>
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
                          "Find open women-in-tech opportunities that fit my experience.",
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
                  {pendingChat && (
                    <article
                      className="agent-message assistant agent-progress"
                      role="status"
                    >
                      <span>Opportunity Compass</span>
                      <p>
                        <LoaderCircle
                          size={17}
                          className="spin"
                          aria-hidden="true"
                        />
                        {pendingChat === "research"
                          ? "I’m researching current opportunities and checking their sources…"
                          : pendingChat === "reply"
                            ? "I’m thinking about your message…"
                            : "I’m saving your note…"}
                      </p>
                      {pendingChat === "research" && (
                        <small>Web research can take a minute or two.</small>
                      )}
                    </article>
                  )}
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
                      {busy
                        ? "Searching…"
                        : mode.connected
                          ? "Send"
                          : "Save note"}
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
                <button className="text-button" onClick={openLinkForm}>
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
                Save what you want to find and any websites you trust. The next
                chat search uses your saved brief when AI context sharing is
                enabled. Saving does not search the web or add cards by itself.
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
                  placeholder="For example: women-in-tech fellowships and hackathons for a software engineer, remote or in India. Show only open applications."
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
                  One HTTPS link per line, up to 15. For Meta AI, your saved
                  sites guide research when “Use my saved context” is enabled.
                </small>
              </label>
              <div className="agent-source-examples">
                <strong>Suggested places to look</strong>
                <p>
                  These are starting points, not confirmed open applications.
                </p>
                <div>
                  {sourceExamples.map(({ name, url }) => (
                    <button
                      type="button"
                      key={url}
                      onClick={() =>
                        setSources((current) =>
                          current.split("\n").includes(url)
                            ? current
                            : [current.trim(), url].filter(Boolean).join("\n"),
                        )
                      }
                    >
                      <Plus size={14} /> {name}
                    </button>
                  ))}
                </div>
                <small>
                  Choose a site, then save your brief. Check each site's current
                  eligibility and dates.
                </small>
              </div>
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
                    . Your email, password, age, and résumé are excluded unless
                    you separately opt into résumé sharing. Messages, brief, and
                    active shared links are used as conversation context.
                  </small>
                </span>
              </label>
              <label className="agent-profile-consent">
                <input
                  type="checkbox"
                  checked={!!preferences.useResume}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      useResume: event.target.checked,
                    })
                  }
                />
                <span>
                  Include my uploaded résumé in AI requests
                  <small>
                    Shares the résumé file with{" "}
                    {mode.destination || "the connected AI provider"} when you
                    send a message. Turn this off at any time. Requires an
                    uploaded PDF or text résumé.
                  </small>
                </span>
              </label>
              {mode.label === "Meta AI" && (
                <label className="agent-profile-consent">
                  <input
                    type="checkbox"
                    checked={!!preferences.useMetaContext}
                    onChange={(event) =>
                      setPreferences({
                        ...preferences,
                        useMetaContext: event.target.checked,
                      })
                    }
                  />
                  <span>
                    Use my saved context with Meta AI
                    <small>
                      Shares my search brief, profile fields I enabled, active
                      shared links, recent conversation, and résumé if enabled
                      with api.meta.ai. Until enabled, Meta receives only the
                      latest message and today's date.
                    </small>
                  </span>
                </label>
              )}
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
              {!showArchived && (
                <form className="agent-link-entry" onSubmit={saveLink}>
                  <h3>Paste an opportunity link</h3>
                  <p>
                    Save a public Instagram reel, LinkedIn post, or website
                    link. A saved link stays in your private inbox; use “Discuss
                    this” to ask the assistant to research it.
                  </p>
                  <label>
                    Opportunity link
                    <input
                      ref={linkInput}
                      type="url"
                      required
                      maxLength={2048}
                      value={draft.url}
                      onChange={(event) =>
                        setDraft({ ...draft, url: event.target.value })
                      }
                      placeholder="https://www.instagram.com/reel/…"
                    />
                  </label>
                  <div className="agent-link-entry-details">
                    <label>
                      Title (optional)
                      <input
                        maxLength={180}
                        value={draft.title}
                        onChange={(event) =>
                          setDraft({ ...draft, title: event.target.value })
                        }
                        placeholder="Summer research program"
                      />
                    </label>
                    <label>
                      Caption or details (helpful for social posts)
                      <textarea
                        rows={2}
                        maxLength={6000}
                        value={draft.caption}
                        onChange={(event) =>
                          setDraft({ ...draft, caption: event.target.value })
                        }
                        placeholder="Paste the event name, caption, or details you saw."
                      />
                    </label>
                  </div>
                  <button className="primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                    Save shared link
                  </button>
                </form>
              )}
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
                      <button className="secondary" onClick={openLinkForm}>
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
                          openLinkForm();
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
