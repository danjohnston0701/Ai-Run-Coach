# Plan Adaptations: Quick Start Guide

## 🎯 The Problem

Previously, **all adaptations** created for a training plan were visible on **every run record** linked to that plan, even if they had nothing to do with that specific run.

**Example**: User completes a 1km recovery run. They see 10 plan-level adaptations + 5 adaptations from completely different runs. Confusing and cluttered.

---

## ✅ The Solution

Adaptations are now **contextually filtered**:

| Adaptation Type | Where It Appears | When It's Created |
|-----------------|------------------|-------------------|
| 🏃 **Plan-Level** | Plan Adaptation Screen | Based on overall plan analysis |
| 🎯 **Run-Specific** | This Run's Summary | Based on THIS run's performance |
| 💪 **Workout-Specific** | This Run's Summary | Based on THIS planned workout |

---

## 📱 User Experience

### Before (Cluttered)
```
Run Summary for: 1km Recovery Run
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Suggestions:
  1. Increase mileage (from run on 7/20)
  2. Add more speed work (from run on 7/22)
  3. Recovery pace looks good (THIS run ✓)
  4. Consider hill repeats (from workout on 7/18)
  5. Improve cadence (from run on 7/21)
  ... 5 more plan-level suggestions

❌ User sees 10 irrelevant suggestions + 1 relevant one
```

### After (Clean)
```
Run Summary for: 1km Recovery Run
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ Based on This Run:
  • Recovery pace looks good! ✓
    Keep up the steady intensity.

(If they want plan-level suggestions, they go to Plan > Adaptations)

✅ User sees 1 relevant suggestion for this specific run
```

---

## 🏗️ Architecture at a Glance

```
┌──────────────────────────────────────────────────┐
│          ADAPTATION DATABASE                     │
├──────────────────────────────────────────────────┤
│  Adaptation 1: Plan-level (run_id=null)          │
│  Adaptation 2: Run-specific (run_id="run-123")   │
│  Adaptation 3: Workout-specific (workout_id="w") │
│  Adaptation 4: Plan-level (run_id=null)          │
└──────────────────────────────────────────────────┘
        ↓ ↓ ↓ ↓
        (API filters based on context)
        ↓
┌──────────────────┬──────────────────┬───────────────┐
│ PLAN SCREEN      │ RUN SUMMARY 1    │ RUN SUMMARY 2 │
├──────────────────┼──────────────────┼───────────────┤
│ Adaptation 1     │ Adaptation 2     │ Nothing for   │
│ Adaptation 4     │ (run-specific)   │ this run      │
│ (plan-level)     │                  │               │
└──────────────────┴──────────────────┴───────────────┘
```

---

## 💻 How to Use (For Developers)

### Load Plan-Level Adaptations
```kotlin
// In Plan Adaptation Screen
adaptationViewModel.loadPendingAdaptations(planId)
// Returns only adaptations where runRecordId == null && workoutId == null
```

### Load Run-Specific Adaptations
```kotlin
// In Run Summary Screen
runSummaryViewModel.loadPendingAdaptationsByRunId(runId)
// Returns only adaptations where runRecordId == runId
```

### Load Workout-Specific Adaptations
```kotlin
// In Run Summary Screen
runSummaryViewModel.loadPendingAdaptationsByWorkoutId(workoutId)
// Returns only adaptations where workoutId == workoutId
```

---

## 🔄 Data Model

### What Changed?

```kotlin
// OLD
data class PlanAdaptation(
    val date: LocalDate,
    val reason: String,
    val change: String,
    val applied: Boolean
)

// NEW
data class PlanAdaptation(
    val id: String,                      // ← NEW
    val date: LocalDate,
    val reason: String,
    val change: String,
    val applied: Boolean,
    val runRecordId: String? = null,     // ← NEW (non-null = run-specific)
    val plannedWorkoutId: String? = null // ← NEW (non-null = workout-specific)
)
```

**Key Insight**: The nullable fields act as pointers. If both are null, it's plan-level.

---

## 🚀 Backend Checklist

To make this work, backend needs to:

- [ ] Add `run_record_id` column to adaptations table
- [ ] Add `planned_workout_id` column to adaptations table
- [ ] Create indexes for performance
- [ ] Implement `GET /api/runs/{runId}/adaptations/pending`
- [ ] Implement `GET /api/planned-workouts/{workoutId}/adaptations/pending`
- [ ] Update adaptation creation to populate `run_record_id` when analyzing a run
- [ ] Update adaptation creation to populate `planned_workout_id` when analyzing a workout

See **PLAN_ADAPTATIONS_BACKEND_CHECKLIST.md** for detailed instructions.

---

## 📊 Data Examples

### Plan-Level Adaptation
```json
{
  "id": "adapt-001",
  "training_plan_id": "plan-123",
  "run_record_id": null,         ← Null = plan-level
  "planned_workout_id": null,    ← Null = not workout-specific
  "reason": "missed_workout",
  "ai_suggestion": "I noticed you missed Monday's workout. Let's reschedule...",
  "status": "pending"
}
```

