package live.airuncoach.airuncoach.domain.model

import java.util.Date

data class PreviousRun(
    val id: Long,
    val date: Date,
    val distance: Double,
    val duration: Long,
    val pace: String
)
