# Plan Adaptations Backend Updates Required

## Current Implementation Status

### ✅ Existing Backend Code
- Backend uses **Drizzle ORM** with **PostgreSQL**
- Table name: **`plan_adaptations`** (snake_case)
- Existing endpoints:
  - `POST /api/training-plans/adaptations/:adaptationId/accept`
  - `POST /api/training-plans/adaptations/:adaptationId/decline`
  - `GET /api/training-plans/:planId/adaptations/pending`

### ❌ Missing New Endpoints
Need to add:
- `GET /api/runs/:runId/adaptations/pending`
- `GET /api/planned-workouts/:workoutId/adaptations/pending`

### ❌ Missing Database Columns
Need to add to `plan_adaptations` table:
- `run_record_id` (foreign key to `runs` table)
- `planned_workout_id` (foreign key to `planned_workouts` table)

---

## Database Migration (PostgreSQL)

### Add Columns

```sql
-- Add new columns for contextual filtering
ALTER TABLE plan_adaptations ADD COLUMN run_record_id VARCHAR(36) NULL;
ALTER TABLE plan_adaptations ADD COLUMN planned_workout_id VARCHAR(36) NULL;

-- Create indexes for query performance
CREATE INDEX idx_plan_adaptations_run_record_id ON plan_adaptations(run_record_id);
CREATE INDEX idx_plan_adaptations_planned_workout_id ON plan_adaptations(planned_workout_id);
CREATE INDEX idx_plan_adaptations_run_record_status ON plan_adaptations(run_record_id, status);
CREATE INDEX idx_plan_adaptations_workout_status ON plan_adaptations(planned_workout_id, status);

-- Optional: Add foreign key constraints
ALTER TABLE plan_adaptations 
ADD CONSTRAINT fk_plan_adaptations_run_record_id 
FOREIGN KEY (run_record_id) REFERENCES runs(id) ON DELETE CASCADE;

ALTER TABLE plan_adaptations 
ADD CONSTRAINT fk_plan_adaptations_planned_workout_id 
FOREIGN KEY (planned_workout_id) REFERENCES planned_workouts(id) ON DELETE CASCADE;
```

### Verify Migration

```sql
-- Check columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'plan_adaptations'
AND column_name IN ('run_record_id', 'planned_workout_id');

-- Check indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename = 'plan_adaptations'
AND indexname LIKE 'idx_plan_adaptations_%';
```

---

## Drizzle Schema Update

Update `shared/schema.ts` to add the new columns to the `planAdaptations` table:

```typescript
export const planAdaptations = pgTable("plan_adaptations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trainingPlanId: varchar("training_plan_id").notNull().references(() => trainingPlans.id),
  runRecordId: varchar("run_record_id"),           // NEW: FK to runs table
  plannedWorkoutId: varchar("planned_workout_id"), // NEW: FK to planned_workouts table
  adaptationDate: timestamp("adaptation_date").defaultNow(),
  reason: text("reason").notNull(),
  changes: jsonb("changes"),
  aiSuggestion: text("ai_suggestion"),
  status: varchar("status", { length: 50 }).default("pending"),
  userAccepted: boolean("user_accepted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  trainingPlanIdIdx: index("idx_plan_adaptations_training_plan").on(table.trainingPlanId),
  statusIdx: index("idx_plan_adaptations_status").on(table.status),
  compositeIdx: index("idx_plan_adaptations_plan_status").on(table.trainingPlanId, table.status),
  // NEW INDEXES
  runRecordIdIdx: index("idx_plan_adaptations_run_record_id").on(table.runRecordId),
  plannedWorkoutIdIdx: index("idx_plan_adaptations_planned_workout_id").on(table.plannedWorkoutId),
  runRecordStatusIdx: index("idx_plan_adaptations_run_record_status").on(table.runRecordId, table.status),
  workoutStatusIdx: index("idx_plan_adaptations_workout_status").on(table.plannedWorkoutId, table.status),
}));
```

---

## New Service Functions in `adaptation-service.ts`

### 1. Get Run-Specific Adaptations

```typescript
export async function getPendingAdaptationsByRunId(
  runId: string,
  userId: string
): Promise<PlanAdaptation[]> {
  try {
    console.log(`[getPendingAdaptationsByRunId] Querying for run ${runId}, user ${userId}`);
    const startTime = Date.now();
    
    const result = await db
      .select()
      .from(planAdaptations)
      .innerJoin(
        trainingPlans,
        eq(planAdaptations.trainingPlanId, trainingPlans.id)
      )
      .where(
        and(
          eq(planAdaptations.runRecordId, runId),
          eq(trainingPlans.userId, userId),
          eq(planAdaptations.status, "pending")
        )
      );

    const elapsed = Date.now() - startTime;
    console.log(`[getPendingAdaptationsByRunId] ✅ Query completed in ${elapsed}ms. Found ${result.length} results`);
    
    return result.map((r) => r.plan_adaptations);
  } catch (error) {
    console.error("[getPendingAdaptationsByRunId] ❌ Error during query:", error);
    throw error;
  }
}
```

