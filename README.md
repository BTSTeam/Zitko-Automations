# Zitko Automations — Vincere + ChatGPT Starter (Wired)

This build includes:
- OAuth2 PKCE to Vincere (iron-session for secure tokens)
- **Position GET**: `GET /api/vincere/position/:id`
- **Candidate GET**: `GET /api/vincere/candidate/:id`
- **Candidate Search**: `POST /api/vincere/candidate/search` — builds SOLR-style filters with correct `#` end markers and `#` escape `.08`
- **AI Scoring**: `POST /api/ai/analyze` — send `{ job, candidates }`, returns JSON
- Dashboard tabs wired for:
  - **Candidate Matching**: Retrieve Job → Search → send to AI → sort & display Top 10
  - **Candidate Sourcing**: JotForm embed placeholder (add your URL in settings or hardcode)
  - **CV Formatting**: Fetch Candidate by ID (formatting to be added later)

## Env Vars (Vercel → Project → Settings → Environment Variables)
- `VINCERE_ID_BASE` (`https://id.vincere.io`)
- `VINCERE_TENANT_API_BASE` (e.g., `https://zitko.vincere.io`)
- `VINCERE_CLIENT_ID` (from Vincere)
- `VINCERE_API_KEY` (from Vincere)
- `REDIRECT_URI` (`https://<your-vercel-url>/api/auth/callback`)
- `SESSION_PASSWORD` (32+ chars random string)
- `OPENAI_API_KEY` (for ChatGPT)
- Optional: `OPENAI_MODEL` (default `gpt-4o-mini`)

## Usage
1. Deploy to Vercel and set env vars.
2. Visit `/login` to authorize with Vincere.
3. Go to `/dashboard`:
   - **Candidate Matching**: enter Job ID → Retrieve Job Information → Search Candidates.
   - **Candidate Sourcing**: paste your JotForm URL in Settings later or hardcode iframe.
   - **CV Formatting**: enter Candidate ID → Generate CV Preview.

## Notes
- Vincere API calls require headers: `id-token` and `x-api-key`.
- Candidate search URL is constructed with priority: **location (radius if coords) → skills → title → industry → qualifications**.
- Table is client-side sortable and filterable; top 10 displayed by score.
