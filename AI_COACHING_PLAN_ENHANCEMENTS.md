# AI Coaching Plan — Architecture & Enhancement Guide

> **Purpose**: This document is the single source of truth for how AI training plan generation works. Every future change to plan generation must follow this architecture. Read this before making any prompt edits.

---

## Why This Document Exists

The training plan prompt went through multiple cycles of patches that broke each other:
- Fix ultra marathon → broke other goals
- Fix 5km sub-20 pace → broke distance plans
- Fix half marathon long runs → added hardcoded percentages that conflicted with custom distances
- Each AI agent worked independently and introduced contradictions

This created a fragile mess. This document captures the correct architecture so every future change **builds on** the same concept rather than undermining it.

---

## Core Design Principle

> **Trust GPT-4's training science knowledge. Give it context — don't give it rules.**

GPT-4 already knows:
- A half marathon training plan needs 16–19km long runs at peak
- Weight loss training needs frequent aerobic sessions, not race-pace intervals
- A comeback-from-injury plan needs progressive reloading, not maximum volume
- Marathon plans need 28–35km peak long runs and a 2–3 week taper

Our job is to tell it **what kind of plan** it's building and **who it's for**. We should not hardcode specific distances, percentages, or rules — those inevitably have edge cases that break adjacent goal types.

### What We DO provide:
- Goal type and primary objective (clear, specific coaching context)
- Athlete data (history, demographics, fitness level, injuries)
- Schedule constraints (sessions/week, fixed sessions, start date)
- Structural requirements (exact week count, exact session count, JSON format)
- Quality bar: "A certified running coach reviewing this should find it adequate"

