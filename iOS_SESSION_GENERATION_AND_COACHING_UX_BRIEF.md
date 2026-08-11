# iOS brief: session-coaching generation lifecycle & in-session coaching UX

## Context

This document covers a chain of related backend and Android fixes made in one session, all centred on how AI coaching (`session_instructions` / the "dynamic coaching plan") gets generated, when, and how the UI communicates that to the user — plus two Android-specific bugs found and flagged (not fixed) that are worth an independent iOS check. As with the companion `iOS_WALK_RUN_ACTIVITY_TYPE_AUDIT_BRIEF.md`, assume nothing about iOS's current state — verify each item against the actual iOS source rather than assuming Android's starting point matches iOS's.

Two of these are **backend changes that apply to iOS automatically** (same server, same endpoints) but require iOS-side support to actually benefit from / not regress on. The rest are **Android UI/UX features worth replicating**, and two are **known bugs, not yet fixed on Android**, flagged for an independent iOS audit rather than blind replication.

---

## A. Backend changes (apply to both platforms automatically)

### A1. `session_instructions` generation is now fully on-demand, not eager

**What changed:** `server/session-enrichment-service.ts` — `enrichWorkoutBlock()` used to eagerly fire a background `getOrGenerateSessionCoaching({ forceRegenerate: true })` call (an OpenAI `gpt-4o` call) for **every workout** immediately after enrichment, which runs synchronously during plan creation, next-block generation, and post-orientation enrichment. In production this meant creating one 6-week plan triggered ~5 sequential OpenAI calls (confirmed in Replit logs, ~20-30s each) totalling well over 2 minutes of eager generation for sessions the user might never open.

This eager regeneration is now gated behind a `regenerateCoaching` parameter that **defaults to `false`**. It's only passed `true` from `server/scheduler.ts`'s daily rolling-enrichment cron job — the one legitimate case where a workout could already have a stale *cached* plan from an earlier open that genuinely needs refreshing as targets tighten closer to the session date. New-plan-creation, next-block-generation, and post-orientation-enrichment call sites all now skip it.

**Effect:** `session_instructions` for a given `plannedWorkoutId` are now generated the **first time** `/api/workouts/{id}/prepare-coaching` (→ `getOrGenerateSessionCoaching`) is actually called for it — i.e. the first time a client opens/previews that specific session — and cached from then on (version-gated: `CURRENT_PLAN_VERSION` in `session-coaching-service.ts`).

**iOS action:**
- Confirm iOS's workout-detail / session-preview screen calls `prepare-coaching` (or the iOS equivalent request) **every time it opens a workout**, not just relying on the plan already having a cached instructions blob by the time the user gets there. That assumption used to be safe (eager generation pre-warmed everything); it is **no longer safe**.
- Confirm iOS handles a real ~20-30 second wait on first open (this used to be masked by the eager pre-warm — cache hits were near-instant, ~50-200ms). See B1 below for the UX requirement this implies.

### A2. `session_complete` is now guaranteed for time-based sessions too, not just distance-based

**What changed:** `server/ai-service.ts` — `ensureClosingStageMilestones()` already guaranteed a `session_complete` trigger exists even if OpenAI's response omitted one (a known historical gap), but the fallback only covered **distance-based** sessions (`condition: "distance >= {targetDistanceKm}"`, gated on `targetDistanceKm > 0`). A duration-only session (e.g. a time-based easy run with no fixed target distance) had **no fallback at all** — if OpenAI also skipped it, that session had zero end-of-session spoken summary. Confirmed via a real newly-generated plan: none of its non-distance sessions had a `session_complete` trigger.

Now also injects a time-based fallback (`condition: "elapsed_min >= {targetDurationMinutes}"`) whenever there's no usable target distance but a target duration exists.

