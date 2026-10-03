package live.airuncoach.airuncoach.data

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService

/**
 * Reports app-side actions (ones with no server route of their own — preparing and starting a
 * run) to the server's user_activity log via POST /api/user-activity. Server-side actions are
 * logged by the server itself (server/user-activity.ts), so only the names in its CLIENT_ACTIONS
 * list are accepted here. Fire-and-forget: never blocks or fails the caller.
 */
object UserActivityReporter {
    const val PREPARED_RUN_WITHOUT_ROUTE = "Prepared run without route"
    const val PREPARED_RUN_WITH_ROUTE = "Prepared run with route"
    const val PREPARED_RUN_FOR_WATCH = "Prepared run for watch"
    const val STARTED_RUN_WITHOUT_ROUTE = "Started run without route"
    const val STARTED_RUN_WITH_ROUTE = "Started run with route"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun report(
        apiService: ApiService,
        action: String,
        details: Map<String, Any?> = emptyMap(),
        error: String? = null
    ) {
        scope.launch {
            try {
                apiService.reportUserActivity(
                    mapOf(
                        "action" to action,
                        "outcome" to if (error == null) "success" else "error",
                        "error" to error,
                        "details" to details.filterValues { it != null }
                    )
                ).close()
            } catch (e: Exception) {
                Log.d("UserActivityReporter", "Could not report \"$action\": ${e.message}")
            }
        }
    }
}
