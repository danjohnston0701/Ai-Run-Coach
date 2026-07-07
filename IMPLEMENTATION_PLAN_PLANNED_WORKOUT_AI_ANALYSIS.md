# Implementation Plan: Planned Workout Context in Post-Run AI Analysis

## Overview
Enhance post-run AI analysis to compare actual performance against planned workout expectations, providing hyper-relevant, session-aware coaching insights.

**Example Outcome:**
- Planned: Zone 2 easy run, avg HR 120-135 bpm, jog 3min / walk 2min intervals
- Actual: User averaged 145 bpm during jog intervals (going too hard)
- AI Comment: "You ran harder than planned. Your avg HR was 145 bpm but zone 2 targets 120-135 bpm. This is good for building aerobic capacity, but next time try to stay more controlled. Zone 2 should feel conversational."

---

## Data Flow & Schema

### 1. Current Data Relationships
```
runs (table)
├── plannedWorkoutId → references plannedWorkouts.id
├── workoutType (varchar)
├── workoutIntensity (varchar)
├── workoutDescription (varchar)
└── linkedPlanId (varchar)

plannedWorkouts (table)
├── workoutType: text (easy, tempo, intervals, long_run, hill_repeats, recovery, rest)
├── distance: real (km)
├── duration: integer (seconds)
├── targetPace: text (min/km)
├── intensity: text (z1, z2, z3, z4, z5)
│
├── HR Zone Info:
│  ├── hrZoneNumber: integer (1-5)
│  ├── hrZoneMinBpm: integer
│  ├── hrZoneMaxBpm: integer
│  ├── hrZoneScenario: text ('device' | 'history' | 'effort')
│  └── effortDescription: text
│
├── Interval Workouts (when workoutType = 'intervals' or 'hill_repeats'):
│  ├── intervalCount: integer (e.g., 6 for 6x400m)
│  ├── intervalDistanceMeters: integer (e.g., 400)
│  ├── intervalDurationSeconds: integer (e.g., 120 for 2min)
│  ├── restDistanceMeters: integer
│  ├── restDurationSeconds: integer
│  ├── intervalTargetPace: text (mm:ss/km for work phase)
│  ├── restTargetPace: text (mm:ss/km for recovery)
│  ├── intervalHeartRateMin: integer
│  ├── intervalHeartRateMax: integer
│  └── restHeartRateMax: integer
│
├── Session Context:
│  ├── sessionGoal: text (build_fitness, develop_speed, active_recovery, endurance)
│  ├── sessionIntent: text
│  ├── description: text
│  └── instructions: text
│
└── sessionInstructionsId → references sessionInstructions.id
    └── contains coaching style, tone, structure

sessionInstructions (table)
├── preRunBrief: text
├── sessionStructure: jsonb (contains phases, triggers, guidance)
├── coachingStyle: jsonb (tone, encouragementLevel, detailDepth)
└── insightFilters: jsonb (include/exclude topics)
```

---

## Backend Changes Required

### File: `server/routes.ts` (POST /api/runs/:id/comprehensive-analysis)

**Location:** Lines 2745-2850 (generateComprehensiveRunAnalysis call)

**Changes:**

1. **Fetch Linked Planned Workout** (after fetching the run, around line 2720)
```typescript
// After: const sessionInstructions = await storage.getSessionInstructions(...)
// Add:
let linkedPlannedWorkout = null;
if (run.plannedWorkoutId) {
  linkedPlannedWorkout = await storage.getPlannedWorkout(run.plannedWorkoutId);
}
```

2. **Pass Planned Workout Data to AI Analysis** (lines 2752-2848)

Add new parameters to the `generateComprehensiveRunAnalysis()` call:

