# Plan Adaptations: Implementation Summary

## Executive Summary

Plan adaptations have been refactored to provide **contextual relevance**. Instead of showing all adaptations on every run record, adaptations are now classified and filtered based on their source:

- **Plan-level adaptations** → Visible on Plan Adaptation Screen
- **Run-specific adaptations** → Visible on Run Summary Screen (for that specific run)
- **Workout-specific adaptations** → Visible on Run Summary Screen (for that specific workout)

This prevents users from seeing irrelevant suggestions and creates a cleaner, more personalized experience.

---

## What Changed

### 1. Data Models

#### Domain Model: `PlanAdaptation`
- **Added**: `id` (UUID)
- **Added**: `runRecordId` (nullable UUID) - links to a specific run
- **Added**: `plannedWorkoutId` (nullable UUID) - links to a specific planned workout
- **Behavior**: If both are null, this is a plan-level adaptation

#### Network Model: `PendingAdaptation`
- **Added**: `run_record_id` (nullable) - JSON serialized field
- **Added**: `planned_workout_id` (nullable) - JSON serialized field
- Mirrors the domain model for API communication

---

### 2. API Endpoints

#### New Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/runs/{runId}/adaptations/pending` | Fetch adaptations triggered by a specific run |
| `GET /api/planned-workouts/{workoutId}/adaptations/pending` | Fetch adaptations triggered by a specific workout |

#### Updated Endpoints

| Endpoint | Change |
|----------|--------|
| `GET /api/training-plans/{planId}/adaptations/pending` | Now filters to **only** plan-level adaptations |

---

### 3. ViewModels

#### AdaptationViewModel
- **Updated**: `loadPendingAdaptations(planId)` - now filters out run/workout-specific adaptations
- **New**: `loadPendingAdaptationsByRunId(runId)` - loads run-specific adaptations
- **New**: `loadPendingAdaptationsByWorkoutId(workoutId)` - loads workout-specific adaptations

#### RunSummaryViewModel
- **New**: `loadPendingAdaptationsByRunId(runId)` - loads run-specific adaptations
- **New**: `loadPendingAdaptationsByWorkoutId(workoutId)` - loads workout-specific adaptations

---

## Files Modified

### Android (Kotlin)

```
app/src/main/java/live/airuncoach/airuncoach/
├── domain/model/TrainingPlan.kt                    [MODIFIED] ✏️
├── network/model/PlanAdaptationRequest.kt           [MODIFIED] ✏️
├── network/ApiService.kt                           [MODIFIED] ✏️
├── viewmodel/AdaptationViewModel.kt                [MODIFIED] ✏️
└── viewmodel/RunSummaryViewModel.kt                [MODIFIED] ✏️
```

---

## Implementation Status

### ✅ Completed (Android)

- [x] Updated `PlanAdaptation` domain model with `id`, `runRecordId`, `plannedWorkoutId`
- [x] Updated `PendingAdaptation` network model with new fields
- [x] Added API method: `getPendingAdaptationsByRunId()`
- [x] Added API method: `getPendingAdaptationsByWorkoutId()`
- [x] Added ViewModel method: `AdaptationViewModel.loadPendingAdaptationsByRunId()`
- [x] Added ViewModel method: `AdaptationViewModel.loadPendingAdaptationsByWorkoutId()`
- [x] Added ViewModel method: `RunSummaryViewModel.loadPendingAdaptationsByRunId()`
- [x] Added ViewModel method: `RunSummaryViewModel.loadPendingAdaptationsByWorkoutId()`
- [x] Updated filtering logic in `AdaptationViewModel.loadPendingAdaptations()`

### ⏳ In Progress (Backend)

- [ ] Database schema migration (add columns)
- [ ] Implement `GET /api/runs/{runId}/adaptations/pending` endpoint
- [ ] Implement `GET /api/planned-workouts/{workoutId}/adaptations/pending` endpoint
- [ ] Update adaptation creation logic to populate `run_record_id`/`planned_workout_id`
- [ ] Add authorization checks
- [ ] Write unit & integration tests
- [ ] Deploy and monitor

### ⏳ In Progress (UI/Screens)

