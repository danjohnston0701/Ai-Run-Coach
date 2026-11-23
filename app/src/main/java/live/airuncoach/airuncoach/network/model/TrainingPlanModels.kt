package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * A regular run the user attends each week that the AI should factor into the plan
 * (e.g. Parkrun every Saturday, running club on Tuesday evenings).
 */
data class RegularSessionRequest(
    @SerializedName("name") val name: String,
    @SerializedName("dayOfWeek") val dayOfWeek: Int,               // 0=Sun … 6=Sat
    @SerializedName("timeHour") val timeHour: Int,
    @SerializedName("timeMinute") val timeMinute: Int,
    @SerializedName("distanceKm") val distanceKm: Double,
    @SerializedName("countsTowardWeeklyTotal") val countsTowardWeeklyTotal: Boolean
)

/**
 * User injury for AI to consider when designing training plan
 */
data class InjuryRequest(
    @SerializedName("bodyPart") val bodyPart: String,        // "knee", "ankle", "shin", etc.
    @SerializedName("status") val status: String,            // "recovering", "healed", "chronic"
    @SerializedName("notes") val notes: String? = null,      // optional details
    @SerializedName("injuryDate") val injuryDate: String? = null  // ISO date e.g. "2026-05-08" — helps AI calculate weeks since injury
)

/** POST /api/training-plans/generate */
data class GeneratePlanRequest(
    @SerializedName("goalType") val goalType: String,       // "5k","10k","half_marathon","marathon","custom"
    @SerializedName("targetDistance") val targetDistance: Double, // km
    @SerializedName("targetTime") val targetTime: Int?,     // seconds
    @SerializedName("targetDate") val targetDate: String?,  // ISO
    @SerializedName("durationWeeks") val durationWeeks: Int? = null, // user-selected plan duration in weeks (takes priority over targetDate)
    @SerializedName("experienceLevel") val experienceLevel: String, // beginner/intermediate/advanced
    @SerializedName("daysPerWeek") val daysPerWeek: Int = 4,
    @SerializedName("goalId") val goalId: String? = null,   // optionally link to a Goal
    @SerializedName("firstSessionStart") val firstSessionStart: String = "flexible", // "today" | "tomorrow" | "flexible"
    @SerializedName("regularSessions") val regularSessions: List<RegularSessionRequest> = emptyList(),
    // User demographics for AI to calculate BMI, fitness level, health metrics
    @SerializedName("age") val age: Int? = null,
    @SerializedName("gender") val gender: String? = null,
    @SerializedName("height") val height: Double? = null,   // cm
    @SerializedName("weight") val weight: Double? = null,   // kg
    // User injuries for AI to design appropriate training (avoid aggravating recovering injuries)
    @SerializedName("injuries") val injuries: List<InjuryRequest> = emptyList(),
    // User's IANA timezone name (e.g. "Pacific/Auckland") so the server anchors week 1 to the correct calendar day
    @SerializedName("userTimezone") val userTimezone: String? = null,
    // When true, the runner is already capable of the event distance and wants a pre-race sharpening
    // block rather than a build-up plan. Flips the AI prompt away from "start conservatively".
    @SerializedName("isPreEventPlan") val isPreEventPlan: Boolean = false,
    // Default activity type for the user — used to specify if this plan is for running or walking
    @SerializedName("activityType") val activityType: String = "run", // "run" or "walk"
    // Build the plan in the background: the server answers at once with a jobId to poll
    // (GET /api/training-plans/jobs/{jobId}) instead of holding the request for 1–3 minutes.
    @SerializedName("async") val async: Boolean = true,
    // This build shows a free-trial plan's locked sessions and weeks, so the server may give a
    // trial user a plan capped to its first sessions (server/plan-trial-cap.ts).
    @SerializedName("supportsTrialCap") val supportsTrialCap: Boolean = true,
    // A heart-rate watch is paired (Garmin / Galaxy Watch app seen). Without any heart-rate source
    // the server gives effort targets only, no HR zones (server/hr-source.ts).
    @SerializedName("hasHeartRateDevice") val hasHeartRateDevice: Boolean? = null
)

/**
 * GET /api/plan-goal-match — the goal a new plan would be built for (server/plan-goal-match.ts).
 * The server matches the runner's active goal of the same distance even when the plan isn't
 * started from the goal, and a race-dated goal sets the plan length ([raceWeeks]).
 */
