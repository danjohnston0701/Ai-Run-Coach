# Plan Adaptations Backend Implementation Checklist

## Overview

This document provides a step-by-step checklist for implementing the enhanced plan adaptations system on the backend.

---

## Database Schema Updates

### 1. Add New Columns to Adaptations Table

**Status**: ⬜ TODO

```sql
-- Add foreign key columns to adaptations table
ALTER TABLE adaptations ADD COLUMN run_record_id VARCHAR(36) NULL;
ALTER TABLE adaptations ADD COLUMN planned_workout_id VARCHAR(36) NULL;

-- Add indexes for performance
ALTER TABLE adaptations ADD INDEX idx_run_record_id (run_record_id);
ALTER TABLE adaptations ADD INDEX idx_planned_workout_id (planned_workout_id);
ALTER TABLE adaptations ADD INDEX idx_combo_run_status (run_record_id, status);
ALTER TABLE adaptations ADD INDEX idx_combo_workout_status (planned_workout_id, status);

-- Add foreign keys
ALTER TABLE adaptations 
ADD CONSTRAINT fk_adaptations_run_record_id 
FOREIGN KEY (run_record_id) REFERENCES runs(id) ON DELETE CASCADE;

ALTER TABLE adaptations 
ADD CONSTRAINT fk_adaptations_planned_workout_id 
FOREIGN KEY (planned_workout_id) REFERENCES planned_workouts(id) ON DELETE CASCADE;
```

### 2. Verify Existing Constraints

**Status**: ⬜ TODO

- [ ] Confirm training_plan_id foreign key exists
- [ ] Verify on_delete CASCADE behavior is correctly configured
- [ ] Test constraint enforcement

---

## API Endpoint Implementation

### 1. Plan-Level Adaptations (Existing)

**Status**: ✅ ALREADY EXISTS

**Endpoint**: `GET /api/training-plans/{planId}/adaptations/pending`

**Requirements**:
- [ ] Returns adaptations where `run_record_id IS NULL` AND `planned_workout_id IS NULL`
- [ ] Filters by `status = 'pending'`
- [ ] Only returns adaptations for given plan

**Query**:
```sql
SELECT * FROM adaptations
WHERE training_plan_id = ?
  AND run_record_id IS NULL
  AND planned_workout_id IS NULL
  AND status = 'pending'
ORDER BY adaptation_date DESC;
```

---

### 2. Run-Specific Adaptations (NEW)

**Status**: ⬜ TODO

**Endpoint**: `GET /api/runs/{runId}/adaptations/pending`

**Requirements**:
- [ ] Returns adaptations where `run_record_id = {runId}`
- [ ] Filters by `status = 'pending'`
- [ ] Validates run exists and belongs to authenticated user
- [ ] Returns appropriate 404 if run not found

**Query**:
```sql
SELECT a.* FROM adaptations a
INNER JOIN runs r ON a.run_record_id = r.id
WHERE a.run_record_id = ?
  AND a.status = 'pending'
  AND r.user_id = ?  -- Current authenticated user
ORDER BY a.adaptation_date DESC;
```

**Response**: `PendingAdaptationsResponse`
```json
{
  "adaptations": [
    {
      "id": "adapt-123",
      "training_plan_id": "plan-456",
      "run_record_id": "run-789",
      "planned_workout_id": null,
      "adaptation_date": "2026-07-24T13:43:22Z",
      "reason": "run_data_feedback",
      "status": "pending",
      "ai_suggestion": "Consider increasing weekly mileage...",
      "changes": { ... }
    }
  ],
  "count": 1
}
```

---

### 3. Workout-Specific Adaptations (NEW)

**Status**: ⬜ TODO

**Endpoint**: `GET /api/planned-workouts/{workoutId}/adaptations/pending`

**Requirements**:
- [ ] Returns adaptations where `planned_workout_id = {workoutId}`
- [ ] Filters by `status = 'pending'`
- [ ] Validates workout exists and belongs to authenticated user's plan
- [ ] Returns appropriate 404 if workout not found

**Query**:
```sql
SELECT a.* FROM adaptations a
INNER JOIN planned_workouts pw ON a.planned_workout_id = pw.id
INNER JOIN training_plans tp ON pw.training_plan_id = tp.id
WHERE a.planned_workout_id = ?
  AND a.status = 'pending'
  AND tp.user_id = ?  -- Current authenticated user
ORDER BY a.adaptation_date DESC;
```

