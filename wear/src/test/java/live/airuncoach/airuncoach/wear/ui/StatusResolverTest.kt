package live.airuncoach.airuncoach.wear.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class StatusResolverTest {

    private fun input(
        ephemeralMessage: String? = null,
        isRunning: Boolean = false,
        gpsLost: Boolean = false,
        isAuthenticated: Boolean = true,
        isConnected: Boolean = false,
        offlineGraceElapsed: Boolean = true
    ) = StatusBarInput(ephemeralMessage, isRunning, gpsLost, isAuthenticated, isConnected, offlineGraceElapsed)

    @Test
    fun `ephemeral message always wins, even while running with GPS lost`() {
        val result = resolveStatus(input(ephemeralMessage = "Asking coach...", isRunning = true, gpsLost = true))
        assertEquals("Asking coach...", result.text)
        assertEquals(StatusTone.NEUTRAL, result.tone)
    }

    @Test
    fun `GPS lost beats OFFLINE when both would otherwise apply`() {
        // isRunning=true also implies OFFLINE's own guard (!isRunning) wouldn't fire anyway,
        // but this asserts GPS LOST is chosen via priority order, not just by exclusion.
        val result = resolveStatus(input(isRunning = true, gpsLost = true, isConnected = false))
        assertEquals("GPS LOST", result.text)
        assertEquals(StatusTone.WARNING, result.tone)
    }

    @Test
    fun `OFFLINE only shown after the connect grace period elapses`() {
        val stillWaiting = resolveStatus(input(isRunning = false, isConnected = false, offlineGraceElapsed = false))
        assertEquals("PRESS START", stillWaiting.text)

        val graceOver = resolveStatus(input(isRunning = false, isConnected = false, offlineGraceElapsed = true))
        assertEquals("OFFLINE", graceOver.text)
    }

    @Test
    fun `OFFLINE never shown while connected to phone`() {
        val result = resolveStatus(input(isRunning = false, isConnected = true, offlineGraceElapsed = true))
        assertEquals("PRESS START", result.text)
    }

    @Test
    fun `unauthenticated idle watch shows PRESS START not OFFLINE`() {
        val result = resolveStatus(input(isRunning = false, isAuthenticated = false, isConnected = false, offlineGraceElapsed = true))
        assertEquals("PRESS START", result.text)
    }

    @Test
    fun `running with nothing to report is blank`() {
        val result = resolveStatus(input(isRunning = true, gpsLost = false))
        assertEquals(null, result.text)
    }
}
