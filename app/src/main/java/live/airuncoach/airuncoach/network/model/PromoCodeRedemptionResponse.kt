package live.airuncoach.airuncoach.network.model

/**
 * Response from POST /api/promo-codes/redeem
 */
data class PromoCodeRedemptionResponse(
    val success: Boolean,
    val message: String,
    val grantedUntil: String? = null,  // ISO timestamp
    val features: List<String>? = null  // e.g. ["trainingPlansGenerated", "routesGenerated"]
)
