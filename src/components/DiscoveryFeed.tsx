"use client";
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
        <div className="discovery-feed-grid">
          {items.map((item) => (
            <article key={item.sourceUrl} className="discovery-feed-card">
              <span>
                {item.provenance === "curated"
                  ? "OFFICIAL SOURCE · CURATED LEAD"
                  : "AI RESEARCHED OPPORTUNITY"}
              </span>
              <h3>{item.title}</h3>
              <p>{item.organizer}</p>
              <p>{item.description}</p>
              <p>
                <strong>Application deadline:</strong> {item.deadline}
              </p>
              <p>
                <strong>Why it may fit:</strong> {item.reason}
              </p>
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Check official source ↗
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
