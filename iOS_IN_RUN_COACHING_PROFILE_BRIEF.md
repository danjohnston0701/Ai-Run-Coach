# iOS — In-Run Coaching Profile Wire-Up Brief

**Status**: Ready for Xcode Implementation  
**Date**: Wednesday 15 July 2026  
**Reference commit**: `678bfce`  
**Scope**: Small — add `userId` to 2 in-run coaching request models. All server logic is already deployed.

---

## Overview

A major coaching quality overhaul has shipped server-side. The full benefit only reaches users if the iOS app sends `userId` in its in-run coaching API calls — exactly like the Android app was updated to do.

**What the server now does with `userId`:**
- Fetches the user's living AI runner profile (a ~200-word coaching briefing updated after every run) and injects it into every in-run coaching call — the AI "knows" the runner before the first GPS tick
- Applies tiered coaching based on **age** (5 bands: <20, 20–35, 36–50, 51–65, 65+) — each band shapes directness, tone, and what counts as an achievement
- Applies **BMI-aware effort calibration** (5 tiers) — high-mass runners no longer receive pace-gap coaching calibrated for a lean build; a pace that looks "slow" may represent real effort
- **Fully-blank profile safety catch** — when fitness level, DOB, and weight/height are all missing, an explicit directive fires: zero performance pressure, treat as potential first run ever
- **`hasNoBaseline`** now covers ALL runners with no fitness level set (not just ≤5 runs) — a runner with 30 runs who never filled their profile still defaults to encouragement over performance analysis
- **Target feasibility validation** — targets under 6:00/km are flagged as aspirational for no-baseline runners so the AI doesn't frame the pace gap as underperformance
- **Tone override removed** — the user's chosen coaching tone is now always respected (a previous bug was silently replacing it with "energetic" for runners under 50% of their target distance)
- All calibration happens server-side — iOS needs no logic changes, just the user identity in the request body

---

## The One Thing iOS Needs To Do

**Add `userId: String?` to the request body for these two endpoints:**

### 1. `POST /api/coaching/phase-coaching`

This is the main in-run coaching endpoint, fired at 500m, km splits, phase transitions, pace coaching, and navigation turns.

Whatever model/struct iOS uses for this call, add:

```swift
var userId: String?        // CodingKey: "userId"
```

Populate it with the authenticated user's ID (same ID used for `/api/users/{id}` calls).

### 2. `POST /api/coaching/interval-coaching`

This fires at work/recovery interval transitions during plan sessions.

Whatever model/struct iOS uses for this call, add:

```swift
var userId: String?        // CodingKey: "userId"
```

### 3. `POST /api/coaching/session-trigger-live` — Already correct ✅

The Android `SessionTriggerLiveRequest` already had `userId` and iOS likely mirrors this. **Verify that `userId` is populated when constructing and sending this request** — no structural change needed, just confirm it's not being left nil.

---

## What Does NOT Need To Change

Everything else is server-side and already live:

| Change | Where | Status |
|--------|--------|--------|
| Living runner profile injected into every in-run coaching call | Server | ✅ Live |
| Age-aware coaching — 5 bands from <20 to 65+, each with explicit coaching direction | Server | ✅ Live |
| BMI coaching calibration — 5 tiers; high-mass runners never receive lean-build pace pressure | Server | ✅ Live |
| Blank DOB fallback — "unknown age, assume conservative and warm posture" | Server | ✅ Live |
| Blank weight/height fallback — "cannot assess effort-to-pace ratio, be non-judgemental" | Server | ✅ Live |
| Fully-blank profile safety catch — ZERO directness when all fields missing | Server | ✅ Live |
| `hasNoBaseline` covers ALL runners with no fitness level (not just ≤5 runs) | Server | ✅ Live |
| Target feasibility validation — sub-6:00/km targets flagged as aspirational for new runners | Server | ✅ Live |
| `getPhaseTone()` removed — user's chosen tone now always respected | Server | ✅ Live |
| Pace verdict is pure data — hardcoded "PICK UP SPEED" behavioral commands removed | Server | ✅ Live |
| Duplicate coaching at 500m / run-start fixed (null→EARLY phantom phase change) | Android | ✅ Live |

---

## Why This Matters

Before this fix, the server's `getCoachingProfile()` checked `req.body.userId`. If it was missing (which it was for every in-run coaching call on both platforms), the runner profile was **silently ignored** — returning `null` and skipping injection entirely.

The living runner profile system has been building and storing detailed coaching profiles for every user after every run. None of it was reaching in-run coaching. This fix completes the wire.

**The worst-case scenario (all fields blank):** without `userId`, the AI has no idea who the runner is and may apply aggressive performance pressure to a first-time runner, an older adult, or someone with high BMI. With `userId`, the fully-blank profile safety catch fires and coaching is warm, encouraging, and free of any performance expectations.

---

## Implementation Estimate

| Task | Effort |
|------|--------|
| Add `userId` to phase-coaching request struct + populate at call site | ~15 min |
| Add `userId` to interval-coaching request struct + populate at call site | ~10 min |
| Verify `userId` is populated in session-trigger-live request | ~5 min |

**Total: ~30 minutes**

---

## Context: What Changed on Android (for reference)

**`PhaseCoachingUpdate.kt`** — added:
```kotlin
@SerializedName("userId") val userId: String? = null
```

**`RunTrackingService.kt`** — all 4 `PhaseCoachingUpdate(...)` call sites now pass:
```kotlin
userId = currentUser?.id
```

**`IntervalCoachingModels.kt`** — added:
```kotlin
@SerializedName("userId") val userId: String? = null
```

**`RunSessionViewModel.kt`** — `IntervalCoachingRequest(...)` now passes:
```kotlin
userId = sessionManager.getUserId()
```

The iOS equivalents are just the Swift versions of the same pattern.