data class PlanGoalMatchResponse(
    @SerializedName("goal") val goal: PlanGoalMatchGoal? = null,
    @SerializedName("raceWeeks") val raceWeeks: Int? = null,
    @SerializedName("raceTooFar") val raceTooFar: Boolean = false,
    /** Weeks to the race however far out it is. */
    @SerializedName("weeksToRace") val weeksToRace: Int? = null,
    @SerializedName("maxRaceWeeks") val maxRaceWeeks: Int = 20
)

data class PlanGoalMatchGoal(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String,
    @SerializedName("eventName") val eventName: String? = null,
    @SerializedName("eventLocation") val eventLocation: String? = null,
    @SerializedName("distanceTarget") val distanceTarget: String? = null,
    @SerializedName("timeTargetSeconds") val timeTargetSeconds: Int? = null,
    /** yyyy-MM-dd, only when the race is still ahead. */
    @SerializedName("targetDate") val targetDate: String? = null
)

/** Response from generate: planId when built straight away (older servers), jobId when building in the background. */
data class GeneratePlanResponse(
    @SerializedName("planId") val planId: String? = null,
    @SerializedName("jobId") val jobId: String? = null,
    @SerializedName("status") val status: String? = null,
    @SerializedName("message") val message: String? = null
)

/** GET /api/training-plans/jobs/{jobId} — status is "generating", "ready" (planId set) or "failed" (error set). */
data class PlanJobResponse(
    @SerializedName("jobId") val jobId: String,
    @SerializedName("status") val status: String,
    @SerializedName("planId") val planId: String? = null,
    @SerializedName("error") val error: String? = null,
    @SerializedName("code") val code: String? = null
)

/** Flat plan row returned from GET /api/training-plans/:userId */
data class TrainingPlanSummary(
    @SerializedName("id") val id: String,
    @SerializedName("goalType") val goalType: String,
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("targetTime") val targetTime: Int?,
    @SerializedName("targetDate") val targetDate: String?,
    @SerializedName("currentWeek") val currentWeek: Int = 1,
    @SerializedName("totalWeeks") val totalWeeks: Int,
    @SerializedName("experienceLevel") val experienceLevel: String,
    @SerializedName("daysPerWeek") val daysPerWeek: Int,
    @SerializedName("status") val status: String,           // active/paused/completed/cancelled
    @SerializedName("aiGenerated") val aiGenerated: Boolean,
    @SerializedName("createdAt") val createdAt: String?,
    @SerializedName("weeklyMileageBase") val weeklyMileageBase: Double? = null,
    @SerializedName("completedWorkouts") val completedWorkouts: Int = 0,
    @SerializedName("totalWorkouts") val totalWorkouts: Int = 0,
    // Rolling block generation fields (null = legacy plan where all weeks are already generated)
    @SerializedName("generatedThroughWeek") val generatedThroughWeek: Int? = null,
    @SerializedName("nextBlockAt") val nextBlockAt: String? = null,
    // AI-generated safety disclaimer JSON (present when plan was created with active/recovering injuries)
    // JSON shape: { prerequisiteChecks: string[], stopCriteria: string[], progressionGates: string[], disclaimer: string }
    @SerializedName("safetyDisclaimer") val safetyDisclaimer: String? = null,
    // Free-trial plan: only this many sessions are unlocked (null = full plan)
    @SerializedName("trialSessionCap") val trialSessionCap: Int? = null
)

/** Full plan returned from GET /api/training-plans/details/:planId */
data class TrainingPlanDetails(
    @SerializedName("plan") val plan: TrainingPlanSummary,
    @SerializedName("weeks") val weeks: List<WeekDetails>,
    @SerializedName("performanceBaseline") val performanceBaseline: PerformanceBaseline? = null,
    // Present only while the plan is capped by the free trial
    @SerializedName("trialCap") val trialCap: TrialCapInfo? = null,
    // The rest of the plan is being built right now (just upgraded from a free-trial plan, or a
    // next block running): the plan screen says so and reloads until it's done.
    @SerializedName("generatingNextBlock") val generatingNextBlock: Boolean = false
)

/** A free-trial plan's cap: the first [freeSessions] sessions are unlocked, the rest need AI Plans. */
data class TrialCapInfo(
    @SerializedName("freeSessions") val freeSessions: Int,
    @SerializedName("freeSessionsCompleted") val freeSessionsCompleted: Int = 0,
    @SerializedName("lockedSessions") val lockedSessions: Int = 0,
    @SerializedName("lockedWeeks") val lockedWeeks: Int = 0,   // weeks not generated yet
    @SerializedName("message") val message: String? = null
) {
    val allFreeSessionsDone: Boolean get() = freeSessionsCompleted >= freeSessions
}

