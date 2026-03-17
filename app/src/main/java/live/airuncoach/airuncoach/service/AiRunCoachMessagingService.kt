package live.airuncoach.airuncoach.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.MainActivity
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.network.ApiService
import javax.inject.Inject

/**
 * Firebase Cloud Messaging service for push notifications.
 *
 * ## Setup required before push notifications are active:
 * 1. Create a project in the Firebase Console (https://console.firebase.google.com/)
 * 2. Add an Android app with package ID `live.airuncoach.airuncoach`
 * 3. Download `google-services.json` and place it at `app/google-services.json`
 * 4. In `app/build.gradle.kts` uncomment: `id("com.google.gms.google-services")`
 * 5. In root `build.gradle.kts` uncomment: `id("com.google.gms.google-services") version "4.4.2" apply false`
 * 6. Set `FIREBASE_SERVICE_ACCOUNT_JSON` env var on Replit with the service account JSON from
 *    Firebase Console → Project Settings → Service Accounts → Generate new private key
 *
 * Until these steps are done the app builds and runs without push notifications.
 * All other functionality (polling, in-app notification, Garmin enrichment) works normally.
 */
@AndroidEntryPoint
class AiRunCoachMessagingService : com.google.firebase.messaging.FirebaseMessagingService() {

    @Inject
    lateinit var apiService: ApiService

    companion object {
        private const val TAG = "AiRunCoachFCM"
        const val CHANNEL_GARMIN_SYNC = "garmin_sync"
        const val CHANNEL_GENERAL = "general"
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token — uploading to server")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                apiService.saveFcmToken(mapOf("fcmToken" to token))
                Log.d(TAG, "FCM token saved ✅")
            } catch (e: Exception) {
                Log.w(TAG, "FCM token save failed: ${e.message}")
            }
        }
    }

    override fun onMessageReceived(message: com.google.firebase.messaging.RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "FCM message received: ${message.data}")

        val type  = message.data["type"]
        val runId = message.data["runId"]?.takeIf { it.isNotBlank() }
        val title = message.notification?.title ?: message.data["title"] ?: "AI Run Coach"
        val body  = message.notification?.body  ?: message.data["body"]  ?: ""

        showNotification(title, body, type, runId)
    }

    private fun showNotification(title: String, body: String, type: String?, runId: String?) {
        val channelId = if (type == "run_enriched" || type == "new_activity") CHANNEL_GARMIN_SYNC else CHANNEL_GENERAL
        ensureNotificationChannel(channelId)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (runId != null) putExtra("deeplink_run_id", runId)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            (runId ?: "").hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(R.drawable.android_icon_monochrome)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(System.currentTimeMillis().toInt(), notification)
    }

    private fun ensureNotificationChannel(channelId: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(channelId) != null) return
        val (name, desc) = when (channelId) {
            CHANNEL_GARMIN_SYNC -> "Garmin Sync" to "Notifications when your run is enriched with Garmin data"
            else -> "AI Run Coach" to "General notifications from AI Run Coach"
        }
        nm.createNotificationChannel(
            NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_HIGH).apply { description = desc }
        )
    }
}
