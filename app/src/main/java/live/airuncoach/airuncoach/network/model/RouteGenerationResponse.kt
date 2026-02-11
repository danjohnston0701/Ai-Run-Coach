package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Response from route generation endpoint
 * POST /api/routes/generate-options
 * Returns multiple AI-generated route options
 */
data class RouteGenerationResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("routes")
    val routes: List<RouteOption>,
    
    @SerializedName("targetDistance")
    val targetDistance: Double,
    
    @SerializedName("generationMethod")
    val generationMethod: String,
    
    @SerializedName("startLocationLabel")
    val startLocationLabel: String
)

/**
 * Individual route option from backend
 * AI-generated route with GraphHopper/Google Maps
 */
data class RouteOption(
    @SerializedName("dbId")
    val id: String?,
    
    @SerializedName("routeName")
    val name: String,
    
    @SerializedName("actualDistance")
    val distance: Double,  // in kilometers
    
    @SerializedName("duration")
    val estimatedTime: Double,  // in minutes
    
    @SerializedName("difficulty")
    val difficulty: String,  // "easy", "moderate", "hard"
    
    @SerializedName("polyline")
    val polyline: String,  // Google encoded polyline
    
    @SerializedName("waypoints")
    val waypoints: List<WaypointDto>,
    
    @SerializedName("elevation")
    val elevation: ElevationDto? = null,
    
    @SerializedName("turnInstructions")
    val turnInstructions: List<TurnInstructionDto>? = null,
    
    @SerializedName("hasMajorRoads")
    val hasMajorRoads: Boolean? = null
)

data class ElevationDto(
    @SerializedName("gain")
    val gain: Double?,
    
    @SerializedName("loss")
    val loss: Double?,
    
    @SerializedName("profile")
    val profile: List<Any>? = null
)

data class WaypointDto(
    @SerializedName("lat")
    val lat: Double,
    
    @SerializedName("lng")
    val lng: Double
)

data class TurnInstructionDto(
    @SerializedName("instruction")
    val instruction: String,
    
    @SerializedName("lat")
    val lat: Double,
    
    @SerializedName("lng")
    val lng: Double,
    
    @SerializedName("distance")
    val distance: Double?,
    
    // V2 Enhanced Navigation Fields
    @SerializedName("streetName")
    val streetName: String? = null,  // "Main Street"
    
    @SerializedName("maneuver")
    val maneuver: String? = null,  // "turn-left", "turn-right", "roundabout", etc.
    
    @SerializedName("warningDistance")
    val warningDistance: Int? = null  // meters before turn to warn user (50-100m)
)

data class CircuitQualityDto(
    @SerializedName("backtrackRatio")
    val backtrackRatio: Double,
    
    @SerializedName("angularSpread")
    val angularSpread: Double,
    
    // V2 Enhanced Quality Metrics
    @SerializedName("loopQuality")
    val loopQuality: Double? = null,  // 0-1, how close end is to start
    
    @SerializedName("terrainDiversity")
    val terrainDiversity: Double? = null  // 0-1, variety of terrain types
)

/**
 * Waypoint checkpoint with tolerance for navigation
 */
data class WaypointCheckpointDto(
    @SerializedName("index")
    val index: Int,
    
    @SerializedName("location")
    val location: WaypointDto,
    
    @SerializedName("distanceFromStart")
    val distanceFromStart: Double,  // meters from start
    
    @SerializedName("toleranceRadius")
    val toleranceRadius: Int,  // meters - how close user must be (50-100m)
    
    @SerializedName("instructionCount")
    val instructionCount: Int  // number of turn instructions at this checkpoint
)
