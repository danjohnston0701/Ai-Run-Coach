# Technique Coaching Repetition Issue - Analysis & Fix

## Problem Report

During Charlie's Saturday 5km park run, the coaching became repetitive:
- ❌ Mostly form and posture coaching repeatedly
- ❌ Other coaching categories not being used despite being available
- ❌ Limited variety in coaching messages throughout the run

## Root Cause Analysis

The issue stems from how the `selectTechniqueCategory()` function works with run phases.

### Current Logic (Lines 3302-3346)

The function has a **priority system** based on context:

```kotlin
private fun selectTechniqueCategory(
    phase: CoachingPhase, 
    isUphill: Boolean, 
    isDownhill: Boolean, 
    fatigueLevel: String
): String {
    // Priority 1: Hill-specific (8 categories)
    // Priority 2: Fatigue/late phase (10 categories)
    // Priority 3: Early phase (8 categories) ← PROBLEM HERE
    // Priority 4: All unused categories (46 total)
    // Fallback: Reset and pick random
}
```

### The Problem: Early Phase Lock-In

**For a typical 21-minute 5km run:**

1. **Coaching trigger interval:** TECHNIQUE_INTERVAL_MS = 180_000L (3 minutes)
2. **Estimated coaching triggers:** ~7 triggers during a 21-minute run
3. **Run phase duration:** 
   - EARLY phase likely lasts: 0-2km (first ~10 minutes)
   - That's ~3-4 technique triggers while in EARLY phase

**What happens:**
```
Trigger #1 (1.5km, 10 min, EARLY phase):
  → earlyCategories = [posture_head_neck, posture_shoulders, posture_torso_lean, 
                       breathing_rhythm, arms_swing_direction, arms_hand_relaxation,
                       feet_strike_pattern, feet_cadence]
  → unused = all 8
  → picks random: "posture_shoulders" ← POSTURE SELECTED
  → usedTechniqueCategories = {posture_shoulders}

Trigger #2 (3km, 16 min, EARLY phase):
  → earlyCategories = [posture_head_neck, posture_shoulders, posture_torso_lean, ...]
  → unused = [posture_head_neck, posture_torso_lean, breathing_rhythm, ...]  (7 items)
  → picks random from 7: "posture_head_neck" ← POSTURE AGAIN!
  → usedTechniqueCategories = {posture_shoulders, posture_head_neck}

Trigger #3 (3.5km, 20 min, MIDDLE phase):
  → NOT on hill, NOT fatigued, NOT early
  → Falls through to Priority 4: All unused categories
  → Now unused = 46 - 2 = 44 categories
  → Could pick anything... but randomness still favors what's been used
```

### Why Posture is Over-Represented

The earlyCategories list has **4 out of 8 = 50% posture categories**:
- posture_head_neck
- posture_shoulders
- posture_torso_lean
- breathing_rhythm  
- arms_swing_direction
- arms_hand_relaxation
- feet_strike_pattern
- feet_cadence

**Statistical likelihood of posture in early phase:**
- First pick from earlyCategories: 50% chance of posture (4/8)
- Second pick from earlyCategories: 50% chance of posture (3/7 ≈ 43%)
- Third pick from earlyCategories: 50% chance of posture (2/6 ≈ 33%)

With 3-4 technique triggers in early phase, **you're almost guaranteed to get multiple posture tips**.

### The Deeper Issue: Frequency Problem

Even beyond the category selection, the **technique trigger frequency itself is too high**:

```kotlin
private val TECHNIQUE_INTERVAL_MS = 180_000L // Technique coaching every ~3 minutes
```

For a 21-minute 5km run:
- Triggers at: 1.5km, 3km, 4.5km, 6km, 7.5km (wait, this run is only 5km!)
- Actual triggers: roughly 3-4 during the 21 minutes
- But each trigger only fires if ≥1.5km into the run

So a 5km run gets technique coaching ~2-3 times. With only 8 early-phase categories, **you're cycling through posture repeatedly**.

## Solutions

### Solution 1: Reduce Posture Dominance in Early Phase (Quick Fix)

