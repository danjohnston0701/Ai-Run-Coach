# Walking Session Compatibility Analysis

## Executive Summary

**Current Status**: The AI coaching structure is **heavily optimized for running** and will require **moderate to significant changes** to work effectively for walking sessions. While the underlying architecture is flexible, the coaching prompts, terminology, metrics, and session structure all assume running mechanics and pace dynamics.

---

## Key Findings

### ✅ What WILL Work for Walking

1. **Core Session Architecture**
   - Phase-based session structure (warmup, main effort, cooldown) is applicable to walking
   - Training zone framework (Z1-Z5) works for walking
   - Heart rate-based coaching triggers are valid for walkers
   - Distance and duration tracking is universal

2. **Flexible Coaching Framework**
   - The system is already configured to accept different `workoutType` values (easy, tempo, intervals, long_run, etc.)
   - The AI uses the workout type to adapt coaching tone and messaging
   - The trigger system is activity-agnostic (it fires on HR, pace, phase, distance, not running-specific metrics)

3. **UI/UX Elements**
   - Training plan interface works generically
   - Progress tracking, baseline calculations, injury management all apply to walkers

---

### ❌ Critical Issues for Walking Sessions

#### 1. **Pace Assumptions & Terminology** ⚠️ RESOLVED
- **Problem**: The entire coaching system assumes "pace" means running pace (5:00-7:00 /km is normal)
- **Examples**:
  - Walking pace is typically 8:00-12:00 /km or much slower
  - All prompt instructions reference "running", "pace targets", "hit your splits hard"
  - Pre-run briefs say things like "build speed" and "push hard" which is misaligned with walking
  - Fallback coaching messages are all running-centric: *"Push hard, stay tall, drive those arms"*, *"pick it up"*

**Impact**: Coaching will sound absurd for walking. A walker at 10:00/km pace would receive messages meant for someone running 6:00/km pace.

#### 2. **Metrics & Cues** ⚠️ MAJOR
- **Problem**: All coaching cues assume running mechanics
- **Running-Centric Language**:
  - *"Drive those arms"*, *"push hard"*, *"stay tall"*, *"rep done, shake it out"*
  - References to sprint reps, interval repeats, tempo "pushing"
  - Zone coaching assumes running effort progression

**For Walkers**, coaching should focus on:
- Cadence (steps per minute, not splits)
- Stride length consistency
- Conversational ability at effort
- Terrain adaptation (hills require deliberate walking technique)
- Pace maintenance over distance

#### 3. **Session Structure Mismatch** ⚠️ MODERATE
- Walking interval sessions look different than running intervals
  - Walking repeats are typically longer distance/duration (5-10 min) vs running (2-5 min)
  - Recovery between walking reps is lighter (not "shake it out" recovery)
  - Walking tempo/threshold is at lower absolute pace

- Long-run pacing for walkers is very different than runners
  - Walkers can sustain effort longer at "easy" pace
  - HR doesn't spike the same way on hills

#### 4. **Baseline & Performance Data** ⚠️ MODERATE
- **Problem**: The "runner profile" baseline data is running-specific
- **Affected Fields**:
  - `avgPace`: Assumes running metrics (5:30-7:00/km is intermediate)
  - `recentPaceAvgSecPerKm`: Used to auto-detect fitness level
  - Cadence calculations (optimized for running 160-200 spm)
  - Height-based step length calculations (calibrated for running, not walking)

**For Walkers**:
- Average pace is 10:00-15:00/km typically
- Cadence is 100-140 spm (much lower)
- Biomechanics are completely different

#### 5. **Tone & Encouragement Mismatch** ⚠️ MODERATE
- Tone determination logic assumes running context
- System might choose "intense/motivational" for a walker doing a steady walk
- The coaching philosophy ("build speed", "hit targets hard") is runner-focused

---

## What Needs to Change

### 1. **Session Type System** (HIGH PRIORITY)
Currently, the system tracks `workoutType` but doesn't distinguish between running and walking.

**Required Change**:
```typescript
// Add activity_type field to distinguish
enum ActivityType {
  RUNNING = "running",
  WALKING = "walking"
}

// Store on:
// - trainingPlans.activityType
// - plannedWorkouts.activityType
// - sessionInstructions.activityType
```

### 2. **Coaching Prompts** (HIGH PRIORITY)
Every AI prompt that generates coaching needs to know the activity type and adjust:
- `ai-service.ts`: `generateSessionCoaching()` and `generatePaceUpdate()` need activity-aware prompts
- `session-coaching-service.ts`: `buildSessionCharacteristics()` needs walking-specific session descriptions
- Fallback briefs in both services need activity-specific templates

