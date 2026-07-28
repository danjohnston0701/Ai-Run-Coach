package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class BackendWeatherResponse(
    @SerializedName("temp")
    val temp: Double?,
    @SerializedName("feelsLike")
    val feelsLike: Double?,
    @SerializedName("humidity")
    val humidity: Double?,
    @SerializedName("windSpeed")
    val windSpeed: Double?,
    @SerializedName("windDirection")
    val windDirection: Int?,
    @SerializedName("condition")
    val condition: String?,
    @SerializedName("weatherCode")
    val weatherCode: Int?
)
