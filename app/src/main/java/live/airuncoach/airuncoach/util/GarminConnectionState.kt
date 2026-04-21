package live.airuncoach.airuncoach.util

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Simple singleton that signals when a Garmin OAuth connection has just completed.
 * MainActivity increments [refreshTick] when airuncoach://connected-devices?garmin=success
 * arrives. ConnectedDevicesViewModel observes it and re-checks the server.
 */
object GarminConnectionState {
    private val _refreshTick = MutableStateFlow(0)
    val refreshTick = _refreshTick.asStateFlow()

    fun notifyConnected() {
        _refreshTick.value++
    }
}
