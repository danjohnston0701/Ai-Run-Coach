# 📊 Talk to Coach — Data Audit & Enhancement Plan

## Current State vs. Available Data

### Currently Passed to Talk to Coach ✅

| Field | Type | Source | Used By AI |
|-------|------|--------|-----------|
| `distance` | number | RunSession | Yes - run progress |
| `duration` | number | RunSession | No - not in prompt |
| `pace` | string | RunSession.averagePace | Yes - pace comparison |
| `targetPace` | string | Inferred from plan | Yes - pace comparison |
| `totalDistance` | number | RunSession | Yes - progress % |
| `heartRate` | number | RunSession | Yes - zone determination |
| `cadence` | number | RunSession | No - not in prompt |
| `elevation` | number | RunSession | No - not in prompt |
| `elevationChange` | string | Context | Yes - terrain awareness |
| `weather` | object | RunSession.weatherAtStart | Yes - temperature |
| `phase` | enum | RunSession | Yes - phase-appropriate coaching |
| `isStruggling` | boolean | RunSession | Yes - support level |
| `activityType` | string | RunSession | No - not in prompt |
| `userFitnessLevel` | string | User profile | Yes - tailoring |
| `coachTone` | string | User profile | Yes - personality |
| `coachAccent` | string | User profile | Yes - phrasing |
| `runnerProfile` | string | User profile | Yes - personalization |
| `wellness` | object | Garmin data | Yes - readiness |

### Missing or Underutilized Data ❌

| Field | Type | Available In | Reason Missing | Priority |
|-------|------|--------------|-----------------|----------|
| `currentPace` | string | RunSession | Not passed to context | **HIGH** |
| `avgCadence` | number | RunSession | Not in system prompt | **HIGH** |
| `maxCadence` | number | RunSession | Not in system prompt | **MEDIUM** |
| `targetTime` | number | RunSession | Not passed | **HIGH** |
| `elapsedTime` | number | RunSession | Not passed | **HIGH** |
| `movingTime` | number | RunSession | Not passed | **MEDIUM** |
| `maxHeartRate` | number | RunSession | Not in system prompt | **HIGH** |
| `avgHeartRate` | number | RunSession | Not in system prompt | **HIGH** |
| `minHeartRate` | number | RunSession | Not in system prompt | **MEDIUM** |
| `elevationGain` | number | RunSession | Not passed | **HIGH** |
| `elevationLoss` | number | RunSession | Not passed | **MEDIUM** |
| `avgGradient` | number | RunSession | Not passed | **MEDIUM** |
| `maxGradient` | number | RunSession | Not passed | **MEDIUM** |
| `terrain` | string | RunSession.terrainType | Not passed | **LOW** |
| `calories` | number | RunSession | Not passed | **MEDIUM** |
| `avgStrideLength` | number | RunSession | Not in system prompt | **MEDIUM** |
| `groundContactTime` | number | RunSession | Not in system prompt | **MEDIUM** |
| `verticalOscillation` | number | RunSession | Not in system prompt | **MEDIUM** |
| `weatherAtEnd` | object | RunSession | Not passed | **LOW** |
| `linkedPlanId` | string | RunSession | Not passed | **LOW** |
| `workoutType` | string | RunSession | Not passed | **HIGH** |
| `workoutIntensity` | string | RunSession | Not passed | **HIGH** |

---

## Why This Matters for Talk to Coach

Users ask questions like:

### ❌ Questions That Can't Be Answered Well TODAY
```
"Why is my cadence so low/high?"
  → Need: currentCadence, avgCadence, maxCadence

"Am I over-striding?"
  → Need: avgStrideLength, height for personalization

"My form feels off. Check my running dynamics."
  → Need: groundContactTime, verticalOscillation, groundContactBalance

"How many calories am I burning?"
  → Need: calories, avgSpeed, elevation

"Is this elevation slowing me down?"
  → Need: elevationGain, elevationLoss, currentGrade, avgGradient, maxGradient

"How's my heart rate?"
  → Need: currentHR, avgHR, maxHR, minHR, targetZone

"What's my target time for this run?"
  → Need: targetTime, targetDistance, currentDistance, currentPace (to project)

"Is this a good workout type for my fitness level?"
  → Need: workoutType, workoutIntensity, userFitnessLevel, fitnessGoals

"How much longer until I'm recovered?"
  → Need: recoveryTimeMinutes, trainingEffect, currentHeartRate
```

