# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

This is a monorepo with several independently-buildable pieces sharing one backend:

- **`app/`** — the production Android app (Kotlin, Jetpack Compose, MVVM, Hilt DI). This is the primary product surface.
- **`server/`** — Node/Express + TypeScript backend (Drizzle ORM, PostgreSQL/Neon). Serves the Android app, the Garmin/Samsung companion apps, and `client/`.
- **`client/`** — a Vite + React web app (wouter routing, shadcn/radix components, Tailwind) — landing page plus a web version of core run/profile flows. Not React Native despite RN packages listed in `package.json`; those are largely vestigial.
- **`shared/`** — dual-purpose: a Kotlin Multiplatform module (`shared/src/{commonMain,androidMain,iosMain}`, wired into the Gradle build via `settings.gradle.kts`) providing run analytics/coaching logic shared between Android and iOS, **and** `shared/schema.ts` — the Drizzle schema/Zod types imported by the server and web client as `@shared/*`.
- **`garmin-companion-app/`** — Garmin Connect IQ watch app (Monkey C).
- **`wear/`** — Wear OS (Kotlin/Compose) companion app for Samsung Galaxy Watch 4+, a standalone Gradle module with its own `applicationId`. Mirrors the Garmin Connect IQ app's screens/lifecycle; talks to the phone app via the Wear Data Layer (`SamsungWatchManager.kt` on the phone side) with a direct-HTTP fallback for standalone/offline use. Supersedes an earlier Tizen-based `samsung-watch-app/` scaffold (removed 2026-08-14, never went past initial scaffolding).
- **`migrations/`** — Drizzle-generated SQL migrations. Numerous one-off `ADD_*.sql` / `*.sql` scripts also live at the repo root from earlier ad-hoc schema changes — check `migrations/` first for the canonical history.

**Stale/duplicate directories — do not edit:** top-level `ios/` and `android/` are old, largely-abandoned scaffolding (last touched months ago), not the real iOS project. The active iOS Xcode project lives outside this repo entirely, at `/Users/danieljohnston/Desktop/Ai-Run-Coach-iOS/Ai Run Coach` (standalone SwiftUI app, no shared code with this monorepo — communicates with the same `server/` backend over REST) — if iOS work comes up, confirm the correct project location with the user before assuming `ios/` here is it.

**iOS repo has a real git history + GitHub remote** (`github.com/danjohnston0701/Ai-Run-Coach-iOS.git`, a few commits deep as of 2026-08), but the developer relies on iCloud syncing the Desktop folder as the actual backup, not git — **do not proactively `git add`/`commit`/`push` iOS changes**; only do so if explicitly asked. Large amounts of iOS work routinely sit uncommitted in that working tree for extended periods, which is expected/normal there, unlike this repo.

**Working on the iOS project from this environment — how to verify, and known limitations:**
- **A real `xcodebuild` simulator build works from this environment** (confirmed 2026-09-15 — the package graph resolves and it reaches `** BUILD SUCCEEDED **`; an earlier note here claiming it always died at `ConnectIQ`/`Porcupine` module resolution is obsolete). Run it from the outer project dir (`~/Desktop/Ai-Run-Coach-iOS/Ai Run Coach`) before reporting any iOS change as done — it links, covers every file, and does the availability checking the `swiftc` harness below cannot:
  ```bash
  xcodebuild build -workspace "Ai Run Coach.xcworkspace" -scheme "Ai Run Coach" \
    -destination "generic/platform=iOS Simulator" -configuration Debug CODE_SIGNING_ALLOWED=NO \
    2>&1 | grep -E "error:|BUILD SUCCEEDED|BUILD FAILED"
  ```
  Takes a few minutes, so use it as the final gate rather than the iteration loop. A green run lets you say "build-verified"; on-device behaviour still needs the developer.
