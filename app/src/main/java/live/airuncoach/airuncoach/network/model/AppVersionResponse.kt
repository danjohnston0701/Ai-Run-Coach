package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Response from GET /api/app/version endpoint
 * Provides app version information for update checks
 */
data class AppVersionResponse(
    @SerializedName("currentVersion")
    val currentVersion: String,
    
    @SerializedName("currentVersionCode")
    val currentVersionCode: Int,
    
    @SerializedName("minimumVersionCode")
    val minimumVersionCode: Int,
    
    @SerializedName("updateUrl")
    val updateUrl: String,
    
    @SerializedName("releaseNotes")
    val releaseNotes: String? = null,
    
    @SerializedName("updateRequired")
    val updateRequired: Boolean = false
)