- [ ] Update `RunSummaryScreen` to call `loadPendingAdaptationsByRunId()` when viewing run
- [ ] Update `AdaptationReviewScreen` to show plan-level adaptations in dedicated section
- [ ] Add UI section to display run-specific adaptations on run summary
- [ ] Add UI section to display workout-specific adaptations on run summary
- [ ] Update UI state handling for run/workout-specific loading states

---

## Data Flow Examples

### Example 1: Plan-Level Adaptation

```
User Opens Plan Adaptation Screen
    ↓
AdaptationReviewScreen calls:
  adaptationViewModel.loadPendingAdaptations(planId)
    ↓
ViewModel calls:
  apiService.getPendingAdaptations(planId)
    ↓
Backend API filters:
  WHERE training_plan_id = {planId}
    AND run_record_id IS NULL
    AND planned_workout_id IS NULL
    AND status = 'pending'
    ↓
Returns: 5 plan-level adaptations
    ↓
UI displays: "Plan Suggestions" section with 5 items
```

### Example 2: Run-Specific Adaptation

```
User Completes Run and Views Summary
    ↓
RunSummaryScreen calls:
  runSummaryViewModel.loadPendingAdaptationsByRunId(runId)
    ↓
ViewModel calls:
  apiService.getPendingAdaptationsByRunId(runId)
    ↓
Backend API filters:
  WHERE run_record_id = {runId}
    AND status = 'pending'
    ↓
Returns: 2 run-specific adaptations
    ↓
UI displays: "Based on This Run" section with 2 items
```

### Example 3: Accept Adaptation

```
User Taps "Accept" on Adaptation
    ↓
ViewModel calls:
  apiService.acceptAdaptation(adaptationId)
    ↓
Backend:
  1. Validates adaptation exists
  2. Extracts workout changes
  3. Applies changes to training plan
  4. Updates status to 'accepted'
  5. Returns success response
    ↓
ViewModel:
  1. Removes from pending list
  2. Shows success message
  3. Auto-dismisses
    ↓
UI updates automatically via StateFlow
```

---

## Key Design Decisions

### 1. Nullable References vs Enum
**Decision**: Use nullable `runRecordId` and `plannedWorkoutId` rather than an enum type.

**Rationale**:
- Simpler to understand at a glance (null = plan-level)
- Easier to filter in queries
- More flexible for future expansion

### 2. Client-Side & Server-Side Filtering
**Decision**: Filter on both server (optimize bandwidth) and client (extra safety).

**Rationale**:
- Server filtering ensures correct data at source
- Client filtering handles edge cases & race conditions
- Defensive programming approach

### 3. Separate API Endpoints vs Query Parameters
**Decision**: Use three separate endpoints instead of query parameters.

**Rationale**:
- Clearer API contract
- Better REST semantics
- Easier to scale/optimize each endpoint independently
- Simpler caching strategies

### 4. StateFlow for Adaptations in Both ViewModels
**Decision**: Store adaptations in both `AdaptationViewModel` and `RunSummaryViewModel`.

**Rationale**:
- Allows independent loading of plan vs run-specific adaptations
- Screens can fetch only what they need
- No coupling between adaptation types
- Clearer separation of concerns

---

## Backward Compatibility

### Existing Adaptations

All existing adaptations in the database without `run_record_id` or `planned_workout_id` are treated as **plan-level adaptations**.

**No migration required** - but new code should populate these fields when creating adaptations.

### Accept/Decline Endpoints

The existing `/api/training-plans/adaptations/{id}/accept` and `/decline` endpoints continue to work unchanged with all three types of adaptations.

---

## Testing Recommendations

### Unit Tests

```kotlin
// Test filtering logic
fun testPlanLevelFilteringExcludesRunAdaptations()
fun testPlanLevelFilteringExcludesWorkoutAdaptations()
fun testRunSpecificAdaptationContainsRunId()
fun testWorkoutSpecificAdaptationContainsWorkoutId()
```

### Integration Tests

```kotlin
// Test end-to-end flows
fun testLoadAndDisplayRunSpecificAdaptations()
fun testAcceptRunSpecificAdaptation()
fun testDeclineWorkoutSpecificAdaptation()
fun testPlanAndRunAdaptationsLoadIndependently()
fun testErrorHandlingForInvalidRunId()
```

### UI Tests

