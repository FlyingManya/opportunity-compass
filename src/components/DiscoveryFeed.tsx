"use client";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  LoaderCircle,
  Bookmark,
  CalendarDays,
  Check,
  ExternalLink,
  Play,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

type Discovery = {
  sourceUrl: string;
  title: string;
  organizer: string;
  description: string;
  deadline: string;
  deadlineEvidence?: string;
  deadlineSourceUrl?: string;
  deadlineOrigin?: "manual" | "muse";
  reason: string;
  status?: string;
  provenance?: "curated" | "demo";
  eventDate?: string;
  statusImageUrl?: string | null;
  statusReady?: boolean;
  statusFallback?: boolean;
};

function cardAppearance(item: Discovery) {
  const topic = `${item.title} ${item.description}`.toLowerCase();
  if (item.provenance === "demo" && /womenhack/.test(topic))
    return { kind: "Networking event", color: "peach", art: 2 };
  if (item.provenance === "demo" && /amazon women of the world/.test(topic))
    return { kind: "Career program", color: "mint", art: 0 };
  if (
    /hackathon|codefest|capture the flag|\bctf\b|coding competition/.test(topic)
  )
    return { kind: "Hackathon or challenge", color: "lilac", art: 1 };
  if (/fellowship|scholarship|mentorship/.test(topic))
    return { kind: "Fellowship", color: "peach", art: 2 };
  if (/job|internship|engineer role/.test(topic))
    return { kind: "Career opportunity", color: "mint", art: 0 };
  return { kind: "Tech event", color: "butter", art: 3 };
}

