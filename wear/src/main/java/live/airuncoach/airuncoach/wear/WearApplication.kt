package live.airuncoach.airuncoach.wear

import android.app.Application
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import live.airuncoach.airuncoach.wear.data.DirectHttpApiClient
import live.airuncoach.airuncoach.wear.data.WearDataLayerClient
import live.airuncoach.airuncoach.wear.sensors.HealthServicesManager
import live.airuncoach.airuncoach.wear.session.RunSessionController
import live.airuncoach.airuncoach.wear.storage.CrashBreadcrumb
import live.airuncoach.airuncoach.wear.storage.OfflineGpsBuffer
import live.airuncoach.airuncoach.wear.storage.SharedPrefsOfflineBufferStorage
import live.airuncoach.airuncoach.wear.storage.WearPreferences

/**
 * Manual-DI application container — deliberately no Hilt in this module (see
 * wear/build.gradle.kts). Owns every singleton that must outlive any single Activity,
 * critically [RunSessionController]: a run in progress must survive the screen being
 * backgrounded (the whole point of scoping it here rather than to an Activity/ViewModel —
 * see the controller's class doc for the Garmin-side bug this mirrors the fix for).
 */
class WearApplication : Application() {

    /** Lives for the whole process — never cancelled, matching [RunSessionController]'s
     * "tracking never stops just because a screen went away" requirement. */
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    lateinit var preferences: WearPreferences
        private set
    lateinit var runSessionController: RunSessionController
        private set

    override fun onCreate() {
        super.onCreate()
        CrashBreadcrumb.install(this)

        preferences = WearPreferences(this)
        val offlineBuffer = OfflineGpsBuffer(SharedPrefsOfflineBufferStorage(this))
        val dataLayer = WearDataLayerClient(this, appScope)
        val httpApi = DirectHttpApiClient(getAuthToken = { preferences.getAuthTokenOnce() })
        val health = HealthServicesManager(this)

        runSessionController = RunSessionController(
            context = this,
            scope = appScope,
            dataLayer = dataLayer,
            httpApi = httpApi,
            health = health,
            prefs = preferences,
            offlineBuffer = offlineBuffer
        )
        runSessionController.start()
    }
}
