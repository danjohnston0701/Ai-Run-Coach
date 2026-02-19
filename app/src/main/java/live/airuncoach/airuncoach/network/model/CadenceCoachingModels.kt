package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class CadenceCoachingRequest(
    @SerializedName("cadence") val cadence: Int,
    @SerializedName("strideLength") val strideLength: Double,
    @SerializedName("strideZone") val strideZone: String, // "OVERSTRIDING", "UNDERSTRIDING", "OPTIMAL"
    @SerializedName("currentPace") val currentPace: String,
    @SerializedName("speed") val speed: Double, // m/s
    @SerializedName("distance") val distance: Double, // km
    @SerializedName("elapsedTime") val elapsedTime: Long,
    @SerializedName("heartRate") val heartRate: Int?,
    @SerializedName("userHeight") val userHeight: Double?, // meters
    @SerializedName("userWeight") val userWeight: Double?, // kg
    @SerializedName("userAge") val userAge: Int?,
    @SerializedName("optimalCadenceMin") val optimalCadenceMin: Int,
    @SerializedName("optimalCadenceMax") val optimalCadenceMax: Int,
    @SerializedName("optimalStrideLengthMin") val optimalStrideLengthMin: Double,
    @SerializedName("optimalStrideLengthMax") val optimalStrideLengthMax: Double,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?
)

data class CadenceCoachingResponse(
    @SerializedName("message") val message: String,
    @SerializedName("audio") val audio: String? = null,
    @SerializedName("format") val format: String? = "mp3",
    @SerializedName("strideZone") val strideZone: String? = null,
    @SerializedName("recommendation") val recommendation: String? = null
)
