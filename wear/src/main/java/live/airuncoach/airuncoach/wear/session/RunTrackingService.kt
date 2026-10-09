package live.airuncoach.airuncoach.wear.session

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
import live.airuncoach.airuncoach.wear.R
import live.airuncoach.airuncoach.wear.WearMainActivity

/**
 * Foreground service held for the whole of a watch-owned run. Without it Wear OS treats the app
 * as backgrounded the moment the screen times out or the runner swipes to the watch face, and
 * may throttle or kill it: Health Services keeps counting the workout, but the live stream to
 * the server, the phone sync and the offline track all stop — the Galaxy equivalent of the
 * Garmin "watch froze mid-run" fix. The Ongoing Activity puts the run on the watch face and in
 * the recents list, so one tap gets the runner back to it.
 *
 * Holds no state: the run lives in [RunSessionController], which starts/stops this service.
 */
class RunTrackingService : Service() {

    companion object {
        private const val TAG = "WearRunTrackingService"
        private const val CHANNEL_ID = "run_tracking"
        private const val NOTIFICATION_ID = 1001

        fun start(context: Context) {
            // startForegroundService() commits us to startForeground() within seconds, and that
            // throws without the permission behind its type — which would crash the app. No
            // location permission means no run can start anyway (GPS gate), so just skip it.
            if (!granted(context, Manifest.permission.ACCESS_FINE_LOCATION)) return
            try {
                context.startForegroundService(Intent(context, RunTrackingService::class.java))
            } catch (e: Exception) {
                // Not allowed from the background (e.g. a sync woke the process). The activity
                // calls this again from onResume, which is always allowed.
                Log.w(TAG, "start failed: ${e.message}")
            }
        }

        fun stop(context: Context) {
            try {
                context.stopService(Intent(context, RunTrackingService::class.java))
            } catch (e: Exception) {
                Log.w(TAG, "stop failed: ${e.message}")
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun foregroundTypes(): Int {
        var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        // The health type (API 34+) needs body sensors or activity recognition granted.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
            (granted(this, Manifest.permission.BODY_SENSORS) || granted(this, Manifest.permission.ACTIVITY_RECOGNITION))
        ) {
            types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        }
        return types
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Run in progress", NotificationManager.IMPORTANCE_LOW)
        )
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, WearMainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("AI Run Coach")
            .setContentText("Run in progress")
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setOngoing(true)
            .setContentIntent(open)

        try {
            OngoingActivity.Builder(applicationContext, NOTIFICATION_ID, builder)
                .setStaticIcon(R.drawable.ic_launcher_foreground)
                .setTouchIntent(open)
                .setStatus(Status.Builder().addTemplate("Run in progress").build())
                .build()
                .apply(applicationContext)
        } catch (e: Exception) {
            Log.w(TAG, "Ongoing activity unavailable: ${e.message}")
        }

        try {
            ServiceCompat.startForeground(
                this, NOTIFICATION_ID, builder.build(), foregroundTypes()
            )
        } catch (e: Exception) {
            Log.w(TAG, "startForeground failed: ${e.message}")
            stopSelf()
        }
        // Not sticky: a system restart would come from the background, where a location
        // foreground service may not start. A killed run is picked back up from its checkpoint
        // when the runner reopens the app (RunSessionController.recoverInterruptedRun).
        return START_NOT_STICKY
    }
}

private fun granted(context: Context, permission: String) =
    androidx.core.content.ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
