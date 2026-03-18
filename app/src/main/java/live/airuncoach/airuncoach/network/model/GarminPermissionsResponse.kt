package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Response from /api/garmin/permissions endpoint
 * Contains device info and list of all Garmin permission scopes and their grant status
 */
data class GarminPermissionsResponse(
    @SerializedName("deviceName") val deviceName: String?,
    @SerializedName("connectedSince") val connectedSince: String?,
    @SerializedName("lastSyncAt") val lastSyncAt: String?,
    @SerializedName("permissions") val permissions: List<GarminPermissionItem>
)

data class GarminPermissionItem(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("description") val description: String,
    @SerializedName("category") val category: String, // "activities", "health", "wellness", "advanced"
    @SerializedName("isGranted") val isGranted: Boolean
)

/**
 * Response from /api/garmin/reauthorize endpoint
 * Contains the OAuth URL for re-authorizing with new permissions
 */
data class GarminAuthUrlResponse(
    @SerializedName("authUrl") val authUrl: String,
    @SerializedName("state") val state: String? = null
)
