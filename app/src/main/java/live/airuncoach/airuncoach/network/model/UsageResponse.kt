package live.airuncoach.airuncoach.network.model

/**
 * Response from GET /api/usage/current.
 *
 * [limits] and [remaining] use null to mean "Unlimited" (e.g. for Premium tier).
 */
data class UsageResponse(
    val yearMonth: String,
    val tier: String,
    val usage: UsageCounts,
    val limits: UsageLimits,
    val remaining: UsageLimits
)

data class UsageCounts(
    val aiCoachingKm: Float,
    val trainingPlansGenerated: Int,
    val routesGenerated: Int,
    val postRunAnalyses: Int
)

/** null values mean "Unlimited" for that feature on this tier. */
data class UsageLimits(
    val aiCoachingKm: Float?,
    val trainingPlansGenerated: Int?,
    val routesGenerated: Int?,
    val postRunAnalyses: Int?
)