```kotlin
// Test UI rendering
fun testRunSummaryScreenShowsRunAdaptationsSection()
fun testPlanAdaptationScreenHidesRunAdaptations()
fun testAdaptationAcceptanceUpdatesUI()
```

---

## Performance Considerations

### Database Indexing

The backend should create these indexes for optimal performance:

```sql
CREATE INDEX idx_run_record_id ON adaptations(run_record_id);
CREATE INDEX idx_planned_workout_id ON adaptations(planned_workout_id);
CREATE INDEX idx_combo_run_status ON adaptations(run_record_id, status);
CREATE INDEX idx_combo_workout_status ON adaptations(planned_workout_id, status);
```

### Query Optimization

- Run-specific queries should have sub-millisecond latency
- Avoid N+1 queries when loading adaptation changes
- Consider caching frequently accessed adaptation lists
- Paginate if adaptation lists grow large

---

## Migration Checklist

For teams implementing this change:

### Backend Team
- [ ] Create database migration
- [ ] Add new columns to adaptations table
- [ ] Create indexes
- [ ] Implement new API endpoints
- [ ] Add authorization checks
- [ ] Write tests
- [ ] Deploy to staging
- [ ] Verify with Android team
- [ ] Deploy to production

### Android Team
- [ ] Code changes complete ✅
- [ ] Update UI screens to use new methods
- [ ] Test with mocked API responses
- [ ] Test with real backend (once deployed)
- [ ] Verify filtering logic
- [ ] Update any related documentation

### QA Team
- [ ] Test plan-level adaptations appear only on plan screen
- [ ] Test run-specific adaptations appear only on run summary
- [ ] Test mixed scenarios (multiple adaptation types)
- [ ] Test accept/decline for all types
- [ ] Test error scenarios
- [ ] Test with various network conditions

---

## Documentation References

For more detailed information, see:

1. **PLAN_ADAPTATIONS_UPDATE.md** - Complete API and ViewModel documentation
2. **PLAN_ADAPTATIONS_ARCHITECTURE.md** - Architecture diagrams and data flows
3. **PLAN_ADAPTATIONS_BACKEND_CHECKLIST.md** - Detailed backend implementation guide

---

## Questions & Support

### For Backend Team

**Q: How do we know if an adaptation should be run-specific vs plan-level?**

**A**: Run-specific adaptations are created when the AI analyzes a specific run's performance. Plan-level adaptations are broader suggestions for the overall plan.

**Q: Should we migrate existing adaptations?**

**A**: No, existing adaptations are treated as plan-level. Only new adaptations should populate `run_record_id`/`plannedWorkoutId`.

### For Mobile Team

**Q: Should we load all three adaptation types at once?**

**A**: No, load them independently. Only load run-specific when on a run summary, and plan-level on the plan screen.

**Q: What if the API returns an unexpected adaptation type?**

**A**: The ViewModel will still process it. The UI layer should handle gracefully with try-catch blocks.

---

## Version History

| Date | Change | Status |
|------|--------|--------|
| 2026-07-24 | Initial implementation | ✅ Complete (Android) |
| TBD | Backend implementation | ⏳ In Progress |
| TBD | UI screen updates | ⏳ Pending |
| TBD | Production deployment | ⏳ Pending |

---

## Related Issues

- Link to backend task tracking
- Link to UI screen updates task
- Link to testing task

---

## Success Metrics

After full implementation, track:

1. **User Engagement**
   - % of users viewing plan adaptations
   - % of users viewing run-specific adaptations
   - Accept rate for each type

2. **Performance**
   - Adaptation loading time < 500ms
   - 99.9% API availability
   - < 0.1% error rate

3. **Quality**
   - User satisfaction with suggestions (surveyed)
   - Adaptation relevance score
   - Number of users declining suggestions (to identify irrelevant ones)

---

## Next Steps

1. **Backend Team**: Begin database migration and API implementation (see Backend Checklist)
2. **Android Team**: Wait for backend endpoints, then update UI screens
3. **QA Team**: Prepare test cases and coordinate with backend team
4. **Project Manager**: Schedule staging environment testing
5. **DevOps**: Prepare deployment plan and monitoring

---

**Document Status**: Complete (Android code ✅ | Backend ⏳ | UI ⏳)

**Last Updated**: 2026-07-24

**Maintained By**: Mobile Development Team
