# iOS brief: standalone (routeless "quick start") run/walk in-session live coaching parity

## Context

User report (2026-08-12): completing a routeless run on iOS, in-session coaching was "super flat and solely pace focused... just focused on my actual pace, rather than considering my avg pace as well." Android's equivalent is "amazing." This brief documents **everything** Android does for live in-session coaching on a **standalone session — no route, no AI-generated coaching plan** — so iOS can be rebuilt to parity: trigger categories, cadence/gating rules, exact endpoints, exact prompts, request/response payloads, and the pace-figure logic that's the direct subject of the complaint.

**This is a genuinely separate system from the `planned_workouts`/`session_instructions` AI coaching-plan flow** already covered by `iOS_SESSION_GENERATION_AND_COACHING_UX_BRIEF.md` and `iOS_AI_COACHING_PLAN_SESSION_BRIEF.md`. Do not conflate them — see §0.

**Likely root cause of the complaint, stated up front:** the backend prompts for every live-coaching endpoint documented below already instruct the model to cite multiple pace figures (split vs. average vs. target vs. rolling) together — the backend is not the flat part. Flatness this specific ("only current pace, nothing else") points at one or both of:
1. iOS's live-trigger requests populating only a `currentPace`-equivalent field and leaving `averagePace`/`splitPace`/`targetPace`/`kmSplits`/rolling-pace fields empty or absent — which makes the backend's multi-figure prompt logic moot even though the prompt asks for it.
2. The quick-start run having no target distance/time set — which silently disables Android's richest pace-deviation engine (§2.6/§ "phase-coaching / pace_coaching") and the milestone/target-ETA elite-coaching triggers, leaving only the always-on, single-figure `500m_checkin`/`phase_change` path active. Confirm with the user whether their test run had a target set.

**Existing iOS docs are stale for this specific surface — verify against source, don't trust them.** `iOS_IN_SESSION_COACHING_SPEC.md` documents three APIs (`talk-to-coach`, `interval-coaching`, `coaching-events`) at `https://api.airuncoach.live/v1/coaching/...`. Two problems: (a) there is no `/v1/` API prefix anywhere in `server/routes.ts` — every endpoint below is served directly off `https://airuncoach.live/api/coaching/...`, so that base URL in the existing spec is simply wrong; (b) that spec **never mentions** `pace-update`, `phase-coaching`, `struggle-coaching`, `cadence-coaching`, `elevation-coaching`, `hr-coaching`, or `elite-coaching` — which are the seven endpoints that actually drive Android's standalone-session live coaching (§2). If iOS was built against that spec, it would have implemented `talk-to-coach` (user-initiated Q&A) and `interval-coaching` (a milestone-style endpoint, see §2 footnote) but **never wired up the automatic mid-run trigger family at all**, which alone would produce exactly the "flat, pace-only" experience reported. Check what iOS's `RunTrackingService`-equivalent actually calls today before assuming any of this exists.

---

## 0. Two coaching engines share one Android file — scope of this brief

`app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (8,200+ lines) implements two entirely separate systems gated by one flag:

```kotlin
// RunTrackingService.kt:1077-1079
private val isCoachingPlanActive: Boolean
    get() = dynamicCoachingPlan != null || sessionInstructions != null
```

- **`isCoachingPlanActive == true`** → the AI-generated `planned_workouts`/`session_instructions` plan system (`fireLiveTriggerMessage`, `pickTriggerMessage`, `POST /api/coaching/session-trigger-live`, template `{hr}`/`{pace}`/`{repNum}` substitution). **Out of scope here** — already documented elsewhere.
- **`isCoachingPlanActive == false`** → the "**free run**" engine (Android's own internal name, per its design-contract comment) — fires for every quick-start/routeless run or walk. **This is the entire subject of this brief.**

Confirmed: `session-trigger-live` is only ever called from a function requiring a `DynamicSessionCoachingPlan` — a standalone session never populates that, so it never calls that endpoint. Do not build iOS parity against it for this flow.

**Important nuance for iOS implementation:** the backend functions that serve the standalone path (`generatePaceUpdate`, `generatePhaseCoaching`, `generateStruggleCoaching`, `generateCadenceCoaching`, `getElevationCoaching`, `generateHeartRateCoaching`, `generateEliteCoaching`, `generateWellnessAwarePreRunBriefing`) are **the same functions** the plan system also calls, just with plan-specific fields (`workoutType`, `trainingPlanId`, `planGoalType`, etc.) left `undefined`. There is no separate "standalone-only" backend surface — iOS can hit the exact endpoints below and simply never send those plan fields.

---

## 1. Orchestration: the trigger-selection algorithm (Android's own design contract)

This in-code comment block (`RunTrackingService.kt:1081-1213`) is the best single source of truth for *why* Android's coaching feels varied — it is effectively Android's coaching spec, quoted in full because it's short and load-bearing:

```
CONTINUOUS COACHING (free runs, walks, and Tier 2 coaching plan sessions)

