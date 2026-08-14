package live.airuncoach.airuncoach.wear.storage

import org.junit.Assert.assertEquals
import org.junit.Test

private class FakeStorage(private val failKeys: Set<String> = emptySet()) : OfflineBufferStorage {
    val writes = mutableMapOf<String, String>()
    var pointWriteAttempts = 0

    override fun write(key: String, value: String): Boolean {
        if (key == "offlineBatchPoints") pointWriteAttempts++
        if (key in failKeys) return false
        writes[key] = value
        return true
    }

    override fun delete(key: String) {
        writes.remove(key)
    }
}

class OfflineGpsBufferTest {

    private fun point(i: Int) = GpsPoint(i, i, i, i, i, i, i)

    @Test
    fun `tier 1 succeeds when storage has room`() {
        val storage = FakeStorage()
        val buffer = OfflineGpsBuffer(storage)
        repeat(10) { buffer.addPoint(point(it)) }

        val tier = buffer.save("session-1", 1000f, 300, 10f)

        assertEquals(SaveTier.FULL, tier)
        assertEquals(1, storage.pointWriteAttempts)
        assertEquals("session-1", storage.writes["offlineBatchSessionId"])
    }

    @Test
    fun `always fails full, always fails compact - falls back to metadata only`() {
        val storage = FakeStorage(failKeys = setOf("offlineBatchPoints"))
        val buffer = OfflineGpsBuffer(storage)
        repeat(10) { buffer.addPoint(point(it)) }

        val tier = buffer.save("session-2", 500f, 120, 5f)

        assertEquals(SaveTier.METADATA_ONLY, tier)
        // Scalar metadata still recorded even though points never fit.
        assertEquals("500.0", storage.writes["offlineBatchDistance"])
        assertEquals(null, storage.writes["offlineBatchPoints"])
    }

    @Test
    fun `in-memory points retained regardless of which tier persisted`() {
        val storage = FakeStorage(failKeys = setOf("offlineBatchPoints"))
        val buffer = OfflineGpsBuffer(storage)
        repeat(5) { buffer.addPoint(point(it)) }

        buffer.save("session-3", 100f, 60, 0f)

        assertEquals(5, buffer.points.size)
    }

    @Test
    fun `buffer caps at MAX_POINTS and marks itself full`() {
        val buffer = OfflineGpsBuffer(FakeStorage())
        repeat(OfflineGpsBuffer.MAX_POINTS + 10) { buffer.addPoint(point(it)) }

        assertEquals(OfflineGpsBuffer.MAX_POINTS, buffer.points.size)
        assertEquals(true, buffer.isFull)
    }

    @Test
    fun `reset clears points and full flag`() {
        val buffer = OfflineGpsBuffer(FakeStorage())
        repeat(OfflineGpsBuffer.MAX_POINTS + 1) { buffer.addPoint(point(it)) }
        assertEquals(true, buffer.isFull)

        buffer.reset()

        assertEquals(0, buffer.points.size)
        assertEquals(false, buffer.isFull)
    }
}
