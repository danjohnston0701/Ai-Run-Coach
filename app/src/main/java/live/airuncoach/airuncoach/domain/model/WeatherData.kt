package live.airuncoach.airuncoach.domain.model

data class WeatherData(
    val temperature: Double,
    val humidity: Double,
    val windSpeed: Double,
    val description: String
)
