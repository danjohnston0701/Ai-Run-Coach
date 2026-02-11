package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Request body for generating route options V2
 * POST /api/routes/generate-options-v2
 * 
 * V2 uses geographic feature discovery (parks, trails, beaches)
 * instead of geometric templates for more professional routes
 */
data class RouteGenerationRequest(
    @SerializedName("startLat")
    val startLat: Double,
    
    @SerializedName("startLng")
    val startLng: Double,
    
    @SerializedName("targetDistance")
    val distance: Double,  // in kilometers
    
    @SerializedName("useAI")
    val useAI: Boolean = true,  // Use AI-powered route generation
    
    @SerializedName("userId")
    val userId: String? = null,  // Optional user ID for personalization
    
    @SerializedName("activityType")
    val activityType: String = "run",  // "run" or "walk"
    
    @SerializedName("difficulty")
    val difficulty: String? = null,  // "easy", "moderate", "hard" (optional)
    
    @SerializedName("terrainPreference")
    val terrainPreference: String? = null,  // "mixed", "flat", etc. (optional)
    
    @SerializedName("avoidHills")
    val avoidHills: Boolean = false
)
