package live.airuncoach.airuncoach.network.model

data class GarminUploadRequest(
    val runId: String,
    // Preserve plan workout link so the backend Garmin webhook handler can carry it
    // forward if it creates or updates a run record from the official Garmin activity.
    val linkedWorkoutId: String? = null,
    val linkedPlanId: String? = null
)
