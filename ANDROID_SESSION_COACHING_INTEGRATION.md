# Android Session Coaching Integration Guide

## Overview

Phase 1 of the Dynamic Session Coaching System is now ready for Android integration. This guide covers the changes needed to fetch and use AI-determined coaching context during runs.

**Status:** ✅ All server code complete, Android API layer ready, helper classes written
**Effort:** 3-4 hours
**Difficulty:** Medium

---

## What Was Built (Server Side)

### New API Endpoints

**1. Fetch Session Instructions Pre-Run**
```
GET /api/workouts/{workoutId}/session-instructions
Response: SessionInstructionsResponse
```

Returns AI-determined coaching plan for a specific workout.

**2. Log Coaching Events During Run**
```
POST /api/coaching/session-events
Request: CoachingSessionEvent
```

Logs each coaching event for post-run analysis.

### New Model Classes (Android)

**SessionCoachingModels.kt** — Complete data models:
- `SessionInstructionsResponse` — Full coaching plan
- `SessionStructure` — Session phases and coaching triggers
- `CoachingStyle` — Tone, intensity, detail level
- `InsightFilters` — Which metrics to focus on
- `CoachingSessionEvent` — Event logging model

**RunSetupConfig.kt** — Enhanced with:
- `sessionInstructions: SessionInstructionsResponse?`
- `sessionCoachingTone: String?`
- `sessionCoachingIntensity: String?`

**SessionCoachingHelper.kt** — Utility class:
- `fetchSessionInstructions()` — Retrieve coaching plan
- `logCoachingEvent()` — Log delivered coaching
- `determineCurrentPhase()` — Identify session phase

---

## Integration Workflow

### 1. **Pre-Run: Fetch Session Instructions**

When user selects a planned workout and prepares to run:

```kotlin
// In RunSessionViewModel.kt - Update prepareRun()

val runConfig = RunSetupConfig(...)  // User's run config
val workoutId = runConfig.workoutId

if (workoutId != null) {
    try {
        val sessionCoachingHelper = SessionCoachingHelper(apiService)
        val sessionInstructions = sessionCoachingHelper.fetchSessionInstructions(workoutId)
        
        // Update the config with session context
        updatedConfig = runConfig.copy(
            sessionInstructions = sessionInstructions,
            sessionCoachingTone = sessionInstructions?.aiDeterminedTone,
            sessionCoachingIntensity = sessionInstructions?.aiDeterminedIntensity
        )
        
        // Show pre-run brief to user
        if (sessionInstructions?.preRunBrief != null) {
            showPreRunBriefDialog(sessionInstructions.preRunBrief)
        }
    } catch (e: Exception) {
        Log.w("RunSession", "Failed to fetch session instructions: ${e.message}")
        // Continue without session context — graceful degradation
        updatedConfig = runConfig
    }
}

// Pass updated config to RunTrackingService
startRun(updatedConfig)
```

### 2. **During-Run: Include Session Context in Coaching Requests**

Update all coaching request builders to include session context.

**Example: StruggleCoaching**
```kotlin
// In RunTrackingService.kt - triggerStruggleCoaching()

private fun triggerStruggleCoaching(message: String, metrics: RunMetrics) {
    val update = StruggleUpdate(
        runId = currentRunId,
        message = message,
        currentPace = metrics.pace,
        heartRate = metrics.hr,
        cadence = metrics.cadence,
        // ... existing fields ...
        
        // NEW: Add session context
        linkedWorkoutId = planWorkoutId,  // If run is linked to a plan
        sessionCoachingTone = runConfig?.sessionCoachingTone,
        sessionCoachingIntensity = runConfig?.sessionCoachingIntensity,
        sessionStructure = runConfig?.sessionInstructions?.sessionStructure,
        expectedMetricsFilters = runConfig?.sessionInstructions?.insightFilters
    )
    
    viewModelScope.launch {
        try {
            val response = apiService.getStruggleCoaching(update)
            handleCoachingResponse(response, "struggle")
        } catch (e: Exception) {
            Log.w(TAG, "Struggle coaching failed: ${e.message}")
        }
    }
}
```

