package live.airuncoach.airuncoach.network.model

data class UpdateUserRequest(
    val name: String? = null,
    val email: String? = null,
    val dob: String? = null,
    val gender: String? = null,
    val weight: Double? = null,
    val height: Double? = null,
    val fitnessLevel: String? = null,
    val distanceScale: String? = null,
    val subscriptionTier: String? = null,
    val subscriptionStatus: String? = null,
    val defaultSessionType: String? = null,
    /** Decimal places (0–3) the target-distance control accepts; 2+ replaces the slider with a field. */
    val targetDistanceDecimals: Int? = null,
    /** Slider window for the target distance (whole km); span capped per TargetDistance.maxSliderSpanKm. */
    val distanceMinKm: Float? = null,
    val distanceMaxKm: Float? = null
)
