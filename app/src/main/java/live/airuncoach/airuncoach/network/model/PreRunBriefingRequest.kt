package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class PreRunBriefingRequest(
    @SerializedName("startLocation") val startLocation: StartLocation,
    @SerializedName("distance") val distance: Double,
    @SerializedName("elevationGain") val elevationGain: Int,
    @SerializedName("elevationLoss") val elevationLoss: Int,
    @SerializedName("maxGradientDegrees") val maxGradientDegrees: Double,
    @SerializedName("difficulty") val difficulty: String,
    @SerializedName("activityType") val activityType: String,
    @SerializedName("targetTime") val targetTime: Int?,
    @SerializedName("firstTurnInstruction") val firstTurnInstruction: String?,
    @SerializedName("weather") val weather: WeatherPayload?,
    @SerializedName("wellness") val wellness: WellnessPayload? = null
)

data class StartLocation(
    @SerializedName("lat") val lat: Double,
    @SerializedName("lng") val lng: Double
)

data class WeatherPayload(
    @SerializedName("temp") val temp: Int,
    @SerializedName("condition") val condition: String,
    @SerializedName("windSpeed") val windSpeed: Int
)

data class WellnessPayload(
    @SerializedName("sleepHours") val sleepHours: Double?,
    @SerializedName("sleepQuality") val sleepQuality: String?,
    @SerializedName("sleepScore") val sleepScore: Int?,
    @SerializedName("bodyBattery") val bodyBattery: Int?,
    @SerializedName("stressLevel") val stressLevel: Int?,
    @SerializedName("stressQualifier") val stressQualifier: String?,
    @SerializedName("hrvStatus") val hrvStatus: String?,
    @SerializedName("hrvFeedback") val hrvFeedback: String?,
    @SerializedName("restingHeartRate") val restingHeartRate: Int?,
    @SerializedName("readinessScore") val readinessScore: Int?,
    @SerializedName("readinessRecommendation") val readinessRecommendation: String?
)
