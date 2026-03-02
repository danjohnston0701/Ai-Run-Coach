package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Request for GraphHopper-powered intelligent route generation
 * Uses OSM segment intelligence + validation for dead-end free routes
 */
data class IntelligentRouteRequest(
    @SerializedName("latitude")
    val latitude: Double,
    
    @SerializedName("longitude")
    val longitude: Double,
    
    @SerializedName("distanceKm")
    val distanceKm: Double,
    
    @SerializedName("activityType")
    val activityType: String = "run",  // "run" or "walk"
    
    @SerializedName("preferTrails")
    val preferTrails: Boolean = true,
    
    @SerializedName("avoidHills")
    val avoidHills: Boolean = false,
    
    @SerializedName("targetTime")
    val targetTime: Int? = null,  // optional target time in minutes
    
    @SerializedName("aiCoachEnabled")
    val aiCoachEnabled: Boolean = true
)

/**
 * Response containing 3 intelligent route options
 */
data class IntelligentRouteResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("routes")
    val routes: List<IntelligentRoute>
)

/**
 * Single intelligent route option with quality metrics
 */
data class IntelligentRoute(
    @SerializedName("id")
    val id: String?,
    
    @SerializedName("polyline")
    val polyline: String?,  // Encoded polyline for Google Maps
    
    @SerializedName("distance")
    val distance: Double?,  // meters (can be decimal)
    
    @SerializedName("elevationGain")
    val elevationGain: Double?,  // meters (GraphHopper returns decimal values)
    
    @SerializedName("elevationLoss")
    val elevationLoss: Double?,  // meters (GraphHopper returns decimal values)
    
    @SerializedName("difficulty")
    val difficulty: String?,  // "easy", "moderate", "hard"
    
    @SerializedName("estimatedTime")
    val estimatedTime: Double?,  // seconds (GraphHopper returns decimal values)
    
    @SerializedName("popularityScore")
    val popularityScore: Double?,  // 0-1 (from user data)
    
    @SerializedName("qualityScore")
    val qualityScore: Double?,  // 0-1 (circuit quality)
    
    @SerializedName("turnInstructions")
    val turnInstructions: List<GraphHopperTurnInstruction>? = null  // Turn-by-turn from GraphHopper
)

/**
 * GraphHopper turn instruction format (from intelligent route generation).
 * Has text + distance + interval (polyline point indices) rather than lat/lng.
 * The interval can be used to extract the lat/lng from the polyline.
 */
data class GraphHopperTurnInstruction(
    @SerializedName("text")
    val text: String?,  // e.g. "Turn left onto Oak Street"
    
    @SerializedName("distance")
    val distance: Double?,  // meters from start to this instruction
    
    @SerializedName("time")
    val time: Double?,  // milliseconds from start
    
    @SerializedName("interval")
    val interval: List<Int>?,  // [startIndex, endIndex] into polyline points
    
    @SerializedName("sign")
    val sign: Int?  // GraphHopper turn sign (0=straight, -2=left, 2=right, etc.)
)
