"use client";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Profile } from "@/lib/types";
import { quickLookFallback, type QuickLookTopic } from "@/lib/quick-look";

export default function QuickLook({
  profile,
  resume,
  onChoose,
}: {
  profile: Profile;
  resume: { name: string; size: number } | null;
  onChoose: (query: string) => void;
}) {
  const [topics, setTopics] = useState<QuickLookTopic[]>(() =>
    quickLookFallback(profile),
  );
  const signature = JSON.stringify({ profile, resume });
  useEffect(() => {
    let active = true;
    setTopics(quickLookFallback(profile));
    (async () => {
      try {
        const response = await fetch("/api/agent/quick-look", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = await response.json();
        if (active && Array.isArray(body.topics)) setTopics(body.topics);
        if (!body.stale) return;
        const generated = await fetch("/api/agent/quick-look", {
          method: "POST",
        });
        if (!generated.ok) return;
        const result = await generated.json();
        if (active && Array.isArray(result.topics)) setTopics(result.topics);
      } catch {
        // Profile-derived topics remain available when Meta is offline.
      }
    })();
    return () => {
      active = false;
    };
  }, [signature]);
  const palette = ["lilac", "peach", "mint", "butter", "lilac", "peach"];
  return (
    <section className="stories-strip" aria-label="Personalized quick look">
      <div>
        <span className="eyebrow">A QUICK LOOK</span>
        <h3>Inspired by your interests.</h3>
      </div>
      <div className="story-circles">
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
      <button
        type="button"
        className="icon-button story-more"
        aria-label="Search the first suggested topic"
        onClick={() => topics[0] && onChoose(topics[0].query)}
      >
        <ArrowRight size={19} />
      </button>
    </section>
  );
}
