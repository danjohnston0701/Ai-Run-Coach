package live.airuncoach.airuncoach

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.util.Log
import com.google.firebase.crashlytics.FirebaseCrashlytics
import dagger.hilt.android.HiltAndroidApp
import live.airuncoach.airuncoach.data.RunCrashRecoveryStore
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.service.RunTrackingService

@HiltAndroidApp
class RunApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        initCrashlytics()
        installGarminSdkCrashGuard()
        // Must happen here, not only in MainActivity: on some OEMs (confirmed Oppo/ColorOS)
        // the OS respawns the killed process directly into a background component like
        // RunTrackingService, with MainActivity never launching. RetrofitClient.apiService
        // was throwing IllegalStateException in that case — e.g. WeatherRepository's eager
        // `RetrofitClient.apiService` property init in RunTrackingService.onCreate(), which
        // runs before that method's own defensive try/catch a few lines later. Application.
        // onCreate() is guaranteed to run before any Service/Activity in the process, so
        // initializing here closes the gap regardless of which component starts first.
        // initializeInternal() is idempotent, so MainActivity's own call stays a safe no-op.
        RetrofitClient.initialize(this, SessionManager(this))
    }

    /**
     * Explicit setUserId() happens in SessionManager alongside saveUserId()/clearAuthToken()
     * so every crash/ANR/non-fatal report is tied to the internal user ID it came from — the
     * only way to correlate a beta tester's own bug report (e.g. "Nino, walk session, Forerunner
     * 55") with the actual stack trace instead of guessing from a paraphrased description.
     * Collection is force-enabled here because debug/sideloaded beta builds (exactly what beta
     * testers run) are the ones we most need reports from — Crashlytics defaults to respecting
     * BuildConfig.DEBUG-derived heuristics that would otherwise silently drop them.
     */
    private fun initCrashlytics() {
        val crashlytics = FirebaseCrashlytics.getInstance()
        crashlytics.setCrashlyticsCollectionEnabled(true)
        crashlytics.setCustomKey("app_version_name", BuildConfig.VERSION_NAME)
        crashlytics.setCustomKey("app_version_code", BuildConfig.VERSION_CODE)
        crashlytics.setCustomKey("device_brand", Build.BRAND)
        crashlytics.setCustomKey("device_manufacturer", Build.MANUFACTURER)
        crashlytics.setCustomKey("device_model", Build.MODEL)
        crashlytics.setCustomKey("android_sdk_int", Build.VERSION.SDK_INT)

        // saveUserId() (SessionManager) tags Crashlytics at the moment of login, but that
        // never fires again for a user who was already logged in from a previous app install
        // session — without this, every crash from a returning user until their next fresh
        // login would show up unattributed.
        live.airuncoach.airuncoach.data.SessionManager(this).getUserId()?.let { userId ->
            crashlytics.setUserId(userId)
        }
    }

    /**
     * Wraps the default uncaught-exception handler (Crashlytics' own, already installed via its
     * ContentProvider by the time this runs) to specifically recognize one known Garmin Connect
     * IQ SDK bug: a corrupted BLE payload can make IQMessageReceiver's SerializedObject/
     * DataBlock/StringBlock byte-array parsing throw an IllegalArgumentException from a
     * corrupted/overflowed length prefix (e.g. "8 > -1469887392") entirely inside Garmin's
     * closed-source SDK, on its own dynamically-registered BroadcastReceiver — confirmed via
     * decompiling ciq-companion-app-sdk 2.3.0 AND the newer 2.4.0 (the relevant classes are
     * byte-for-byte identical between them; there is no newer SDK release that fixes this, and
     * there's no public source to patch directly). So far confirmed only on Oppo/ColorOS
     * (Nino's CPH2695, via Gemini-analyzed Crashlytics traces from an old app build).
     *
     * IMPORTANT — this CANNOT prevent the crash. An uncaught exception on the main thread still
     * terminates the process: Android's Looper does not resume after an exception propagates out
     * of dispatchMessage(), so returning normally from this handler does not save the app. What
     * this DOES do, in the brief window before the process actually dies:
     *  1. Tags it with a distinguishing Crashlytics custom key so it's trivially filterable as
     *     "known third-party SDK bug" instead of getting confused with a real bug in our code
     *     when triaging crash-free-rate regressions.
     *  2. Synchronously flushes whatever run is currently in progress to the crash-recovery
     *     snapshot store right now, instead of relying on the periodic ~20s snapshot timer —
     *     so RunTrackingService.finalizeOrphanedOrCrashedSession()'s existing hard-kill recovery
     *     path (see handleNullIntentRespawn()) has the freshest possible data to recover on the
     *     next launch instead of losing up to 20s of the run.
     * It then ALWAYS delegates to the previous handler so normal Crashlytics fatal reporting and
     * process termination proceed exactly as before — this must never mask or suppress a crash,
     * known or otherwise.
     */
    private fun installGarminSdkCrashGuard() {
        val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                if (isKnownGarminSdkDeserializationBug(throwable)) {
                    Log.e("RunApplication", "Known Garmin SDK deserialization bug hit — flushing any in-progress run before the process dies", throwable)
                    FirebaseCrashlytics.getInstance().apply {
                        setCustomKey("known_garmin_sdk_bug", "serialized_object_corrupt_length")
                        recordException(throwable)
                    }
                    RunTrackingService.currentRunSession.value
                        ?.takeIf { it.isActive }
                        ?.let { session -> RunCrashRecoveryStore(this).save(session.startTime, session) }
                }
            } catch (e: Exception) {
                // The guard itself must never throw and mask the real crash underneath it.
                Log.w("RunApplication", "installGarminSdkCrashGuard: guard itself failed: ${e.message}")
            } finally {
                previousHandler?.uncaughtException(thread, throwable)
            }
        }
    }

    /**
     * Matches only the specific corrupted-payload bug inside Garmin's closed-source
     * SerializedObject/DataBlock/StringBlock parsing (com.garmin.monkeybrains.serialization) or
     * its IQMessageReceiver caller (com.garmin.android.connectiq) — scoped to both the exception
     * type AND the SDK's own package appearing in the stack trace (walking the full cause chain,
     * since the crash may surface wrapped in a RuntimeException from the broadcast dispatcher)
     * so this can never accidentally swallow an unrelated IllegalArgumentException thrown by our
     * own code.
     */
    private fun isKnownGarminSdkDeserializationBug(root: Throwable): Boolean {
        var cause: Throwable? = root
        while (cause != null) {
            if (cause is IllegalArgumentException &&
                cause.stackTrace.any {
                    it.className.startsWith("com.garmin.monkeybrains.serialization") ||
                        it.className.startsWith("com.garmin.android.connectiq")
                }
            ) {
                return true
            }
            cause = cause.cause.takeIf { it !== cause }
        }
        return false
    }

    /**
     * Create all notification channels at app startup.
     *
     * Channels must exist BEFORE any notification is posted. When the FCM SDK
     * auto-displays a notification (app in background), it looks up the channel
     * specified in the message. If the channel doesn't exist it falls back to
     * "fcm_fallback_notification_channel" — losing the channelId entirely.
     * Creating channels here ensures they are always ready.
     */
    private fun createNotificationChannels() {
        val nm = getSystemService(NotificationManager::class.java) ?: return

        nm.createNotificationChannel(
            NotificationChannel(
                "garmin_watch_updates",
                "Garmin Watch Updates",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications when a new version of the AI Run Coach watch app is available"
            }
        )

        nm.createNotificationChannel(
            NotificationChannel(
                "garmin_sync",
                "Garmin Sync",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifications when your run is enriched with Garmin data"
            }
        )

        nm.createNotificationChannel(
            NotificationChannel(
                "general",
                "AI Run Coach",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "General notifications from AI Run Coach"
            }
        )
    }
}