**Example: Pace Update** 
```kotlin
// In RunTrackingService.kt - triggerKmSplitCoaching()

private fun triggerKmSplitCoaching(metrics: RunMetrics) {
    val currentPhase = sessionCoachingHelper?.determineCurrentPhase(
        instructions = runConfig?.sessionInstructions,
        distanceCoveredKm = metrics.distance,
        timeElapsedSeconds = metrics.elapsedSeconds.toInt()
    )
    
    val update = PaceUpdate(
        runId = currentRunId,
        currentPace = metrics.pace,
        lastKmPace = metrics.lastKmPace,
        // ... existing fields ...
        
        // NEW: Add session context
        linkedWorkoutId = planWorkoutId,
        sessionCoachingTone = runConfig?.sessionCoachingTone,
        currentSessionPhase = currentPhase
    )
    
    viewModelScope.launch {
        try {
            val response = apiService.getPaceUpdate(update)
            handleCoachingResponse(response, "pace")
        } catch (e: Exception) {
            Log.w(TAG, "Pace coaching failed: ${e.message}")
        }
    }
}
```

**Update ALL coaching endpoints similarly:**
- `getPhaseCoaching()` — Add session context
- `getHeartRateCoaching()` — Add session context
- `getCadenceCoaching()` — Add session context
- `getElevationCoaching()` — Add session context
- `getIntervalCoaching()` — Add session context
- `getEliteCoaching()` — Add session context

### 3. **During-Run: Log Coaching Events (Optional but Valuable)**

After each coaching message is delivered:

```kotlin
// In RunTrackingService.kt - after handling any coaching response

private suspend fun logCoachingEvent(
    eventType: String,  // "pace_coaching", "struggle_coaching", "interval_start", etc
    coachingMessage: String,
    toneUsed: String = runConfig?.sessionCoachingTone ?: "unknown"
) {
    val currentPhase = sessionCoachingHelper?.determineCurrentPhase(
        instructions = runConfig?.sessionInstructions,
        distanceCoveredKm = currentRunSession.distanceMeters.toFloat() / 1000f,
        timeElapsedSeconds = currentRunSession.elapsedMillis.toInt() / 1000
    )
    
    val metrics = mapOf(
        "pace_kmh" to currentRunSession.currentPaceKmh,
        "heart_rate" to currentRunSession.heartRate,
        "distance_km" to currentRunSession.distanceMeters / 1000f,
        "elapsed_seconds" to currentRunSession.elapsedMillis / 1000
    )
    
    sessionCoachingHelper?.logCoachingEvent(
        runId = currentRunId,
        workoutId = planWorkoutId,
        eventType = eventType,
        eventPhase = currentPhase,
        coachingMessage = coachingMessage,
        coachingAudioUrl = null,  // If TTS/audio was generated
        userMetrics = metrics,
        toneUsed = toneUsed
    )
}

// Call after each coaching delivery
logCoachingEvent("pace_coaching", response.message, "direct")
```

---

## Updated Coaching Request Models

### Required Model Updates

**StruggleUpdate.kt** — Add:
```kotlin
@SerializedName("linked_workout_id")
val linkedWorkoutId: String? = null,

@SerializedName("session_coaching_tone")
val sessionCoachingTone: String? = null,

@SerializedName("session_coaching_intensity")
val sessionCoachingIntensity: String? = null,

@SerializedName("session_structure")
val sessionStructure: SessionStructure? = null,

@SerializedName("expected_metrics_filters")
val expectedMetricsFilters: InsightFilters? = null
```

**PaceUpdate.kt** — Add:
```kotlin
@SerializedName("linked_workout_id")
val linkedWorkoutId: String? = null,

@SerializedName("session_coaching_tone")
val sessionCoachingTone: String? = null,

@SerializedName("current_session_phase")
val currentSessionPhase: String? = null
```

**PhaseCoachingUpdate.kt** — Add:
```kotlin
@SerializedName("linked_workout_id")
val linkedWorkoutId: String? = null,

@SerializedName("session_structure")
val sessionStructure: SessionStructure? = null
```

**HeartRateCoachingRequest.kt** — Add:
```kotlin
@SerializedName("session_coaching_tone")
val sessionCoachingTone: String? = null,

@SerializedName("linked_workout_id")
val linkedWorkoutId: String? = null
```