```typescript
const analysis = await aiService.generateComprehensiveRunAnalysis({
  // ... existing parameters ...
  
  // NEW: Planned workout context for comparative analysis
  plannedWorkout: linkedPlannedWorkout ? {
    workoutType: linkedPlannedWorkout.workoutType,
    distance: linkedPlannedWorkout.distance,
    duration: linkedPlannedWorkout.duration,
    targetPace: linkedPlannedWorkout.targetPace,
    intensity: linkedPlannedWorkout.intensity,
    
    // HR Zone expectations
    hrZoneNumber: linkedPlannedWorkout.hrZoneNumber,
    hrZoneMinBpm: linkedPlannedWorkout.hrZoneMinBpm,
    hrZoneMaxBpm: linkedPlannedWorkout.hrZoneMaxBpm,
    hrZoneScenario: linkedPlannedWorkout.hrZoneScenario,
    effortDescription: linkedPlannedWorkout.effortDescription,
    
    // Interval/repeat workout details
    intervalCount: linkedPlannedWorkout.intervalCount,
    intervalDistanceMeters: linkedPlannedWorkout.intervalDistanceMeters,
    intervalDurationSeconds: linkedPlannedWorkout.intervalDurationSeconds,
    restDistanceMeters: linkedPlannedWorkout.restDistanceMeters,
    restDurationSeconds: linkedPlannedWorkout.restDurationSeconds,
    intervalTargetPace: linkedPlannedWorkout.intervalTargetPace,
    restTargetPace: linkedPlannedWorkout.restTargetPace,
    intervalHeartRateMin: linkedPlannedWorkout.intervalHeartRateMin,
    intervalHeartRateMax: linkedPlannedWorkout.intervalHeartRateMax,
    restHeartRateMax: linkedPlannedWorkout.restHeartRateMax,
    
    // Session context
    sessionGoal: linkedPlannedWorkout.sessionGoal,
    sessionIntent: linkedPlannedWorkout.sessionIntent,
    description: linkedPlannedWorkout.description,
    instructions: linkedPlannedWorkout.instructions,
  } : null,
});
```

### File: `server/ai-service.ts` (generateComprehensiveRunAnalysis function)

**Location:** Definition of `generateComprehensiveRunAnalysis()` function

**Changes:**

1. **Update Type Definition** for the input parameter
```typescript
interface ComprehensiveAnalysisInput {
  runData: Run;
  // ... existing fields ...
  
  // NEW: Planned workout context
  plannedWorkout?: {
    workoutType: string;
    distance?: number;
    duration?: number;
    targetPace?: string;
    intensity?: string;
    hrZoneNumber?: number;
    hrZoneMinBpm?: number;
    hrZoneMaxBpm?: number;
    hrZoneScenario?: string;
    effortDescription?: string;
    intervalCount?: number;
    intervalDistanceMeters?: number;
    intervalDurationSeconds?: number;
    restDistanceMeters?: number;
    restDurationSeconds?: number;
    intervalTargetPace?: string;
    restTargetPace?: string;
    intervalHeartRateMin?: number;
    intervalHeartRateMax?: number;
    restHeartRateMax?: number;
    sessionGoal?: string;
    sessionIntent?: string;
    description?: string;
    instructions?: string;
  } | null;
}
```

2. **Build Comparative Context in Prompt** (find where the main system prompt is constructed)

Add a section that generates comparison text:

```typescript
// Build planned workout context for comparison
let plannedWorkoutContext = "";
if (input.plannedWorkout) {
  const pw = input.plannedWorkout;
  
  // For easy/recovery/zone 2 runs
  if (["easy", "recovery"].includes(pw.workoutType) && pw.hrZoneMinBpm && pw.hrZoneMaxBpm) {
    const actualAvgHR = input.garminActivity?.averageHeartRate || runData.avgHeartRate;
    const actualMaxHR = input.garminActivity?.maxHeartRate || runData.maxHeartRate;
    
    plannedWorkoutContext += `
## Planned Workout: ${pw.workoutType.toUpperCase()} RUN
- **Target HR Zone**: ${pw.hrZoneNumber} (${pw.hrZoneMinBpm}-${pw.hrZoneMaxBpm} bpm)
- **Effort Description**: ${pw.effortDescription || 'Maintain steady pace in zone'}
- **Target Pace**: ${pw.targetPace || 'conversational pace'}
- **Planned Distance**: ${pw.distance} km
- **Session Goal**: ${pw.sessionGoal}

## Actual Performance vs Plan:
- **Actual Avg HR**: ${actualAvgHR} bpm (${actualAvgHR > pw.hrZoneMaxBpm ? "ABOVE" : actualAvgHR < pw.hrZoneMinBpm ? "BELOW" : "WITHIN"} target zone)
- **Actual Max HR**: ${actualMaxHR} bpm
- **HR Adherence**: ${this.calculateHRAdherence(actualAvgHR, pw.hrZoneMinBpm, pw.hrZoneMaxBpm)}%
`;
  }
  
  // For interval workouts
  if (pw.workoutType === "intervals" && pw.intervalCount) {
    plannedWorkoutContext += `
## Planned Interval Workout:
- **Structure**: ${pw.intervalCount}x${pw.intervalDistanceMeters}m (or ${pw.intervalDurationSeconds}s)
- **Work Intervals**:
  - Target Pace: ${pw.intervalTargetPace}
  - Target HR: ${pw.intervalHeartRateMin}-${pw.intervalHeartRateMax} bpm
