package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Response from /api/auth/garmin endpoint
 * Contains the Garmin OAuth URL to open in browser
 */
data class GarminAuthResponse(
    @SerializedName("authUrl") val authUrl: String,
    @SerializedName("state") val state: String
)
