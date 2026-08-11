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

**iOS parity handoff briefs** live at the repo root (`iOS_*_BRIEF.md`) — written for whichever agent works in the actual Xcode project, documenting Android/backend behavior changes that iOS should check itself against. Check these before assuming iOS already matches Android on a given feature. Current briefs: `iOS_WALK_RUN_ACTIVITY_TYPE_AUDIT_BRIEF.md` (walk/run coaching-vocabulary parity), `iOS_SESSION_GENERATION_AND_COACHING_UX_BRIEF.md` (session_instructions generation lifecycle + in-session coaching UX). Add a new one rather than overloading these when a genuinely separate topic comes up.

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

### Session coaching plan generation (`session_instructions` / dynamic coaching plan)
Each planned workout's AI coaching plan (phases, triggers, pre-run brief) is generated **on-demand only**, the first time it's actually requested — `POST /api/workouts/{id}/prepare-coaching` → `getOrGenerateSessionCoaching()` in `server/session-coaching-service.ts` — then cached on `planned_workouts.session_instructions_id`, version-gated via `CURRENT_PLAN_VERSION` in that file (bump it when prompt/trigger logic changes, to force regeneration of stale cached plans on next open).

`server/session-enrichment-service.ts`'s `enrichWorkoutBlock()` does **not** eagerly regenerate coaching plans for every workout in a block anymore — its `regenerateCoaching` param defaults to `false`. Only `server/scheduler.ts`'s daily rolling-enrichment cron opts in with `true`, since that's the only call site where a workout could already have a stale *cached* plan from an earlier open that genuinely needs refreshing; new-plan-creation, next-block-generation, and post-orientation-enrichment call sites have no prior cache to go stale, so forcing regen there was pure wasted OpenAI cost. Keep new call sites defaulting to `false` unless they can hit an already-cached workout.

Android (`WorkoutDetailScreen.kt`) reflects this: it shows a full-screen "Generating your full session" loading view — not the detail screen with a banner — until `RunSessionViewModel.coachingGenerationState` reaches READY or FAILED, and keeps Start/Prepare-for-Watch locked through `isAudioPreloading` (Polly TTS pre-caching, which finishes *after* the plan itself) too, not just until the plan JSON arrives. `WorkoutStructureSection` renders from the real generated `DynamicCoachingPhase[]` (`activeSessionCoachingPlan.phases`), not a hardcoded per-workout-type template — don't reintroduce a static fallback there, it will drift from what the AI actually generated (confirmed: a hill-repeats session UI once showed a fabricated 10-min warm-up that didn't exist in that session's real data).

`ensureClosingStageMilestones()` in `ai-service.ts` guarantees a `session_complete` trigger exists even if OpenAI's response omits one, for both distance-based (`distance >= X`) and time-based (`elapsed_min >= X`) sessions — the time-based fallback is a relatively recent addition, so don't assume every historically-cached plan has one (cache version gate will regenerate them, but only on next open past a version bump).

## Deployment

Backend is deployed via Replit (`.replit`: autoscale deployment, `npm run build` then `npm run start`, health check at `/health`) to `https://airuncoach.live`, backed by Neon PostgreSQL. Deploys are not automatically triggered by `git push` — after merging backend fixes that need to take effect in production (e.g. anything touching cache-computation logic), a Replit redeploy is a separate step.

## Current state / open items (as of 2026-08-11)

This section is a point-in-time handoff snapshot, not durable documentation — prune/update entries as they're resolved rather than letting them accumulate.

- **Pending Replit redeploy.** Commits `0f7cb46`..`4105963` on `main` include several backend changes (walk/run coaching-vocabulary parity, on-demand session-coaching generation, the `ensureClosingStageMilestones` time-based fallback, the `ai_coaching_notes` migration casing fix, improved Strava error logging) that are pushed but **not yet live** — they need a Replit redeploy to take effect in production.
- **Android v2.0.9 (versionCode 51) bundle built, not yet uploaded.** `app/build/outputs/bundle/release/app-release.aab` — built locally, includes all of this session's Android fixes, not yet pushed to Google Play Console.
- **Garmin IQ v3.3.4 built, not yet uploaded.** `garmin-companion-app/bin/AiRunCoach.iq` (156 devices) — built locally, not yet submitted via the Connect IQ developer portal (see `garmin-companion-app/README.md` § Publishing).
- **Strava integration returning 403s** (`[Strava Webhook] Auto-register error`, `[Strava Import] Error`) — both traced to `{resource:'Application', field:'Status', code:'Inactive'}` from Strava's API. `STRAVA_CLIENT_ID`/`SECRET` and the OAuth/webhook callback domain (`airuncoach.live`) were verified correct — this is an account-level status flag on the Strava Application itself in Strava's developer dashboard, not a code bug. Needs resolution on Strava's side (check strava.com/settings/api for a status banner or incomplete required fields, check for a suspension email). The import-history error handler (`server/strava-oauth-bridge.ts`) now logs the real Strava response body — check that log next time an import fails to confirm/rule out the same cause.
- **Fixed — live-coaching rep-count fallback.** `RunTrackingService.kt`'s `fireLiveTriggerMessage` used to build the pre-written fallback message (used whenever the live `getSessionTriggerLive` call times out/fails — confirmed via a real audited hill-repeats session to happen on essentially every cue that session) via `pickTriggerMessage(...)` *before* `currentRepNum`/`totalRepsNum` were derived a few lines later, so fallback text always said "Rep 1 of 1" regardless of the real rep. Fixed by computing the rep context first and passing it into `pickTriggerMessage`. **Still suspected but not confirmed**: the interleaved work/recovery expanded-phase timeline's cumulative-distance bookkeeping may not account for real GPS distance covered during time-based recovery phases, which could cause later work-phase entries to be skipped by the phase-resolution scan (`recovery_start` never fired at all in the audited session) — this part is still open, needs real GPS/split data from a run to confirm before attempting a fix. **This is the only known open code bug as of this writing** (aside from the external Strava issue above, which isn't a code bug).
- **iOS brief correction.** `iOS_WALK_RUN_ACTIVITY_TYPE_AUDIT_BRIEF.md` previously claimed Android's `generateStartPromptByTone`/`fireStartCoachingFallback` still had running-vocabulary fallback phrases that never branch on activity type. Re-verified directly against current source (2026-08-11) rather than trusting the doc — both already correctly branch on `isWalk` with fully separate walk/run phrase banks. Brief corrected. Lesson for future agents: verify a handoff brief's specific code claims against current source before acting on them — docs go stale, especially ones written slightly before/after the fix they describe.