**iOS action:** No integration work needed for the trigger to *exist* — this fires automatically for all clients server-side. But confirm iOS's live-coaching condition-expression evaluator actually understands **`elapsed_min` as a metric**, not just `distance`/`distance_pct`/`remaining_m`. Android's evaluator (`RunTrackingService.evaluateSingleClause`) already supports it (`elapsed_min -> getActiveRunDuration() / 60_000.0`). If iOS's evaluator only understands distance-based conditions, this newly-guaranteed trigger will now exist in the plan JSON but **silently never fire** on iOS for time-based sessions.

---

## B. Android UI/UX to replicate

### B1. Full-screen "generating" loading state, not a screen with a buried banner

**What changed:** `WorkoutDetailScreen.kt` — previously the full workout detail screen rendered immediately (header, stats, instructions, action buttons) with only a small pulsing banner ("Generating your AI coaching plan…") in the Actions section — several sections down, easy to miss, especially now that first-opens routinely take ~20-30s (A1) instead of a near-instant cache hit.

Now, while `workout.workoutType != "rest" && !isCoachingReady`, the **entire screen content is replaced** by a dedicated loading view: centered spinner, "Generating your full session" title, and a sub-line naming the workout type ("Your AI coach is building the *Hill Repeats* session — phases, pacing targets, and live coaching cues."). It swaps to the real screen once state reaches READY **or** FAILED — FAILED still reveals the full screen (with a retry banner) rather than the loader sticking forever; there's also a 120s client network timeout as a hard backstop so this can never hang indefinitely.

**iOS action:** Check what iOS currently shows when opening a workout with no cached coaching yet. If it's a blank/partial screen or an easy-to-miss indicator, add an equivalent full-screen loading state that swaps to the real content on ready-or-failed. The specific visual design doesn't need to match — the behavioral requirement is: never show a blank or half-populated screen, and never block indefinitely if generation fails.

### B2. Don't let "Start" unlock before dependent background work (audio pre-caching) is done

**What changed:** `RunSessionViewModel.kt` — the coaching plan JSON coming back (`coachingGenerationState = READY`) is not the same moment as the session being fully ready to run. Immediately after the plan arrives, a **separate**, fire-and-forget background task (`preGenerateCoachingAudio`) pre-caches Polly TTS audio for every static coaching message, so in-run cues play instantly instead of needing a live network call. This normally takes ~1-2 more seconds (confirmed via production timing logs) — but the Start / Prepare-for-Watch buttons used to unlock the instant the plan JSON arrived, before that audio finished caching. Starting in that gap meant the first coaching cue(s) fell back to a live Polly call or on-device TTS instead of the instant pre-cached audio.

Fixed by adding an `isAudioPreloading` state, `true` from just before that background task launches until it completes (success or failure), and folding it into the same gate as the coaching-ready check (button stays locked + shows the same "Preparing AI Coaching…" spinner through that tail).

**iOS action:** Check if iOS has an equivalent decoupled audio-pre-caching step for coaching cues. If so, make sure the Start action's "ready" gate waits for **both** the plan and the audio cache, not just the plan.

### B3. "Workout Structure" section must reflect the real generated plan, not a hardcoded per-type template

