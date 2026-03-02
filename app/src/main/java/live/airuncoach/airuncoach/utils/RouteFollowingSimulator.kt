package live.airuncoach.airuncoach.utils

import android.location.Location
import android.util.Log
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.SphericalUtil
import live.airuncoach.airuncoach.domain.model.TurnInstruction
import kotlin.math.*

/**
 * Simulates a run following a decoded polyline route with turn instructions.
 *
 * Unlike [RunSimulator] which generates a straight-line path, this simulator:
 * - Walks along actual polyline points from a generated route
 * - Triggers all navigation turn instruction events
 * - Deliberately drifts off-route at one waypoint to test missed-waypoint skip logic
 * - Produces realistic pace, HR, and cadence data
 *
 * Usage: Call [nextPoint] repeatedly at [tickIntervalMs] intervals.
 */
class RouteFollowingSimulator(
    private val polylinePoints: List<LatLng>,
    private val turnInstructions: List<TurnInstruction>,
    val tickIntervalMs: Long = 2000L,
    private val missWaypointIndex: Int = -1  // Index of instruction to deliberately miss (-1 = don't miss any)
) {
    companion object {
        private const val TAG = "RouteFollowingSim"
        
        /**
         * Create a simulator with a sample Belfast route for testing.
         * The route is a ~3km loop near Belfast city centre with 8 turn instructions.
         * Waypoint index 3 (instruction "Turn right onto May Street") will be deliberately missed
         * to test the skip logic.
         */
        fun createBelfastTestRoute(): RouteFollowingSimulator {
            // Sample route: Belfast City Centre loop (~3km)
            // Start: Belfast City Hall → east along Chichester St → south on Victoria St →
            // along May St → Dublin Rd → University Rd → back north via Bradbury Pl → Shaftesbury Sq → return
            val waypoints = listOf(
                // Start: Belfast City Hall
                LatLng(54.5964, -5.9301),
                // East on Chichester St
                LatLng(54.5964, -5.9280),
                LatLng(54.5963, -5.9260),
                LatLng(54.5962, -5.9240),
                // South on Victoria St
                LatLng(54.5955, -5.9238),
                LatLng(54.5948, -5.9236),
                LatLng(54.5940, -5.9234),
                // East on May St
                LatLng(54.5938, -5.9220),
                LatLng(54.5936, -5.9200),
                LatLng(54.5934, -5.9185),
                // South on Dublin Rd
                LatLng(54.5925, -5.9183),
                LatLng(54.5915, -5.9180),
                LatLng(54.5905, -5.9178),
                LatLng(54.5895, -5.9175),
                // West on University Rd
                LatLng(54.5893, -5.9195),
                LatLng(54.5891, -5.9215),
                LatLng(54.5889, -5.9235),
                // North on Bradbury Pl
                LatLng(54.5895, -5.9250),
                LatLng(54.5905, -5.9260),
                LatLng(54.5915, -5.9268),
                // Shaftesbury Sq → back to City Hall
                LatLng(54.5925, -5.9275),
                LatLng(54.5935, -5.9280),
                LatLng(54.5945, -5.9288),
                LatLng(54.5955, -5.9295),
                // Finish near start
                LatLng(54.5962, -5.9300),
                LatLng(54.5964, -5.9301)
            )

            val instructions = listOf(
                TurnInstruction(
                    instruction = "Head east on Chichester Street",
                    latitude = 54.5964,
                    longitude = -5.9280,
                    distance = 0.15
                ),
                TurnInstruction(
                    instruction = "Turn right onto Victoria Street",
                    latitude = 54.5955,
                    longitude = -5.9238,
                    distance = 0.35
                ),
                TurnInstruction(
                    instruction = "Continue straight onto East Bridge Street",
                    latitude = 54.5940,
                    longitude = -5.9234,
                    distance = 0.55
                ),
                TurnInstruction(
                    instruction = "Turn right onto May Street",  // This one will be missed!
                    latitude = 54.5938,
                    longitude = -5.9220,
                    distance = 0.70
                ),
                TurnInstruction(
                    instruction = "Turn left onto Dublin Road",
                    latitude = 54.5934,
                    longitude = -5.9185,
                    distance = 0.90
                ),
                TurnInstruction(
                    instruction = "Turn right onto University Road",
                    latitude = 54.5895,
                    longitude = -5.9175,
                    distance = 1.35
                ),
                TurnInstruction(
                    instruction = "Turn right onto Bradbury Place",
                    latitude = 54.5889,
                    longitude = -5.9235,
                    distance = 1.75
                ),
                TurnInstruction(
                    instruction = "Continue north towards Shaftesbury Square",
                    latitude = 54.5915,
                    longitude = -5.9268,
                    distance = 2.10
                ),
                TurnInstruction(
                    instruction = "Continue straight back to City Hall",
                    latitude = 54.5945,
                    longitude = -5.9288,
                    distance = 2.55
                ),
                TurnInstruction(
                    instruction = "Arrive at finish near Belfast City Hall",
                    latitude = 54.5964,
                    longitude = -5.9301,
                    distance = 2.95
                )
            )

            // Deliberately miss waypoint index 3 ("Turn right onto May Street")
            return RouteFollowingSimulator(
                polylinePoints = waypoints,
                turnInstructions = instructions,
                tickIntervalMs = 2000L,
                missWaypointIndex = 3
            )
        }
    }

    data class SimPoint(
        val location: Location,
        val heartRate: Int,
        val cadence: Int,
        val isLastPoint: Boolean = false
    )

    // Current position along the polyline (interpolated between points)
    private var currentPointIndex = 0
    private var progressBetweenPoints = 0.0  // 0.0 to 1.0 between current and next point
    private var tickIndex = 0
    private var totalDistanceM = 0.0
    private var isDrifting = false  // True when we're off-route to miss a waypoint
    private var driftTicksRemaining = 0
    private var driftLat = 0.0
    private var driftLng = 0.0
    private var hasMissedWaypoint = false

    /**
     * Returns the next simulated location point, or null if the run is complete.
     */
    fun nextPoint(): SimPoint? {
        if (currentPointIndex >= polylinePoints.size - 1 && progressBetweenPoints >= 1.0) {
            return null  // Route complete
        }

        // Handle drifting (deliberately going off-route)
        if (isDrifting) {
            return handleDrift()
        }

        // Check if we should start drifting to miss a waypoint
        if (!hasMissedWaypoint && missWaypointIndex >= 0 && missWaypointIndex < turnInstructions.size) {
            val missTarget = turnInstructions[missWaypointIndex]
            val missPos = LatLng(missTarget.latitude, missTarget.longitude)
            val currentPos = getCurrentLatLng()
            val distToMiss = SphericalUtil.computeDistanceBetween(currentPos, missPos)
            
            // When we're 100-150m from the waypoint we want to miss, start drifting sideways
            if (distToMiss in 50.0..150.0 && !isDrifting) {
                Log.d(TAG, "Starting drift to miss waypoint $missWaypointIndex at ${distToMiss.toInt()}m away")
                isDrifting = true
                driftTicksRemaining = 5  // Drift for 5 ticks (~10 seconds)
                hasMissedWaypoint = true
                
                // Calculate a perpendicular drift direction (go ~50m sideways from route)
                val currentLatLng = getCurrentLatLng()
                val heading = if (currentPointIndex < polylinePoints.size - 1) {
                    SphericalUtil.computeHeading(currentLatLng, polylinePoints[currentPointIndex + 1])
                } else 90.0
                // Offset 90 degrees to the left
                val driftTarget = SphericalUtil.computeOffset(currentLatLng, 80.0, heading + 90.0)
                driftLat = (driftTarget.latitude - currentLatLng.latitude) / driftTicksRemaining
                driftLng = (driftTarget.longitude - currentLatLng.longitude) / driftTicksRemaining
                
                return handleDrift()
            }
        }

        // Normal route following
        val stepMeters = getStepDistance()
        val currentLatLng = getCurrentLatLng()
        
        // Move along the polyline
        advanceAlongRoute(stepMeters)
        
        val newLatLng = getCurrentLatLng()
        val segmentDist = SphericalUtil.computeDistanceBetween(currentLatLng, newLatLng)
        totalDistanceM += segmentDist
        tickIndex++

        val heading = SphericalUtil.computeHeading(currentLatLng, newLatLng)
        val segment = getRunSegment()
        
        val location = Location("route_simulator").apply {
            latitude = newLatLng.latitude
            longitude = newLatLng.longitude
            altitude = segment.altitude
            speed = segment.speedMs
            accuracy = 4.0f
            bearing = heading.toFloat()
            time = System.currentTimeMillis()
        }

        val isLast = currentPointIndex >= polylinePoints.size - 1

        Log.d(TAG, "Tick $tickIndex: ${totalDistanceM.toInt()}m, " +
                "point=$currentPointIndex/${polylinePoints.size}, " +
                "speed=${segment.speedMs}m/s, HR=${segment.heartRate}")

        return SimPoint(location, segment.heartRate, segment.cadence, isLast)
    }

    private fun handleDrift(): SimPoint? {
        driftTicksRemaining--
        val currentLatLng = getCurrentLatLng()
        
        // Move in drift direction
        val newLat = currentLatLng.latitude + driftLat
        val newLng = currentLatLng.longitude + driftLng
        totalDistanceM += 15.0  // Approximate step distance while drifting
        tickIndex++

        if (driftTicksRemaining <= 0) {
            isDrifting = false
            // After drifting, skip ahead a couple of polyline points to get past the missed waypoint
            currentPointIndex = min(currentPointIndex + 3, polylinePoints.size - 2)
            progressBetweenPoints = 0.0
            Log.d(TAG, "Drift complete — resuming route at point $currentPointIndex")
        }

        val segment = getRunSegment()
        val location = Location("route_simulator").apply {
            latitude = newLat
            longitude = newLng
            altitude = segment.altitude
            speed = segment.speedMs
            accuracy = 8.0f  // Worse accuracy while drifting
            bearing = 0f
            time = System.currentTimeMillis()
        }

        return SimPoint(location, segment.heartRate, segment.cadence, false)
    }

    private fun getCurrentLatLng(): LatLng {
        if (currentPointIndex >= polylinePoints.size - 1) {
            return polylinePoints.last()
        }
        val start = polylinePoints[currentPointIndex]
        val end = polylinePoints[currentPointIndex + 1]
        return SphericalUtil.interpolate(start, end, progressBetweenPoints)
    }

    private fun advanceAlongRoute(stepMeters: Double) {
        var remaining = stepMeters
        while (remaining > 0 && currentPointIndex < polylinePoints.size - 1) {
            val start = polylinePoints[currentPointIndex]
            val end = polylinePoints[currentPointIndex + 1]
            val segmentLength = SphericalUtil.computeDistanceBetween(start, end)
            val remainingInSegment = segmentLength * (1.0 - progressBetweenPoints)
            
            if (remaining >= remainingInSegment) {
                remaining -= remainingInSegment
                currentPointIndex++
                progressBetweenPoints = 0.0
            } else {
                progressBetweenPoints += remaining / segmentLength
                remaining = 0.0
            }
        }
    }

    private fun getStepDistance(): Double {
        // Vary step distance to simulate natural running (~18-22m per 2s tick)
        val base = 20.0
        val variation = sin(tickIndex * 0.3) * 3.0
        return base + variation
    }

    /**
     * Running segment characteristics based on distance covered.
     * Simulates warm-up, steady, and finish phases.
     */
    private fun getRunSegment(): RunSegment {
        val totalRouteLength = estimateRouteLength()
        val progress = totalDistanceM / totalRouteLength

        return when {
            // Warm-up (first 15%)
            progress < 0.15 -> RunSegment(
                altitude = 15.0 + progress * 20,
                speedMs = 2.6f + (progress * 2f).toFloat(),
                heartRate = 130 + (progress * 100).toInt(),
                cadence = 158
            )
            // Steady state (15-75%)
            progress < 0.75 -> RunSegment(
                altitude = 18.0 + sin(progress * 10) * 5.0,
                speedMs = 3.0f + (sin(progress * 5) * 0.3f).toFloat(),
                heartRate = 155 + (sin(progress * 8) * 10).toInt(),
                cadence = 166 + (sin(progress * 6) * 4).toInt()
            )
            // Strong finish (75-100%)
            progress < 1.0 -> {
                val finishBoost = (progress - 0.75) / 0.25
                RunSegment(
                    altitude = 18.0 - finishBoost * 5.0,
                    speedMs = 3.0f + (finishBoost * 0.8f).toFloat(),
                    heartRate = 165 + (finishBoost * 15).toInt(),
                    cadence = 170 + (finishBoost * 8).toInt()
                )
            }
            else -> RunSegment(
                altitude = 15.0,
                speedMs = 0f,
                heartRate = 130,
                cadence = 0
            )
        }
    }

    private fun estimateRouteLength(): Double {
        var total = 0.0
        for (i in 0 until polylinePoints.size - 1) {
            total += SphericalUtil.computeDistanceBetween(polylinePoints[i], polylinePoints[i + 1])
        }
        return max(total, 1.0)  // Avoid division by zero
    }

    private data class RunSegment(
        val altitude: Double,
        val speedMs: Float,
        val heartRate: Int,
        val cadence: Int
    )
}