### What We DON'T do:
- Hardcode `peak long run = 80% of race distance` (breaks short plans, non-race goals)
- Use narrow `targetDistance >= 21 && targetDistance <= 22` range checks
- Write training science rules in code (we're worse at it than GPT-4)
- Add more if/else patches to the prompt template

---

## Architecture Overview

### File: `server/training-plan-service.ts`

The plan generation prompt is built in three stages:

```
Stage 1: Compute goalContext
Stage 2: Build prompt (goalContext embedded at top)
Stage 3: Send to OpenAI → validate/coerce → save to DB
```

### The `goalContext` Function

Located immediately before the `const prompt = ...` line in `generateTrainingPlan()`.

This is a single IIFE that evaluates the goal type and returns the appropriate coaching context string. It covers **every supported goal type** in one place:

```
goalContext
├── Pre-event (isPreEventPlan = true)          → sharpening block framing
├── Ultra (goalType=ultra / dist>42.2km)        → time-on-feet, fatigue resistance
├── Marathon (goalType=marathon / ~40-42km)     → classic marathon prep framing
├── Half Marathon (goalType=half_marathon)      → HM-specific coaching context
├── 10km (goalType=10k)                         → speed-endurance, long runs > race dist
├── 5km (goalType=5k)                           → VO2max, neuromuscular, speed
├── Custom race distance                         → apply judgment for specific distance
├── Improve speed / PB                          → intervals, threshold, neuromuscular
├── Build endurance                             → aerobic base, progressive long runs
├── Lose weight                                 → caloric expenditure, aerobic zone
├── General / maintain fitness                  → balanced sustainable plan
├── Comeback from injury                        → progressive reloading, conservative
├── Consistency / habit                         → achievable, confidence-building
└── Fallback (unknown goal type)               → apply coaching expertise
```

The `goalContext` string is embedded into the prompt under the heading:
```
━━━ PLAN TYPE & PRIMARY OBJECTIVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

This is the **first section the AI sees after the opening brief** — ensuring it knows exactly what kind of plan it's building before processing any athlete data.

---

## Supported Goal Types

### Race Distance Goals (server + Android)
| Goal | goalType value | Notes |
|------|---------------|-------|
| 5km race | `5k` or `distance_5k` | Speed-endurance, VO2max focus |
| 10km race | `10k` or `distance_10k` | Long runs exceed race distance |
| Half marathon | `half_marathon` or `distance_half_marathon` | ~16–19km peak long runs (AI-determined) |
| Marathon | `marathon` or `distance_marathon` | ~28–35km peak long runs (AI-determined) |
| Ultra | `ultra` or `distance_ultra` | Time-on-feet dominant |
| Custom distance | `custom` | Any distance — AI applies judgment |

### Fitness / Non-Race Goals (Android app)
| Goal | goalType value | Training focus |
|------|---------------|----------------|
| Improve speed / PB | `improve_speed` | Intervals, threshold, neuromuscular |
| Build endurance | `build_endurance` | Progressive long runs, aerobic base |
| Lose weight | `lose_weight` | Frequent sessions, fat-burning aerobic zone |
| General / maintain fitness | `maintain_fitness` / `general_fitness` | Balanced, sustainable |
| Comeback from injury | `comeback_from_injury` | Progressive reloading, conservative |
| Consistency | `consistency` | Habit-building, achievable sessions |

> **Note**: The `goalType` field in the DB is plain text — it is not an enum. New goal types can be added from the Android app without schema changes. The `goalContext` fallback handles any unrecognised type gracefully.

---

## Plan Types

### Standard Build Plan
- Most common plan type
- Starts from current fitness, builds progressively
- Includes deload week(s) and final taper
- `isPreEventPlan = false`

### Pre-Event Sharpening Block
- User confirms they are already capable of the race distance
- `isPreEventPlan = true`
- NOT a build-up plan — it is race preparation
- Maintains near-full training load in early weeks, tapers only in the final 1–2 weeks
- Triggered by the user selecting "I'm already trained, this is race prep" in the app

### Rolling Block Plan
- Full plan is too long to generate in one AI call
- `isRollingPlan = true`
- Generates one block at a time (block size = fn of daysPerWeek)
- `nextBlockAt` stores when to auto-generate the next block
- `generatedThroughWeek` tracks how far the plan has been generated

---

## Prompt Structure

The prompt is a single template string with these sections in order:

```
═══ COACHING COMMISSION — {N}-WEEK PERSONALISED TRAINING PLAN ═══

[Opening brief: you are an expert coach, full authority]
[Rolling block info if applicable]

━━━ PLAN TYPE & PRIMARY OBJECTIVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{goalContext — computed by the goalContext IIFE}

━━━ THE ATHLETE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{runnerProfileSection — age, gender, height, weight, fitness level}

━━━ THE GOAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{goalType, targetDistance, targetDate, targetTime, pace context}

━━━ CURRENT PERFORMANCE DATA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{run history / new user context, CTL, pace trend, similar-distance PRs}

━━━ SCHEDULE & LIFESTYLE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{daysPerWeek, fixed sessions, blocked days, first session date}

━━━ HEALTH & INJURY CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{active injuries with status, load management guidance}

━━━ APP COACHING CAPABILITIES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{what live coaching features the app supports}

━━━ WHAT TO DELIVER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{quality standards — weekly progression, distinct sessions, phase naming}
{structural constraints — exact week count, exact session count}
{JSON output format specification}
```

---

## How to Add a New Goal Type

1. **Add the goal type to the Android app** (update the goal type enum/list in the relevant Kotlin file).

2. **Add a branch to `goalContext` in `training-plan-service.ts`**:
   ```typescript
   if (gt.includes('new_goal_type')) {
     return `🎯 NEW GOAL TYPE
   Clear description of what this goal means in running training terms.
   Apply your coaching expertise for [this type of training]: [key principles].
   Design what a certified coach would prescribe for a [description] goal for a ${experienceLevel} runner in ${weeksUntilTarget} weeks.`;
   }
   ```

3. **Copy the same branch to `server_dist/index.js`** (the dist file is what Replit actually runs — it must stay in sync with the TypeScript source).

4. **Do NOT add hardcoded distances, percentages, or km rules.** Describe the goal and trust the AI to determine appropriate distances.

5. **Test by generating a plan** with the new goal type and verify the plan type context appears under "PLAN TYPE & PRIMARY OBJECTIVE" in the output.

---

## How NOT to Change the Prompt

The following patterns have caused problems and must be avoided:

### ❌ Hardcoded distance percentages
```typescript
// DON'T DO THIS
`Peak long run: ${Math.round(targetDistance * 0.80)}–${Math.round(targetDistance * 0.90)}km`
```
This creates problems for short plans (a 4-week plan can't reach 80% of HM distance linearly) and contradicts the AI's own (more accurate) training knowledge.

### ❌ Narrow distance range checks
```typescript
// DON'T DO THIS
if (targetDistance >= 21 && targetDistance <= 22) { ... }
```
A 20.5km race or a 22.5km race would fall through the cracks.

### ❌ Adding more goal-specific sections in the middle of the prompt
The old approach added separate `━━━ ULTRA CONTEXT ━━━`, `━━━ LONG RUN REQUIREMENTS ━━━` etc. sections scattered through the prompt. These created duplication, confusion, and contradictions. Everything goal-specific belongs in `goalContext` at the top.

### ❌ Overriding the AI with prescriptive rules
```typescript
// DON'T DO THIS
`A long run of 7km or less is UNACCEPTABLE`
```
Setting specific km thresholds is fragile. Use quality bar language instead:
```typescript
// DO THIS INSTEAD
`A certified running coach reviewing this plan should find the long runs and weekly volumes appropriate for ${targetDistance}km preparation`
```

---

## Key Variables in `generateTrainingPlan()`

| Variable | What it is |
|----------|-----------|
| `goalType` | String from the app — `5k`, `10k`, `half_marathon`, `marathon`, `ultra`, `custom`, `lose_weight`, etc. |
| `targetDistance` | Numeric distance in km |
| `isPreEventPlan` | Boolean — user confirmed they're already trained, this is race prep |
| `isRollingPlan` | Boolean — plan is too long, generating one block at a time |
| `weeksUntilTarget` | Full plan duration in weeks |
| `weeksToGenerate` | How many weeks to generate in THIS call (≤ weeksUntilTarget) |
| `experienceLevel` | `beginner`, `intermediate`, `advanced` |
| `weeklyMileageBase` | Starting weekly km (from run history, or goal-specific default) |
| `daysPerWeek` | Sessions per week the user wants |
| `hasRunHistory` | Whether we have real run data to calibrate against |

### Default `weeklyMileageBase` when no run history:
- `ultra` or `targetDistance > 42.2`: **45 km/week**
- `marathon`: **30 km/week**
- `half_marathon`: **20 km/week**
- Everything else: **20 km/week**

> **Improvement opportunity**: Non-race goals (lose weight, fitness, etc.) currently fall back to the same 20km/week default. These may benefit from goal-specific starting volumes in a future update.

---

## Post-Generation Validation

After the AI generates the JSON, the server validates and coerces:

1. Strips JSON code fences (` ```json ``` `)
2. Attempts JSON repair if parsing fails
3. Rejects if `weeks` array is missing
4. **Coerces** `weekNumber`, `totalDistance`, `dayOfWeek`, `distance` to numbers
5. **Enforces exact week count** — throws if AI returned fewer weeks than requested; trims if more
6. Sanitises NaN values before DB insert

**Important**: The validation layer does NOT check or enforce specific session distances. It only ensures the data is structurally valid. Distance quality is entirely the AI's responsibility (guided by the prompt).

---

## Testing a Plan Change

When making any prompt change, test at minimum:

1. **Half marathon build plan** (12 weeks, intermediate) — long runs should reach 16–19km
2. **Half marathon pre-event plan** (4 weeks) — long run in week 1 should be 14–16km+
3. **5km plan** (8 weeks, beginner) — should NOT have 16km long runs; appropriate for 5km prep
4. **Lose weight plan** (8 weeks) — should have frequent aerobic sessions, not intervals-dominant
5. **Ultra plan** (16 weeks) — should have back-to-back long runs, time-on-feet focus
6. **Comeback from injury plan** (6 weeks) — should start conservatively with progressive loading

---

## System Prompt (AI Identity)

The system prompt (separate from the plan prompt) establishes the AI's identity:

> *"You are an elite AI running coach with deep expertise in exercise physiology, training periodisation, injury prevention, and performance optimisation. You have coached athletes across all levels and distances — from first-time 5K runners to ultra marathon competitors. You are NOT filling in a template or following a prescribed methodology. You are the expert making every decision..."*

This is intentionally left broad and authoritative. Do not add specific training rules to the system prompt — that belongs in `goalContext`.

---

## File Locations

| File | Purpose |
|------|---------|
| `server/training-plan-service.ts` | **Source of truth** — TypeScript source for plan generation |
| `server_dist/index.js` | **Production runtime** — compiled bundle that Replit runs. Must be kept in sync with the TypeScript source. |
| `server/auth.ts` | JWT auth — relevant for companion/Garmin token handling |
| `server/routes.ts` | API endpoint registration |
| `shared/schema.ts` | Database schema — `trainingPlans`, `trainingWeeks`, `workouts` tables |

> **Replit deployment**: When Replit deploys, it rebuilds `server_dist/index.js` from source via `npm run build`. However, when running in development mode it may use the TypeScript source directly. Always update **both** files when making prompt changes to ensure consistency.

---

## Live Session Coaching — Pace Architecture

> **Read this before changing any live run coaching logic.**

### Problem: Race Goal Pace vs Session Target Pace

The app tracks two completely different pace targets that must **not** be confused:

| Pace | Source | Used for |
|------|--------|----------|
| **Race goal pace** | `targetTime / targetDistance` from the user's race goal (e.g. 1:48 half marathon = 5:07/km) | Finish-time projections, race-day pacing |
| **Session target pace** | `DynamicCoachingPhase.targetPaceMin/Max` from the AI-generated coaching plan | Live coaching cues during a training session |

### The Bug (Fixed 2026-05-23)

The generic `checkPaceCoaching()` engine in `RunTrackingService` was using **race goal pace** (`targetPaceSecondsPerKm`) as its reference. It ran regardless of whether a coaching plan was active. This caused cues like *"you're running too slow, you should be at 5:10/km"* during an easy aerobic session whose target was 5:30/km.

### Architecture (post-fix)

- **`checkPaceCoaching()`** — Generic pace engine for free runs with a time target. Now **suppressed when `isCoachingPlanActive`**.
- **`evaluateSessionConditionTriggers()`** — Dynamic coaching plan evaluator. Handles `pace_deviation` triggers using the *session's* `DynamicCoachingPhase.targetPaceMin/Max`. This is the primary path for coached sessions.
- **`checkSessionPhaseTransitions()`** — Legacy fallback when `sessionInstructions` is loaded but no dynamic plan. Fires at phase start/end only.

### Rule

> When a `dynamicCoachingPlan` is active, **never** use `targetPaceSecondsPerKm` (race goal pace) as a reference for live coaching cues. Always use `dynamicCoachingPlan.phases[currentPhaseIndex].targetPaceMin/Max`.

`initPaceCoaching()` now also picks up `dynamicCoachingPlan.targetMetrics.mainEffortPaceMin` as a fallback so that any path that still reads `targetPaceSecondsPerKm` gets the session pace, not the race goal pace.

---

## Change Log

| Date | Change | Commit |
|------|--------|--------|
| 2026-05-23 | **Fix**: Live coaching cues during trained sessions now use session target pace, not race goal pace. `checkPaceCoaching()` suppressed when a dynamic coaching plan is active. | pending |
| 2026-05-23 | **Refactor**: Replaced all fragmented if/else prompt patches with `goalContext()` architecture. Added full coverage for non-race goals (lose weight, fitness, speed, endurance, consistency, comeback). | `b67cbb7` |
| 2026-05-23 | **Fix**: Added LONG RUN REQUIREMENTS section with event-specific minimums for HM/marathon/10km. Also strengthened pre-event block language. | `1e9b67b` (superseded by refactor above) |
| 2026-05-23 | **Fix**: Fixed `analyzeWeatherImpact` undefined reference in pre-run briefing. | `90e873c` |