**Key Changes Needed**:
- Pace is never the "push harder" signal for walkers
- Effort should be framed around heart rate zone and conversational ability
- Messaging should mention "stride", "cadence", "consistency" instead of "speed", "push", "drive"

### 3. **Cadence & Biomechanics** (MODERATE PRIORITY)
- Replace running cadence calculator with walking-specific logic
- Walking optimal cadence: 100-130 spm (not 160-180)
- Different height/speed relationship than running

### 4. **Baseline Calculations** (MODERATE PRIORITY)
- Separate baseline models for runners vs. walkers
- Don't compare a walker's 10:00/km to runner baseline of 6:00/km
- Walking fitness level should be based on different benchmarks

### 5. **Session Structure Templates** (MODERATE PRIORITY)
Update fallback session structures:
- Walking intervals are typically 4-8 min work, 2-4 min recovery
- Walking tempo doesn't exist (walking is inherently "easy" aerobically)
- Walking long-runs follow distance, not pace targets
- Hill walking technique is very different than running

---

## Recommended Implementation Path

### Phase 1: Core Infrastructure (Week 1)
1. Add `activityType` enum and database fields
2. Store activity type on plans and workouts
3. Pass activity type through coaching pipeline

### Phase 2: Coaching Adaptation (Week 1-2)
1. Update `generateSessionCoaching()` prompts to be activity-aware
2. Update `buildSessionCharacteristics()` for walking descriptions
3. Update fallback session structures
4. Update tone determination logic

### Phase 3: Metrics & Cues (Week 2)
1. Separate cadence calculation for walkers
2. Update baseline thresholds for walkers
3. Update all trigger messages and alternative messages

### Phase 4: Testing & Refinement (Week 2-3)
1. Test with sample walking sessions at various intensities
2. Gather user feedback on coaching relevance
3. Refine prompts based on feedback

---

## Detailed Changes by File

### `server/ai-service.ts`
**`generateSessionCoaching()`** (line 4841):
- Add `activityType` to system prompt
- Adjust warmup descriptions (slower pace for walking)
- Adjust trigger conditions (longer phases, different pace zones)
- Replace running-centric examples with walking examples

Example change:
```typescript
// Current (running-focused):
"Push hard, stay tall, drive those arms"

// For walking:
if (params.activityType === 'walking') {
  "Maintain steady stride. Stay upright, engaged core. Keep pace consistent."
}
```

**`generatePaceUpdate()`** (line 502):
- Add `activityType` parameter
- Different pace expectations
- Different coaching focus (not "push harder" for walkers)

**`buildSessionCharacteristics()`** in session-coaching-service.ts:
- Add activity-specific context
- Walking intervals: "Building cardiovascular fitness with brisk walking repeats"
- Walking tempo: Skip (walking doesn't have tempo)
- Walking long-run: "Steady paced distance walking to build aerobic base"

### `server/session-coaching-service.ts`
**`buildFallbackStructure()`** (line 413):
- Add walking-specific templates
- Walking intervals: longer duration (8 min work, 4 min recovery)
- Walking long-run: 100% easy walking, no speed work

### Database Schema
**`shared/schema.ts`**:
```typescript
// Add to trainingPlans table
activityType: varchar("activity_type", { enum: ["running", "walking"] }).default("running"),

// Add to plannedWorkouts table  
activityType: varchar("activity_type", { enum: ["running", "walking"] }).default("running"),

// Add to sessionInstructions table
activityType: varchar("activity_type", { enum: ["running", "walking"] }).default("running"),
```

---

## Testing Checklist

- [ ] Walker creates training plan for 5K walk
- [ ] AI generates appropriate warmup/cooldown (much easier pace)
- [ ] Pre-run brief references walking, not running
- [ ] Interval session uses walking-appropriate work/recovery durations
- [ ] Coaching cues reference cadence, stride, effort — not pace/speed
- [ ] Baseline comparisons use walking benchmarks (not runner benchmarks)
- [ ] Tone determination recognizes walking context
- [ ] Live coaching (pace updates) doesn't say "push harder" at 10:00/km pace
- [ ] Hill coaching adapts for walking (not running hill strategy)

---

## Summary

**Bottom Line**: Your coaching prompts, metrics, and session structures are deeply optimized for running. For walking to work well, you'll need to:

1. ✅ Add an `activityType` field everywhere
2. ✅ Update every coaching prompt to be activity-aware  
3. ✅ Replace running-centric metrics and cues with walking equivalents
4. ✅ Adjust session templates and pacing expectations
5. ✅ Recalibrate baseline models and fitness level detection

**Estimate**: 2-3 weeks of focused work to make walking feel like a first-class experience, not a bastardized running app.

The architecture is flexible enough — it just needs reframing for the walking context.
