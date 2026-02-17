package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Weather Impact Analysis data from the backend API
 * Endpoint: GET /api/users/{userId}/weather-impact
 */
data class WeatherImpactData(
    @SerializedName("hasEnoughData") val hasEnoughData: Boolean,
    @SerializedName("message") val message: String? = null,
    @SerializedName("runsAnalyzed") val runsAnalyzed: Int,
    @SerializedName("overallAvgPace") val overallAvgPace: Int? = null, // seconds per km
    @SerializedName("temperatureAnalysis") val temperatureAnalysis: List<BucketAnalysis>? = null,
    @SerializedName("humidityAnalysis") val humidityAnalysis: List<BucketAnalysis>? = null,
    @SerializedName("windAnalysis") val windAnalysis: List<BucketAnalysis>? = null,
    @SerializedName("conditionAnalysis") val conditionAnalysis: List<ConditionAnalysis>? = null,
    @SerializedName("timeOfDayAnalysis") val timeOfDayAnalysis: List<BucketAnalysis>? = null,
    @SerializedName("insights") val insights: Insights? = null
)

/**
 * Analysis for a bucket (e.g., temperature range, humidity range, wind speed range)
 */
data class BucketAnalysis(
    @SerializedName("range") val range: String,
    @SerializedName("label") val label: String,
    @SerializedName("avgPace") val avgPace: Int?, // seconds per km
    @SerializedName("runCount") val runCount: Int,
    @SerializedName("paceVsAvg") val paceVsAvg: Float? // percentage difference from average (negative = faster)
)

/**
 * Analysis for weather conditions (sunny, cloudy, rainy, etc.)
 */
data class ConditionAnalysis(
    @SerializedName("condition") val condition: String,
    @SerializedName("avgPace") val avgPace: Int, // seconds per km
    @SerializedName("runCount") val runCount: Int,
    @SerializedName("paceVsAvg") val paceVsAvg: Float // percentage difference from average
)

/**
 * Best and worst weather conditions insights
 */
data class Insights(
    @SerializedName("bestCondition") val bestCondition: InsightItem?,
    @SerializedName("worstCondition") val worstCondition: InsightItem?
)

/**
 * Individual insight item for best/worst conditions
 */
data class InsightItem(
    @SerializedName("label") val label: String,
    @SerializedName("type") val type: String,
    @SerializedName("improvement") val improvement: String? = null, // percentage improvement (faster)
    @SerializedName("slowdown") val slowdown: String? = null // percentage slowdown (slower)
)