package live.airuncoach.airuncoach.service

import android.util.Log
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.CoachingSessionEvent
import live.airuncoach.airuncoach.network.model.SessionInstructionsResponse

/**
 * Helper class for managing session-specific AI coaching (Phase 1 Integration)
 * 
 * Responsibilities:
 * - Fetch session instructions pre-run
 * - Log coaching events during run
 * - Provide coaching context to RunTrackingService
 */
class SessionCoachingHelper(private val apiService: ApiService) {

    companion object {
        private const val TAG = "SessionCoachingHelper"
    }

    /**
     * Fetch session instructions for a planned workout
     * 
     * Called before run starts to get AI-determined coaching plan
     */
    suspend fun fetchSessionInstructions(workoutId: String): SessionInstructionsResponse? {
        return try {
            Log.d(TAG, "Fetching session instructions for workout $workoutId")
            val instructions = apiService.getSessionInstructions(workoutId)
            Log.d(TAG, "Successfully fetched instructions: tone=${instructions.aiDeterminedTone}")
            instructions
        } catch (e: Exception) {
            Log.w(TAG, "Failed to fetch session instructions: ${e.message}")
            null  // Gracefully fail — run continues without session context
        }
    }

    /**
     * Log a coaching event during an active run
     * 
     * Called after each coaching message is delivered to track:
     * - What was coached
     * - When (phase)
     * - How (tone)
     * - User engagement
     */
    suspend fun logCoachingEvent(
        runId: String,
        workoutId: String?,
        eventType: String,
        eventPhase: String?,
        coachingMessage: String?,
        coachingAudioUrl: String? = null,
        userMetrics: Map<String, Any>? = null,
        toneUsed: String? = null,
        userEngagement: String? = null
    ) {
        try {
            val event = CoachingSessionEvent(
                runId = runId,
                plannedWorkoutId = workoutId,
                eventType = eventType,
                eventPhase = eventPhase,
                coachingMessage = coachingMessage,
                coachingAudioUrl = coachingAudioUrl,
                userMetrics = userMetrics,
                toneUsed = toneUsed,
                userEngagement = userEngagement
            )
            
            Log.d(TAG, "Logging coaching event: type=$eventType, phase=$eventPhase, tone=$toneUsed")
            apiService.logCoachingEvent(event)
            Log.d(TAG, "Successfully logged coaching event")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to log coaching event: ${e.message}")
            // Don't fail the run — event logging is optional for analytics
        }
    }

    /**
     * Extract current run phase from session structure
     * 
     * Used to determine what phase of the session the runner is in
     * (warmup, interval_1, recovery, cooldown, etc)
     */
    fun determineCurrentPhase(
        instructions: SessionInstructionsResponse?,
        distanceCoveredKm: Float,
        timeElapsedSeconds: Int = 0,
        currentRunMetrics: Map<String, Any>? = null
    ): String? {
        if (instructions?.sessionStructure?.phases == null) {
            return null
        }

        // Simple heuristic: find phase based on distance covered
        // In production, this would be more sophisticated with time-based phases too
        var distanceSoFar = 0f
        for (phase in instructions.sessionStructure.phases) {
            val phaseDuration = (phase.durationKm ?: 0.5).toFloat()
            if (distanceCoveredKm >= distanceSoFar && distanceCoveredKm < (distanceSoFar + phaseDuration)) {
                return phase.name
            }
            distanceSoFar += phaseDuration
        }

        return instructions.sessionStructure.phases.lastOrNull()?.name
    }
}
