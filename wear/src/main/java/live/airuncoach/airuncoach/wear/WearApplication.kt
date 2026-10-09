package live.airuncoach.airuncoach.wear

import android.app.Application
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import live.airuncoach.airuncoach.wear.data.DirectHttpApiClient
import live.airuncoach.airuncoach.wear.data.RunSyncer
import live.airuncoach.airuncoach.wear.data.WearDataLayerClient
import live.airuncoach.airuncoach.wear.sensors.HealthServicesManager
import live.airuncoach.airuncoach.wear.session.RunSessionController
import live.airuncoach.airuncoach.wear.storage.CrashBreadcrumb
import live.airuncoach.airuncoach.wear.storage.DirRunFileSystem
import live.airuncoach.airuncoach.wear.storage.LegacyOfflineBatch
import live.airuncoach.airuncoach.wear.storage.OfflineGpsBuffer
import live.airuncoach.airuncoach.wear.storage.PendingRunStore
import live.airuncoach.airuncoach.wear.storage.WearPreferences
import java.io.File

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
    /** Also used by SyncWorker, so a background sync shares the in-app sync's lock. */
    lateinit var runSyncer: RunSyncer
        private set

    override fun onCreate() {
        super.onCreate()
        CrashBreadcrumb.install(this)

        preferences = WearPreferences(this)
        val offlineBuffer = OfflineGpsBuffer()
        val store = PendingRunStore(DirRunFileSystem(File(filesDir, "runs")))
        LegacyOfflineBatch.migrate(this, store)
        val dataLayer = WearDataLayerClient(this, appScope)
        // The controller doesn't exist yet when the client is built; a 401 can only happen
        // after start(), by which point it does.
        val httpApi = DirectHttpApiClient(
            getAuthToken = { preferences.getAuthTokenOnce() },
            onUnauthorized = { token -> runSessionController.onAuthRejected(token) }
        )
        val health = HealthServicesManager(this)
        runSyncer = RunSyncer(
            store = store,
            api = httpApi,
            hasToken = { !preferences.getAuthTokenOnce().isNullOrBlank() },
            isPhoneConnected = { dataLayer.isPhoneConnected.value },
            deviceModel = RunSessionController.DEVICE_MODEL,
            appVersion = BuildConfig.VERSION_NAME,
            notifyPhone = { sid, runId -> runSessionController.notifySyncComplete(sid, runId) }
        )

        runSessionController = RunSessionController(
            context = this,
            scope = appScope,
            dataLayer = dataLayer,
            httpApi = httpApi,
            health = health,
            prefs = preferences,
            offlineBuffer = offlineBuffer,
            store = store,
            syncer = runSyncer
        )
        runSessionController.start()
        live.airuncoach.airuncoach.wear.session.WearVideoDemoMode.install(this, runSessionController)
    }
}
