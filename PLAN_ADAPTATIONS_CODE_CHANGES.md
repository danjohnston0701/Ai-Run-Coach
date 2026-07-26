# Plan Adaptations: Code Changes Reference

## Quick Overview

This document provides exact references to all code changes made for the plan adaptations contextual filtering feature.

---

## Modified Files

### 1. Domain Model: TrainingPlan.kt

**File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/TrainingPlan.kt`

**Change**: Updated `PlanAdaptation` data class

```kotlin
// BEFORE
data class PlanAdaptation(
    val date: LocalDate,
    val reason: String,
    val change: String,
    val applied: Boolean
)

// AFTER
data class PlanAdaptation(
    val id: String,
    val date: LocalDate,
    val reason: String,
    val change: String,
    val applied: Boolean,
    val runRecordId: String? = null,        // NEW
    val plannedWorkoutId: String? = null   // NEW
)
```

**Lines**: 152-160

**Rationale**: Add unique identifier and foreign key references to support contextual filtering

---

### 2. Network Model: PlanAdaptationRequest.kt

**File**: `app/src/main/java/live/airuncoach/airuncoach/network/model/PlanAdaptationRequest.kt`

**Change**: Added fields to `PendingAdaptation` data class

```kotlin
// BEFORE
data class PendingAdaptation(
    @SerializedName("id") val id: String,
    @SerializedName("training_plan_id") val trainingPlanId: String,
    @SerializedName("adaptation_date") val adaptationDate: String,
    @SerializedName("reason") val reason: String,
    @SerializedName("status") val status: String = "pending",
    @SerializedName("changes") val changes: Map<String, Any>? = null,
    @SerializedName("ai_suggestion") val aiSuggestion: String? = null
)

// AFTER
data class PendingAdaptation(
    @SerializedName("id") val id: String,
    @SerializedName("training_plan_id") val trainingPlanId: String,
    @SerializedName("adaptation_date") val adaptationDate: String,
    @SerializedName("reason") val reason: String,
    @SerializedName("status") val status: String = "pending",
    @SerializedName("changes") val changes: Map<String, Any>? = null,
    @SerializedName("ai_suggestion") val aiSuggestion: String? = null,
    @SerializedName("run_record_id") val runRecordId: String? = null,        // NEW
    @SerializedName("planned_workout_id") val plannedWorkoutId: String? = null  // NEW
)
```

**Lines**: 20-28

**Rationale**: Align network model with backend API response structure

---

### 3. API Service: ApiService.kt

**File**: `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt`

**Change**: Added two new API method declarations

```kotlin
// AFTER (new methods added after line 465)

/**
 * Get adaptations specific to a particular run record.
 * These are adaptations created as a result of analyzing this specific run.
 */
@GET("/api/runs/{runId}/adaptations/pending")
suspend fun getPendingAdaptationsByRunId(@Path("runId") runId: String): PendingAdaptationsResponse

/**
 * Get adaptations specific to a particular planned workout.
 * These are adaptations created as a result of completing this specific workout.
 */
@GET("/api/planned-workouts/{workoutId}/adaptations/pending")
suspend fun getPendingAdaptationsByWorkoutId(@Path("workoutId") workoutId: String): PendingAdaptationsResponse
```

**Lines**: 467-479

**Rationale**: Enable UI to fetch context-specific adaptations from backend

---

### 4. AdaptationViewModel: AdaptationViewModel.kt

**File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/AdaptationViewModel.kt`

**Change 1**: Enhanced `loadPendingAdaptations()` to filter plan-level only

```kotlin
// BEFORE
fun loadPendingAdaptations(planId: String) {
    viewModelScope.launch {
        try {
            _isLoading.value = true
            _errorMessage.value = null

            Log.d("AdaptationViewModel", "Starting to fetch pending adaptations for plan $planId")
            
            val response = apiService.getPendingAdaptations(planId)
            _pendingAdaptations.value = response.adaptations

            Log.d(
                "AdaptationViewModel",
                "✅ Loaded ${response.count} pending adaptations for plan $planId"
            )
        } catch (error: Exception) {
            Log.e("AdaptationViewModel", "❌ Failed to load adaptations", error)
            error.printStackTrace()
            _errorMessage.value = "Error: ${error.message ?: "Failed to load adaptations"}"
        } finally {
            _isLoading.value = false
        }
    }
}

// AFTER
fun loadPendingAdaptations(planId: String) {
    viewModelScope.launch {
        try {
            _isLoading.value = true
            _errorMessage.value = null

            Log.d("AdaptationViewModel", "Starting to fetch pending adaptations for plan $planId")
            
            val response = apiService.getPendingAdaptations(planId)
            // Filter to only show plan-level adaptations (no run or workout associated)
            val planLevelAdaptations = response.adaptations.filter { 
                it.runRecordId == null && it.plannedWorkoutId == null 
            }
            _pendingAdaptations.value = planLevelAdaptations

            Log.d(
                "AdaptationViewModel",
                "✅ Loaded ${planLevelAdaptations.size} plan-level pending adaptations for plan $planId (of ${response.adaptations.size} total)"
            )
        } catch (error: Exception) {
            Log.e("AdaptationViewModel", "❌ Failed to load adaptations", error)
            error.printStackTrace()
            _errorMessage.value = "Error: ${error.message ?: "Failed to load adaptations"}"
        } finally {
            _isLoading.value = false
        }
    }
}
```

