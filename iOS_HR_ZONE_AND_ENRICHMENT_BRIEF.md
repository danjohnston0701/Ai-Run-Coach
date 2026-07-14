# iOS — HR Zone BPM Fix & Enrichment Timing Brief

**Status**: Ready for Xcode Implementation  
**Date**: Tuesday 14 July 2026  
**Reference commits**: `476b470`, `9bfc7f6`  
**Scope**: Addendum to `iOS_TODAYS_UPDATES_BRIEF.md`

---

## Overview

Two separate fixes — one is pure server-side (automatic, no iOS work), one requires a small iOS UI change.

---

## Fix 1 — Plan Generation: Enrichment Now Runs Before Response Returns

### What Changed (Server-only — no iOS code changes needed)

Previously, enrichment ran asynchronously after the plan was saved. The server returned the `planId` immediately and the Android app navigated to the plan. If the user tapped a session quickly, enrichment hadn't completed yet so they saw incorrect/placeholder BPMs and no target pace.

**Now:** Enrichment is awaited synchronously inside `generateTrainingPlan()`. The server only responds with `{ planId }` after enrichment has fully completed for weeks 1–2. By the time the user sees the plan, all sessions have:
- Correct Tanaka-formula HR zone BPMs
- Enriched target paces (for returning users with run history)
- `isEnrichmentPending: false`

### iOS Impact

**The plan generation API call will take longer.** Previously it returned in ~15–25 seconds (GPT plan design only). Now it returns in ~20–35 seconds (GPT plan design + enrichment OpenAI call).

**Action required:** Make sure your loading state communicates that enrichment is part of the process. Suggested copy update during plan generation:

| Phase | Loading copy to show |
|-------|----------------------|
| First ~15s | "Building your personalised training plan…" |
| After ~15s (or just use one message) | "Calibrating your session targets and heart rate zones…" |
| Almost done | "Your plan is ready." |

You can either use a simple timeout to switch messages, or use the existing single loading state — both are acceptable. The key is that the user doesn't see a timeout or assume the app has crashed during the extra few seconds.

**New users (no run history)** are unchanged — enrichment still fires after their orientation session completes. Their plan appears quickly; session targets fill in later.

---

## Fix 2 — HR Zone BPM Display: Always Use Stored Server Values

### What Changed (Android + Server)

**Root cause discovered:** The enrichment service was reading `user.dateOfBirth` but the database column is called `dob`. Because of this field name mismatch, DOB was always `undefined` → the Tanaka formula enforcement never ran → GPT estimated HR zone BPMs freely and sometimes produced wrong values (e.g. Zone 2 showing 101–118 bpm for a 36-year-old instead of the correct 110–128).

This has been fixed on the server. Tanaka enforcement now runs correctly for all users with a known DOB.

Additionally, a daily **BPM self-healing job** now runs at 6:10 AM UTC and on server startup. It scans all upcoming incomplete workouts, detects stored BPMs that deviate >15 bpm from the Tanaka-correct range for the user's actual age, and corrects them automatically.

### iOS UI Fix Required

In your **session detail / workout detail screen** (the screen that shows the planned workout before a run), the "Intensity Explained" / zone card section likely has logic to display HR zone BPMs.

**Current problem (same as Android had):** If you have any client-side computation of zone BPMs (e.g. calculating Zone 2 from the user's stored max HR or age), and this computation runs before the user object has fully loaded from the API, the screen could briefly flicker between two different BPM ranges — or show the wrong range if the async user load hasn't completed.

**The fix:** Always show the **stored server values** (`hrZoneMinBpm` / `hrZoneMaxBpm` from the workout object) as the primary source of truth. Only fall back to client-side computation if both stored values are null.

```swift
// CORRECT approach
if let hrMin = workout.hrZoneMinBpm,
   let hrMax = workout.hrZoneMaxBpm,
   hrMin > 50, hrMax < 230, hrMin < hrMax {
    // Show stored server values — Tanaka-verified, user-specific
    zoneHRLabel.text = "Keep your HR between \(hrMin) and \(hrMax) bpm"
} else {
    // Only fall back to client-side if stored values are missing
    if let age = currentUser?.age {
        let maxHR = Int(208 - 0.7 * Double(age))
        let zoneRange = HeartRateZones.getTargetRange(zone: zoneNumber, maxHR: maxHR)
        zoneHRLabel.text = "Keep your HR between \(zoneRange.min) and \(zoneRange.max) bpm"
    }
    // If age also unknown, hide the HR row entirely rather than showing a guess
}
```

**What NOT to do:**

```swift
// WRONG — validates stored values against a client-computed range, which can
// produce different results depending on when currentUser loads
let computedRange = HeartRateZones.getTargetRange(zone: zoneNumber, maxHR: userMaxHR)
let isValid = hrMin >= computedRange.min - 20 && hrMax <= computedRange.max + 20
if isValid {
    // show stored values
} else {
    // show client-computed values  ← this creates a flicker/inconsistency
}
```

The "validate against client-computed range" approach caused the bug — when `currentUser` hadn't loaded yet, `userMaxHR` defaulted to a fallback (190 bpm on Android), producing a different validation result than when it loaded with the real age. The stored server values are now authoritative and should be shown directly.

---

## Summary: What iOS Needs To Do

| Change | Type | Priority | Effort |
|--------|------|----------|--------|
| Plan generation loading state — communicate longer wait | UI copy | Medium | 15 min |
| Zone card: show stored `hrZoneMinBpm/hrZoneMaxBpm` directly, no client validation | UI logic | High | 20 min |

## What Requires No iOS Changes

| Fix | Why automatic |
|-----|---------------|
| DOB field name fixed (`dob` not `dateOfBirth`) | Server reads correct column — Tanaka enforcement now runs |
| BPM self-healing daily job | Corrects existing wrong BPMs in DB — values iOS reads are now correct |
| Enrichment now synchronous | Server waits for enrichment before responding — plan is always complete when iOS receives it |
| `nextPlannedWorkout` in post-run summary | Already covered in `iOS_TODAYS_UPDATES_BRIEF.md` |