GUARANTEED MILESTONES — non-negotiable, always fire:
  ✓ Run briefing (pre-run summary with weather + target)
  ✓ Run start motivation
  ✓ 500m settling check-in (one-time, first 500m of any run)
  ✓ Every 1km progress summary (runs) / every 500m summary (walks)
  ✓ Final 500m — push to finish
  ✓ Final 250m — last effort
  ✓ Final 100m — sprint cue
  ✓ Post-run analysis

DYNAMIC COACHING OPPORTUNITIES — fire between milestones, priority-ordered:
  ✓ Pace trends / Heart rate trends / Cadence / Form / Breathing / Elevation /
    Environment / Motivation / Historical comparisons / Struggle points /
    Similar runs / Coach memory / Athlete profile / Strengths / Weaknesses /
    Recovery & fatigue / Positive reinforcement / Target ETA

PRIORITY ORDER within each GPS tick (only ONE coaching event fires per tick):
  Phase change → 500m milestone / walk-500m split → HR timer →
  cadence → elite coaching (milestone → ETA → pace trend → reinforcement
  → technique/form → elevation)
```

**Mechanism:** every accepted GPS fix flows through `onNewLocation()` → `updatePaceAndStruggle()` → `checkForKmSplit()` → `checkPaceCoaching()` → `updateRunSession()`. `updateRunSession()` (`:3341`) resets a per-tick flag `hasCoachingFiredThisTick = false` at its top, and every trigger function sets it `true` the instant it wins — **only one coaching cue can fire per GPS tick**, preventing audio pile-ups. Standalone-relevant dispatch order (`:3380-3461`):

```kotlin
val inFinalStretch = isInFinalStretch()
if (!inFinalStretch) {
    checkPhaseChange(phase)                                    // phase transition cue
    if (!hasCoachingFiredThisTick) check500mMilestones()        // one-time 500m settle-in
    if (!hasCoachingFiredThisTick && canFireCoaching())
        maybeTriggerHeartRateCoaching()                          // every 3rd elapsed minute
}
if (!hasCoachingFiredThisTick && canFireCoaching())
    maybeTriggerCadenceCoaching()                                // run-only
if (!hasCoachingFiredThisTick && canFireCoaching())
    maybeFireEliteCoaching(distance, duration, avgSpeed, phase)  // milestone/ETA/trend/reinforcement/technique/elevation
```
`checkForKmSplit()` (`:3201`) and `checkPaceCoaching()` (`:2099`) run earlier in `onNewLocation()`, under the same gates.

### Global gating (applies across every trigger family)

| Constant | Value | Purpose |
|---|---|---|
| `GLOBAL_COACHING_MIN_GAP_MS` | 15,000 ms | Universal min time between ANY two coaching cues |
| `GLOBAL_COACHING_MIN_GAP_M` | 150 m | Universal min distance between ANY two coaching cues |
| `NAV_COACHING_MIN_GAP_MS` | 8,000 ms | Turn-by-turn nav audio only (shorter, time-only) |
| `COACHING_COOLDOWN_MS` | 30,000 ms | Secondary cooldown: phase-change, cadence, elite |
| `ELITE_COACHING_COOLDOWN_MS` | 45,000 ms | Elite-coaching-specific |
| `PACE_COOLDOWN_MS` | 45,000 ms | Goal-pace coaching |
| `PACE_EARLY/MID/LATE_INTERVAL_M` | 300 / 750 / 500 m | Pace-check distance interval by run phase |
| `STRUGGLE_COOLDOWN_MS` | 120,000 ms | Struggle cue |
| `HR_COOLDOWN_MS` | 180,000 ms | HR-zone cue (also gated to every 3rd elapsed minute) |
| `ELEVATION_COOLDOWN_MS` | 180,000 ms | Terrain standalone cue |
| `ELEVATION_INSIGHT_COOLDOWN_MS` | 120,000 ms | Elite-coaching elevation-insight (shares with above) |
| `TECHNIQUE_INTERVAL_MS` | 300,000 ms | Technique/form cue |
| `CADENCE_MIN_DISTANCE_M` / `CADENCE_REPEAT_DISTANCE_M` / `CADENCE_WINDOW_DISTANCE_M` | 1,000 / 2,000 / 10,000 m | Cadence distance gating |
| `CADENCE_MAX_PER_10KM` | 3 | Hard cap on cadence cues per 10km |
| `KM_SPLIT_EXCLUSION_ZONE_M` | 200 m | Suppresses pace-coaching near km boundaries |
| `FINAL_STRETCH_METERS` | 500 m | Suppresses all non-motivational coaching in the final push |

`canFireCoaching()` (`:4577`) enforces the global 15s/150m floor on top of whatever category-specific cooldown a trigger also checks.

---

## 2. Complete endpoint inventory (standalone sessions)

All under `https://airuncoach.live` (production) — no `/v1/` prefix. Client declarations in `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt:129-193`. All return `{ message, audio, format }` (base64 mp3, Polly/OpenAI TTS) unless noted.

