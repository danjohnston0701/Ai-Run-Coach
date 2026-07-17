package live.airuncoach.airuncoach

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class RunApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
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