- **Recovery Intervals**:
  - Target Pace: ${pw.restTargetPace}
  - Target HR: up to ${pw.restHeartRateMax} bpm
- **Session Goal**: ${pw.sessionGoal}

## Analysis Guidance:
Comment on how well the user executed the interval structure:
- Did they maintain proper work/recovery pacing?
- Did they stay within target HR zones for work intervals?
- Were recovery intervals properly controlled?
- Did fatigue accumulation affect later intervals?
`;
  }
  
  // For tempo runs
  if (pw.workoutType === "tempo") {
    plannedWorkoutContext += `
## Planned Tempo Run:
- **Target Pace**: ${pw.targetPace}
- **Target HR Zone**: ${pw.intensity} (${pw.hrZoneMinBpm}-${pw.hrZoneMaxBpm} bpm)
- **Duration**: ${pw.duration ? Math.floor(pw.duration / 60) : "?"} minutes
- **Session Goal**: ${pw.sessionGoal}

## Analysis Guidance:
Assess whether the user maintained target tempo pace and HR throughout the effort.
Comment on consistency and any pace/HR drift during the workout.
`;
  }
  
  // Generic context for other workout types
  if (!["easy", "recovery", "intervals", "tempo"].includes(pw.workoutType)) {
    plannedWorkoutContext += `
## Planned Workout: ${pw.workoutType.toUpperCase()}
- **Target Intensity**: ${pw.intensity}
- **Target Pace**: ${pw.targetPace}
- **Target Distance**: ${pw.distance} km
- **Session Goal**: ${pw.sessionGoal}
- **Description**: ${pw.description}
`;
  }
}
```

3. **Update Main System Prompt** (find the main instructional prompt)

Inject the planned workout context into the analysis instructions:

```typescript
// In the main system prompt, add before asking for analysis:
${plannedWorkoutContext ? `
# PLANNED WORKOUT CONTEXT
${plannedWorkoutContext}

# ANALYSIS INSTRUCTIONS
When generating insights, compare the actual run performance against these planned expectations.
Highlight any significant deviations from targets (pace, HR, duration, structure) and explain
what they mean for the user's fitness and what they should focus on next time.
` : `
# ANALYSIS INSTRUCTIONS
Standard analysis mode - no specific planned workout to compare against.
`}
```

4. **Helper Function to Calculate HR Adherence**

Add this helper method to the ai-service class:

```typescript
private calculateHRAdherence(
  actualAvgHR: number,
  targetMinHR: number,
  targetMaxHR: number
): number {
  // Calculate what % of the run was in target zone
  // This is a simplified example - actual implementation would analyze HR data throughout the run
  
  const zone = targetMaxHR - targetMinHR;
  const center = (targetMinHR + targetMaxHR) / 2;
  const deviation = Math.abs(actualAvgHR - center);
  
  // If deviation > zone/2, adherence drops
  const adherence = Math.max(0, 100 - (deviation / zone * 100));
  return Math.round(adherence);
}
```

---

## Storage Layer Changes

### File: `server/storage.ts`

**Add Method:** (if not already exists)

```typescript
async getPlannedWorkout(plannedWorkoutId: string): Promise<PlannedWorkout | undefined> {
  const [workout] = await db
    .select()
    .from(plannedWorkouts)
    .where(eq(plannedWorkouts.id, plannedWorkoutId))
    .limit(1);
  
  return workout || undefined;
}
```

Check if this method exists. If not, add it to the storage interface and implementation.

---

## Example Analysis Outputs

### Example 1: Easy Run with HR Zone Expectations
**Plan:** Zone 2 easy run, target HR 120-135 bpm
**Actual:** Avg HR 145 bpm

**AI Analysis Output:**
```
"You ran harder than planned today. Your average heart rate was 145 bpm, which is above 
your zone 2 target of 120-135 bpm. This suggests you were working harder than intended 
for an easy run. While this is good for building aerobic capacity, zone 2 runs should 
feel conversational - you should be able to hold a full conversation without gasping for air.

Next time, try to dial it back. Focus on maintaining the conversational effort level 
rather than pushing the pace. This will help you build your aerobic base more effectively 
without accumulating unnecessary fatigue."
```

### Example 2: Interval Workout Structure
**Plan:** 6x400m intervals with 2:00 recovery, work intervals at 5:00/km, recovery at 6:00/km
**Actual:** First 3 intervals at 5:05/km, last 3 at 5:45/km (fatigue showing)

