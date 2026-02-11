package live.airuncoach.airuncoach.network.model

data class GarminUploadResponse(
    val success: Boolean,
    val message: String,
    val garminActivityId: String? = null
)
