package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Response from route generation endpoint V2
 * POST /api/routes/generate-options-v2
 */
data class RouteGenerationResponse(
    @SerializedName("routes")
    val routes: List<RouteOption>
)

/**
 * Individual route option from backend V2
 * Enhanced with geographic features and terrain diversity
 */
data class RouteOption(
    @SerializedName("id")
    val id: String,
    
    @SerializedName("name")
    val name: String,
    
    @SerializedName("distance")
    val distance: Double,  // in kilometers
    
    @SerializedName("estimatedTime")
    val estimatedTime: Double,  // in minutes (GraphHopper returns decimal values)
    
    @SerializedName("elevationGain")
    val elevationGain: Double,  // in meters (GraphHopper returns decimal values)
    
    @SerializedName("elevationLoss")
    val elevationLoss: Double,  // in meters (GraphHopper returns decimal values)
    
    @SerializedName("maxGradientPercent")
    val maxGradientPercent: Double,
    
    @SerializedName("maxGradientDegrees")
    val maxGradientDegrees: Double,
    
    @SerializedName("difficulty")
    val difficulty: String,  // "easy", "moderate", "hard"
    
    @SerializedName("polyline")
    val polyline: String,  // Google encoded polyline
    
    @SerializedName("waypoints")
    val waypoints: List<WaypointDto>,
    
    @SerializedName("description")
    val description: String,
    
    @SerializedName("turnByTurn")
    val turnByTurn: List<String>,
    
    @SerializedName("turnInstructions")
    val turnInstructions: List<TurnInstructionDto>,
    
    @SerializedName("circuitQuality")
    val circuitQuality: CircuitQualityDto,
    
    // V2 Enhanced Fields
    @SerializedName("terrainTypes")
    val terrainTypes: List<String>? = null,  // e.g., ["trail", "park", "road"]
    
    @SerializedName("featureTypes")
    val featureTypes: List<String>? = null,  // e.g., ["park", "waterfront", "poi"]
    
    @SerializedName("checkpoints")
    val checkpoints: List<WaypointCheckpointDto>? = null
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
