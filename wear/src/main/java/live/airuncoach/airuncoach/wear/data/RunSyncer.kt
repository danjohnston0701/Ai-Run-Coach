package live.airuncoach.airuncoach.wear.data

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import live.airuncoach.airuncoach.wear.storage.PendingRunStore
import live.airuncoach.airuncoach.wear.storage.RunRecord

/**
 * Saves queued watch runs to the server, and only forgets a run once the server has confirmed
 * it. Replaces the old "upload once at the finish, then delete the copy whatever happened",
 * which lost every run finished without a connection.
 *
 * Per run:
 *  1. session/end — only while the run is fresh ([END_SESSION_WINDOW_MS]). It gives the server
 *     the watch's own summary and runs its phone-run dedup, but it dates the run "now", so a
 *     run synced hours later must skip it.
 *  2. upload-batch — the track. Find-or-create on the server: it enriches the run session/end
 *     made, links to the phone's own upload of the same run, or (late sync) creates the run
 *     dated from [RunRecord.startedAtEpochSec].
 * A run with no track left (storage-full fallback) can only be saved by session/end, so it
 * calls it however late.
 *
 * Runs are tried oldest first; a failed one stays queued and the rest are still tried. A 401
 * stops the pass — every call would fail the same way until the phone sends a fresh token.
 */
class RunSyncer(
    private val store: PendingRunStore,
    private val api: CompanionApi,
    private val hasToken: suspend () -> Boolean,
    private val isPhoneConnected: () -> Boolean,
    private val deviceModel: String,
    private val appVersion: String,
    /** Tells the phone a run synced; returns false when the phone isn't reachable. */
    private val notifyPhone: (sessionId: String, runId: String?) -> Boolean,
    private val now: () -> Long = System::currentTimeMillis,
) {
    companion object {
        const val END_SESSION_WINDOW_MS = 10 * 60_000L
    }

    data class Result(val synced: Int, val remaining: Int, val authBlocked: Boolean)

    private val mutex = Mutex()

    suspend fun syncAll(): Result = mutex.withLock {
        if (!hasToken()) return@withLock Result(0, store.pending().size, authBlocked = true)
        var synced = 0
        for (run in store.pending()) {
            when (syncOne(run)) {
                Outcome.SYNCED -> synced++
                Outcome.FAILED -> Unit
                Outcome.UNAUTHORIZED -> return@withLock Result(synced, store.pending().size, authBlocked = true)
            }
        }
        Result(synced, store.pending().size, authBlocked = false)
    }

    private enum class Outcome { SYNCED, FAILED, UNAUTHORIZED }

    private suspend fun syncOne(initial: RunRecord): Outcome {
        var run = initial
        var runId: String? = null
        val fresh = now() - run.finishedAtMs <= END_SESSION_WINDOW_MS
        val hasTrack = run.points.isNotEmpty()

        if (!run.endSent && (fresh || !hasTrack)) {
            val end = api.endSession(endRequest(run))
            if (end.unauthorized) return Outcome.UNAUTHORIZED
            if (end.ok) {
                runId = end.value
                run = run.copy(endSent = true)
                if (hasTrack) store.update(run)
            } else if (!hasTrack) {
                return Outcome.FAILED
            }
        }

        if (hasTrack) {
            val upload = api.uploadBatch(run.sessionId, batchRequest(run))
            if (upload.unauthorized) return Outcome.UNAUTHORIZED
            if (!upload.ok) return Outcome.FAILED
            runId = upload.value ?: runId
        }

        store.remove(run.sessionId)
        if (!notifyPhone(run.sessionId, runId)) store.addUnnotified(run.sessionId, runId)
        return Outcome.SYNCED
    }

    private fun endRequest(run: RunRecord) = SessionEndRequest(
        sessionId = run.sessionId,
        sessionType = run.sessionType,
        summary = SessionSummary(
            totalDistance = run.distanceM,
            totalDuration = run.durationSec.toLong(),
            avgHeartRate = run.avgHeartRate,
            maxHeartRate = run.maxHeartRate,
            avgCadence = run.avgCadence,
            avgPace = run.avgPaceSecPerKm,
            totalAscent = run.totalAscentM.takeIf { it > 0 },
            totalDescent = run.totalDescentM.takeIf { it > 0 }
        ),
        plannedWorkoutId = run.plannedWorkoutId
    )

    private fun batchRequest(run: RunRecord) = UploadBatchRequest(
        sessionId = run.sessionId,
        sessionType = run.sessionType,
        points = run.points,
        distanceM = run.distanceM.toFloat(),
        durationSec = run.durationSec,
        totalAscent = run.totalAscentM.toFloat(),
        plannedWorkoutId = run.plannedWorkoutId,
        startedAtEpoch = run.startedAtEpochSec.takeIf { it > 0 },
        phoneConnected = isPhoneConnected(),
        deviceModel = deviceModel,
        watchAppVersion = appVersion
    )
}
