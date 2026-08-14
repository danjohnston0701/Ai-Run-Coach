# iOS brief: in-session coaching trigger → endpoint contract (verified)

## Context

iOS proposed a table mapping its 14 in-session coaching trigger types to backend endpoints, using a `difficulty` field as the discriminator for which "type" of prompt each `pace-update` call should produce. That table was checked line-by-line against the actual Android client (`RunTrackingService.kt`, `ApiService.kt`, network model files) and the actual backend (`server/routes.ts`, `server/ai-service.ts`) — not inferred from documentation, but read directly.

**Bottom line: `difficulty` is not a trigger-type discriminator anywhere in this codebase.** It's an unrelated, pre-existing field meaning "route difficulty" (easy/moderate/hard terrain classification), used only in route-summary and pre-run-briefing prompts. The backend's `pace-update` route handler and `generatePaceUpdate()` never read it. If iOS sends `difficulty: "km_split"` etc., the server silently ignores that field — it has zero effect on which prompt logic runs.

Worse, the table also routes several trigger types to the wrong endpoint entirely — not just the wrong field name. Three of the six `pace-update` rows actually belong to two other endpoints that already exist and already work correctly on Android. This brief is the corrected, verified contract — treat it as authoritative over the original table; every row below has a file:line citation you can check yourself against the Android source if in doubt.

---

## Corrected trigger → endpoint table

| # | Trigger | Correct endpoint | Discriminator | Notes |
|---|---------|-------------------|----------------|-------|
| 1 | km-split | `pace-update` | `isSplit: true` + `splitKm`/`splitPace` | Only real `pace-update` caller in Android — see below |
| 2 | General pace nudge (target time+distance, no split) | **`phase-coaching`** (not pace-update) | `triggerType: "pace_coaching"` or `"pace_abandon"` | Wrong endpoint in original table |
| 3 | Struggle (pace/cadence drop) | **`struggle-coaching`** (not pace-update) | dedicated endpoint, no type field needed | Wrong endpoint in original table |
| 4 | First 500m check-in | **`phase-coaching`** (not pace-update) | `triggerType: "500m_checkin"` | Wrong endpoint AND wrong field name |
| 5 | Phase change / navigation turn | **`phase-coaching`** (not pace-update, not a separate "dynamic" pace-update case) | `triggerType: "phase_change"` or `"navigation_turn"` | This is what row 5 ("periodic staged coaching") was likely describing |
| 6 | Final stretch (500m/1km/100m) | **`elite-coaching`** (not pace-update) | `coachingType: "final_500m"` / `"final_100m"` | Wrong endpoint in original table — same pattern as row 11 |
| 7 | Terrain/elevation | `elevation-coaching` | `eventType: "terrain_state"` / `"gradual_climb"` etc. | Confirmed correct |
| 8 | Cadence | `cadence-coaching` | own endpoint | Confirmed correct |
| 9 | Heart rate | `hr-coaching` (not `heart-rate-coaching`) | own endpoint | Route path is `/api/coaching/hr-coaching` — minor naming correction |
| 10 | Run start | `start-run-audio` | own endpoint | Confirmed correct |
| 11 | Elite: ETA/pace trend/reinforcement/technique | `elite-coaching` | `coachingType: <type>` (explicit string) | Confirmed correct |
| 12 | Target reached | `target-reached` | own endpoint | Confirmed correct |
| 13 | Plan session trigger (dynamic coaching plan) | `session-trigger-live` | `triggerType` + `triggerId` | Confirmed correct — this is the AI-generated plan's own trigger system, unrelated to `phase-coaching`'s `triggerType` despite the same field name |
| 14 | Talk to coach | `talk-to-coach` | own endpoint | Confirmed correct |

---

## The real shape of `pace-update`

`generatePaceUpdate()` (`server/ai-service.ts:677`) has **exactly one caller** in the entire Android codebase: the km-split handler (`RunTrackingService.kt:6535`, `apiService.getPaceUpdate(update)`), fired once per completed km with `isSplit = true`. Its param interface (`server/ai-service.ts:677-732`) has no `difficulty` field and no unified type/event field at all — the message content is driven by which optional fields are present: `isSplit`, `splitKm`/`splitPace`, `paceTrendDirection`, `terrainContext`/`currentGrade`, `hasRoute`, `workoutType`, `sessionTargetPaceMin`/`Max`. Android's own request model (`app/src/main/java/live/airuncoach/airuncoach/network/model/PaceUpdate.kt`) matches this shape exactly — no `difficulty` field there either.

