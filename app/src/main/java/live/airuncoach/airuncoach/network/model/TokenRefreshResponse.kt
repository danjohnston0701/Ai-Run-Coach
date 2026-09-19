package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/** POST /api/auth/refresh */
data class TokenRefreshResponse(
    @SerializedName("token") val token: String?,
)