### 2. Get Workout-Specific Adaptations

```typescript
export async function getPendingAdaptationsByWorkoutId(
  workoutId: string,
  userId: string
): Promise<PlanAdaptation[]> {
  try {
    console.log(`[getPendingAdaptationsByWorkoutId] Querying for workout ${workoutId}, user ${userId}`);
    const startTime = Date.now();
    
    const result = await db
      .select()
      .from(planAdaptations)
      .innerJoin(
        trainingPlans,
        eq(planAdaptations.trainingPlanId, trainingPlans.id)
      )
      .where(
        and(
          eq(planAdaptations.plannedWorkoutId, workoutId),
          eq(trainingPlans.userId, userId),
          eq(planAdaptations.status, "pending")
        )
      );

    const elapsed = Date.now() - startTime;
    console.log(`[getPendingAdaptationsByWorkoutId] ✅ Query completed in ${elapsed}ms. Found ${result.length} results`);
    
    return result.map((r) => r.plan_adaptations);
  } catch (error) {
    console.error("[getPendingAdaptationsByWorkoutId] ❌ Error during query:", error);
    throw error;
  }
}
```

### 3. Update `getPendingAdaptations()` to Filter Plan-Level Only

The existing function should be updated to exclude run-specific and workout-specific:

```typescript
export async function getPendingAdaptations(
  trainingPlanId: string,
  userId: string
): Promise<PlanAdaptation[]> {
  try {
    console.log(`[getPendingAdaptations] Querying for plan ${trainingPlanId}, user ${userId}`);
    const startTime = Date.now();
    
    const result = await db
      .select()
      .from(planAdaptations)
      .innerJoin(
        trainingPlans,
        eq(planAdaptations.trainingPlanId, trainingPlans.id)
      )
      .where(
        and(
          eq(planAdaptations.trainingPlanId, trainingPlanId),
          eq(trainingPlans.userId, userId),
          eq(planAdaptations.status, "pending"),
          // Filter to ONLY plan-level adaptations
          isNull(planAdaptations.runRecordId),
          isNull(planAdaptations.plannedWorkoutId)
        )
      );

    const elapsed = Date.now() - startTime;
    console.log(`[getPendingAdaptations] ✅ Query completed in ${elapsed}ms. Found ${result.length} results`);
    
    return result.map((r) => r.plan_adaptations);
  } catch (error) {
    console.error("[getPendingAdaptations] ❌ Error during query:", error);
    throw error;
  }
}
```

---

## New Routes in `routes-adaptation.ts`

Add these new endpoints:

```typescript
/**
 * GET /api/runs/:runId/adaptations/pending
 * Get all pending adaptations for a specific run.
 */
router.get(
  "/runs/:runId/adaptations/pending",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { runId } = req.params;
      const userId = req.user!.userId;

      console.log(`[Get Run Adaptations] Starting query for run ${runId}, user ${userId}`);
      const startTime = Date.now();
      
      const adaptations = await getPendingAdaptationsByRunId(runId, userId);
      
      const elapsed = Date.now() - startTime;
      console.log(`[Get Run Adaptations] ✅ Completed in ${elapsed}ms. Found ${adaptations.length} adaptations`);

      res.json({
        adaptations,
        count: adaptations.length,
      });
    } catch (error) {
      console.error("[Get Run Adaptations] ❌ Error:", error);
      res.status(500).json({ error: "Failed to fetch adaptations" });
    }
  }
);

/**
 * GET /api/planned-workouts/:workoutId/adaptations/pending
 * Get all pending adaptations for a specific planned workout.
 */
router.get(
  "/planned-workouts/:workoutId/adaptations/pending",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workoutId } = req.params;
      const userId = req.user!.userId;

      console.log(`[Get Workout Adaptations] Starting query for workout ${workoutId}, user ${userId}`);
      const startTime = Date.now();
      
      const adaptations = await getPendingAdaptationsByWorkoutId(workoutId, userId);
      
      const elapsed = Date.now() - startTime;
      console.log(`[Get Workout Adaptations] ✅ Completed in ${elapsed}ms. Found ${adaptations.length} adaptations`);

      res.json({
        adaptations,
        count: adaptations.length,
      });
    } catch (error) {
      console.error("[Get Workout Adaptations] ❌ Error:", error);
      res.status(500).json({ error: "Failed to fetch adaptations" });
    }
  }
);
```

