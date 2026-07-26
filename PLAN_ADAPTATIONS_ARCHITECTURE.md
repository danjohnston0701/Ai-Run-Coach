# Plan Adaptations: Architecture & Flow Diagrams

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACES                            │
├─────────────────────────┬──────────────────┬───────────────────────┤
│                         │                  │                       │
│  Plan Adaptation Screen │  Run Summary     │  Planned Workout     │
│                         │  Screen          │  Summary Screen      │
│  (Plan-Level Only)      │  (Run-Specific)  │  (Workout-Specific)  │
└────────┬────────────────┴────────┬─────────┴───────────┬───────────┘
         │                        │                     │
         │                        │                     │
    Plan-Level         Run-Specific              Workout-Specific
    Adaptations        Adaptations                Adaptations
    (runId=null,      (runId=set,              (workoutId=set,
     workoutId=null)   workoutId=null)          runId=null)
         │                        │                     │
         ▼                        ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         VIEW MODELS                                  │
├──────────────────────────┬──────────────────┬──────────────────────┤
│                          │                  │                      │
│ AdaptationViewModel      │ RunSummary       │ RunSummary           │
│                          │ ViewModel        │ ViewModel            │
│ loadPending              │                  │                      │
│ Adaptations()            │ loadPending      │ loadPending          │
│                          │ AdaptationsByRunId() │AdaptationsByWorkoutId()
│ (filters run/workout     │                  │                      │
│  specific out)           │ (loads run-spec) │ (loads workout-spec) │
└───────────┬──────────────┴────────┬─────────┴──────────┬──────────┘
            │                      │                    │
            │                      │                    │
            └──────────┬───────────┴─────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────┐
        │        API SERVICE               │
        ├──────────────────────────────────┤
        │ • getPendingAdaptations()        │
        │ • getPendingAdaptationsByRunId() │
        │ • getPendingAdaptationsByWorkout │
        │         Id()                     │
        │ • acceptAdaptation()             │
        │ • declineAdaptation()            │
        └────────────┬─────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────────┐
        │     BACKEND API                  │
        ├──────────────────────────────────┤
        │ GET /api/training-plans/         │
        │     {planId}/adaptations/pending │
        │                                  │
        │ GET /api/runs/{runId}/           │
        │     adaptations/pending          │
        │                                  │
        │ GET /api/planned-workouts/       │
        │     {workoutId}/adaptations/     │
        │     pending                      │
        │                                  │
        │ POST /api/training-plans/        │
        │     adaptations/{id}/accept      │
        │                                  │
        │ POST /api/training-plans/        │
        │     adaptations/{id}/decline     │
        └──────────────────────────────────┘
```

---

## Data Flow Diagrams

### Scenario 1: Load Plan-Level Adaptations

```
┌─────────────────────┐
│ User opens Plan     │
│ Adaptation Screen   │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ AdaptationReviewScreen               │
│ calls:                               │
│ adaptationViewModel                  │
│   .loadPendingAdaptations(planId)    │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ AdaptationViewModel.                 │
│ loadPendingAdaptations()             │
│                                      │
│ 1. _isLoading = true                 │
│ 2. Call apiService.                  │
│    getPendingAdaptations(planId)     │
│ 3. Filter: runId==null &&            │
│    workoutId==null                   │
│ 4. _pendingAdaptations = filtered    │
│ 5. _isLoading = false                │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ ApiService.                          │
│ getPendingAdaptations()              │
│                                      │
│ GET /api/training-plans/{planId}/    │
│     adaptations/pending              │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Backend                              │
│                                      │
│ Query DB for adaptations where:      │
│ - training_plan_id = planId          │
│ - status = 'pending'                 │
│ - run_record_id IS NULL              │
│ - planned_workout_id IS NULL         │
│                                      │
│ Return: PendingAdaptationsResponse   │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Response (10 plan-level              │
│ adaptations)                         │
│                                      │
│ {                                    │
│   "adaptations": [                   │
│     {                                │
│       "id": "adapt-1",               │
│       "training_plan_id": "plan-1",  │
│       "run_record_id": null,         │
│       "planned_workout_id": null,    │
│       "status": "pending",           │
│       "ai_suggestion": "..."         │
│     },                               │
│     ...                              │
│   ],                                 │
│   "count": 10                        │
│ }                                    │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Display in UI:                       │
│ 10 Plan Adaptations shown            │
└──────────────────────────────────────┘
```

---

### Scenario 2: Load Run-Specific Adaptations

```
┌─────────────────────┐
│ User opens Run      │
│ Summary Screen      │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ RunSummaryScreen                     │
│ calls:                               │
│ runSummaryViewModel                  │
│   .loadPendingAdaptationsByRunId()   │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ RunSummaryViewModel.                 │
│ loadPendingAdaptationsByRunId()      │
│                                      │
│ 1. _isLoadingAdaptations = true      │
│ 2. Call apiService.                  │
│    getPendingAdaptationsByRunId()    │
│    (runId)                           │
│ 3. _pendingAdaptations = response    │
│ 4. _isLoadingAdaptations = false     │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ ApiService.                          │
│ getPendingAdaptationsByRunId()       │
│                                      │
│ GET /api/runs/{runId}/               │
│     adaptations/pending              │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Backend                              │
│                                      │
│ Query DB for adaptations where:      │
│ - run_record_id = runId              │
│ - status = 'pending'                 │
│                                      │
│ Return: PendingAdaptationsResponse   │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Response (2 run-specific             │
│ adaptations)                         │
│                                      │
│ {                                    │
│   "adaptations": [                   │
│     {                                │
│       "id": "adapt-101",             │
│       "training_plan_id": "plan-1",  │
│       "run_record_id": "run-123",    │
│       "planned_workout_id": null,    │
│       "reason": "run_data_feedback", │
│       "status": "pending",           │
│       "ai_suggestion": "..."         │
│     },                               │
│     ...                              │
│   ],                                 │
│   "count": 2                         │
│ }                                    │
└──────────┬───────────────────────────┘
           │
           ▼
