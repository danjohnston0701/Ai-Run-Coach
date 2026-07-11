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

data class VerifyEmailRequest(
    val email: String,
    val otp: String
)

data class ResendVerificationRequest(
    val email: String
)

data class UpdateVerificationEmailRequest(
    val currentEmail: String,
    val newEmail: String
)

data class UpdateVerificationEmailResponse(
    val ok: Boolean? = null,
    val email: String? = null,
    val error: String? = null
)