**Response**: `PendingAdaptationsResponse`
```json
{
  "adaptations": [
    {
      "id": "adapt-456",
      "training_plan_id": "plan-456",
      "run_record_id": null,
      "planned_workout_id": "workout-789",
      "adaptation_date": "2026-07-24T14:22:18Z",
      "reason": "run_data_feedback",
      "status": "pending",
      "ai_suggestion": "Your hill repeats went well. Let's add more...",
      "changes": { ... }
    }
  ],
  "count": 1
}
```

---

### 4. Accept Adaptation (Existing)

**Status**: ✅ ALREADY EXISTS

**Endpoint**: `POST /api/training-plans/adaptations/{adaptationId}/accept`

**No changes needed** - Works with both plan-level and run/workout-specific adaptations.

**Verification Checklist**:
- [ ] Confirms adaptation status is 'pending'
- [ ] Applies changes to relevant workouts
- [ ] Updates adaptation status to 'accepted'
- [ ] Logs the action
- [ ] Returns success response

---

### 5. Decline Adaptation (Existing)

**Status**: ✅ ALREADY EXISTS

**Endpoint**: `POST /api/training-plans/adaptations/{adaptationId}/decline`

**No changes needed** - Works with both plan-level and run/workout-specific adaptations.

**Verification Checklist**:
- [ ] Confirms adaptation status is 'pending'
- [ ] Does NOT apply changes
- [ ] Updates adaptation status to 'declined'
- [ ] Logs the action
- [ ] Returns success response

---

## Adaptation Generation Logic

### 1. When Creating Plan-Level Adaptations

**Status**: ⬜ TODO

When the system generates an adaptation that applies to the entire plan:

```python
def create_plan_adaptation(plan_id, reason, suggestion, changes):
    adaptation = {
        'id': generate_uuid(),
        'training_plan_id': plan_id,
        'run_record_id': None,              # <-- NULL for plan-level
        'planned_workout_id': None,         # <-- NULL for plan-level
        'adaptation_date': now(),
        'reason': reason,
        'status': 'pending',
        'ai_suggestion': suggestion,
        'changes': changes,
        'created_at': now(),
        'updated_at': now()
    }
    save_to_database(adaptation)
    return adaptation
```

---

### 2. When Creating Run-Specific Adaptations

**Status**: ⬜ TODO

When the system generates an adaptation as a result of analyzing a specific run:

```python
def create_run_specific_adaptation(plan_id, run_id, reason, suggestion, changes):
    # Validate run exists and belongs to the plan
    run = get_run_by_id(run_id)
    assert run.training_plan_id == plan_id, "Run must belong to plan"
    
    adaptation = {
        'id': generate_uuid(),
        'training_plan_id': plan_id,
        'run_record_id': run_id,            # <-- SET to run ID
        'planned_workout_id': None,         # <-- NULL for run-specific
        'adaptation_date': now(),
        'reason': reason,
        'status': 'pending',
        'ai_suggestion': suggestion,
        'changes': changes,
        'created_at': now(),
        'updated_at': now()
    }
    save_to_database(adaptation)
    return adaptation
```

**Trigger Points**:
- [ ] After run is analyzed
- [ ] After AI generates suggestions based on run metrics
- [ ] Before sending notification to user

---

### 3. When Creating Workout-Specific Adaptations

**Status**: ⬜ TODO

When the system generates an adaptation as a result of completing a specific planned workout:

```python
def create_workout_specific_adaptation(plan_id, workout_id, reason, suggestion, changes):
    # Validate workout exists and belongs to the plan
    workout = get_planned_workout_by_id(workout_id)
    assert workout.training_plan_id == plan_id, "Workout must belong to plan"
    
    adaptation = {
        'id': generate_uuid(),
        'training_plan_id': plan_id,
        'run_record_id': None,              # <-- NULL for workout-specific
        'planned_workout_id': workout_id,   # <-- SET to workout ID
        'adaptation_date': now(),
        'reason': reason,
        'status': 'pending',
        'ai_suggestion': suggestion,
        'changes': changes,
        'created_at': now(),
        'updated_at': now()
    }
    save_to_database(adaptation)
    return adaptation
```