| # | Endpoint | Fires from (Android detector) | Backend fn (`server/ai-service.ts`) | Requires target set? |
|---|---|---|---|---|
| 1 | `POST /api/coaching/pre-run-briefing-audio` | Pre-session, run | `generateWellnessAwarePreRunBriefing` | No |
| 2 | `POST /api/coaching/pre-walk-briefing-audio` | Pre-session, walk | `generateWellnessAwarePreRunBriefing` | No |
| 3 | `POST /api/coaching/start-run-audio` | Session start, run (text generated **client-side**; server does TTS only) | — (Polly TTS only) | No |
| 4 | `POST /api/coaching/start-walk-audio` | Session start, walk | — (Polly TTS only) | No |
| 5 | `POST /api/coaching/pace-update` | Km / 500m split | `generatePaceUpdate` | No |
| 6 | `POST api/coaching/phase-coaching` (note: client's `@POST` value has no leading `/`; harmless — resolves identically against a path-less base URL, but worth normalizing if iOS mirrors this literally) | 500m check-in, phase transition, goal-pace deviation, nav turn | `generatePhaseCoaching` | Only the `pace_coaching`/`pace_abandon` sub-branch (needs both targetDistance + targetTime); `phase_change`/`500m_checkin` do not |
| 7 | `POST /api/coaching/struggle-coaching` | Sudden pace drop vs. baseline | `generateStruggleCoaching` | No |
| 8 | `POST /api/coaching/cadence-coaching` | Cadence check (run only) | `generateCadenceCoaching` | No |
| 9 | `POST /api/coaching/elevation-coaching` | Terrain/hill state change | `getElevationCoaching` | No |
| 10 | `POST /api/coaching/hr-coaching` | HR-zone timer (every 3rd min) | `generateHeartRateCoaching` | No |
| 11 | `POST /api/coaching/elite-coaching` | Milestone/ETA/pace-trend/reinforcement/technique/final-stretch | `generateEliteCoaching` | `milestone`/`target_eta` sub-types only |

Not part of the standalone path (plan-only — exclude from this parity effort): `POST /api/coaching/session-trigger-live`, `POST /api/coaching/interval-coaching` (fired only for structured interval workouts — "always treated as a milestone," `routes.ts:11851-11856`), `POST /api/workouts/{id}/prepare-coaching`, anything through `routes-session-coaching.ts` / `session-enrichment-service.ts`.

Also present but not deep-dived for this brief (flag for follow-up if needed): `POST /api/coaching/talk-to-coach` (user-initiated mid-run Q&A — already has its own doc, `iOS_TALK_TO_COACH_BRIEF.md`), `POST /api/coaching/batch-tts` (audio pre-caching), post-run analysis endpoint(s) (`POST /api/coaching/run-analysis` → `generateComprehensiveRunAnalysis`, `ai-service.ts:4211`, 600+ lines, out of scope — this brief is in-session only).

---

## 3. Trigger catalogue — every category, its cadence, and its payload

Format: **[fires when] → [endpoint] → [key fields sent] → [pace figures included]**.

### 3.1 Pre-run/pre-walk briefing (once, before Start)
Endpoint #1/#2. Request (`PreRunBriefingRequest.kt`): start GPS location, weather (temp/condition/wind), Garmin wellness (sleep/body-battery/stress/HRV/resting-HR/readiness — **see hard policy below**), `hasRoute`, `activityType`, `targetTime`, `targetPace`, coach personality. Response: `{ briefing, intensityAdvice, weatherAdvice, warnings[], readinessInsight, audio, format, voice, text }`.

**Prompt** (`generateWellnessAwarePreRunBriefing`, `server/ai-service.ts:3275-3512`), standalone (`hasRoute=false`, no training plan) branch:
```
1. "briefing": 2-3 SENTENCES (max 40 words) for a free-form run. Lead with distance
   ${targetPace ? 'and target pace' : ''}, mention weather and how it might affect you.
   ${wellnessContext ? 'Include your readiness status.' : ''} Be conversational.
2. "intensityAdvice": ONE sentence (≤15 words) about pace, effort, and listening to your body today.
3. "weatherAdvice": ONE sentence (≤15 words) on how conditions will impact the walk/run.
4. "warnings": Array of warnings based on weather or route conditions. Empty if none.
5. "readinessInsight": ONE sentence (≤15 words). What will make this run rewarding today.
```
**No-target rule (recently fixed 2026-08-12, pending Replit redeploy as of this writing — verify it's live before treating this as production behavior):**
```
${!targetPace ? `- CRITICAL: This ${activityLabel} has NO target pace or target time set by the
${runner/walker}. Do NOT state, suggest, or imply any specific pace figure (e.g. "aim for 6:30/km")
anywhere in your response — not even by reusing their historical/recent average pace from the runner
profile as if it were a target for this session. Reference effort or feel instead.` : ''}
```
**No-terrain rule** (routeless sessions never mention hills/elevation): `For runs marked "(No planned route)" — do NOT mention terrain, elevation, hills, or route characteristics.`
**Hard policy — do not violate on iOS:** Garmin Connect wellness fields (body battery, sleep score, HRV, stress, resting HR, readiness) are **intentionally excluded from the OpenAI prompt** (`wellnessContext` always `''`, `ai-service.ts:3387-3398`, explicit do-not-remove comment). Only companion-watch **live in-run** streamed data (GPS/HR/pace/cadence during the run itself) may reach the model. Model: `gpt-4o-mini`, `max_tokens: 600`, `temperature: 0.7`.

### 3.2 Start-of-session motivational cue
Fired at session start (`fireStartCoaching()`, `:7153`). **Text is generated client-side for standalone sessions**, not by the LLM: `generateStartPromptByTone(tone)` (`:7222-7306`) picks a random phrase from a bank keyed by the user's `coachTone` preference (`technical`/`calm`/`motivational`/`playful`/default `encouraging`), each tone with **5 run-worded + 5 separately-worded walk phrases** (10 lists total, e.g. motivational-run: *"This is your moment — let's crush it!"*; motivational-walk: *"...let's make it count!"*). That text is then sent to endpoint #3/#4 purely for Polly TTS synthesis in the user's chosen coach voice — **the copy itself is never an LLM call** for a standalone session.

**True fallback bank** (only if the tone-based path throws): `fireStartCoachingFallback()` (`:7314-7472`) — 10 labeled categories (*Action & Energy, Confidence, Rhythm & Form, Mindset, Encouragement, Fun & Joy, Challenge, Simplicity, Nature & Body, Memory & Pride*) × 5 run-phrases + 5 walk-phrases = 100 hardcoded lines, `.random()`-selected.

### 3.3 500m settling check-in — one-time (`check500mMilestones()`, `:4640`)
Fires once, first crossing of 500m total distance. Endpoint #6, `triggerType = "500m_checkin"`. Sends **freshly recomputed overall average pace** (`elapsedSec/distKm`, NOT the smoothed instantaneous value — `formatPace(...)`, `:4668-4675`), `targetPace` only if the user set a goal, `heartRate`, `cadence`, `currentGrade`, `totalElevationGain`. No local text fallback on API failure — the cue is silently skipped for that tick (logged, not spoken).

### 3.4 Phase-change cue (`checkPhaseChange(newPhase)`, `:6238`)
`CoachingPhase` enum: `EARLY, MID, LATE, FINAL, GENERIC`. With a target distance set, thresholds are percent-based (EARLY ≤10%, MID 40-50%, LATE ≥75%, FINAL ≥90%). **Free-run fallback (no target distance)** uses absolute distance instead: `<3km EARLY, <6km MID, <8km GENERIC, ≥8km LATE`. Fires only on a genuine transition (skips the initial `null→EARLY`). Same endpoint/payload pattern as §3.3, `triggerType = "phase_change"`, plus an explicit `hasTarget: Boolean` flag so the model is never handed target context to compare against unless the user actually set one.

### 3.5 Km-split (run) / 500m-split (walk) coaching — `checkForKmSplit()` (`:3201`) → `triggerKmSplitCoaching()` (`:6395`)
**Run cadence:** every `coachingFeaturePrefs.kmSplitIntervalKm` (user-configurable 1/2/3/5/10km). **Walk cadence:** every **500m** instead of 1km — explicit code comment: *"Walkers move at ~8–15 min/km — a 1km split interval means 8–15 minutes of silence."* Suppressed in the final 500m and once target distance is reached; if the exact split-crossing tick is on cooldown, the split queues (`pendingKmSplitCoaching`) and retries next tick rather than being dropped.

**This is the single clearest evidence trigger for the pace-figure complaint** — endpoint #5, payload (`PaceUpdate.kt`):
```kotlin
val overallAvgPaceStr = formatPace(elapsedSec / distKm)   // whole-run AVERAGE pace
val targetPaceStr = formatPace(totalSec / tDistKm)          // user's goal pace, if set
PaceUpdate(
    currentPace = overallAvgPaceStr,   // NOTE: "current" field carries the AVERAGE pace here
    isSplit = true, splitKm = split.km, splitPace = split.pace,   // this split's own pace
    targetPace = targetPaceStr, averagePace = overallAvgPaceStr,  // duplicate explicit field
    cadence = ..., heartRate = ..., kmSplits = splitsForBackend,  // full split history so far
    routeIntelligence = ..., activityType = currentActivityType,
)
```
**Prompt** (`paceUpdatePrompt`, `server/coaching-prompts-run.ts:56-97` run / `coaching-prompts-walk.ts:33-74` walk):
```
The runner just completed kilometer ${splitKm} with a split pace of ${spokenSplitPace}.
- Overall progress: ${distance} of ${targetDistance} (${progress}%)
- Time elapsed: ${timeFormatted}
- Overall average pace: ${spokenCurrentPace}
- This split pace: ${spokenSplitPace}${targetPace line}${hrContext}${cadenceContext}
${splitTargetVerdict}
${terrainContext}${paceTrend}
Give a brief (1-2 sentences) split update. You MUST mention their SPLIT pace (${spokenSplitPace}) and
[whether on track for target | how split compares to session target | pace trend].
```
`splitTargetVerdict` (`ai-service.ts:839-856`) pre-computes a BEHIND/AHEAD/ON-TARGET classification (>20s/km diff = behind/ahead, else on target) so the LLM doesn't have to do arithmetic. `paceTrend` compares the last two splits to each other. **Average pace, split pace, and (if set) target pace are always sent together and the model is explicitly required to cite the split figure at minimum, plus at least one comparison.** Model: `gpt-4o-mini`, `max_tokens: 110`, `temperature: 0.75`.

### 3.6 Goal-pace deviation coaching (`checkPaceCoaching()`, `:2099` → `triggerPaceCoaching`, `:2270`)
**This is Android's richest pace-figure trigger — and it is gated behind the user having set BOTH a target distance AND target time.** `initPaceCoaching()` (`:2059`) requires both (`val tDist = targetDistance ?: return`, `val tTime = targetTime ?: return`) and is **explicitly suppressed whenever `isCoachingPlanActive`** ("the session plan manages effort... suppress the generic pace engine to prevent conflicting cues"). **If a standalone session has no target set at all, this trigger never fires — the runner only gets §3.3/§3.4's flatter single-average-figure cues.** This is very likely relevant to the user's complaint if their test run had no goal time set.

Smart cadence: every 300m (first km) / 750m (mid-run) / 500m (final 20%), 45s cooldown floor, suppressed within 200m of a km boundary and in the final 100m.

Computes **both**: overall average pace AND a **rolling pace over just the last 500m** (`calculateRollingPace(500.0)`, `:2242-2264`) — lets the message distinguish "behind overall" from "but speeding back up recently." Pace zones: `way_too_fast` (>15% faster) / `too_fast` (10-15%) / `on_pace` (±10%) / `too_slow` (10-25% slower) / `way_too_slow` (>25%). If projected finish stays >25% over target for 3 consecutive checks, the target is abandoned (`paceTargetAbandoned = true`) and a one-time "target abandoned" message fires instead of repeated nagging.

Endpoint #6, `triggerType = "pace_coaching"`/`"pace_abandon"`, comment at `:2300`: *"Use actual avg pace, not GPS instant pace."* Backend (`generatePhaseCoaching`, `ai-service.ts:1230+`) computes named-zone guidance strings, e.g.:
```
paceZone = 'WAY TOO FAST';
paceGuidance = "The runner is going X% FASTER than their target pace. This is a common mistake — going
out too fast leads to fatigue later. STRONGLY advise them to slow down NOW. Their current pace is
${avgPaceFormatted}/km but they need ${targetPaceFormatted}/km."
```
Prompt (`paceCoachingPrompt`, `coaching-prompts-run.ts:232-260`):
```
PACE COACHING
The runner is ${progressPercent}% through their ${target}, having covered ${distanceFormatted}.
- Average pace: ${avgPaceFormatted}/km
- Target pace: ${targetPaceFormatted}/km
- Recent pace (last 500m): ${rollingPaceFormatted}/km
${gradientContext}${trendContext}${plateauContext || paceGuidance}
Give 2-3 sentences of pace coaching. Be specific about the numbers.
```

### 3.7 Struggle detection (`updatePaceAndStruggle()`, `:3142` → `triggerStruggleCoaching()`, `:6321`)
Baseline pace updates every 500m after the first 1km. Struggle = smoothed pace (last ~8-16s of points) dropping vs. baseline by a **personalized threshold**: advanced/elite 18%, intermediate 25%, beginner 35% (+10% extra tolerance on steep uphill). Fully suppressed for `isCoachingPlanActive` sessions and for low-experience runners (<30 runs, beginner/newcomer/casual fitness level) to avoid discouraging newcomers. 2-min cooldown. Endpoint #7, sends `currentPace` (instantaneous) **and** `baselinePace` (the reference being deviated from), `paceDropPercent`. Prompt requires citing at least one specific number. Zone-1/2 HR-target guard: if `targetHeartRateZone <= 2`, skips OpenAI and returns a canned aerobic-base message.

### 3.8 Heart-rate zone coaching (`maybeTriggerHeartRateCoaching()`, `:6680`)
Every 3rd elapsed minute, gated on 5 stable consecutive readings (`isHRReadingConfident()`), 3-min cooldown. Max HR via **Tanaka formula** (`208 - 0.7×age`, not generic 220-age), 190 fallback if age unknown. Endpoint #10, sends `currentHR`, `avgHR` (session running average), `maxHR`, `targetZone`, terrain context (distinguishes "HR high because of a climb" from unexplained elevation), physiological delta since last cue, session-memory anti-repetition fields.

### 3.9 Cadence coaching (`maybeTriggerCadenceCoaching()`, `:6779`) — **run only**
Explicitly returns early for `currentActivityType == "walk"` — comment: *"traditional cadence coaching is not appropriate for walking... cadence is still recorded and sent as context... but standalone 'your cadence is X spm' messages are suppressed."* Cadence data still flows into other walk requests as `cadenceRole = "context_only"` vs. `"primary_metric"` for runs — labeled in Android source as *"matching iOS WALKING_COACHING_SPEC"*, implying an existing partial iOS contract for this field worth cross-checking (`iOS_WALKING_SESSION_IMPLEMENTATION_BRIEF.md`).

Personalized target cadence formula factors speed, height, age, terrain gradient (not a fixed 180spm target). Rate limits: max 3 cues per rolling 10km, min 1000m between cues, re-fires if pace shifts >0.5 m/s or after 2000m of sustained non-optimal cadence. Endpoint #8.

### 3.10 Elite coaching family (`maybeFireEliteCoaching()`, `:6979`) — richest/most varied category
Priority-ordered sub-dispatcher (`:7019-7027`):
```kotlin
when {
    shouldTriggerMilestone(distKm)                -> fireMilestoneCoaching(...)          // 25/50/75% of target
    shouldTriggerTargetEta(currentKm,...)         -> fireTargetEtaCoaching(...)           // every 2km, needs targetTime
    shouldTriggerPaceTrend(currentKm)             -> firePaceTrendCoaching(...)           // every 2km from km3+
    shouldTriggerPositiveReinforcement(currentKm) -> firePositiveReinforcementCoaching(...) // consistency/neg-split
    shouldTriggerTechnique(now)                   -> fireTechniqueCoaching(...)            // ~every 5 min
    shouldTriggerElevationInsight(now)            -> fireElevationInsightCoaching(...)     // grade >3%, route-gated
}
```
All hit endpoint #11 (`generateEliteCoaching`, `ai-service.ts:5249-5815`). `coachingType` values (the trigger-category enum): `technique_form | milestone | positive_reinforcement | target_eta | pace_trend | elevation_insight | heart_rate_check | final_500m | final_100m`.

**Status block sent for every sub-type** (`ai-service.ts:5296-5301`) — again both figures, always:
```
${Walker/Runner} Status:
- Distance: ${distance} of ${targetDistance} (${progress}%) — ${remaining} remaining
- Time: ${timeMin} minutes
- Current pace: ${spokenPace}
- Average pace: ${spokenAvgPace}
```
- **Milestone** — fires once at 25/50/75% of target distance, requires `targetDistance`, suppressed within 200-800m of a km split to avoid overlap.
- **Target ETA** — every even km once `targetTime` is set, sends `projectedFinishTime`, classifies BEHIND/AHEAD/ON TARGET.
- **Pace trend** — `detectPaceTrend()` (`:7110`) compares last 3-4 km splits → `("slowing"|"speeding_up"|"consistent", avgDeltaSecPerKm, isNegativeSplitting)`. Prompt: *"TREND DETECTED: Pace is GRADUALLY DRIFTING SLOWER — approximately Xs/km per kilometer... Acknowledge the gradual slowdown without alarming them, give a specific technique cue to arrest the fade, remind them of their target or what good pacing looks like. Reference their actual split data."*
- **Positive reinforcement** — `detectPositiveRunning()` (`:7091`) detects consistency (splits within 10s of each other) or negative splitting, reports `consecutiveConsistentSplits`, `fastestSplitKm/Pace`.
- **Technique/form** — context-aware category selection (`selectTechniqueCategory`, `:7789`): hill-specific if on a >3% grade, mental/recovery categories if fatigued or in LATE/FINAL phase, "fundamentals" (posture/breathing/arms/feet/hips/knees) if EARLY phase, else rotates through unused categories from a **34-entry technique-hint map**, never repeating within a run and persisting the last 5 across runs via `SharedPreferences` ("coaching_technique_memory") so the same tip doesn't repeat run after run.
- **Elevation insight** — only if `hasRoute` and grade >3% (never fires for a genuinely routeless session with no elevation data at all).

Walk-session policy injected on every elite-coaching call (`ai-service.ts:5292-5294`):
```
WALK SESSION POLICY: This is a WALKING session. Use "walker/walking" vocabulary, NOT "runner/running".
NEVER mention cadence targets, spm, steps per minute, or suggest the walker "increase their turnover".
Cadence is available as context only. Focus on: movement quality, posture, arm swing, rhythm, aerobic
effort, HR zones, and enjoyment. Heart rate coaching is MORE valuable than pace coaching for most walkers.
```
Model: `gpt-4o-mini`, `max_tokens: 160`, `temperature: 0.75`.

### 3.11 Elevation/terrain state machine (`updateElevationCoaching()`, `:7951` → `triggerElevationCoaching()`, `:8072`)
Separate from §3.10's elevation-insight sub-type. Classifies live terrain into `flat | gradual_climb | steep_climb | gradual_descent | steep_descent | rolling` via a sustained-direction filter (150m minimum before a direction "counts") plus a 1km rolling window for genuinely rolling terrain. Fires for: rolling terrain (max once/2km), sustained climbs (≥10m gain), sustained descents (≥10m loss), and a special `downhill_finish` cue when descending within the last 1km of target distance. Endpoint #9. `ElevationCoachingRequest` carries `has_route_elevation_ahead` — the backend **must not** predict future terrain ("the top is coming") when this is false, which is always the case for a routeless session with no lookahead data.

### 3.12 Final-stretch cues (`fireFinalCoaching()`, `:7609`, dispatched from within §3.10's function)
Three one-time, priority-bypassing cues — **final 100m** (highest priority, bypasses all cooldowns), **final 250m**, **final 500m** — each fires exactly once. `isInFinalStretch()` (`:2363`, `FINAL_STRETCH_METERS = 500.0`) gates out every other coaching category once inside the last 500m — only motivation/finishing coaching fires there. If a routeless run has no explicit target distance (e.g. watch-initiated), `maybeInferTargetDistance()` (`:4631`) infers a likely target from common race distances (1K/2K/3K/5K/10K/15K/half/marathon) once the runner passes 85% of that distance, so final-stretch coaching still fires for "I'll just run and see" sessions. `fireFinalCoaching` computes a `targetTimeCategory` (`on_track`/`strong_effort`/`no_mention`) so the model knows whether it's appropriate to reference the time goal in the final push at all.

---

## 4. Pace-figure reconciliation — the crux of the complaint

Android maintains **four** distinct pace representations, sent in different combinations depending on trigger:

| Figure | Computed as | Where | Used by |
|---|---|---|---|
| **Instantaneous/current** | Smoothed rolling average over last ~8 GPS points (~8-16s), capped at 900s/km | `onNewLocation()`, `:2976-3009` | UI live display; struggle-cue "current pace"; elite-coaching's `currentPace` field |
| **Overall average** | `elapsedSeconds / (totalDistance/1000)`, recomputed fresh at every trigger call (never read off the smoothed instant value) | Recomputed independently at each of: `:2140`, `:4668-4675`, `:6264-6271`, `:6408-6409`, `:7506` | 500m check-in, phase-change, km-split (sent as BOTH `currentPace` and `averagePace`), all elite-coaching sub-types, pace-coaching deviation math |
| **Rolling (trend) pace** | `calculateRollingPace(500.0)` — pace over just the last 500m of GPS points | `:2242-2264`, pace-coaching only | Distinguishes "behind overall average" from "but currently speeding back up" |
| **Split pace** | Delta time / delta distance since the last split boundary (km or 500m) | `checkForKmSplit()`, `:3250-3264` | Km-split cue's `splitPace`, sent alongside `averagePace`/`targetPace` in the same request |
| **Target/goal pace** | `targetTime / targetDistance` | `initPaceCoaching()`, `:2059-2091` | Sent (only if set) in km-split, phase-change, cadence, elite-coaching, pace-coaching requests, compared against every other figure |

**With the sole exception of the raw UI number and the struggle-cue snapshot, every backend coaching call explicitly recomputes and sends the whole-run average pace as context — never just the smoothed instant value** — and multiple call sites have an explicit code comment enforcing this (`ai-service.ts` pace-coaching path: *"Use actual avg pace, not GPS instant pace"*). The km-split and elite-coaching payloads additionally always carry **both** average pace and the specific split/current pace **together**, which is structurally what lets the model say "that km was faster than your average" — a comparison that is impossible if only one pace figure is ever transmitted.

Backend's own directive hierarchy for *which* signal should drive tone (`getPaceContextDirective()`, `ai-service.ts:313-387`, shared by run/walk pace-update prompts), quoted in full:
```
Priority order:
1. HR Zone (personalized by max HR, never overridden)
2. Target pace deviation (when session has a target)
3. Personal pace benchmarks from runner profile (not population averages)
4. No data → no directive (silence is better than wrong assumption)
```
Signal 1 always wins when present: *"Pace is secondary — it should feel consistent with the heart rate zone. If pace and HR diverge, trust the HR reading as the more accurate signal."* Signal 4 deliberately returns no directive rather than guessing — *"A wrong assumption is worse than silence."* **For a target-less, HR-less, profile-thin quick start, this directive contributes nothing** — consistent with flatter coaching specifically in that minimal-data configuration, independent of any iOS bug.

**Bottom line for the iOS rebuild:** populate `averagePace` (freshly computed, not reused from the instant value), `splitPace`, `targetPace` (when set), and `kmSplits`/rolling-window data on every live-coaching request that Android does (§3.5, §3.6, §3.10 especially) — the backend prompts already know what to do with them. Also verify the iOS quick-start flow actually captures/sends `targetDistance` + `targetTime` when the user sets them, since omitting either silently disables §3.6 and the milestone/ETA parts of §3.10 entirely.

---

## 5. Run vs. walk vocabulary branching

`currentActivityType` (`"run"`/`"walk"`) is threaded through every request shown above as `activityType`, and the backend prompt files are **physically forked**, not template+ternary: `server/coaching-prompts-run.ts` vs. `server/coaching-prompts-walk.ts` for pace-update/struggle/phase-coaching/cadence/elevation/HR/summary. (Separately, `iOS_WALK_RUN_ACTIVITY_TYPE_AUDIT_BRIEF.md` documents this fork and the `activityType`-vs-`sessionType` field-naming nuance in full — consult it for the exact request-contract checklist; not repeated here.)

Client-side (Android) structural differences by activity type, beyond wording:
- Split cadence: 1km (run) vs. 500m (walk) — §3.5.
- Cadence coaching (§3.9) fully suppressed for walks; cadence numbers still flow as context-only fields elsewhere.
- Separate start-audio and pre-briefing endpoints per activity type (not just a shared endpoint with a body flag) — §2 rows 1-4.
- Elite-coaching's walk-session policy (§3.10) explicitly forbids cadence/turnover language and elevates HR-zone coaching's relative importance for walks.

---

## 6. Local (non-network) fallback text — exhaustive list

Only two fallback banks exist client-side in the standalone path:
1. **Tone-based start prompt** (§3.2, primary local generator, not a failure fallback) — 5 tones × (5 run + 5 walk) = 50 phrases.
2. **Start-coaching failure fallback** (§3.2) — 10 categories × (5 run + 5 walk) = 100 phrases.

Every other trigger (§3.3–§3.12) has **no local text fallback** — on API failure it's logged (`Log.e`) and the cue is simply skipped for that tick; the next opportunity (next tick / next split / next phase) tries again. The pre-run briefing (§3.1) does have a plain-text fallback on timeout/exception: `"Ready to Run! Tap Start when you're ready."` / `"Ready to Walk! ..."`.

---

## 7. TTS / audio delivery layer

`utils/CoachingAudioQueue.kt` — single app-wide singleton, shared by pre-run briefing and all in-run coaching:
- Strictly serial playback (`AtomicBoolean isPlaying` gate, `ConcurrentLinkedQueue`) — only one item plays at a time.
- **Navigation audio can interrupt** any currently-playing coaching cue (clears queue of non-nav items, stops playback, jumps nav to front). Regular coaching audio has no such override — it always waits its turn.
- Playback source priority: pre-generated Polly/OpenAI TTS (`base64Audio`+`format`) if present, else on-device TTS using the user's configured accent/gender.
- Stuck-state watchdog: force-resets if any item holds the playing lock >75s (covers slow briefings up to ~45s).
- `AbbreviationExpander.expandForSpeech()` for on-device TTS (e.g. "bpm" → "beats per minute"); `cleanCoachingMessage()` normalizes pace-difference phrasing/raw time strings before display or speech.

The cooldown table in §1 decides *when* to enqueue; the queue itself only handles serial playback + the stuck-watchdog safety net, not additional throttling.

---

## 8. Domain models / trigger-category enum

No unified backend enum exists for standalone trigger categories — they're loosely-typed strings matched via `switch`:
- `phase-coaching`'s `triggerType`: `navigation_turn | pace_coaching | pace_abandon | phase_change | 500m_checkin`
- `elite-coaching`'s `coachingType`: `technique_form | milestone | positive_reinforcement | target_eta | pace_trend | elevation_insight | heart_rate_check | final_500m | final_100m`

Android's own `domain/model/CoachingPhase.kt` (`EARLY|MID|LATE|FINAL|GENERIC`) is the only proper enum in this path. `domain/model/CoachingContext.kt` and `domain/model/SessionCoaching.kt` exist in the codebase but are **not used by the standalone engine** — `CoachingContext` isn't referenced anywhere in `RunTrackingService.kt` (likely a general-purpose/legacy struct used elsewhere), and `SessionCoaching`/`SessionCoachingPhase`/`CoachingTrigger` are exclusively part of the out-of-scope plan system. Don't build iOS's standalone models around either.

For iOS, treat the two string lists above as the authoritative standalone-session category set and turn them into a proper Swift enum — that's a genuine improvement Android itself lacks.

---

## 9. iOS implementation checklist

1. Verify current iOS behavior first (per project convention — don't assume, read the actual iOS source): which of the 11 endpoints in §2 does iOS currently call at all? If iOS was built off the stale `iOS_IN_SESSION_COACHING_SPEC.md`, likely only `talk-to-coach` exists and none of §3.3–§3.12's automatic triggers do.
2. Implement the per-tick "one cue only" + global 15s/150m gate (§1) before anything else — without it, wiring up all 10 trigger families will produce audio pile-ups, not variety.
3. Implement each trigger family from §3 with its own cadence/cooldown rule — this is what produces perceived variety, not any single endpoint.
4. On every live-coaching request, populate average pace (freshly computed, not the instant value), split pace, target pace (if set), and split history — per §4, this is likely the single highest-leverage fix for the specific "flat, current-pace-only" complaint.
5. Confirm the quick-start flow captures and forwards `targetDistance`/`targetTime` when the user sets them — without both, §3.6 (the richest pace-deviation engine) and part of §3.10 (milestone/ETA) never activate, on Android either.
6. Thread `activityType` through every request and confirm walk sessions get the walk-specific prompt fork (§5) — cross-check `iOS_WALK_RUN_ACTIVITY_TYPE_AUDIT_BRIEF.md`'s request-contract checklist.
7. Do not port `session-trigger-live`/`interval-coaching`/anything in `routes-session-coaching.ts` — those belong to the separate AI coaching-plan system.
8. File a correction/update to `iOS_IN_SESSION_COACHING_SPEC.md` once iOS work here lands, since its endpoint list and base URL are currently stale relative to what's actually served — future agents will otherwise repeat this same discovery.
