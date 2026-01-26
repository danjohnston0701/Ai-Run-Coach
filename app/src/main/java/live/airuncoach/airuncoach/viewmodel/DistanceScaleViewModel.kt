
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.UpdateUserRequest

class DistanceScaleViewModel(private val context: Context) : ViewModel() {

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val sessionManager = SessionManager(context)
    private val apiService = RetrofitClient(context, sessionManager).instance

    private val _distanceScale = MutableStateFlow("Kilometers")
    val distanceScale: StateFlow<String> = _distanceScale.asStateFlow()

    val distanceScales = listOf("Kilometers", "Miles")

    init {
        loadDistanceScale()
    }

    private fun loadDistanceScale() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            val user = gson.fromJson(userJson, User::class.java)
            _distanceScale.value = user.distanceScale ?: "Kilometers"
        }
    }

    fun onDistanceScaleChanged(distanceScale: String) {
        _distanceScale.value = distanceScale
    }

    fun saveDistanceScale() {
        viewModelScope.launch {
            val userJson = sharedPrefs.getString("user", null)
            if (userJson != null) {
                val user = gson.fromJson(userJson, User::class.java)
                val request = UpdateUserRequest(
                    name = null,
                    email = null,
                    dob = null,
                    gender = null,
                    weight = null,
                    height = null,
                    fitnessLevel = null,
                    distanceScale = _distanceScale.value
                )
                try {
                    val updatedUser = apiService.updateUser(user.id, request)
                    val updatedUserJson = gson.toJson(updatedUser)
                    sharedPrefs.edit().putString("user", updatedUserJson).apply()
                } catch (e: Exception) {
                    // Handle error
                }
            }
        }
    }
}

class DistanceScaleViewModelFactory(
    private val context: Context
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(DistanceScaleViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return DistanceScaleViewModel(context) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
