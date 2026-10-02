package live.airuncoach.airuncoach.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import live.airuncoach.airuncoach.BuildConfig
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Debug-only "video recording mode" for the Garmin + Android and Galaxy Watch + Android how-to
 * videos (marketing/how-to-videos in the monorepo). Android port of the iOS app's
 * VideoDemoMode.swift.
 *
 * Driven entirely by adb broadcasts, so each step can be fired at an exact moment:
 *
 *   adb shell am broadcast -p live.airuncoach.airuncoach -a live.airuncoach.videodemo.ENABLE
 *       [--es watch samsung]   (default: Garmin)
 *   adb shell am broadcast -p live.airuncoach.airuncoach -a live.airuncoach.videodemo.START
 *   adb shell am broadcast -p live.airuncoach.airuncoach -a live.airuncoach.videodemo.STOP
 *
 * ENABLE makes GarminWatchManager report a linked Forerunner 965 with the companion app
 * installed (there's no Garmin Connect app in the emulator) — or, with `watch=samsung`,
 * SamsungWatchManager a linked Galaxy Watch (no Data Layer peer in the emulator) — so every
 * watch-mode phone screen can be filmed. START is delivered through the real watch-message handler exactly as the
 * watch's START press would be, then streams 1 Hz "watchData" frames along a loop around
 * Hamilton Lake (a public park — no personal location on screen). The speed/HR/cadence
 * formulas are identical to VideoDemoMode.swift and the Garmin app's (:video) build, so the
 * phone and the watch footage show the same numbers at the same elapsed second — change all
 * three together. STOP behaves like the watch pressing STOP. Never active in release builds.
 */
object VideoDemoMode {
    private const val TAG = "VideoDemoMode"
    private const val ACTION_ENABLE = "live.airuncoach.videodemo.ENABLE"
    private const val ACTION_START = "live.airuncoach.videodemo.START"
    private const val ACTION_STOP = "live.airuncoach.videodemo.STOP"
    private const val GARMIN_DEVICE_NAME = "Forerunner 965"
    private const val SAMSUNG_DEVICE_NAME = "Galaxy Watch7"

    private val handler = Handler(Looper.getMainLooper())
    private var manager: GarminWatchManager? = null
    private var samsung: SamsungWatchManager? = null
    private var useSamsung = false
    private var enabled = false
    private var elapsed = 0
    private var distanceM = 0.0

    fun install(context: Context, garmin: GarminWatchManager, samsungWatch: SamsungWatchManager) {
        if (!BuildConfig.DEBUG || manager != null) return  // once per process (activity recreation)
        manager = garmin
        samsung = samsungWatch
        val filter = IntentFilter().apply {
            addAction(ACTION_ENABLE); addAction(ACTION_START); addAction(ACTION_STOP)
        }
        ContextCompat.registerReceiver(context.applicationContext, object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                when (intent?.action) {
                    ACTION_ENABLE -> enable(intent.getStringExtra("watch") == "samsung")
                    ACTION_START -> watchPressedStart()
                    ACTION_STOP -> watchPressedStop()
                }
            }
        }, filter, ContextCompat.RECEIVER_EXPORTED)
    }

    private fun enable(samsungWatch: Boolean) {
        useSamsung = samsungWatch
        Log.d(TAG, "🎬 enabled — faking a linked ${if (useSamsung) SAMSUNG_DEVICE_NAME else GARMIN_DEVICE_NAME}")
        enabled = true
        if (useSamsung) samsung?.videoDemoDeviceName = SAMSUNG_DEVICE_NAME
        else manager?.videoDemoDeviceName = GARMIN_DEVICE_NAME
        // ConnectIQ / Data Layer callbacks can flip these back (no real device), so keep
        // re-asserting.
        handler.post(object : Runnable {
            override fun run() {
                if (useSamsung) samsung?.videoDemoSetLinked(true) else manager?.videoDemoSetLinked(true)
                if (enabled) handler.postDelayed(this, 1000)
            }
        })
    }

    private fun deliver(message: Map<String, Any>) {
        if (useSamsung) samsung?.videoDemoDeliver(message) else manager?.videoDemoDeliver(message)
    }

    private var startMs = 0L

    // Paced by the wall clock, not by counting postDelayed(1000) calls: on a busy emulator those
    // run late, and the run drifted a minute behind the watch footage (5 km at 27:41, not 26:40).
    // Any seconds missed are caught up in one go, as the Garmin (:video) build does.
    private val frameTick = object : Runnable {
        override fun run() {
            val due = ((android.os.SystemClock.elapsedRealtime() - startMs) / 1000).toInt()
            while (elapsed < due && distanceM < 5000) sendFrame()
            if (distanceM < 5000) handler.postDelayed(this, 250) else watchPressedStop()
        }
    }

    private fun watchPressedStart() {
        Log.d(TAG, "🎬 watch START")
        elapsed = 0
        distanceM = 0.0
        handler.removeCallbacks(frameTick)
        deliver(mapOf("type" to "command", "action" to "start"))
        startMs = android.os.SystemClock.elapsedRealtime()
        handler.postDelayed(frameTick, 250)
    }

    private fun watchPressedStop() {
        Log.d(TAG, "🎬 watch STOP")
        handler.removeCallbacks(frameTick)
        deliver(mapOf("type" to "command", "action" to "stop"))
    }

    /** Same formula as VideoDemoMode.swift `speed(at:)` and RunView.mc `_videoSpeed()`. */
    private fun speed(t: Double) = 3.12 + 0.09 * sin(t / 55) + 0.03 * sin(t * 1.7)

    private fun sendFrame() {
        elapsed += 1
        val t = elapsed.toDouble()
        val speed = speed(t)
        distanceM += speed
        val (pos, bearing) = position(distanceM)
        val hr = (128 + 30 * min(1.0, t / 240) + 6 * min(1.0, t / 1800) + 1.5 * sin(t * 0.37)).toInt()
        val zone = if (hr < 135) 2 else if (hr < 155) 3 else 4
        val alt = 40 + 1.8 * sin(distanceM / 400)
        deliver(mapOf(
            "type" to "watchData",
            "elap" to elapsed, "dist" to distanceM,
            "lat" to pos.first, "lng" to pos.second, "alt" to alt, "baroAlt" to alt,
            "speed" to speed, "bear" to bearing, "acc" to 3,
            "hr" to hr, "hrz" to zone,
            "cad" to 170 + (2 * sin(t * 0.9)).roundToInt(),
            "gct" to 246 + 3 * sin(t * 0.5), "gcb" to 50.3 + 0.3 * sin(t * 0.23),
            "vo" to 8.7 + 0.15 * sin(t * 0.41), "vr" to 7.9 + 0.15 * sin(t * 0.29),
            "sl" to speed * 60 / 170,
            "te" to min(3.4, t / 500), "ate" to min(1.1, t / 1500),
            "rt" to (t / 60).toInt() * 12, "vo2" to 49,
            "pwr" to (speed * 88).toInt(), "resp" to 34 + sin(t * 0.13), "pres" to 101_325,
        ))
    }

    // ── Loop geometry ────────────────────────────────────────────────────────

    private fun metres(a: Pair<Double, Double>, b: Pair<Double, Double>): Double {
        val r = 6_371_000.0
        val dLat = Math.toRadians(b.first - a.first)
        val dLon = Math.toRadians(b.second - a.second)
        val h = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(a.first)) * cos(Math.toRadians(b.first)) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * r * atan2(sqrt(h), sqrt(1 - h))
    }

    private val loopLength by lazy { LOOP.indices.sumOf { metres(LOOP[it], LOOP[(it + 1) % LOOP.size]) } }

    /** Point [d] metres along the loop (wrapping), plus that segment's bearing. */
    private fun position(d: Double): Pair<Pair<Double, Double>, Double> {
        var remaining = d % loopLength
        for (i in LOOP.indices) {
            val a = LOOP[i]
            val b = LOOP[(i + 1) % LOOP.size]
            val seg = metres(a, b)
            if (remaining <= seg || i == LOOP.size - 1) {
                val f = if (seg > 0) min(1.0, remaining / seg) else 0.0
                val p = (a.first + (b.first - a.first) * f) to (a.second + (b.second - a.second) * f)
                val dLon = Math.toRadians(b.second - a.second)
                val y = sin(dLon) * cos(Math.toRadians(b.first))
                val x = cos(Math.toRadians(a.first)) * sin(Math.toRadians(b.first)) -
                    sin(Math.toRadians(a.first)) * cos(Math.toRadians(b.first)) * cos(dLon)
                return p to (Math.toDegrees(atan2(y, x)) + 360) % 360
            }
            remaining -= seg
        }
        return LOOP[0] to 0.0
    }

    /** Lakeside loop around Lake Rotoroa, Hamilton — identical to VideoDemoMode.swift. */
    private val LOOP: List<Pair<Double, Double>> = listOf(
        -37.8037304 to 175.2787541, -37.8037154 to 175.2785713, -37.8036947 to 175.2783673,
        -37.8036765 to 175.2781376, -37.8036508 to 175.2778938, -37.8035962 to 175.2776322,
        -37.8035046 to 175.2773381, -37.8033906 to 175.2770567, -37.8032806 to 175.2768589,
        -37.8031943 to 175.2767452, -37.8031225 to 175.2766585, -37.8030379 to 175.2765586,
        -37.8029372 to 175.2764563, -37.802843 to 175.2763731, -37.8027416 to 175.2762833,
        -37.8025675 to 175.2761302, -37.8023153 to 175.275894, -37.8020925 to 175.2756354,
        -37.8019833 to 175.2754252, -37.8019614 to 175.2752497, -37.8019655 to 175.2750767,
        -37.8019657 to 175.2749184, -37.8019472 to 175.2747743, -37.8018977 to 175.274631,
        -37.8018062 to 175.2745023, -37.8016521 to 175.2744063, -37.8014492 to 175.274358,
        -37.8012669 to 175.2743409, -37.8011179 to 175.2742831, -37.8009336 to 175.2741519,
        -37.8007137 to 175.2740079, -37.8005274 to 175.273898, -37.800377 to 175.2737925,
        -37.8002259 to 175.2736676, -37.8000767 to 175.2735294, -37.799936 to 175.2733664,
        -37.7998152 to 175.2732006, -37.7997466 to 175.2730935, -37.7997315 to 175.2730497,
        -37.7997435 to 175.2730186, -37.7997655 to 175.272932, -37.7997754 to 175.2727281,
        -37.7997492 to 175.2724189, -37.7996765 to 175.2720547, -37.7995602 to 175.2716276,
        -37.7994246 to 175.2711573, -37.799293 to 175.2707546, -37.7991547 to 175.2704753,
        -37.798976 to 175.2702743, -37.7987311 to 175.2701087, -37.7984212 to 175.2699587,
        -37.7980757 to 175.269813, -37.797736 to 175.2696905, -37.7974495 to 175.2696226,
        -37.7972467 to 175.2696144, -37.7971081 to 175.2696498, -37.7969858 to 175.2697129,
        -37.7968727 to 175.2697826, -37.7967988 to 175.2698284, -37.796755 to 175.2698436,
        -37.7967063 to 175.269857, -37.7966622 to 175.2698916, -37.7966397 to 175.2699256,
        -37.7966105 to 175.269911, -37.796546 to 175.2698292, -37.7964542 to 175.2697033,
        -37.7963534 to 175.2695719, -37.7962501 to 175.2694694, -37.796153 to 175.2694171,
        -37.7960839 to 175.2694012, -37.7960241 to 175.2693695, -37.7959061 to 175.269309,
        -37.7957073 to 175.2692765, -37.7954565 to 175.2693214, -37.7951819 to 175.2694427,
        -37.7949287 to 175.2695982, -37.7947244 to 175.2697689, -37.7945345 to 175.2699905,
        -37.7943568 to 175.2702328, -37.7942487 to 175.2703845, -37.7942033 to 175.2704156,
        -37.7941339 to 175.2703849, -37.7939869 to 175.270343, -37.7937942 to 175.2703284,
        -37.7936166 to 175.2703744, -37.7934676 to 175.2704873, -37.7933308 to 175.2706487,
        -37.7932031 to 175.2708504, -37.7930831 to 175.2711066, -37.7929764 to 175.2714029,
        -37.7929052 to 175.2716889, -37.7928787 to 175.2719423, -37.7928901 to 175.2721803,
        -37.7929445 to 175.2724186, -37.7930505 to 175.2726587, -37.7931902 to 175.2728925,
        -37.7933349 to 175.2730985, -37.7934574 to 175.2732449, -37.7935187 to 175.2733513,
        -37.7935012 to 175.2735342, -37.7934426 to 175.2738832, -37.7933929 to 175.2743327,
        -37.793374 to 175.2747864, -37.7934201 to 175.275227, -37.7935801 to 175.2756063,
        -37.7938304 to 175.2758378, -37.7941004 to 175.2759152, -37.794371 to 175.2758958,
        -37.7946526 to 175.2758086, -37.7949378 to 175.2756567, -37.7952052 to 175.2754524,
        -37.7954351 to 175.2752102, -37.7956241 to 175.2749609, -37.7957397 to 175.2747873,
        -37.7957329 to 175.2747893, -37.7956639 to 175.274964, -37.7956642 to 175.2751849,
        -37.7957729 to 175.2753441, -37.7959473 to 175.2754178, -37.7961419 to 175.2754119,
        -37.796332 to 175.2753038, -37.796522 to 175.2750568, -37.7966919 to 175.2747526,
        -37.7967989 to 175.2745657, -37.79686 to 175.2745473, -37.7969229 to 175.2746341,
        -37.7969877 to 175.2747799, -37.7970202 to 175.2749595, -37.7970042 to 175.2751475,
        -37.7969575 to 175.2753472, -37.7969166 to 175.2756221, -37.796921 to 175.2759987,
        -37.7969984 to 175.2763927, -37.7971407 to 175.2767255, -37.7973166 to 175.2770151,
        -37.7975038 to 175.2773341, -37.797673 to 175.2776881, -37.7977846 to 175.2779751,
        -37.7978245 to 175.2781373, -37.7978105 to 175.2782398, -37.7977794 to 175.2783562,
        -37.7977666 to 175.2784916, -37.7977861 to 175.2786273, -37.7978431 to 175.2787593,
        -37.7979436 to 175.2788852, -37.7980799 to 175.2789894, -37.7982774 to 175.2790437,
        -37.7986127 to 175.2790203, -37.7990187 to 175.2789221, -37.7992759 to 175.2788,
        -37.7993344 to 175.278733, -37.799344 to 175.2787754, -37.7994043 to 175.2788867,
        -37.7994912 to 175.2789696, -37.7995506 to 175.2790003, -37.7995812 to 175.2790329,
        -37.7996278 to 175.2791025, -37.7997216 to 175.2791796, -37.7998518 to 175.2791966,
        -37.7999934 to 175.2791147, -37.8001381 to 175.2789803, -37.8002843 to 175.27891,
        -37.8004292 to 175.2789831, -37.8005793 to 175.2791403, -37.8007498 to 175.2792486,
        -37.8009536 to 175.2792474, -37.8011666 to 175.2791724, -37.8013376 to 175.2790815,
        -37.8014806 to 175.2790036, -37.8016636 to 175.2789339, -37.8018805 to 175.2788769,
        -37.8020604 to 175.2788708, -37.8021966 to 175.2789314, -37.8023305 to 175.2790229,
        -37.8024639 to 175.2791153, -37.8025786 to 175.2792104, -37.8026806 to 175.2793124,
        -37.8027958 to 175.2794209, -37.8029388 to 175.2795259, -37.8030914 to 175.2796018,
        -37.8032322 to 175.2796413, -37.8033647 to 175.279653, -37.8034973 to 175.2796186,
        -37.8036102 to 175.279527, -37.8036796 to 175.2794116, -37.8037141 to 175.2792979,
        -37.8037251 to 175.2791874, -37.8037194 to 175.2790929, -37.8037191 to 175.2790123,
        -37.8037291 to 175.2789068,
    )
}
