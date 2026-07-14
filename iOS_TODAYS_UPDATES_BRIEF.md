# iOS — Today's Updates Brief (Addendum)

**Status**: Ready for Xcode Implementation  
**Date**: Tuesday 14 July 2026  
**Scope**: Additions ONLY — for the full onboarding and enrichment context see `iOS_ONBOARDING_FLOW_AND_COACHING_PLAN_BRIEF.md`  
**Reference commits**: `4f9893e`, `01372ab`, `c31bfad`

---

## Overview

Three bodies of work from today that require iOS changes:

1. **Post-run summary — "Your Next Session"** — the AI summary now references the actual upcoming coaching plan session; iOS needs the model update and a richer display
2. **Session detail — Zone explanation contradiction fix** — the zone card was showing hardcoded static pace ranges alongside the real target pace, creating a contradiction
3. **In-run coaching — session complete trigger stop** — coaching triggers were continuing to fire after the session ended; iOS needs the same guard

---

## Change 1 — Post-Run Summary: "Your Next Session"

### What Changed (Server)

When a run is completed that is linked to a coaching plan, the server now:
1. Fetches the next incomplete planned workout from the same training plan
2. Passes it into the AI analysis prompt with a `CRITICAL INSTRUCTION` to use the actual session in the recommendation
3. Returns a richer `nextWorkoutCoaching` object alongside the existing `nextRunSuggestion` string

### What iOS Must Add

#### 1. New Model

Add a `NextWorkoutCoaching` model to your API response models:

```swift
struct NextWorkoutCoaching: Codable {
    let recommendation: String?
    let reasonWhy: String?
    let focusPoints: [String]?
}
```

Add it to `ComprehensiveRunAnalysis`:

```swift
struct ComprehensiveRunAnalysis: Codable {
    // ... existing fields ...
    let nextRunSuggestion: String?
    let nextWorkoutCoaching: NextWorkoutCoaching?  // NEW
    // ... rest of fields ...
}
```

#### 2. Updated Display in Post-Run Summary Screen

Replace the current "Next Run" row (which shows only a plain string) with this richer layout when `nextWorkoutCoaching` is present:

```
┌─────────────────────────────────────┐
│ [pill] YOUR NEXT SESSION            │  ← primary colour pill header
│                                     │
│  {nextRunSuggestion text}           │  ← body, textSecondary
│                                     │
│  {nextWorkoutCoaching.reasonWhy}    │  ← caption, textSecondary, 6pt top gap
│                                     │
│ [pill] FOCUS POINTS                 │  ← accent colour pill header, 8pt gap
│  • {focusPoints[0]}                 │  ← bullet list, accent colour bullets
│  • {focusPoints[1]}                 │
│  • ...                              │
└─────────────────────────────────────┘
```

**Header label logic:**
- When `nextWorkoutCoaching != nil` → header reads **"Your Next Session"** (primary colour pill)
- When `nextWorkoutCoaching == nil` (no plan, or legacy run) → header reads **"Next Run"** (textSecondary colour pill)

**Guard:** Only show this section if `nextRunSuggestion` is non-empty OR `nextWorkoutCoaching` is non-nil.

**Visual result expected:** When user completes a coaching plan session, the summary now says something like:
> *"Your next session is a 7km tempo run on Thursday — three days after today's easy aerobic foundation session, your legs will be ready for threshold effort."*
>
> *Why: Today built the aerobic base the tempo run draws from. Going harder today would compromise Thursday's quality session.*
>
> **Focus Points:**
> - Keep cadence at 170+ spm — this will carry into the tempo session
> - Stay hydrated tonight to support the upcoming harder effort
> - ...

---

## Change 2 — Session Detail: Zone Card Contradiction Fix

### The Problem

The session detail / workout detail screen showed **two different and contradictory pace values** on the same screen:
- The actual enriched `targetPace` (e.g. "6:57/km") at the top
- A hardcoded zone guidance label (e.g. "9-13 min/km" for Zone 2 beginner) in the zone explanation card below

This was always visually broken — "Zone 2: 9-13 min/km" and "Target Pace: 6:57" on the same screen. The hardcoded zone pace descriptions are population averages, not runner-specific. They should **not** be shown alongside a real target pace.

### Fix for iOS

In the HR zone explanation card / zone detail section:

**When `targetPace` is present (non-null):**

Replace the static hardcoded zone pace guidance text with:
> "Your target pace for this session: **{targetPace}/km**"

And show the HR range using the stored `hrZoneMinBpm`–`hrZoneMaxBpm` values (which are now Tanaka-formula accurate).

**When `targetPace` is null (enrichment pending):**

Show the zone name and description only. Do not show any pace range. Show:
> "Pace targets for this session will be set after your first run."

**Zone description text** (replace previous hardcoded pace ranges with these effort-based descriptions):

