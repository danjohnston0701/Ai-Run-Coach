package live.airuncoach.airuncoach.domain.model

data class LocationPoint(
    val latitude: Double,
    val longitude: Double,
    val timestamp: Long,
    val speed: Float?,
    val altitude: Double?,
    val heartRate: Int? = null,
    val bearing: Float? = null,
    val cadence: Int? = null,
    val inclineDegrees: Float? = null // Incline in degrees, calculated from elevation change
)

