package live.airuncoach.airuncoach.domain.model

data class KmSplit(
    val km: Int,
    val time: Long, // milliseconds for the split
    val pace: String // "M:SS" format
)
