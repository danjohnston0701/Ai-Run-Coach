package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.LoginRequest
import live.airuncoach.airuncoach.network.model.RegisterRequest

class LoginViewModel(
    private val context: Context,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _loginState = MutableStateFlow<LoginState>(LoginState.Idle)
    val loginState: StateFlow<LoginState> = _loginState

    private val retrofitClient = RetrofitClient(context, sessionManager)
    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()

    fun login(email: String, password: String) {
        if (!validateInput(email, password)) {
            _loginState.value = LoginState.Error("Please fill in all fields")
            return
        }

        viewModelScope.launch {
            _loginState.value = LoginState.Loading
            try {
                android.util.Log.d("LoginViewModel", "🔐 Attempting login for: $email")
                val response = retrofitClient.instance.login(LoginRequest(email, password))
                
                if (response.user == null || response.token == null) {
                    android.util.Log.e("LoginViewModel", "❌ Invalid response: user or token is null")
                    _loginState.value = LoginState.Error("Invalid response from server")
                    return@launch
                }
                
                android.util.Log.d("LoginViewModel", "✅ Login successful: ${response.user.email}")
                android.util.Log.d("LoginViewModel", "🔑 Got Bearer token: ${response.token.take(20)}...")
                
                // Save token for Bearer authentication
                sessionManager.saveAuthToken(response.token)
                
                // Save user to SharedPreferences
                saveUserToPrefs(response.user)
                
                _loginState.value = LoginState.Success
            } catch (e: Exception) {
                android.util.Log.e("LoginViewModel", "❌ Login failed: ${e.message}", e)
                _loginState.value = LoginState.Error("Login failed. Please check your credentials.")
            }
        }
    }

    fun register(name: String, email: String, password: String, confirmPassword: String) {
        if (!validateRegistration(name, email, password, confirmPassword)) {
            return
        }

        viewModelScope.launch {
            _loginState.value = LoginState.Loading
            try {
                val response = retrofitClient.instance.register(RegisterRequest(name, email, password))
                
                if (response.user == null || response.token == null) {
                    _loginState.value = LoginState.Error("Invalid response from server")
                    return@launch
                }
                
                // Save token for Bearer authentication
                sessionManager.saveAuthToken(response.token)
                
                // Save user to SharedPreferences
                saveUserToPrefs(response.user)
                
                _loginState.value = LoginState.Success
            } catch (e: Exception) {
                _loginState.value = LoginState.Error(e.message ?: "Registration failed. Please try again.")
            }
        }
    }

    private fun validateInput(email: String, password: String): Boolean {
        return email.isNotBlank() && password.isNotBlank()
    }

    private fun validateRegistration(name: String, email: String, password: String, confirmPassword: String): Boolean {
        when {
            name.isBlank() -> {
                _loginState.value = LoginState.Error("Name is required")
                return false
            }
            email.isBlank() -> {
                _loginState.value = LoginState.Error("Email is required")
                return false
            }
            !android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches() -> {
                _loginState.value = LoginState.Error("Please enter a valid email")
                return false
            }
            password.isBlank() -> {
                _loginState.value = LoginState.Error("Password is required")
                return false
            }
            password.length < 6 -> {
                _loginState.value = LoginState.Error("Password must be at least 6 characters")
                return false
            }
            password != confirmPassword -> {
                _loginState.value = LoginState.Error("Passwords do not match")
                return false
            }
        }
        return true
    }

    private fun saveUserToPrefs(user: User) {
        val userJson = gson.toJson(user)
        sharedPrefs.edit().putString("user", userJson).apply()
    }

    fun resetState() {
        _loginState.value = LoginState.Idle
    }
}

sealed class LoginState {
    object Idle : LoginState()
    object Loading : LoginState()
    object Success : LoginState()
    data class Error(val message: String) : LoginState()
}

class LoginViewModelFactory(
    private val context: Context,
    private val sessionManager: SessionManager
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(LoginViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return LoginViewModel(context, sessionManager) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
