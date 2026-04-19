package live.airuncoach.airuncoach.network.model

data class LoginRequest(
    val email: String,
    val password: String,
    val timezone: String? = null
)

data class RegisterRequest(
    val name: String,
    val email: String,
    val password: String
)

data class ForgotPasswordRequest(
    val email: String
)

data class ForgotPasswordResponse(
    val ok: Boolean? = null,
    val error: String? = null
)