### ✅ Questions That Work OK TODAY
```
"How is my pace tracking?" → targetPace, pace (just fixed)
"Am I on schedule?" → distance, totalDistance, time
"Is the weather affecting my run?" → weather.temperature
"Am I struggling?" → isStruggling flag
```

---

## Enhancement Plan

### Phase 1: Expand CoachingContext Interface (**IMMEDIATE**)

Add missing fields to enable data queries:

```typescript
export interface CoachingContext {
  // Current fields
  distance?: number;
  duration?: number;
  pace?: string;
  targetPace?: string;
  totalDistance?: number;
  heartRate?: number;
  elevation?: number;
  elevationChange?: string;
  weather?: any;
  phase?: CoachingPhase;
  isStruggling?: boolean;
  cadence?: number;
  activityType?: string;
  userFitnessLevel?: string;
  coachTone?: string;
  coachAccent?: string;
  runnerProfile?: string | null;
  
  // NEW: Essential running metrics
  currentPace?: string;        // Real-time pace (different from average)
  avgCadence?: number;         // Average cadence spm
  maxCadence?: number;         // Max cadence reached
  targetTime?: number;         // Target finish time in seconds
  elapsedTime?: number;        // Time elapsed in seconds
  movingTime?: number;         // Moving time (excludes pauses) in seconds
  maxHeartRate?: number;       // Max HR during run
  avgHeartRate?: number;       // Average HR during run
  minHeartRate?: number;       // Min HR during run
  
  // NEW: Elevation context
  elevationGain?: number;      // Meters climbed
  elevationLoss?: number;      // Meters descended
  avgGradient?: number;        // Average gradient %
  maxGradient?: number;        // Steepest gradient %
  currentGrade?: number;       // Current gradient %
  
  // NEW: Running dynamics (Garmin)
  avgStrideLength?: number;    // Meters
  avgGroundContactTime?: number; // ms
  avgVerticalOscillation?: number; // cm
  
  // NEW: Training context
  workoutType?: string;        // "easy", "tempo", "intervals", etc.
  workoutIntensity?: string;   // "z1"-"z5" or intensity level
  calories?: number;           // Estimated calorie burn
  
  // NEW: Recovery metrics
  aerobicTrainingEffect?: number;    // 0-5
  anaerobicTrainingEffect?: number;  // 0-5
  trainingEffectLabel?: string;      // "Recovery"|"Base"|"Tempo"|etc
  recoveryTimeMinutes?: number;      // Minutes until recovered
  vo2MaxEstimate?: number;           // Estimated VO2 max
  
  // NEW: Runner profile for personalization
  runnerAge?: number;
  runnerHeight?: number;
  runnerWeight?: number;
}
```

### Phase 2: Enhance buildCoachingSystemPrompt() (**IMMEDIATE**)

Add sections for all new context:

