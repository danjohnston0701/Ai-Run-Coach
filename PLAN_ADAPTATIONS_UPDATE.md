# Plan Adaptations Architecture Update

## Overview

Plan adaptations have been enhanced to support **contextual filtering** so that adaptations are now linked to specific sources:
- **Plan-level adaptations**: Applied to the entire training plan (visible on the plan adaptation screen)
- **Run-specific adaptations**: Created as a result of analyzing a specific run (visible on the run summary screen for that run)
- **Workout-specific adaptations**: Created as a result of completing a specific planned workout (visible on the run summary screen for that workout)

This prevents users from seeing adaptations that are not relevant to their current context.

---

## Data Model Changes

### Domain Model: `PlanAdaptation`

**File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/TrainingPlan.kt`

```kotlin
data class PlanAdaptation(
    val id: String,
    val date: LocalDate,
    val reason: String,
    val change: String,
    val applied: Boolean,
    val runRecordId: String? = null,        // If adaptation is result of a specific run
    val plannedWorkoutId: String? = null   // If adaptation is result of a specific workout
)
```

**Key Fields**:
- `runRecordId`: Non-null when this adaptation was triggered by analysis of a specific run
- `plannedWorkoutId`: Non-null when this adaptation was triggered by completion of a specific planned workout
- Both null: Adaptation is plan-level (not specific to any run or workout)

---

### Network Model: `PendingAdaptation`

**File**: `app/src/main/java/live/airuncoach/airuncoach/network/model/PlanAdaptationRequest.kt`

```kotlin
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

---

## API Endpoints

Three endpoints now exist for fetching adaptations:

### 1. Plan-Level Adaptations
```
GET /api/training-plans/{planId}/adaptations/pending
```
Returns adaptations for the entire plan that are not specific to any run or workout.

**Response**: `PendingAdaptationsResponse` (list of `PendingAdaptation` where `runRecordId` and `plannedWorkoutId` are null)

---

### 2. Run-Specific Adaptations
```
GET /api/runs/{runId}/adaptations/pending
```
Returns adaptations created as a result of analyzing this specific run.

**Response**: `PendingAdaptationsResponse` (list of `PendingAdaptation` where `runRecordId` is set)

---

### 3. Workout-Specific Adaptations
```
GET /api/planned-workouts/{workoutId}/adaptations/pending
```
Returns adaptations created as a result of completing this specific planned workout.

**Response**: `PendingAdaptationsResponse` (list of `PendingAdaptation` where `plannedWorkoutId` is set)

---

## ViewModel Methods

### AdaptationViewModel

**File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/AdaptationViewModel.kt`

#### Load Plan-Level Adaptations
```kotlin
fun loadPendingAdaptations(planId: String)
```
Fetches and displays plan-level adaptations (filters out any with `runRecordId` or `plannedWorkoutId`).

**Usage**: Plan adaptation review screen showing all plan-wide suggestions.

---

#### Load Run-Specific Adaptations
```kotlin
fun loadPendingAdaptationsByRunId(runId: String)
```
Fetches and displays adaptations specific to a particular run.

**Usage**: Run summary screen to show suggestions based on this run's analysis.

---

#### Load Workout-Specific Adaptations
```kotlin
fun loadPendingAdaptationsByWorkoutId(workoutId: String)
```
Fetches and displays adaptations specific to a particular planned workout.

**Usage**: Run summary screen to show suggestions based on completing this workout.

---

### RunSummaryViewModel

**File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSummaryViewModel.kt`

#### Load Run-Specific Adaptations
```kotlin
fun loadPendingAdaptationsByRunId(runId: String)
```
Loads adaptations triggered by this run's analysis and stores in `_pendingAdaptations` state.

---

#### Load Workout-Specific Adaptations
```kotlin
fun loadPendingAdaptationsByWorkoutId(workoutId: String)
```
Loads adaptations triggered by this workout's completion and stores in `_pendingAdaptations` state.

---

## Usage Examples

### Scenario 1: User Views Plan Adaptation Screen

1. User navigates to "Plan Adaptations" section
2. UI calls: `adaptationViewModel.loadPendingAdaptations(planId)`
3. ViewModel fetches from `/api/training-plans/{planId}/adaptations/pending`
4. Only plan-level adaptations are displayed (those with `runRecordId == null && plannedWorkoutId == null`)

---

### Scenario 2: User Views Run Summary

