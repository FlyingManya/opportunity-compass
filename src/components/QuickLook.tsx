"use client";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Profile } from "@/lib/types";
import type { QuickLookTopic } from "@/lib/quick-look";

export default function QuickLook({
  profile,
  resume,
  onChoose,
}: {
  profile: Profile;
  resume: { name: string; size: number } | null;
  onChoose: (query: string) => void;
}) {
  const [topics, setTopics] = useState<QuickLookTopic[]>([]);
  const [generating, setGenerating] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
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
    try {
      const response = await fetch("/api/agent/quick-look", { method: "POST" });
      if (!response.ok) throw new Error("Meta request failed");
      const body = await response.json();
      setTopics(Array.isArray(body.topics) ? body.topics : []);
      setUnavailable(!!body.unavailable);
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
    (async () => {
      try {
        const response = await fetch("/api/agent/quick-look", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!active) return;
        setTopics(Array.isArray(body.topics) ? body.topics : []);
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
                ? "Meta could not create ideas right now."
                : "Add interests to your profile and enable Meta sharing in Chat & links to see personal ideas."}
          </p>
        )}
        {topics.map((item, index) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onChoose(item.query)}
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
      {unavailable ? (
        <button
          type="button"
          className="secondary"
          onClick={() => void generate()}
          disabled={generating}
        >
          Retry
        </button>
      ) : (
        !!topics.length && (
          <button
            type="button"
            className="icon-button story-more"
            aria-label="Search the first suggested topic"
            onClick={() => onChoose(topics[0].query)}
          >
            <ArrowRight size={19} />
          </button>
        )
      )}
    </section>
  );
}
