package live.airuncoach.airuncoach.wear.sensors

import org.junit.Assert.assertEquals
import org.junit.Test

class GpsQualityMonitorTest {
    @Test
    fun `no fix is quality 0`() {
        assertEquals(0, resolveGpsQuality(null, null))
    }

    @Test
    fun `stale fix over 30s is quality 1 regardless of accuracy`() {
        assertEquals(1, resolveGpsQuality(5f, 31_000L))
    }

    @Test
    fun `tight recent fix is quality 4`() {
        assertEquals(4, resolveGpsQuality(8f, 2_000L))
    }

    @Test
    fun `usable fix is quality 3`() {
        assertEquals(3, resolveGpsQuality(20f, 8_000L))
    }

    @Test
    fun `loose fix is quality 2`() {
        assertEquals(2, resolveGpsQuality(40f, 8_000L))
    }

    @Test
    fun `very loose fix falls back to quality 1`() {
        assertEquals(1, resolveGpsQuality(80f, 8_000L))
    }
}
