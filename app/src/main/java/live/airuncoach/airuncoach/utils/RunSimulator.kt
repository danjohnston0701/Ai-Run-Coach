package live.airuncoach.airuncoach.utils

import android.location.Location
import android.util.Log
import kotlin.math.*

/**
 * Generates a realistic simulated 5km run with varied terrain and pace changes.
 *
 * The simulated route includes:
 * - Flat warm-up (0–500m)
 * - Gradual uphill (500m–1.2km) — triggers hill awareness coaching
 * - Hill top + descent (1.2km–1.8km) — triggers hill acknowledgement coaching
 * - Steady flat (1.8km–3km) — triggers phase coaching, km splits
 * - Struggle zone (3km–3.5km) — pace drops >15% to trigger struggle coaching
 * - Recovery + strong finish (3.5km–5km)
 *
 * Each simulated "tick" represents ~20m of running. At 2-second intervals this
 * simulates roughly a 5:20/km pace, compressed to ~8 minutes real time for a 5km run.
 */
class RunSimulator(
    startLat: Double = 54.5973,  // Belfast default
    startLng: Double = -5.9301,
    private val targetDistanceKm: Double = 5.0,
    val tickIntervalMs: Long = 2000L   // How often to emit a location (2s = real-time feel)
) {
    companion object {
        private const val TAG = "RunSimulator"

        /** Metres per degree latitude (approximately constant) */
        private const val METERS_PER_DEG_LAT = 111_320.0
    }

    data class SimPoint(
        val location: Location,
        val heartRate: Int,
        val cadence: Int,
        val isLastPoint: Boolean = false
    )

    private var currentLat = startLat
    private var currentLng = startLng
    private var totalDistanceM = 0.0
    private var tickIndex = 0

    /**
     * Returns the next simulated location point, or null if the run is complete.
     */
    fun nextPoint(): SimPoint? {
        val targetM = targetDistanceKm * 1000
        if (totalDistanceM >= targetM) return null

        val segment = getSegment()
        val stepM = segment.stepMeters
        val bearing = segment.bearingDeg
        val altitude = segment.altitude
        val speed = segment.speedMs
        val hr = segment.heartRate
        val cadence = segment.cadence

        // Move lat/lng in the bearing direction
        val dLat = stepM * cos(Math.toRadians(bearing)) / METERS_PER_DEG_LAT
        val dLng = stepM * sin(Math.toRadians(bearing)) / (METERS_PER_DEG_LAT * cos(Math.toRadians(currentLat)))
        currentLat += dLat
        currentLng += dLng
        totalDistanceM += stepM
        tickIndex++

        val location = Location("simulator").apply {
            latitude = currentLat
            longitude = currentLng
            this.altitude = altitude
            this.speed = speed
            this.accuracy = 3.5f
            this.bearing = bearing.toFloat()
            time = System.currentTimeMillis()
        }

        val isLast = totalDistanceM >= targetM
        Log.d(TAG, "Tick $tickIndex: ${String.format("%.0f", totalDistanceM)}m, alt=${String.format("%.0f", altitude)}m, " +
                "speed=${String.format("%.1f", speed)}m/s, HR=$hr, segment=${segment.name}")

        return SimPoint(location, hr, cadence, isLast)
    }

    /**
     * Defines the characteristics of each run segment based on distance covered.
     */
    private fun getSegment(): Segment {
        val d = totalDistanceM
        return when {
            // Warm-up: flat, easy pace (0–500m)
            d < 500 -> Segment(
                name = "warm-up",
                stepMeters = 20.0,
                bearingDeg = 45.0,
                altitude = 30.0,
                speedMs = 2.8f,  // ~5:57/km
                heartRate = 135 + (d / 100).toInt(),
                cadence = 160
            )
            // Uphill: gradual climb, pace slows (500m–1200m)
            d < 1200 -> {
                val hillProgress = (d - 500) / 700.0
                Segment(
                    name = "uphill",
                    stepMeters = 18.0,
                    bearingDeg = 50.0,
                    altitude = 30.0 + hillProgress * 45.0,  // Climb 45m
                    speedMs = 2.5f - (hillProgress * 0.3f).toFloat(),  // Slowing
                    heartRate = 155 + (hillProgress * 15).toInt(),
                    cadence = 155
                )
            }
            // Hill top + descent: altitude drops (1200m–1800m)
            d < 1800 -> {
                val descentProgress = (d - 1200) / 600.0
                Segment(
                    name = "descent",
                    stepMeters = 22.0,
                    bearingDeg = 55.0,
                    altitude = 75.0 - descentProgress * 40.0,  // Drop 40m
                    speedMs = 3.2f + (descentProgress * 0.3f).toFloat(),  // Speeding up
                    heartRate = 160 - (descentProgress * 10).toInt(),
                    cadence = 170
                )
            }
            // Steady flat (1800m–3000m) — good rhythm
            d < 3000 -> Segment(
                name = "steady",
                stepMeters = 20.0,
                bearingDeg = 60.0 + sin(d / 200.0) * 5.0,  // Gentle meander
                altitude = 35.0 + sin(d / 500.0) * 3.0,     // Minor undulation
                speedMs = 3.0f,  // ~5:33/km
                heartRate = 155,
                cadence = 168
            )
            // Struggle zone (3000m–3500m) — pace drops significantly
            d < 3500 -> {
                val struggleProgress = (d - 3000) / 500.0
                Segment(
                    name = "STRUGGLE",
                    stepMeters = 15.0,  // Shorter steps
                    bearingDeg = 65.0,
                    altitude = 35.0 + struggleProgress * 10.0,  // Slight incline
                    speedMs = 2.2f - (struggleProgress * 0.3f).toFloat(),  // Dropping hard
                    heartRate = 170 + (struggleProgress * 10).toInt(),
                    cadence = 148
                )
            }
            // Recovery + strong finish (3500m–5000m)
            d < targetDistanceKm * 1000 -> {
                val finishProgress = (d - 3500) / (targetDistanceKm * 1000 - 3500)
                Segment(
                    name = "finish",
                    stepMeters = 22.0,
                    bearingDeg = 70.0 - finishProgress * 25.0,  // Turning back
                    altitude = 45.0 - finishProgress * 15.0,
                    speedMs = 2.8f + (finishProgress * 0.6f).toFloat(),  // Building pace
                    heartRate = 165 + (finishProgress * 10).toInt(),
                    cadence = 170 + (finishProgress * 8).toInt()
                )
            }
            else -> Segment(
                name = "done",
                stepMeters = 0.0,
                bearingDeg = 0.0,
                altitude = 30.0,
                speedMs = 0f,
                heartRate = 130,
                cadence = 0
            )
        }
    }

    private data class Segment(
        val name: String,
        val stepMeters: Double,
        val bearingDeg: Double,
        val altitude: Double,
        val speedMs: Float,
        val heartRate: Int,
        val cadence: Int
    )
}
