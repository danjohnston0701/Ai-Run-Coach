package live.airuncoach.airuncoach.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
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
        const val CHANNEL_GARMIN_WATCH_UPDATES = "garmin_watch_updates"

        /** Connect IQ store listing URL for AI Run Coach */
        const val CONNECT_IQ_STORE_URL =
            "https://apps.garmin.com/en-NZ/apps/91452a05-d077-4707-a9a3-0e98277f6017"

        // Explicit positive request codes — negative codes from hashCode() can cause
        // silent PendingIntent failures on some Android OEM builds.
        private const val REQUEST_CODE_GARMIN_WATCH_UPDATE = 7001
        private const val REQUEST_CODE_GENERAL = 7002

        // Intent action + extras used to route notification taps through MainActivity
        const val ACTION_OPEN_CONNECT_IQ_STORE = "live.airuncoach.action.OPEN_CONNECT_IQ_STORE"
        const val EXTRA_STORE_URL = "store_url"
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

        val type     = message.data["type"]
        val runId    = message.data["runId"]?.takeIf { it.isNotBlank() }
        val sessionId = message.data["sessionId"]?.takeIf { it.isNotBlank() }
        val storeUrl = message.data["storeUrl"]?.takeIf { it.isNotBlank() }
        val title    = message.notification?.title ?: message.data["title"] ?: "AI Run Coach"
        val body     = message.notification?.body  ?: message.data["body"]  ?: ""

        showNotification(title, body, type, runId, sessionId, storeUrl, message.data)
    }

    private fun showNotification(
        title: String,
        body: String,
        type: String?,
        runId: String? = null,
        sessionId: String? = null,
        storeUrl: String? = null,
        data: Map<String, String> = emptyMap()
    ) {
        val channelId = when (type) {
            "run_enriched", "new_activity" -> CHANNEL_GARMIN_SYNC
            "garmin_watch_update" -> CHANNEL_GARMIN_WATCH_UPDATES
            else -> CHANNEL_GENERAL
        }
        ensureNotificationChannel(channelId)

        // For Garmin watch update notifications: tap opens the Connect IQ store.
        //
        // WHY we route through MainActivity instead of firing a browser intent directly:
        // Garmin Connect app registers itself as an Android App Link handler for
        // apps.garmin.com. A direct browser PendingIntent fires and gets intercepted
        // by Garmin Connect which then silently drops it — the user sees the notification
        // dismiss but nothing opens.
        //
        // Routing through MainActivity (our own app) always succeeds. MainActivity then
        // opens the URL from an Activity context where it always reaches the browser.
        val pendingIntent = when {
            type == "garmin_watch_update" -> {
                val url = storeUrl ?: CONNECT_IQ_STORE_URL
                // Pass version and releaseNote so the in-app update screen can display them
                val notifVersion = data["version"] ?: ""
                val notifReleaseNote = data["releaseNote"] ?: ""
                val mainIntent = Intent(this, MainActivity::class.java).apply {
                    action = ACTION_OPEN_CONNECT_IQ_STORE
                    putExtra(EXTRA_STORE_URL, url)
                    putExtra("version", notifVersion)
                    putExtra("releaseNote", notifReleaseNote)
                    // No SINGLE_TOP — we want a fresh onCreate so the LaunchedEffect
                    // always picks up the intent and navigates to the update screen.
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                PendingIntent.getActivity(
                    this,
                    REQUEST_CODE_GARMIN_WATCH_UPDATE,
                    mainIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            }
            type == "live_run_invite" -> {
                // Observer invited to watch a live run
                val mainIntent = Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    if (sessionId != null) {
                        putExtra("deeplink_observer_session_id", sessionId)
                    }
                    putExtra("runner_name", data["runnerName"] ?: "")
                }
                PendingIntent.getActivity(
                    this,
                    REQUEST_CODE_GENERAL,
                    mainIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            }
            type == "friend_request" -> {
                // Friend request received — tap navigates to the Friends screen
                val mainIntent = Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra("deeplink_friends", true)
                }
                PendingIntent.getActivity(
                    this,
                    REQUEST_CODE_GENERAL,
                    mainIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            }
            type == "group_run_invite" -> {
                // Group run invitation — tap navigates directly to that group run
                val mainIntent = Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    val groupRunId = data["groupRunId"] ?: ""
                    if (groupRunId.isNotEmpty()) {
                        putExtra("deeplink_group_run_id", groupRunId)
                    }
                }
                PendingIntent.getActivity(
                    this,
                    REQUEST_CODE_GENERAL,
                    mainIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            }
            else -> {
                // Regular notifications (run_enriched, new_activity, etc.)
                val intent = Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    if (runId != null) putExtra("deeplink_run_id", runId)
                }
                PendingIntent.getActivity(
                    this,
                    REQUEST_CODE_GENERAL,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            }
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.notification_icon)
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
            CHANNEL_GARMIN_SYNC          -> "Garmin Sync" to "Notifications when your run is enriched with Garmin data"
            CHANNEL_GARMIN_WATCH_UPDATES -> "Garmin Watch Updates" to "Notifications when a new version of the AI Run Coach watch app is available"
            else                         -> "AI Run Coach" to "General notifications from AI Run Coach"
        }
        nm.createNotificationChannel(
            NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_HIGH).apply { description = desc }
        )
    }
}
