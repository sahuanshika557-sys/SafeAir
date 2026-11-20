# Testing Guide — SafeAir Saathi

## Quick Commands

| Script                  | Description                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `npm test`              | Runs all unit, service, component, and `jest-axe` accessibility tests in Vitest (`jsdom`).    |
| `npm run test:coverage` | Runs the full suite and outputs V8 coverage for `src/utils`, `src/services`, and `src/hooks`. |
| `npm run lint`          | Runs ESLint (with `typescript-eslint`, `react-hooks`, and `jsx-a11y`) plus `tsc --noEmit`.    |
| `npm run typecheck`     | Runs strict TypeScript checking (`tsc --noEmit`).                                             |
| `npm run format:check`  | Checks Prettier formatting across the repository.                                             |

## Test Structure

- `tests/unit/aqi.test.ts` — Verifies all US AQI category boundaries (`0`, `50`, `51`, `100`, `101`, `150`, `151`, `200`, `201`, `300`, `301`, `500`), negative/NaN clamping, manual reading generation, and timestamp formatting.
- `tests/unit/validation.test.ts` — Verifies HTML/delimiter sanitization, 500-char limits, city query validation, profile schema validation, chat message validation, and manual AQI bounds.
- `tests/unit/cacheAndRateLimiter.test.ts` — Verifies TTL expiration, LRU eviction, deterministic plan cache keys, and sliding-window rate limiting.
- `tests/unit/impactAndPrompt.test.ts` — Verifies multiplicative PM2.5 reduction math, CO₂ summation, prompt-injection delimiters (`<<<USER_DATA_START>>>` / `<<<USER_DATA_END>>>`), and bilingual rule-based fallback plans.
- `tests/services/services.test.ts` — Mocks `fetch` for Open-Meteo Geocoding, Open-Meteo AQI (including 10-minute caching), and Gemini SSE streaming endpoints (`/api/plan`, `/api/chat`), testing success, abort/timeout, malformed payloads, and HTTP errors.
- `tests/components/components.test.tsx` — Exercises `Header`, `AqiHeroCard`, `ProfileForm`, `ActionPlanView`, `ImpactCalculator`, and `FollowUpChat` interactions and runs `jest-axe` on every component to guarantee zero accessibility violations.
