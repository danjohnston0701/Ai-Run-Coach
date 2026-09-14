package live.airuncoach.airuncoach.network.model

/**
 * Handset the app is running on, sent with register and login.
 *
 * OS-level behaviour varies enormously by manufacturer — an OPPO/ColorOS device killing the
 * app in the background made watch-paired runs unreliable for a beta tester in a way that
 * never reproduced on other hardware, and there was no way to see how many users were exposed.
 * Populated by [deviceInfo]; every field is optional server-side so older builds still sign in.
 */
data class DeviceInfo(
    val manufacturer: String,
    val model: String,
    val osVersion: String,
    val appVersion: String,
)

/**
 * Build.MANUFACTURER is the make ("OPPO", "samsung"), Build.MODEL the marketing/device name
 * ("CPH2695"). Build.VERSION.RELEASE is the Android version as users know it ("14") rather
 * than the SDK integer.
 */
fun deviceInfo(appVersion: String): DeviceInfo = DeviceInfo(
    manufacturer = android.os.Build.MANUFACTURER ?: "unknown",
    model = android.os.Build.MODEL ?: "unknown",
    osVersion = "Android ${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT})",
    appVersion = appVersion,
)

data class LoginRequest(
    val email: String,
    val password: String,
    val timezone: String? = null,
    val country: String? = null,
    val platform: String = "android",
    val device: DeviceInfo? = null
)

data class RegisterRequest(
    val name: String,
    val email: String,
    val password: String,
    val timezone: String? = null,
    val country: String? = null,
    val platform: String = "android",
    val device: DeviceInfo? = null
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