┌────────���─────────────────────────────┐
│ Display in UI:                       │
│ "Based on this run" section with     │
│ 2 run-specific adaptations           │
└──────────────────────────────────────┘
```

---

### Scenario 3: Accept/Decline Adaptations

```
┌──────────────────────────────────┐
│ User taps "Accept" on             │
│ an adaptation                     │
│ (ID: "adapt-101")                 │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ AdaptationReviewScreen or         │
│ RunSummaryScreen                  │
│                                  │
│ calls:                           │
│ viewModel.acceptAdaptation()     │
│   (adaptationId)                 │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ ViewModel                        │
│ (AdaptationViewModel OR          │
│  RunSummaryViewModel)            │
│                                  │
│ 1. Call apiService.              │
│    acceptAdaptation(id)          │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────���───────────────────────┐
│ ApiService                       │
│                                  │
│ POST /api/training-plans/        │
│ adaptations/{id}/accept          │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Backend                          │
│                                  │
│ 1. Validate adaptation exists    │
│ 2. Extract workout changes       │
│ 3. Apply changes to plan         │
│ 4. Update adaptation status to   │
│    "accepted"                    │
│ 5. Return success response       │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Response:                        │
│ AdaptationResponse               │
│ {                                │
│   "success": true,               │
│   "message": "Applied!",         │
│   "workoutsUpdated": 2           │
│ }                                │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ ViewModel                        │
│                                  │
│ 1. Remove from pending list      │
│ 2. Show success message          │
│ 3. Auto-dismiss after 3s         │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ UI Update                        │
│ Adaptation disappears from list  │
└──────────────────────────────────┘
```

---

## Database Schema

### Adaptations Table (Backend)

```sql
CREATE TABLE adaptations (
    id VARCHAR(36) PRIMARY KEY,
    training_plan_id VARCHAR(36) NOT NULL,
    run_record_id VARCHAR(36) NULL,           -- FK to runs table
    planned_workout_id VARCHAR(36) NULL,      -- FK to planned_workouts table
    adaptation_date TIMESTAMP DEFAULT NOW(),
    reason VARCHAR(100) NOT NULL,             -- run_data_feedback, missed_workout, etc.
    status VARCHAR(20) DEFAULT 'pending',     -- pending, accepted, declined
    ai_suggestion TEXT,
    changes JSON,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (training_plan_id) REFERENCES training_plans(id),
    FOREIGN KEY (run_record_id) REFERENCES runs(id) ON DELETE CASCADE,
    FOREIGN KEY (planned_workout_id) REFERENCES planned_workouts(id) ON DELETE CASCADE,
    
    INDEX idx_training_plan_id (training_plan_id),
    INDEX idx_run_record_id (run_record_id),
    INDEX idx_planned_workout_id (planned_workout_id),
    INDEX idx_status (status),
    INDEX idx_combo_plan_status (training_plan_id, status),
    INDEX idx_combo_run_status (run_record_id, status),
    INDEX idx_combo_workout_status (planned_workout_id, status)
);
```

### Query Examples

**Get plan-level adaptations:**
```sql
SELECT * FROM adaptations
WHERE training_plan_id = ?
  AND run_record_id IS NULL
  AND planned_workout_id IS NULL
  AND status = 'pending';
