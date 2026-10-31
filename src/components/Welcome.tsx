"use client";
import "./welcome.css";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Check,
  Compass,
  HeartHandshake,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";

type Mode = "login" | "signup";

export default function Welcome() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const previousTrigger = useRef<HTMLElement | null>(null);

  function open(next: Mode) {
    previousTrigger.current = document.activeElement as HTMLElement;
    setError("");
    setMode(next);
  }

  useEffect(() => {
    if (!mode) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setMode(null);
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input",
      );
      if (!controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
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
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
      previousTrigger.current?.focus();
    };
  }, [mode, busy]);

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.code === "DATABASE_SETUP_REQUIRED"
            ? "Sign-in is temporarily unavailable. Please try again shortly."
            : result.error || "We couldn’t sign you in. Please try again.",
        );
      window.location.assign("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="welcome-page">
      <header className="welcome-nav">
        <a href="/" className="logo" aria-label="Opportunity Compass home">
          <span>
            <Compass size={26} />
          </span>
          <div>
            opportunity<small>COMPASS</small>
          </div>
        </a>
        <nav aria-label="Welcome navigation">
          <button className="welcome-signin" onClick={() => open("login")}>
            Sign in
          </button>
          <button className="primary" onClick={() => open("signup")}>
            Get started <ArrowUpRight size={17} />
          </button>
        </nav>
      </header>

      <main>
        <section className="welcome-hero">
          <div className="welcome-copy">
            <p className="welcome-eyebrow">
              <Sparkles size={16} /> FOR THE CURIOUS. THE DREAMERS. THE DOERS.
            </p>
            <h1>
              A little direction.
              <br />
              <span>
                A world of
                <br className="welcome-title-break" /> possibility.
              </span>
            </h1>
            <p className="welcome-description">
              Your next chapter could be a dream job, a weekend workshop, or a
              community that gets you. Make a little space to find it.
            </p>
            <button
              className="primary welcome-cta"
              onClick={() => open("signup")}
            >
              Find my next possibility <ArrowRight size={19} />
            </button>
            <p className="welcome-returning">
              Already have your own compass?{" "}
              <button onClick={() => open("login")}>
                Welcome back <ArrowUpRight size={15} />
              </button>
            </p>
            <div className="welcome-promise">
              <span>
                <Check size={15} /> Your own profile
              </span>
              <span>
                <Check size={15} /> Your saved possibilities
              </span>
            </div>
          </div>

          <div
            className="welcome-world"
            aria-label="Illustrations of people creating, connecting, and exploring new interests"
            role="img"
          >
            <div className="welcome-orbit" />
            <span className="welcome-spark welcome-spark-one">✦</span>
            <div className="welcome-art welcome-art-community">
              <span>Find your people.</span>
            </div>
            <div className="welcome-art welcome-art-create">
              <span>Try something new.</span>
            </div>
            <div className="welcome-art welcome-art-build">
              <span>Build what’s next.</span>
            </div>
            <div className="welcome-note">
              <Compass size={22} />
              <span>
                There’s more than one
                <br />
                <strong>kind of next step.</strong>
              </span>
            </div>
            <span className="welcome-spark welcome-spark-two">✧</span>
          </div>
        </section>

        <section className="welcome-how" aria-labelledby="welcome-how-title">
          <div className="welcome-section-intro">
            <p className="welcome-eyebrow">LESS SCATTERED. MORE YOU.</p>
            <h2 id="welcome-how-title">A home for your next steps.</h2>
            <p>
              A personal space that starts with who you are and what you want to
              try.
            </p>
          </div>
          <div className="welcome-feature-grid">
            <article>
              <span className="welcome-feature-icon lilac">
                <HeartHandshake size={23} />
              </span>
              <h3>Start with you.</h3>
              <p>
                Add your interests, skills, and experience to shape your own
                space.
              </p>
            </article>
            <article>
              <span className="welcome-feature-icon mint">
                <Bookmark size={23} />
              </span>
              <h3>Keep the possibilities.</h3>
              <p>
                Save what catches your eye and turn a someday into a small next
                step.
              </p>
            </article>
            <article>
              <span className="welcome-feature-icon peach">
                <CalendarDays size={23} />
              </span>
              <h3>Make room to try.</h3>
              <p>
                Keep checklists and important dates together, so you can follow
                through.
              </p>
            </article>
          </div>
        </section>
        <section className="welcome-invitation">
          <Sparkles size={25} />
          <h2>What could your next chapter look like?</h2>
          <button className="primary" onClick={() => open("signup")}>
            Make this space mine <ArrowRight size={17} />
          </button>
        </section>
      </main>
      <footer className="welcome-footer">
        <span>A little direction. A world of possibility.</span>
        <span>Hackathon demo · Sample opportunities after sign-in</span>
      </footer>

      {mode && (
        <div
          className="welcome-auth-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) setMode(null);
          }}
        >
          <div
            className="welcome-auth"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-auth-title"
          >
            <button
              className="icon-button welcome-auth-close"
              aria-label="Close sign-in"
              disabled={busy}
              onClick={() => setMode(null)}
            >
              <X size={21} />
            </button>
            <span className="welcome-auth-icon">
              <Compass size={29} />
            </span>
            <p className="welcome-eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
            <h2 id="welcome-auth-title">
              {mode === "signup"
                ? "Make this space yours."
                : "Good to see you again."}
            </h2>
            <p>
              {mode === "signup"
                ? "Create your account to enter your personal dashboard."
                : "Sign in to return to your own possibilities."}
            </p>
            <form
              className="welcome-auth-form"
              onSubmit={authenticate}
              key={mode}
            >
              {mode === "signup" && (
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    placeholder="Your name"
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  required
                  minLength={mode === "signup" ? 10 : 1}
                  maxLength={128}
                  placeholder={
                    mode === "signup"
                      ? "At least 10 characters"
                      : "Your password"
                  }
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={18} /> Signing you in…
                  </>
                ) : (
                  <>
                    {mode === "signup" ? "Create my account" : "Sign in"}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            <p className="welcome-auth-switch">
              {mode === "signup"
                ? "Already have an account?"
                : "New around here?"}{" "}
              <button
                disabled={busy}
                onClick={() => {
                  setError("");
                  setMode(mode === "signup" ? "login" : "signup");
                }}
              >
                {mode === "signup" ? "Sign in" : "Create an account"}
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
