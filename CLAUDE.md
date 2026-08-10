# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

This is a monorepo with several independently-buildable pieces sharing one backend:

- **`app/`** — the production Android app (Kotlin, Jetpack Compose, MVVM, Hilt DI). This is the primary product surface.
- **`server/`** — Node/Express + TypeScript backend (Drizzle ORM, PostgreSQL/Neon). Serves the Android app, the Garmin/Samsung companion apps, and `client/`.
- **`client/`** — a Vite + React web app (wouter routing, shadcn/radix components, Tailwind) — landing page plus a web version of core run/profile flows. Not React Native despite RN packages listed in `package.json`; those are largely vestigial.
- **`shared/`** — dual-purpose: a Kotlin Multiplatform module (`shared/src/{commonMain,androidMain,iosMain}`, wired into the Gradle build via `settings.gradle.kts`) providing run analytics/coaching logic shared between Android and iOS, **and** `shared/schema.ts` — the Drizzle schema/Zod types imported by the server and web client as `@shared/*`.
- **`garmin-companion-app/`** — Garmin Connect IQ watch app (Monkey C).
- **`samsung-watch-app/`** — Samsung watch companion app.
- **`migrations/`** — Drizzle-generated SQL migrations. Numerous one-off `ADD_*.sql` / `*.sql` scripts also live at the repo root from earlier ad-hoc schema changes — check `migrations/` first for the canonical history.

**Stale/duplicate directories — do not edit:** top-level `ios/` and `android/` are old, largely-abandoned scaffolding (last touched months ago), not the real iOS project. The active iOS Xcode project lives outside this repo entirely (on the developer's Desktop) — if iOS work comes up, confirm the correct project location with the user before assuming `ios/` here is it.

The root `package.json` covers `server/`, `client/`, and `shared/schema.ts` (all TypeScript/Node). The Android app (`app/`) is a separate Gradle project with its own build lifecycle.

## Commands

### Backend / web (from repo root)
```bash
npm run server:dev        # run the Express API locally (tsx, loads .env)
npm run expo:dev          # Expo dev server (legacy/secondary — client/ is the primary web app, served via Vite through the Express server in dev)
npm run check:types       # tsc --noEmit across server/client/shared
npm run lint               # expo lint
npm run lint:fix
npm run check:format       # prettier --check
npm run format              # prettier --write
npm run build               # vite build (client) + esbuild (server) → server_dist/
npm run db:push             # drizzle-kit push — applies shared/schema.ts to the DB (requires EXTERNAL_DATABASE_URL)
```
There is no configured `test` script / test runner (no jest/vitest config) for the TypeScript side.

### Android (from repo root, or open in Android Studio)
```bash
./gradlew assembleDebug     # build debug APK
./gradlew installDebug      # build + install on connected device/emulator
./gradlew test              # unit tests (app/src/test)
./gradlew lint               # Android lint
```
Requires `local.properties` with `sdk.dir=<path to Android SDK>` if not already present.

### Garmin watch app
```bash
./launch-garmin-simulator.sh
```

## Architecture notes

### Backend route registration
`server/index.ts` calls `registerRoutes(app)` from `server/routes.ts`, which is the main router (very large — thousands of lines) and also mounts feature-specific sub-routers as separate files, e.g. `routes-my-data.ts`, `routes-achievements.ts`, `routes-adaptation.ts`, `routes-samsung-companion.ts`, `routes-session-coaching.ts`. When adding a new feature-area of endpoints, prefer a new `routes-*.ts` file mounted in `routes.ts` over growing `routes.ts` further.

### Stats cache + self-heal pattern (`server/user-stats-cache.ts`, `server/my-data-service.ts`)
The "My Data" screen (personal bests, all-time totals) reads from a precomputed `user_stats` cache table (O(1) PK lookup) instead of scanning every run on each request. Two write paths keep it current:
- `onRunSaved(userId, run)` / `onRunDeleted(userId)` trigger a full `recomputeForUser(userId)` (always full recompute — incremental updates previously caused unit-conversion drift).
- Admin endpoints (`POST /api/my-data/reset-cache` for self, `POST /api/my-data/admin/recompute-all` for all users) exist for backfill/recovery after fixing cache-computation bugs.

Because the cache can go stale relative to the live computation logic (e.g. after a bug fix ships, existing cached rows aren't automatically corrected), `getPersonalBests()` in `my-data-service.ts` **self-heals on read**: it validates cached PB entries against the actual `runs` table (existence, and for distance-banded categories like 5K/10K/Half/Marathon, that the referenced run's logged distance genuinely falls in that band — not just that *some* run exists) before trusting the cache, falling back to a live query (`getPersonalBestsLive`) otherwise. When touching PB/stats logic, keep the cache-write path (`user-stats-cache.ts`) and the live-query/self-heal path (`my-data-service.ts`) in sync — divergence between them is exactly what produces fabricated-looking data.

### Unit conventions (see comments atop `server/user-stats-cache.ts`)
- `runs.distance` → kilometers; legacy rows may store meters (`distance > 200` is the on-the-fly detection heuristic used throughout the codebase).
- `runs.duration` → **seconds**, not milliseconds.
- `pb_*_duration_ms` cache columns → milliseconds.
- `km_splits[].time` → milliseconds per split.

### Android networking
`app/src/main/java/live/airuncoach/airuncoach/network/RetrofitClient.kt` toggles between local dev backend and production (`https://airuncoach.live`) via a `useLocalBackend` flag; release builds always use production regardless of the flag.

### Android structure
Standard MVVM: `viewmodel/` (one per screen, Hilt-injected), `ui/screens/` (Compose screens) and `ui/components/` (reusable composables), `domain/model/`, `data/` (session/auth managers), `network/` (Retrofit services + DTOs), `service/` (foreground services, e.g. run tracking). Theming (`Colors.kt`, `AppTextStyles.kt`, `Spacing.kt`) lives under `ui/theme/`.

## Deployment

Backend is deployed via Replit (`.replit`: autoscale deployment, `npm run build` then `npm run start`, health check at `/health`) to `https://airuncoach.live`, backed by Neon PostgreSQL. Deploys are not automatically triggered by `git push` — after merging backend fixes that need to take effect in production (e.g. anything touching cache-computation logic), a Replit redeploy is a separate step.
