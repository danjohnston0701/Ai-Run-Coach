package live.airuncoach.airuncoach.wear.session

import org.junit.Assert.assertEquals
import org.junit.Test

class ActiveClockTest {

    @Test
    fun `pauses are not counted as run time`() {
        val clock = ActiveClock()
        clock.start(0)
        clock.pause(600_000)          // 10 min running
        clock.resume(900_000)         // 5 min paused
        assertEquals(900_000L, clock.elapsedMs(1_200_000)) // + 5 min running = 15 min
    }

    @Test
    fun `time stands still while paused`() {
        val clock = ActiveClock()
        clock.start(0)
        clock.pause(60_000)
        assertEquals(60_000L, clock.elapsedMs(60_000))
        assertEquals(60_000L, clock.elapsedMs(500_000))
    }

    @Test
    fun `repeated pause or resume is ignored`() {
        val clock = ActiveClock()
        clock.start(0)
        clock.pause(10_000)
        clock.pause(20_000)
        clock.resume(30_000)
        clock.resume(40_000)
        assertEquals(30_000L, clock.elapsedMs(50_000))
    }

    @Test
    fun `snapshot survives a relaunch, including time the app was dead`() {
        val clock = ActiveClock()
        clock.start(0)
        clock.pause(100_000)
        clock.resume(160_000)
        val snap = clock.snapshot()

        val relaunched = ActiveClock()
        relaunched.restore(snap)
        // Killed at 200 s, relaunched at 300 s: the runner was still running all along.
        assertEquals(240_000L, relaunched.elapsedMs(300_000))
    }

    @Test
    fun `restored while paused stays paused`() {
        val clock = ActiveClock()
        clock.start(0)
        clock.pause(100_000)
        val relaunched = ActiveClock().apply { restore(clock.snapshot()) }
        assertEquals(true, relaunched.isPaused)
        assertEquals(100_000L, relaunched.elapsedMs(999_000))
    }

    @Test
    fun `not started reads zero`() {
        assertEquals(0L, ActiveClock().elapsedMs(123_456))
    }
}
