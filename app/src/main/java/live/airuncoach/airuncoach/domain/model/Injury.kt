package live.airuncoach.airuncoach.domain.model

/**
 * Represents an injury or condition that the user is managing.
 * Used to help the AI design appropriate training plans that avoid aggravating recovering injuries.
 */
data class Injury(
    val id: String? = null,
    val bodyPart: String,      // "knee", "ankle", "shin", "hip", "back", "foot", "calf", "hamstring", "quad", "groin", "other"
    val status: InjuryStatus,  // recovering, healed, chronic
    val notes: String? = null, // optional details about the injury
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * Status of an injury
 */
enum class InjuryStatus {
    RECOVERING,  // Currently recovering - AI should avoid high-impact for this area
    HEALED,      // Fully healed - can resume normal training
    CHRONIC      // Chronic condition - manage but accommodate in training
}

/**
 * Available body parts for injuries
 */
val BODY_PARTS = listOf(
    "Knee",
    "Ankle",
    "Shin",
    "Hip",
    "Back",
    "Foot",
    "Calf",
    "Hamstring",
    "Quad",
    "Groin",
    "Shoulder",
    "Wrist",
    "Other"
)