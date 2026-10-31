# Opportunity Compass

A personal opportunity dashboard for **jobs, hackathons, women-in-tech programs, and custom discoveries**. This starter includes a responsive interface, onboarding, MongoDB-backed account/profile APIs, saved checklists, illustrated Stories, and calendar export.

## What works

- A sample dashboard with category, keyword, format, and month filters. Application deadlines and event dates can be filtered separately.
- Opportunity details, illustrative relevance explanations, save/unsave, application status, and editable checklists.
- Stories with pause/play, previous/next, details, and saving.
- A calendar showing saved sample deadlines and event dates; `.ics` exports clearly labelled **SAMPLE**, using all-day dates because no exact cutoff times are known.
- Editable profiles with age, profession, location, timezone, skills, interests, and separate experience fields.
- Server-side registration, login, logout, session handling, account-scoped profile/checklist storage, and PDF/TXT résumé upload/download/delete **when Atlas is connected**.

## Current boundaries

**All eight listings are fictional samples.** The titles, organizers, dates, eligibility, prices, and funding are demonstration content, not researched opportunities. Dates are generated relative to the current month to exercise the filters. Profile relevance is deterministic, not AI matching.

**There is no local database fallback.** Without a working MongoDB URI, the dashboard is an explicitly labelled preview. Saving sample listings uses browser session storage; preview profile edits stay only in React memory. Sign-up/login are disabled until the database status check succeeds.

The existing MyCloset cluster in the user's Atlas account was left paused at the user's request. This app targets a separate database named `opportunity_compass`. No existing application collections were changed.

Live web discovery, Meta-generated matching/checklists, automatic résumé extraction, live video recommendations, Google Calendar OAuth/sync, and a Chrome extension are not implemented in this starter. The video link opens a general YouTube search and is labelled accordingly. The sample illustrations were made with the built-in image-generation tool, not Muse Image.

## Run locally

Requires **Node.js 22+** and npm. Dependencies and versions are recorded in `package-lock.json`.

```sh
npm ci --registry=https://registry.npmjs.org
cp .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:4180**. The dashboard can be explored without credentials. Production mode:

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

| Collection    | Purpose                                                   |
| ------------- | --------------------------------------------------------- |
| `users`       | Normalized email, salted scrypt password hash, profile    |
| `sessions`    | Hashed random session tokens, user ID, TTL expiry         |
| `saved`       | User-scoped sample opportunity status and completed tasks |
| `resumes`     | One private PDF/TXT per account, max 2 MB                 |
| `rate_limits` | Expiring per-email login/signup attempt counters          |

All personal-data endpoints derive ownership from the server session, not a client-supplied user ID. Résumé download requires authentication. Authentication uses HttpOnly, SameSite cookies; Secure is enabled when `APP_ORIGIN` is HTTPS. Cross-origin mutations are rejected. Public launch additionally needs email verification/recovery, broader abuse controls, operational monitoring, and an authenticated Atlas integration test. Those are not silently simulated here.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests cover password hashing, session tokens, validation, profile fields, filtering, matching, calendar escaping/exclusive end dates, and origin handling. Browser verification covers dashboard interactions, saved lists/checklists, Stories, profile preview, calendar view, database setup states, and mobile layout. Real Atlas account creation and isolation must still be tested with an approved running cluster and credentials.

## Next development stages

1. Connect and integration-test Atlas accounts.
2. Replace the sample catalogue with source-backed Meta research and stored provenance.
3. Add background Muse Image generation and durable file/image storage.
4. Implement consented Google Calendar OAuth and idempotent event updates.
5. Add a Chrome Manifest V3 extension using the same account/backend.

## Artwork

`public/opportunity-art.png` is a four-panel illustration atlas generated using the built-in image-generation tool. Prompt: four editorial 2D illustrations in mint, lavender, apricot, and butter-yellow, depicting career possibilities, a collaborative hackathon, a women-in-tech community, and a pottery workshop. No text, logos, or interface. The UI selects each panel with CSS background positioning and renders all factual text separately.

This repository starts the opportunity project; the earlier journal-game prototype is intentionally not included.
