# Opportunity Compass

A personal opportunity dashboard for **jobs, hackathons, women-in-tech programs, and custom discoveries**. This starter includes a responsive interface, onboarding, MongoDB-backed account/profile APIs, saved checklists, illustrated Stories, and calendar export.

## What works

- Public welcome page at `/` with sign-in and account creation. Signed-in visitors go directly to `/dashboard`.
- Server-side session check on `/dashboard`; anonymous visitors are redirected to the welcome page before dashboard content renders. Sign-out returns to the welcome page.

- A sample dashboard with category, keyword, format, and month filters. Application deadlines and event dates can be filtered separately.
- Opportunity details, illustrative relevance explanations, save/unsave, application status, and editable checklists.
- Stories with pause/play, previous/next, details, and saving.
- A calendar showing saved sample deadlines and event dates; `.ics` exports clearly labelled **SAMPLE**, using all-day dates because no exact cutoff times are known.
- Editable profiles with age, profession, location, timezone, skills, interests, and separate experience fields.
- Server-side registration, login, logout, session handling, account-scoped profile/checklist storage, and PDF/TXT résumé upload/download/delete **when Atlas is connected**.

## Chat, shared posts, and phone sharing

**Chat & links** is a private dashboard section. Conversations, search briefs, preferred source links, and imported leads are scoped to the authenticated account in Atlas. The brief can optionally include the user's profession, location, skills, interests, and experience in AI requests. Names, email addresses, age, passwords, and résumé contents are excluded from that optional profile context. Chat messages, saved brief, and up to eight active shared leads are sent as conversation context when the user sends a message to a configured model.

Without model credentials, the UI explicitly says **Notes mode**. Messages are saved, but no AI reply or live research is simulated. Set `CLAUDE_API_KEY` privately to use Claude Sonnet 5.5 through Anthropic Messages. To use Meta Model API instead, set `MODEL_API_KEY` and `AGENT_PROVIDER=meta` privately; `META_TEXT_MODEL` defaults to `muse-spark-1.3` for conversation. Set `META_DISCOVERY_MODEL=muse-wonder-1.0` to use Muse Wonder for opportunity research; if it returns HTTP 404, discovery retries once with Muse Spark. Both connectors can use cited web search and the same search-to-dashboard workflow. The backend supplies the current date in the user's timezone, checks that deadlines have not passed and each source URL appears in the model's citations, then stores accepted results per account for Discover. A deterministic card component renders stored results with the same layout and illustrative art as sample cards. The cards are labelled AI-researched because citations and dates can still be wrong; users should check the official source before applying. Profile and résumé sharing with Meta require the separate **Use my saved context with Meta AI** choice; existing Claude consent does not automatically transfer. The uploaded PDF/TXT résumé is sent inline only when résumé sharing is also enabled. An OpenAI-compatible host serving an eligible Meta open model is also supported through `AGENT_API_KEY`, `AGENT_BASE_URL`, and `AGENT_MODEL`, but this path has no built-in search tools. Never add API keys to `NEXT_PUBLIC_` variables. Each user is limited to 30 chat calls and 30 imports per 15-minute bucket. These application limits do not replace provider billing controls.

Instagram, LinkedIn, and ordinary website URLs can be saved with a title and caption. Only known Instagram post/reel and LinkedIn post URLs get a bounded, unauthenticated public HTML metadata attempt. The server does not fetch arbitrary websites, follow redirects, use social login cookies, download videos, or bypass login walls. Failed/blocked previews become **caption needed** links. Imported leads and preview text remain unverified; discussing a lead does not automatically add a verified listing to Discover. Users can archive and restore links.

The installable app manifest registers `/share` as a URL/text share receiver on supporting devices and browsers. GET sharing only displays incoming content: it does not write to Atlas. **Review in my inbox** carries a draft in browser session storage through sign-in; the user explicitly saves it afterward. Copy/paste is available on all supported browsers. Native Instagram/LinkedIn Share-menu availability must be tested on the target phone; it is not supported everywhere. No offline caching of private dashboard data is added.

## Opportunity status

On the Discover dashboard, **Update status** sends the title, organizer, and description of up to four current, source-backed opportunities at a time to Meta Muse Image. The server requests vertical artwork with no text, stores the generated WebP per account in MongoDB, and serves it only to the signed-in owner. The app overlays the current opportunity text and official link in a story viewer. Repeat the action to add more opportunities. This requires a server-side `MODEL_API_KEY` with access to `muse-image-1.0`; each image generation consumes Meta API credits. If the key is absent or Meta responds with a billing, permission, or model-not-found error, the server saves a clearly labelled status using existing template artwork instead. Image generation is not exercised by the automated tests, so verify it with a live key before relying on Muse Image for a demo.