**Current early categories:**
```kotlin
val earlyCategories = listOf(
    "posture_head_neck", "posture_shoulders", "posture_torso_lean",
    "breathing_rhythm", "arms_swing_direction", "arms_hand_relaxation",
    "feet_strike_pattern", "feet_cadence"
)
// 4 posture out of 8 = 50%
```

**Better distribution:**
```kotlin
val earlyCategories = listOf(
    // Just 2 posture (not 3) - most critical fundamentals
    "posture_head_neck", 
    "posture_shoulders",
    
    // Add more variety (not just fundamental form)
    "breathing_rhythm", 
    "breathing_deep_belly",     // ADD: breathing variety
    "arms_swing_direction", 
    "arms_hand_relaxation",
    "feet_strike_pattern", 
    "feet_cadence",
    
    // Add arm mechanics
    "arms_drive_power",         // ADD: arm power
    
    // Add hip/knee for variety
    "hips_forward_drive",       // ADD: hips
    "knees_lift"                // ADD: knee lift
)
// Now 2 posture out of 11 = 18% (much better!)
```

### Solution 2: Increase Technique Interval (Moderate Fix)

Make technique coaching less frequent so you don't get as many repetitions per run:

```kotlin
// BEFORE
private val TECHNIQUE_INTERVAL_MS = 180_000L // Every 3 minutes

// AFTER  
private val TECHNIQUE_INTERVAL_MS = 300_000L // Every 5 minutes
```

For a 21-minute run:
- Before: ~4 technique triggers
- After: ~3 technique triggers (less repetition)

### Solution 3: Smart Rotation for Short Runs (Best Fix)

Add logic to prevent repeating categories within the same short run:

```kotlin
private fun selectTechniqueCategory(
    phase: CoachingPhase, 
    isUphill: Boolean, 
    isDownhill: Boolean, 
    fatigueLevel: String
): String {
    // ... existing hill/fatigue/early phase logic ...
    
    // NEW: For short runs (< 45 min), strongly prefer unused categories
    if (totalDistance < 7500) {  // < 7.5km run
        val allUnused = techniqueCategories.filter { it !in usedTechniqueCategories }
        if (allUnused.isNotEmpty()) {
            return allUnused.random()  // Pick from ALL unused, not just early
        }
    }
    
    // ... rest of logic ...
}
```

### Solution 4: Track Recent Categories (Comprehensive Fix)

Prevent same category being selected multiple times:

```kotlin
private val recentlyUsedCategories = mutableListOf<String>()  // Track last 3

private fun selectTechniqueCategory(...): String {
    // ... existing logic ...
    
    // At any trigger, heavily weight against categories used in last 2 triggers
    val candidates = techniqueCategories.filter { 
        it !in recentlyUsedCategories 
    }
    
    if (candidates.isNotEmpty()) {
        val selected = candidates.random()
        recentlyUsedCategories.add(selected)
        if (recentlyUsedCategories.size > 3) {
            recentlyUsedCategories.removeAt(0)
        }
        return selected
    }
    
    // Fallback if all recent were used
    return techniqueCategories.random()
}
```

## Recommended Implementation

**Best approach: Combination of Solution 1 + 2**

1. **Rebalance early categories** to have more variety (Solution 1)
2. **Increase technique interval** to every 5 minutes (Solution 2)

This gives:
- ✅ Less repetition (5-min intervals instead of 3-min)
- ✅ Better variety in early phase (18% posture instead of 50%)
- ✅ Still maintains good coaching frequency
- ✅ Simple to implement, low risk

## Expected Results

**Before fix (21-minute 5km run):**
- Trigger #1: posture_shoulders
- Trigger #2: posture_head_neck
- Trigger #3: (random, might be arms or feet)
- Result: 2/3 = 67% posture coaching

**After fix (21-minute 5km run):**
- Trigger #1 (5 min): breathing_rhythm
- Trigger #2 (10 min): arms_drive_power
- Trigger #3 (15 min): hips_forward_drive
- Result: 0/3 = 0% redundant posture coaching

## Implementation Files

- `app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt`
  - Line 187: TECHNIQUE_INTERVAL_MS (change to 300_000L)
  - Line 3331-3336: earlyCategories list (add variety, reduce posture)
