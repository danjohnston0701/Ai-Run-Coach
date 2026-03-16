package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class PreRunBriefingRequest(
    @SerializedName("startLocation") val startLocation: StartLocation,
    @SerializedName("distance") val distance: Double,
    @SerializedName("elevationGain") val elevationGain: Int,
    @SerializedName("elevationLoss") val elevationLoss: Int,
    @SerializedName("maxGradientDegrees") val maxGradientDegrees: Double,
    @SerializedName("difficulty") val difficulty: String,
    @SerializedName("hasRoute") val hasRoute: Boolean,
    @SerializedName("activityType") val activityType: String,
    @SerializedName("targetTime") val targetTime: Int?,
    @SerializedName("targetPace") val targetPace: String?,
    @SerializedName("firstTurnInstruction") val firstTurnInstruction: String?,
    @SerializedName("weather") val weather: WeatherPayload?,
    @SerializedName("wellness") val wellness: WellnessPayload? = null,
    // Coach personality settings
    @SerializedName("coachName") val coachName: String? = null,
    @SerializedName("coachGender") val coachGender: String? = null,
    @SerializedName("coachAccent") val coachAccent: String? = null,
    @SerializedName("coachTone") val coachTone: String? = null,
    // Training plan context (if this run is part of a coached plan)
    @SerializedName("trainingPlanId") val trainingPlanId: String? = null,
    @SerializedName("planGoalType") val planGoalType: String? = null,
    @SerializedName("planWeekNumber") val planWeekNumber: Int? = null,
    @SerializedName("planTotalWeeks") val planTotalWeeks: Int? = null,
    @SerializedName("workoutType") val workoutType: String? = null,  // "easy", "tempo", "intervals", "long_run"
    @SerializedName("workoutIntensity") val workoutIntensity: String? = null,  // "z1", "z2", "z3", "z4", "z5"
    @SerializedName("workoutDescription") val workoutDescription: String? = null  // Zone focus or description
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
