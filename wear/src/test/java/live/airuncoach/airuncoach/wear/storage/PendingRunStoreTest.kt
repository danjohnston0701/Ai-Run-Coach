package live.airuncoach.airuncoach.wear.storage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** In-memory file system whose writes fail once a file would exceed [maxBytes]. */
class FakeRunFileSystem(var maxBytes: Int = Int.MAX_VALUE) : RunFileSystem {
    val files = mutableMapOf<String, String>()
    override fun write(name: String, text: String): Boolean {
        if (text.length > maxBytes) return false
        files[name] = text
        return true
    }
    override fun read(name: String) = files[name]
    override fun delete(name: String) { files.remove(name) }
    override fun list() = files.keys.toList()
}

class PendingRunStoreTest {

    @get:Rule val tmp = TemporaryFolder()

    private fun run(id: String, points: Int = 10, finishedAt: Long = 1_000) = RunRecord(
        sessionId = id,
        finishedAtMs = finishedAt,
        distanceM = 5000.0,
        durationSec = 1500,
        startedAtEpochSec = 1_760_000_000,
        points = List(points) { i -> listOf(i, 1, 2, 3, 4, 5, 6) }
    )

    @Test
    fun `queued run survives a new store instance on the real file system`() {
        val dir = tmp.newFolder("runs")
        PendingRunStore(DirRunFileSystem(dir)).enqueue(run("a"))

        val reopened = PendingRunStore(DirRunFileSystem(dir)).pending()

        assertEquals(1, reopened.size)
        assertEquals("a", reopened[0].sessionId)
        assertEquals(10, reopened[0].points.size)
        assertEquals(1_760_000_000L, reopened[0].startedAtEpochSec)
    }

    @Test
    fun `holds several runs, oldest first, and never drops one to make room`() {
        val store = PendingRunStore(FakeRunFileSystem())
        store.enqueue(run("late", finishedAt = 3_000))
        store.enqueue(run("early", finishedAt = 1_000))

        assertEquals(listOf("early", "late"), store.pending().map { it.sessionId })
    }

    @Test
    fun `falls back to every second point, then summary only, when storage is short`() {
        val fs = FakeRunFileSystem()
        val store = PendingRunStore(fs)
        val full = run("x", points = 400)
        val fullSize = com.google.gson.Gson().toJson(full).length

        fs.maxBytes = fullSize - 1
        assertEquals(SaveTier.COMPACT, store.enqueue(full))
        assertEquals(200, store.pending().single().points.size)

        fs.maxBytes = 600
        assertEquals(SaveTier.METADATA_ONLY, store.enqueue(full))
        val saved = store.pending().single()
        assertTrue(saved.points.isEmpty())
        assertEquals(5000.0, saved.distanceM, 0.0)

        fs.maxBytes = 10
        assertEquals(SaveTier.FAILED, store.enqueue(full))
    }

    @Test
    fun `remove deletes only that run`() {
        val store = PendingRunStore(FakeRunFileSystem())
        store.enqueue(run("a"))
        store.enqueue(run("b"))
        store.remove("a")
        assertEquals(listOf("b"), store.pending().map { it.sessionId })
        assertTrue(store.hasPending())
        store.remove("b")
        assertFalse(store.hasPending())
    }

    @Test
    fun `unreadable queued file is dropped, not retried forever`() {
        val fs = FakeRunFileSystem()
        fs.files["pending_bad.json"] = "{not json"
        val store = PendingRunStore(fs)
        store.enqueue(run("good"))

        assertEquals(listOf("good"), store.pending().map { it.sessionId })
        assertNull(fs.files["pending_bad.json"])
    }

    @Test
    fun `checkpoint round trip keeps the clock and accumulators`() {
        val store = PendingRunStore(FakeRunFileSystem())
        store.saveCheckpoint(run("live").copy(
            clock = ActiveClockSnapshot(startedAtMs = 10, pausedTotalMs = 20, pausedAtMs = 30),
            isPaused = true, sampleCount = 42, sumHeartRate = 6000.0
        ))

        val cp = store.loadCheckpoint()
        assertNotNull(cp)
        assertEquals(ActiveClockSnapshot(10, 20, 30), cp!!.clock)
        assertEquals(42, cp.sampleCount)
        assertTrue(cp.isPaused)

        store.clearCheckpoint()
        assertNull(store.loadCheckpoint())
        assertFalse("a checkpoint is not a queued run", store.hasPending())
    }

    @Test
    fun `record written without newer fields still loads with defaults`() {
        val fs = FakeRunFileSystem()
        fs.files["pending_old.json"] = """{"sessionId":"old","distanceM":1200.0,"points":[[1,2,3,4,5,6,7]]}"""
        val r = PendingRunStore(fs).pending().single()
        assertEquals("run", r.sessionType)
        assertEquals(false, r.endSent)
        assertEquals(1, r.points.size)
    }

    @Test
    fun `runs synced while the phone was away are reported once`() {
        val store = PendingRunStore(FakeRunFileSystem())
        store.addUnnotified("a", "run-1")
        store.addUnnotified("b", null)
        assertEquals(listOf("a", "b"), store.takeUnnotified().map { it.sessionId })
        assertTrue(store.takeUnnotified().isEmpty())
    }

    @Test
    fun `legacy point string parses, skipping malformed entries`() {
        val pts = LegacyOfflineBatch.parsePoints("1,2,3,4,5,6,7;bad;8,9,10,11,12,13,14")
        assertEquals(listOf(listOf(1, 2, 3, 4, 5, 6, 7), listOf(8, 9, 10, 11, 12, 13, 14)), pts)
        assertTrue(LegacyOfflineBatch.parsePoints(null).isEmpty())
    }
}