```

**Get run-specific adaptations:**
```sql
SELECT * FROM adaptations
WHERE run_record_id = ?
  AND status = 'pending';
```

**Get workout-specific adaptations:**
```sql
SELECT * FROM adaptations
WHERE planned_workout_id = ?
  AND status = 'pending';
```

---

## Filtering Logic

### Client-Side Filtering (Android)

The Android client filters adaptations to ensure they're displayed in the correct context:

```kotlin
// In AdaptationViewModel.loadPendingAdaptations()
val planLevelAdaptations = response.adaptations.filter {
    it.runRecordId == null && it.plannedWorkoutId == null
}

// In RunSummaryViewModel.loadPendingAdaptationsByRunId()
// No filtering needed - endpoint returns only run-specific adaptations
val runAdaptations = response.adaptations
```

### Server-Side Filtering (Backend)

The backend API endpoints filter on the server to optimize bandwidth:

```
GET /api/training-plans/{planId}/adaptations/pending
    → WHERE training_plan_id = {planId}
       AND run_record_id IS NULL
       AND planned_workout_id IS NULL
       AND status = 'pending'

GET /api/runs/{runId}/adaptations/pending
    → WHERE run_record_id = {runId}
       AND status = 'pending'

GET /api/planned-workouts/{workoutId}/adaptations/pending
    → WHERE planned_workout_id = {workoutId}
       AND status = 'pending'
```

---

## State Management

### AdaptationViewModel State

```
┌─────────────────────────────────────┐
│ AdaptationViewModel                 │
├─────────────────────────────────────┤
│                                     │
│ _pendingAdaptations:                │
│   StateFlow<List<PendingAdaptation>>│
│   └─ Holds all loaded adaptations   │
│                                     │
│ _isLoading:                         │
│   StateFlow<Boolean>                │
│   └─ True while fetching            │
│                                     │
│ _errorMessage:                      │
│   StateFlow<String?>                │
│   └─ Error details if fetch fails   │
│                                     │
│ _successMessage:                    │
│   StateFlow<String?>                │
│   └─ Success message after accept   │
│                                     │
└─────────────────────────────────────┘
```

### RunSummaryViewModel State

```
┌──────────────────────────────────────┐
│ RunSummaryViewModel                  │
├──────────────────────────────────────┤
│                                      │
│ _pendingAdaptations:                 │
│   StateFlow<List<PendingAdaptation>> │
│   └─ Run-specific or workout-        │
│      specific adaptations            │
│                                      │
│ _isLoadingAdaptations:               │
│   StateFlow<Boolean>                 │
│   └─ True while fetching             │
│                                      │
│ [other existing state...]            │
│                                      │
└──────────────────────────────────────┘
```

---

## Error Handling

### Exception Flows

```
                    ┌──────────────┐
                    │ Load Request │
                    └──────┬───────┘
                           │
                     ┌─────▼─────┐
                     │   Try      │
                     └─────┬─────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    Success         Network Error      Server Error
         │                 │                 │
         ▼                 ▼                 ▼
    Update State    Log Error          Log Error
    Show Data       Clear List          Clear List
                    Show Toast          Show Toast
                    Show Message        Show Message
```

**Error Handling in ViewModels:**
- Network errors: Log to Logcat, display message to user
- Parse errors: Log error details, empty state with retry button
- Authorization errors: Refresh token or redirect to login
- Server errors (5xx): Show generic error message, log for debugging

---

## Summary

This architecture ensures that:

1. **Plan-level adaptations** are visible only on the plan management screen
2. **Run-specific adaptations** are visible only on the run that triggered them
3. **Workout-specific adaptations** are visible only on the workout that triggered them
4. **No irrelevant suggestions** clutter the user experience
5. **All adaptations** can still be managed (accepted/declined) from their respective screens