**Trigger Points**:
- [ ] After planned workout is linked to completed run
- [ ] After AI analyzes workout execution quality
- [ ] When comparing planned vs actual metrics

---

## Authentication & Authorization

### 1. Verify User Access

**Status**: ⬜ TODO

For all three endpoints, ensure:

```python
# Example for run-specific endpoint
@app.get("/api/runs/{run_id}/adaptations/pending")
def get_run_adaptations(run_id: str, current_user: User):
    run = get_run_by_id(run_id)
    
    # Verify ownership
    assert run.user_id == current_user.id, "Unauthorized"
    
    adaptations = query_adaptations_by_run(run_id)
    return PendingAdaptationsResponse(adaptations=adaptations, count=len(adaptations))
```

**Checklist**:
- [ ] Plan-level endpoint: Verify user owns the plan
- [ ] Run-specific endpoint: Verify user owns the run
- [ ] Workout-specific endpoint: Verify user owns the plan (through workout)
- [ ] Return 403 Forbidden if unauthorized
- [ ] Return 404 Not Found if resource doesn't exist (for privacy)

---

## Data Migration

### 1. Handle Existing Adaptations

**Status**: ⬜ TODO

Existing adaptations without `run_record_id` or `planned_workout_id` populated are treated as plan-level:

```python
# Migration script
def migrate_existing_adaptations():
    """
    Existing adaptations are already plan-level.
    No data migration needed, but verify all have NULL values for new columns.
    """
    # Optional: Add indexes
    execute_sql("""
        ALTER TABLE adaptations 
        ADD INDEX idx_run_record_id (run_record_id);
        
        ALTER TABLE adaptations 
        ADD INDEX idx_planned_workout_id (planned_workout_id);
    """)
    
    # Verify
    count_with_run_id = count_adaptations("WHERE run_record_id IS NOT NULL")
    count_with_workout_id = count_adaptations("WHERE planned_workout_id IS NOT NULL")
    
    assert count_with_run_id == 0, "Unexpected run_record_id values"
    assert count_with_workout_id == 0, "Unexpected planned_workout_id values"
    
    print("✅ Migration complete. All existing adaptations are plan-level.")
```

### 2. Backfill Run References (Optional)

**Status**: ⬜ TODO (Optional)

If you want to link existing adaptations to specific runs:

```python
def backfill_run_references():
    """
    Match adaptations to runs based on creation date/time proximity.
    This is optional and should be done carefully.
    """
    adaptations = query_adaptations("WHERE run_record_id IS NULL AND planned_workout_id IS NULL")
    
    for adaptation in adaptations:
        # Find runs created around this time
        nearby_runs = query_runs(
            user_id=adaptation.user_id,
            created_after=adaptation.adaptation_date - timedelta(hours=2),
            created_before=adaptation.adaptation_date + timedelta(hours=1)
        )
        
        if len(nearby_runs) == 1:
            # Confidently link to this run
            update_adaptation(adaptation.id, run_record_id=nearby_runs[0].id)
            print(f"✅ Linked adaptation {adaptation.id} to run {nearby_runs[0].id}")
        elif len(nearby_runs) > 1:
            # Ambiguous - log but don't link
            print(f"⚠️ Adaptation {adaptation.id} matches multiple runs. Manual review needed.")
        else:
            # No matching runs
            print(f"ℹ️ Adaptation {adaptation.id} remains plan-level.")
```

---

## Testing

### Unit Tests

**Status**: ⬜ TODO

```python
# test_adaptations.py

def test_create_plan_level_adaptation():
    """Plan-level adaptations have no run or workout ID"""
    adaptation = create_plan_adaptation(
        plan_id="plan-123",
        reason="ahead_of_schedule",
        suggestion="You're ahead of schedule",
        changes={}
    )
    assert adaptation.run_record_id is None
    assert adaptation.planned_workout_id is None

def test_create_run_specific_adaptation():
    """Run-specific adaptations have run_record_id set"""
    adaptation = create_run_specific_adaptation(
        plan_id="plan-123",
        run_id="run-456",
        reason="run_data_feedback",
        suggestion="Your pace was steady",
        changes={}
    )
    assert adaptation.run_record_id == "run-456"
    assert adaptation.planned_workout_id is None

def test_create_workout_specific_adaptation():
    """Workout-specific adaptations have planned_workout_id set"""
    adaptation = create_workout_specific_adaptation(
        plan_id="plan-123",
        workout_id="workout-789",
        reason="run_data_feedback",
        suggestion="Great hill repeats",
        changes={}
    )
    assert adaptation.run_record_id is None
    assert adaptation.planned_workout_id == "workout-789"
```