- **`swiftc -typecheck` is the fast iteration loop** — seconds rather than minutes, genuine whole-module type checking. From the inner source dir (`~/Desktop/Ai-Run-Coach-iOS/Ai Run Coach/Ai Run Coach`):
  ```bash
  SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
  find . -maxdepth 1 -name "*.swift" \
    ! -name Ai_Run_CoachApp.swift ! -name AppAnalytics.swift ! -name WakeWordDetector.swift \
    -print0 | xargs -0 xcrun swiftc -typecheck -swift-version 5 \
    -default-isolation MainActor -enable-upcoming-feature ApproachableConcurrency \
    -sdk "$SDK" -target arm64-apple-ios26.0-simulator
  ```
  The three flags mirror the project's own build settings (`SWIFT_VERSION = 5.0`, `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, `SWIFT_APPROACHABLE_CONCURRENCY = YES`) and are **not optional** — without `-default-isolation MainActor` you get phantom "main actor-isolated property can not be referenced from a nonisolated context" errors in files nobody touched. Exclude only the three files importing unavailable modules (Firebase, Porcupine). A healthy tree gives **0 errors across 97 files**, with two expected residual `cannot find 'GarminWatchManager' in scope` in `CoachingPlanScreens.swift` — that file lives one directory *up* and imports `ConnectIQ`, so it can't be included. Don't sweep the outer dir in wholesale: it holds stale duplicate `APIService.swift`/`MyDataScreen.swift` that abort the run with "filename used twice". Note `swiftc -parse` is **syntax only** and is not a substitute — it silently passes real type errors (it missed a `String?` property decoded with an `Int.self` fallback via `??`, which the developer's Xcode build then rejected). On its own this is "type-checked, not build-verified": it doesn't link, cover the excluded files, or check API availability (an iOS-17-only `onChange` overload sailed through it and was then rejected by Xcode) — follow it with the `xcodebuild` run above.
- SourceKit single-file diagnostics (the inline `<new-diagnostics>` warnings surfaced while editing) are consistently unreliable — they routinely fail to resolve cross-file symbols and even system frameworks (e.g. `UIKit`), so "Cannot find X in scope" from SourceKit is not meaningful signal in isolation. Cross-check with `grep` across the whole file/codebase before concluding something is a real dangling reference.
- Given the above, use `swiftc -typecheck` while iterating and `xcodebuild` before reporting any iOS change as done, and use them to adjudicate SourceKit noise — but still treat a user-reported real Xcode build error as the higher-signal source, and double-check subtle Swift correctness by hand (e.g. the memberwise-initializer `let` vs `var` default-value gotcha — SE-0242 only synthesizes an overridable init parameter for `var` properties with an inline default, never for `let`).

**iOS parity handoff briefs** live at the repo root (`iOS_*_BRIEF.md`) — written for whichever agent works in the actual Xcode project, documenting Android/backend behavior changes that iOS should check itself against. Check these before assuming iOS already matches Android on a given feature. Current briefs: `iOS_WALK_RUN_ACTIVITY_TYPE_AUDIT_BRIEF.md` (walk/run coaching-vocabulary parity), `iOS_SESSION_GENERATION_AND_COACHING_UX_BRIEF.md` (session_instructions generation lifecycle + in-session coaching UX), `iOS_GPS_DISTANCE_FILTER_AND_KM_SPLIT_AUDIT_BRIEF.md` (GPS teleport-jump distance filtering and km-split boundary logic — walk-specific tightening applied on Android 2026-08-24, iOS has a structurally similar but not-yet-activity-aware filter plus an already-in-progress ~100m iOS-vs-Android distance-drift investigation to cross-reference). Add a new one rather than overloading these when a genuinely separate topic comes up.

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

## Current state / open items (as of 2026-08-14)

This section is a point-in-time handoff snapshot, not durable documentation — prune/update entries as they're resolved rather than letting them accumulate.

