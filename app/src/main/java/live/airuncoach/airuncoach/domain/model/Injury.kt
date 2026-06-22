package live.airuncoach.airuncoach.domain.model

/**
 * Represents an injury or condition that the user is managing.
 * Used to help the AI design appropriate training plans that avoid aggravating recovering injuries.
 *
 * Comprehensive injury tracking with recovery timeline and severity assessment.
 */
data class Injury(
    val id: String? = null,
    val bodyPart: String,                           // "knee", "ankle", "shin", "hip", "back", etc.
    val injurySide: String? = null,                 // "Left" or "Right" for bilateral body parts (null for non-bilateral)
    val status: InjuryStatus,                       // RECOVERING, HEALED, CHRONIC
    val severity: InjurySeverity = InjurySeverity.MODERATE, // MILD, MODERATE, SEVERE
    val notes: String? = null,                      // Detailed injury description and context
    val injuryDate: String? = null,                 // ISO date string "2026-05-08" — when injury occurred
    val estimatedRecoveryWeeks: Int? = null,        // Expected recovery duration (helps AI calculate expected heal date)
    val recoveryDate: String? = null,               // ISO date string — when marked as healed (only populated when status = HEALED)
    val updatedAt: Long = System.currentTimeMillis(), // Last time injury status was changed
    val isProstheticOrAFO: Boolean = false,         // true if involves prosthetic/orthotic device
    val prostheticType: String? = null,             // "carbon fiber AFO", "full prosthetic leg", etc.
    val createdAt: Long = System.currentTimeMillis() // When injury record was created
)

/**
 * Severity level of injury (affects coaching constraints)
 */
enum class InjurySeverity {
    MILD,       // Minor discomfort, minimal activity restriction
    MODERATE,   // Noticeable pain, moderate activity restriction
    SEVERE      // Significant pain, major activity restriction or medical attention needed
}

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
    "Neck / Cervical Spine",
    "Foot",
    "Calf",
    "Hamstring",
    "Quad",
    "Groin",
    "Shoulder",
    "Wrist",
    "IT Band",
    "Achilles",
    "Plantar Fascia",
    "Other"
)

/**
 * Types of prosthetics and orthotic devices
 */
val PROSTHETIC_TYPES = listOf(
    "Carbon fiber AFO (ankle-foot orthotic)",
    "Plastic AFO",
    "Full prosthetic leg",
    "Partial foot prosthetic",
    "Knee brace / ortho",
    "Ankle brace / ankle support",
    "Compression sleeve",
    "Other orthotic device"
)