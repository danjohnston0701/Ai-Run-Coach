package live.airuncoach.airuncoach.wear.storage

import org.junit.Assert.assertEquals
import org.junit.Test

class OfflineGpsBufferTest {

    private fun point(i: Int) = GpsPoint(i, i, i, i, i, i, i)

    @Test
    fun `buffer caps at MAX_POINTS and marks itself full`() {
        val buffer = OfflineGpsBuffer()
        repeat(OfflineGpsBuffer.MAX_POINTS + 10) { buffer.addPoint(point(it)) }

        assertEquals(OfflineGpsBuffer.MAX_POINTS, buffer.points.size)
        assertEquals(true, buffer.isFull)
    }

    @Test
    fun `cap covers at least six hours at the capture interval`() {
        assert(OfflineGpsBuffer.MAX_POINTS * OfflineGpsBuffer.CAPTURE_INTERVAL_MS >= 6 * 3600_000L)
    }

    @Test
    fun `reset clears points and full flag`() {
        val buffer = OfflineGpsBuffer()
        repeat(OfflineGpsBuffer.MAX_POINTS + 1) { buffer.addPoint(point(it)) }
        assertEquals(true, buffer.isFull)

        buffer.reset()

        assertEquals(0, buffer.points.size)
        assertEquals(false, buffer.isFull)
    }

    @Test
    fun `compact round trip restores the same points`() {
        val buffer = OfflineGpsBuffer()
        repeat(5) { buffer.addPoint(point(it)) }

        val restored = OfflineGpsBuffer()
        restored.restore(buffer.compact())

        assertEquals(buffer.points, restored.points)
    }
}
