package live.airuncoach.airuncoach.domain.model

data class Route(
    val id: String,
    val userId: String?,
    val polyline: String, // Encoded polyline
    val distance: Double, // in km
    val elevationGain: Double?, // in meters (can be decimal)
    val elevationLoss: Double?, // in meters (can be decimal)
    val difficulty: String?, // "easy", "moderate", "hard"
    val startLat: Double,
    val startLng: Double,
    val endLat: Double?,
    val endLng: Double?,
    val createdAt: String,
    val name: String?,
    val description: String?
)
