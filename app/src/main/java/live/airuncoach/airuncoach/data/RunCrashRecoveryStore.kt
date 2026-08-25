package live.airuncoach.airuncoach.data

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import live.airuncoach.airuncoach.domain.model.RunSession
import java.io.File

/**
 * Periodically-written local snapshot of the run currently in progress, so a
 * frozen/killed RunTrackingService process still leaves the last ~20 seconds of
 * data on disk instead of losing the whole session.
 *
 * Deliberately separate from the pending_syncs upload queue (SyncQueue /
 * PendingSyncEntity): that table is polled by SyncWorker and would risk uploading
 * a still-in-progress run as if it were a finished one. Snapshots here are plain
 * files and are never auto-uploaded — recovering one is a manual/future step.
 */
class RunCrashRecoveryStore(context: Context) {

    private val gson = Gson()
    private val appContext = context.applicationContext

    private val dir: File by lazy {
        File(appContext.filesDir, "run_recovery").apply { mkdirs() }
    }

    private fun fileFor(runStartTime: Long) = File(dir, "snapshot_$runStartTime.json")

    /** Overwrites this run's snapshot with the latest known state. Best-effort — never throws. */
    fun save(runStartTime: Long, session: RunSession) {
        try {
            val target = fileFor(runStartTime)
            val tmp = File(dir, "${target.name}.tmp")
            tmp.writeText(gson.toJson(session))
            // Atomic-ish swap so a write interrupted mid-flight (e.g. by the same freeze
            // we're trying to survive) never leaves a half-written snapshot as the "latest".
            if (!tmp.renameTo(target)) {
                target.writeText(gson.toJson(session))
                tmp.delete()
            }
        } catch (e: Exception) {
            Log.w("RunCrashRecoveryStore", "save failed (non-fatal): ${e.message}")
        }
    }

    /** Deletes this run's snapshot. Call once the run has ended normally. */
    fun clear(runStartTime: Long) {
        try {
            fileFor(runStartTime).delete()
            File(dir, "snapshot_$runStartTime.json.tmp").delete()
        } catch (e: Exception) {
            Log.w("RunCrashRecoveryStore", "clear failed (non-fatal): ${e.message}")
        }
    }

    /**
     * Best-effort housekeeping: surfaces (in logcat) any snapshot left over from a run
     * that never called clear() — i.e. the app was killed/frozen mid-session rather than
     * stopped normally — and prunes anything old enough to be irrecoverable/irrelevant.
     * Call once per service start.
     *
     * Deliberately does NOT auto-upload a leftover snapshot: that needs on-device
     * verification of the recovered data before it's trusted into a user's real run
     * history. This only guarantees the raw data still exists on the device.
     */
    fun logAndPruneStaleSnapshots(maxAgeMs: Long = 7 * 24 * 60 * 60 * 1000L) {
        try {
            val files = dir.listFiles { f -> f.name.startsWith("snapshot_") && f.name.endsWith(".json") } ?: return
            val now = System.currentTimeMillis()
            for (f in files) {
                val age = now - f.lastModified()
                if (age > maxAgeMs) {
                    Log.w("RunCrashRecoveryStore", "Pruning stale recovery snapshot (age=${age / 1000}s): ${f.name}")
                    f.delete()
                } else {
                    Log.w(
                        "RunCrashRecoveryStore",
                        "Leftover run-recovery snapshot found from a session that didn't end normally: " +
                            "${f.absolutePath} (age=${age / 1000}s). Data up to that point can be recovered from this file."
                    )
                }
            }
        } catch (e: Exception) {
            Log.w("RunCrashRecoveryStore", "prune failed (non-fatal): ${e.message}")
        }
    }
}