### Integration Tests

**Status**: ⬜ TODO

```python
def test_get_plan_level_adaptations():
    """GET /api/training-plans/{planId}/adaptations/pending returns only plan-level"""
    # Create mix of adaptations
    create_plan_adaptation(plan_id, ...)
    create_run_specific_adaptation(plan_id, run_id, ...)
    create_workout_specific_adaptation(plan_id, workout_id, ...)
    
    # Fetch plan-level only
    response = client.get(f"/api/training-plans/{plan_id}/adaptations/pending")
    
    assert response.status_code == 200
    assert response.json()["count"] == 1  # Only plan-level
    assert response.json()["adaptations"][0]["run_record_id"] is None
    assert response.json()["adaptations"][0]["planned_workout_id"] is None

def test_get_run_specific_adaptations():
    """GET /api/runs/{runId}/adaptations/pending returns only run-specific"""
    # Create mix of adaptations
    create_plan_adaptation(plan_id, ...)
    create_run_specific_adaptation(plan_id, run_id, ...)
    create_workout_specific_adaptation(plan_id, workout_id, ...)
    
    # Fetch run-specific only
    response = client.get(f"/api/runs/{run_id}/adaptations/pending")
    
    assert response.status_code == 200
    assert response.json()["count"] == 1  # Only run-specific
    assert response.json()["adaptations"][0]["run_record_id"] == run_id

def test_authorization_run_specific():
    """Cannot fetch run adaptations for other user's run"""
    other_user_run = create_run(user_id="other-user")
    
    response = client.get(
        f"/api/runs/{other_user_run.id}/adaptations/pending",
        headers={"Authorization": f"Bearer {current_user_token}"}
    )
    
    assert response.status_code == 404  # Or 403, depending on security policy
```

---

## Deployment Checklist

**Status**: ⬜ TODO

- [ ] Database migrations applied to production
- [ ] New indexes created for performance
- [ ] API endpoints implemented and tested
- [ ] Authorization checks in place
- [ ] Error handling for invalid IDs
- [ ] Logging added for debugging
- [ ] Documentation updated
- [ ] Android client code updated
- [ ] End-to-end testing completed
- [ ] Monitoring/alerts configured
- [ ] Rollback plan documented

---

## Monitoring & Metrics

**Status**: ⬜ TODO

Track these metrics after deployment:

```
- Endpoint latency:
  GET /api/training-plans/{planId}/adaptations/pending
  GET /api/runs/{runId}/adaptations/pending
  GET /api/planned-workouts/{workoutId}/adaptations/pending

- Error rates (4xx, 5xx responses)

- User action rates:
  - Percentage of users viewing adaptations
  - Percentage accepting vs declining
  - Time to action

- Database metrics:
  - Query execution time
  - Index hit rate
  - Lock contention
```

---

## Summary

| Task | Status | Owner |
|------|--------|-------|
| Add DB columns | ⬜ TODO | Backend |
| Implement run-specific endpoint | ⬜ TODO | Backend |
| Implement workout-specific endpoint | ⬜ TODO | Backend |
| Update adaptation creation logic | ⬜ TODO | Backend |
| Write unit tests | ⬜ TODO | Backend |
| Write integration tests | ⬜ TODO | Backend |
| Update monitoring | ⬜ TODO | DevOps |
| Deploy to staging | ⬜ TODO | DevOps |
| Deploy to production | ⬜ TODO | DevOps |

---

## Questions & Notes

- [ ] Should we migrate existing data to link to runs? (Optional)
- [ ] What's the expected volume of run-specific adaptations?
- [ ] Should we add pagination for adaptation endpoints?
- [ ] Do we need caching for frequently accessed adaptations?
- [ ] Should we send notifications for new run-specific adaptations?
