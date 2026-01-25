package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.User

/**
 * Response from login/register endpoints
 * Backend returns: { user: User, token: string }
 */
data class AuthResponse(
    @SerializedName("user")
    val user: User?,
    
    @SerializedName("token")
    val token: String?
)
