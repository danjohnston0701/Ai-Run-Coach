package live.airuncoach.airuncoach.wear.data

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class RetryLoopTest {

    @Test
    fun `sends immediately on start`() = runTest {
        var sendCount = 0
        val loop = RetryLoop(scope = this, maxAttempts = 3, intervalMs = 5000L) { sendCount++ }

        loop.start()

        assertEquals(1, sendCount)
    }

    @Test
    fun `resends up to maxAttempts at the configured interval`() = runTest {
        var sendCount = 0
        val loop = RetryLoop(scope = this, maxAttempts = 3, intervalMs = 5000L) { sendCount++ }

        loop.start()
        advanceTimeBy(5001L) // 1st retry
        advanceTimeBy(5000L) // 2nd retry
        advanceTimeBy(5000L) // 3rd retry
        advanceTimeBy(5000L) // would be a 4th, but budget is exhausted

        // 1 initial + 3 retries = 4 total sends, never more.
        assertEquals(4, sendCount)
    }

    @Test
    fun `cancel stops further resends`() = runTest {
        var sendCount = 0
        val loop = RetryLoop(scope = this, maxAttempts = 3, intervalMs = 5000L) { sendCount++ }

        loop.start()
        advanceTimeBy(5001L) // 1 retry fires -> sendCount = 2
        loop.cancel()
        advanceTimeBy(20000L) // nothing further should fire

        assertEquals(2, sendCount)
    }

    @Test
    fun `starting again resets the attempt budget`() = runTest {
        var sendCount = 0
        val loop = RetryLoop(scope = this, maxAttempts = 1, intervalMs = 1000L) { sendCount++ }

        loop.start()
        advanceTimeBy(1001L)
        assertEquals(2, sendCount) // initial + 1 retry, budget exhausted

        loop.start() // fresh session type / start command
        advanceTimeBy(1001L)

        assertEquals(4, sendCount) // 2 more: initial + 1 retry
    }
}
