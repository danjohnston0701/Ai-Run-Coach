package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.JsonParser
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.CreateSingleSessionRequest
import live.airuncoach.airuncoach.network.model.CreateSingleSessionResponse
import live.airuncoach.airuncoach.network.model.SingleSessionItem
import retrofit2.HttpException
import javax.inject.Inject

/** Allowance for one-off AI sessions this month (GET /api/features/singleSessionsGenerated/available). */
data class SingleSessionAllowance(
    val isAvailable: Boolean,
    val remaining: Int?,
    val limit: Int?,
    val isUnlimited: Boolean,
    val notIncluded: Boolean,
    val message: String?,
)

sealed class SingleSessionCreateState {
    object Idle : SingleSessionCreateState()
    object Designing : SingleSessionCreateState()
    data class Ready(val result: CreateSingleSessionResponse) : SingleSessionCreateState()
    /** [upgradeRequired] = not on the runner's plan or the month's allowance is used. */
    data class Failed(val message: String, val upgradeRequired: Boolean) : SingleSessionCreateState()
}

/**
 * One-off AI-designed sessions (server/routes-single-sessions.ts): list, allowance, create,
 * delete. The designed session opens in the normal WorkoutDetailScreen, whose prepare-coaching
 * call generates its live coaching exactly as it does for a plan session.
 */
@HiltViewModel
class SingleSessionViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _sessions = MutableStateFlow<List<SingleSessionItem>?>(null)
    val sessions: StateFlow<List<SingleSessionItem>?> = _sessions.asStateFlow()

    private val _listError = MutableStateFlow<String?>(null)
    val listError: StateFlow<String?> = _listError.asStateFlow()

    private val _allowance = MutableStateFlow<SingleSessionAllowance?>(null)
    val allowance: StateFlow<SingleSessionAllowance?> = _allowance.asStateFlow()

    private val _createState = MutableStateFlow<SingleSessionCreateState>(SingleSessionCreateState.Idle)
    val createState: StateFlow<SingleSessionCreateState> = _createState.asStateFlow()

    fun loadSessions() {
        viewModelScope.launch {
            _listError.value = null
            try {
                _sessions.value = apiService.getSingleSessions()
            } catch (e: Exception) {
                Log.w("SingleSessionVM", "Load sessions failed: ${e.message}")
                _listError.value = "Couldn't load your sessions."
                if (_sessions.value == null) _sessions.value = emptyList()
            }
        }
    }

    fun loadAllowance() {
        viewModelScope.launch {
            try {
                val r = apiService.checkFeatureAvailability("singleSessionsGenerated")
                _allowance.value = SingleSessionAllowance(
                    isAvailable = r.isAvailable,
                    remaining = r.remaining,
                    limit = r.limit,
                    isUnlimited = r.isUnlimited == true,
                    notIncluded = r.notIncluded ?: (r.limit == 0 && r.isUnlimited != true),
                    message = r.message,
                )
            } catch (e: Exception) {
                // Never block on the check — the create call enforces the allowance anyway.
                Log.w("SingleSessionVM", "Allowance check failed: ${e.message}")
                _allowance.value = null
            }
        }
    }

    fun create(workoutType: String, durationMinutes: Int?, distanceKm: Double?, notes: String?) {
        if (_createState.value is SingleSessionCreateState.Designing) return
        _createState.value = SingleSessionCreateState.Designing
        viewModelScope.launch {
            _createState.value = try {
                val result = apiService.createSingleSession(
                    CreateSingleSessionRequest(
                        workoutType = workoutType,
                        durationMinutes = durationMinutes,
                        distanceKm = distanceKm,
                        notes = notes?.trim()?.takeIf { it.isNotEmpty() },
                    )
                )
                loadAllowance()
                SingleSessionCreateState.Ready(result)
            } catch (e: HttpException) {
                val body = try { e.response()?.errorBody()?.string() } catch (_: Exception) { null }
                val json = body?.let { runCatching { JsonParser.parseString(it).asJsonObject }.getOrNull() }
                val message = json?.get("message")?.takeIf { !it.isJsonNull }?.asString
                    ?: "Your coach couldn't design the session. Please try again."
                val upgrade = e.code() == 402 || e.code() == 403 || e.code() == 429
                SingleSessionCreateState.Failed(message, upgrade)
            } catch (e: Exception) {
                Log.w("SingleSessionVM", "Create failed: ${e.message}")
                SingleSessionCreateState.Failed("Couldn't reach your coach. Check your connection and try again.", false)
            }
        }
    }

    fun resetCreate() {
        _createState.value = SingleSessionCreateState.Idle
    }

    fun delete(workoutId: String) {
        viewModelScope.launch {
            try {
                apiService.deleteSingleSession(workoutId)
                _sessions.value = _sessions.value?.filterNot { it.workout.id == workoutId }
            } catch (e: Exception) {
                Log.w("SingleSessionVM", "Delete failed: ${e.message}")
            }
        }
    }
}
