package live.airuncoach.airuncoach.wear.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Generic start/stop-command retry loop — mirrors the Garmin Connect IQ watch app's BT-drop
 * recovery (RunView.mc: 3x/5s for "start", 6x/5s for "stop"). The Wear OS Data Layer
 * MessageClient is fire-and-forget with no delivery guarantee, same as ConnectIQ's
 * Comm.transmit(), so commands are resent until acknowledged or the attempt budget runs out.
 *
 * Pure and unit-testable: takes an injected [CoroutineScope] so tests can use
 * `kotlinx-coroutines-test`'s virtual-time TestScope instead of real delays.
 */
class RetryLoop(
    private val scope: CoroutineScope,
    private val maxAttempts: Int,
    private val intervalMs: Long,
    private val send: () -> Unit
) {
    private var job: Job? = null
    private var attemptsRemaining = 0

    /** Sends immediately, then arms up to [maxAttempts] resends every [intervalMs] until [cancel] is called. */
    fun start() {
        cancel()
        attemptsRemaining = maxAttempts
        send()
        job = scope.launch {
            while (attemptsRemaining > 0) {
                delay(intervalMs)
                if (attemptsRemaining <= 0) break
                attemptsRemaining--
                send()
            }
        }
    }

    /** Call when the counterpart acknowledges receipt — stops further resends. */
    fun cancel() {
        job?.cancel()
        job = null
        attemptsRemaining = 0
    }

    val isActive: Boolean get() = job != null
}