**What changed:** `WorkoutDetailScreen.kt` — the "Workout Structure" section used to be a fully hardcoded `when(workout.workoutType)` template (fixed strings like "Warm-up: 10 min easy (Zone 2)") shown for `intervals`/`tempo`/`fartlek`/`hill_repeats` regardless of what was actually planned or generated — completely disconnected from `session_instructions`. This produced real discrepancies: a hill-repeats session with **no warmup phase at all** in its real `session_structure.phases` still showed a fabricated "10 min warm-up" in the UI, and the AI coaching itself correctly never mentioned one (since it wasn't in the data) — making the UI look wrong/inconsistent with the actual coaching.

Now built from `runSessionViewModel.activeSessionCoachingPlan.phases` — the same `DynamicCoachingPhase[]` used to drive live coaching — showing each phase's real name, duration/distance, target pace/HR, and `phaseInstructions` text. Only renders once `isCoachingReady && phases.isNotEmpty()`; the workoutType-based gate was removed entirely since phases can exist for any session type now.

**iOS action:** Check if iOS's equivalent workout-preview screen has a similar hardcoded structure summary. If so, wire it to the real phases from the generated plan instead, so it can never show a step (warm-up or otherwise) that doesn't actually exist in that session's `session_instructions`.

---

## C. Known Android bugs — NOT fixed, flagged for independent iOS check

### C1. Live-trigger fallback text loses rep-number context (confirmed via a real hill-repeats session audit)

`RunTrackingService.kt` — every live coaching trigger call first computes a **pre-written fallback message** (`pickTriggerMessage`, used if the live OpenAI call — `getSessionTriggerLive`, 3.5s timeout — fails or times out) *before* the correctly-computed `currentRepNum`/`totalRepsNum` (derived from the resolved phase name) is available a few lines later. The fallback call never receives those values, so `pickTriggerMessage`/`resolveTemplateVariables` silently default `repNum`/`totalReps` to `1`/`1` regardless of which rep the athlete is actually on.

Audited against a real 4× hill-repeat session: **every single coaching cue** that fired that session came from this fallback path (verbatim matches to the plan's static template text, not distinctive OpenAI-generated prose) — meaning the live call failed/timed out for the whole session — and every rep announcement said "Rep 1 of 1." Recovery-phase transitions never announced at all; suspected (not fully confirmed) secondary cause: the expanded-phase-timeline's cumulative-distance bookkeeping for interleaved work/recovery reps doesn't account for real GPS distance covered during time-based recovery phases, causing later work-phase entries to be skipped by the phase-resolution scan.

**This is not fixed on Android** — flagged, not resolved, out of scope for this batch.

**iOS action:** If iOS has an equivalent local-fallback-message system for live coaching triggers (used when its own live-AI call fails/times out), check independently whether it correctly threads the real rep number / total reps / current interleaved-phase state into that fallback text. This is exactly the kind of bug that looks fine under fast/cache-hit testing conditions but only surfaces when the live call genuinely fails under real network conditions — worth testing iOS's fallback path deliberately (e.g. by simulating a timeout) rather than only testing the happy path.

### C2. Pattern to watch for: a "fire once" guard living in transient view state instead of a persistent object

Unrelated to coaching content, but a real bug worth checking for architecturally: `CoachingProgrammeScreen.kt`'s `TrainingPlanDashboardScreen` auto-opens the adaptation-review screen when pending adaptations are found, guarded by a "have I already auto-navigated" flag. That flag was a plain Compose `remember`, which is torn down and reset every time the screen is popped-and-returned-to (e.g. pushing `adaptation_review/{planId}` on top and then popping back) — while the `ViewModel` backing the pending-adaptations count is scoped more broadly and survives that same push/pop, potentially still holding a stale pre-refresh count for one frame. Net effect: tapping "View AI Coaching Plan" from the empty-adaptations state would immediately bounce the user right back into the adaptation review screen, in a loop, because the reset guard let the stale count re-trigger the auto-navigate effect. Fixed by moving the guard into the ViewModel (which genuinely persists for the "plan opening" session), not view-local state.

**iOS action:** Not asking iOS to replicate this specific bug or fix — flagging the *pattern* to check for: any iOS flow where a "should I auto-navigate / auto-trigger" guard is a `@State` (or similar view-local, transient) variable, but the underlying trigger condition is backed by a view-model/object that survives across a push-then-pop navigation. If such a flow exists, the same reset-on-return race is possible.

---

## D. Reference: not part of this batch

Walk/run activity-type coaching parity (backend `resolveActivityType`/vocabulary split, Android `activityType` field additions) was audited and fixed separately — see `iOS_WALK_RUN_ACTIVITY_TYPE_AUDIT_BRIEF.md` at repo root. Unrelated to this document but relevant context if not already actioned.
