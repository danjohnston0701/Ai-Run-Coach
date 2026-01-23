# Route Generation System Specification

**Version:** 1.0  
**Last Updated:** January 24, 2026

## Overview
Generate **minimum 5 diverse routes** (target 100 templates) that are genuine circuit loops returning to the start point.

## Base Radius Calculation

```kotlin
// Formula: targetDistance / 2.0 = radius
val baseRadius = targetDistanceKm / 2.0
```

## Core Validation Rules

### 1. Distance Tolerance
- **Primary threshold:** 20% of target distance
- **Fallback threshold:** 35% if fewer routes generated

### 2. Backtrack Detection
Routes must not double back excessively.

```kotlin
val strictThresholds = listOf(0.10, 0.15, 0.20, 0.25)  // 10%, 15%, 20%, 25%
val relaxedThresholds = listOf(0.30, 0.35, 0.40)       // Fallback

fun calculateBacktrackRatio(polylinePoints: List<LatLng>): Double {
    if (polylinePoints.size < 10) return 0.0
    
    val distances = mutableListOf(0.0)
    for (i in 1 until polylinePoints.size) {
        distances.add(distances[i-1] + haversineDistance(polylinePoints[i-1], polylinePoints[i]))
    }
    val totalDistance = distances.last()
    val excludeDistance = 0.3 // 300m - exclude first/last
    
    var startIdx = 0
    var endIdx = polylinePoints.size - 1
    for (i in distances.indices) {
        if (distances[i] >= excludeDistance) { startIdx = i; break }
    }
    for (i in distances.indices.reversed()) {
        if (totalDistance - distances[i] >= excludeDistance) { endIdx = i; break }
    }
    
    val gridSize = 0.0003  // ~30m grid
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

### 3. Angular Spread (Circuit Validation)
Genuine circuits should cover 150-180 degrees around start point.

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
    
    // Count unique 30-degree sectors
    val sectors = bearings.map { (it / 30).toInt() }.toSet()
    return sectors.size * 30  // Returns 0-360 degrees
}

// Thresholds: Strict 150°, Relaxed 120°
```

### 4. Route Similarity Detection
Prevent duplicate routes.

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

// THRESHOLD: Reject routes with >40% overlap
```

## Route Templates (100 Templates)

### Template Categories
1. **Basic Cardinal Loops** (4 templates)
2. **Squares** (4 templates)
3. **Polygons** (6 templates)
4. **Figure-8 Patterns** (4 templates)
5. **Extended Reach** (4 templates)
6. **Asymmetric Patterns** (4 templates)
7. **Cloverleaf Patterns** (4 templates)
8. **Diamond Patterns** (4 templates)
9. **Circuit Patterns** (6 templates)
10. **... 60+ additional templates**

### Point Projection
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
```

## Trail-Based Templates

Use Google Places API to find parks/trails as waypoints:

```kotlin
val RUNNING_PLACE_TYPES = listOf("park", "natural_feature", "campground", "stadium", "tourist_attraction")
val RUNNING_KEYWORDS = listOf("walking trail", "river walk", "nature reserve", "domain")

suspend fun findNearbyTrailAnchors(lat: Double, lng: Double, radiusKm: Double): List<Place>
```

## Route Calibration

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
    
    // Binary search to find optimal scale
    // Accept if within 20% tolerance
    // Return best if within 35% fallback tolerance
}
```

## Difficulty Assignment

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
    
    if (hasMajorRoads && difficulty == Difficulty.EASY) difficulty = Difficulty.MODERATE
    
    if (elevationGain != null) {
        if (elevationGain > 100 && difficulty == Difficulty.EASY) difficulty = Difficulty.MODERATE
        if (elevationGain > 200) difficulty = Difficulty.HARD
    }
    
    return difficulty
}

val MAJOR_ROAD_KEYWORDS = listOf("highway", "hwy", "motorway", "expressway", "freeway", "interstate", "turnpike")
```

## Implementation Files to Create
- `RouteGenerationService.kt`
- `RouteTemplates.kt`
- `RouteValidator.kt`
- `RouteCalibrator.kt`
- `TrailFinder.kt`
