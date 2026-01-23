# AI Run Coach - Native App Complete Implementation Guide
## For Android Studio & Xcode Development

**Version:** 1.0  
**Purpose:** Complete specification for replicating all AI coaching, route generation, and run analysis features in native iOS and Android applications.

---

# TABLE OF CONTENTS

1. [Route Generation System](#1-route-generation-system)
2. [AI Coaching During Runs](#2-ai-coaching-during-runs)
3. [Coaching Statements & Phases](#3-coaching-statements--phases)
4. [Pre-Run Summary](#4-pre-run-summary)
5. [Post-Run AI Analysis](#5-post-run-ai-analysis)
6. [Elevation & Hill Coaching](#6-elevation--hill-coaching)
7. [Struggle Point Detection](#7-struggle-point-detection)
8. [Voice Input to AI Coach](#8-voice-input-to-ai-coach)
9. [Free Run (Run Without Route)](#9-free-run-run-without-route)
10. [Watch Device Integration](#10-watch-device-integration)
11. [Admin AI Configuration](#11-admin-ai-configuration)
12. [API Endpoints Reference](#12-api-endpoints-reference)

---

# 1. ROUTE GENERATION SYSTEM

## 1.1 Overview

Generate **minimum 5 diverse routes** (target 100 templates) that are genuine circuit loops returning to the start point. Routes avoid dead-ends and ensure geographic variety.

## 1.2 Base Radius Calculation

```kotlin
// Base radius determines geographic spread of waypoints
// Formula: targetDistance / 2.0 = radius
// Example: 10km run → 5km radius for waypoint placement
val baseRadius = targetDistanceKm / 2.0
```

## 1.3 Core Route Generation Rules

### Distance Tolerance
- **Primary threshold:** 20% of target distance
- **Fallback threshold:** 35% if fewer routes generated

### Backtrack Detection (Dead-End Avoidance)
Routes must not double back on themselves excessively.

```kotlin
// Backtrack ratio thresholds (progressive relaxation)
val strictThresholds = listOf(0.10, 0.15, 0.20, 0.25)  // 10%, 15%, 20%, 25%
val relaxedThresholds = listOf(0.30, 0.35, 0.40)       // Fallback if needed

// Calculate backtrack ratio
fun calculateBacktrackRatio(polylinePoints: List<LatLng>): Double {
    if (polylinePoints.size < 10) return 0.0
    
    // Calculate cumulative distances
    val distances = mutableListOf(0.0)
    for (i in 1 until polylinePoints.size) {
        distances.add(distances[i-1] + haversineDistance(polylinePoints[i-1], polylinePoints[i]))
    }
    val totalDistance = distances.last()
    val excludeDistance = 0.3 // 300m - exclude first/last to allow shared streets
    
    // Find indices to skip first and last 300m
    var startIdx = 0
    var endIdx = polylinePoints.size - 1
    for (i in distances.indices) {
        if (distances[i] >= excludeDistance) { startIdx = i; break }
    }
    for (i in distances.indices.reversed()) {
        if (totalDistance - distances[i] >= excludeDistance) { endIdx = i; break }
    }
    
    val gridSize = 0.0003  // ~30m grid for detection
    val directedSegments = mutableListOf<String>()
    
    for (i in startIdx until endIdx) {
        val g1 = "${(polylinePoints[i].latitude / gridSize).roundToInt()},${(polylinePoints[i].longitude / gridSize).roundToInt()}"
        val g2 = "${(polylinePoints[i+1].latitude / gridSize).roundToInt()},${(polylinePoints[i+1].longitude / gridSize).roundToInt()}"
        if (g1 != g2) directedSegments.add("$g1->$g2")
    }
    
    if (directedSegments.isEmpty()) return 0.0
    
    val segmentSet = directedSegments.toSet()
    var backtrackCount = 0
    
    for (seg in directedSegments) {
        val parts = seg.split("->")
        val reverse = "${parts[1]}->${parts[0]}"
        if (segmentSet.contains(reverse)) backtrackCount++
    }
    
    return backtrackCount.toDouble() / directedSegments.size
}
```

### Angular Spread (Circuit Validation)
A genuine circuit should cover at least 150-180 degrees around the start point.

```kotlin
fun calculateAngularSpread(polylinePoints: List<LatLng>, startLat: Double, startLng: Double): Int {
    if (polylinePoints.size < 5) return 0
    
    val bearings = mutableListOf<Double>()
    for (point in polylinePoints) {
        val dLat = point.latitude - startLat
        val dLng = point.longitude - startLng
        if (abs(dLat) < 0.0001 && abs(dLng) < 0.0001) continue
        
        val bearing = atan2(dLng, dLat) * 180 / PI
        val normalizedBearing = ((bearing % 360) + 360) % 360
        bearings.add(normalizedBearing)
    }
    
    if (bearings.size < 3) return 0
    
    // Count unique 30-degree sectors covered
    val sectors = bearings.map { (it / 30).toInt() }.toSet()
    return sectors.size * 30  // Returns 0-360 degrees
}

// Thresholds:
// Strict: minimum 150 degrees angular spread
// Relaxed: minimum 120 degrees (fallback)
```

### Route Similarity Detection
Prevent generating duplicate routes.

```kotlin
fun calculateRouteOverlap(polyline1: List<LatLng>, polyline2: List<LatLng>): Double {
    val gridSize = 0.0005  // ~50m grid
    
    fun getSegments(points: List<LatLng>): Set<String> {
        val segments = mutableSetOf<String>()
        for (i in 0 until points.size - 1) {
            val g1 = "${(points[i].latitude / gridSize).roundToInt()},${(points[i].longitude / gridSize).roundToInt()}"
            val g2 = "${(points[i+1].latitude / gridSize).roundToInt()},${(points[i+1].longitude / gridSize).roundToInt()}"
            if (g1 != g2) {
                segments.add(listOf(g1, g2).sorted().joinToString("->"))
            }
        }
        return segments
    }
    
    val seg1 = getSegments(polyline1)
    val seg2 = getSegments(polyline2)
    
    if (seg1.isEmpty() || seg2.isEmpty()) return 0.0
    
    val overlap = seg1.count { seg2.contains(it) }
    return overlap.toDouble() / minOf(seg1.size, seg2.size)
}

// THRESHOLD: Reject routes with >40% overlap as "too similar"
```

### Map Footprint Calculation
The diagonal span of the route's bounding box.

```kotlin
fun getRouteFootprint(polylinePoints: List<LatLng>): Double {
    if (polylinePoints.size < 2) return 0.0
    
    var minLat = Double.MAX_VALUE
    var maxLat = Double.MIN_VALUE
    var minLng = Double.MAX_VALUE
    var maxLng = Double.MIN_VALUE
    
    for (p in polylinePoints) {
        minLat = minOf(minLat, p.latitude)
        maxLat = maxOf(maxLat, p.latitude)
        minLng = minOf(minLng, p.longitude)
        maxLng = maxOf(maxLng, p.longitude)
    }
    
    return haversineDistance(LatLng(minLat, minLng), LatLng(maxLat, maxLng))
}
```

## 1.4 Route Template Patterns (Generate 100 Templates)

Use geometric patterns to project waypoints around the start point.

```kotlin
fun projectPoint(lat: Double, lng: Double, bearingDegrees: Double, distanceKm: Double): LatLng {
    val R = 6371.0  // Earth radius km
    val lat1 = Math.toRadians(lat)
    val lng1 = Math.toRadians(lng)
    val bearing = Math.toRadians(bearingDegrees)
    val d = distanceKm / R

    val lat2 = asin(sin(lat1) * cos(d) + cos(lat1) * sin(d) * cos(bearing))
    val lng2 = lng1 + atan2(sin(bearing) * sin(d) * cos(lat1), cos(d) - sin(lat1) * sin(lat2))

    return LatLng(Math.toDegrees(lat2), Math.toDegrees(lng2))
}

// Generate 100 unique templates by varying:
// - Bearings: 0°, 15°, 30°, 45°, 60°, 72°, 90°, 120°, 135°, 144°, 150°, 180°, 210°, 216°, 225°, 240°, 270°, 288°, 300°, 315°, 330°, 350°
// - Radius multipliers: 0.5x, 0.6x, 0.7x, 0.8x, 0.9x, 1.0x, 1.2x, 1.3x, 1.4x, 1.5x, 1.6x, 1.8x, 2.0x
// - Waypoint counts: 2, 3, 4, 5, 6, 8 waypoints
// - Shapes: Loops, Squares, Triangles, Pentagons, Hexagons, Octagons, Figure-8s, Cloverleafs, Diamonds

// Example templates:
val templates = listOf(
    // Basic cardinal loops (4 templates)
    Template("North Loop", listOf(330 to 1.2, 30 to 1.4, 90 to 0.8)),
    Template("South Loop", listOf(150 to 1.2, 210 to 1.4, 270 to 0.8)),
    Template("East Loop", listOf(45 to 1.3, 90 to 1.5, 135 to 1.3)),
    Template("West Loop", listOf(225 to 1.3, 270 to 1.5, 315 to 1.3)),
    
    // Squares (4 templates)
    Template("Clockwise Square", listOf(0 to 1.4, 90 to 1.4, 180 to 1.4, 270 to 1.4)),
    Template("Counter-clockwise Square", listOf(270 to 1.4, 180 to 1.4, 90 to 1.4, 0 to 1.4)),
    Template("Rotated Square 45", listOf(45 to 1.4, 135 to 1.4, 225 to 1.4, 315 to 1.4)),
    Template("Small Square", listOf(0 to 0.8, 90 to 0.8, 180 to 0.8, 270 to 0.8)),
    
    // Polygons (6 templates)
    Template("Pentagon", listOf(0 to 1.3, 72 to 1.3, 144 to 1.3, 216 to 1.3, 288 to 1.3)),
    Template("Hexagon", listOf(0 to 1.2, 60 to 1.2, 120 to 1.2, 180 to 1.2, 240 to 1.2, 300 to 1.2)),
    Template("Octagon", listOf(0 to 1.0, 45 to 1.0, 90 to 1.0, 135 to 1.0, 180 to 1.0, 225 to 1.0, 270 to 1.0, 315 to 1.0)),
    Template("Large Octagon", listOf(0 to 1.4, 45 to 1.4, 90 to 1.4, 135 to 1.4, 180 to 1.4, 225 to 1.4, 270 to 1.4, 315 to 1.4)),
    Template("Triangle North", listOf(0 to 1.6, 120 to 1.0, 240 to 1.0)),
    Template("Triangle South", listOf(180 to 1.6, 300 to 1.0, 60 to 1.0)),
    
    // Figure-8 patterns (4 templates)
    Template("Figure-8 NS", listOf(0 to 1.0, 45 to 0.7, 180 to 1.0, 225 to 0.7)),
    Template("Figure-8 EW", listOf(90 to 1.0, 135 to 0.7, 270 to 1.0, 315 to 0.7)),
    Template("Figure-8 NE-SW", listOf(45 to 1.0, 90 to 0.7, 225 to 1.0, 270 to 0.7)),
    Template("Figure-8 NW-SE", listOf(315 to 1.0, 0 to 0.7, 135 to 1.0, 180 to 0.7)),
    
    // Extended reach patterns (4 templates)
    Template("North Reach", listOf(350 to 2.0, 10 to 2.0, 90 to 0.5)),
    Template("South Reach", listOf(170 to 2.0, 190 to 2.0, 270 to 0.5)),
    Template("East Reach", listOf(80 to 2.0, 100 to 2.0, 180 to 0.5)),
    Template("West Reach", listOf(260 to 2.0, 280 to 2.0, 0 to 0.5)),
    
    // Asymmetric patterns (4 templates)
    Template("East Heavy", listOf(30 to 0.8, 90 to 1.8, 150 to 0.8)),
    Template("West Heavy", listOf(210 to 0.8, 270 to 1.8, 330 to 0.8)),
    Template("North Heavy", listOf(300 to 0.8, 0 to 1.8, 60 to 0.8)),
    Template("South Heavy", listOf(120 to 0.8, 180 to 1.8, 240 to 0.8)),
    
    // Cloverleaf patterns (4 templates)
    Template("Cloverleaf", listOf(0 to 1.5, 45 to 0.6, 90 to 1.5, 135 to 0.6, 180 to 1.5, 225 to 0.6, 270 to 1.5, 315 to 0.6)),
    Template("Cloverleaf Rotated", listOf(22 to 1.5, 67 to 0.6, 112 to 1.5, 157 to 0.6, 202 to 1.5, 247 to 0.6, 292 to 1.5, 337 to 0.6)),
    Template("Small Cloverleaf", listOf(0 to 1.0, 45 to 0.4, 90 to 1.0, 135 to 0.4, 180 to 1.0, 225 to 0.4, 270 to 1.0, 315 to 0.4)),
    Template("Large Cloverleaf", listOf(0 to 2.0, 45 to 0.8, 90 to 2.0, 135 to 0.8, 180 to 2.0, 225 to 0.8, 270 to 2.0, 315 to 0.8)),
    
    // Diamond patterns (4 templates)
    Template("Diamond", listOf(0 to 1.4, 90 to 1.4, 180 to 1.4, 270 to 1.4)),
    Template("Diamond Extended", listOf(0 to 1.8, 45 to 0.9, 90 to 1.8, 135 to 0.9, 180 to 1.8, 225 to 0.9, 270 to 1.8, 315 to 0.9)),
    Template("Narrow Diamond", listOf(0 to 2.0, 90 to 0.8, 180 to 2.0, 270 to 0.8)),
    Template("Wide Diamond", listOf(0 to 0.8, 90 to 2.0, 180 to 0.8, 270 to 2.0)),
    
    // Circuit patterns (6 templates)
    Template("NS Circuit 6pt", listOf(350 to 1.3, 30 to 1.0, 90 to 0.8, 170 to 1.3, 210 to 1.0, 270 to 0.8)),
    Template("EW Circuit 6pt", listOf(80 to 1.3, 120 to 1.0, 180 to 0.8, 260 to 1.3, 300 to 1.0, 0 to 0.8)),
    Template("Spiral Out CW", listOf(0 to 0.6, 90 to 0.9, 180 to 1.2, 270 to 1.5)),
    Template("Spiral Out CCW", listOf(0 to 0.6, 270 to 0.9, 180 to 1.2, 90 to 1.5)),
    Template("Double Loop N", listOf(330 to 1.0, 30 to 1.0, 60 to 0.5, 300 to 0.5)),
    Template("Double Loop S", listOf(150 to 1.0, 210 to 1.0, 240 to 0.5, 120 to 0.5)),
    
    // ... Continue generating to reach 100 templates
    // Use systematic variation of:
    // - Offset bearings by 5°, 10°, 15° increments
    // - Scale radius by 0.7x, 0.8x, 1.1x, 1.2x
    // - Combine patterns (e.g., Triangle + Square hybrid)
)
```

## 1.5 Route Calibration (Distance Scaling)

Iteratively scale waypoints to hit target distance:

```kotlin
suspend fun calibrateRoute(
    startLat: Double,
    startLng: Double,
    baseWaypoints: List<LatLng>,
    targetDistanceKm: Double,
    optimize: Boolean
): CalibratedRoute? {
    var scale = 1.0
    var minScale = 0.2
    var maxScale = 12.0
    
    var bestResult: CalibratedRoute? = null
    var bestError = Double.MAX_VALUE
    
    repeat(5) { iteration ->
        // Scale waypoints from center
        val scaledWaypoints = baseWaypoints.map { wp ->
            LatLng(
                startLat + (wp.latitude - startLat) * scale,
                startLng + (wp.longitude - startLng) * scale
            )
        }
        
        val result = fetchDirections(LatLng(startLat, startLng), scaledWaypoints, optimize)
        
        if (!result.success) {
            maxScale = scale
            scale = (minScale + maxScale) / 2
            return@repeat
        }
        
        val error = abs(result.distanceKm - targetDistanceKm) / targetDistanceKm
        
        if (error < bestError) {
            bestError = error
            bestResult = CalibratedRoute(scaledWaypoints, result)
        }
        
        // Accept if within 20% of target
        if (error < 0.20) {
            return CalibratedRoute(scaledWaypoints, result)
        }
        
        // Binary search adjustment
        if (result.distanceKm < targetDistanceKm) {
            minScale = scale
        } else {
            maxScale = scale
        }
        scale = (minScale + maxScale) / 2
    }
    
    // Return best if within 35% tolerance
    return if (bestResult != null && bestError < 0.35) bestResult else null
}
```

## 1.6 Trail-Based Templates (Using Google Places API)

Search for nearby parks/trails to use as waypoints:

```kotlin
val RUNNING_PLACE_TYPES = listOf("park", "natural_feature", "campground", "stadium", "tourist_attraction")
val RUNNING_KEYWORDS = listOf("walking trail", "river walk", "nature reserve", "domain")

suspend fun findNearbyTrailAnchors(lat: Double, lng: Double, radiusKm: Double): List<Place> {
    val places = mutableListOf<Place>()
    val radiusMeters = minOf(radiusKm * 1000, 50000).toInt()
    
    for (placeType in RUNNING_PLACE_TYPES) {
        val url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json?" +
            "location=$lat,$lng&radius=$radiusMeters&type=$placeType&key=$GOOGLE_MAPS_API_KEY"
        
        val response = httpClient.get(url)
        if (response.status == "OK") {
            response.results.take(5).forEach { result ->
                places.add(Place(
                    lat = result.geometry.location.lat,
                    lng = result.geometry.location.lng,
                    name = result.name,
                    type = placeType
                ))
            }
        }
    }
    
    // Also search keywords
    for (keyword in RUNNING_KEYWORDS) {
        val url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json?" +
            "location=$lat,$lng&radius=$radiusMeters&keyword=${URLEncoder.encode(keyword, "UTF-8")}&key=$GOOGLE_MAPS_API_KEY"
        // ... add results
    }
    
    return places
}

// Filter places for template generation
fun generateTrailBasedTemplates(startLat: Double, startLng: Double, targetDistance: Double, places: List<Place>): List<Template> {
    val baseRadius = targetDistance / 4
    
    // Filter places between 200m and 2x radius from start
    val nearbyPlaces = places.filter { p ->
        val dist = haversineDistance(LatLng(startLat, startLng), LatLng(p.lat, p.lng))
        dist > 0.2 && dist < baseRadius * 2
    }
    
    // Create 2-waypoint and 3-waypoint templates using nearby places
    val templates = mutableListOf<Template>()
    for (i in 0 until minOf(nearbyPlaces.size, 5)) {
        for (j in i + 1 until minOf(nearbyPlaces.size, 6)) {
            templates.add(Template(
                name = "Trail-${nearbyPlaces[i].name.take(15)}-${nearbyPlaces[j].name.take(15)}",
                waypoints = listOf(
                    LatLng(nearbyPlaces[i].lat, nearbyPlaces[i].lng),
                    LatLng(nearbyPlaces[j].lat, nearbyPlaces[j].lng)
                )
            ))
        }
    }
    
    return templates
}
```

## 1.7 Difficulty Assignment

```kotlin
fun assignDifficulty(
    backtrackRatio: Double,
    hasMajorRoads: Boolean,
    elevationGain: Int?
): Difficulty {
    var difficulty = if (backtrackRatio <= 0.25 && !hasMajorRoads) {
        Difficulty.EASY
    } else {
        Difficulty.MODERATE
    }
    
    // Major roads bump to moderate
    if (hasMajorRoads && difficulty == Difficulty.EASY) {
        difficulty = Difficulty.MODERATE
    }
    
    // Elevation adjustment
    if (elevationGain != null) {
        if (elevationGain > 100 && difficulty == Difficulty.EASY) {
            difficulty = Difficulty.MODERATE
        }
        if (elevationGain > 200) {
            difficulty = Difficulty.HARD
        }
    }
    
    return difficulty
}

// Major road keywords to detect
val MAJOR_ROAD_KEYWORDS = listOf("highway", "hwy", "motorway", "expressway", "freeway", "interstate", "turnpike")
```

## 1.8 Route Selection Screen

Display minimum 5 routes with:
- Route name
- Distance (actual)
- Estimated duration
- Difficulty badge (Easy/Moderate/Hard)
- Elevation gain/loss
- Map preview with polyline
- "Select" button

---

# 2. AI COACHING DURING RUNS

## 2.1 Coaching Triggers

```kotlin
enum class CoachingTrigger {
    PERIODIC,           // Every 60-120 seconds
    KM_MILESTONE,       // Every 1km completed
    TERRAIN_UPHILL,     // >=5% grade detected or approaching
    TERRAIN_DOWNHILL,   // <=-5% grade detected or approaching
    HILL_CREST,         // Just reached top of a climb
    PACE_DROP,          // >=20% slower than baseline
    PACE_IMPROVEMENT,   // Noticeably faster
    USER_VOICE_INPUT,   // User spoke to coach
    HALF_KM_SUMMARY,    // Every 500m (configurable)
    WEATHER_EXTREME,    // Extreme weather conditions
    APPROACHING_TARGET, // Near target distance
    FINAL_STRETCH       // Last 10% of run
}

// Trigger intervals (minimum time between same trigger type)
val TRIGGER_COOLDOWNS_MS = mapOf(
    CoachingTrigger.PERIODIC to 60_000,           // 60 seconds
    CoachingTrigger.KM_MILESTONE to 0,            // No cooldown (distance-based)
    CoachingTrigger.TERRAIN_UPHILL to 30_000,     // 30 seconds
    CoachingTrigger.TERRAIN_DOWNHILL to 30_000,
    CoachingTrigger.HILL_CREST to 30_000,
    CoachingTrigger.PACE_DROP to 60_000,          // 60 seconds
    CoachingTrigger.USER_VOICE_INPUT to 0         // Immediate response
)
```

## 2.2 Coaching Request Payload

```kotlin
data class CoachingRequest(
    // Current run metrics
    val currentPace: String,              // "5:30" format
    val targetPace: String,
    val heartRate: Int?,
    val elapsedTime: Int,                 // seconds
    val distanceCovered: Double,          // km
    val totalDistance: Double?,           // km (null for free runs)
    val difficulty: String,
    val currentKm: Int,
    val progressPercent: Int?,
    
    // Target time
    val targetTimeSeconds: Int?,
    
    // User profile
    val userName: String?,
    val userAge: Int?,
    val userGender: String?,
    val userWeight: String?,
    val userHeight: String?,
    val userFitnessLevel: String?,
    val desiredFitnessLevel: String?,
    
    // Coach configuration
    val coachName: String?,
    val coachTone: CoachTone,             // energetic, motivational, instructive, factual, abrupt
    val coachPreferences: String?,
    
    // Context
    val terrain: TerrainData?,
    val weather: WeatherData?,
    val goals: List<Goal>?,
    val weaknessHistory: List<WeaknessPattern>?,
    
    // Anti-repetition
    val recentCoachingTopics: List<String>,
    
    // Current events
    val paceChange: PaceChange?,          // faster, slower, steady
    val milestones: List<String>?,        // "5km", "halfway", etc.
    val kmSplitTimes: List<Int>?,         // Cumulative seconds at each km
    
    // Voice input
    val userMessage: String?,             // What user said
    
    // Exercise type
    val exerciseType: ExerciseType        // RUNNING or WALKING
)

data class CoachingResponse(
    val message: String,         // Main coaching message (max 15 words)
    val encouragement: String,   // Brief encouragement (max 10 words)
    val paceAdvice: String,      // Specific pace guidance (max 15 words)
    val breathingTip: String?,   // Quick breathing tip (max 10 words)
    val topic: String            // One-word topic: pace, breathing, milestone, form, motivation, terrain, uphill, downhill
)
```

## 2.3 AI Coaching Prompt Template

```kotlin
val coachingPrompt = """
${coachIdentity}. Providing real-time guidance.

COACHING STYLE: ${toneInstructions}

**CURRENT RUN PHASE: ${currentPhase.uppercase()}** (${phaseDescription})
${phaseInstructions}

**ELITE TECHNIQUE CUE - PRIORITY** (MUST incorporate into your main message):
Category: ${selectedCategory}
Cue: "${eliteTip}"

Current Run Stats:
- Current pace: ${currentPace}
- Target pace: ${targetPace}
- Heart rate: ${heartRate ?: "unknown"} bpm
- Progress: ${distanceCovered.format(2)}km of ${totalDistance}km (${progressPercent}%)
- Current km: ${currentKm}
- Elapsed time: ${elapsedMins} minutes ${elapsedSecs} seconds
- Difficulty: ${difficulty}
- Fitness level: ${userFitnessLevel ?: "intermediate"}
${if (targetTimeSeconds != null) "- Target finish time: ${targetTimeFormatted}\n- Time status: ${aheadOrBehind}" else ""}

${if (terrain != null) """
TERRAIN DATA:
- Current altitude: ${terrain.currentAltitude}m
- Current grade: ${terrain.currentGrade}% (${gradeDescription})
${if (terrain.upcomingTerrain != null) "- UPCOMING: ${terrain.upcomingTerrain.description} in ${terrain.upcomingTerrain.distanceAhead}m" else ""}

HILL COACHING GUIDELINES:
- For upcoming hills: Warn 100-200m ahead, advise on pace conservation
- On steep uphills (>5%): Suggest shorter strides, lean forward slightly, maintain cadence over speed
- On downhills: Control pace, quick light steps, don't overstride
- After hills: Acknowledge effort, guide recovery pace
""" else ""}

${if (weather != null) """
WEATHER CONDITIONS:
- Temperature: ${weather.temperature}°C (feels like ${weather.feelsLike}°C)
- Conditions: ${weather.condition}
- Humidity: ${weather.humidity}%
- Wind: ${weather.windSpeed} km/h
- UV Index: ${weather.uvIndex}
- Rain probability: ${weather.precipitationProbability}%

WEATHER COACHING TIPS:
${if (weather.temperature > 25) "- Hot conditions: Remind runner to stay hydrated, reduce intensity if needed" else ""}
${if (weather.temperature < 5) "- Cold conditions: Advise on keeping extremities warm" else ""}
${if (weather.humidity > 80) "- High humidity: Suggest slower pace, body cooling is less efficient" else ""}
${if (weather.windSpeed > 25) "- Windy conditions: Advise on tucking behind wind, adjusting form" else ""}
""" else ""}

${if (weaknessHistory.isNotEmpty()) """
PAST STRUGGLE PATTERNS (for personalized coaching):
${weaknessHistory.map { "- ${it.causeTag}: ${it.count} occurrence(s), typically around km ${it.distanceKm}, avg ${it.dropPercent}% pace drop" }.joinToString("\n")}

WEAKNESS-AWARE COACHING GUIDELINES:
- If runner is approaching a distance where they historically struggle, proactively offer encouragement
- Tailor advice based on known struggle causes
""" else ""}

${if (recentCoachingTopics.isNotEmpty()) """
RECENT COACHING TOPICS (avoid repeating these):
${recentCoachingTopics.map { "- \"$it\"" }.joinToString("\n")}
Choose a DIFFERENT focus area for this message.
""" else ""}

${if (userMessage != null) "The runner just said: \"$userMessage\"\nRespond to their message appropriately." else "Provide brief, motivating coaching advice."}

Respond in JSON format:
{
  "message": "Short main coaching message (max 15 words)",
  "encouragement": "Brief encouragement (max 10 words)",
  "paceAdvice": "Specific pace guidance (max 15 words)",
  "breathingTip": "Quick breathing tip if relevant (max 10 words)",
  "topic": "One-word topic of this advice"
}
"""
```

## 2.4 Elite Coaching Tips Categories

```kotlin
val ELITE_COACHING_TIPS = mapOf(
    "posture_alignment" to listOf(
        "Keep your posture tall and proud; imagine a string gently lifting the top of your head.",
        "Run with your ears, shoulders, hips, and ankles roughly in one line.",
        "Stay tall through your hips; avoid collapsing or bending at the waist as you tire.",
        "Lean very slightly forward from the ankles, not from the hips, letting gravity help you move.",
        "Keep your chin level and your neck relaxed; avoid letting your head drop forward.",
        "Think 'run tall' — elongate your spine and lift your chest slightly for better breathing."
    ),
    "arms_upper_body" to listOf(
        "Relax your shoulders and let them drop away from your ears.",
        "Keep your arms close to your sides with a gentle bend at the elbows.",
        "Let your arms swing forward and back, not across your body.",
        "Keep your hands soft, as if gently holding something you don't want to crush.",
        "When tension builds, briefly shake out your hands and arms, then settle back into rhythm.",
        "Your arms drive your legs — pump them actively to help maintain pace on tough sections."
    ),
    "breathing_relaxation" to listOf(
        "Breathe from your belly, letting the abdomen expand rather than lifting the chest.",
        "Settle into a steady, rhythmic breathing pattern that feels sustainable.",
        "Use your exhale to release tension from your shoulders and face.",
        "Let your breath guide your effort — calm, controlled breathing supports smooth running.",
        "If you feel stressed, take a deeper, slower breath and gently reset your rhythm.",
        "Match your breathing to your stride — try a 3:2 or 2:2 inhale-exhale pattern for rhythm."
    ),
    "stride_foot_strike" to listOf(
        "Aim for smooth, light steps that land softly on the ground.",
        "Let your foot land roughly under your body instead of reaching out in front.",
        "Think 'quick and elastic,' lifting the foot up and through instead of pushing long and hard.",
        "Focus on gliding forward — avoid bounding or overstriding.",
        "Use the ground to push you forward, not upward; channel your force into forward motion.",
        "Aim for around 180 steps per minute — quicker turnover reduces impact and improves efficiency."
    ),
    "core_hips_mindset" to listOf(
        "Lightly engage your core to keep your torso stable as your legs and arms move.",
        "Let the movement start from your hips, driving you calmly forward.",
        "When you tire, come back to basics: tall posture, relaxed shoulders, smooth steps.",
        "Stay present in this section of the run — one controlled stride at a time.",
        "Run with quiet confidence; efficient, relaxed form is your biggest advantage today.",
        "Visualize strong, controlled strides — your mind guides your body through the tough moments."
    )
)

// Category selection based on context
fun selectCoachingCategory(
    paceChange: PaceChange?,
    progressPercent: Int?,
    recentTopics: List<String>,
    terrain: TerrainData?
): String {
    // If pace is slowing, focus on breathing/relaxation
    if (paceChange == PaceChange.SLOWER) return "breathing_relaxation"
    
    // If on a hill, focus on posture or core
    if (terrain?.currentGrade != null && abs(terrain.currentGrade) > 3) {
        return if (terrain.currentGrade > 0) "core_hips_mindset" else "stride_foot_strike"
    }
    
    // Early in run (first 20%), focus on posture
    if (progressPercent != null && progressPercent < 20) return "posture_alignment"
    
    // Mid-run, mix between arms and stride
    if (progressPercent != null && progressPercent < 70) {
        return if (Random.nextBoolean()) "arms_upper_body" else "stride_foot_strike"
    }
    
    // Late in run (70%+), focus on mindset
    if (progressPercent != null && progressPercent >= 70) return "core_hips_mindset"
    
    // Avoid repeating recent topics
    val available = ELITE_COACHING_TIPS.keys.filter { !recentTopics.takeLast(2).contains(it) }
    return available.randomOrNull() ?: ELITE_COACHING_TIPS.keys.random()
}
```

## 2.5 Coach Tone Configurations

```kotlin
enum class CoachTone {
    ENERGETIC,      // High-energy, enthusiastic, upbeat
    MOTIVATIONAL,   // Warm, inspiring, supportive
    INSTRUCTIVE,    // Clear, educational, technique-focused
    FACTUAL,        // Straightforward, data-focused
    ABRUPT          // Very brief, commanding
}

val TONE_INSTRUCTIONS = mapOf(
    CoachTone.ENERGETIC to "Be high-energy, enthusiastic, and upbeat. Use exclamation marks and energizing language!",
    CoachTone.MOTIVATIONAL to "Be inspiring and supportive. Focus on encouragement and building confidence.",
    CoachTone.INSTRUCTIVE to "Be clear and educational. Provide detailed guidance and technique tips.",
    CoachTone.FACTUAL to "Be straightforward and data-focused. Stick to stats and objective information.",
    CoachTone.ABRUPT to "Be very brief and direct. Use short, commanding phrases. No fluff."
)
```

---

# 3. COACHING STATEMENTS & PHASES

## 3.1 Phase Definitions

```kotlin
enum class CoachingPhase {
    EARLY,    // First 2km OR first 10% of run
    MID,      // 3-5km OR 40-50% of run
    LATE,     // 7km+ OR 75-90% of run
    FINAL,    // Last 10% of run
    GENERIC   // Any time (filler between phases)
}

data class PhaseThresholds(
    val early: EarlyThreshold = EarlyThreshold(maxKm = 2.0, maxPercent = 10),
    val mid: MidThreshold = MidThreshold(minKm = 3.0, maxKm = 5.0, minPercent = 40, maxPercent = 50),
    val late: LateThreshold = LateThreshold(minKm = 7.0, minPercent = 75, maxPercent = 90),
    val final: FinalThreshold = FinalThreshold(minPercent = 90)
)
```

## 3.2 Phase Determination Logic

```kotlin
fun determinePhase(distanceKm: Double, totalDistanceKm: Double?): CoachingPhase {
    val percentComplete = if (totalDistanceKm != null && totalDistanceKm > 0) {
        (distanceKm / totalDistanceKm) * 100
    } else null
    
    // If we have total distance, use percentage-based (more accurate)
    if (percentComplete != null) {
        return when {
            percentComplete >= 90 -> CoachingPhase.FINAL      // Last 10%
            percentComplete >= 75 -> CoachingPhase.LATE       // 75-90%
            percentComplete in 40.0..50.0 -> CoachingPhase.MID // 40-50%
            percentComplete <= 10 -> CoachingPhase.EARLY      // First 10%
            else -> CoachingPhase.GENERIC                      // Between phases
        }
    }
    
    // Free run (no known total) - use absolute distance only
    // Be conservative to avoid fatigue messages early in long runs
    return when {
        distanceKm <= 2.0 -> CoachingPhase.EARLY
        distanceKm in 3.0..5.0 -> CoachingPhase.MID
        else -> CoachingPhase.GENERIC  // Beyond 5km without known total = stay generic
    }
}
```

## 3.3 Complete Coaching Statements (40 Statements)

```kotlin
data class CoachingStatement(
    val id: String,
    val text: String,
    val phase: CoachingPhase,
    val category: StatementCategory  // form, motivation, breathing, pacing, mental
)

val COACHING_STATEMENTS = listOf(
    // EARLY PHASE (8 statements) - Focus: warm-up, settling in
    CoachingStatement("early_1", "Keep your posture tall and proud, imagine a string gently lifting the top of your head.", CoachingPhase.EARLY, StatementCategory.FORM),
    CoachingStatement("early_2", "Settle into a steady, rhythmic breathing pattern that feels sustainable.", CoachingPhase.EARLY, StatementCategory.BREATHING),
    CoachingStatement("early_3", "Start easy and let your body warm up naturally. The best runs build momentum.", CoachingPhase.EARLY, StatementCategory.PACING),
    CoachingStatement("early_4", "Relax your shoulders and let them drop away from your ears.", CoachingPhase.EARLY, StatementCategory.FORM),
    CoachingStatement("early_5", "Find your rhythm. These first kilometers are about settling into a sustainable pace.", CoachingPhase.EARLY, StatementCategory.PACING),
    CoachingStatement("early_6", "Keep your hands soft, stretch your fingers and release the tension.", CoachingPhase.EARLY, StatementCategory.FORM),
    CoachingStatement("early_7", "Great start! Focus on smooth, relaxed movements as you warm up.", CoachingPhase.EARLY, StatementCategory.MOTIVATION),
    CoachingStatement("early_8", "Keep your eyes on the horizon, not your feet.", CoachingPhase.EARLY, StatementCategory.FORM),
    
    // MID PHASE (8 statements) - Focus: maintaining form, staying in the groove
    CoachingStatement("mid_1", "Lightly engage your core to keep your torso stable as your legs and arms move.", CoachingPhase.MID, StatementCategory.FORM),
    CoachingStatement("mid_2", "You're in the groove now. Stay relaxed and maintain your rhythm.", CoachingPhase.MID, StatementCategory.MOTIVATION),
    CoachingStatement("mid_3", "Think quick and elastic, lifting the foot up and through instead of pushing long and hard.", CoachingPhase.MID, StatementCategory.FORM),
    CoachingStatement("mid_4", "Keep your arms relaxed and swinging naturally with your stride.", CoachingPhase.MID, StatementCategory.FORM),
    CoachingStatement("mid_5", "Let your foot land roughly under your body instead of reaching out in front.", CoachingPhase.MID, StatementCategory.FORM),
    CoachingStatement("mid_6", "Run with quiet confidence. Efficient, relaxed form is your biggest advantage today.", CoachingPhase.MID, StatementCategory.MENTAL),
    CoachingStatement("mid_7", "You're building a strong foundation. This is where consistency pays off.", CoachingPhase.MID, StatementCategory.MOTIVATION),
    CoachingStatement("mid_8", "Check in with your breathing. Keep it controlled and rhythmic.", CoachingPhase.MID, StatementCategory.BREATHING),
    
    // LATE PHASE (8 statements) - Focus: mental strength, managing fatigue
    // THIS IS THE ONLY PHASE WHERE FATIGUE-RELATED ADVICE IS APPROPRIATE
    CoachingStatement("late_1", "Stay tall through your hips, avoid collapsing or bending at the waist as you tire.", CoachingPhase.LATE, StatementCategory.FORM),
    CoachingStatement("late_2", "If you're starting to tire, take a deep breath and reset your rhythm.", CoachingPhase.LATE, StatementCategory.BREATHING),
    CoachingStatement("late_3", "Pain fades, pride lasts. Push through this stretch and keep your head up.", CoachingPhase.LATE, StatementCategory.MOTIVATION),
    CoachingStatement("late_4", "Your body is capable of more than your mind believes. Trust your training.", CoachingPhase.LATE, StatementCategory.MENTAL),
    CoachingStatement("late_5", "You've come this far. Maintain your form and keep moving forward.", CoachingPhase.LATE, StatementCategory.MOTIVATION),
    CoachingStatement("late_6", "When it gets tough, focus on the next 100 meters, not the whole distance.", CoachingPhase.LATE, StatementCategory.MENTAL),
    CoachingStatement("late_7", "This is where champions are made. Embrace the challenge.", CoachingPhase.LATE, StatementCategory.MOTIVATION),
    CoachingStatement("late_8", "Relax your face and jaw. Tension there wastes precious energy.", CoachingPhase.LATE, StatementCategory.FORM),
    
    // FINAL PHASE (6 statements) - Focus: finishing strong, celebration
    CoachingStatement("final_1", "You're almost there! Give it everything you have left.", CoachingPhase.FINAL, StatementCategory.MOTIVATION),
    CoachingStatement("final_2", "The finish line is calling. Dig deep and finish strong!", CoachingPhase.FINAL, StatementCategory.MOTIVATION),
    CoachingStatement("final_3", "Last push! Every step now is a step closer to victory.", CoachingPhase.FINAL, StatementCategory.MOTIVATION),
    CoachingStatement("final_4", "Empty the tank. Leave nothing behind on this final stretch.", CoachingPhase.FINAL, StatementCategory.MOTIVATION),
    CoachingStatement("final_5", "You've earned this finish. Sprint home if you can!", CoachingPhase.FINAL, StatementCategory.MOTIVATION),
    CoachingStatement("final_6", "The end is in sight. This is your moment to shine!", CoachingPhase.FINAL, StatementCategory.MOTIVATION),
    
    // GENERIC (10 statements) - Timeless advice, any time
    CoachingStatement("generic_1", "Remember to smile! It helps you relax and enjoy the run.", CoachingPhase.GENERIC, StatementCategory.MENTAL),
    CoachingStatement("generic_2", "You're stronger with every stride. Stay smooth, stay strong.", CoachingPhase.GENERIC, StatementCategory.MOTIVATION),
    CoachingStatement("generic_3", "Focus on form. Tall posture, light feet, and controlled breathing.", CoachingPhase.GENERIC, StatementCategory.FORM),
    CoachingStatement("generic_4", "Your body can do this. Trust it and let your mind follow.", CoachingPhase.GENERIC, StatementCategory.MENTAL),
    CoachingStatement("generic_5", "One step at a time. That's how every great journey is conquered.", CoachingPhase.GENERIC, StatementCategory.MOTIVATION),
    CoachingStatement("generic_6", "Every run is a story of progress. Focus on your purpose.", CoachingPhase.GENERIC, StatementCategory.MOTIVATION),
    CoachingStatement("generic_7", "It's not about being the fastest, it's about little improvements every session.", CoachingPhase.GENERIC, StatementCategory.MENTAL),
    CoachingStatement("generic_8", "Remember why you started. Keep going, you're making progress.", CoachingPhase.GENERIC, StatementCategory.MOTIVATION),
    CoachingStatement("generic_9", "Breathe deep and reset. The next kilometer is yours to own.", CoachingPhase.GENERIC, StatementCategory.BREATHING),
    CoachingStatement("generic_10", "Your body is capable of amazing things. Trust the process and keep moving forward.", CoachingPhase.GENERIC, StatementCategory.MOTIVATION)
)
```

## 3.4 Statement Selection Logic

```kotlin
const val MAX_STATEMENT_USES = 3  // Same statement can't be used more than 3 times per run

fun selectStatement(
    currentPhase: CoachingPhase,
    usageCounts: MutableMap<String, Int>,
    preferPhaseSpecific: Boolean = true
): CoachingStatement? {
    val available = COACHING_STATEMENTS.filter { statement ->
        val phaseMatch = statement.phase == currentPhase || statement.phase == CoachingPhase.GENERIC
        val usageCount = usageCounts[statement.id] ?: 0
        val withinLimit = usageCount < MAX_STATEMENT_USES
        phaseMatch && withinLimit
    }
    
    if (available.isEmpty()) return null
    
    // Prefer phase-specific over generic
    if (preferPhaseSpecific) {
        val phaseSpecific = available.filter { it.phase == currentPhase }
        if (phaseSpecific.isNotEmpty()) {
            return phaseSpecific.random()
        }
    }
    
    return available.random()
}

// Track usage
fun recordStatementUsage(usageCounts: MutableMap<String, Int>, statementId: String) {
    usageCounts[statementId] = (usageCounts[statementId] ?: 0) + 1
}
```

## 3.5 Admin-Configurable Phase Thresholds

Allow admin users to customize when each phase triggers:

```kotlin
data class AdminPhaseConfig(
    val earlyMaxKm: Double = 2.0,
    val earlyMaxPercent: Int = 10,
    val midMinKm: Double = 3.0,
    val midMaxKm: Double = 5.0,
    val midMinPercent: Int = 40,
    val midMaxPercent: Int = 50,
    val lateMinKm: Double = 7.0,
    val lateMinPercent: Int = 75,
    val lateMaxPercent: Int = 90,
    val finalMinPercent: Int = 90,
    val coachingIntervalSeconds: Int = 90,  // Time between periodic coaching
    val kmMilestoneEnabled: Boolean = true,
    val halfKmSummaryEnabled: Boolean = false  // Enable 500m summaries
)
```

---

# 4. PRE-RUN SUMMARY

## 4.1 Trigger

Generate pre-run summary when GPS locks and user is about to start (on the route preview screen).

## 4.2 Request Payload

```kotlin
data class RunSummaryRequest(
    val routeName: String,
    val targetDistance: Double,           // km
    val targetTimeSeconds: Int?,
    val difficulty: String,               // easy, moderate, hard
    val elevationGain: Int?,              // meters
    val elevationLoss: Int?,
    val elevationProfile: List<ElevationPoint>?,
    val terrainType: String?,
    val weather: WeatherData?,
    val coachName: String?,
    val userName: String?,
    val firstTurnInstruction: TurnInstruction?  // First navigation instruction
)
```

## 4.3 AI Prompt for Pre-Run Summary

```kotlin
val preRunPrompt = """
You are an AI running coach.

Generate a brief pre-run announcement (30-45 words, under 15 seconds when spoken).

Route: ${targetDistance}km ${difficulty}
${if (elevationGain != null && elevationGain > 10) "Terrain: ${elevationGain}m total climb" else ""}
${if (targetTimeSeconds != null) "Pace: Target ${targetPaceFormatted} per km" else ""}
${if (weather != null) "Current conditions: ${weather.temperature}°C, ${weather.condition}" else ""}
${if (firstTurnInstruction != null) "First navigation: Run ${firstTurnInstruction.distance}m, then: \"${firstTurnInstruction.instruction}\"" else ""}

Requirements:
1. LIMIT: 30-45 words maximum
2. MUST include terrain/elevation info if provided
3. ${if (targetTimeSeconds != null) "Include pace guidance" else "Do NOT mention pace - no target was set"}
4. ${if (firstTurnInstruction != null) "End with the first navigation instruction" else "End with \"Let's go!\""}
5. No greetings, no names - get straight to the point
6. For navigation, use "turn left", "turn right" - NEVER cardinal directions (north/south)

Example: "Four point three K easy run with mostly flat terrain. Start by running 50 meters down Bronte Place then turn left onto Addison Street."
"""
```

## 4.4 Response

Simple string - the spoken pre-run announcement.

---

# 5. POST-RUN AI ANALYSIS

## 5.1 Request Payload

```kotlin
data class RunAnalysisRequest(
    val run: RunData,
    val user: UserProfile,
    val previousRuns: List<PreviousRun>?,
    val goals: List<Goal>?
)

data class RunData(
    val id: String,
    val distance: Double,                 // km
    val duration: Int,                    // seconds
    val avgPace: String,                  // "5:30" format
    val avgHeartRate: Int?,
    val maxHeartRate: Int?,
    val calories: Int?,
    val cadence: Int?,                    // steps per minute
    val difficulty: String?,
    val kmSplits: List<KmSplit>?,
    val elevationGain: Int?,
    val elevationLoss: Int?,
    val targetTime: Int?,                 // Target time in seconds set before run
    val weatherData: WeatherData?,
    val telemetry: TelemetrySummary?,     // GPS track, pace data, HR data
    val reviewedStruggles: List<ReviewedStruggle>?,  // User-annotated struggle points
    val selfAssessment: String?           // User's own thoughts on how it went
)
```

## 5.2 Response Structure

```kotlin
data class RunAnalysisResponse(
    val highlights: List<String>,         // 2-4 things done well
    val struggles: List<String>,          // 1-3 areas of difficulty
    val personalBests: List<String>,      // Any PBs achieved
    val demographicComparison: String,    // Comparison to age/fitness group
    val coachingTips: List<String>,       // 3-5 actionable tips
    val overallAssessment: String,        // 2-3 sentence summary
    val weatherImpact: String?,           // Only if weather data provided
    val warmUpAnalysis: String?,          // Only if heart rate data provided
    val goalProgress: String?,            // Only if goals provided
    val targetTimeAnalysis: String?       // CRITICAL: Only if target time was set
)
```

## 5.3 Target Time Analysis Examples

```kotlin
// Beat target
"Congratulations! You beat your target time of 30:00 by 1:23! This shows excellent pacing discipline and consistent effort throughout."

// Missed target
"You finished 2:15 behind your 30:00 target. The data shows pace dropped significantly in km 4-5, likely due to the hill. Consider more conservative early pacing next time."

// Close to target
"Just 32 seconds off your 30:00 target! Your pacing was very consistent - a strong performance that shows you're close to achieving your goal."
```

## 5.4 Self-Assessment Integration

When user provides self-assessment (free text about how they felt):

```kotlin
val selfAssessmentPrompt = """
RUNNER'S SELF-ASSESSMENT:
"${selfAssessment}"

SELF-ASSESSMENT GUIDELINES:
- Pay close attention to any aches, pains, or physical discomfort they mention
- Consider any mental/motivational challenges they describe
- Factor their subjective experience into your coaching advice
- If they mention specific body parts hurting, provide targeted advice
- Their perception matters - acknowledge what they felt even if data doesn't show it
"""
```

## 5.5 Struggle Point Analysis in Post-Run Summary

```kotlin
val struggleAnalysisPrompt = """
USER-REVIEWED STRUGGLE POINTS (pace drops during the run):
${reviewedStruggles.mapIndexed { i, s ->
    "${i + 1}. At ${s.distanceKm} km: ${s.paceDropPercent}% pace drop (${s.durationSeconds}s duration)" +
    if (s.userComment != null) " - Runner's comment: \"${s.userComment}\"" else "" +
    if (s.causeTag != null) " - Cause: ${s.causeTag.replace("_", " ")}" else ""
}.joinToString("\n")}

STRUGGLE ANALYSIS GUIDELINES:
- Consider the user's comments when analyzing pace drops
- Factor explained struggles appropriately (traffic light stop vs hitting the wall)
- Distinguish between environmental interruptions vs genuine running challenges
- Provide context-aware coaching based on what actually happened
"""
```

---

# 6. ELEVATION & HILL COACHING

## 6.1 Terrain Data Structure

```kotlin
data class TerrainData(
    val currentAltitude: Double?,         // meters
    val currentGrade: Double?,            // percentage (positive = uphill)
    val upcomingTerrain: UpcomingTerrain?,
    val totalElevationGain: Int?,
    val totalElevationLoss: Int?
)

data class UpcomingTerrain(
    val distanceAhead: Int,               // meters until terrain change
    val grade: Double,                    // percentage
    val elevationChange: Int,             // meters
    val description: String               // "steep hill ahead", "moderate downhill ahead", etc.
)
```

## 6.2 Grade Descriptions

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

## 6.3 Terrain Event Detection

```kotlin
enum class TerrainEvent {
    UPHILL,       // Currently on or approaching >=5% grade
    DOWNHILL,     // Currently on or approaching <=-5% grade
    HILL_CREST    // Just reached top of a climb
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
    
    // Check for hill crest first (was on 5%+ uphill, now <2%)
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

## 6.4 Predictive Elevation Coaching

For routes with elevation profiles, scan ahead 200m to warn about upcoming hills:

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
    
    // Find nearest point on profile
    val nearestIdx = findNearestProfilePoint(currentLat, currentLng, elevationProfile)
    val currentPoint = elevationProfile[nearestIdx]
    
    val terrain = TerrainData(
        currentAltitude = currentPoint.elevation,
        currentGrade = currentPoint.grade,
        totalElevationGain = totalElevationGain,
        totalElevationLoss = totalElevationLoss
    )
    
    // Look ahead 200m for significant terrain changes
    val lookAheadDistance = 200.0  // meters
    
    for (i in nearestIdx + 1 until elevationProfile.size) {
        val point = elevationProfile[i]
        val distanceAhead = point.distance - currentPoint.distance
        
        if (distanceAhead > 0 && distanceAhead <= lookAheadDistance) {
            if (abs(point.grade) >= 3) {  // Significant grade change
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

## 6.5 Predictive Elevation for Free Runs

For runs without a pre-planned route, use the Google Elevation API to sample terrain ahead:

```kotlin
suspend fun sampleElevationAhead(
    currentLat: Double,
    currentLng: Double,
    bearingDegrees: Double,  // Current direction of travel
    sampleDistances: List<Int> = listOf(50, 100, 150, 200)  // meters ahead
): List<ElevationSample> {
    val samples = mutableListOf<LatLng>()
    
    for (distance in sampleDistances) {
        samples.add(projectPoint(currentLat, currentLng, bearingDegrees, distance / 1000.0))
    }
    
    val locations = samples.joinToString("|") { "${it.latitude},${it.longitude}" }
    val url = "https://maps.googleapis.com/maps/api/elevation/json?locations=$locations&key=$GOOGLE_MAPS_API_KEY"
    
    val response = httpClient.get(url)
    // Parse and return elevation samples with calculated grades
    // ...
}
```

---

# 7. STRUGGLE POINT DETECTION

## 7.1 Weakness Event Structure

```kotlin
data class WeaknessEvent(
    val startDistanceKm: Double,
    val endDistanceKm: Double,
    val durationSeconds: Int,
    val avgPaceBefore: Double,           // seconds per km (baseline)
    val avgPaceDuring: Double,           // seconds per km (during slowdown)
    val dropPercent: Int,                // percentage pace drop
    val causeTag: String? = null,        // User-selected cause
    val causeNote: String? = null,       // User's free text note
    val isIrrelevant: Boolean = false    // User marked as not a real struggle
)

// Cause tags for user annotation
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

## 7.2 Detection Algorithm

```kotlin
// Configuration
const val PACE_DROP_THRESHOLD = 0.20     // 20% slower than baseline
const val MIN_SLOWDOWN_DURATION_SECONDS = 30
const val ROLLING_WINDOW_SIZE = 5        // samples for median calculation

// State tracking
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
    
    // Check if this is a significant drop
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
        
        // Optionally trigger coaching here
        triggerWeaknessCoaching()
        
    } else if (!isSignificantDrop && inSlowdown && slowdownStart != null) {
        // End of slowdown - record the event
        val durationSeconds = currentTimeSeconds - slowdownStart!!.timeSeconds
        
        // Only record if slowdown lasted at least 30 seconds
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

## 7.3 Saving Weakness Events

After run completion, save detected weaknesses:

```kotlin
// API: POST /api/runs/{runId}/weakness-events/bulk
data class WeaknessEventsBulkRequest(
    val events: List<WeaknessEvent>
)
```

## 7.4 Historical Weakness Patterns

Load user's historical struggle patterns for personalized coaching:

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

---

# 8. VOICE INPUT TO AI COACH

## 8.1 Implementation

```kotlin
// Android: Use SpeechRecognizer
// iOS: Use Speech framework

class VoiceInputHandler(
    private val onTranscript: (String) -> Unit,
    private val onError: (String) -> Unit
) {
    private var isListening = false
    
    fun startListening() {
        if (isListening) return
        isListening = true
        
        // Platform-specific speech recognition
        // ...
    }
    
    fun stopListening() {
        isListening = false
        // Stop recognition
    }
    
    private fun handleTranscript(text: String) {
        if (text.isNotBlank()) {
            onTranscript(text)
        }
    }
}
```

## 8.2 Sending Voice Input to AI

When user speaks, include their message in the coaching request:

```kotlin
val request = CoachingRequest(
    // ... all existing fields
    userMessage = transcribedText  // "How am I doing?" or "I'm feeling tired"
)

// The AI will respond to their message while providing coaching
```

## 8.3 Voice Response Playback

Use Text-to-Speech to speak the AI response:

```kotlin
// Android: Use TextToSpeech
// iOS: Use AVSpeechSynthesizer

// Or use OpenAI TTS for higher quality:
data class TTSRequest(
    val text: String,
    val tone: CoachTone,
    val voice: String = "onyx",  // alloy, echo, fable, onyx, nova, sage, shimmer, ash, coral
    val speed: Float = 1.0f
)

// Voices mapped to tones:
val VOICE_MAP = mapOf(
    CoachTone.ENERGETIC to "echo",
    CoachTone.MOTIVATIONAL to "onyx",
    CoachTone.INSTRUCTIVE to "fable",
    CoachTone.FACTUAL to "alloy",
    CoachTone.ABRUPT to "ash"
)
```

---

# 9. FREE RUN (RUN WITHOUT ROUTE)

## 9.1 Differences from Routed Run

| Feature | Routed Run | Free Run |
|---------|-----------|----------|
| Total distance | Known | Unknown |
| Phase detection | Uses percentage | Uses absolute distance only |
| Elevation profile | Pre-loaded | Sampled in real-time |
| Navigation | Turn-by-turn | None |
| Target time | Can be set | Can be set (with distance estimate) |
| Late/Final phases | At 75%/90% | Never triggered (safety) |

## 9.2 Phase Detection for Free Runs

```kotlin
// For free runs, use conservative absolute distance thresholds
// NEVER trigger late/final phase coaching to avoid fatigue messages early in long runs

fun determinePhaseForFreeRun(distanceKm: Double): CoachingPhase {
    return when {
        distanceKm <= 2.0 -> CoachingPhase.EARLY
        distanceKm in 3.0..5.0 -> CoachingPhase.MID
        else -> CoachingPhase.GENERIC  // Stay generic beyond 5km
    }
}
```

## 9.3 Predictive Elevation for Free Runs

Since there's no pre-planned route, sample elevation ahead based on current bearing:

```kotlin
class FreeRunElevationTracker {
    private var lastSampleTime = 0L
    private val sampleIntervalMs = 30_000  // Sample every 30 seconds
    
    suspend fun checkUpcomingTerrain(
        currentLat: Double,
        currentLng: Double,
        currentBearing: Double
    ): TerrainData? {
        val now = System.currentTimeMillis()
        if (now - lastSampleTime < sampleIntervalMs) return null
        lastSampleTime = now
        
        // Sample elevation at 50m, 100m, 150m, 200m ahead
        val samples = sampleElevationAhead(currentLat, currentLng, currentBearing)
        
        // Calculate grades and detect significant changes
        for (i in 1 until samples.size) {
            val distanceDiff = samples[i].distance - samples[i-1].distance
            val elevationDiff = samples[i].elevation - samples[i-1].elevation
            val grade = (elevationDiff / distanceDiff) * 100
            
            if (abs(grade) >= 5) {
                return TerrainData(
                    currentAltitude = samples[0].elevation,
                    currentGrade = null,
                    upcomingTerrain = UpcomingTerrain(
                        distanceAhead = samples[i].distance.roundToInt(),
                        grade = grade,
                        elevationChange = elevationDiff.roundToInt(),
                        description = getGradeDescription(grade)
                    )
                )
            }
        }
        
        return null
    }
}
```

## 9.4 All Features Available in Free Run

- AI coaching (periodic, terrain-triggered, pace-based)
- Voice input to coach
- Km milestone announcements
- Struggle point detection
- Post-run AI analysis
- Weather-aware coaching
- Watch heart rate integration
- Cadence analysis

---

# 10. WATCH DEVICE INTEGRATION

## 10.1 Supported Platforms

| Platform | SDK | Real-Time HR | Post-Run Sync |
|----------|-----|--------------|---------------|
| Apple Watch | HealthKit | ✅ | ✅ |
| Samsung Galaxy Watch | Samsung Health SDK | ✅ | ✅ |
| Garmin | Connect IQ SDK | ✅ | ✅ |
| Coros | Web API (OAuth) | ❌ | ✅ |
| Strava | Web API (OAuth) | ❌ | ✅ |

## 10.2 Heart Rate Data Structure

```kotlin
data class HeartRateReading(
    val bpm: Int,
    val timestamp: Long,
    val source: DeviceSource,  // APPLE, SAMSUNG, GARMIN, MANUAL
    val confidence: Float?     // 0-1 quality score
)

// Heart rate zones (based on max HR = 220 - age, or custom)
fun getHeartRateZone(bpm: Int, maxHR: Int): HeartRateZone {
    val percent = (bpm.toFloat() / maxHR) * 100
    return when {
        percent < 60 -> HeartRateZone(1, "Recovery", "#3B82F6")
        percent < 70 -> HeartRateZone(2, "Fat Burn", "#22C55E")
        percent < 80 -> HeartRateZone(3, "Aerobic", "#EAB308")
        percent < 90 -> HeartRateZone(4, "Threshold", "#F97316")
        else -> HeartRateZone(5, "Max Effort", "#EF4444")
    }
}
```

## 10.3 Real-Time HR in Coaching

Include heart rate data in coaching context:

```kotlin
val coachingContext = CoachingRequest(
    // ... existing fields
    heartRate = currentHeartRate,
    heartRateZone = getHeartRateZone(currentHeartRate, userMaxHR),
    avgHRThisKm = calculateAvgHR(heartRateHistory, lastKmStartTime),
    hrTrend = getHRTrend(heartRateHistory)  // rising, stable, falling
)
```

## 10.4 Post-Run Device Data

```kotlin
data class DeviceSyncData(
    val userId: String,
    val runId: String,
    val activityId: String?,              // External activity ID
    val heartRateZones: HeartRateZones?,
    val vo2Max: Float?,
    val trainingEffect: Float?,           // 1.0 - 5.0
    val recoveryTimeHours: Int?,
    val stressLevel: Int?,                // 0-100
    val bodyBattery: Int?,                // 0-100
    val rawData: Map<String, Any>?        // Full device response
)

data class HeartRateZones(
    val zone1Minutes: Int,
    val zone2Minutes: Int,
    val zone3Minutes: Int,
    val zone4Minutes: Int,
    val zone5Minutes: Int
)
```

---

# 11. ADMIN AI CONFIGURATION

## 11.1 AI Coach Config Structure

Admins can customize the AI coach behavior:

```kotlin
data class AiCoachConfig(
    val description: String?,              // Custom coach identity
    val instructions: List<Instruction>?,  // Coaching guidelines
    val knowledge: List<Knowledge>?,       // Knowledge base
    val faqs: List<FAQ>?                   // Common Q&A
)

data class Instruction(
    val title: String,
    val content: String
)

data class Knowledge(
    val title: String,
    val content: String
)

data class FAQ(
    val question: String,
    val answer: String
)
```

## 11.2 Admin Phase Configuration

```kotlin
data class AdminPhaseConfig(
    // Phase thresholds
    val earlyMaxKm: Double,
    val earlyMaxPercent: Int,
    val midMinKm: Double,
    val midMaxKm: Double,
    val midMinPercent: Int,
    val midMaxPercent: Int,
    val lateMinKm: Double,
    val lateMinPercent: Int,
    val lateMaxPercent: Int,
    val finalMinPercent: Int,
    
    // Coaching intervals
    val periodicCoachingIntervalSeconds: Int,
    val minTimeBetweenTerrainCoachingSeconds: Int,
    val minTimeBetweenPaceCoachingSeconds: Int,
    
    // Feature toggles
    val kmMilestoneEnabled: Boolean,
    val halfKmSummaryEnabled: Boolean,
    val terrainCoachingEnabled: Boolean,
    val paceDropCoachingEnabled: Boolean,
    val weatherAwareCoachingEnabled: Boolean
)
```

## 11.3 Coaching Log / Audit Trail

Log all AI coaching events for admin review:

```kotlin
data class CoachingLog(
    val id: String,
    val sessionKey: String,
    val userId: String,
    val runId: String?,
    val timestamp: Long,
    val eventType: CoachingEventType,     // periodic, km_milestone, terrain, pace_drop, user_voice, etc.
    val trigger: String,                   // What triggered this coaching
    val distanceKm: Double,
    val elapsedSeconds: Int,
    val currentPace: String?,
    val heartRate: Int?,
    val cadence: Int?,
    val terrain: TerrainData?,
    val weather: WeatherData?,
    val topic: String?,                    // Coaching topic
    val requestPayload: String,            // Full request JSON
    val responseText: String?,             // AI response
    val responsePayload: String?,          // Full response JSON
    val modelUsed: String?,                // gpt-4o, gpt-4o-mini, etc.
    val tokensUsed: Int?,
    val latencyMs: Int?
)

// Event types for filtering
enum class CoachingEventType {
    PERIODIC,
    KM_MILESTONE,
    HALF_KM_SUMMARY,
    TERRAIN_UPHILL,
    TERRAIN_DOWNHILL,
    HILL_CREST,
    PACE_DROP,
    PACE_IMPROVEMENT,
    USER_VOICE_INPUT,
    WEAKNESS_DETECTED,
    WEATHER_ALERT,
    PRE_RUN_SUMMARY,
    POST_RUN_ANALYSIS
}
```

## 11.4 Admin Dashboard Queries

```kotlin
// Get all coaching logs for a run
// GET /api/admin/coaching-logs?runId={runId}

// Get logs by event type
// GET /api/admin/coaching-logs?eventType=TERRAIN_UPHILL&startDate=2024-01-01

// Get AI usage stats
// GET /api/admin/ai-stats?userId={userId}&startDate=2024-01-01
data class AIUsageStats(
    val totalCoachingCalls: Int,
    val totalTokensUsed: Int,
    val avgLatencyMs: Int,
    val callsByEventType: Map<CoachingEventType, Int>,
    val callsByTopic: Map<String, Int>
)
```

---

# 12. API ENDPOINTS REFERENCE

## 12.1 Route Generation

```
POST /api/routes/generate
Request: RouteGenerationRequest
Response: { success: boolean, routes: RouteCandidate[] }
```

## 12.2 AI Coaching

```
POST /api/ai/coaching
Request: CoachingRequest
Response: CoachingResponse
```

## 12.3 Pre-Run Summary

```
POST /api/ai/run-summary
Request: RunSummaryRequest
Response: { summary: string }
```

## 12.4 Post-Run Analysis

```
POST /api/ai/run-analysis
Request: RunAnalysisRequest
Response: RunAnalysisResponse
```

## 12.5 Text-to-Speech

```
POST /api/tts
Request: TTSRequest
Response: audio/mpeg (MP3 buffer)
```

## 12.6 Weakness Events

```
POST /api/runs/{runId}/weakness-events/bulk
Request: { events: WeaknessEvent[] }
Response: { success: boolean }

GET /api/users/{userId}/weakness-patterns
Response: WeaknessPattern[]
```

## 12.7 Coaching Logs

```
POST /api/coaching-logs
Request: CoachingLog
Response: { id: string }

GET /api/coaching-logs?sessionKey={key}
Response: CoachingLog[]
```

## 12.8 Device Sync

```
POST /api/device-data/sync
Request: DeviceSyncData
Response: { success: boolean }
```

---

# END OF DOCUMENT

This document provides the complete specification for replicating all AI coaching, route generation, and run analysis features in native iOS (Xcode) and Android (Android Studio) applications.

Key implementation priorities:
1. Route generation with 100 templates and strict circuit validation
2. Phase-based coaching statements with proper triggers
3. Predictive elevation coaching for both routed and free runs
4. Struggle point detection and historical pattern analysis
5. Voice input/output for real-time AI interaction
6. Watch device integration for enriched heart rate data
7. Comprehensive post-run AI analysis with target time feedback
8. Admin configuration and audit trail for all AI interactions
