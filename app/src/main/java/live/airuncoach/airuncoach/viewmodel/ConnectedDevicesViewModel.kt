
package live.airuncoach.airuncoach.viewmodel

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class Device(val name: String, val description: String, val connected: Boolean)

class ConnectedDevicesViewModel : ViewModel() {

    private val _devices = MutableStateFlow<List<Device>>(emptyList())
    val devices: StateFlow<List<Device>> = _devices.asStateFlow()

    init {
        loadDevices()
    }

    private fun loadDevices() {
        _devices.value = listOf(
            Device("Samsung Galaxy Watch", "Connect via Samsung Health SDK for real-time heart rate tracking", false),
            Device("Garmin", "Connected - 2 min ago", true),
            Device("COROS", "Connect via COROS API for post-run activity sync", false),
            Device("Strava", "Connect via Strava API for post-run activity sync", false)
        )
    }
}
