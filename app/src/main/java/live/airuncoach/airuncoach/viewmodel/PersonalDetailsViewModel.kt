
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.UpdateUserRequest
import live.airuncoach.airuncoach.utils.TargetDistance
import live.airuncoach.airuncoach.utils.WeightUnit
import live.airuncoach.airuncoach.utils.WeightUnits
import kotlin.math.roundToInt

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

    /** Weight as typed, in [weightUnit] (the server stores kilograms — converted on save). */
    private val _weight = MutableStateFlow("")
    val weight: StateFlow<String> = _weight.asStateFlow()

    private val _weightUnit = MutableStateFlow(WeightUnit.KG)
    val weightUnit: StateFlow<WeightUnit> = _weightUnit.asStateFlow()

    private val _height = MutableStateFlow("")
    val height: StateFlow<String> = _height.asStateFlow()

    private val _defaultSessionType = MutableStateFlow("Run")
    val defaultSessionType: StateFlow<String> = _defaultSessionType.asStateFlow()

    /** 0–3; see [User.targetDistanceDecimals]. */
    private val _targetDistanceDecimals = MutableStateFlow(0)
    val targetDistanceDecimals: StateFlow<Int> = _targetDistanceDecimals.asStateFlow()

    /** Slider window for the target distance, held as text while editing (whole km). */
    private val _distanceMinKm = MutableStateFlow(TargetDistance.DEFAULT_MIN_KM.toString())
    val distanceMinKm: StateFlow<String> = _distanceMinKm.asStateFlow()
    private val _distanceMaxKm = MutableStateFlow(TargetDistance.DEFAULT_MAX_KM.toString())
    val distanceMaxKm: StateFlow<String> = _distanceMaxKm.asStateFlow()

    /** Null when the min/max/decimals combination is valid; otherwise the reason Save is blocked. */
    val distanceRangeError: StateFlow<String?> = combine(
        _distanceMinKm, _distanceMaxKm, _targetDistanceDecimals
    ) { min, max, decimals ->
        TargetDistance.rangeError(min.toIntOrNull(), max.toIntOrNull(), decimals)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        loadUserDetails()
    }

    private fun loadUserDetails() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            val user = gson.fromJson(userJson, User::class.java)
            _name.value = user.name
            _email.value = user.email
            _dateOfBirth.value = user.dob?.let(::toDigitsOnlyDob) ?: ""
            _gender.value = if (user.gender == "Non-binary") {
                "Prefer not to say"
            } else {
                user.gender ?: ""
            }
            _weightUnit.value = WeightUnits.load(sharedPrefs, user.country)
            _weight.value = WeightUnits.format(user.weight, _weightUnit.value)
            _height.value = user.height?.toString() ?: ""
            _defaultSessionType.value = when (user.defaultSessionType?.lowercase()) {
                "walk" -> "Walk"
                else -> "Run"
            }
            _targetDistanceDecimals.value = (user.targetDistanceDecimals ?: 0).coerceIn(0, 3)
            // Legacy rows carry the 0–50 schema default; show it as the 1–50 the slider uses.
            _distanceMinKm.value = user.distanceMinKm.roundToInt()
                .coerceAtLeast(TargetDistance.DEFAULT_MIN_KM).toString()
            _distanceMaxKm.value = user.distanceMaxKm.roundToInt().toString()
        }
    }

    fun onNameChanged(name: String) {
        _name.value = name
    }

    fun onEmailChanged(email: String) {
        _email.value = email
    }

    fun onDateOfBirthChanged(dob: String) {
        // Store only digits — visual transformation handles formatting display
        val digitsOnly = dob.filter { it.isDigit() }.take(8)
        _dateOfBirth.value = digitsOnly
    }
    
    fun onGenderChanged(gender: String) {
        _gender.value = gender
    }

    fun onWeightUnitChanged(unit: WeightUnit) {
        _weight.value = WeightUnits.convertText(_weight.value, _weightUnit.value, unit)
        _weightUnit.value = unit
        WeightUnits.save(sharedPrefs, unit)
    }

    fun onWeightChanged(weight: String) {
        _weight.value = weight
    }

    fun onHeightChanged(height: String) {
        _height.value = height
    }

    fun onDefaultSessionTypeChanged(sessionType: String) {
        _defaultSessionType.value = sessionType
    }

    fun onTargetDistanceDecimalsChanged(decimals: Int) {
        _targetDistanceDecimals.value = decimals.coerceIn(0, 3)
        // Tightening precision shrinks the allowed slider span; pull the max in rather than
        // leave the user with a Save button that's suddenly blocked.
        val min = _distanceMinKm.value.toIntOrNull() ?: return
        val max = _distanceMaxKm.value.toIntOrNull() ?: return
        val span = TargetDistance.maxSliderSpanKm(decimals)
        if (!TargetDistance.usesTextEntry(decimals) && max - min > span) {
            _distanceMaxKm.value = (min + span).toString()
        }
    }

    fun onDistanceMinKmChanged(text: String) {
        if (text.length <= 4) _distanceMinKm.value = text.filter { it.isDigit() }
    }

    fun onDistanceMaxKmChanged(text: String) {
        if (text.length <= 4) _distanceMaxKm.value = text.filter { it.isDigit() }
    }

    suspend fun saveDetails() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            val user = gson.fromJson(userJson, User::class.java)
            val request = UpdateUserRequest(
                name = _name.value,
                email = _email.value,
                dob = formatDateOfBirth(_dateOfBirth.value),
                gender = _gender.value.ifBlank { null },
                weight = WeightUnits.toKg(_weight.value, _weightUnit.value),
                height = _height.value.toDoubleOrNull(),
                fitnessLevel = null,
                distanceScale = null,
                defaultSessionType = _defaultSessionType.value,
                targetDistanceDecimals = _targetDistanceDecimals.value,
                // Only send a range that passed validation; otherwise keep what's stored.
                distanceMinKm = if (distanceRangeError.value == null) _distanceMinKm.value.toFloatOrNull() else null,
                distanceMaxKm = if (distanceRangeError.value == null) _distanceMaxKm.value.toFloatOrNull() else null
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

    /**
     * Formats a date of birth string from digits-only (ddmmyyyy) to dd/mm/yyyy format.
     * Returns null if the input is blank or invalid.
     */
    private fun formatDateOfBirth(digitsOnly: String): String? {
        if (digitsOnly.isBlank() || digitsOnly.length != 8) {
            return null
        }
        return "${digitsOnly.take(2)}/${digitsOnly.drop(2).take(2)}/${digitsOnly.drop(4)}"
    }

    private fun toDigitsOnlyDob(value: String): String {
        val parts = value.replace('-', '/').split('/')
        return if (parts.size == 3 && parts[0].length == 4) {
            "${parts[2].padStart(2, '0')}${parts[1].padStart(2, '0')}${parts[0]}"
        } else {
            value.filter { it.isDigit() }.take(8)
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