**IntervalCoachingModels.kt** — Add to IntervalCoachingRequest:
```kotlin
@SerializedName("session_coaching_tone")
val sessionCoachingTone: String? = null,

@SerializedName("current_phase")
val currentPhase: String? = null,

@SerializedName("rep_number")
val repNumber: Int? = null
```

---

## Files to Modify

### High Priority (Core Integration)

1. **RunSessionViewModel.kt**
   - Update `prepareRun()` to fetch session instructions
   - Update `setRunConfig()` to store session context
   - Update `startRun()` to pass context to service

2. **RunTrackingService.kt**
   - Initialize `sessionCoachingHelper` in `onCreate()`
   - Update `onStartCommand()` to extract session context from intent
   - Update ALL coaching trigger methods to include session context
   - Add logging of coaching events

3. **All coaching request models** (in `network/model/`)
   - Add session context fields to each model
   - Ensure JSON serialization with `@SerializedName`

### Medium Priority (Optimization)

4. **CoachingPhase.kt** or similar
   - Add phase detection logic if needed
   - Update interval tracking with session phases

5. **RunSessionViewModel.kt** (Analytics)
   - Track which coaching events were delivered
   - Store tone used and user engagement

---

## Integration Checklist

- [ ] Import `SessionCoachingHelper` into `RunTrackingService`
- [ ] Fetch session instructions in `RunSessionViewModel.prepareRun()`
- [ ] Update `RunSetupConfig` usage throughout app
- [ ] Add session context fields to all coaching request models
- [ ] Update `triggerStruggleCoaching()` in `RunTrackingService`
- [ ] Update `triggerKmSplitCoaching()` in `RunTrackingService`
- [ ] Update `triggerPhaseCoaching()` in `RunTrackingService`
- [ ] Update `triggerHeartRateCoaching()` in `RunTrackingService`
- [ ] Update `triggerCadenceCoaching()` in `RunTrackingService`
- [ ] Update `triggerElevationCoaching()` in `RunTrackingService`
- [ ] Update `triggerIntervalCoaching()` in `RunTrackingService`
- [ ] Update `triggerEliteCoaching()` in `RunTrackingService`
- [ ] Add coaching event logging (optional)
- [ ] Test with a planned workout
- [ ] Verify coaching messages include session tone/intensity
- [ ] Verify post-run analysis includes session context

---

## Testing

### Manual Testing Steps

1. **Generate a training plan** (e.g., interval training session)
2. **Set up a run** linked to that plan
3. **Verify session instructions are fetched** (check logs)
4. **Run a short test** (simulator or actual)
5. **Check that coaching messages** reflect session tone
6. **Compare outputs:**
   - Without session context: Generic, same for all session types
   - With session context: Tone-appropriate, session-aware

### Example Test Cases

**Zone 2 Run**
- Expected tone: "light_fun"
- Coaching should be: Conversational, relaxed, focus on aerobic consistency

**Interval Training**
- Expected tone: "direct"  
- Coaching should be: Instructive, focused on pace targets, rep-specific

**Recovery Run**
- Expected tone: "calm"
- Coaching should be: Easy, supportive, low-pressure

---

## Rollback Plan

If there are issues:

1. Session context is purely additive — old coaching endpoints still work
2. If session instructions can't be fetched, app continues without them
3. All new fields in coaching requests are optional
4. No database changes required on Android

**Zero-risk migration** — Simply disable session context passing if needed.

---

## Next Steps After Integration

### Immediate
- Complete Android integration (this phase)
- Test end-to-end with real coaching flows
- Verify AI coaching service is using session context in prompts

### Short-term  
- Analytics dashboard: Track coaching effectiveness by session type
- UI enhancements: Display session goals + expected coaching tone in pre-run

### Medium-term
- Machine learning: Learn which tones work best for each user
- Adaptive coaching: Automatically adjust tone based on performance

---

## Questions?

Refer to:
- `SessionCoachingHelper.kt` — Implementation details
- `SessionCoachingModels.kt` — Data structure documentation
- Server files: `session-coaching-service.ts`, `routes-session-coaching.ts`
- Documentation: `DYNAMIC_SESSION_COACHING_GUIDE.md`
