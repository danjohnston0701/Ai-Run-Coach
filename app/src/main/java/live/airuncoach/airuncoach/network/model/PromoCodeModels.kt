package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class PromoCodeRequest(
    @SerializedName("code")
    val code: String
)

data class PromoCodeResponse(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("message")
    val message: String,
    @SerializedName("grantedUntil")
    val grantedUntil: String? = null,
    @SerializedName("features")
    val features: List<String>? = null
)

data class PromoGrant(
    @SerializedName("code")
    val code: String,
    @SerializedName("expiresAt")
    val expiresAt: String,
    @SerializedName("features")
    val features: List<String>
)
