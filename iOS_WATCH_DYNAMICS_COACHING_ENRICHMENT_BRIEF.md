# iOS: wire watch running-dynamics into live coaching prompts

Date: 2026-09-04. Companion to `iOS_GARMIN_INTEGRATION_BRIEF.md` / `iOS_COACHING_TRIGGER_ENDPOINT_CONTRACT_BRIEF.md` / `iOS_API_CASING_CONTRACT_BRIEF.md` — read those first if you haven't touched the Garmin/coaching pipeline before.

## What changed server-side and on Android

`POST /api/coaching/pace-update` (`server/ai-service.ts:generatePaceUpdate`, called from Android's km-split/walk-checkin handler) now accepts an optional `garminCompanionSessionId` field. When present, the route looks up the most recent row in `garminRealtimeData` for that session (only if it's < 10s old — a stale row from a watch that's gone quiet is deliberately ignored) and merges its running-dynamics fields (ground contact time, vertical oscillation, stride length, running power) into the coaching prompt as plain factual context — the AI decides if/how to reference them, same philosophy as the existing cadence context. **If the field is absent, nothing changes** — this was built specifically so a phone-only run (no watch, or a watch that isn't Garmin/Wear-companion-based) gets the byte-for-byte identical prompt it got before this existed.

Android change: `PaceUpdate.kt` gained `garminCompanionSessionId: String?`, populated from `GarminWatchManager.activeCompanionSessionId` / `SamsungWatchManager.activeCompanionSessionId` (whichever brand is paired) at the call site in `RunTrackingService.kt` (`triggerKmSplitCoaching()`).

Server accepts the field as either `garminCompanionSessionId` (camelCase) or `garmin_companion_session_id` (snake_case) — added to the existing alias map at `server/routes.ts`'s `/api/coaching/pace-update` handler, so iOS doesn't need to match Android's exact casing (see `iOS_API_CASING_CONTRACT_BRIEF.md` for why that alias pattern exists at all).

## What iOS needs to do

iOS's own `PaceUpdate` Swift struct (per `iOS_COACHING_TRIGGER_ENDPOINT_CONTRACT_BRIEF.md`, this is the request iOS's km-split handler already sends to `pace-update`) needs one new optional field: the companion session ID, sent as `garmin_companion_session_id`.

You already have this value available — `iOS_GARMIN_INTEGRATION_BRIEF.md` shows `pollLiveMetrics(sessionId:)` and `sendCoachingCue(sessionId:)` already using a `sessionId` string elsewhere in the Garmin integration (likely owned by `GarminLiveSessionManager.swift`, per that file's mention in the `/api/live-session/metrics` route comment). Whatever holds that session ID today is the same value to thread into the `pace-update` request struct.

**That's the only iOS change needed for Garmin-watch users.** The enrichment itself (the DB lookup, the prompt-building) is entirely server-side and platform-agnostic — it doesn't care whether the request came from Android, iOS, or Wear OS, only that a valid, fresh `garminCompanionSessionId` is present.

## On "Apple Watch" specifically

This repo has no native watchOS companion app — as far as I can find, iOS's only watch integration today is the same Garmin Connect IQ ecosystem Android uses (a paired Garmin watch talking to the iPhone), not a genuine Apple Watch app. If a real watchOS companion is wanted, that's a separate, much larger project (a new watchOS target, its own HealthKit-based data pipeline, its own realtime-data table or reuse of `garminRealtimeData` with a new `source` value) — flag this back if that's actually what's intended, since "iOS Apple Watch" in the original request could reasonably mean either "iOS phone + Garmin watch" (this brief) or "genuine Apple Watch app" (not built yet, not touched here).

## Not done this round (natural follow-up, same mechanism)

`/api/coaching/session-trigger-live` (interval/plan-triggered live coaching, `generateSessionTriggerMessage()` in `ai-service.ts`) has a different, less structured params shape and wasn't reviewed carefully enough this round to extend safely. Same enrichment lookup could be reused there later if wanted — flag it if training-plan interval sessions should get the same treatment as km-split/checkpoint coaching.
