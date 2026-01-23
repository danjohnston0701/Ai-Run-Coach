# Elevation & Struggle Detection Specification

**Version:** 1.0  
**Last Updated:** January 24, 2026

## Terrain Data Structure

```kotlin
data class TerrainData(
    val currentAltitude: Double?,         // meters
    val currentGrade: Double?,            // percentage (positive = uphill)
    val upcomingTerrain: UpcomingTerrain?,
    val totalElevationGain: Int?,
    val totalElevationLoss: Int?
)

data class UpcomingTerrain(
    val distanceAhead: Int,               // meters
    val grade: Double,                    // percentage
    val elevationChange: Int,             // meters
    val description: String               // "steep hill ahead", etc.
)
```

## Grade Descriptions

```kotlin
fun getGradeDescription(grade: Double): String = when {
    grade >= 8 -> "steep hill ahead"
    grade >= 5 -> "moderate hill ahead"
    grade >= 2 -> "gentle incline ahead"
    grade <= -8 -> "steep descent ahead"
    grade <= -5 -> "moderate downhill ahead"
    grade <= -2 -> "gentle descent ahead"
    else -> "flat terrain ahead"
}
```

## Terrain Event Detection

```kotlin
enum class TerrainEvent {
    UPHILL,       // Currently on or approaching >=5% grade
    DOWNHILL,     // Currently on or approaching <=-5% grade
    HILL_CREST    // Just reached top of climb
}

fun shouldTriggerTerrainCoaching(
    terrain: TerrainData?,
    lastUphillCoachingTime: Long,
    lastDownhillCoachingTime: Long,
    lastHillCrestTime: Long,
    previousGrade: Double?,
    minIntervalMs: Long = 30_000
): TerrainEvent? {
    if (terrain == null) return null
    
    val now = System.currentTimeMillis()
    
    // Check for hill crest (was on 5%+ uphill, now <2%)
    if (previousGrade != null && previousGrade >= 5 && (terrain.currentGrade ?: 0.0) < 2) {
        if (now - lastHillCrestTime >= minIntervalMs) {
            return TerrainEvent.HILL_CREST
        }
    }
    
    // Check upcoming terrain (warning ahead)
    if (terrain.upcomingTerrain != null && abs(terrain.upcomingTerrain.grade) >= 5) {
        return if (terrain.upcomingTerrain.grade > 0) {
            if (now - lastUphillCoachingTime >= minIntervalMs) TerrainEvent.UPHILL else null
        } else {
            if (now - lastDownhillCoachingTime >= minIntervalMs) TerrainEvent.DOWNHILL else null
        }
    }
    
    // Check current grade
    if (terrain.currentGrade != null && abs(terrain.currentGrade) >= 6) {
        return if (terrain.currentGrade > 0) {
            if (now - lastUphillCoachingTime >= minIntervalMs) TerrainEvent.UPHILL else null
        } else {
            if (now - lastDownhillCoachingTime >= minIntervalMs) TerrainEvent.DOWNHILL else null
        }
    }
    
    return null
}
```

## Predictive Elevation (Routed Runs)

For routes with elevation profiles, scan ahead 200m:

```kotlin
fun calculateTerrainData(
    currentLat: Double,
    currentLng: Double,
    distanceCoveredMeters: Double,
    elevationProfile: List<ElevationPoint>?,
    totalElevationGain: Int?,
    totalElevationLoss: Int?
): TerrainData? {
    if (elevationProfile == null || elevationProfile.size < 2) return null
    
    val nearestIdx = findNearestProfilePoint(currentLat, currentLng, elevationProfile)
    val currentPoint = elevationProfile[nearestIdx]
    
    val terrain = TerrainData(
        currentAltitude = currentPoint.elevation,
        currentGrade = currentPoint.grade,
        totalElevationGain = totalElevationGain,
        totalElevationLoss = totalElevationLoss
    )
    
    // Look ahead 200m
    val lookAheadDistance = 200.0
    
    for (i in nearestIdx + 1 until elevationProfile.size) {
        val point = elevationProfile[i]
        val distanceAhead = point.distance - currentPoint.distance
        
        if (distanceAhead > 0 && distanceAhead <= lookAheadDistance) {
            if (abs(point.grade) >= 3) {
                terrain.upcomingTerrain = UpcomingTerrain(
                    distanceAhead = distanceAhead.roundToInt(),
                    grade = point.grade,
                    elevationChange = (point.elevation - currentPoint.elevation).roundToInt(),
                    description = getGradeDescription(point.grade)
                )
                break
            }
        }
        
        if (distanceAhead > lookAheadDistance) break
    }
    
    return terrain
}
```

## Predictive Elevation (Free Runs)

Use Google Elevation API to sample terrain ahead:

```kotlin
suspend fun sampleElevationAhead(
    currentLat: Double,
    currentLng: Double,
    bearingDegrees: Double,
    sampleDistances: List<Int> = listOf(50, 100, 150, 200)
): List<ElevationSample> {
    val samples = mutableListOf<LatLng>()
    
    for (distance in sampleDistances) {
        samples.add(projectPoint(currentLat, currentLng, bearingDegrees, distance / 1000.0))
    }
    
    val locations = samples.joinToString("|") { "${it.latitude},${it.longitude}" }
    val url = "https://maps.googleapis.com/maps/api/elevation/json?locations=$locations&key=$GOOGLE_MAPS_API_KEY"
    
    val response = httpClient.get(url)
    // Parse and return elevation samples with calculated grades
}

class FreeRunElevationTracker {
    private var lastSampleTime = 0L
    private val sampleIntervalMs = 30_000  // Every 30 seconds
    
    suspend fun checkUpcomingTerrain(
        currentLat: Double,
        currentLng: Double,
        currentBearing: Double
    ): TerrainData?
}
```

