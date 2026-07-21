package live.airuncoach.airuncoach.viewmodel

data class LoginState(
    val name: String = "",
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val isLoginSuccessful: Boolean = false,
    // Email verification flow
    val requiresEmailVerification: Boolean = false,
    val pendingVerificationEmail: String = "",
    val changeEmailError: String? = null,   // Error specific to the change-email dialog
    val changeEmailSuccess: Boolean = false, // True briefly after a successful email change
    // Track if credentials came from Samsung Pass / password manager autofill
    val credentialsFromPasswordManager: Boolean = false,
)