## Current boundaries

**All eight listings are fictional samples.** The titles, organizers, dates, eligibility, prices, and funding are demonstration content, not researched opportunities. Dates are generated relative to the current month to exercise the filters. Profile relevance is deterministic, not AI matching.

**There is no local database fallback or anonymous dashboard.** Without a working MongoDB connection, visitors can see the welcome page, but cannot create an account or enter the dashboard. Profiles, saved opportunities, and checklists are scoped to the signed-in user. The opportunity catalogue remains fictional demo content; ranking uses that user’s profile.

The existing MyCloset cluster in the user's Atlas account was left paused at the user's request. This app targets a separate database named `opportunity_compass`. No existing application collections were changed.

Claude and Meta opportunity requests can create source-backed, date-filtered research cards in Discover. Résumé context requires a separate opt-in. Recurring background discovery, independent verification of source claims, live video recommendations, Google Calendar OAuth/sync, and a Chrome extension are not implemented. The video link opens a general YouTube search and is labelled accordingly. The sample illustrations were made with the built-in image-generation tool, not Muse Image.

## Run locally

Requires **Node.js 22+** and npm. Dependencies and versions are recorded in `package-lock.json`.

```sh
npm ci --registry=https://registry.npmjs.org
cp .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:4180** for the public welcome page. Entering the dashboard requires an account and a connected Atlas database. Production mode:

```sh
npm run build
npm start
```

## Connect MongoDB Atlas

1. Use a running Atlas cluster approved by the account owner. Do not resume or upgrade an existing cluster without their approval.
2. Create a database user limited to the `opportunity_compass` database and configure the permitted application-server network address.
3. Set `MONGODB_URI` privately in `.env.local` and leave `MONGODB_DB=opportunity_compass`.
4. Restart the server and open **Connections → Recheck database connection**.
5. Create an account and confirm that a profile and checklist survive reload and are separate from a second account.

Never commit `.env.local`, connection strings, passwords, résumé content, or tokens. Website login credentials for Atlas are not application database credentials. In deployment, store configuration in the host's secret settings and set `APP_ORIGIN` to the actual HTTPS origin.

The app creates only these collections in its configured database:

| Collection          | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `agent_messages`    | Account-scoped conversation messages                                    |
| `agent_preferences` | Saved search brief, source links, and profile-sharing choice            |
| `shared_leads`      | User-provided opportunity links, captions, and reversible archive state |
| `users`             | Normalized email, salted scrypt password hash, profile                  |
| `sessions`          | Hashed random session tokens, user ID, TTL expiry                       |
| `saved`             | User-scoped sample opportunity status and completed tasks               |
| `resumes`           | One private PDF/TXT per account, max 2 MB                               |
| `rate_limits`       | Expiring per-email login/signup attempt counters                        |

All personal-data endpoints derive ownership from the server session, not a client-supplied user ID. Résumé download requires authentication. Authentication uses HttpOnly, SameSite cookies; Secure is enabled when `APP_ORIGIN` is HTTPS. Cross-origin mutations are rejected. Public launch additionally needs email verification/recovery, broader abuse controls, operational monitoring, and an authenticated Atlas integration test. Those are not silently simulated here.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests cover password hashing, session tokens, validation, profile fields, filtering, matching, calendar escaping/exclusive end dates, and origin handling. Browser verification covers dashboard interactions, saved lists/checklists, Stories, profile preview, calendar view, database setup states, and mobile layout. HTTP smoke checks also assert that the welcome page contains no dashboard listings and that anonymous requests to `/dashboard` redirect to `/`. Real Atlas account creation and isolation must still be tested with a running cluster and credentials.

## Next development stages

1. Connect and integration-test Atlas accounts.
2. Replace the sample catalogue with source-backed Meta research and stored provenance.
3. Add background Muse Image generation and durable file/image storage.
4. Implement consented Google Calendar OAuth and idempotent event updates.
5. Add a Chrome Manifest V3 extension using the same account/backend.

## Artwork

`public/opportunity-art.png` is a four-panel illustration atlas generated using the built-in image-generation tool. Prompt: four editorial 2D illustrations in mint, lavender, apricot, and butter-yellow, depicting career possibilities, a collaborative hackathon, a women-in-tech community, and a pottery workshop. No text, logos, or interface. The UI selects each panel with CSS background positioning and renders all factual text separately.

This repository starts the opportunity project; the earlier journal-game prototype is intentionally not included.