---

## Struggle Point Detection

### Weakness Event Structure

```kotlin
data class WeaknessEvent(
    val startDistanceKm: Double,
    val endDistanceKm: Double,
    val durationSeconds: Int,
    val avgPaceBefore: Double,           // seconds per km (baseline)
    val avgPaceDuring: Double,           // seconds per km (during slowdown)
    val dropPercent: Int,                // percentage pace drop
    val causeTag: String? = null,        // User-selected cause
    val causeNote: String? = null,       // User's free text
    val isIrrelevant: Boolean = false    // User marked as not a real struggle
)

val WEAKNESS_CAUSE_TAGS = listOf(
    "fatigue",
    "hill_climb", 
    "hydration_stop",
    "traffic_light",
    "obstacle",
    "cramp",
    "breathing",
    "heat",
    "mental",
    "injury_discomfort",
    "other"
)
```

### Detection Algorithm

```kotlin
const val PACE_DROP_THRESHOLD = 0.20     // 20% slower than baseline
const val MIN_SLOWDOWN_DURATION_SECONDS = 30
const val ROLLING_WINDOW_SIZE = 5

var inSlowdown = false
var slowdownStart: SlowdownStart? = null
val recentPaces = mutableListOf<Double>()

fun detectWeakness(
    currentDistanceKm: Double,
    currentTimeSeconds: Int,
    currentPaceSecondsPerKm: Double,
    baselinePaceSecondsPerKm: Double
): WeaknessEvent? {
    // Update rolling window
    recentPaces.add(currentPaceSecondsPerKm)
    if (recentPaces.size > ROLLING_WINDOW_SIZE) {
        recentPaces.removeAt(0)
    }
    
    // Calculate median pace (more stable than average)
    val medianPace = recentPaces.sorted()[recentPaces.size / 2]
    
    // Check if significant drop
    val dropPercent = (medianPace - baselinePaceSecondsPerKm) / baselinePaceSecondsPerKm
    val isSignificantDrop = dropPercent >= PACE_DROP_THRESHOLD
    
    if (isSignificantDrop && !inSlowdown) {
        // Start of slowdown
        inSlowdown = true
        slowdownStart = SlowdownStart(
            distanceKm = currentDistanceKm,
            timeSeconds = currentTimeSeconds,
            baselinePace = baselinePaceSecondsPerKm
        )
        
        triggerWeaknessCoaching()
        
    } else if (!isSignificantDrop && inSlowdown && slowdownStart != null) {
        // End of slowdown
        val durationSeconds = currentTimeSeconds - slowdownStart!!.timeSeconds
        
        // Only record if lasted at least 30 seconds
        if (durationSeconds >= MIN_SLOWDOWN_DURATION_SECONDS) {
            val event = WeaknessEvent(
                startDistanceKm = slowdownStart!!.distanceKm,
                endDistanceKm = currentDistanceKm,
                durationSeconds = durationSeconds,
                avgPaceBefore = slowdownStart!!.baselinePace,
                avgPaceDuring = medianPace,
                dropPercent = (dropPercent * 100).roundToInt()
            )
            
            inSlowdown = false
            slowdownStart = null
            
            return event
        }
        
        inSlowdown = false
        slowdownStart = null
    }
    
    return null
}
```

### Saving Weakness Events

```kotlin
// API: POST /api/runs/{runId}/weakness-events/bulk
data class WeaknessEventsBulkRequest(
    val events: List<WeaknessEvent>
)
```

### Historical Weakness Patterns

```kotlin
// API: GET /api/users/{userId}/weakness-patterns
data class WeaknessPattern(
    val causeTag: String?,
    val causeNote: String?,
    val distanceKm: Double,      // Average distance where struggles occur
    val dropPercent: Int,        // Average pace drop
    val count: Int               // Number of occurrences
)
```

### Integration in Coaching

```kotlin
val struggleAnalysisPrompt = """
USER-REVIEWED STRUGGLE POINTS:
${reviewedStruggles.mapIndexed { i, s ->
    "${i + 1}. At ${s.distanceKm} km: ${s.paceDropPercent}% pace drop (${s.durationSeconds}s)" +
    if (s.userComment != null) " - Comment: \"${s.userComment}\"" else "" +
    if (s.causeTag != null) " - Cause: ${s.causeTag.replace("_", " ")}" else ""
}.joinToString("\n")}

STRUGGLE ANALYSIS GUIDELINES:
- Consider user comments when analyzing pace drops
- Factor explained struggles appropriately (traffic vs hitting the wall)
- Distinguish environmental interruptions vs genuine challenges
- Provide context-aware coaching based on what happened
"""
```

## Hill Coaching Guidelines

### For Upcoming Hills
- Warn 100-200m ahead
- Advise on pace conservation

### On Steep Uphills (>5%)
- Suggest shorter strides
- Lean forward slightly
- Maintain cadence over speed

### On Downhills
- Control pace
- Quick light steps
- Don't overstride

### After Hills
- Acknowledge effort
- Guide recovery pace

## Implementation Files to Create
- `TerrainAnalyzer.kt`
- `ElevationTracker.kt`
- `StruggleDetector.kt`
- `WeaknessEventManager.kt`
- `GoogleElevationService.kt`