function formatDeadline(deadline: string) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${deadline}T12:00:00Z`));
}

function DetailText({ text }: { text: string }) {
  const inline = (value: string) =>
    value
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      );
  return (
    <div className="discovery-detail-copy">
      {text.split(/\r?\n/).map((line, index) => {
        const value = line.trim();
        if (!value) return null;
        if (/^#{1,3}\s/.test(value))
          return <h3 key={index}>{inline(value.replace(/^#{1,3}\s+/, ""))}</h3>;
        if (/^\*\*[^*]+\*\*$/.test(value))
          return <h4 key={index}>{value.slice(2, -2)}</h4>;
        if (/^[-*]\s/.test(value))
          return (
            <p className="discovery-detail-bullet" key={index}>
              <span aria-hidden="true">•</span>
              {inline(value.slice(2))}
            </p>
          );
        return <p key={index}>{inline(value)}</p>;
      })}
    </div>
  );
}

function OpportunityCardArt({
  item,
  color,
}: {
  item: Discovery;
  color: string;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  useEffect(() => {
    if (!visible || item.provenance === "demo") return;
    let active = true;
    fetch("/api/agent/card-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrl: item.sourceUrl }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active) setImageUrl(body?.imageUrl || null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible, item.sourceUrl, item.provenance]);
  return (
    <div
      ref={setNode}
      className={`opportunity-card-image ${color}`}
      role="img"
      aria-label={
        imageUrl
          ? `Muse Image illustration for ${item.title}`
          : `Opportunity card for ${item.title}`
      }
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" loading="lazy" />
      ) : item.provenance === "demo" ? (
        <div
          className="op-art"
          aria-hidden="true"
          style={{
            backgroundPosition: `${cardAppearance(item).art % 2 ? 100 : 0}% ${cardAppearance(item).art > 1 ? 100 : 0}%`,
          }}
        />
      ) : (
        <span className="opportunity-card-placeholder" aria-hidden="true">
          <strong>{item.organizer.slice(0, 34)}</strong>
          <span>{item.title.slice(0, 80)}</span>
        </span>
      )}
    </div>
  );
}

export default function DiscoveryFeed({
  openStatusSignal = 0,
  savedSourceUrls = [],
  savingSourceUrl = "",
  onToggleInterested,
  onDeadlineFound,
  onOpportunityRemoved,
  onSavedSync,
  onCountChange,
}: {
  openStatusSignal?: number;
  savedSourceUrls?: string[];
  savingSourceUrl?: string;
  onToggleInterested?: (item: Discovery) => void;
  onDeadlineFound?: (sourceUrl: string, deadline: string) => void;
  onOpportunityRemoved?: (sourceUrl: string) => void;
  onSavedSync?: () => void;
  onCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [targetTotal, setTargetTotal] = useState(0);
  const [statusIndex, setStatusIndex] = useState<number | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [selected, setSelected] = useState<Discovery | null>(null);
  const [detail, setDetail] = useState("");
  const [detailProvider, setDetailProvider] = useState("");
  const [detailSources, setDetailSources] = useState<
    { title: string; url: string }[]
  >([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [deadlineBusyUrl, setDeadlineBusyUrl] = useState("");
  const [deadlineMessages, setDeadlineMessages] = useState<
    Record<string, string>
  >({});
  const [deadlineAttempted, setDeadlineAttempted] = useState<string[]>([]);
  const [manualDateUrl, setManualDateUrl] = useState("");
  const [manualDateValue, setManualDateValue] = useState("");
  const [manualBusyUrl, setManualBusyUrl] = useState("");
  useEffect(() => {
    if (!loading) onCountChange?.(items.length);
  }, [items.length, loading, onCountChange]);
  async function openDetail(item: Discovery) {
    setSelected(item);
    setDetail("");
    setDetailProvider("");
    setDetailSources([]);
    setDetailError("");
    setDetailBusy(true);
    try {
      const response = await fetch("/api/agent/discoveries/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: item.sourceUrl }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Details are unavailable.");
      setDetail(body.content || "");
      setDetailProvider(body.provider || "Muse Wonder");
      setDetailSources(Array.isArray(body.sources) ? body.sources : []);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Details are unavailable.",
      );
    } finally {
      setDetailBusy(false);
    }
  }
  function removeExpiredLocally(item: Discovery, message: string) {
    setItems((previous) =>
      previous.filter((entry) => entry.sourceUrl !== item.sourceUrl),
    );
    setSelected((previous) =>
      previous?.sourceUrl === item.sourceUrl ? null : previous,
    );
    setStatusNotice(message);
    onOpportunityRemoved?.(item.sourceUrl);
  }
  function applyDeadline(
    item: Discovery,
    deadline: string,
    origin: "manual" | "muse",
    evidence = "",
    sourceUrl = "",
  ) {
    const dateUpdate = {
      deadline,
      deadlineOrigin: origin,
      deadlineEvidence: evidence,
      deadlineSourceUrl: sourceUrl,
    };
    setItems((previous) =>
      previous.map((entry) =>
        entry.sourceUrl === item.sourceUrl
          ? { ...entry, ...dateUpdate }
          : entry,
      ),
    );
    setSelected((previous) =>
      previous?.sourceUrl === item.sourceUrl
        ? { ...previous, ...dateUpdate }
        : previous,
    );
    onDeadlineFound?.(item.sourceUrl, deadline);
    setManualDateUrl("");
    setManualDateValue("");
  }
  async function saveManualDeadline(item: Discovery) {
    if (!manualDateValue || manualBusyUrl) return;
    setManualBusyUrl(item.sourceUrl);
    setDeadlineMessages((previous) => ({ ...previous, [item.sourceUrl]: "" }));
    try {
      const response = await fetch("/api/agent/discoveries/deadline/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: item.sourceUrl,
          deadline: manualDateValue,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save this date.");
      if (body.removed) removeExpiredLocally(item, body.message);
      else if (body.deadline) {
        applyDeadline(item, body.deadline, "manual");
        setDeadlineMessages((previous) => ({
          ...previous,
          [item.sourceUrl]:
            "Your date was saved. Check the official source before relying on it.",
        }));
      }
    } catch (error) {
      setDeadlineMessages((previous) => ({
        ...previous,
        [item.sourceUrl]:
          error instanceof Error ? error.message : "Could not save this date.",
      }));
    } finally {
      setManualBusyUrl("");
    }
  }
  function manualDateControls(item: Discovery) {
    return (
      <>
        <button
          type="button"
          className="discovery-enter-deadline"
          onClick={(event) => {
            event.stopPropagation();
            setManualDateUrl((previous) =>
              previous === item.sourceUrl ? "" : item.sourceUrl,
            );
            setManualDateValue("");
          }}
        >
          Enter date manually
        </button>
        {manualDateUrl === item.sourceUrl && (
          <form
            className="discovery-manual-date-form"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveManualDeadline(item);
            }}
          >
            <input
              type="date"
              required
              aria-label={`Application deadline for ${item.title}`}
              value={manualDateValue}
              onChange={(event) => setManualDateValue(event.target.value)}
            />
            <button
              type="submit"
              disabled={!manualDateValue || !!manualBusyUrl}
            >
              {manualBusyUrl === item.sourceUrl ? "Saving…" : "Save date"}
            </button>
          </form>
        )}
      </>
    );
  }
  async function findDeadline(item: Discovery) {
    if (deadlineBusyUrl) return;
    setDeadlineBusyUrl(item.sourceUrl);
    setDeadlineMessages((previous) => ({ ...previous, [item.sourceUrl]: "" }));
    setDeadlineAttempted((previous) =>
      previous.includes(item.sourceUrl)
        ? previous
        : [...previous, item.sourceUrl],
    );
    try {
      const response = await fetch("/api/agent/discoveries/deadline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: item.sourceUrl }),
        signal: AbortSignal.timeout(65000),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Muse Wonder could not check this date.");
      if (body.removed) removeExpiredLocally(item, body.message);
      else if (body.found && body.deadline) {
        applyDeadline(
          item,
          body.deadline,
          "muse",
          body.evidence,
          body.sourceUrl,
        );
        setDeadlineMessages((previous) => ({
          ...previous,
          [item.sourceUrl]:
            "Deadline found by Muse Wonder. Confirm it on the source page.",
        }));
      } else {
        setDeadlineMessages((previous) => ({
          ...previous,
          [item.sourceUrl]:
            body.message ||
            "No published deadline found. Check the source or try again later.",
        }));
      }
    } catch (error) {
      setDeadlineMessages((previous) => ({
        ...previous,
        [item.sourceUrl]:
          error instanceof Error
            ? error.message
            : "Could not check this deadline. Try again later.",
      }));
    } finally {
      setDeadlineBusyUrl("");
    }
  }
  async function refreshCards() {
    if (refreshing) return;
    setRefreshing(true);
    setStatusError("");
    try {
      const response = await fetch("/api/agent/discoveries/refresh", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not refresh cards.");
      const latest = await fetch("/api/agent/discoveries", {
        cache: "no-store",
      });
      const dashboard = await latest.json();
      if (!latest.ok)
        throw new Error(dashboard.error || "Could not load cards.");
      setItems(
        Array.isArray(dashboard.opportunities) ? dashboard.opportunities : [],
      );
      onSavedSync?.();
      setStatusNotice(
        body.removed
          ? `Removed ${body.removed} opportunit${body.removed === 1 ? "y" : "ies"} with passed deadlines.`
          : "Dashboard is up to date.",
      );
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Could not refresh cards.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  async function removeCard(item: Discovery) {
    const response = await fetch("/api/agent/discoveries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrl: item.sourceUrl }),
    });
    if (response.ok)
      setItems((current) =>
        current.filter((entry) => entry.sourceUrl !== item.sourceUrl),
      );
    else setStatusError("Could not remove that card.");
  }
  useEffect(() => {
    let active = true;
    function refresh() {
      fetch("/api/agent/discoveries", { cache: "no-store" })
        .then((response) => response.json())
        .then((body) => {
          if (active)
            setItems(
              Array.isArray(body.opportunities) ? body.opportunities : [],
            );
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    refresh();
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 15 * 60 * 1000);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
    };
  }, []);
  const statuses = items;
  const currentStatus = statusIndex === null ? null : statuses[statusIndex];
  const currentIndex = statusIndex ?? 0;
  useEffect(() => {
    if (!openStatusSignal) return;
    if (statuses.length) setStatusIndex(0);
    else if (!loading)
      setStatusError("Find an opportunity to start your stories.");
  }, [openStatusSignal, statuses.length, loading]);
  useEffect(() => {
    if (statusIndex === null) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setStatusIndex(null);
      if (event.key === "ArrowRight")
        setStatusIndex((index) =>
          Math.min(statuses.length - 1, (index || 0) + 1),
        );
      if (event.key === "ArrowLeft")
        setStatusIndex((index) => Math.max(0, (index || 0) - 1));
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [statusIndex, statuses.length]);
  async function updateStatus() {
    if (updating || !items.length) return;
    setUpdating(true);
    setProgress(0);
    setStatusError("");
    setStatusNotice("");
    let completed = 0;
    const missing = items.filter((item) => !item.statusReady);
    if (!missing.length) {
      setStatusNotice("All your current stories already have artwork.");
      setUpdating(false);
      return;
    }
    const targets = missing.slice(0, 4);
    setTargetTotal(targets.length);
    const outcomes = await Promise.allSettled(
      targets.map(async (item) => {
        try {
          const response = await fetch("/api/agent/status-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceUrl: item.sourceUrl }),
            signal: AbortSignal.timeout(58000),
          });
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error || "Status generation failed.");
          setItems((current) =>
            current.map((entry) =>
              entry.sourceUrl === item.sourceUrl
                ? {
                    ...entry,
                    statusImageUrl: body.imageUrl,
                    statusReady: true,
                    statusFallback: !!body.fallback,
                  }
                : entry,
            ),
          );
          return !!body.fallback;
        } finally {
          completed++;
          setProgress(completed);
        }
      }),
    );
    const failures = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    );
    if (failures.length) {
      const first = failures[0] as PromiseRejectedResult;
      setStatusError(
        first.reason instanceof Error
          ? first.reason.message
          : "Some images could not be created.",
      );
    }
    if (
      outcomes.some(
        (outcome) => outcome.status === "fulfilled" && outcome.value,
      )
    )
      setStatusError(
        "Muse Image is unavailable for this Meta account. Statuses use clearly labelled template artwork for now.",
      );
    if (outcomes.some((outcome) => outcome.status === "fulfilled"))
      setStatusNotice(
        `View stories includes all ${items.length} dashboard opportunities. Update status adds Muse Image artwork to up to four at a time.`,
      );
    setUpdating(false);
  }
  return (
    <section
      aria-label="Your researched opportunities"
      className="discovery-feed"
    >
      <div className="discovery-heading">
        <h2>Researched for you</h2>
        {!!items.length && (
          <div className="discovery-status-actions">
            <button
              type="button"
              className="secondary"
              onClick={refreshCards}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh dashboard"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={updateStatus}
              disabled={updating}
            >
              {updating ? (
                <LoaderCircle size={15} className="status-spinner" />
              ) : (
                <Sparkles size={15} />
              )}
              {updating
                ? `Creating ${progress}/${targetTotal}`
                : "Update status"}
            </button>
          </div>
        )}
      </div>
      <p>
        Ask your companion to find opportunities. Open each official page to
        confirm details before applying.
      </p>
      {!!items.length && (
        <p>
          View stories includes all {items.length} dashboard opportunities.
          Update status creates artwork for up to four at a time.
        </p>
      )}
      {statusError && (
        <p className="status-error" role="alert">
          {statusError}
        </p>
      )}
      {statusNotice && (
        <p className="status-notice" role="status">
          {statusNotice}
        </p>
      )}
      {!loading && !items.length && (
        <p>No current, source-backed opportunities have been added yet.</p>
      )}
      {!!items.length && (
        <div className="opportunity-grid discovery-feed-grid">
          {items.map((item) => {
            const appearance = cardAppearance(item);
            return (
              <article
                key={item.sourceUrl}
                className="op-card discovery-feed-card"
                onClick={(event) => {
                  if (
                    !(event.target as HTMLElement).closest(
                      "button,a,input,form,label",
                    )
                  )
                    openDetail(item);
                }}
              >
                <div className="card-art-wrap">
                  <button
                    type="button"
                    className="art-open"
                    onClick={() => openDetail(item)}
                    aria-label={`View details for ${item.title}`}
                  >
                    <OpportunityCardArt item={item} color={appearance.color} />
                  </button>
                  <span className="art-badge">
                    {item.provenance === "demo"
                      ? "DEMO · MANUALLY ADDED"
                      : item.provenance === "curated"
                        ? "OFFICIAL SOURCE"
                        : item.status?.startsWith("Search lead")
                          ? "WEB LINK · CHECK DATES"
                          : item.status?.startsWith("Verified on Devpost")
                            ? "DEVPOST · DATE CHECKED"
                            : "AI RESEARCHED"}
                  </span>
                  {onToggleInterested && (
                    <button
                      type="button"
                      className={`bookmark-button discovery-interested-button ${savedSourceUrls.includes(item.sourceUrl) ? "is-saved" : ""}`}
                      onClick={() => onToggleInterested(item)}
                      disabled={savingSourceUrl === item.sourceUrl}
                      aria-label={`${savedSourceUrls.includes(item.sourceUrl) ? "Remove" : "Add"} ${item.title} ${savedSourceUrls.includes(item.sourceUrl) ? "from" : "to"} Interested`}
                      title={
                        savedSourceUrls.includes(item.sourceUrl)
                          ? "Remove from Interested"
                          : "Add to Interested"
                      }
                    >
                      <Bookmark
                        size={18}
                        fill={
                          savedSourceUrls.includes(item.sourceUrl)
                            ? "currentColor"
                            : "none"
                        }
                      />
                      <span>
                        {savingSourceUrl === item.sourceUrl
                          ? "Saving…"
                          : savedSourceUrls.includes(item.sourceUrl)
                            ? "Interested"
                            : "I'm interested"}
                      </span>
                    </button>
                  )}
                </div>
                <div className="op-card-body">
                  <div className="card-category-row">
                    <span className={`category-pill ${appearance.color}`}>
                      {appearance.kind}
                    </span>
                    <span className="card-format">
                      {item.provenance === "demo"
                        ? "Demo selection"
                        : item.status?.startsWith("Search lead")
                          ? "Details unverified"
                          : "Real opportunity"}
                    </span>
                    {!item.provenance && (
                      <button
                        type="button"
                        className="discovery-remove"
                        onClick={() => removeCard(item)}
                        aria-label={`Remove ${item.title} from dashboard`}
                        title="Remove from dashboard"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <h3>
                    <button
                      type="button"
                      className="discovery-title-button"
                      onClick={() => openDetail(item)}
                    >
                      {item.title}
                    </button>
                  </h3>
                  <p className="organizer">{item.organizer}</p>
                  <p className="discovery-card-description">
                    {item.description}
                  </p>
                  <div className="card-bottom">
                    <div className="discovery-deadline-details">
                      <span>
                        <Clock size={12} />{" "}
                        {item.deadline
                          ? `Apply by ${formatDeadline(item.deadline)}`
                          : "Deadline not mentioned"}
                      </span>
                      {!item.deadline && item.eventDate && (
                        <span>Event on {formatDeadline(item.eventDate)}</span>
                      )}
                      {!item.deadline && (
                        <button
                          type="button"
                          className="discovery-find-deadline"
                          disabled={!!deadlineBusyUrl}
                          onClick={() => findDeadline(item)}
                        >
                          <Sparkles size={13} />
                          {deadlineBusyUrl === item.sourceUrl
                            ? "Muse is checking…"
                            : deadlineAttempted.includes(item.sourceUrl)
                              ? "Try again with Muse AI"
                              : "Find with Muse AI"}
                        </button>
                      )}
                      {!item.deadline && manualDateControls(item)}
                      {item.deadlineOrigin === "manual" && (
                        <small className="discovery-deadline-feedback">
                          Date entered by you · check the source
                        </small>
                      )}
                      {deadlineMessages[item.sourceUrl] && (
                        <small
                          className="discovery-deadline-feedback"
                          role="status"
                        >
                          {deadlineMessages[item.sourceUrl]}
                        </small>
                      )}
                    </div>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open official page for ${item.title}`}
                    >
                      <ArrowUpRight size={18} />
                    </a>
                  </div>
                  <p className="relevance discovery-card-reason">
                    <Sparkles size={11} /> {item.reason}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {selected && (
        <div
          className="generated-status-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Details for ${selected.title}`}
        >
          <div className="discovery-detail-panel">
            <button
              type="button"
              className="generated-status-close"
              aria-label="Close details"
              onClick={() => setSelected(null)}
            >
              <X size={22} />
            </button>
            <div className="discovery-detail-art">
              <OpportunityCardArt
                item={selected}
                color={cardAppearance(selected).color}
              />
            </div>
            <p className="sample-label">
              {cardAppearance(selected).kind} · Opportunity details
            </p>
            <h2>{selected.title}</h2>
            <p className="discovery-detail-subtitle">{selected.organizer}</p>
            <p className="discovery-detail-description">
              {selected.description}
            </p>
            <div className="discovery-detail-facts">
              <div>
                <Clock size={18} />
                <small>Application deadline</small>
                <strong>
                  {selected.deadline
                    ? formatDeadline(selected.deadline)
                    : "Not mentioned"}
                </strong>
                {selected.deadlineEvidence && selected.deadlineSourceUrl && (
                  <a
                    className="discovery-deadline-source"
                    href={selected.deadlineSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Muse found: {selected.deadlineEvidence}{" "}
                    <ArrowUpRight size={13} />
                  </a>
                )}
                {selected.deadlineOrigin === "manual" && (
                  <small className="discovery-deadline-feedback">
                    Date entered by you. Confirm it on the original page.
                  </small>
                )}
                {!selected.deadline && (
                  <button
                    type="button"
                    className="discovery-find-deadline"
                    disabled={!!deadlineBusyUrl}
                    onClick={() => findDeadline(selected)}
                  >
                    <Sparkles size={13} />
                    {deadlineBusyUrl === selected.sourceUrl
                      ? "Muse is checking…"
                      : deadlineAttempted.includes(selected.sourceUrl)
                        ? "Try again with Muse AI"
                        : "Find with Muse AI"}
                  </button>
                )}
                {!selected.deadline && manualDateControls(selected)}
                {deadlineMessages[selected.sourceUrl] && (
                  <small className="discovery-deadline-feedback" role="status">
                    {deadlineMessages[selected.sourceUrl]}
                  </small>
                )}
              </div>
              <div>
                <CalendarDays size={18} />
                <small>Event date</small>
                <strong>
                  {selected.eventDate
                    ? formatDeadline(selected.eventDate)
                    : "Not mentioned"}
                </strong>
              </div>
              <div>
                <Sparkles size={18} />
                <small>Why it may fit</small>
                <strong>
                  {selected.reason ||
                    "Explore whether this matches your interests."}
                </strong>
              </div>
              <div>
                <ExternalLink size={18} />
                <small>Source</small>
                <strong>{new URL(selected.sourceUrl).hostname}</strong>
              </div>
            </div>
            <div className="discovery-detail-columns">
              <section>
                <h3>About this opportunity</h3>
                <p>{selected.description}</p>
                <h3>Research & guidance</h3>
                {detailBusy && (
                  <p role="status">Muse Wonder is checking this opportunity…</p>
                )}
                {detailError && <p role="alert">{detailError}</p>}
                {detailProvider && (
                  <p className="discovery-detail-provider">
                    {detailProvider === "Muse Wonder"
                      ? "Researched with Muse Wonder. Confirm details on the official page."
                      : detailProvider === "Muse Spark"
                        ? "General guidance from Muse Spark. Page details were not verified."
                        : "General preparation template. Page details were not verified."}
                  </p>
                )}
                {detail && <DetailText text={detail} />}
                {!detailBusy && !detail && (
                  <p>
                    Open the source page to confirm eligibility, application
                    steps, and the exact deadline.
                  </p>
                )}
                {detailSources.length > 0 && (
                  <div className="discovery-detail-sources">
                    <h3>Sources</h3>
                    {detailSources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.title} <ArrowUpRight size={14} />
                      </a>
                    ))}
                  </div>
                )}
              </section>
              <aside>
                <h3>What to check</h3>
                <ul className="discovery-detail-checklist">
                  <li>
                    <Check size={16} />
                    Confirm eligibility and location on the source page.
                  </li>
                  <li>
                    <Check size={16} />
                    Check the deadline, time zone, and application steps.
                  </li>
                  <li>
                    <Check size={16} />
                    Prepare examples of your relevant work or experience.
                  </li>
                </ul>
                <h3>Helpful next steps</h3>
                <p>
                  Read the official rules, note any required documents, and plan
                  time to apply before the deadline.
                </p>
                <a
                  className="discovery-video-link"
                  href={
                    detailSources.find((source) =>
                      /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(
                        new URL(source.url).hostname,
                      ),
                    )?.url ||
                    `https://www.youtube.com/results?search_query=${encodeURIComponent(`${cardAppearance(selected).kind} preparation tips`)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Play size={16} />
                  {detailSources.some((source) =>
                    /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(
                      new URL(source.url).hostname,
                    ),
                  )
                    ? "Watch a related video"
                    : "Search YouTube for preparation tips"}
                  <ArrowUpRight size={14} />
                </a>
                <small>
                  {detailSources.some((source) =>
                    /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(
                      new URL(source.url).hostname,
                    ),
                  )
                    ? "Video linked from research results; review its relevance."
                    : "Opens a YouTube search, not a verified video for this listing."}
                </small>
              </aside>
            </div>
            <div className="discovery-detail-actions">
              {onToggleInterested && (
                <button
                  type="button"
                  className="primary"
                  disabled={savingSourceUrl === selected.sourceUrl}
                  onClick={() => onToggleInterested(selected)}
                >
                  <Bookmark
                    size={16}
                    fill={
                      savedSourceUrls.includes(selected.sourceUrl)
                        ? "currentColor"
                        : "none"
                    }
                  />
                  {savedSourceUrls.includes(selected.sourceUrl)
                    ? "Remove from Interested"
                    : "I'm interested"}
                </button>
              )}
              <a
                href={selected.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open original page <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        </div>
      )}
      {currentStatus && (
        <div
          className="generated-status-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Opportunity status"
        >
          <button
            className="generated-status-close"
            type="button"
            aria-label="Close status"
            onClick={() => setStatusIndex(null)}
          >
            <X size={23} />
          </button>
          <button
            className="generated-status-nav"
            type="button"
            aria-label="Previous status"
            disabled={currentIndex === 0}
            onClick={() => setStatusIndex(Math.max(0, currentIndex - 1))}
          >
            <ChevronLeft size={25} />
          </button>
          <article className="generated-status-card">
            {currentStatus.statusImageUrl ? (
              <img
                src={currentStatus.statusImageUrl}
                alt="Muse Image illustration for this opportunity"
              />
            ) : (
              <div
                role="img"
                aria-label="Template illustration for this opportunity"
                className="op-art generated-status-template"
                style={{
                  backgroundPosition: `${cardAppearance(currentStatus).art % 2 ? 100 : 0}% ${cardAppearance(currentStatus).art > 1 ? 100 : 0}%`,
                }}
              />
            )}
            <div className="generated-status-shade" />
            <div className="generated-status-progress">
              {statuses.map((item, index) => (
                <span
                  key={item.sourceUrl}
                  className={index <= currentIndex ? "active" : ""}
                />
              ))}
            </div>
            <div className="generated-status-brand">
              <Sparkles size={17} /> Opportunity Compass ·{" "}
              {currentStatus.statusFallback ? "Template artwork" : "Muse Image"}
            </div>
            <div className="generated-status-copy">
              <span className="generated-status-label">
                {currentStatus.organizer}
              </span>
              <h2>{currentStatus.title}</h2>
              <p>{currentStatus.description}</p>
              <span className="generated-status-deadline">
                <Clock size={15} />{" "}
                {currentStatus.deadline
                  ? `Apply by ${formatDeadline(currentStatus.deadline)}`
                  : currentStatus.eventDate
                    ? `Event on ${formatDeadline(currentStatus.eventDate)}`
                    : "No deadline published"}
              </span>
              <a
                href={currentStatus.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View official opportunity <ArrowUpRight size={16} />
              </a>
              <small>Check the official page before applying.</small>
            </div>
          </article>
          <button
            className="generated-status-nav"
            type="button"
            aria-label="Next status"
            disabled={currentIndex === statuses.length - 1}
            onClick={() =>
              setStatusIndex(Math.min(statuses.length - 1, currentIndex + 1))
            }
          >
            <ChevronRight size={25} />
          </button>
        </div>
      )}
    </section>
  );
}