1. User completes a run and views the summary screen
2. Run ID is loaded: `runId = "abc123"`
3. UI calls: `runSummaryViewModel.loadPendingAdaptationsByRunId(runId)`
4. ViewModel fetches from `/api/runs/{runId}/adaptations/pending`
5. Run-specific adaptations are displayed in a dedicated section

---

### Scenario 3: User Views a Completed Planned Workout

1. User completes a planned workout and views the summary
2. Workout ID is loaded: `workoutId = "xyz789"`
3. UI calls: `runSummaryViewModel.loadPendingAdaptationsByWorkoutId(workoutId)`
4. ViewModel fetches from `/api/planned-workouts/{workoutId}/adaptations/pending`
5. Workout-specific adaptations are displayed in a dedicated section

---

## Backend Implementation Notes

When creating adaptations, the backend should:

1. **For plan-level adaptations**: Leave `runRecordId` and `plannedWorkoutId` as null
2. **For run-specific adaptations**: Populate `runRecordId` with the ID of the run that triggered the analysis
3. **For workout-specific adaptations**: Populate `plannedWorkoutId` with the ID of the workout that was completed

### Example Adaptation Creation Logic

```
IF adaptation triggered by run analysis:
    runRecordId = run.id
    plannedWorkoutId = null

ELSE IF adaptation triggered by workout completion:
    runRecordId = null
    plannedWorkoutId = workout.id

ELSE (plan-wide suggestion):
    runRecordId = null
    plannedWorkoutId = null
```

---

## Migration Notes

### Existing Adaptations

Existing adaptations in the database that don't have `runRecordId` or `plannedWorkoutId` populated are treated as **plan-level adaptations** and will be visible only on the plan adaptation screen.

### Adding Retroactively

If you need to link existing adaptations to specific runs or workouts, update the respective fields in the database and they will automatically appear in the correct context.

---

## Testing

### Test Cases

1. **Plan-Level Only**: Create an adaptation without specifying a run or workout. Verify it appears only on plan adaptation screen.

2. **Run-Specific Only**: Create an adaptation with `runRecordId` set. Verify it appears only on that run's summary screen.

3. **Workout-Specific Only**: Create an adaptation with `plannedWorkoutId` set. Verify it appears only on that workout's summary screen.

4. **Mixed List**: Create multiple adaptations with different `runRecordId`/`plannedWorkoutId` values. Verify each appears in the correct context.

5. **Filtering**: Verify that `AdaptationViewModel.loadPendingAdaptations()` filters out run/workout-specific adaptations.

---

## Summary of Changes

| File | Change |
|------|--------|
| `TrainingPlan.kt` | Added `id`, `runRecordId`, `plannedWorkoutId` to `PlanAdaptation` |
| `PlanAdaptationRequest.kt` | Added `runRecordId`, `plannedWorkoutId` to `PendingAdaptation` |
| `ApiService.kt` | Added `getPendingAdaptationsByRunId()`, `getPendingAdaptationsByWorkoutId()` |
| `AdaptationViewModel.kt` | Enhanced `loadPendingAdaptations()` with filtering; added new methods for run/workout-specific loading |
| `RunSummaryViewModel.kt` | Added `loadPendingAdaptationsByRunId()`, `loadPendingAdaptationsByWorkoutId()` |

---

## Related JSON Example

From the provided plan adaptations data, the new structure would look like:

```json
{
  "id": "cc787928-210f-49c3-a3ac-71f5097ce42e",
  "training_plan_id": "e34c3e07-6dd6-4231-b8f9-509f36b807d7",
  "run_record_id": "run-2026-07-24-001",  // NEW: This adaptation was triggered by a run
  "planned_workout_id": null,              // NEW: Not specific to a workout
  "adaptation_date": "2026-07-24 13:43:22.560624",
  "reason": "run_data_feedback",
  "status": "declined",
  "ai_suggestion": "To help gradually build your weekly mileage...",
  "changes": {
    "summary": "...",
    "changeCount": 2,
    "upcoming_workout_adjustments": [...]
  }
}
```

---

## Future Enhancements

1. **Batch Adaptation Loading**: Load all three types (plan, run, workout) in parallel when viewing a run summary
2. **Adaptation History**: Archive applied/declined adaptations and show in a history view
3. **Adaptation Notifications**: Notify users of new run-specific adaptations immediately after run analysis
4. **Smart Filtering**: Only show adaptations if they've changed from previous version