data class PerformanceBaseline(
    @SerializedName("hasHistory") val hasHistory: Boolean,
    @SerializedName("message") val message: String? = null,
    @SerializedName("runsRecorded") val runsRecorded: Int? = null,
    @SerializedName("baselineWindow") val baselineWindow: String? = null,  // e.g. "last 90 days"
    @SerializedName("dateRange") val dateRange: String? = null,            // e.g. "12 Apr – 10 May 2026"
    @SerializedName("runsPerWeek") val runsPerWeek: String? = null,
    @SerializedName("avgDistance") val avgDistance: String? = null,
    @SerializedName("longestRun") val longestRun: String? = null,
    @SerializedName("longestRunSource") val longestRunSource: String? = null, // "all_time" | "window"
    @SerializedName("allTimeLongestRun") val allTimeLongestRun: String? = null, // populated when hasHistory=false
    @SerializedName("avgPace") val avgPace: String? = null
)

data class WeekDetails(
    @SerializedName("id") val id: String,
    @SerializedName("weekNumber") val weekNumber: Int,
    @SerializedName("weekDescription") val weekDescription: String?,
    @SerializedName("totalDistance") val totalDistance: Double?,
    @SerializedName("focusArea") val focusArea: String?,    // endurance/speed/recovery/race_prep
    @SerializedName("intensityLevel") val intensityLevel: String?,
    @SerializedName("workouts") val workouts: List<WorkoutDetails>
)

data class WorkoutDetails(
    @SerializedName("id") val id: String,
    @SerializedName("dayOfWeek") val dayOfWeek: Int,        // 0=Sun, 1=Mon…
    @SerializedName("scheduledDate") val scheduledDate: String?,
    @SerializedName("workoutType") val workoutType: String, // easy/tempo/intervals/long_run/hill_repeats/recovery/rest
    @SerializedName("distance") val distance: Double?,
    @SerializedName("duration") val duration: Int?,         // seconds
    @SerializedName("targetPace") val targetPace: String?,
    @SerializedName("intensity") val intensity: String?,    // z1-z5
    @SerializedName("description") val description: String?,
    @SerializedName("instructions") val instructions: String?,
    // Interval/repeat workout metadata
    @SerializedName("intervalCount") val intervalCount: Int? = null,                   // Number of reps
    @SerializedName("intervalDistanceMeters") val intervalDistanceMeters: Int? = null, // Distance per rep
    @SerializedName("intervalDurationSeconds") val intervalDurationSeconds: Int? = null, // Duration if time-based
    @SerializedName("restDistanceMeters") val restDistanceMeters: Int? = null,         // Recovery distance
    @SerializedName("restDurationSeconds") val restDurationSeconds: Int? = null,       // Recovery duration
    @SerializedName("intervalTargetPace") val intervalTargetPace: String? = null,      // Target pace for work
    @SerializedName("restTargetPace") val restTargetPace: String? = null,              // Target pace for recovery
    @SerializedName("intervalHeartRateMin") val intervalHeartRateMin: Int? = null,     // Min HR for work
    @SerializedName("intervalHeartRateMax") val intervalHeartRateMax: Int? = null,     // Max HR for work
    @SerializedName("restHeartRateMax") val restHeartRateMax: Int? = null,             // Max HR for recovery
    @SerializedName("isCompleted") val isCompleted: Boolean = false,
    @SerializedName("completedRunId") val completedRunId: String? = null,
    // HR zone metadata — used for live coaching guidance and UI display
    @SerializedName("hrZoneNumber") val hrZoneNumber: Int? = null,     // 1-5 if AI assigned a specific zone
    @SerializedName("hrZoneMinBpm") val hrZoneMinBpm: Int? = null,     // Actual BPM floor for target zone
    @SerializedName("hrZoneMaxBpm") val hrZoneMaxBpm: Int? = null,     // Actual BPM ceiling for target zone
    @SerializedName("hrZoneScenario") val hrZoneScenario: String? = null, // 'device' | 'history' | 'effort'
    @SerializedName("sessionType") val sessionType: String = "run", // "run" or "walk"
    // Past a free-trial plan's free sessions: shown greyed and blurred, can't be started
    @SerializedName("locked") val locked: Boolean = false
) {
    /**
     * The pace to show the runner as "target pace". On rep sessions `targetPace` is the server's
     * whole-session average (warm-up + reps + recoveries + cool-down, used for the duration
     * estimate), so an interval card read "7:45/km" for reps at 6:40. Mirrors iOS
     * `WorkoutDetails.displayTargetPace`.
     */
    val displayTargetPace: String?
        get() = intervalTargetPace?.takeIf { it.isNotBlank() } ?: targetPace
}

