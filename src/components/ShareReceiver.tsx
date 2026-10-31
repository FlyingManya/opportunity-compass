"use client";
import { Compass, ArrowRight, Link as LinkIcon } from "lucide-react";
import "./agent.css";
export default function ShareReceiver({
  draft,
  signedIn,
}: {
  draft: { url: string; title: string; caption: string };
  signedIn: boolean;
}) {
  return (
    <main className="share-receiver">
      <a href="/" className="logo">
        <span>
          <Compass size={26} />
        </span>
        <div>
          opportunity<small>COMPASS</small>
        </div>
      </a>
      <section className="share-receiver-card">
        <LinkIcon size={30} />
        <p className="eyebrow">A POSSIBILITY WORTH KEEPING</p>
        <h1>Bring it to your compass.</h1>
        <p>
          Review this shared post in your private link inbox. Sharing a link
          doesn’t confirm its deadline or eligibility.
        </p>
        {draft.url ? (
          <div className="share-draft-preview">
            <strong>{draft.title || "Shared opportunity"}</strong>
            <p>{draft.url}</p>
            {draft.caption && <p>{draft.caption}</p>}
          </div>
        ) : (
          <p>
            No usable HTTPS link was shared. You can paste a link or caption in
            Chat & links.
          </p>
        )}
        <button
          className="primary"
          onClick={() => {
            try {
              sessionStorage.setItem(
                "compass-shared-draft",
                JSON.stringify(draft),
              );
              window.location.assign(
                signedIn ? "/dashboard?view=agent" : "/?signin=1",
              );
            } catch {
              alert(
                "Please allow browser storage, or copy the link and paste it in Chat & links after signing in.",
              );
            }
          }}
        >
          {signedIn ? "Review in my inbox" : "Sign in to continue"}
          <ArrowRight size={18} />
        </button>
        <a href="/">Back to home</a>
      </section>
    </main>
  );
}