**Lines**: 32-58

**Rationale**: Ensure plan-level screen only shows plan-specific adaptations

---

**Change 2**: Added new method `loadPendingAdaptationsByRunId()`

```kotlin
/**
 * Load pending adaptations specific to a run record.
 * These are adaptations created as a result of analyzing this specific run.
 */
fun loadPendingAdaptationsByRunId(runId: String) {
    viewModelScope.launch {
        try {
            _isLoading.value = true
            _errorMessage.value = null

            Log.d("AdaptationViewModel", "Starting to fetch pending adaptations for run $runId")
            
            val response = apiService.getPendingAdaptationsByRunId(runId)
            _pendingAdaptations.value = response.adaptations

            Log.d(
                "AdaptationViewModel",
                "✅ Loaded ${response.count} pending run-specific adaptations for run $runId"
            )
        } catch (error: Exception) {
            Log.e("AdaptationViewModel", "❌ Failed to load run-specific adaptations", error)
            error.printStackTrace()
            _errorMessage.value = "Error: ${error.message ?: "Failed to load adaptations"}"
        } finally {
            _isLoading.value = false
        }
    }
}
```

**Lines**: 60-88

**Rationale**: Allow loading of run-specific adaptations for run summary screen

---

**Change 3**: Added new method `loadPendingAdaptationsByWorkoutId()`

```kotlin
/**
 * Load pending adaptations specific to a planned workout.
 * These are adaptations created as a result of completing this specific workout.
 */
fun loadPendingAdaptationsByWorkoutId(workoutId: String) {
    viewModelScope.launch {
        try {
            _isLoading.value = true
            _errorMessage.value = null

            Log.d("AdaptationViewModel", "Starting to fetch pending adaptations for workout $workoutId")
            
            val response = apiService.getPendingAdaptationsByWorkoutId(workoutId)
            _pendingAdaptations.value = response.adaptations

            Log.d(
                "AdaptationViewModel",
                "✅ Loaded ${response.count} pending workout-specific adaptations for workout $workoutId"
            )
        } catch (error: Exception) {
            Log.e("AdaptationViewModel", "❌ Failed to load workout-specific adaptations", error)
            error.printStackTrace()
            _errorMessage.value = "Error: ${error.message ?: "Failed to load adaptations"}"
        } finally {
            _isLoading.value = false
        }
    }
}
```

**Lines**: 90-118

**Rationale**: Allow loading of workout-specific adaptations for run summary screen

---

### 5. RunSummaryViewModel: RunSummaryViewModel.kt

**File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSummaryViewModel.kt`

**Change 1**: Added new method `loadPendingAdaptationsByRunId()`

```kotlin
/**
 * Load pending adaptations specific to the current run.
 * These are adaptations created as a result of analyzing this specific run.
 */
fun loadPendingAdaptationsByRunId(runId: String) {
    viewModelScope.launch {
        try {
            _isLoadingAdaptations.value = true
            Log.d("AdaptationDebug", "🔍 Fetching run-specific adaptations for runId=$runId")

            val response = apiService.getPendingAdaptationsByRunId(runId)

            Log.d("AdaptationDebug", "📦 Raw run-specific response: count=${response.count}, adaptations=${response.adaptations.size}")
            response.adaptations.forEachIndexed { i, a ->
                Log.d("AdaptationDebug", "  [$i] id=${a.id} status='${a.status}' runId=${a.runRecordId}")
            }

            // Only show adaptations with status "pending"
            val filtered = response.adaptations.filter { it.status == "pending" }
            Log.d("AdaptationDebug", "✅ After filter: ${filtered.size} pending run-specific adaptations (of ${response.adaptations.size} total)")
            _pendingAdaptations.value = filtered
        } catch (e: Exception) {
            Log.e("AdaptationDebug", "❌ FAILED to load run-specific adaptations for runId=$runId — ${e.javaClass.simpleName}: ${e.message}", e)
            _pendingAdaptations.value = emptyList()
        } finally {
            _isLoadingAdaptations.value = false
        }
    }
}
```

**Lines**: 1490-1519

**Rationale**: Allow run summary screen to load run-specific adaptations

---

**Change 2**: Added new method `loadPendingAdaptationsByWorkoutId()`

```kotlin
/**
 * Load pending adaptations specific to a planned workout.
 * These are adaptations created as a result of completing this specific planned workout.
 */