/** GET /api/training-plans/:planId/today */
data class TodayWorkoutResponse(
    @SerializedName("workout") val workout: WorkoutDetails?,
    @SerializedName("isToday") val isToday: Boolean,
    @SerializedName("isOverdue") val isOverdue: Boolean = false
)

/** GET /api/training-plans/:planId/progress */
data class TrainingPlanProgress(
    @SerializedName("planId") val planId: String,
    @SerializedName("currentWeek") val currentWeek: Int,
    @SerializedName("totalWeeks") val totalWeeks: Int,
    @SerializedName("goalType") val goalType: String,
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("targetTime") val targetTime: Int?,
    @SerializedName("status") val status: String,
    @SerializedName("completedWorkouts") val completedWorkouts: Int,
    @SerializedName("totalWorkouts") val totalWorkouts: Int,
    @SerializedName("overallCompletion") val overallCompletion: Double,
    @SerializedName("weeks") val weeks: List<WeekProgress>
)

data class WeekProgress(
    @SerializedName("weekNumber") val weekNumber: Int,
    @SerializedName("weekDescription") val weekDescription: String?,
    @SerializedName("totalDistance") val totalDistance: Double?,
    @SerializedName("focusArea") val focusArea: String?,
    @SerializedName("intensityLevel") val intensityLevel: String?,
    @SerializedName("totalWorkouts") val totalWorkouts: Int,
    @SerializedName("completedWorkouts") val completedWorkouts: Int,
    @SerializedName("completionRate") val completionRate: Double
)

/** PUT /api/training-plans/workouts/:id/complete */
data class CompleteWorkoutRequest(
    @SerializedName("runId") val runId: String? = null
)

/** GET /api/training-plans/:planId/block-status — rolling block generation status */
data class BlockStatus(
    @SerializedName("planId") val planId: String,
    @SerializedName("totalWeeks") val totalWeeks: Int,
    @SerializedName("generatedThroughWeek") val generatedThroughWeek: Int,
    @SerializedName("isRolling") val isRolling: Boolean,
    @SerializedName("isFullyGenerated") val isFullyGenerated: Boolean,
    @SerializedName("nextBlockAt") val nextBlockAt: String?,
    @SerializedName("nextBlockMessage") val nextBlockMessage: String?,
    @SerializedName("nextBlockReady") val nextBlockReady: Boolean,
    // A block is being generated right now (nextBlockAt is the old date then)
    @SerializedName("generating") val generating: Boolean = false
)

/** Response from PUT /api/training-plans/workouts/:id/complete */
data class CompleteWorkoutResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("workoutId") val workoutId: String? = null,
    @SerializedName("isCompleted") val isCompleted: Boolean = false,
    @SerializedName("planProgress") val planProgress: PlanProgressStats? = null
)

data class PlanProgressStats(
    @SerializedName("completedWorkouts") val completedWorkouts: Int = 0,
    @SerializedName("totalWorkouts") val totalWorkouts: Int = 0,
    @SerializedName("overallCompletion") val overallCompletion: Double = 0.0
)

/** Single workout schedule change for reschedule requests */
data class WorkoutScheduleUpdate(
    @SerializedName("workoutId") val workoutId: String,
    @SerializedName("dayOfWeek") val dayOfWeek: Int,  // 0=Sun, 1=Mon, etc.
    @SerializedName("scheduledDate") val scheduledDate: String  // ISO date "yyyy-MM-dd"
)

/** PUT /api/training-plans/:planId/reschedule */
data class RescheduleSessionsRequest(
    @SerializedName("weekNumber") val weekNumber: Int,
    @SerializedName("updates") val updates: List<WorkoutScheduleUpdate>
)

/** Response from reschedule */
data class RescheduleSessionsResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String? = null,
    @SerializedName("planProgress") val planProgress: PlanProgressStats? = null
)
