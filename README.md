# SafeAir Saathi

**SafeAir Saathi** is a bilingual (English / हिंदी) GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution with live local air quality readings, personalized low-emission routines, indoor air quality hacks, budget-matched sustainable alternatives, and transparent approximate impact explanations.

---

## Problem Statement Alignment

| Challenge Requirement             | Implementation in SafeAir Saathi                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Live Location & AQI**           | City search via Open-Meteo Geocoding API (400 ms debounced) or click-triggered browser geolocation. Displays live US AQI, PM2.5, PM10, NO₂, O₃, category color + text label + icon, data source, and timestamp.                                                                                                    |
| **Household Lifestyle Profile**   | Captures vulnerable members (children, elderly, asthma/respiratory, pregnant), commute mode, work style, home type, air purifier ownership, cooking fuel, budget tier, and optional notes.                                                                                                                         |
| **Four-Section GenAI Plan**       | Uses `gemini-4-hydrogen` with `gemini-3.1-flash-lite` fallback (streamed structured JSON) to generate: (1) Low-Emission Daily Routine with best/worst smog windows, (2) Indoor Air Quality Hacks, (3) Sustainable Alternatives matched to budget, and (4) Health Protection (N95/FFP2, symptoms, doctor triggers). |
| **Direct Impact Explanation**     | Every single recommendation includes a plain-language **Why this helps** explanation and an explicitly marked **approximate** impact estimate.                                                                                                                                                                     |
| **Interactive Impact Calculator** | Lets users toggle weekly swaps (Metro over Car, N95, Induction over Wood, etc.) to see approximate weekly CO₂ saved and PM2.5 exposure reduction.                                                                                                                                                                  |
| **Scoped Follow-Up Chat**         | Conversational Q&A grounded in the user's AQI and plan; strictly scoped to air quality, respiratory protection, and sustainability.                                                                                                                                                                                |
| **Medical Disclaimer**            | Always-visible informational-only disclaimer above the action plan.                                                                                                                                                                                                                                                |
| **English & Hindi Support**       | Persistent language toggle updates UI copy, `<html lang>`, Web Speech API voice, and Gemini responses.                                                                                                                                                                                                             |
| **Graceful Fallbacks**            | Manual US AQI entry (0–500) if Open-Meteo fails; clear Retry button plus immediate bilingual rule-based safety plan if Gemini fails.                                                                                                                                                                               |

---

## Architecture

