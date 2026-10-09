package live.airuncoach.airuncoach.wear.session

import live.airuncoach.airuncoach.wear.storage.ActiveClockSnapshot

/**
 * The run's moving time: wall-clock time since START minus every pause. Elapsed used to be
 * "now − start", so a run with a 5-minute pause saved 5 extra minutes and a slower average
 * pace. Wall-clock based (not tick-counted) so it stays right when the app is killed and
 * relaunched mid-run — the time the app was dead was still run time — and it round-trips
 * through [snapshot]/[restore] in the checkpoint.
 */
class ActiveClock {
    private var startedAtMs = 0L
    private var pausedTotalMs = 0L
    private var pausedAtMs: Long? = null
    var isStarted = false
        private set
    val isPaused: Boolean get() = pausedAtMs != null

    fun start(nowMs: Long) {
        isStarted = true
        startedAtMs = nowMs
        pausedTotalMs = 0
        pausedAtMs = null
    }

    fun pause(nowMs: Long) {
        if (!isStarted || pausedAtMs != null) return
        pausedAtMs = nowMs
    }

    fun resume(nowMs: Long) {
        val at = pausedAtMs ?: return
        pausedTotalMs += (nowMs - at).coerceAtLeast(0)
        pausedAtMs = null
    }

    fun elapsedMs(nowMs: Long): Long {
        if (!isStarted) return 0
        val end = pausedAtMs ?: nowMs
        return (end - startedAtMs - pausedTotalMs).coerceAtLeast(0)
    }

    fun reset() {
        isStarted = false
        startedAtMs = 0
        pausedTotalMs = 0
        pausedAtMs = null
    }

    fun snapshot() = ActiveClockSnapshot(startedAtMs, pausedTotalMs, pausedAtMs)

    fun restore(s: ActiveClockSnapshot) {
        isStarted = true
        startedAtMs = s.startedAtMs
        pausedTotalMs = s.pausedTotalMs
        pausedAtMs = s.pausedAtMs
    }
}
