package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class CadenceCoachingRequest(
    @SerializedName("cadence") val cadence: Int,
    @SerializedName("cadenceProximityTier") val cadenceProximityTier: String, // "ON_TARGET" | "CLOSE" | "NEEDS_WORK"
    @SerializedName("cadenceDeviationPercent") val cadenceDeviationPercent: Double, // signed: negative = below target
    @SerializedName("currentPace") val currentPace: String,
    @SerializedName("targetPace") val targetPace: String?,       // User's goal pace for this run (e.g. "5:15")
    @SerializedName("targetTime") val targetTime: Long?,          // User's goal time in seconds
    @SerializedName("optimalCadenceTarget") val optimalCadenceTarget: Int, // Biomechanics-computed ideal spm at current speed & grade
    @SerializedName("optimalCadenceMin") val optimalCadenceMin: Int,
    @SerializedName("optimalCadenceMax") val optimalCadenceMax: Int,
    @SerializedName("speed") val speed: Double, // m/s
    @SerializedName("distance") val distance: Double, // km
    @SerializedName("elapsedTime") val elapsedTime: Long,
    @SerializedName("heartRate") val heartRate: Int?,
    @SerializedName("userHeight") val userHeight: Double?, // meters
    @SerializedName("userWeight") val userWeight: Double?, // kg
    @SerializedName("userAge") val userAge: Int?,
    @SerializedName("fitnessLevel") val fitnessLevel: String?,
    @SerializedName("totalRunsAllTime") val totalRunsAllTime: Int?,
    // Terrain context — lets the AI tailor advice for hills vs flat (e.g. shorter steps on uphill)
    @SerializedName("currentGrade") val currentGrade: Double?,    // Real-time slope % (positive=uphill, negative=downhill)
    @SerializedName("terrainContext") val terrainContext: String?, // "flat" | "uphill" | "downhill"
    @SerializedName("isFatigued") val isFatigued: Boolean? = null,
    // Anti-repetition: recent cadence coaching messages so the AI can vary its response
    @SerializedName("recentCadenceMessages") val recentCadenceMessages: List<String>? = null,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    // "run" | "walk" — cadence coaching is suppressed on device for walks, but the field
    // is included so the server can apply walk-aware coaching if the endpoint is ever
    // called directly (e.g. race walking, recovery walks between intervals).
    @SerializedName("activityType") val activityType: String? = "run"
)

data class CadenceCoachingResponse(
    @SerializedName("message") val message: String,
    @SerializedName("audio") val audio: String? = null,
    @SerializedName("format") val format: String? = "mp3",
    @SerializedName("cadenceProximityTier") val cadenceProximityTier: String? = null,
    @SerializedName("recommendation") val recommendation: String? = null
)
