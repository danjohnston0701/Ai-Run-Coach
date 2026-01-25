package live.airuncoach.airuncoach.domain.model

/**
 * Represents a single turn-by-turn navigation instruction
 * @param instruction Human-readable instruction (e.g., "Turn left onto Oak Street")
 * @param latitude GPS latitude of this instruction point
 * @param longitude GPS longitude of this instruction point
 * @param distance Cumulative distance in kilometers at this instruction
 */
data class TurnInstruction(
    val instruction: String,
    val latitude: Double,
    val longitude: Double,
    val distance: Double
)