If iOS's rows #2, #4, #5 were built on the assumption that "everything that isn't elevation/cadence/HR/elite/target-reached/session-trigger/talk-to-coach must be `pace-update` with some `difficulty` value," that assumption is what produced this — there's a whole separate multi-purpose endpoint (`phase-coaching`) those three actually belong to.

## The real shape of `phase-coaching`

`generatePhaseCoaching()` (`server/ai-service.ts:1107`) is a **separate dedicated endpoint** (`/api/coaching/phase-coaching`) from `pace-update`, with its own `triggerType` string field (`server/ai-service.ts:1125`) driving branching logic inside the prompt (`server/ai-service.ts:1293-1670`). Confirmed values in current use, with their Android call sites:

- `"navigation_turn"` — `RunTrackingService.kt:2006`
- `"pace_coaching"` / `"pace_abandon"` — `RunTrackingService.kt:2322` (fires only when a target time + distance are both set; `pace_abandon` when the athlete has fallen far enough behind that the target is being abandoned)
- `"500m_checkin"` — `RunTrackingService.kt:4769` (one-time, at the first 0.5km mark)
- `"phase_change"` — `RunTrackingService.kt:6365`

All of these use the same `PhaseCoachingUpdate` request shape and the same `apiService.getPhaseCoaching()` call — never `getPaceUpdate()`.

## The real shape of `struggle-coaching`

Fully separate endpoint (`/api/coaching/struggle-coaching` → `generateStruggleCoaching()`). Android calls it via `apiService.getStruggleCoaching()` (`ApiService.kt:148`) from `RunTrackingService.kt:6447`, triggered by fatigue detection (`isFatigued`, a cadence-drop-based flag computed at `RunTrackingService.kt:2534`). No `pace-update` involvement.

## The real shape of final-stretch coaching

Not `pace-update`, not even its own endpoint — it's `elite-coaching`. `fireFinalCoaching("final_500m" | "final_100m", ...)` (`RunTrackingService.kt:7678`) builds an elite-coaching request and calls `fireEliteCoaching()`, which posts to `/api/coaching/elite-coaching` with `coachingType: "final_500m"` / `"final_100m"` — same mechanism as row 11's ETA/pace-trend/reinforcement/technique triggers, just different `coachingType` values.

---

## Suggested next step for the iOS side

Given three of six `pace-update` rows were actually misrouted (not just mislabeled), it's worth iOS independently re-deriving its own trigger→endpoint map directly from its own network layer (whatever iOS calls for each of these 14 cases today) and diffing that against this table, rather than assuming the original table just needs a field-name fix. If iOS is currently sending `difficulty` on `pace-update` calls for structural pace-coaching, 500m check-ins, or phase changes, those requests have been silently missing the `phase-coaching`-specific prompt logic (the `is500mCheckin`/`pace_abandon` branches at `server/ai-service.ts:1293-1670`) this whole time — worth checking what those sessions have actually sounded like.

---

## UPDATE — after reviewing iOS's actual implementation (same day)

iOS implemented the endpoint-routing fix from the table above (`isSplit` added to `PaceUpdate`, new `PhaseCoachingRequest`/`StruggleCoachingRequest` structs, 5 call sites corrected in `HomeScreens.swift`). The routing is now correct. But reading the actual `APIModels.swift`/`APIService.swift`/`HomeScreens.swift` output turned up a bigger, pre-existing problem that goes beyond this handoff — flagging it here rather than as a separate brief since it's the same investigation.

### `distanceKm` / `elapsedMinutes` vs `distance` / `elapsedTime` — affects ALL FOUR in-run coaching endpoints, not just the two new ones

Every iOS coaching request struct (`PaceUpdate`, `PhaseCoachingRequest`, `StruggleCoachingRequest`, `EliteCoachingTriggerRequest`) uses `distanceKm` (wire: `distance_km`) and `elapsedMinutes` (wire: `elapsed_minutes`). Every backend `generate*Coaching()` function reads `distance` (km) and `elapsedTime` (seconds):

