package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class WeatherResponse(
    @SerializedName("main")
    val main: MainWeather,
    @SerializedName("weather")
    val weather: List<WeatherDescription>,
    @SerializedName("wind")
    val wind: Wind
)

data class MainWeather(
    @SerializedName("temp")
    val temperature: Double,
    @SerializedName("feels_like")
    val feelsLike: Double,
    @SerializedName("humidity")
    val humidity: Int
)

data class WeatherDescription(
    @SerializedName("main")
    val main: String,
    @SerializedName("description")
    val description: String
)

data class Wind(
    @SerializedName("speed")
    val speed: Double
)
