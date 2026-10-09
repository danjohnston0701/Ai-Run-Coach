package live.airuncoach.airuncoach.wear.session

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import androidx.core.content.ContextCompat
import live.airuncoach.airuncoach.wear.BuildConfig
import live.airuncoach.airuncoach.wear.sensors.ExerciseMetrics
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Debug-only "video recording mode" for the Galaxy Watch + Android how-to video
 * (marketing/how-to-videos/galaxywatch-android). The emulator has no phone peer, no Health
 * Services exercise and no GPS worth filming, so this plays the real screens on cue, driven by
 * adb broadcasts so each step lands at an exact moment alongside the phone's VideoDemoMode.kt:
 *
 *   adb shell am broadcast -p live.airuncoach.airuncoach -a live.airuncoach.wear.videodemo.ENABLE
 *       (pairing screen) → LINK [--ez phone false] (linked, prepare-on-phone; phone=false for
 *       the phone-free shot) → PREPARE (prepared 5 km session, GPS lock over ~8 s, ready screen)
 *       or GPS (GPS lock only) → START [--ei skip <sec>] → STOP (or 5 km reached)
 *
 * The run is the shared deterministic 5 km (speed/HR/cadence formulas identical to the phone's
 * VideoDemoMode.kt, the iOS VideoDemoMode.swift and the Garmin (:video) build — change all
 * together), paced by the wall clock, so watch and phone footage match second for second.
 * Nothing reaches the server or the phone from the watch while it's on. Never active in release.
 */
object WearVideoDemoMode {
    private const val TAG = "WearVideoDemoMode"
    private const val PREFIX = "live.airuncoach.wear.videodemo."

    fun install(context: Context, controller: RunSessionController) {
        if (!BuildConfig.DEBUG) return
        val filter = IntentFilter().apply {
            listOf("ENABLE", "LINK", "PREPARE", "GPS", "START", "STOP").forEach { addAction(PREFIX + it) }
        }
        ContextCompat.registerReceiver(context, object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                val step = intent?.action?.removePrefix(PREFIX) ?: return
                Log.d(TAG, "🎬 $step")
                when (step) {
                    "ENABLE" -> controller.videoDemoEnable()
                    "LINK" -> controller.videoDemoLink(intent.getBooleanExtra("phone", true))
                    "PREPARE" -> controller.videoDemoPrepare()
                    "GPS" -> controller.videoDemoGpsLock()
                    "START" -> controller.videoDemoStart(intent.getIntExtra("skip", 0))
                    "STOP" -> controller.finishRun()
                }
            }
        }, filter, ContextCompat.RECEIVER_EXPORTED)
    }

    /** Same formula as VideoDemoMode.kt / VideoDemoMode.swift `speed(at:)` / RunView.mc `_videoSpeed()`. */
    fun speed(sec: Int): Double {
        val t = sec.toDouble()
        return 3.12 + 0.09 * sin(t / 55) + 0.03 * sin(t * 1.7)
    }

    /** Metrics at whole second [sec] with [distanceM] covered — what the phone shows then. */
    fun metrics(sec: Int, distanceM: Double): ExerciseMetrics {
        val t = sec.toDouble()
        val hr = (128 + 30 * min(1.0, t / 240) + 6 * min(1.0, t / 1800) + 1.5 * sin(t * 0.37)).toInt()
        // Pace on the phone is 1000 / mean of the last five 1 Hz speeds; show the same.
        val n = min(5, sec).coerceAtLeast(1)
        val meanSpeed = (0 until n).sumOf { speed(sec - it) } / n
        return ExerciseMetrics(
            elapsedMs = sec * 1000L,
            distanceM = distanceM,
            speedMs = meanSpeed,
            heartRate = if (sec > 0) hr else 0,
            cadenceSpm = if (sec > 0) 170 + (2 * sin(t * 0.9)).roundToInt() else 0,
            altM = 40.0
        )
    }
}