fun loadPendingAdaptationsByWorkoutId(workoutId: String) {
    viewModelScope.launch {
        try {
            _isLoadingAdaptations.value = true
            Log.d("AdaptationDebug", "🔍 Fetching workout-specific adaptations for workoutId=$workoutId")

            val response = apiService.getPendingAdaptationsByWorkoutId(workoutId)

            Log.d("AdaptationDebug", "📦 Raw workout-specific response: count=${response.count}, adaptations=${response.adaptations.size}")
            response.adaptations.forEachIndexed { i, a ->
                Log.d("AdaptationDebug", "  [$i] id=${a.id} status='${a.status}' workoutId=${a.plannedWorkoutId}")
            }

            // Only show adaptations with status "pending"
            val filtered = response.adaptations.filter { it.status == "pending" }
            Log.d("AdaptationDebug", "✅ After filter: ${filtered.size} pending workout-specific adaptations (of ${response.adaptations.size} total)")
            _pendingAdaptations.value = filtered
        } catch (e: Exception) {
            Log.e("AdaptationDebug", "❌ FAILED to load workout-specific adaptations for workoutId=$workoutId — ${e.javaClass.simpleName}: ${e.message}", e)
            _pendingAdaptations.value = emptyList()
        } finally {
            _isLoadingAdaptations.value = false
        }
    }
}
```

**Lines**: 1564-1593

**Rationale**: Allow run summary screen to load workout-specific adaptations

---

## Summary Table

| File | Change Type | Lines | Purpose |
|------|------------|-------|---------|
| `TrainingPlan.kt` | Add fields | 152-160 | Add `id`, `runRecordId`, `plannedWorkoutId` to domain model |
| `PlanAdaptationRequest.kt` | Add fields | 20-28 | Add serialization fields to network model |
| `ApiService.kt` | Add methods | 467-479 | Add endpoints for run/workout-specific adaptations |
| `AdaptationViewModel.kt` | Update method | 32-58 | Add filtering to `loadPendingAdaptations()` |
| `AdaptationViewModel.kt` | Add method | 60-88 | Add `loadPendingAdaptationsByRunId()` |
| `AdaptationViewModel.kt` | Add method | 90-118 | Add `loadPendingAdaptationsByWorkoutId()` |
| `RunSummaryViewModel.kt` | Add method | 1490-1519 | Add `loadPendingAdaptationsByRunId()` |
| `RunSummaryViewModel.kt` | Add method | 1564-1593 | Add `loadPendingAdaptationsByWorkoutId()` |

---

## Backward Compatibility

✅ **All changes are backward compatible**

- Existing adaptations without `runRecordId`/`plannedWorkoutId` are treated as plan-level
- API endpoints remain unchanged (only new endpoints added)
- Accept/Decline endpoints work with all adaptation types
- No breaking changes to existing classes

---

## Next Steps for UI Integration

### RunSummaryScreen Updates

```kotlin
// When loading a run summary, call:
runSummaryViewModel.loadPendingAdaptationsByRunId(runId)

// When loading a workout summary, call:
runSummaryViewModel.loadPendingAdaptationsByWorkoutId(workoutId)

// Display adaptations in a new section:
if (runAdaptations.isNotEmpty()) {
    AdaptationCard(
        title = "Based on This Run",
        adaptations = runAdaptations,
        onAccept = { runSummaryViewModel.acceptAdaptation(it.id) },
        onDecline = { runSummaryViewModel.declineAdaptation(it.id) }
    )
}
```

### AdaptationReviewScreen Updates

```kotlin
// No changes needed - already calls:
adaptationViewModel.loadPendingAdaptations(planId)

// This now correctly filters to plan-level only (no run/workout-specific)
```

---

## Testing Points

1. **Filtering**: Verify plan-level endpoint returns only plan-level adaptations
2. **API Integration**: Mock the new endpoints during development
3. **Error Handling**: Test invalid run/workout IDs
4. **State Management**: Verify StateFlow updates correctly
5. **UI Rendering**: Ensure run-specific section appears/disappears appropriately

---

## Build Status

✅ **Code compiles cleanly** - No new compilation errors introduced
⚠️ **Pre-existing warnings**: Some enum and function declarations are unused (not related to this change)

---

**Ready for**: Backend API implementation → UI screen updates → Integration testing
