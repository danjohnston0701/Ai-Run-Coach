package live.airuncoach.airuncoach.domain.model

import com.google.gson.annotations.SerializedName

data class ConnectedDevice(
    @SerializedName("id")
    val id: String,
    
    @SerializedName("deviceType")
    val deviceType: String, // 'garmin' | 'samsung' | 'apple' | 'coros' | 'strava'
    
    @SerializedName("deviceName")
    val deviceName: String?,
    
    @SerializedName("deviceId")
    val deviceId: String?,
    
    @SerializedName("lastSyncAt")
    val lastSyncAt: String?,
    
    @SerializedName("isActive")
    val isActive: Boolean,
    
    @SerializedName("createdAt")
    val createdAt: String
)

data class WellnessSyncResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("message")
    val message: String
)