**AI Analysis Output:**
```
"Good interval execution, though you showed fatigue in the final reps. Your first three 
intervals were spot-on at 5:05/km pace. However, the last three intervals slowed to 
5:45/km, suggesting glycogen depletion or accumulated fatigue.

For next time: Consider whether you need better fueling before hard workouts, or if 
reducing the number of reps would be more sustainable. The fact that you slowed by 
40 seconds per km tells us the volume was on the edge of what you can currently handle."
```

### Example 3: Tempo Run
**Plan:** 8 minute tempo at 5:30/km in zone 3-4 HR (140-155 bpm)
**Actual:** Started at 5:25/km, drifted to 5:50/km, HR climbed from 142 to 165 bpm

**AI Analysis Output:**
```
"Your tempo run shows good initial effort but lost pace near the end. You started strong 
at 5:25/km but drifted to 5:50/km in the final minutes as your heart rate climbed to 165 bpm 
(above your target zone). This is a classic sign of going out too hard.

Strategy for next tempo: Start slightly more conservatively (closer to 5:35/km), then 
try to maintain that throughout rather than fading. Remember, tempo runs are about 
consistent effort, not fast-starts-then-hang-on."
```

---

## Testing Strategy

### Unit Tests to Add (in ai-service.test.ts or similar)

1. **Test: Easy run comparison with HR data**
   - Input: Easy run plan with HR zones, actual run with different avg HR
   - Expected: Analysis mentions HR adherence

2. **Test: Interval workout analysis**
   - Input: Interval plan with splits, actual run with fatigue-induced slowing
   - Expected: Analysis comments on split consistency and fatigue

3. **Test: Null planned workout**
   - Input: Run with no planned workout linked
   - Expected: Standard analysis (no comparative context)

4. **Test: Tempo run pace drift**
   - Input: Tempo plan, actual with pace degradation
   - Expected: Analysis highlights drift and provides strategy

### Integration Tests

1. POST to `/api/runs/:id/comprehensive-analysis` with `plannedWorkoutId` set
   - Verify planned workout is fetched
   - Verify AI analysis includes comparative language

2. POST with null `plannedWorkoutId`
   - Verify graceful fallback to standard analysis

---

## Prompt Engineering Considerations

### Key Principles

1. **Contextual Coaching**: The AI should understand the workout *intent* and comment on whether the user achieved it
   
2. **Progressive Overload**: For interval workouts, point out if the user is ready for more volume or needs to consolidate
   
3. **Pacing Strategy**: For tempo/threshold runs, analyze if pacing was controlled or if the user went out too hard
   
4. **HR Training**: For zone-based runs, reinforce proper effort level and what it means for fitness development
   
5. **Personalization**: Reference the specific session goal (e.g., "build_fitness", "active_recovery") in the analysis

### Prompt Template Sections

```
PLANNED WORKOUT CONTEXT:
- Type: [workout type]
- Goal: [session goal]
- Targets: [pace, HR zone, structure]

ACTUAL PERFORMANCE:
- [Actual metrics]
- [Adherence %]

COMPARATIVE ANALYSIS:
1. Did the user achieve the session goal?
2. How did actual performance vs plan inform fitness level?
3. What should they focus on next time?
4. Is this session sustainable for the training plan?
```

---

## Implementation Order

1. **Phase 1**: Add `getPlannedWorkout()` to storage layer
2. **Phase 2**: Fetch planned workout in routes.ts and pass to AI service
3. **Phase 3**: Update AI service type definitions
4. **Phase 4**: Build comparative context string in ai-service.ts
5. **Phase 5**: Inject context into main system prompt
6. **Phase 6**: Test with interval, tempo, easy, and recovery runs
7. **Phase 7**: Refine prompt based on output quality

---

## Risk Mitigation

1. **Null Pointer**: If `plannedWorkout` is null, analysis should fall back to standard mode
   - **Mitigation**: Check `plannedWorkout ? ... : ...` in prompt construction

2. **Missing Fields**: Planned workout might be missing some optional fields
   - **Mitigation**: Use optional chaining and provide sensible defaults

3. **AI Hallucination**: AI might make up specific comparisons if data is ambiguous
   - **Mitigation**: Only include clear, numerical comparisons in the context

4. **Prompt Size**: Adding all this context might increase token usage
   - **Mitigation**: Only include relevant sections based on workout type

---

## Success Metrics

- ✅ AI analysis mentions planned vs actual performance for linked workouts
- ✅ Analysis includes specific HR zone feedback when applicable
- ✅ Interval workout analysis comments on split consistency
- ✅ Tempo runs include pacing consistency comments
- ✅ Easy runs emphasize proper zone control
- ✅ Fallback works for unlinked runs
- ✅ No increase in API latency (< 100ms overhead)
- ✅ Token usage increase is < 15%

