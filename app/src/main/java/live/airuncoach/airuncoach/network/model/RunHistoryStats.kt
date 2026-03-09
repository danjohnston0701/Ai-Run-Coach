package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Aggregated stats from the user's recent similar runs.
 * Fetched once at run-start and passed to every coaching endpoint
 * so the AI can contextualise current performance vs history.
 */
data class RunHistoryStats(
    @SerializedName("runsAnalysed") val runsAnalysed: Int,
    @SerializedName("avgPaceSecondsPerKm") val avgPaceSecondsPerKm: Int,
    @SerializedName("avgPaceFormatted") val avgPaceFormatted: String,
    @SerializedName("bestPaceFormatted") val bestPaceFormatted: String? = null,
    @SerializedName("avgDistanceKm") val avgDistanceKm: Double,
    @SerializedName("avgCadence") val avgCadence: Int? = null,
    @SerializedName("avgHeartRate") val avgHeartRate: Int? = null,
    @SerializedName("consistencyTrend") val consistencyTrend: String, // "improving"|"declining"|"consistent"|"inconsistent"
    @SerializedName("avgPaceDropPercent") val avgPaceDropPercent: Double? = null,
    @SerializedName("lastRunPaceFormatted") val lastRunPaceFormatted: String? = null,
    @SerializedName("lastRunDate") val lastRunDate: String? = null,
    @SerializedName("totalRunsAllTime") val totalRunsAllTime: Int? = null
)