- `generatePaceUpdate()` — `server/ai-service.ts:677-681` (`distance: number`, `elapsedTime: number`)
- `generatePhaseCoaching()` — `server/ai-service.ts:1107` params (`distance`, `elapsedTime` — not `distanceKm`/`elapsedMinutes`)
- `generateStruggleCoaching()` — `server/ai-service.ts:1869-1871` (`distance: number; elapsedTime: number;`)
- `generateEliteCoaching()` / `EliteCoachingParams` — `server/ai-service.ts:5286,5290` (`distance: number;` ... `elapsedTime: number; // seconds`)

This is **not a casing mismatch** the existing per-route snake_case alias blocks catch (`current_pace`→`currentPace` etc.) — the key itself is different (`distanceKm` vs `distance`), so those blocks never touch it. Net effect: **`distance` and `elapsedTime` have been arriving as `undefined` on every iOS in-run coaching call, on all four endpoints, including the two (`pace-update`, `elite-coaching`) already believed to be working correctly before today.** Anything in those prompts keyed off progress %, distance-remaining, or elapsed time was running on missing data.

**Backend fix already applied** (no iOS action needed for this part): `server/routes.ts` now has a shared `normalizeCoachingRequestBody()` helper, applied to all four routes (`pace-update`, `elite-coaching`, `phase-coaching`, `struggle-coaching`), that maps `distanceKm`/`distance_km` → `distance`, `elapsedMinutes`/`elapsed_minutes` → `elapsedTime` (×60), `totalDistanceKm`/`total_distance_km` → `targetDistance`, `targetTimeSeconds`/`target_time_seconds` → `targetTime`.

**Still worth an iOS fix**, because the server-side patch is a lossy safety net, not a real repair: `elapsedMinutes` is computed client-side as `elapsedSeconds / 60` (integer division) — by the time it reaches the server and gets multiplied back by 60, only whole-minute precision survives (e.g. an athlete at 2:45 elapsed is reported as 2:00). iOS should send raw elapsed seconds under a field the server already recognizes (`elapsedTime` / `elapsed_time`), not pre-divide into minutes.

### `phase-coaching` and `struggle-coaching` had zero alias handling — also fixed server-side, but check the payloads

Neither route had *any* snake_case alias block before today (unlike `pace-update`/`elite-coaching`/`target-reached`). Added:
- `phase-coaching`: aliases for `triggerType` (the critical one — without it, none of `generatePhaseCoaching()`'s `triggerType === '...'` branches at `server/ai-service.ts:1293-1670` would ever match, silently falling through to generic default behavior for every call), plus `currentPace`, `targetPace`, `totalElevationGain`, `currentGrade`, `cadence`, `activityType`, `runnerName`, `runnerAge`, `runnerWeight`, `runnerHeight`, `fitnessLevel`, `navigationInstruction`, `navigationDistance`.
- `struggle-coaching`: aliases for `currentPace`, `baselinePace`, `paceDropPercent`, `targetPace`, `totalElevationGain`, `currentGrade`, `cadence`, `activityType`, `runnerName`, `runnerAge`, `fitnessLevel`, `targetHeartRateZone`.

### Fields genuinely missing from the iOS structs — cannot be fixed server-side, the data isn't sent under any name

- **`StruggleCoachingRequest` has no `baselinePace` or `paceDropPercent` field at all.** These are what `generateStruggleCoaching()` needs to say *how much* the pace has dropped and from what — without them the message can't reference the actual struggle. Notably, `triggerStruggleCoaching(dropPercent: Double)` in `HomeScreens.swift` already has the drop percentage as a parameter — it's just never included when building the request. Needs both a `baselinePace: String` and `paceDropPercent: Double` field added to the struct, populated from data the caller already has (or can easily compute for baseline pace — Android's equivalent uses the session's average pace as baseline).
- **`PhaseCoachingRequest` is missing `currentGrade`, `totalElevationGain`, and `hasRoute`** — present in Android's equivalent (`PhaseCoachingUpdate`) and read by `generatePhaseCoaching()`, but absent from iOS's struct entirely.
- **`PhaseCoachingRequest` is missing `navigationInstruction`/`navigationDistance`** — required for the `"navigation_turn"` triggerType branch (`server/ai-service.ts:1293`) to say anything useful; without them that branch has nothing to reference.

None of these can be recovered by server-side aliasing since the values simply never leave the phone — they need to be added to the Swift structs and populated at the call sites that build them.
