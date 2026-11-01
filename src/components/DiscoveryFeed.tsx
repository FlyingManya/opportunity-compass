"use client";
import { ArrowUpRight, Clock, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type Discovery = {
  sourceUrl: string;
  title: string;
  organizer: string;
  description: string;
  deadline: string;
  reason: string;
  provenance?: "curated";
};

function cardAppearance(item: Discovery) {
  const topic = `${item.title} ${item.description}`.toLowerCase();
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

export default function DiscoveryFeed() {
  const [items, setItems] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);
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
  return (
    <section
      aria-label="Your researched opportunities"
      className="discovery-feed"
    >
      <h2>Researched for you</h2>
      <p>
        Ask your companion to find opportunities. Open each official page to
        confirm details before applying.
      </p>
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
                    <div
                      role="img"
                      aria-label={`Illustration for ${appearance.kind}`}
                      className="op-art"
                      style={{
                        backgroundPosition: `${appearance.art % 2 ? 100 : 0}% ${appearance.art > 1 ? 100 : 0}%`,
                      }}
                    />
                  </a>
                  <span className="art-badge">
                    {item.provenance === "curated"
                      ? "OFFICIAL SOURCE"
                      : "AI RESEARCHED"}
                  </span>
                </div>
                <div className="op-card-body">
                  <div className="card-category-row">
                    <span className={`category-pill ${appearance.color}`}>
                      {appearance.kind}
                    </span>
                    <span className="card-format">Real opportunity</span>
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
                      <Clock size={12} /> Apply by{" "}
                      {formatDeadline(item.deadline)}
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
    </section>
  );
}
