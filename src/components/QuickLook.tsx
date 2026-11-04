"use client";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import type { Profile } from "@/lib/types";
import type { QuickLookTopic } from "@/lib/quick-look";

export default function QuickLook({
  profile,
  resume,
  onChoose,
  onSetup,
}: {
  profile: Profile;
  resume: { name: string; size: number } | null;
  onChoose: (query: string) => void;
  onSetup: () => void;
}) {
  const [topics, setTopics] = useState<QuickLookTopic[]>([]);
  const [generating, setGenerating] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<QuickLookTopic | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const onUpdated = () => setRefresh((value) => value + 1);
    window.addEventListener("compass-quick-look-updated", onUpdated);
    return () =>
      window.removeEventListener("compass-quick-look-updated", onUpdated);
  }, []);
  const signature = JSON.stringify({ profile, resume });
  async function generate() {
    setGenerating(true);
    setUnavailable(false);
    setReason("");
    try {
      const response = await fetch("/api/agent/quick-look", { method: "POST" });
      if (!response.ok) throw new Error("Meta request failed");
      const body = await response.json();
      setTopics(Array.isArray(body.topics) ? body.topics : []);
      setUnavailable(!!body.unavailable);
      setReason(typeof body.reason === "string" ? body.reason : "");
    } catch {
      setUnavailable(true);
    } finally {
      setGenerating(false);
    }
  }
  useEffect(() => {
    let active = true;
    setTopics([]);
    setUnavailable(false);
    setReason("");
    (async () => {
      try {
        const response = await fetch("/api/agent/quick-look", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!active) return;
        setTopics(Array.isArray(body.topics) ? body.topics : []);
        setReason(typeof body.reason === "string" ? body.reason : "");
        setUnavailable(!!body.unavailable);
        if (body.stale) void generate();
      } catch {
        if (active) setUnavailable(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [signature, refresh]);
  const palette = ["lilac", "peach", "mint", "butter", "lilac", "peach"];
  const needsProfile =
    reason.startsWith("Save your profile") ||
    reason.startsWith("Add interests");
  return (
    <section className="stories-strip" aria-label="Personalized quick look">
      <div>
        <span className="eyebrow">A QUICK LOOK</span>
        <h3>Inspired by your interests.</h3>
      </div>
      <div className="story-circles">
        {!topics.length && (
          <p role="status">
            {generating
              ? "Meta is choosing ideas from your saved interests…"
              : unavailable
                ? reason || "Meta could not create ideas right now."
                : "Add interests to your profile to see personal ideas."}
          </p>
        )}
        {topics.map((item, index) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setSelected(item)}
          >
            <span className={`story-ring ${palette[index % palette.length]}`}>
              <span className="quick-look-icon" aria-hidden="true">
                {item.label.charAt(0).toUpperCase()}
              </span>
            </span>
            <small>{item.label}</small>
          </button>
        ))}
      </div>
      {unavailable && !needsProfile ? (
        <button
          type="button"
          className="secondary"
          onClick={() => void generate()}
          disabled={generating}
        >
          Retry
        </button>
      ) : unavailable ? (
        <button type="button" className="secondary" onClick={onSetup}>
          Set up Quick Look
        </button>
      ) : (
        !!topics.length && (
          <button
            type="button"
            className="icon-button story-more"
            aria-label="Search the first suggested topic"
            onClick={() => setSelected(topics[0])}
          >
            <ArrowRight size={19} />
          </button>
        )
      )}
      {selected && (
        <div
          className="quick-look-overlay"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <section
            className="quick-look-detail"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.label} ideas`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button quick-look-close"
              type="button"
              aria-label="Close topic"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">INSPIRED BY YOUR INTERESTS</span>
            <div className="quick-look-detail-icon" aria-hidden="true">
              {selected.label.charAt(0).toUpperCase()}
            </div>
            <h2>{selected.label}</h2>
            <p>
              Explore opportunities around {selected.label.toLowerCase()}. Pick
              a direction below, and your companion will look for current
              listings that fit your profile.
            </p>
            <div className="quick-look-ideas">
              {[
                { title: "Explore broadly", query: selected.query },
                {
                  title: "Competitions & events",
                  query: `Find current ${selected.label} competitions, hackathons, and events with future deadlines that fit my profile.`,
                },
                {
                  title: "Programs & fellowships",
                  query: `Find current ${selected.label} programs, research opportunities, and fellowships with future deadlines that fit my profile.`,
                },
              ].map((idea) => (
                <button
                  key={idea.title}
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    onChoose(idea.query);
                  }}
                >
                  <span>
                    <strong>{idea.title}</strong>
                    <small>{idea.query}</small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
