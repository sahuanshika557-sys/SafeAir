# SafeAir Saathi

**Bilingual (English / हिंदी) GenAI assistant helping families and communities navigate severe winter smog and urban air pollution with live AQI insights, tailored action plans, and transparent impact estimates.**

### **[Live Demo: https://safe-air-lilac.vercel.app/](https://safe-air-lilac.vercel.app/)**

[![Live Demo](https://img.shields.io/badge/Live_Demo-safe--air--lilac.vercel.app-0f766e?style=flat-square)](https://safe-air-lilac.vercel.app/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8_Strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)
[![Tests Passing](<https://img.shields.io/badge/Tests-66_Passing_(10_Suites)-15803d?style=flat-square>)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)

> **Medical Disclaimer:** All guidance in SafeAir Saathi is for informational and educational purposes only and is **not medical advice**. Always consult a qualified healthcare professional for respiratory symptoms, asthma flare-ups, pregnancy care, or medical emergencies.

---

## Problem Statement

> _"Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. It should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices."_

SafeAir Saathi addresses this challenge by pairing live local air quality telemetry (`US AQI`, `PM2.5`, `PM10`, `NO₂`, and `O₃`) from Open-Meteo with a household lifestyle profile covering vulnerable members, commute mode, work setting, home type, air purifier ownership, cooking fuel, and budget tier. Using Google Gemini (`gemini-2.5-flash` with `GEMINI_MODEL` override support and automatic `gemini-2.5-flash-lite` fallback) over Server-Sent Events with automatic non-streaming JSON fallback, it produces a structured four-section action plan where every card explains **why it helps** and its **approximate** exposure or CO₂ impact without stale-plan confusion. An interactive weekly impact calculator (with diminishing returns and a transparent `65%` cap) and a domain-scoped follow-up Q&A assistant help families compare practical swaps without medical overclaiming. Resilient fallbacks—including manual US AQI entry, an immediate rule-based safety plan, and full English/Hindi parity—keep the assistant reliable under poor connectivity or API outages.

---

## Features

- **Location and Live AQI**
  - Debounced city search (`400 ms`) via Open-Meteo Geocoding API with automatic `/api/geocode` server cache fallback.
  - Explicit click-triggered browser geolocation (`Use My Location`) with zero background tracking; resolves coordinates to human-readable locality/city names via `/api/reverse-geocode` (with graceful coordinate fallback).
  - Displays US AQI (`0–500`), an accessible semi-circular gauge, color + icon + text category (`Good` through `Hazardous`), plus `PM2.5`, `PM10`, `NO₂`, and `O₃` (`µg/m³`), data source, and localized timestamp.
- **Personalization**
  - Captures household risk groups (`children`, `elderly`, `asthma/respiratory`, `pregnant`), commute mode (`walk`, `bike`, `bus`, `metro`, `two-wheeler`, `car`), work style (`WFH`, `office`, `outdoor`), home type (`apartment`, `house`), air purifier ownership, cooking fuel (`LPG`, `induction`, `wood`, `other`), budget tier (`low`, `medium`, `high`), and sanitized optional notes (`<= 500` chars).
- **AI Plan (4 Sections & Freshness Tracking)**
  - **Low-Emission Daily Routine:** Morning, commute, afternoon, and evening actions with recommended **best** and **worst** outdoor time windows.
  - **Indoor Air Quality Hacks:** Ventilation timing, draft sealing, wet mopping, HEPA/DIY box-fan filtration, clean cooking tips, and scientifically honest guidance on indoor plants (noting houseplants do not meaningfully remove winter PM2.5).
  - **Sustainable Alternatives:** Transport, cooking, heating, and open waste-burning avoidance matched to budget tier.
  - **Health Protection:** Well-fitted N95/FFP2 mask guidance, early respiratory symptoms to watch, and clear red-flag signs for seeing a doctor.
  - **Freshness & Focus Management:** Automatically displays a **Why this plan fits you** context card, detects when location, AQI, or language changes (hiding stale AQI guidance behind a polite `role="status"` **Regenerate for this location** banner), and moves keyboard/screen-reader focus onto the generated plan upon completion.
- **Impact Explanation and Calculator**
  - Every AI and fallback recommendation pairs a plain-language **Why this helps** explanation with a deduplicated **Estimated impact (approximate)** line (`cleanImpactText`).
  - Interactive weekly **Impact Calculator** (`src/components/ImpactCalculator.tsx`) sorts selected swaps, applies diminishing returns (`×0.85` per additional overlapping swap) multiplicatively, caps combined PM2.5 exposure drops at `65%`, and provides an expandable **How we estimate** methodology panel.
- **Follow-Up Chat**
  - Context-aware Q&A (`src/components/FollowUpChat.tsx`) grounded in the user's city, AQI, and active plan summary.
  - Strictly scoped via system instructions to air quality, winter smog health protection, indoor air quality, and sustainable alternatives—politely refusing unrelated topics.
- **Language Support (English and Hindi)**
  - One-click toggle in the header updates all UI copy, error messages, form validation alerts, `<html lang>`, AQI categories, rule-based fallback plans, Web Speech API (`Read aloud`) narration, and Gemini responses between English and हिंदी with verified 100% dictionary key parity.
- **Resilience (Rule-Based Fallback & Manual AQI Entry)**
  - **Manual AQI Entry:** If live Open-Meteo AQI lookup fails—or when a user has a local air meter—they can manually enter a US AQI (`0–500`), displaying `N/A` (`उपलब्ध नहीं`) for unmeasured pollutants rather than misleading zeroes.
  - **Rule-Based Fallback & Retry:** Upstream failures are classified into safe categories (`missing_key`, `invalid_key`, `quota_exceeded`, `model_unavailable`, `timeout`, `bad_request`, `upstream_error`), logged without secrets, retried on transient statuses (`429`, `503`, network errors) with exponential backoff + jitter, surfaced as localized user-friendly guidance (never raw `"HTTP 500"`), and paired with a **Retry AI Plan** button and immediate rule-based 4-section safety plan (`src/utils/fallbackPlan.ts`).

---

## Problem Statement Alignment

| Challenge Requirement                      | Implemented Feature                                                                                                          | Implementing Files / Components                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Location search & browser geolocation      | 400 ms debounced Open-Meteo geocoding + click-only geolocation + `/api/reverse-geocode` place name resolution                | `src/components/AqiHeroCard.tsx`, `src/hooks/useAirQuality.ts`, `src/hooks/useGeolocation.ts`, `src/services/geocoding.ts`      |
| Live AQI & pollutants with category labels | US AQI, PM2.5, PM10, NO₂, O₃, EPA categories (`Good`–`Hazardous`) with color, icon, and text                                 | `src/services/airQuality.ts`, `src/utils/aqi.ts`, `src/constants/index.ts`                                                      |
| Household & lifestyle personalization      | Vulnerable groups, commute, work style, home type, purifier, cooking fuel, budget, notes                                     | `src/components/ProfileForm.tsx`, `src/types/index.ts`, `src/utils/validation.ts`                                               |
| 4-section GenAI personalized plan          | Streamed SSE + non-streaming JSON fallback (`dailyRoutine`, `indoorAirHacks`, `sustainableAlternatives`, `healthProtection`) | `src/server/apiHandlers.ts`, `api/plan.ts`, `src/services/gemini.ts`, `src/components/ActionPlanView.tsx`                       |
| Direct impact explanation on every item    | `whyItHelps` + sanitized `estimatedImpact` + outdated-location guard                                                         | `src/utils/promptBuilder.ts`, `src/utils/fallbackPlan.ts`, `src/utils/impactCalculator.ts`, `src/components/ActionPlanView.tsx` |
| Interactive impact calculator              | Toggleable weekly swaps with diminishing-returns math (`×0.85`), `65%` cap, and `How we estimate` panel                      | `src/components/ImpactCalculator.tsx`, `src/utils/impactCalculator.ts`, `src/constants/index.ts`                                |
| Scoped follow-up Q&A chat                  | SSE/JSON Q&A restricted to air quality, respiratory protection, and sustainability                                           | `src/components/FollowUpChat.tsx`, `api/chat.ts`, `src/utils/promptBuilder.ts`                                                  |
| Visible medical disclaimer                 | Always-visible informational-only disclaimer banner (`role="note"`) above the plan                                           | `src/components/ActionPlanView.tsx`, `src/i18n/translations.ts`                                                                 |
| Bilingual English & Hindi experience       | 100%-key-matched UI strings, localized error categories, `<html lang>`, speech synthesis, and Gemini replies                 | `src/i18n/translations.ts`, `src/utils/errorDiagnostics.ts`, `src/utils/storage.ts`, `src/hooks/useSpeechSynthesis.ts`          |
| Graceful AQI & AI fallbacks                | Manual AQI override (`0–500`) + Retry button + instant rule-based 4-section safety plan                                      | `src/components/AqiHeroCard.tsx`, `src/hooks/usePlanGenerator.ts`, `src/utils/fallbackPlan.ts`                                  |

---

## Evaluation Parameters

### 1. Code Quality

- **Strict TypeScript:** `strict: true`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, and `noUnusedParameters` enforced across `src/`, `api/`, `tests/`, and `server.ts` in `tsconfig.json`.
- **Static Analysis & Style:** `eslint.config.js` enforces `@typescript-eslint/no-explicit-any: error`, `react-hooks`, `eslint-plugin-jsx-a11y`, and `no-console` (`warn`/`error` only); Prettier verifies formatting (`npm run format:check`).
- **Clean Architecture & Docs:** Modular separation across `src/components`, `src/hooks`, `src/services`, `src/utils`, and unified `src/server/apiHandlers.ts`, KDoc comments on public functions, and section-level React `ErrorBoundary` wrappers (`src/components/ErrorBoundary.tsx`).

### 2. Security

See [SECURITY.md](./SECURITY.md) for the complete security architecture and threat model:

- **Server-Side API Key Only:** `GEMINI_API_KEY` is read strictly via `process.env.GEMINI_API_KEY` inside `src/server/apiHandlers.ts` (never bundled into `dist/`, verified via `grep -rn 'GEMINI_API_KEY' dist`). `GET /api/health` returns `{ ok, keyConfigured, model, runtime, time }` without exposing any part of the key.
- **Input & Payload Hardening:** POST endpoints enforce `Content-Type: application/json` (`415`), strict `32 KB` body caps (`413`), safe string/Buffer/object/stream `req.body` parsing, Zod runtime validation (`src/utils/validation.ts`), `500`-char text caps, and lat/lon bounds checks.
- **Prompt-Injection & XSS Guard:** User data is isolated inside `<<<USER_DATA_START>>>` / `<<<USER_DATA_END>>>` delimiters (`src/utils/promptBuilder.ts`); `@google/genai` blocks `BLOCK_MEDIUM_AND_ABOVE`; chat markdown renders via `react-markdown` with raw HTML disabled (`allowedElements: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'code']`, `unwrapDisallowed`).
- **Headers & Rate Limiting:** `vercel.json`, `server.ts`, and `index.html` apply `Content-Security-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `X-Frame-Options: DENY`. Sliding-window rate limiters (`10/min` client, `20/min` per-IP server with bounded map) and `AbortController` timeouts (`15s` geo/AQI, `45s` server AI within `maxDuration: 60`) guard every route.

### 3. Efficiency

- **Debouncing, Request Deduplication & Cancellation:** City geocoding debounces input by `400 ms` (`src/hooks/useDebounce.ts`); concurrent identical calls in `fetchAirQuality` (`src/services/airQuality.ts`) and `generatePersonalizedPlan` (`src/services/gemini.ts`) share a single in-flight request with abort-safe subscriber refcounting.
- **TTL Caching & CDN Cache Headers:** Open-Meteo AQI readings cache for `10 minutes`, validated plans cache for `30 minutes`, reverse-geocoded place names cache for `1 hour`, and GET proxy routes set `Cache-Control: public, s-maxage=300` (or `3600`) with `stale-while-revalidate`.
- **Streaming + Non-Streaming Fallback & Code Splitting:** `/api/plan` and `/api/chat` stream SSE tokens and wait for the first chunk before flushing headers, automatically falling back to non-streaming JSON (and performing at most 1 JSON repair pass on malformed plan output). `ImpactCalculator` and `FollowUpChat` are lazy-loaded (`React.lazy`); recommendation cards are memoized (`React.memo`).
- **Production Bundle Sizes (`npm run build`):**
  - `dist/index.html`: `1.87 kB` (`gzip: 0.80 kB`)
  - Initial JS entry (`dist/assets/index-*.js`): `123.79 kB` (`gzip: 32.78 kB`)
  - Shared CSS (`dist/assets/index-*.css`): `33.71 kB` (`gzip: 6.97 kB`)
  - Lazy chunks: `ImpactCalculator` `6.74 kB` (`1.85 kB` gzip), `FollowUpChat` `150.84 kB` (`44.81 kB` gzip)
  - Vendor chunks: `vendor-zod` `84.02 kB` (`23.95 kB` gzip), `vendor-react` `431.25 kB` (`129.62 kB` gzip)

### 4. Testing

- **Comprehensive Vitest Suite (`10` files, `66` passing tests):** Covers AQI math, Zod validation, cache/rate-limiting, diminishing-returns calculator & duplicated-prefix regression checks, 100% EN/HI translation key parity, error classification (`classifyUpstreamError` / `getLocalizedApiErrorMessage`), hooks, service deduplication & JSON repair, Vercel serverless request edge cases (`string`/`Buffer`/`object`/stream `req.body`, retries, model fallback, SSE-to-JSON fallback), XSS neutralization, and `jest-axe` accessibility audits.
- **Measured V8 Coverage (`npm run test:coverage`):**
  - **All measured files (`api/`, `src/server/`, `src/utils/`, `src/services/`, `src/hooks/`):** **`92.72%` Statements | `81.50%` Branches | `96.51%` Functions | `92.82%` Lines**
  - `api/`: **`100%`** Statements / Branches / Functions / Lines
  - `src/utils/`: **`98.82%`** Statements | **`98.80%`** Lines (`100%` on `aqi.ts`, `fallbackPlan.ts`, `impactCalculator.ts`, `network.ts`, `promptBuilder.ts`, `rateLimiter.ts`, `storage.ts`)
  - `src/server/`: **`93.07%`** Statements | **`100%`** Functions | **`93.04%`** Lines
  - `src/services/`: **`90.90%`** Statements (`95.55%` on `airQuality.ts`)
  - `src/hooks/`: **`87.19%`** Statements (`100%` on `useDebounce.ts`, `94.59%` on `usePlanGenerator.ts`)

### 5. Accessibility

- **Semantic Landmarks & Focus Management:** Single `<h1>`, landmarks (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`), skip-to-content link, synchronized `<html lang>`, WAI-ARIA `tablist`/`tab`/`tabpanel` keyboard navigation (`ArrowLeft`, `ArrowRight`, `Home`, `End`), and automatic focus transfer onto newly generated plans.
- **Screen Readers, Contrast & Motion:** Explicit `<label>` / `<fieldset>` / `<legend>` groupings, `aria-required`, `aria-invalid`, `aria-describedby`, `aria-live="polite"`, `role="status"` for outdated plan notices, `role="alert"` strictly for errors, `role="img"` AQI SVG gauge labels, `>= 44×44 px` touch targets, `:focus-visible` outlines, light/dark modes, `prefers-reduced-motion` CSS rules (`src/index.css`), non-color-only AQI status, and optional EN/HI Web Speech API narration.
- **Zero `jest-axe` Violations:** Verified across all interactive components including error, fallback, and outdated-plan states (`tests/components/components.test.tsx`).

### 6. Problem Statement Alignment

- Every challenge requirement—city/geolocation AQI, household profiling, 4-section GenAI guidance, clear per-item impact reasoning, weekly calculator with transparent assumptions, scoped chat, English/Hindi parity, medical disclaimer, manual AQI, and rule-based fallback—is visible and interactive in the UI.

---

## Architecture

```text
+-------------------------------------------------------------------------+
| Browser SPA (React 19 + TypeScript Strict + Tailwind CSS v4)            |
|  - Header (skip link, nav, EN/HI language toggle, Light/Dark theme)     |
|  - AqiHeroCard   <--> useAirQuality / useGeolocation (click-only)       |
|  - ProfileForm   <--> Zod validation + 500-char sanitizer               |
|  - ActionPlanView <-- usePlanGenerator (SSE / JSON + outdated detection)|
|  - ImpactCalculator (React.lazy) & FollowUpChat (React.lazy, no-HTML)   |
+-------------------+-----------------------------------+-----------------+
                    | Direct browser fetch (with        | POST /api/plan, /api/chat
                    | /api/geocode & /api/aqi fallbacks)| GET /api/reverse-geocode, /api/health
                    v                                   v
+-----------------------------------+   +---------------------------------+
| Open-Meteo & Reverse Geocode APIs |   | Vercel Serverless (/api/*) &    |
|  - geocoding-api.open-meteo.com   |   | Express Dev Server (server.ts)  |
|  - air-quality-api.open-meteo.com |   |  - api/plan.ts   (maxDuration:60)
|  - api.bigdatacloud.net (server)  |   |  - api/chat.ts   (maxDuration:60)
+-----------------------------------+   |  - api/geocode.ts, api/aqi.ts   |
                    ^                   |  - api/reverse-geocode.ts       |
                    | Proxy + TTL Cache |  - api/health.ts                |
                    +-------------------+  Shared: src/server/apiHandlers |
                                        |  (Zod, rate limit, SSE/JSON,    |
                                        |   retries, category diagnostics)|
                                        +----------------+----------------+
                                                         | GEMINI_API_KEY
                                                         | (process.env only)
                                                         v
                                        +---------------------------------+
                                        | Google Gemini API (@google/genai)|
                                        |  - GEMINI_MODEL (default:       |
                                        |    gemini-2.5-flash)            |
                                        |  - fallback: gemini-2.5-flash-lite
                                        +---------------------------------+
```

### Folder Structure

```text
.
├── api/                     # Vercel Node.js serverless functions (plan, chat, geocode, reverse-geocode, aqi, health)
├── src/
│   ├── components/          # Accessible UI sections, SVG icons, and ErrorBoundary
│   ├── constants/           # AQI breakpoints, timeouts, model IDs, calculator swaps, defaults
│   ├── hooks/               # Debounce, geolocation, AQI fetching, plan generation, TTS
│   ├── i18n/                # English & Hindi translations (100% key parity)
│   ├── server/              # Shared Node/Express/Vercel handlers (apiHandlers.ts)
│   ├── services/            # Browser clients for Open-Meteo & /api endpoints
│   ├── types/               # Strict TypeScript interfaces
│   └── utils/               # AQI math, Zod schemas, prompt builder, cache, rate limiter, diagnostics, fallback
├── tests/                   # Vitest unit, service, server handler, and jest-axe component tests
├── server.ts                # Local Express + Vite middleware server (port 3000)
├── vercel.json              # Vite build, SPA rewrites, maxDuration & CSP/security headers
├── index.html               # CSP header, referrer policy, and metadata
├── SECURITY.md              # Detailed security architecture and threat model
├── TESTING.md               # Test commands and suite overview
└── LICENSE                  # MIT License
```

---

## Tech Stack

| Layer                | Technology & Version                                                    | Role                                                            |
| -------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| Frontend UI          | React `19.0.1`, Tailwind CSS `4.3.3`, Lucide                            | Responsive, dark-mode, accessible bilingual SPA                 |
| Language             | TypeScript `5.8.3` (`strict: true`)                                     | Static type safety across client, serverless APIs, and tests    |
| Build & Dev Server   | Vite `8.3.0`, Express `4.21.2`, `tsx`                                   | Production bundle (`dist/`) & local port `3000` dev server      |
| GenAI SDK            | `@google/genai` `^3.6.1`                                                | Server-side streaming structured JSON & chat via Gemini         |
| Air Quality & Geo    | Open-Meteo APIs + BigDataCloud Reverse Geocode                          | Keyless live US AQI, pollutants, geocoding & place-name lookup  |
| Validation & Safe UI | Zod `^4.6.7`, `react-markdown` `10.1.0`                                 | Runtime schema validation and HTML-disabled markdown rendering  |
| Deployment           | Vercel (`vercel.json` + `/api/*.ts`)                                    | Static SPA (`dist`) + Node.js serverless endpoints              |
| Testing & QA         | Vitest `5.1.1`, Testing Library, `jest-axe`, ESLint `10.15.0`, Prettier | Unit, integration, accessibility, lint, and format verification |

---

## Getting Started

### Prerequisites

- **Node.js `20+`** and `npm`
- A **Google Gemini API key** from [Google AI Studio](https://aistudio.google.com/) (required for live AI plans and chat; Open-Meteo AQI and rule-based fallback work even without a key)

### Installation

```bash
npm install
```

### Environment Variables

Create a local `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Configure variables inside `.env`:

```env
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
GEMINI_FALLBACK_MODEL="gemini-2.5-flash-lite"
APP_URL="http://localhost:3000"
```

- `GEMINI_API_KEY`: Read exclusively on the server via `process.env.GEMINI_API_KEY` inside `src/server/apiHandlers.ts`.
- `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL`: Optional overrides if you want a different Gemini model without code changes.
- **Important:** Never commit `.env` to version control (it is excluded by `.gitignore`), and **never** prefix `GEMINI_API_KEY` with `VITE_`—client-prefixed variables are bundled into browser JavaScript.

### Run Locally

```bash
npm run dev
```

Starts Express (`server.ts`) with Vite dev middleware on **http://localhost:3000**, serving both the React app and `/api/plan`, `/api/chat`, `/api/geocode`, `/api/reverse-geocode`, `/api/aqi`, and `/api/health`.

### Build for Production

```bash
npm run build   # Builds static assets into dist/
npm start       # Serves dist/ and /api/* via server.ts on port 3000
```

---

## Deployment on Vercel

SafeAir Saathi is preconfigured for Vercel via `vercel.json` (`framework: "vite"`, `buildCommand: "npm run build"`, `outputDirectory: "dist"`, `maxDuration: 60` on `api/**/*.ts`, strict security/CSP headers, and SPA rewrite `"/((?!api/).*)" -> "/index.html"`) alongside Node.js serverless functions in `/api`:

- `/api/plan` (`api/plan.ts`)
- `/api/chat` (`api/chat.ts`)
- `/api/geocode` (`api/geocode.ts`)
- `/api/reverse-geocode` (`api/reverse-geocode.ts`)
- `/api/aqi` (`api/aqi.ts`)
- `/api/health` (`api/health.ts`)

- **Live Deployment:** [https://safe-air-lilac.vercel.app/](https://safe-air-lilac.vercel.app/)

### Option A: Vercel Dashboard

1. Push your repository and import it on [vercel.com/new](https://vercel.com/new).
2. Keep the build settings loaded from `vercel.json`:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Add server-side environment variables under **Project Settings → Environment Variables**:
   - **Name:** `GEMINI_API_KEY` → **Value:** Your Google Gemini API key
   - _(Optional)_ **Name:** `GEMINI_MODEL` → **Value:** `gemini-2.5-flash`
   - **Environments:** Production, Preview, and Development
4. Click **Deploy**.

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel login
vercel link
vercel env add GEMINI_API_KEY production
vercel --prod
```

---

## Troubleshooting Vercel Deployments

If `/api/plan` or `/api/chat` falls back to rule-based guidance on Vercel:

1. **Check `/api/health` first:**
   Open `https://<your-vercel-domain>/api/health` in your browser or run:
   ```bash
   curl https://safe-air-lilac.vercel.app/api/health
   ```
   Verify that `"ok": true` and `"keyConfigured": true`. It will never expose your API key.
2. **Verify `GEMINI_API_KEY` in Vercel Project Settings:**
   Go to **Vercel Dashboard → Project → Settings → Environment Variables**. Ensure `GEMINI_API_KEY` is spelled exact (`GEMINI_API_KEY`, not `VITE_GEMINI_API_KEY`) and enabled for **Production** (and Preview if testing preview URLs). Ensure the key from Google AI Studio is active with Generative Language API enabled.
3. **Redeploy After Any Environment Variable Change:**
   **Critical:** Adding or updating an environment variable in Vercel does **not** automatically update an already-deployed serverless build. After saving `GEMINI_API_KEY` (or optional `GEMINI_MODEL`), go to **Deployments → ⋮ → Redeploy** (or run `vercel --prod`) so the new environment variables are injected into `/api/*`.
4. **Inspect Runtime Logs Safely:**
   Check Vercel Function Logs for `[SafeAir Saathi]` entries—errors are logged only by safe `category` (`missing_key`, `invalid_key`, `quota_exceeded`, `model_unavailable`, `timeout`, `bad_request`, `upstream_error`) and HTTP status code.

---

## Testing

| Command                 | Purpose                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm test`              | Run all 66 Vitest unit, service, server handler, component, and `jest-axe` accessibility tests                |
| `npm run test:coverage` | Run the full suite and generate V8 coverage for `api`, `src/server`, `src/utils`, `src/services`, `src/hooks` |
| `npm run lint`          | Run ESLint (`typescript-eslint`, `react-hooks`, `jsx-a11y`) + `tsc --noEmit`                                  |
| `npm run typecheck`     | Run strict TypeScript checking across `src/`, `api/`, `tests/`, and `server.ts`                               |
| `npm run format:check`  | Verify Prettier formatting across the entire codebase                                                         |

See [TESTING.md](./TESTING.md) and [SECURITY.md](./SECURITY.md) for additional details.

---

## Security Notes and Privacy

- **No Cookies or Tracking:** Only the UI language preference (`'en'` or `'hi'`) is stored under `safeair_saathi_language` in `localStorage` (`src/utils/storage.ts`).
- **Location Used Only on Click:** Browser geolocation runs only when the user clicks **Use My Location** (`src/hooks/useGeolocation.ts`); coordinates are held in transient React state and never persisted or logged.
- **Full Security Policy:** See [SECURITY.md](./SECURITY.md).

---

## Limitations and Assumptions

- **Approximate Impact Figures:** Weekly CO₂ savings and PM2.5 exposure reductions in `src/constants/index.ts`, `src/utils/impactCalculator.ts`, and AI/fallback cards are conservative order-of-magnitude educational estimates (with diminishing returns `×0.85` and a `65%` cap in the calculator); actual outcomes depend on trip length, mask facial seal fit, indoor air-exchange rate, and electricity grid mix.
- **Not Medical Advice:** All content is strictly informational and does not substitute for clinical diagnosis or emergency care.
- **Regional Grid Data:** Open-Meteo provides modeled/assimilated regional CAMS grids that may smooth localized roadside or indoor smoke spikes; users with local monitors can apply **Enter AQI manually**.

---

## License and Acknowledgements

- **License:** Distributed under the [MIT License](./LICENSE).
- **Acknowledgements:**
  - [Open-Meteo](https://open-meteo.com/) for free, keyless live Air Quality and Geocoding APIs.
  - [BigDataCloud](https://www.bigdatacloud.com/) for keyless reverse geocoding lookup via `/api/reverse-geocode`.
  - [Google Gemini (`@google/genai`)](https://ai.google.dev/) for structured action plan generation and bilingual Q&A.