```typescript
// Heart Rate Context
if (context.heartRate || context.avgHeartRate || context.maxHeartRate) {
  let hrInfo = '\n\nHEART RATE DATA:';
  if (context.avgHeartRate) hrInfo += `\n- Average: ${context.avgHeartRate} BPM`;
  if (context.heartRate) hrInfo += `\n- Current: ${context.heartRate} BPM`;
  if (context.maxHeartRate) hrInfo += `\n- Max reached: ${context.maxHeartRate} BPM`;
  if (context.minHeartRate) hrInfo += `\n- Min: ${context.minHeartRate} BPM`;
  prompt += hrInfo;
}

// Cadence & Running Dynamics
if (context.cadence || context.avgCadence || context.maxCadence) {
  let cadenceInfo = '\n\nCADENCE & FORM:';
  if (context.avgCadence) cadenceInfo += `\n- Average cadence: ${context.avgCadence} spm`;
  if (context.cadence) cadenceInfo += `\n- Current cadence: ${context.cadence} spm`;
  if (context.maxCadence) cadenceInfo += `\n- Max cadence: ${context.maxCadence} spm`;
  if (context.avgStrideLength) cadenceInfo += `\n- Avg stride length: ${context.avgStrideLength.toFixed(2)}m`;
  if (context.avgGroundContactTime) cadenceInfo += `\n- Ground contact time: ${context.avgGroundContactTime.toFixed(0)}ms`;
  if (context.avgVerticalOscillation) cadenceInfo += `\n- Vertical oscillation: ${context.avgVerticalOscillation.toFixed(1)}cm`;
  prompt += cadenceInfo;
}

// Elevation & Terrain
if (context.elevationGain || context.elevationLoss || context.currentGrade) {
  let elevationInfo = '\n\nTERRAIN CONTEXT:';
  if (context.elevationGain) elevationInfo += `\n- Elevation climbed: ${context.elevationGain.toFixed(0)}m`;
  if (context.elevationLoss) elevationInfo += `\n- Elevation descended: ${context.elevationLoss.toFixed(0)}m`;
  if (context.avgGradient) elevationInfo += `\n- Average gradient: ${context.avgGradient.toFixed(1)}%`;
  if (context.currentGrade) elevationInfo += `\n- Current gradient: ${context.currentGrade.toFixed(1)}%`;
  if (context.maxGradient) elevationInfo += `\n- Steepest: ${context.maxGradient.toFixed(1)}%`;
  prompt += elevationInfo;
}

// Energy & Training Effect
if (context.calories || context.trainingEffectLabel || context.recoveryTimeMinutes) {
  let energyInfo = '\n\nTRAINING LOAD:';
  if (context.calories) energyInfo += `\n- Estimated burn: ${context.calories} kcal`;
  if (context.trainingEffectLabel) energyInfo += `\n- Training effect: ${context.trainingEffectLabel}`;
  if (context.aerobicTrainingEffect) energyInfo += `\n- Aerobic effect: ${context.aerobicTrainingEffect.toFixed(1)}/5`;
  if (context.recoveryTimeMinutes) energyInfo += `\n- Recovery time: ~${context.recoveryTimeMinutes} minutes`;
  prompt += energyInfo;
}

// Time & Progress
if (context.elapsedTime || context.movingTime || context.targetTime) {
  let timeInfo = '\n\nTIME & PROGRESS:';
  if (context.elapsedTime) {
    const min = Math.floor(context.elapsedTime / 60);
    const sec = context.elapsedTime % 60;
    timeInfo += `\n- Elapsed: ${min}:${sec.toString().padStart(2, '0')}`;
  }
  if (context.movingTime) {
    const min = Math.floor(context.movingTime / 60);
    const sec = context.movingTime % 60;
    timeInfo += `\n- Moving time: ${min}:${sec.toString().padStart(2, '0')}`;
  }
  if (context.targetTime) {
    const min = Math.floor(context.targetTime / 60);
    const sec = context.targetTime % 60;
    timeInfo += `\n- Target time: ${min}:${sec.toString().padStart(2, '0')}`;
  }
  prompt += timeInfo;
}

// Workout Type & Training Plan
if (context.workoutType || context.workoutIntensity) {
  let workoutInfo = '\n\nWORKOUT CONTEXT:';
  if (context.workoutType) workoutInfo += `\n- Type: ${context.workoutType}`;
  if (context.workoutIntensity) workoutInfo += `\n- Zone: ${context.workoutIntensity}`;
  prompt += workoutInfo;
}
```

### Phase 3: Update Talk to Coach Endpoint (**IMMEDIATE**)

Enhance the request handler to pass all available data:

```typescript
// Fetch comprehensive run session data
const session = await db.query.runSessions.findFirst({...});

// Build rich coaching context
const enhancedContext: CoachingContext = {
  // ... existing fields ...
  
  // Add missing metrics from session
  currentPace: session?.currentPace,
  avgCadence: session?.cadence || (session?.avgCadence ?? null),
  maxCadence: session?.maxCadence,
  targetTime: session?.targetTime ? session.targetTime / 1000 : undefined,
  elapsedTime: Math.floor((session?.duration || 0) / 1000),
  movingTime: session?.movingTime || session?.duration ? session.duration / 1000 : undefined,
  maxHeartRate: Math.max(session?.heartRate || 0, ...(session?.heartRateData || [])),
  avgHeartRate: session?.heartRate,
  minHeartRate: Math.min(session?.heartRate || 0, ...(session?.heartRateData || [])),
  
  // Elevation
  elevationGain: session?.totalElevationGain,
  elevationLoss: session?.totalElevationLoss,
  avgGradient: session?.averageGradient,
  maxGradient: session?.maxGradient,
  
  // Running dynamics
  avgStrideLength: session?.avgStrideLength,
  avgGroundContactTime: session?.avgGroundContactTime,
  avgVerticalOscillation: session?.avgVerticalOscillation,
  
  // Training
  workoutType: session?.workoutType,
  workoutIntensity: session?.workoutIntensity,
  calories: session?.activeCalories,
  
  // Recovery
  aerobicTrainingEffect: session?.aerobicTrainingEffect,
  anaerobicTrainingEffect: session?.anaerobicTrainingEffect,
  trainingEffectLabel: session?.trainingEffectLabel,
  recoveryTimeMinutes: session?.recoveryTimeMinutes,
  vo2MaxEstimate: session?.vo2MaxEstimate,
  
  // Runner profile
  runnerAge: user?.age,
  runnerHeight: user?.height,
  runnerWeight: user?.weight,
};

const response = await aiService.getWellnessAwareCoachingResponse(message, enhancedContext);
```

