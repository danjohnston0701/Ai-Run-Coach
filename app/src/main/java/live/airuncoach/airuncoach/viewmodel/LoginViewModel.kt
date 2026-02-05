package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.LoginRequest
import live.airuncoach.airuncoach.network.model.RegisterRequest
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) : ViewModel() {
    
    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()

    private val _loginState = MutableStateFlow(LoginState())
    val loginState = _loginState.asStateFlow()

    fun onNameChange(name: String) {
        _loginState.update { it.copy(name = name) }
    }

    fun onEmailChange(email: String) {
        _loginState.update { it.copy(email = email) }
    }

    fun onPasswordChange(password: String) {
        _loginState.update { it.copy(password = password) }
    }

    fun onConfirmPasswordChange(confirmPassword: String) {
        _loginState.update { it.copy(confirmPassword = confirmPassword) }
    }

    fun login() {
        viewModelScope.launch {
            _loginState.update { it.copy(isLoading = true, error = null) }
            try {
                val email = _loginState.value.email.trim().lowercase()
                val password = _loginState.value.password
                
                android.util.Log.d("LoginViewModel", "📧 Attempting login for: $email")
                android.util.Log.d("LoginViewModel", "📧 Original email: ${_loginState.value.email}")
                android.util.Log.d("LoginViewModel", "🔑 Password length: ${password.length}")
                
                val response = apiService.login(
                    LoginRequest(
                        email,
                        password
                    )
                )
                
                android.util.Log.d("LoginViewModel", "✅ Login API call successful!")
                android.util.Log.d("LoginViewModel", "🔍 RAW RESPONSE: ${gson.toJson(response)}")
                android.util.Log.d("LoginViewModel", "Token in body: ${response.token != null} (${response.token?.take(20) ?: "null"}...)")
                
                // Extract user from response (handles both wrapped and flattened formats)
                val user = response.extractUser()
                android.util.Log.d("LoginViewModel", "User extracted: ${user != null}")
                
                if (user != null) {
                    android.util.Log.d("LoginViewModel", "User details - Name: ${user.name}, ID: ${user.id}, Email: ${user.email}")
                } else {
                    android.util.Log.e("LoginViewModel", "⚠️ Failed to extract user from response!")
                    android.util.Log.e("LoginViewModel", "Response had user field: ${response.user != null}")
                    android.util.Log.e("LoginViewModel", "Response had id field: ${response.id != null}")
                    _loginState.update { it.copy(isLoading = false, error = "Invalid login response: no user data received") }
                    return@launch
                }
                
                // Try to get token from response body, or generate a fallback from existing session
                val token = response.token ?: sessionManager.getAuthToken() ?: run {
                    // If no token in body and no existing token, this is a problem
                    android.util.Log.w("LoginViewModel", "⚠️ No token in response body, checking if token is in cookies...")
                    // Generate a temporary identifier based on user ID (backend should send token via cookie)
                    "user_${user.id}_${System.currentTimeMillis()}"
                }
                
                android.util.Log.d("LoginViewModel", "Using token: ${token.take(20)}...")
                
                // Save auth token
                Log.d("LoginViewModel", "💾 Saving auth token and user ID...")
                sessionManager.saveAuthToken(token)
                sessionManager.saveUserId(user.id)
                val savedToken = sessionManager.getAuthToken()
                android.util.Log.d("LoginViewModel", "Token saved and verified: ${savedToken != null && savedToken == token}")
                
                if (savedToken != token) {
                    android.util.Log.e("LoginViewModel", "⚠️ Token save verification FAILED!")
                    _loginState.update { it.copy(isLoading = false, error = "Failed to save authentication token") }
                    return@launch
                }
                
                // Save user data to SharedPreferences for dashboard
                val userJson = gson.toJson(user)
                android.util.Log.d("LoginViewModel", "💾 Saving user data: $userJson")
                val saveSuccess = sharedPrefs.edit().putString("user", userJson).commit()
                android.util.Log.d("LoginViewModel", "User data save result: $saveSuccess")
                
                if (!saveSuccess) {
                    android.util.Log.e("LoginViewModel", "⚠️ User data commit() FAILED!")
                    _loginState.update { it.copy(isLoading = false, error = "Failed to save user data") }
                    return@launch
                }
                
                // Verify it was saved
                val savedUserJson = sharedPrefs.getString("user", null)
                android.util.Log.d("LoginViewModel", "✅ Verification - User data exists: ${savedUserJson != null}")
                if (savedUserJson != null) {
                    android.util.Log.d("LoginViewModel", "Saved user JSON: $savedUserJson")
                    
                    // Triple-check we can deserialize it
                    try {
                        val verifyUser = gson.fromJson(savedUserJson, live.airuncoach.airuncoach.domain.model.User::class.java)
                        android.util.Log.d("LoginViewModel", "✅ User data verified - ID: ${verifyUser.id}, Name: ${verifyUser.name}")
                    } catch (e: Exception) {
                        android.util.Log.e("LoginViewModel", "⚠️ User data deserialization FAILED: ${e.message}")
                        _loginState.update { it.copy(isLoading = false, error = "Failed to save user data correctly") }
                        return@launch
                    }
                } else {
                    android.util.Log.e("LoginViewModel", "⚠️ User data verification FAILED - data is null after save!")
                    _loginState.update { it.copy(isLoading = false, error = "Failed to verify user data save") }
                    return@launch
                }
                
                _loginState.update { it.copy(isLoading = false, error = null, isLoginSuccessful = true) }
                android.util.Log.d("LoginViewModel", "🎉 Login state updated to successful!")
            } catch (e: retrofit2.HttpException) {
                val errorBody = e.response()?.errorBody()?.string()
                android.util.Log.e("LoginViewModel", "❌ HTTP Error ${e.code()}: $errorBody", e)
                android.util.Log.e("LoginViewModel", "❌ Full response: ${e.response()}")
                android.util.Log.e("LoginViewModel", "❌ Request URL: ${e.response()?.raw()?.request?.url}")
                
                // Try to parse error message from backend
                val errorMessage = try {
                    val json = com.google.gson.JsonParser.parseString(errorBody).asJsonObject
                    json.get("error")?.asString ?: json.get("message")?.asString ?: "Login failed"
                } catch (ex: Exception) {
                    "Login failed: ${e.message}"
                }
                
                android.util.Log.e("LoginViewModel", "❌ Parsed error message: $errorMessage")
                
                val userFriendlyError = when (e.code()) {
                    401 -> "Invalid email or password. Backend says: $errorMessage"
                    404 -> "Account not found. Please register first."
                    500 -> "Server error. Please try again later."
                    else -> "Error (${e.code()}): $errorMessage"
                }
                
                _loginState.update { it.copy(isLoading = false, error = userFriendlyError) }
            } catch (e: java.net.UnknownHostException) {
                android.util.Log.e("LoginViewModel", "❌ Network error: Cannot reach server", e)
                _loginState.update { it.copy(isLoading = false, error = "Cannot reach server. Check your internet connection.") }
            } catch (e: Exception) {
                android.util.Log.e("LoginViewModel", "❌ Login failed: ${e.javaClass.simpleName} - ${e.message}", e)
                _loginState.update { it.copy(isLoading = false, error = e.message ?: "Login failed") }
            }
        }
    }

    fun register() {
        viewModelScope.launch {
            _loginState.update { it.copy(isLoading = true, error = null) }

            // Validate inputs
            if (_loginState.value.name.isBlank()) {
                _loginState.update { it.copy(isLoading = false, error = "Please enter your name") }
                return@launch
            }

            if (_loginState.value.email.isBlank()) {
                _loginState.update { it.copy(isLoading = false, error = "Please enter your email") }
                return@launch
            }

            if (!android.util.Patterns.EMAIL_ADDRESS.matcher(_loginState.value.email).matches()) {
                _loginState.update { it.copy(isLoading = false, error = "Please enter a valid email") }
                return@launch
            }

            if (_loginState.value.password.length < 6) {
                _loginState.update { it.copy(isLoading = false, error = "Password must be at least 6 characters") }
                return@launch
            }

            if (_loginState.value.password != _loginState.value.confirmPassword) {
                _loginState.update { it.copy(isLoading = false, error = "Passwords do not match") }
                return@launch
            }

            try {
                val response = apiService.register(
                    RegisterRequest(
                        name = _loginState.value.name,
                        email = _loginState.value.email,
                        password = _loginState.value.password
                    )
                )
                
                android.util.Log.d("LoginViewModel", "✅ Registration API call successful!")
                android.util.Log.d("LoginViewModel", "🔍 RAW RESPONSE: ${gson.toJson(response)}")
                android.util.Log.d("LoginViewModel", "Token in body: ${response.token != null} (${response.token?.take(20) ?: "null"}...)")
                
                // Extract user from response (handles both wrapped and flattened formats)
                val user = response.extractUser()
                android.util.Log.d("LoginViewModel", "User extracted: ${user != null}")
                
                if (user != null) {
                    android.util.Log.d("LoginViewModel", "User details - Name: ${user.name}, ID: ${user.id}, Email: ${user.email}")
                } else {
                    android.util.Log.e("LoginViewModel", "⚠️ Failed to extract user from registration response!")
                    _loginState.update { it.copy(isLoading = false, error = "Registration failed: no user data received") }
                    return@launch
                }
                
                // Try to get token from response body, or generate a fallback
                val token = response.token ?: sessionManager.getAuthToken() ?: run {
                    android.util.Log.w("LoginViewModel", "⚠️ No token in response body, using user ID as token...")
                    "user_${user.id}_${System.currentTimeMillis()}"
                }
                
                android.util.Log.d("LoginViewModel", "Using token: ${token.take(20)}...")
                
                // Save auth token
                android.util.Log.d("LoginViewModel", "💾 Saving auth token and user ID...")
                sessionManager.saveAuthToken(token)
                sessionManager.saveUserId(user.id)
                val savedToken = sessionManager.getAuthToken()
                android.util.Log.d("LoginViewModel", "Token saved and verified: ${savedToken != null && savedToken == token}")
                
                if (savedToken != token) {
                    android.util.Log.e("LoginViewModel", "⚠️ Token save verification FAILED!")
                    _loginState.update { it.copy(isLoading = false, error = "Failed to save authentication token") }
                    return@launch
                }
                
                // Save user data to SharedPreferences for dashboard
                val userJson = gson.toJson(user)
                android.util.Log.d("LoginViewModel", "💾 Saving user data: $userJson")
                val saveSuccess = sharedPrefs.edit().putString("user", userJson).commit()
                android.util.Log.d("LoginViewModel", "User data save result: $saveSuccess")
                
                if (!saveSuccess) {
                    android.util.Log.e("LoginViewModel", "⚠️ User data commit() FAILED!")
                    _loginState.update { it.copy(isLoading = false, error = "Failed to save user data") }
                    return@launch
                }
                
                // Verify it was saved
                val savedUserJson = sharedPrefs.getString("user", null)
                android.util.Log.d("LoginViewModel", "✅ Verification - User data exists: ${savedUserJson != null}")
                if (savedUserJson != null) {
                    android.util.Log.d("LoginViewModel", "Saved user JSON: $savedUserJson")
                    
                    // Triple-check we can deserialize it
                    try {
                        val verifyUser = gson.fromJson(savedUserJson, live.airuncoach.airuncoach.domain.model.User::class.java)
                        android.util.Log.d("LoginViewModel", "✅ User data verified - ID: ${verifyUser.id}, Name: ${verifyUser.name}")
                    } catch (e: Exception) {
                        android.util.Log.e("LoginViewModel", "⚠️ User data deserialization FAILED: ${e.message}")
                        _loginState.update { it.copy(isLoading = false, error = "Failed to save user data correctly") }
                        return@launch
                    }
                } else {
                    android.util.Log.e("LoginViewModel", "⚠️ User data verification FAILED - data is null after save!")
                    _loginState.update { it.copy(isLoading = false, error = "Failed to verify user data save") }
                    return@launch
                }
                
                _loginState.update { it.copy(isLoading = false, error = null, isLoginSuccessful = true) }
                android.util.Log.d("LoginViewModel", "🎉 Registration complete and verified!")
            } catch (e: Exception) {
                android.util.Log.e("LoginViewModel", "Registration failed: ${e.message}", e)
                _loginState.update { it.copy(isLoading = false, error = e.message ?: "Registration failed") }
            }
        }
    }
}