```text
+-------------------------------------------------------------------+
| Browser (React 19 + TypeScript Strict + Tailwind CSS v4)          |
|                                                                   |
|  Header (3-zone, skip link, EN/HI toggle)                         |
|  AqiHeroCard  <---> useAirQuality / useGeolocation                |
|                        |--> Open-Meteo Geocoding (400ms debounce) |
|                        |--> Open-Meteo AQI (10-min TTL cache)     |
|  ProfileForm  <---> Zod validation + sanitizer (max 500 chars)    |
|  ActionPlanView <-- usePlanGenerator (SSE stream + fallback plan) |
|  ImpactCalculator (React.lazy + Suspense)                         |
|  FollowUpChat (React.lazy + Suspense + react-markdown no-HTML)    |
+-------------------------------------------------------------------+
                               |
                  POST /api/plan & /api/chat (SSE)
                               v
+-------------------------------------------------------------------+
| Express Dev Server (`server.ts`) & Vercel Node Serverless (`/api/*`) |
|  - Routes: `/api/plan`, `/api/chat` (SSE), `/api/geocode`, `/api/aqi`|
|  - Shared logic in `src/server/apiHandlers.ts` (Zod + rate limiter) |
|  - Injection-delimited promptBuilder (`<<<USER_DATA_START/END>>>`)  |
|  - `@google/genai` (`gemini-4-hydrogen`, `ThinkingLevel.LOW`, safety) |
+-------------------------------------------------------------------+
```

---

## Setup & Environment Variables

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`:
   ```bash
   cp .env.example .env
   ```
   - `GEMINI_API_KEY`: Server-side Gemini API key (never exposed to the browser).
   - `APP_URL`: Hosting URL (injected automatically in AI Studio).
3. Start local development server (Express + Vite middleware on port 3000):
   ```bash
   npm run dev
   ```
4. Build and run locally in production mode:
   ```bash
   npm run build
   npm start
   ```

---

## Deploy to Vercel

The project ships with standalone Node.js serverless functions inside `/api` (`api/plan.ts`, `api/chat.ts`, `api/geocode.ts`, `api/aqi.ts`) sharing `src/server/apiHandlers.ts`, plus `vercel.json` configured for Vite static output (`dist`) and SPA rewrites that keep `/api/*` endpoints intact.

### Option A: Vercel Dashboard (Git Integration)

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. Open [vercel.com/new](https://vercel.com/new) and import the repository.
3. Confirm the build settings (auto-loaded from `vercel.json`):
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add the required server-side environment variable under **Project Settings → Environment Variables**:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: Your Google AI / Gemini API key
   - **Environments**: Production, Preview, and Development
   > **Note**: Do **not** prefix with `VITE_`. `GEMINI_API_KEY` is read strictly via `process.env` inside `/api/*` serverless functions and is never bundled into the browser.
5. Click **Deploy**.

### Option B: Vercel CLI

1. Install and authenticate the Vercel CLI:
   ```bash
   npm i -g vercel
   vercel login
   ```
2. Link the project and set the server-side API key:
   ```bash
   vercel link
   vercel env add GEMINI_API_KEY production
   ```
3. Deploy to production:
   ```bash
   vercel --prod
   ```

---

## Security Measures

- **Server-Side API Key Isolation**: `GEMINI_API_KEY` is read only inside `src/server/apiHandlers.ts` (used by `/api/*` serverless functions and `server.ts`) via `process.env` and never bundled into client code.
- **Content Security Policy & Referrer Policy**: `index.html` enforces `default-src 'self'`, `connect-src` restricted to `'self'`, Open-Meteo domains, and Gemini API, plus `referrer="no-referrer"`.
- **Prompt Injection Defense**: All user-entered location names, profile notes, and chat questions are sanitized (`sanitizeTextInput`, max 500 chars) and wrapped in `<<<USER_DATA_START>>>` / `<<<USER_DATA_END>>>` delimiters with explicit data-only system instructions.
- **Safety Settings**: Blocks `BLOCK_MEDIUM_AND_ABOVE` across Harassment, Hate Speech, Sexually Explicit, and Dangerous Content.
- **Safe Rendering**: AI chat output renders via `react-markdown` with raw HTML elements disabled (`allowedElements`), zero `dangerouslySetInnerHTML`.
- **Rate Limiting & Timeouts**: Sliding-window rate limiter (10 requests/min on client, 20 requests/min on server) + `AbortController` timeouts and Zod schema validation on every API response.
- **Privacy**: Geolocation runs only on explicit user click; coordinates are never persisted or logged. Only the UI language choice is stored in `localStorage` inside `try/catch`.

---

## Accessibility Measures (WCAG 2.1 AA / AAA)

- Semantic landmarks (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`), single `<h1>`, skip-to-content link, and `<html lang>` synced with language toggle.
- Every control has a visible `<label>` or `<fieldset>/<legend>`, required fields use `aria-required`, and validation errors are linked via `aria-describedby` with `role="alert"`.
- AQI category uses color + text label + category icon + SVG gauge `role="img"` text alternative.
- Full keyboard navigation across WAI-ARIA tabs (`ArrowLeft`, `ArrowRight`, `Home`, `End`), visible `:focus-visible` outlines, `>= 44x44px` touch targets, `prefers-reduced-motion`, and light/dark mode (`prefers-color-scheme` + toggle).
- Optional Web Speech API **Read aloud** / **Stop reading** control.

---

## Testing & Quality Scripts

```bash
npm run lint          # ESLint (including eslint-plugin-jsx-a11y) + TypeScript check
npm run typecheck     # Strict TypeScript compiler check
npm test              # Vitest + React Testing Library + jest-axe suite
npm run test:coverage # Coverage report for utils, services, and hooks
```

See `TESTING.md` for full test suite details.

---

## Assumptions & Limitations

- **Approximate Estimates**: CO₂ savings and PM2.5 exposure reduction figures are educational order-of-magnitude estimates based on typical urban commuter and household assumptions; actual individual results vary by distance, mask seal, room leakage, and local grid mix.
- **Sensor Resolution**: Open-Meteo Air Quality provides modeled/assimilated regional CAMS grids, which may smooth hyper-local street-corner spikes. Users with local meters can override with Manual AQI.
- **Informational Only**: Recommendations are not medical advice.