- **Pending Replit redeploy.** `main` is at `e9b64cf` (pushed) and includes two full days of accumulated backend work not yet confirmed live: the AI Plans on/off subscription-tier entitlement logic (`aiPlansEnabled` on `users`), the 4 new Google Play SKU pricing matrices, the `storage.getUserById` → `getUser` typo fixes (account-deletion notification email, change-password endpoint), and the new `excludeCoachingPlan` filtering on all four My Data endpoints. A Replit redeploy is a separate manual step — do this before assuming any of the above is live in production.
- **Android + iOS parity pass (2026-08-13/14) — Group Runs, Friends, Goals, onboarding, subscription/paywall, Account Management, AI Coaching Settings, Dashboard, My Data.** Extensive two-platform work; the durable, still-relevant pieces:
  - **AI Plans on/off subscription tiers**: a new orthogonal `aiPlansEnabled: boolean` (default `true`) on `users` — deliberately not a new tier string, so existing `tier === "lite"`-style checks elsewhere keep working. 4 new SKUs exist on both stores (`lite_noaiplan_monthly`/`annual`, `standard_noaiplan_monthly`/`annual` on Google Play; `live.airuncoach.subscription.lite.noaiplan` etc. on the App Store). `resolveProductId(tier, isAnnual, aiPlansEnabled)` (Android `SubscriptionScreen.kt`) is the single source of truth for constructing the right product ID from the tier + toggle state — mirror that pattern rather than reconstructing IDs ad hoc.
  - **AI Coaching Settings screen structure**: onboarding shows coach personality (name/voice/accent/tone) and coaching-trigger prompts (pace/HR/cadence/km-split interval/etc.) as **two separate screens** (`CoachSettingsScreen` → `InSessionCoachingSettingsScreen` on Android; `CoachSettingsScreen` → `CoachingPromptsSettingsScreen` on iOS). The **profile's** "AI Coaching Settings" entry point shows **both sections consolidated into one screen** instead — this was broken on both platforms after the onboarding split (profile was left pointing only at the personality screen, losing the trigger toggles entirely) and has been fixed on both: Android's `CoachSettingsScreen.kt` now renders the trigger-toggle section inline when `isOnboarding == false`; iOS's `CoachSettingsScreen.swift` had the equivalent `coachingToggles` view already written but never called from `body` — now wired in the same way.
  - **Account Management** (profile → My Account → Change Password / Get Support / Delete Account): all three now work end-to-end on both platforms. Delete Account sends a notification to `support@airuncoach.live` with the user ID + email so it can be actioned against Neon manually. iOS's Get Support was rebuilt as an in-app form (`GetSupportScreen.swift`) matching Android's, replacing a dead external web link.
  - **iOS-only fixes discovered during a Dashboard/My Data parity audit** (`Dashboard.swift`/`DashboardModels.swift`/`MyDataScreen.swift`, none of which have an Android-side equivalent bug):
    - **Data-loss bug (fixed)**: a live run could be silently killed by swiping back from the screen edge — `RunSessionViewModel` was a plain per-screen `@StateObject` with no persistence and the run screen only hid the nav-bar back *button* (`.toolbar(.hidden, for: .navigationBar)`), not the interactive edge-swipe gesture. Fixed with a `disableSwipeBack(_:)` `UIViewControllerRepresentable` helper (`AppTheme.swift`) active whenever `vm.isRunning`.
    - Same investigation led to `RunSessionViewModel.activeInstance` — a static reference set/cleared alongside the run's real start/stop (`startRun()`/`stopRun()`/`cancelRun()`), used so `RunSessionScreen` reattaches to an already-running session (`RunSessionViewModel.activeInstance ?? RunSessionViewModel()`) instead of always constructing a fresh one, and so `DashboardViewModel` can poll it to drive a working "Resume Run" banner (previously dead — `activeRunSession` was declared but never assigned). Every setup path that would otherwise re-run on top of a live session (`onAppear`'s config block, `tryBeginRunIfReady`) is now guarded behind `!vm.isRunning`. **Needs real on-device testing** (start a run → background/return to Dashboard → confirm live Resume banner → tap Resume → confirm it reattaches to the *same* session rather than restarting blank → finish normally → confirm the next run starts clean) — this could not be compile- or interactively-verified in this environment; treat as unconfirmed until tested.
    - Weather silently fell back to fabricated London coordinates when location permission was denied instead of showing "no data" like Android — fixed.
    - The Dashboard Goal card didn't exclude abandoned goals (only filtered `!isCompleted`, missing `isActive`) despite iOS's own `Goal` model already computing `isActive` correctly — fixed.
    - My Data's "Exclude AI Coaching Plan runs" toggle was fully non-functional (visible, defaulted on, but the backend had zero support for the `excludeCoachingPlan` query param) — now genuinely implemented across `getPersonalBests`/`getPeriodStatistics`/`getDetailedTrends`/`getAllTimeStats` in `server/my-data-service.ts`, each defaulting to whatever Android already got before this change (so Android behavior is unaffected).
    - `/api/my-data/trends` (the endpoint iOS's period selector hit) ignored its `period` query param entirely and always returned a hardcoded 30-day window — iOS's period picker (1M/3M/6M/1Y) did nothing. Redirected iOS to `/api/my-data/detailed-trends?days=X`, the endpoint Android already uses correctly; left the `/trends` route itself as-is (unused by either client's current code, not worth touching further).
- **Garmin-watch-initiated walk session freeze — still open, unconfirmed root cause.** Starting a walk session from the watch froze the timer within seconds; Garmin Connect saved 3 separate short activities instead of one continuous session. `garmin-companion-app/source/views/RunView.mc`'s `_startSession()`/`onShow()` has a defensive comment acknowledging this exact failure mode, and two recent watch-side commits touch the relevant walk-only branches — plausible but unconfirmed. Needs an on-device crash log or simulator repro with debug logging before attempting a fix.
- **Strava integration returning 403s** — traced to `{resource:'Application', field:'Status', code:'Inactive'}` from Strava's own API, an account-level status flag on the Strava Application in Strava's developer dashboard, not a code bug. `server/strava-oauth-bridge.ts` logs the real Strava response body on import failures — check that log next time this comes up.
- **Suspected, unconfirmed — interleaved work/recovery interval timeline bookkeeping.** The expanded-phase timeline's cumulative-distance tracking may not account for real GPS distance covered during time-based recovery phases, which could cause later work-phase trigger entries to be skipped (`recovery_start` never fired in one audited hill-repeats session). Needs real GPS/split data from a run to confirm before attempting a fix.
- **Android v2.0.11 / Garmin IQ v3.3.4 build-and-upload status is stale as of this writing** — both were built locally days before this parity pass and neither has been re-verified against the newer AI-Plans-tier and Account-Management work now on `main`. Treat any release-artifact claims from before 2026-08-14 as needing a fresh build before upload.
- **New `wear/` Wear OS companion app (2026-08-14) — not yet on-device tested, not yet published anywhere.** Added in `46428ef` alongside a phone-side `SamsungWatchManager.kt` rewrite (see repo-shape entry above). The old Tizen `samsung-watch-app/` scaffold that predated it has been deleted (never went past initial scaffolding, superseded by `wear/`). Two things to pick up:
  - **On-device verification needed first**: nothing about the `ConnectedDevicesScreen` install-prompt → Data Layer pairing → live session flow has been tested on a real Galaxy Watch yet. Do this before investing in store listings.
  - **Distribution plan (discussed 2026-08-14, not yet executed)** — goal is to replicate the acquisition boost the Garmin Connect IQ store listing has been driving, for Samsung too, plus multi-platform exposure from the main Play listing:
    - **Galaxy Store**: submit the same `wear/` build there — Galaxy Store distributes native Wear OS apps now (not just legacy Tizen), via a separate Samsung Developer/Seller Portal (seller.samsungapps.com) registration, independent review process from Google's. This is the direct analog of the Connect IQ store channel.
    - **Google Play**: `wear/` is built standalone (own `applicationId`, `com.google.android.wearable.standalone = true`), so publish it as its own Play Console app entry — that alone makes it discoverable via the Play Store running *on the watch itself*. Then link it to the main phone app's existing Play listing (Play Console's device-catalog association for a standalone Wear app, not the older same-package "bundled feature module" approach) so the phone listing also shows the watch as an available platform.
    - Net result once done: three acquisition surfaces — main Play listing (with watch badge), watch-native Play Store search, and Galaxy Store — mirroring what Connect IQ already provides on the Garmin side.