---

## Adaptation Generation Logic

When creating new adaptations, populate the new fields based on context:

### Plan-Level Adaptation
```typescript
// When suggesting changes to the overall plan
const adaptation = {
  id: generateUUID(),
  trainingPlanId: planId,
  runRecordId: null,           // ← NULL for plan-level
  plannedWorkoutId: null,      // ← NULL for plan-level
  reason: "missed_workout",
  aiSuggestion: "...",
  changes: { ... },
  status: "pending",
  createdAt: new Date()
};
```

### Run-Specific Adaptation
```typescript
// When suggesting changes based on a specific run
const adaptation = {
  id: generateUUID(),
  trainingPlanId: planId,
  runRecordId: runId,          // ← SET to run ID
  plannedWorkoutId: null,      // ← NULL for run-specific
  reason: "run_data_feedback",
  aiSuggestion: "Great pace today!",
  changes: { ... },
  status: "pending",
  createdAt: new Date()
};
```

### Workout-Specific Adaptation
```typescript
// When suggesting changes based on a completed planned workout
const adaptation = {
  id: generateUUID(),
  trainingPlanId: planId,
  runRecordId: null,           // ← NULL for workout-specific
  plannedWorkoutId: workoutId, // ← SET to workout ID
  reason: "run_data_feedback",
  aiSuggestion: "Hill repeats went well!",
  changes: { ... },
  status: "pending",
  createdAt: new Date()
};
```

---

## Import Statements

Make sure these are imported in `adaptation-service.ts`:

```typescript
import { isNull } from "drizzle-orm";
```

And in `routes-adaptation.ts`:

```typescript
import {
  acceptAndApplyAdaptation,
  declineAdaptation,
  getPendingAdaptations,
  getPendingAdaptationsByRunId,      // NEW
  getPendingAdaptationsByWorkoutId,  // NEW
} from "./adaptation-service";
```

---

## Testing

### Unit Tests for New Query Functions

```typescript
describe("getPendingAdaptationsByRunId", () => {
  it("should return only run-specific adaptations for a given run", async () => {
    const adaptations = await getPendingAdaptationsByRunId("run-123", "user-456");
    expect(adaptations.every(a => a.runRecordId === "run-123")).toBe(true);
    expect(adaptations.every(a => a.status === "pending")).toBe(true);
  });

  it("should return empty array if run has no adaptations", async () => {
    const adaptations = await getPendingAdaptationsByRunId("nonexistent", "user-456");
    expect(adaptations.length).toBe(0);
  });

  it("should prevent access to other user's runs", async () => {
    // Run belongs to user-abc
    const adaptations = await getPendingAdaptationsByRunId("run-from-user-abc", "user-xyz");
    expect(adaptations.length).toBe(0); // Should not return anything
  });
});

describe("getPendingAdaptationsByWorkoutId", () => {
  it("should return only workout-specific adaptations for a given workout", async () => {
    const adaptations = await getPendingAdaptationsByWorkoutId("workout-789", "user-456");
    expect(adaptations.every(a => a.plannedWorkoutId === "workout-789")).toBe(true);
  });
});

describe("getPendingAdaptations (plan-level)", () => {
  it("should return only plan-level adaptations (not run or workout-specific)", async () => {
    const adaptations = await getPendingAdaptations("plan-123", "user-456");
    expect(adaptations.every(a => a.runRecordId === null)).toBe(true);
    expect(adaptations.every(a => a.plannedWorkoutId === null)).toBe(true);
  });
});
```

---

## Summary of Changes

| Item | Change |
|------|--------|
| **Database** | Add `run_record_id`, `planned_workout_id` columns + indexes |
| **Drizzle Schema** | Update `planAdaptations` table definition |
| **Services** | Add 2 new query functions + update existing |
| **Routes** | Add 2 new GET endpoints |
| **Logic** | Populate new fields when creating adaptations |
| **Tests** | Add test cases for new filtering logic |

---

## Deployment Order

1. ✅ Android code complete (already done)
2. Run database migration
3. Update Drizzle schema
4. Add new service functions
5. Add new API routes
6. Update adaptation creation logic
7. Run tests
8. Deploy
9. Monitor logs for new endpoints

---

## Migration Checklist

- [ ] Database migration executed
- [ ] Verify new columns exist
- [ ] Verify indexes created
- [ ] Drizzle schema updated
- [ ] Adaptation service updated
- [ ] Routes updated
- [ ] Adaptation creation logic updated
- [ ] Unit tests added
- [ ] Integration tests pass
- [ ] Deployed to staging
- [ ] Deployed to production
