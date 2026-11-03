"use client";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  LoaderCircle,
  Bookmark,
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
}: {
  openStatusSignal?: number;
  savedSourceUrls?: string[];
  savingSourceUrl?: string;
  onToggleInterested?: (item: Discovery) => void;
}) {
  const [items, setItems] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [targetTotal, setTargetTotal] = useState(0);
  const [statusIndex, setStatusIndex] = useState<number | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);
  async function addDemoCards() {
    if (demoBusy) return;
    setDemoBusy(true);
    setStatusError("");
    try {
      const response = await fetch("/api/agent/demo-seed", { method: "POST" });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not add demo cards.");
      const refreshed = await fetch("/api/agent/discoveries", {
        cache: "no-store",
      });
      const body = await refreshed.json();
      if (!refreshed.ok)
        throw new Error(body.error || "Could not reload cards.");
      setItems(Array.isArray(body.opportunities) ? body.opportunities : []);
      setStatusNotice(
        "Four manually selected demo cards and template Stories are ready.",
      );
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Could not add demo cards.",
      );
    } finally {
      setDemoBusy(false);
    }
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
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const statuses = items.filter((item) => item.statusReady);
  const currentStatus = statusIndex === null ? null : statuses[statusIndex];
  const currentIndex = statusIndex ?? 0;
  useEffect(() => {
    if (!openStatusSignal) return;
    if (statuses.length) setStatusIndex(0);
    else setStatusError("Select Update status to create your first stories.");
  }, [openStatusSignal]);
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
    const missing = items.filter(
      (item) => !item.statusReady && !!(item.deadline || item.eventDate),
    );
    const targets = (missing.length ? missing : items).slice(0, 4);
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
        "Stories are ready. Open View stories at the top of the page.",
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
      {!loading && !items.some((item) => item.provenance === "demo") && (
        <button
          type="button"
          className="text-button"
          onClick={addDemoCards}
          disabled={demoBusy}
        >
          {demoBusy ? "Adding demo examples…" : "Add demo examples"}
        </button>
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
              >
                <div className="card-art-wrap">
                  <a
                    className="art-open"
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open official page for ${item.title}`}
                  >
                    <OpportunityCardArt item={item} color={appearance.color} />
                  </a>
                  <span className="art-badge">
                    {item.provenance === "demo"
                      ? "DEMO · MANUALLY ADDED"
                      : item.provenance === "curated"
                        ? "OFFICIAL SOURCE"
                        : item.status?.startsWith("Search lead")
                          ? "WEB LINK · CHECK DATES"
                          : "AI RESEARCHED"}
                  </span>
                  {onToggleInterested && !!item.deadline && (
                    <button
                      type="button"
                      className={`bookmark-button ${savedSourceUrls.includes(item.sourceUrl) ? "is-saved" : ""}`}
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
                  </div>
                  <h3>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.title}
                    </a>
                  </h3>
                  <p className="organizer">{item.organizer}</p>
                  <p className="discovery-card-description">
                    {item.description}
                  </p>
                  <div className="card-bottom">
                    <span>
                      <Clock size={12} />{" "}
                      {item.deadline
                        ? `Apply by ${formatDeadline(item.deadline)}`
                        : item.eventDate
                          ? `Event on ${formatDeadline(item.eventDate)}`
                          : item.status?.startsWith("Search lead")
                            ? "Check deadline on official page"
                            : "No deadline published"}
                    </span>
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
