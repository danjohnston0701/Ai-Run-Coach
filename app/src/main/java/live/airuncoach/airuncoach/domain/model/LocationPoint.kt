package live.airuncoach.airuncoach.domain.model

data class LocationPoint(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double?,
    val accuracy: Float,
    val speed: Float,
    val timestamp: Long
)