| Zone | Name | New description (no pace range) |
|------|------|----------------------------------|
| 1 | Recovery | Very easy effort — active recovery and mobility focus |
| 2 | Aerobic Base | Steady, conversational effort — the foundation of endurance |
| 3 | Aerobic Threshold | Comfortably hard — you can speak in short sentences |
| 4 | Lactate Threshold | Hard sustained effort — race-pace conditioning |
| 5 | Neuromuscular | Max effort sprints — short, sharp, full recovery between |

> **Why:** These descriptions are always correct regardless of the runner's pace. Hardcoded "9-13 min/km" ranges are often wrong for many runners and create visible contradictions when real target paces are shown.

---

## Change 3 — In-Run Coaching: Session Complete Trigger Stop

### The Problem

After the `session_complete` trigger fired (marking the coaching session as finished), subsequent GPS location updates continued evaluating HR zone triggers. The result: the runner received multiple HR zone coaching messages **after the session had already ended**. In the reported case, 4 HR zone messages fired after the cool-down / session complete message.

### What Android Fixed

A `sessionCoachingPlanComplete` boolean flag was added to `RunTrackingService`. When a trigger with type `session_complete` fires successfully, this flag is set to `true`. At the top of the trigger evaluation loop, if the flag is `true`, evaluation exits immediately. The flag is reset to `false` when a new coaching plan is loaded.

### iOS Fix Required

In whatever class/service handles coaching trigger evaluation during a run (likely your `SessionCoachingService`, `RunCoachingManager`, or equivalent):

**Add a flag:**
```swift
private var sessionCoachingPlanComplete = false
```

**Reset when a new coaching plan loads:**
```swift
func loadCoachingPlan(_ plan: SessionCoachingPlan) {
    self.dynamicCoachingPlan = plan
    self.sessionCoachingPlanComplete = false  // ← ADD THIS
    // ... rest of loading logic
}
```

**Guard at the top of trigger evaluation:**
```swift
func evaluateTriggers(currentState: RunState) {
    guard !sessionCoachingPlanComplete else { return }  // ← ADD THIS GUARD
    // ... rest of trigger evaluation
}
```

**Set the flag when session_complete fires:**
```swift
func fireTrigger(_ trigger: CoachingTrigger) {
    // ... send the message ...
    
    // Mark session done so no further triggers fire
    if trigger.type.contains("session_complete") || trigger.type == "session_end" {
        sessionCoachingPlanComplete = true
    }
}
```

> **Trigger type to match:** Look for a trigger whose `type` field contains `"session_complete"`, `"session_end"`, or similar. In the coaching plan JSON, this is the final trigger that plays the cool-down / well done message.

---

## Change 3b — Elevation Coaching: Shared Cooldown & Minimum Distance (Check Required)

### Context

On Android, there are **two separate elevation coaching systems** that had separate cooldown timers and could fire within seconds of each other:
1. The `elevation_insight` system (fires from the session coaching plan trigger)
2. The general elevation coaching system (fires from `shouldTriggerElevationInsight`)

Both systems now share a single `lastElevationCoachingTime` timestamp, so one respects the cooldown of the other. A **minimum 1km run distance** guard was also added — elevation coaching doesn't fire at all in the first kilometre (prevents GPS noise false positives in the first minute).

### iOS Action

**Check your iOS codebase** to see if you have a similar dual-system setup. If elevation coaching can be triggered from both a session coaching plan trigger AND a general run coaching observer simultaneously:

1. Ensure both systems check the **same** last-fired timestamp before sending an elevation message
2. Add a **minimum 1km distance guard** — don't fire any elevation coaching before the runner has covered at least 1km

If iOS only has one elevation system, no change is needed.

---

## Summary Table — What iOS Needs to Do

| Change | Priority | Effort |
|--------|----------|--------|
| Add `NextWorkoutCoaching` model to `ComprehensiveRunAnalysis` | High | 15 min |
| Update post-run summary "Your Next Session" display | High | 1 hr |
| Fix zone card: show actual target pace, not static range | High | 30 min |
| Update zone descriptions to remove hardcoded pace ranges | Medium | 20 min |
| Session complete trigger stop guard | High | 30 min |
| Check elevation dual-cooldown (if applicable) | Low | 30 min |

---

## No iOS Changes Required For

The following changes from today are **server-side only** — iOS benefits automatically with no code changes:

- HR zone BPM values now always validated against Tanaka formula before writing to DB (Tier 2 override)
- Enrichment service now writes corrected `duration` based on distance × pace (fixes "45 minutes" for 35 min run)
- Session coaching duration fallback now computed from distance/pace not hardcoded to 45
- Post-run analysis correctly fetches next planned workout from coaching plan
- Elevation coaching prompt now enforces max 15 words and ignores GPS noise (≤5m gain)
- AI plan prompt now tells GPT that Zone 2 pace must be ≥90 sec/km slower than average training pace
