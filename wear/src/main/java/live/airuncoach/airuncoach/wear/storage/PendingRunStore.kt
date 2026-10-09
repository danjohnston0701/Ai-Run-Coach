package live.airuncoach.airuncoach.wear.storage

import android.util.Log
import com.google.gson.Gson
import java.io.File

/** File operations behind [PendingRunStore], so the store is unit-testable (including a full
 * disk) without a device. */
interface RunFileSystem {
    /** Returns false if the write failed (e.g. no space left). Must never leave a half-written file. */
    fun write(name: String, text: String): Boolean
    fun read(name: String): String?
    fun delete(name: String)
    fun list(): List<String>
}

/** Production [RunFileSystem]: one directory under the app's private files, atomic writes. */
class DirRunFileSystem(private val dir: File) : RunFileSystem {
    init { dir.mkdirs() }

    override fun write(name: String, text: String): Boolean = try {
        val tmp = File(dir, "$name.tmp")
        tmp.writeText(text)
        val target = File(dir, name)
        if (!tmp.renameTo(target)) {
            target.delete()
            tmp.renameTo(target)
        } else true
    } catch (e: Exception) {
        Log.w("RunFileSystem", "write($name) failed: ${e.message}")
        File(dir, "$name.tmp").delete()
        false
    }

    override fun read(name: String): String? = try {
        File(dir, name).takeIf { it.exists() }?.readText()
    } catch (e: Exception) {
        null
    }

    override fun delete(name: String) {
        File(dir, name).delete()
    }

    override fun list(): List<String> = dir.list()?.toList() ?: emptyList()
}

enum class SaveTier { FULL, COMPACT, METADATA_ONLY, FAILED }

/**
 * Durable storage for watch-owned runs:
 *  - the **checkpoint** of the run in progress, rewritten every ~30 s, so a flat battery or a
 *    killed app costs at most the last 30 s instead of the whole run;
 *  - the **queue** of finished runs not yet saved to the server, one file per run. A run is
 *    removed only after the server confirms it — never just because an upload was attempted.
 *
 * The queue holds any number of runs (the Garmin app can only keep one, and frees space by
 * deleting the older one — never acceptable here). A run that doesn't fit falls back through
 * the same tiers as Garmin: full track, every 2nd point, then summary only.
 */
class PendingRunStore(private val fs: RunFileSystem, private val gson: Gson = Gson()) {

    companion object {
        private const val TAG = "PendingRunStore"
        private const val CHECKPOINT = "active_run.json"
        private const val PENDING_PREFIX = "pending_"
        private const val SUFFIX = ".json"
        private const val UNNOTIFIED = "synced_unnotified.json"
    }

    // ── Checkpoint ────────────────────────────────────────────────────────────

    fun saveCheckpoint(record: RunRecord): Boolean {
        if (fs.write(CHECKPOINT, gson.toJson(record))) return true
        return fs.write(CHECKPOINT, gson.toJson(record.copy(points = thin(record.points), saveTier = SaveTier.COMPACT)))
    }

    fun loadCheckpoint(): RunRecord? = decode(CHECKPOINT)

    fun clearCheckpoint() = fs.delete(CHECKPOINT)

    // ── Queue ─────────────────────────────────────────────────────────────────

    fun enqueue(record: RunRecord): SaveTier {
        val name = fileFor(record.sessionId)
        if (fs.write(name, gson.toJson(record.copy(saveTier = SaveTier.FULL)))) return SaveTier.FULL
        if (fs.write(name, gson.toJson(record.copy(points = thin(record.points), saveTier = SaveTier.COMPACT)))) {
            return SaveTier.COMPACT
        }
        if (fs.write(name, gson.toJson(record.copy(points = emptyList(), saveTier = SaveTier.METADATA_ONLY)))) {
            return SaveTier.METADATA_ONLY
        }
        return SaveTier.FAILED
    }

    /** Rewrites a queued run in place (e.g. to record that session/end already succeeded). */
    fun update(record: RunRecord): Boolean = fs.write(fileFor(record.sessionId), gson.toJson(record))

    fun remove(sessionId: String) = fs.delete(fileFor(sessionId))

    /** Queued runs, oldest first. Unreadable files are dropped rather than retried forever. */
    fun pending(): List<RunRecord> =
        fs.list()
            .filter { it.startsWith(PENDING_PREFIX) && it.endsWith(SUFFIX) }
            .mapNotNull { name ->
                decode(name)?.takeIf { it.sessionId.isNotBlank() } ?: run {
                    Log.w(TAG, "Dropping unreadable queued run $name")
                    fs.delete(name)
                    null
                }
            }
            .sortedBy { it.finishedAtMs }

    fun hasPending(): Boolean = fs.list().any { it.startsWith(PENDING_PREFIX) && it.endsWith(SUFFIX) }

    // ── Synced while the phone was away ───────────────────────────────────────
    // The phone shows "watch run synced" when it hears syncComplete. A run that synced with
    // the phone out of range is remembered here and reported the next time it connects.

    fun addUnnotified(sessionId: String, runId: String?) {
        val list = unnotified().filterNot { it.sessionId == sessionId } + SyncedRun(sessionId, runId)
        fs.write(UNNOTIFIED, gson.toJson(list.takeLast(20)))
    }

    fun takeUnnotified(): List<SyncedRun> {
        val list = unnotified()
        fs.delete(UNNOTIFIED)
        return list
    }

    private fun unnotified(): List<SyncedRun> = try {
        fs.read(UNNOTIFIED)?.let { gson.fromJson(it, Array<SyncedRun>::class.java)?.toList() } ?: emptyList()
    } catch (e: Exception) {
        emptyList()
    }

    private fun fileFor(sessionId: String) =
        PENDING_PREFIX + sessionId.filter { it.isLetterOrDigit() || it == '-' } + SUFFIX

    private fun decode(name: String): RunRecord? = try {
        fs.read(name)?.let { gson.fromJson(it, RunRecord::class.java) }
    } catch (e: Exception) {
        Log.w(TAG, "decode($name) failed: ${e.message}")
        null
    }

    private fun thin(points: List<List<Int>>) = points.filterIndexed { i, _ -> i % 2 == 0 }
}

data class SyncedRun(val sessionId: String = "", val runId: String? = null)
