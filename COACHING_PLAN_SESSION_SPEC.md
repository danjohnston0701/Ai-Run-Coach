# AI Run Coach - Coaching Plan & Session Logic Complete Specification

**Document Version:** 1.0  
**Last Updated:** March 25, 2026  
**Target Platform:** iOS (Native or Swift) + Android Reference  
**Scope:** Training plan generation, plan management UI, session coaching, and session-specific AI prompts

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Plan Generation & Setup](#plan-generation--setup)
3. [Plan Display & Management](#plan-display--management)
4. [Weekly Structure & Session Tiles](#weekly-structure--session-tiles)
5. [Workout Detail & Pre-Run Instructions](#workout-detail--pre-run-instructions)
6. [Session-Specific AI Coaching](#session-specific-ai-coaching)
7. [Session Coaching Context & Triggers](#session-coaching-context--triggers)
8. [Data Models](#data-models)
9. [API Endpoints](#api-endpoints)
10. [Known Features & Requirements](#known-features--requirements)

---

## Overview

### What is a Coaching Plan?

A **Coaching Plan** is a **structured, AI-generated 4-12 week training program** tailored to a specific running goal (5K, 10K, Half Marathon, Marathon). Unlike generic run tracking, a coaching plan:

- **Defines the goal** with both distance AND target time (e.g., "5km in 20 minutes")
- **Creates week-by-week workouts** with specific types (easy, tempo, intervals, long run, recovery, rest)
- **Adapts to the user** based on experience level, injuries, and available training days
- **Provides AI-determined coaching** specific to each session type and user profile
- **Tracks progress** across weeks with completion metrics
- **Continues to evolve** as the user completes workouts and provides feedback

### Key Differentiator from Generic Runs

Generic runs use:
- **Generic coaching triggers** (pace deviation, milestone messages, motivation)
- **One-size-fits-all AI coaching** based on run type

Coaching plan sessions use:
- **Plan-aware coaching** that knows the week number, goal, and workout purpose
- **Session-specific instructions** determined by AI at plan generation time
- **Contextual coaching triggers** based on the workout's role in the plan
- **Technique coaching** adapted to the specific challenge (uphill, intervals, etc.)

---

## Plan Generation & Setup

### Generate Plan Flow

**User inputs:**
1. **Goal Type**: 5K, 10K, Half Marathon, Marathon, Ultra, or Custom
2. **Target Distance**: Primary distance goal (auto-populated based on goal type, editable)
3. **Target Time** (optional but critical): Hours/Minutes/Seconds format
   - If provided, this becomes the KEY differentiator for plan design
   - Example: "5km in under 20 minutes" is DIFFERENT from "5km whenever"
4. **Duration**: 4, 8, 12, or 16 weeks
5. **Experience Level**: Newcomer → Professional (9 levels)
6. **Training Days**: 3-6 days per week
7. **Injuries/Conditions**: List with status (recovering, healed, chronic)
8. **Regular Sessions**: Existing weekly commitments (e.g., parkrun every Saturday)

### GeneratePlanRequest Data Model

```kotlin
data class GeneratePlanRequest(
    @SerializedName("goalType") val goalType: String,                  // "5k", "10k", "half_marathon", "marathon", "custom"
    @SerializedName("targetDistance") val targetDistance: Double,      // km
    @SerializedName("targetTime") val targetTime: Int?,                // seconds (CRITICAL for AI)
    @SerializedName("targetDate") val targetDate: String?,             // ISO date
    @SerializedName("durationWeeks") val durationWeeks: Int?,          // 4, 8, 12, 16
    @SerializedName("experienceLevel") val experienceLevel: String,    // "Beginner", "Regular", "Advanced", etc.
    @SerializedName("daysPerWeek") val daysPerWeek: Int,              // 3-6
    @SerializedName("goalId") val goalId: String?,                     // Link to user's saved goal
    @SerializedName("firstSessionStart") val firstSessionStart: String, // "flexible", "today", "tomorrow"
    @SerializedName("regularSessions") val regularSessions: List<RegularSessionRequest>,
    @SerializedName("age") val age: Int?,
    @SerializedName("gender") val gender: String?,
    @SerializedName("height") val height: Double?,                     // cm
    @SerializedName("weight") val weight: Double?,                     // kg
    @SerializedName("injuries") val injuries: List<InjuryRequest> = emptyList(),
    @SerializedName("userTimezone") val userTimezone: String?          // IANA timezone
)
```

### Critical: Target Time Handling

**The target time is ESSENTIAL for coaching plan design:**

```kotlin
// In GeneratePlanViewModel.kt
fun generatePlan() {
    val targetTimeSecs: Int? = if (_hasTimeGoal.value) {
        val hours = _targetHours.value.toIntOrNull() ?: 0
        val mins  = _targetMinutes.value.toIntOrNull() ?: 0
        val secs  = _targetSeconds.value.toIntOrNull() ?: 0
        (hours * 3600 + mins * 60 + secs).takeIf { it > 0 }
    } else null
    
    val request = GeneratePlanRequest(
        goalType = _goalType.value,
        targetDistance = distKm,
        targetTime = targetTimeSecs,  // ← PASSED TO AI
        // ... other parameters
    )
}
```

The backend AI uses this to:
- Calculate required pace for the goal
- Design tempo/threshold workouts at appropriate intensity
- Structure the plan progression (easy→tempo→speed→taper)
- Estimate achievable outcome with given training load

---

## Plan Display & Management

### Plan Overview Screen (Coaching Programme Screen)

#### Plan Header Card
Displays at the top of the screen:

```
[Plan Status Badge: Active/Paused/Completed]

5K Training Plan                    1/12 weeks [Progress bar 8%]
5km in 20 minutes                   3/35 workouts done
```

**Components:**
- **Title**: `formatGoalWithTime()` function combines goal + target time
  - With time: "Target 5km in 20 minutes"
  - Without time: "Target 5km"
- **Progress**: Shows current week and completion percentage
- **Tap action**: Expands to full plan details

#### Coaching Plan Summary Section
Shows AI-generated analysis:
- Week focus area (endurance, speed, recovery, race prep)
- Key milestones for this week
- Overall plan strategy

#### Your Baseline Section (if available)
Pre-plan statistics from user's run history:
- Current average pace: 5:05/km
- Runs per week: 2.3x
- Average distance: 4.4 km (converted from metres)
- Longest run: 9.9 km (converted from metres)
- Based on: Last 9 runs

#### Plan Setup Section
Fixed plan configuration:
- **Experience Level**: "Regular runner"
- **Sessions per week**: "4 sessions per week"
- **Programme**: "12-week programme"
- **Target**: `formatGoalWithTime()` output
  - Example: "Target 5km in 20 minutes"

The target time is displayed HERE to remind users of their goal pace throughout training.

---

## Weekly Structure & Session Tiles

### Week Card Layout

Each week in the "FULL PROGRAMME" section:

```
┌─────────────────────────────────┐
│ Week 5        Base building week │ 1/2 [━━━━━━━━━━━━ 50%]
│ Base building week              │
├─────────────────────────────────┤
│ 🔵 Scheduled: 1  🟢 Completed: 1  🟠 Missed: 0  ⚫ Skipped: 0 │
├─────────────────────────────────┤
│ ✓ Mon Easy recovery run                             ✓ │
│     5.0km 5:30/km                                    │
│                                                    │
│ ⚠️ Wed Tempo run to improve lactate threshold         │
│     4.0km 5:00/km                                    │
│                                                    │
│ ✓ Sat Long run                                       ✓ │
│     8.5km 5:45/km                                    │
└─────────────────────────────────┘
```

#### Tile Status Indicators

Based on `scheduledDate` comparison with current time:

- **🟢 Completed (Green checkmark)**: `isCompleted = true && completedRunId != null`
- **⚠️ Missed (Orange info icon)**: `!isCompleted && date <= now`
- **⚫ Skipped (Grey X)**: `isCompleted = true && completedRunId = null` (marked done without GPS)
- **No icon (Scheduled)**: `!isCompleted && date > now`

#### Week Stats Chips

Four chips show the breakdown:
1. **Scheduled** (Blue): Future workouts not yet completed
2. **Completed** (Green): Finished with GPS run data
3. **Missed** (Orange): Past deadline, not completed
4. **Skipped** (Grey): Marked done without running

**Important:** A workout can't count in both Completed and Skipped. The logic is:
- If `isSkipped()` = true, exclude from Completed count
- Only count as Completed if `isCompleted && !isSkipped()`

#### Workout Row Details

Each workout in expanded view:
- **Day**: Sun, Mon, Tue, Wed, Thu, Fri, Sat
- **Status Icon**: Single icon (✓, ⚠️, ❌, or none)
- **Title**: Description or auto-generated workout type label
- **Specs**: Distance (km), Target pace (min/km), Intensity zone (Z1-Z5)
- **Tap action**: Navigate to WorkoutDetailScreen

---

## Workout Detail & Pre-Run Instructions

### WorkoutDetailScreen

Displays when user taps on a session from the programme:

```
[Header: Easy recovery run]
[5.0km | 5:30/km | Zone 2]

[Instruction text box]
"This is an easy, conversational-pace run to build your aerobic 
base. Focus on relaxed effort. Stop immediately if something hurts."

[Buttons]
🔵 Start This Workout (with GPS acquisition)
░░ Mark as Done (no GPS)
░░ Skip Session
```

#### Components

**Workout Metadata:**
- Workout type badge (colored: "Easy", "Tempo", etc.)
- Title (description or auto-label)
- Target distance, pace, heart rate zone
- Duration/time estimate
- Interval metadata (if applicable)

**Pre-Run Instructions:**
- Fetched from `WorkoutDetails.instructions` field
- Set during plan generation by AI
- Explains the session purpose and how to approach it

**Action Buttons:**
1. **Start This Workout** (Blue button)
   - Acquires GPS fix
   - Routes to full RunSession tracking with plan context in `RunSetupConfig`
   - Passes `workoutId`, `trainingPlanId`, `workoutType`, etc.

2. **Mark as Done (no GPS)** (Outlined button)
   - Sets `isCompleted = true` but `completedRunId = null`
   - Counts as "Skipped" in weekly stats
   - No AI coaching analysis generated

3. **Skip Session** (Grey outlined button)
   - Sets `isSkipped() = true`
   - Appears in "Skipped" count for the week
   - Can be restored/unmarked

---

## Session-Specific AI Coaching

### The AI Coaching Determination Process

When a user starts a coaching plan session, the AI **pre-determines the coaching strategy** based on:

1. **Workout Type**: Easy, Tempo, Intervals, Long Run, Recovery, Hill Repeats
2. **Plan Context**: Week number, goal type, progression phase
3. **User Profile**: Experience level, fitness level, age, goals
4. **Training Load**: What they've completed, recovery status
5. **Technique Focus**: What skills to emphasize for this session type

This is different from generic runs which determine coaching reactively during the run.

### SessionInstructionsResponse

When starting a plan workout, the app fetches:

```
GET /api/workouts/{workoutId}/session-instructions
```

**Response structure:**

```kotlin
data class SessionInstructionsResponse(
    val workoutId: String,
    val preRunBrief: String,              // "Today you're doing a tempo run at the lactate threshold..."
    val sessionStructure: SessionStructure,
    val aiDeterminedTone: String,         // "motivational", "calm", "direct", "playful", etc.
    val aiDeterminedIntensity: String,    // "relaxed", "moderate", "intense"
    val coachingStyle: CoachingStyle,
    val insightFilters: InsightFilters,
    val toneReasoning: String?            // Why AI chose this tone
)

data class SessionStructure(
    val type: String,                     // "interval_training", "zone_2", "recovery", "tempo", etc.
    val goal: String?,                    // "build_fitness", "develop_speed", "active_recovery"
    val phases: List<SessionPhase>?,      // warmup, interval_1_of_6, recovery, cooldown
    val coachingTriggers: List<CoachingTrigger>?
)

data class SessionPhase(
    val name: String,                     // "warmup", "interval_1_of_6", "cooldown"
    val durationKm: Double?,
    val durationSeconds: Int?,
    val description: String?,
    val repetitions: Int?
)

data class CoachingTrigger(
    val phase: String,                    // Which phase
    val trigger: String,                  // "at_start", "at_end", "every_km", "pace_deviation", etc.
    val message: String?                  // Suggested coaching message
)

data class CoachingStyle(
    val tone: String,                     // The tone to use
    val encouragementLevel: String,       // "low", "moderate", "high"
    val detailDepth: String,              // "minimal", "moderate", "detailed"
    val technicalDepth: String?           // "simple", "moderate", "advanced"
)

data class InsightFilters(
    val include: List<String>?,           // ["pace_deviation", "effort_level", "recovery_quality"]
    val exclude: List<String>?            // ["500m_summary", "km_splits", "generic_motivation"]
)
```

### Example: Tempo Run Session

**Pre-run Brief:**
```
"Today you're running a tempo run at your lactate threshold pace (5:00/km).
This is the fastest pace you can sustain for extended periods. Focus on
maintaining steady effort — don't start too fast. You'll run 3 km at this
pace with 5 minutes easy running before and after."
```

**Session Structure:**
- Type: "tempo_training"
- Goal: "develop_speed"
- Phases:
  1. "warmup" (10 minutes, easy pace)
  2. "tempo_main_set" (15 minutes at LT pace, 3 km)
  3. "cooldown" (10 minutes, easy pace)

**Coaching Triggers:**
- Phase: "warmup" → Trigger: "at_end" → Message: "You're warmed up. Time to shift gears. The tempo run starts now — aim for 5:00/km."
- Phase: "tempo_main_set" → Trigger: "rep_start" → Message: "Tempo work starts. Hold steady effort."
- Phase: "tempo_main_set" → Trigger: "every_km" → Message: "[Current pace] — great work!"
- Phase: "tempo_main_set" → Trigger: "pace_deviation" → Message: "Pace is drifting. Tighten up!"
- Phase: "cooldown" → Trigger: "at_start" → Message: "Well done! Easy pace now to recover."

**Coaching Style:**
- Tone: "motivational" (because tempo work is challenging)
- Encouragement Level: "high"
- Detail Depth: "moderate"
- Technical Depth: "moderate"

**Insight Filters:**
- Include: ["pace_consistency", "threshold_effort", "split_analysis"]
- Exclude: ["generic_motivation", "cadence_coaching", "detailed_form_coaching"]

---

## Session Coaching Context & Triggers

### EliteCoachingRequest (During Run)

While running a plan session, every coaching request includes plan context:

```kotlin
data class EliteCoachingRequest(
    // Core run metrics
    @SerializedName("coachingType") val coachingType: String,
    @SerializedName("distance") val distance: Double,
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("currentPace") val currentPace: String,
    @SerializedName("averagePace") val averagePace: String,
    @SerializedName("elapsedTime") val elapsedTime: Long,
    
    // Coach personalization
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    
    // ==================== PLAN CONTEXT ====================
    // These fields differentiate plan sessions from generic runs
    @SerializedName("trainingPlanId") val trainingPlanId: String?,
    @SerializedName("workoutId") val workoutId: String?,
    @SerializedName("workoutType") val workoutType: String?,        // easy/tempo/intervals/long_run
    @SerializedName("workoutDescription") val workoutDescription: String?,
    @SerializedName("planGoalType") val planGoalType: String?,      // 5k/10k/half_marathon/marathon
    @SerializedName("planWeekNumber") val planWeekNumber: Int?,
    @SerializedName("planTotalWeeks") val planTotalWeeks: Int?,
    
    // Advanced context
    @SerializedName("targetTime") val targetTime: Long?,             // seconds (CRITICAL)
    @SerializedName("targetPace") val targetPace: String?,           // from plan
    @SerializedName("milestonePercent") val milestonePercent: Int?,  // 25%, 50%, 75%, etc.
    @SerializedName("runPhase") val runPhase: String?,               // EARLY, BUILDING, SUSTAINING, FINISHING
    @SerializedName("techniqueCategory") val techniqueCategory: String?, // posture, cadence, breathing, etc.
    @SerializedName("fatigueLevel") val fatigueLevel: String?        // FRESH, MODERATE, FATIGUED
)
```

### How AI Uses Plan Context

When the coaching request includes plan context:

**Example: User is 5km into a 10km long run in Week 8 of a 10K plan**

```
Input to AI:
- trainingPlanId: "plan_abc123"
- workoutId: "workout_456"
- workoutType: "long_run"
- planGoalType: "10k"
- planWeekNumber: 8
- planTotalWeeks: 10
- targetTime: 3600 (seconds, = 60 minutes for 10km)
- targetPace: "6:00/km"
- currentPace: "6:05/km"
- milestonePercent: 50
- runPhase: "SUSTAINING"

AI Response:
"You're halfway through your long run — right in the sweet spot. 
You're 5 seconds per km slower than goal pace, which is perfect at 
this effort. You've got 5km left. This is where mental toughness 
kicks in. Settle into your rhythm."
```

The AI understands:
- This is a **long run** (not a race), so minor pace variance is OK
- They're **8 weeks into a 10-week plan** (late in prep, not recovery)
- The goal is **10K in 60 minutes** (6:00/km pace)
- They're at **50% distance** (halfway, still strong)
- They're in **SUSTAINING phase** (not finishing kick yet)

This is vastly different from a generic run where the AI might say: "Great effort! Maintain this pace!"

---

## Data Models

### TrainingPlanSummary
```kotlin
data class TrainingPlanSummary(
    @SerializedName("id") val id: String,
    @SerializedName("goalType") val goalType: String,        // "5k", "10k", "half_marathon", etc.
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("targetTime") val targetTime: Int?,       // seconds (CRITICAL)
    @SerializedName("targetDate") val targetDate: String?,
    @SerializedName("currentWeek") val currentWeek: Int = 1,
    @SerializedName("totalWeeks") val totalWeeks: Int,
    @SerializedName("experienceLevel") val experienceLevel: String,
    @SerializedName("daysPerWeek") val daysPerWeek: Int,
    @SerializedName("status") val status: String,             // active/paused/completed/cancelled
    @SerializedName("aiGenerated") val aiGenerated: Boolean,
    @SerializedName("createdAt") val createdAt: String?,
    @SerializedName("weeklyMileageBase") val weeklyMileageBase: Double?,
    @SerializedName("completedWorkouts") val completedWorkouts: Int = 0,
    @SerializedName("totalWorkouts") val totalWorkouts: Int = 0
)
```

### WorkoutDetails
```kotlin
data class WorkoutDetails(
    @SerializedName("id") val id: String,
    @SerializedName("dayOfWeek") val dayOfWeek: Int,          // 0=Sun, 1=Mon
    @SerializedName("scheduledDate") val scheduledDate: String?,  // "2026-03-25" (yyyy-MM-dd)
    @SerializedName("workoutType") val workoutType: String,   // easy/tempo/intervals/long_run/hill_repeats/recovery/rest
    @SerializedName("distance") val distance: Double?,        // km
    @SerializedName("duration") val duration: Int?,           // seconds
    @SerializedName("targetPace") val targetPace: String?,    // "5:00/km" format
    @SerializedName("intensity") val intensity: String?,      // "z1", "z2", "z3", "z4", "z5"
    @SerializedName("description") val description: String?,
    @SerializedName("instructions") val instructions: String?, // Pre-run instructions
    @SerializedName("intervalCount") val intervalCount: Int?,
    @SerializedName("intervalDistanceMeters") val intervalDistanceMeters: Int?,
    @SerializedName("intervalDurationSeconds") val intervalDurationSeconds: Int?,
    @SerializedName("restDistanceMeters") val restDistanceMeters: Int?,
    @SerializedName("restDurationSeconds") val restDurationSeconds: Int?,
    @SerializedName("intervalTargetPace") val intervalTargetPace: String?,
    @SerializedName("restTargetPace") val restTargetPace: String?,
    @SerializedName("isCompleted") val isCompleted: Boolean = false,
    @SerializedName("completedRunId") val completedRunId: String? = null
)
```

### Status Determination Logic

```kotlin
// Extension function
fun WorkoutDetails.isSkipped(): Boolean {
    // Marked done without GPS run (completedRunId is null)
    return isCompleted && completedRunId.isNullOrBlank()
}

// Status calculation (from CoachingProgrammeScreen)
val now = System.currentTimeMillis()

val isScheduled = !isCompleted && !isSkipped() && 
    scheduledDate?.let { dateString ->
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val scheduledTime = sdf.parse(dateString)?.time ?: now
        scheduledTime > now
    } ?: false

val isMissed = !isCompleted && !isSkipped() && !isScheduled

// Status display:
// - Completed (Green ✓): isCompleted && !isSkipped()
// - Missed (Orange ⚠️): isMissed
// - Skipped (Grey ❌): isSkipped()
// - Scheduled (No icon): isScheduled
```

---

## API Endpoints

### Plan Management

```
POST /api/training-plans/generate
Request: GeneratePlanRequest
Response: GeneratePlanResponse { planId, message }

GET /api/training-plans/:userId
Response: List<TrainingPlanSummary>

GET /api/training-plans/details/:planId
Response: TrainingPlanDetails { plan, weeks, performanceBaseline }

GET /api/training-plans/:planId/progress
Response: TrainingPlanProgress { week, completion, stats }

GET /api/training-plans/:planId/today
Response: TodayWorkoutResponse { workout, isToday, isOverdue }

PUT /api/training-plans/:planId/pause
PUT /api/training-plans/:planId/resume
DELETE /api/training-plans/:planId
```

### Session Instructions (Pre-Run Coaching)

```
GET /api/workouts/{workoutId}/session-instructions
Response: SessionInstructionsResponse

GET /api/workouts/{workoutId}/pre-run-brief
Response: { brief: String, tone: String, intensity: String }
```

### Workout Completion

```
PUT /api/training-plans/workouts/:id/complete
Request: CompleteWorkoutRequest { runId }
Response: CompleteWorkoutResponse { success, workoutId, planProgress }

PUT /api/training-plans/workouts/:id/skip
Request: SkipWorkoutRequest { reason }
Response: { success, workoutId }

PUT /api/training-plans/workouts/:id/restore
Response: { success, workoutId }
```

### Coaching Events (Logging)

```
POST /api/coaching/session-events
Request: CoachingSessionEvent { runId, plannedWorkoutId, eventType, ... }
Response: { success, eventId }
```

---

## Known Features & Requirements

### Implemented Features ✅

- ✅ **Plan Generation**: Multi-step wizard with demographics, injuries, regular sessions
- ✅ **Target Time Support**: Hours/Minutes/Seconds input, converted to seconds for AI
- ✅ **Plan Overview**: Shows goal with time (e.g., "Target 5km in 20 minutes")
- ✅ **Weekly View**: Week cards with session breakdown
- ✅ **Session Tiles**: Status indicators (Scheduled/Completed/Missed/Skipped)
- ✅ **Today's Workout**: Special card at top with Start/Mark Done/Skip options
- ✅ **Workout Details**: Full instruction display with metadata
- ✅ **Plan-Aware Run Setup**: Passes plan context to run session
- ✅ **Session Instructions**: AI-determined pre-run brief and coaching plan
- ✅ **Coaching Style Determination**: Tone, intensity, filters per session

### In Development 🔄

- 🔄 **Session Progress Tracking**: Real-time workout completion updates
- 🔄 **Plan Adaptation**: Dynamic plan adjustment based on missed/completed workouts
- 🔄 **Performance Baseline**: Comparing against pre-plan statistics
- 🔄 **Recovery Recommendations**: Post-run recovery advice based on plan progression

### UI/UX Design Patterns

#### Color Scheme (from Colors theme)
- **Primary** (Blue): Scheduled, active actions, highlights
- **Success** (Green): Completed workouts, achievements
- **Warning** (Orange): Missed sessions, caution states
- **TextMuted** (Grey): Skipped, secondary actions, disabled states

#### Typography
- **h4**: Workout titles, section headers
- **body**: Descriptions, instructions
- **small**: Metadata, zone labels, pace values
- **caption**: Support text, timestamps

#### Spacing
- Spacing.lg: Between major sections
- Spacing.md: Between cards and components
- Spacing.sm: Within cards, between lines
- Spacing.xs: Tight spacing within elements

#### Icons
- ✓ (icon_check_vector): Completed, done actions
- ⚠️ (icon_info_vector): Missed, warnings
- ❌ (icon_x_vector): Skipped, close/remove
- ▶️ (icon_play_vector): Start workout
- ◀️ (icon_arrow_back_vector): Back navigation

---

## Summary for iOS Implementation

### What Makes Plan Sessions Different from Generic Runs

| Aspect | Generic Run | Plan Session |
|--------|-------------|--------------|
| **Goal** | Distance only | Distance + Time |
| **Context** | Individual run | Part of multi-week program |
| **Coaching** | Real-time reactive | Pre-determined by AI |
| **Instructions** | None | Pre-run brief + phase structure |
| **Triggers** | Generic (pace, milestone) | Session-specific (phase-based) |
| **Analysis** | Post-run by comprehensive API | Plan-aware context included |
| **Tracking** | Completion only | Completion + plan progress |
| **User Intent** | Track today | Execute plan goal |

### Critical Implementation Points

1. **Target Time is Essential**: Pass it to all plan generation and coaching requests
2. **Date-Based Status**: Use scheduledDate to determine Scheduled vs Missed
3. **Skip Logic**: isCompleted=true but completedRunId=null means "Skipped"
4. **Plan Context**: Always include trainingPlanId, workoutId, planWeekNumber in coaching requests
5. **Session Instructions**: Fetch and display pre-run brief before run starts
6. **Coaching Style**: Use AI-determined tone and intensity, not user's default tone
7. **Progress Tracking**: Update week completion immediately on completion/skip/restore
8. **Time Formatting**: Hours:Minutes:Seconds display and input handling

---

**Document Complete** ✅  
This specification covers the full coaching plan lifecycle, session determination logic, and AI coaching context. Use this as the definitive reference for iOS implementation.