### Run-Specific Adaptation
```json
{
  "id": "adapt-002",
  "training_plan_id": "plan-123",
  "run_record_id": "run-456",    ← Non-null = run-specific
  "planned_workout_id": null,    ← Null = not workout-specific
  "reason": "run_data_feedback",
  "ai_suggestion": "Great effort on that hill! Let's add more elevation next week.",
  "status": "pending"
}
```

### Workout-Specific Adaptation
```json
{
  "id": "adapt-003",
  "training_plan_id": "plan-123",
  "run_record_id": null,              ← Null = not run-specific
  "planned_workout_id": "workout-789", ← Non-null = workout-specific
  "reason": "run_data_feedback",
  "ai_suggestion": "Your tempo pace was perfect today. Let's increase duration.",
  "status": "pending"
}
```

---

## ✨ Key Features

### 1. **Backward Compatible**
Existing adaptations without `runRecordId` or `workoutId` are treated as plan-level. No migration needed.

### 2. **Automatic Filtering**
The ViewModel handles filtering automatically. UI just calls the right method.

### 3. **Consistent Accept/Decline**
Same accept/decline endpoints work for all three types. No special handling needed.

### 4. **Logging Built-In**
Debug logs show exactly what was fetched and filtered. Easy to troubleshoot.

---

## 🎓 Common Scenarios

### Scenario 1: User Completes Recovery Run
```
1. RunSummaryScreen loads
2. Calls: loadPendingAdaptationsByRunId("run-123")
3. API returns 1 adaptation:
   "Recovery pace looks good!"
4. UI displays: "Based on This Run" section
5. User can accept/decline just this one
```

### Scenario 2: User Views Plan Adaptations
```
1. Plan Adaptation Screen loads
2. Calls: loadPendingAdaptations(planId)
3. API returns 5 plan-level adaptations:
   - "Missed Monday workout"
   - "Ahead of schedule"
   - etc.
4. UI displays: All 5 plan suggestions
5. User can accept/decline any of them
```

### Scenario 3: User Has Multiple Runs in Plan
```
Run 1 (7/24): 1 run-specific adaptation
Run 2 (7/25): 2 run-specific adaptations  ← Different suggestions!
Run 3 (7/26): 0 run-specific adaptations

Plus: 5 plan-level adaptations visible everywhere

Total: 24 suggestions, but user sees only 1-2 at a time in context
```

---

## ⚠️ Common Mistakes

### ❌ DON'T
```kotlin
// Wrong - will show ALL adaptations (mix of plan/run/workout)
val adaptations = apiService.getPendingAdaptations(planId)
_pendingAdaptations.value = adaptations
```

### ✅ DO
```kotlin
// Correct - filters to plan-level only
val response = apiService.getPendingAdaptations(planId)
val planLevel = response.adaptations.filter {
    it.runRecordId == null && it.plannedWorkoutId == null
}
_pendingAdaptations.value = planLevel
// OR just use the ViewModel method which does this for you:
adaptationViewModel.loadPendingAdaptations(planId)
```

### ❌ DON'T
```kotlin
// Wrong - mixing contexts
// Plan screen calls:
runSummaryViewModel.loadPendingAdaptationsByRunId(runId)
// Should only be done on run summary screen!
```

### ✅ DO
```kotlin
// Correct - right screen, right method
// Plan screen:
adaptationViewModel.loadPendingAdaptations(planId)

// Run summary screen:
runSummaryViewModel.loadPendingAdaptationsByRunId(runId)
```

---

## 🐛 Troubleshooting

### Problem: No adaptations showing on run summary
```
1. Check logcat for: "Fetching run-specific adaptations for runId="
2. Verify runId is correct (non-null, valid format)
3. Check API response: is it returning any adaptations with run_record_id set?
4. Look for errors in logcat with "❌ FAILED"
```

### Problem: Plan adaptations showing on run summary
```
1. Check if you're calling loadPendingAdaptations() instead of 
   loadPendingAdaptationsByRunId()
2. Verify that run-specific adaptations have run_record_id populated
3. Check API filtering - should not return plan-level in /api/runs/{id}/...
```

### Problem: Acceptance not working
```
1. Verify adaptationId is being passed correctly
2. Check API endpoint: /api/training-plans/adaptations/{id}/accept
3. Look for 404 or 403 errors in response
4. Verify backend has permission to update this adaptation
```

---

## 📚 Documentation Index

For more details, see:

| Document | Purpose |
|----------|---------|
| `PLAN_ADAPTATIONS_UPDATE.md` | Complete technical reference |
| `PLAN_ADAPTATIONS_ARCHITECTURE.md` | Diagrams and data flows |
| `PLAN_ADAPTATIONS_BACKEND_CHECKLIST.md` | Backend implementation guide |
| `PLAN_ADAPTATIONS_CODE_CHANGES.md` | Exact code changes made |
| `PLAN_ADAPTATIONS_IMPLEMENTATION_SUMMARY.md` | Project overview |

---

## 🎉 Success Criteria

✅ Android code changes complete
⏳ Backend endpoints implemented
⏳ UI screens updated
⏳ Integration tested
⏳ Production deployed

---

## Questions?

Refer to the relevant documentation or check the implementation examples in this codebase.

**Version**: 1.0  
**Status**: Ready for backend implementation  
**Last Updated**: 2026-07-24