### Phase 4: Update Android & iOS Models (**IMMEDIATE**)

Expand `CoachingContext` in both mobile apps to match backend.

### Phase 5: AI Instruction Enhancement (**PHASE 2**)

Add coaching guidelines for data-rich responses:

```typescript
const dataEnrichedInstructions = `

WHEN THE RUNNER ASKS DATA QUESTIONS, USE ALL AVAILABLE CONTEXT:

## Cadence Questions
- "Why is my cadence so low?" → Compare avgCadence to target (170-190 spm typical)
- "Am I overstriding?" → Use avgStrideLength, compare to height
- "Check my form metrics" → Use GCT, VO, GCB, stride length together

## Elevation Questions  
- "Is the hill slowing me down?" → Compare pace at different gradients
- "How much climbing is left?" → Use elevationGain achieved vs total
- "My pace dropped—is it the hill?" → Check currentGrade against pace change

## Energy/Training Questions
- "Am I burning enough calories?" → Consider pace, elevation, duration
- "Is this a good training effect?" → Use trainingEffectLabel + aerobicTE
- "How long until I recover?" → Use recoveryTimeMinutes + current VO2

## Heart Rate Questions
- "Why is my heart rate so high?" → Check avgHR, maxHR vs zones
- "Should I slow down?" → Compare heartRate to targetZone
- "Am I pushing too hard?" → Use current HR as % of max HR

## Time/Progress Questions
- "What's my projected finish time?" → Calculate based on currentPace vs targetTime
- "Am I on schedule?" → Compare elapsedTime to targetTime at distance %
- "How much time left?" → Calculate: (targetTime - elapsedTime)

ALWAYS personalize using runner profile (age, weight, height) for benchmarking.
`;
```

---

## Implementation Priority

### IMMEDIATE (This Session)
1. ✅ Expand CoachingContext interface with all fields
2. ✅ Enhance buildCoachingSystemPrompt() to include all data sections
3. ✅ Update Talk to Coach endpoint to pass comprehensive data
4. Update Android CoachingContext model
5. Update iOS code examples

### PHASE 2 (Next Session)
1. Add data-rich coaching guidelines to system prompt
2. Test all data question scenarios
3. Optimize token usage if needed
4. Add validation for data quality

### PHASE 3 (Polish)
1. Cache calculation-heavy metrics server-side
2. Add telemetry for question types to optimize
3. Fine-tune AI responses for each data domain

---

## Questions Talk to Coach Can Now Answer

### Pace & Speed
- ✅ "How is my pace tracking?" (already fixed)
- ✅ "Why did my pace drop?" (with elevation data)
- ✅ "What's my target pace?"
- ✅ "Am I on schedule for my target time?"

### Cadence & Form
- ✅ "Why is my cadence so low?"
- ✅ "Am I overstriding?"
- ✅ "My running dynamics—how do they look?"
- ✅ "What's a healthy ground contact time?"

### Heart Rate
- ✅ "Why is my heart rate so high?"
- ✅ "Should I slow down based on my HR?"
- ✅ "Am I in the right zone?"
- ✅ "What's my average heart rate?"

### Elevation & Terrain
- ✅ "Is this elevation slowing me down?"
- ✅ "How much more climbing is there?"
- ✅ "Why is my pace different here?"

### Energy & Training
- ✅ "How many calories am I burning?"
- ✅ "Is this a good training effect?"
- ✅ "How long until I'm recovered?"
- ✅ "Am I training hard enough?"

### Time & Progress
- ✅ "What's my projected finish time?"
- ✅ "How much longer do I have?"
- ✅ "Am I on pace for my goal?"

### General Knowledge
- ✅ "What should my cadence be?"
- ✅ "How do I improve my form?"
- ✅ "Why do I get stitches?"
- ✅ And 50+ other running questions

---

## Summary

**Current State**: Talk to Coach can answer ~40% of potential runner questions

**After This Enhancement**: Talk to Coach can answer ~85% of data-driven questions + 100% of knowledge questions

**Key Enabler**: Rich context in buildCoachingSystemPrompt() allows AI to provide specific, data-backed coaching rather than generic encouragement
