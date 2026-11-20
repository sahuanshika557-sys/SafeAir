# SafeAir Saathi

**Bilingual (English / हिंदी) GenAI assistant helping families and communities navigate severe winter smog and urban air pollution with live AQI insights, tailored action plans, and transparent impact estimates.**

### **[Live Demo: https://safe-air-lilac.vercel.app/](https://safe-air-lilac.vercel.app/)**

[![Live Demo](https://img.shields.io/badge/Live_Demo-safe--air--lilac.vercel.app-0f766e?style=flat-square)](https://safe-air-lilac.vercel.app/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8_Strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)
[![Tests Passing](<https://img.shields.io/badge/Tests-53_Passing_(10_Suites)-15803d?style=flat-square>)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)

> **Medical Disclaimer:** All guidance in SafeAir Saathi is for informational and educational purposes only and is **not medical advice**. Always consult a qualified healthcare professional for respiratory symptoms, asthma flare-ups, pregnancy care, or medical emergencies.

---

## Problem Statement

> _"Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. It should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices."_

SafeAir Saathi addresses this challenge by pairing live local air quality telemetry (`US AQI`, `PM2.5`, `PM10`, `NO₂`, and `O₃`) from Open-Meteo with a household lifestyle profile covering vulnerable members, commute mode, work setting, home type, air purifier ownership, cooking fuel, and budget tier. Using Google Gemini (`gemini-4-hydrogen` with automatic `gemini-3.1-flash-lite` fallback) streamed over Server-Sent Events, it produces a structured four-section action plan where every single card explains **why it helps** and its **approximate** exposure or CO₂ impact. An interactive weekly impact calculator and a domain-scoped follow-up Q&A assistant help families compare practical swaps without medical overclaiming or fake numerical precision. Resilient fallbacks—including manual US AQI entry, an immediate rule-based safety plan, and full English/Hindi support—keep the assistant dependable under poor connectivity or API outages.

---

## Features

- **Location and Live AQI**
  - Debounced city search (`400 ms`) via the Open-Meteo Geocoding API with automatic `/api/geocode` fallback.
  - Explicit click-triggered browser geolocation (`Use My Location`) with zero background tracking or coordinate persistence.
  - Displays US AQI (`0–500`), an accessible semi-circular gauge, color + icon + text category (`Good` through `Hazardous`), plus `PM2.5`, `PM10`, `NO₂`, and `O₃` (`µg/m³`), data source, and localized timestamp.
- **Personalization**
  - Captures household risk groups (`children`, `elderly`, `asthma/respiratory`, `pregnant`), commute mode (`walk`, `bike`, `bus`, `metro`, `two-wheeler`, `car`), work style (`WFH`, `office`, `outdoor`), home type (`apartment`, `house`), air purifier ownership, cooking fuel (`LPG`, `induction`, `wood`, `other`), budget tier (`low`, `medium`, `high`), and sanitized optional notes (`<= 500` chars).
- **AI Plan (4 Sections)**
  - **Low-Emission Daily Routine:** Morning, commute, afternoon, and evening actions with recommended **best** and **worst** outdoor time windows.
  - **Indoor Air Quality Hacks:** Ventilation timing, draft sealing, wet mopping, HEPA/DIY box-fan filtration, clean cooking tips, and scientifically honest guidance on indoor plants (noting houseplants do not meaningfully remove winter PM2.5).
  - **Sustainable Alternatives:** Transport, cooking, heating, and open waste-burning avoidance matched to the user's budget tier.
  - **Health Protection:** Well-fitted N95/FFP2 mask guidance, early respiratory symptoms to watch, and clear red-flag signs for seeing a doctor.
- **Impact Explanation and Calculator**
  - Every AI and fallback recommendation includes a plain-language **Why this helps** explanation and an explicitly marked **approximate** impact estimate.
  - Interactive weekly **Impact Calculator** (`src/components/ImpactCalculator.tsx`) lets households toggle practical swaps (e.g., Metro over solo car, N95 mask, induction/LPG over wood, sealing drafts/HEPA, avoiding leaf burning, short walk/cycle errands) to preview approximate weekly CO₂ saved and combined PM2.5 exposure reduction (multiplicatively combined and capped at `85%`).
- **Follow-Up Chat**
  - Context-aware Q&A (`src/components/FollowUpChat.tsx`) grounded in the user's city, AQI, and active plan summary.
  - Strictly scoped via system instructions to air quality, winter smog health protection, indoor air quality, and sustainable alternatives—politely refusing unrelated topics.
- **Language Support (English and Hindi)**
  - One-click toggle in the header updates all UI copy, error messages, form validation alerts, `<html lang>`, AQI categories, rule-based fallback plans, Web Speech API (`Read aloud`) narration, and Gemini responses between English and हिंदी.
- **Resilience (Rule-Based Fallback & Manual AQI Entry)**
  - **Manual AQI Entry:** If live Open-Meteo AQI lookup fails—or when a user has a local air meter—they can manually enter a US AQI (`0–500`), displaying `N/A` (`उपलब्ध नहीं`) for unmeasured pollutants rather than misleading zeroes.
  - **Rule-Based Fallback & Retry:** If Gemini is unavailable, rate-limited, or unconfigured, `ActionPlanView` surfaces a clear localized error with a **Retry** button alongside an immediate category- and profile-tailored bilingual rule-based safety plan (`src/utils/fallbackPlan.ts`).

---

## Problem Statement Alignment

| Challenge Requirement                      | Implemented Feature                                                                                        | Implementing Files / Components                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Location search & browser geolocation      | 400 ms debounced Open-Meteo geocoding + click-only browser geolocation                                     | `src/components/AqiHeroCard.tsx`, `src/hooks/useAirQuality.ts`, `src/hooks/useGeolocation.ts`, `src/services/geocoding.ts` |
| Live AQI & pollutants with category labels | US AQI, PM2.5, PM10, NO₂, O₃, EPA categories (`Good`–`Hazardous`) with color, icon, and text               | `src/services/airQuality.ts`, `src/utils/aqi.ts`, `src/constants/index.ts`                                                 |
| Household & lifestyle personalization      | Vulnerable groups, commute, work style, home type, purifier, cooking fuel, budget, notes                   | `src/components/ProfileForm.tsx`, `src/types/index.ts`, `src/utils/validation.ts`                                          |
| 4-section GenAI personalized plan          | Streamed structured JSON (`dailyRoutine`, `indoorAirHacks`, `sustainableAlternatives`, `healthProtection`) | `src/server/apiHandlers.ts`, `api/plan.ts`, `src/services/gemini.ts`, `src/components/ActionPlanView.tsx`                  |
| Direct impact explanation on every item    | `whyItHelps` + `estimatedImpact` marked as approximate on every AI and fallback card                       | `src/utils/promptBuilder.ts`, `src/utils/fallbackPlan.ts`, `src/components/ActionPlanView.tsx`                             |
| Interactive impact calculator              | Toggleable weekly swaps showing approx. weekly CO₂ saved and multiplicative PM2.5 reduction                | `src/components/ImpactCalculator.tsx`, `src/utils/impactCalculator.ts`, `src/constants/index.ts`                           |
| Scoped follow-up Q&A chat                  | SSE-streamed Q&A restricted to air quality, respiratory protection, and sustainability                     | `src/components/FollowUpChat.tsx`, `api/chat.ts`, `src/utils/promptBuilder.ts`                                             |
| Visible medical disclaimer                 | Always-visible informational-only disclaimer banner (`role="note"`) above the plan                         | `src/components/ActionPlanView.tsx`, `src/i18n/translations.ts`                                                            |
| Bilingual English & Hindi experience       | Synchronized UI strings, errors, validation, `<html lang>`, speech synthesis, and Gemini replies           | `src/i18n/translations.ts`, `src/utils/storage.ts`, `src/hooks/useSpeechSynthesis.ts`                                      |
| Graceful AQI & AI fallbacks                | Manual AQI override (`0–500`) + Retry button + instant rule-based 4-section safety plan                    | `src/components/AqiHeroCard.tsx`, `src/hooks/usePlanGenerator.ts`, `src/utils/fallbackPlan.ts`                             |

---

## Evaluation Parameters

### 1. Code Quality

- **Strict TypeScript:** `strict: true`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, and `noUnusedParameters` enforced across `src/`, `api/`, `tests/`, and `server.ts` in `tsconfig.json`.
- **Static Analysis & Style:** `eslint.config.js` enforces `@typescript-eslint/no-explicit-any: error`, `react-hooks`, `eslint-plugin-jsx-a11y`, and `no-console` (`warn`/`error` only); Prettier checks formatting across all files (`npm run format:check`).
- **Clean Architecture & Resilience:** Clear separation of UI (`src/components`), hooks (`src/hooks`), API clients (`src/services`), pure domain utilities (`src/utils`), server handlers (`src/server/apiHandlers.ts`), KDoc comments on public exports, and section-level React `ErrorBoundary` wrappers (`src/components/ErrorBoundary.tsx`).

### 2. Security

- **Server-Side API Key Only:** `GEMINI_API_KEY` is read strictly via `process.env.GEMINI_API_KEY` inside `src/server/apiHandlers.ts` (shared by `api/*.ts` and `server.ts`) and never included in the client bundle (`dist/`).
- **Input Validation & Sanitization:** Zod schemas validate every form profile, manual AQI, Open-Meteo response, Gemini JSON plan, and API request payload (`src/utils/validation.ts`, `src/server/apiHandlers.ts`). Free-text notes and chat inputs are limited to `500` chars (`MAX_FREE_TEXT_LENGTH`) with `<`/`>`, control characters, and delimiter spoofing stripped (`sanitizeTextInput`).
- **Prompt-Injection Guard & Safety Settings:** Untrusted user data is wrapped inside `<<<USER_DATA_START>>>` and `<<<USER_DATA_END>>>` delimiters with data-only system instructions (`src/utils/promptBuilder.ts`). Gemini safety settings block `BLOCK_MEDIUM_AND_ABOVE` across Harassment, Hate Speech, Sexually Explicit, and Dangerous Content (`src/server/apiHandlers.ts`).
- **Safe Output Rendering & Headers:** Chat markdown uses `react-markdown` with raw HTML disabled (`allowedElements: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'code']`, `unwrapDisallowed`, zero `dangerouslySetInnerHTML`) in `src/components/FollowUpChat.tsx`. `index.html` enforces CSP (`default-src 'self'`, `object-src 'none'`, restricted `connect-src`) and `referrer="no-referrer"`.
- **Rate Limiting & Safe Diagnostics:** Sliding-window rate limiters (`10 req/min` client in `src/services/gemini.ts`, `20 req/min` per-IP server in `src/server/apiHandlers.ts` via `src/utils/rateLimiter.ts`), HTTP security headers (`vercel.json`, `server.ts`), 32 KB JSON body limit, `AbortController` timeouts (`src/utils/network.ts`), and secret-free error diagnostics (`src/utils/errorDiagnostics.ts`).

### 3. Efficiency

- **Debouncing & Request Cancellation:** City geocoding debounces input by `400 ms` (`src/hooks/useDebounce.ts`) and cancels superseded requests with `AbortController` (`src/hooks/useAirQuality.ts`).
- **In-Memory TTL + LRU Caching:** Open-Meteo AQI readings cache for `10 minutes` (`src/services/airQuality.ts`), and validated plans cache for `30 minutes` (`src/services/gemini.ts`) via `TtlCache` (`src/utils/cache.ts`).
- **SSE Streaming & Lazy Loading:** `/api/plan` and `/api/chat` stream tokens over Server-Sent Events (`X-Accel-Buffering: no`), while `ImpactCalculator` and `FollowUpChat` are code-split via `React.lazy` and `Suspense` in `src/App.tsx`.

### 4. Testing

- **Comprehensive Vitest Suite:** `53` passing tests across `10` test files (`tests/unit/*`, `tests/services/*`, `tests/server/*`, `tests/components/*`) covering domain logic, mocked network/SSE flows, Vercel serverless handlers, UI workflows, XSS sanitization, keyboard navigation, and `jest-axe` accessibility.
- **Measured V8 Coverage:** `85.66%` statements / `85.97%` lines across `src/utils`, `src/services`, and `src/hooks` (`97.91%` statements and `91.97%` branches in `src/utils`).

### 5. Accessibility

- **Semantic Landmarks & Screen Readers / TalkBack:** Single `<h1>`, landmarks (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`), skip-to-content link (`src/components/Header.tsx`), synchronized `<html lang>`, explicit `<label>` and `<fieldset>/<legend>` groupings, `aria-required`, `aria-invalid`, `aria-describedby`, `aria-live="polite"`, `role="log"`, `aria-valuetext`, and `role="alert"`.
- **Keyboard, Contrast & Motion:** WAI-ARIA tabs with `ArrowLeft`, `ArrowRight`, `Home`, and `End` keyboard navigation plus `tabIndex={0}` on active panels and chat log (`src/components/ActionPlanView.tsx`, `src/components/FollowUpChat.tsx`), `>= 44×44 px` touch targets, high-contrast `:focus-visible` rings, light/dark modes, `prefers-reduced-motion` CSS rules (`src/index.css`), non-color-only AQI status (`icon + text + color + role="img"` gauge in `src/components/AqiHeroCard.tsx`), and optional EN/HI Web Speech API `Read aloud` narration (`src/hooks/useSpeechSynthesis.ts`).
- **Automated Audits:** Zero violations in `jest-axe` across all interactive components (`tests/components/components.test.tsx`) plus `eslint-plugin-jsx-a11y`.

### 6. Problem Statement Alignment

- Every requested capability—city/geolocation AQI, household profiling, 4-section GenAI guidance, per-item impact reasoning, weekly calculator, scoped chat, English/Hindi toggle, medical disclaimer, manual AQI, and rule-based fallback—is implemented and directly visible in the UI.

---

## Architecture

```text
+-------------------------------------------------------------------------+
| Browser SPA (React 19 + TypeScript Strict + Tailwind CSS v4)            |
|  - Header (skip link, nav, EN/HI language toggle)                       |
|  - AqiHeroCard   <--> useAirQuality / useGeolocation (click-only)       |
|  - ProfileForm   <--> Zod validation + 500-char sanitizer               |
|  - ActionPlanView <-- usePlanGenerator (SSE stream + rule fallback)     |
|  - ImpactCalculator (React.lazy) & FollowUpChat (React.lazy, no-HTML)   |
+-------------------+-----------------------------------+-----------------+
                    | Direct browser fetch (with        | POST /api/plan
                    | automatic /api proxy fallback)    | POST /api/chat (SSE)
                    v                                   v
+-----------------------------------+   +---------------------------------+
| Open-Meteo Public APIs            |   | Vercel Serverless (/api/*) &    |
|  - geocoding-api.open-meteo.com   |   | Express Dev Server (server.ts)  |
|  - air-quality-api.open-meteo.com |   |  - api/plan.ts                  |
+-----------------------------------+   |  - api/chat.ts                  |
                    ^                   |  - api/geocode.ts               |
                    | Proxy fallback    |  - api/aqi.ts                   |
                    +-------------------+  Shared: src/server/apiHandlers |
                                        |  (Zod, rate limit, SSE, retries)|
                                        +----------------+----------------+
                                                         | GEMINI_API_KEY
                                                         | (process.env only)
                                                         v
                                        +---------------------------------+
                                        | Google Gemini API (@google/genai)|
                                        |  - gemini-4-hydrogen            |
                                        |  - fallback: gemini-3.1-flash-lite
                                        +---------------------------------+
```

### Folder Structure

```text
.
├── api/                     # Vercel Node.js serverless functions (plan, chat, geocode, aqi)
├── src/
│   ├── components/          # Accessible UI sections, SVG icons, and ErrorBoundary
│   ├── constants/           # AQI breakpoints, timeouts, model IDs, calculator swaps, defaults
│   ├── hooks/               # Debounce, geolocation, AQI fetching, SSE plan streaming, TTS
│   ├── i18n/                # English & Hindi translations
│   ├── server/              # Shared Node/Express/Vercel handlers (apiHandlers.ts)
│   ├── services/            # Browser clients for Open-Meteo & /api SSE endpoints
│   ├── types/               # Strict TypeScript interfaces
│   └── utils/               # AQI math, Zod schemas, prompt builder, cache, rate limiter, fallback
├── tests/                   # Vitest unit, service, server handler, and jest-axe component tests
├── server.ts                # Local Express + Vite middleware server (port 3000)
├── vercel.json              # Vite build output & SPA rewrites preserving /api/* routes
├── index.html               # CSP header, referrer policy, and metadata
├── TESTING.md               # Test commands and file overview
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
| Air Quality & Geo    | Open-Meteo Air Quality & Geocoding APIs                                 | Free, keyless live US AQI, PM2.5, PM10, NO₂, O₃, and geocoding  |
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

Configure `GEMINI_API_KEY` inside `.env`:

```env
GEMINI_API_KEY="your-gemini-api-key"
APP_URL="http://localhost:3000"
```

- `GEMINI_API_KEY`: Read exclusively on the server via `process.env.GEMINI_API_KEY` inside `src/server/apiHandlers.ts`.
- **Important:** Never commit `.env` to version control (it is excluded by `.gitignore`), and **never** prefix this key with `VITE_`—client-prefixed variables are bundled into browser JavaScript.

### Run Locally

```bash
npm run dev
```

Starts Express (`server.ts`) with Vite dev middleware on **http://localhost:3000**, serving both the React app and `/api/plan`, `/api/chat`, `/api/geocode`, and `/api/aqi`.

### Build for Production

```bash
npm run build   # Builds static assets into dist/
npm start       # Serves dist/ and /api/* via server.ts on port 3000
```

---

## Deployment on Vercel

SafeAir Saathi is preconfigured for Vercel via `vercel.json` (`framework: "vite"`, `buildCommand: "npm run build"`, `outputDirectory: "dist"`, and SPA rewrite `"/((?!api/).*)" -> "/index.html"`) alongside Node.js serverless functions in `/api` (`api/plan.ts`, `api/chat.ts`, `api/geocode.ts`, `api/aqi.ts`).

- **Live Deployment:** [https://safe-air-lilac.vercel.app/](https://safe-air-lilac.vercel.app/)

### Option A: Vercel Dashboard

1. Push your repository to GitHub, GitLab, or Bitbucket and import it on [vercel.com/new](https://vercel.com/new).
2. Keep the build settings loaded from `vercel.json`:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Add the server-side environment variable under **Project Settings → Environment Variables**:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** Your Google Gemini API key
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

## Testing

### Commands

| Command                 | Purpose                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `npm test`              | Run all Vitest unit, service, server handler, component, and `jest-axe` tests            |
| `npm run test:coverage` | Run the full suite and generate V8 coverage for `src/utils`, `src/services`, `src/hooks` |
| `npm run lint`          | Run ESLint (`typescript-eslint`, `react-hooks`, `jsx-a11y`) + `tsc --noEmit`             |
| `npm run typecheck`     | Run strict TypeScript checking across `src/`, `api/`, `tests/`, and `server.ts`          |
| `npm run format:check`  | Verify Prettier formatting across the codebase                                           |

### What Is Covered & Current Results

- **Suite Totals:** **10 test files, 53 tests passing** (`vitest run`)
  - `tests/unit/aqi.test.ts` (`5`): EPA AQI category boundaries, negative/NaN clamping, manual reading generation, timestamp formatting.
  - `tests/unit/validation.test.ts` (`6`): Sanitization, 500-char caps, city query validation, profile schema, chat input, manual AQI range.
  - `tests/unit/cacheAndRateLimiter.test.ts` (`4`): TTL expiry, LRU eviction, deterministic plan cache keys, sliding-window rate limiting.
  - `tests/unit/impactAndPrompt.test.ts` (`6`): Multiplicative PM2.5 math, CO₂ formatting, injection delimiters, bilingual rule-based fallback plans.
  - `tests/unit/errorDiagnostics.test.ts` (`3`): Non-secret error classification and message truncation.
  - `tests/unit/network.test.ts` (`4`): Open-Meteo URL builders, proxy fallback on direct network/HTTP failures, abort behavior.
  - `tests/unit/hooksAndStorage.test.ts` (`7`): `useDebounce`, `useGeolocation`, `usePlanGenerator`, `useSpeechSynthesis`, and `localStorage` language persistence.
  - `tests/services/services.test.ts` (`6`): Mocked `fetch` for geocoding, cached AQI reads, SSE plan/chat streams, client rate-limit enforcement, malformed payloads, and HTTP errors.
  - `tests/server/apiHandlers.test.ts` (`3`): Direct tests of `api/geocode.ts`, `api/aqi.ts`, `api/plan.ts`, and `api/chat.ts` (method enforcement, Zod validation, missing key 503 responses, security/cache headers, and per-IP rate limiting).
  - `tests/components/components.test.tsx` (`9`): Interactive workflows, WAI-ARIA keyboard navigation, SSE markdown XSS sanitization, error boundary recovery, and `jest-axe` zero-violation checks across all UI sections.
- **Measured V8 Coverage (`npm run test:coverage`):**
  - **All measured files (`src/utils`, `src/services`, `src/hooks`):** `85.66%` Statements | `69.63%` Branches | `88.23%` Functions | `85.97%` Lines
  - `src/utils`: `97.91%` Statements (`100%` on `aqi.ts`, `errorDiagnostics.ts`, `fallbackPlan.ts`, `promptBuilder.ts`, `rateLimiter.ts`, `storage.ts`)
  - `src/services`: `85.61%` Statements (`94.28%` on `airQuality.ts`)
  - `src/hooks`: `75.64%` Statements (`100%` on `useDebounce.ts`)

See [TESTING.md](./TESTING.md) for additional details.

---

## Security Notes and Privacy

- **No Cookies or Tracking:** No analytics scripts or tracking cookies are used. Only the UI language preference (`'en'` or `'hi'`) is stored under `safeair_saathi_language` in `localStorage` (`src/utils/storage.ts`).
- **Location Used Only on Click:** Browser geolocation runs only when the user clicks **Use My Location** (`src/hooks/useGeolocation.ts`); coordinates are held in transient React state and never persisted or logged.
- **Server-Side API Key Only:** `GEMINI_API_KEY` exists solely in server `process.env` (`src/server/apiHandlers.ts`).
- **Defense in Depth:** `index.html` applies CSP and `no-referrer`; inputs are validated with Zod (`src/utils/validation.ts`); prompts wrap user input inside `<<<USER_DATA_START>>>` / `<<<USER_DATA_END>>>` (`src/utils/promptBuilder.ts`); chat renders safe markdown without HTML (`src/components/FollowUpChat.tsx`); and sliding-window rate limiters guard both client and server endpoints.

---

## Accessibility Notes

- **Landmarks & Keyboard Navigation:** Includes a skip-to-content link, `<header>`, `<nav>`, `<main>`, `<section>`, and `<footer>` landmarks, single `<h1>`, and WAI-ARIA `tablist`/`tab`/`tabpanel` keyboard controls (`ArrowLeft`, `ArrowRight`, `Home`, `End`) in `src/components/ActionPlanView.tsx`.
- **Screen-Reader & TalkBack Ready:** Explicit `<label>` / `<fieldset>` / `<legend>` pairings, `aria-required`, `aria-invalid`, `aria-describedby`, `aria-live="polite"` stream/status regions, `role="alert"` error notices, and `role="img"` descriptive labels on the AQI SVG gauge.
- **Visual & Motor Inclusivity:** `>= 44×44 px` touch targets, `:focus-visible` outlines, light and dark themes, `prefers-reduced-motion` support (`src/index.css`), non-color-only AQI severity cues, and optional EN/HI Web Speech API **Read aloud** playback (`src/hooks/useSpeechSynthesis.ts`).

---

## Limitations and Assumptions

- **Approximate Impact Figures:** Weekly CO₂ savings and PM2.5 exposure reductions in `src/constants/index.ts`, `src/utils/impactCalculator.ts`, and AI/fallback cards are educational order-of-magnitude estimates based on typical urban commuter and household assumptions; real outcomes vary with trip distance, mask fit, building air-exchange rate, and power grid mix.
- **Not Medical Advice:** All content is strictly informational and does not substitute for clinical diagnosis or emergency care. Consult a doctor immediately for breathing difficulty, persistent cough, chest pain, or high-risk respiratory symptoms.
- **Regional Grid Data & Free Quotas:** Open-Meteo provides modeled/assimilated regional CAMS grids that may smooth localized roadside or cooking spikes (users with local meters can enter Manual AQI). AI plan generation and chat remain subject to Gemini API quotas and sliding-window rate limits.

---

## Future Improvements

- **Hourly Smog Window Charting:** Integrate Open-Meteo hourly PM2.5 forecasts to plot exact daily low-smog windows for outdoor exercise and window ventilation.
- **Ground Station Cross-Reference:** Surface nearby public ground-monitoring station readings alongside modeled CAMS grid values where available.
- **Offline PWA Support:** Cache the user's most recent personalized plan and rule-based checklist via a service worker for low-connectivity winter smog alerts.

---

## License and Acknowledgements

- **License:** Distributed under the [MIT License](./LICENSE).
- **Acknowledgements:**
  - [Open-Meteo](https://open-meteo.com/) for free, keyless live Air Quality and Geocoding APIs.
  - [Google Gemini (`@google/genai`)](https://ai.google.dev/) for structured action plan generation and bilingual Q&A.
