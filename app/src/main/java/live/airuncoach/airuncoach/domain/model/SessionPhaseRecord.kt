package live.airuncoach.airuncoach.domain.model

/**
 * One finished entry of a phased session's timeline (warm-up, a rep, a recovery, cool-down),
 * recorded live by RunTrackingService and saved as runs.session_phases. The Run Summary's
 * session chart and the share image read these; per-phase pace is distance / time.
 * iOS `SessionPhaseRecord` (SessionTypes.swift) is the same shape.
 */
data class SessionPhaseRecord(
    val label: String,        // "Warm-up", "Rep 2", "Recovery 2", "Cool-down"
    val kind: String,         // "warmup" | "work" | "recovery" | "cooldown" | "steady"
    val rep: Int?,            // 1-based rep number for work/recovery entries
    val startSec: Int,
    val endSec: Int,
    val startM: Int,
    val endM: Int,
    val targetPaceMinSec: Int? = null,   // sec/km, work entries with a target
    val targetPaceMaxSec: Int? = null,
)
