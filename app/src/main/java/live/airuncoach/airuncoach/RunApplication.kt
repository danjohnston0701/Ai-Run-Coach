package live.airuncoach.airuncoach

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.google.firebase.crashlytics.FirebaseCrashlytics
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class RunApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        initCrashlytics()
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
