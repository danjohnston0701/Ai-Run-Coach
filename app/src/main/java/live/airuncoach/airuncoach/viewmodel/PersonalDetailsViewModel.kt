
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.UpdateUserRequest

class PersonalDetailsViewModel(private val context: Context) : ViewModel() {

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val sessionManager = SessionManager(context)
    private val apiService = RetrofitClient(context, sessionManager).instance

    private val _name = MutableStateFlow("")
    val name: StateFlow<String> = _name.asStateFlow()

    private val _email = MutableStateFlow("")
    val email: StateFlow<String> = _email.asStateFlow()
    
    private val _dateOfBirth = MutableStateFlow("")
    val dateOfBirth: StateFlow<String> = _dateOfBirth.asStateFlow()
    
    private val _gender = MutableStateFlow("")
    val gender: StateFlow<String> = _gender.asStateFlow()

    private val _weight = MutableStateFlow("")
    val weight: StateFlow<String> = _weight.asStateFlow()

    private val _height = MutableStateFlow("")
    val height: StateFlow<String> = _height.asStateFlow()


    init {
        loadUserDetails()
    }

    private fun loadUserDetails() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            val user = gson.fromJson(userJson, User::class.java)
            _name.value = user.name
            _email.value = user.email
            _dateOfBirth.value = user.dob ?: ""
            _gender.value = user.gender ?: ""
            _weight.value = user.weight?.toString() ?: ""
            _height.value = user.height?.toString() ?: ""
        }
    }

    fun onNameChanged(name: String) {
        _name.value = name
    }

    fun onEmailChanged(email: String) {
        _email.value = email
    }

    fun onDateOfBirthChanged(dob: String) {
        // Format as dd/mm/yyyy
        val digitsOnly = dob.filter { it.isDigit() }
        val formatted = when {
            digitsOnly.length <= 2 -> digitsOnly
            digitsOnly.length <= 4 -> "${digitsOnly.substring(0, 2)}/${digitsOnly.substring(2)}"
            digitsOnly.length <= 8 -> "${digitsOnly.substring(0, 2)}/${digitsOnly.substring(2, 4)}/${digitsOnly.substring(4)}"
            else -> "${digitsOnly.substring(0, 2)}/${digitsOnly.substring(2, 4)}/${digitsOnly.substring(4, 8)}"
        }
        _dateOfBirth.value = formatted
    }
    
    fun onGenderChanged(gender: String) {
        _gender.value = gender
    }

    fun onWeightChanged(weight: String) {
        _weight.value = weight
    }

    fun onHeightChanged(height: String) {
        _height.value = height
    }

    suspend fun saveDetails() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            val user = gson.fromJson(userJson, User::class.java)
            val request = UpdateUserRequest(
                name = _name.value,
                email = _email.value,
                dob = _dateOfBirth.value.ifBlank { null },
                gender = _gender.value.ifBlank { null },
                weight = _weight.value.toDoubleOrNull(),
                height = _height.value.toDoubleOrNull(),
                fitnessLevel = null,
                distanceScale = null
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

class PersonalDetailsViewModelFactory(
    private val context: Context
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(PersonalDetailsViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return PersonalDetailsViewModel(context) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
