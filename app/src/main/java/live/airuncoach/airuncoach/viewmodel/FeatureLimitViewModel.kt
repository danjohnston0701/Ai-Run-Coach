package live.airuncoach.airuncoach.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import java.time.LocalDate
import javax.inject.Inject

/**
 * Feature Limit ViewModel
 *
 * Manages pre-checks for feature availability before showing setup screens.
 * Allows users to see their usage limits and renewal dates upfront,
 * preventing wasted time on forms when they've hit their limit.
 */
@HiltViewModel
class FeatureLimitViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    // ── AI Plan Availability ────────────────────────────────────────────────
    private val _aiPlanAvailability = MutableStateFlow<AiPlanAvailability?>(null)
    val aiPlanAvailability: StateFlow<AiPlanAvailability?> = _aiPlanAvailability.asStateFlow()

    private val _aiPlanLoading = MutableStateFlow(false)
    val aiPlanLoading: StateFlow<Boolean> = _aiPlanLoading.asStateFlow()

    private val _aiPlanError = MutableStateFlow<String?>(null)
    val aiPlanError: StateFlow<String?> = _aiPlanError.asStateFlow()

    // ── Run Route Availability ──────────────────────────────────────────────
    private val _runRouteAvailability = MutableStateFlow<RunRouteAvailability?>(null)
    val runRouteAvailability: StateFlow<RunRouteAvailability?> = _runRouteAvailability.asStateFlow()

    private val _runRouteLoading = MutableStateFlow(false)
    val runRouteLoading: StateFlow<Boolean> = _runRouteLoading.asStateFlow()

    private val _runRouteError = MutableStateFlow<String?>(null)
    val runRouteError: StateFlow<String?> = _runRouteError.asStateFlow()

    // ── Public Methods ──────────────────────────────────────────────────────

    /**
     * Check if user can create an AI training plan
     */
    fun checkAiPlanAvailability() {
        viewModelScope.launch {
            _aiPlanLoading.value = true
            _aiPlanError.value = null

            try {
                val response = apiService.checkFeatureAvailability("trainingPlansGenerated")
                _aiPlanAvailability.value = AiPlanAvailability(
                    isAvailable = response.isAvailable,
                    remaining = response.remaining ?: 0,
                    limit = response.limit ?: 0,
                    used = response.used ?: 0,
                    renewalDate = response.renewalDate?.let { parseDate(it) },
                    isUnlimited = response.isUnlimited ?: false
                )
            } catch (e: Exception) {
                _aiPlanError.value = e.message ?: "Failed to check availability"
                // Default to allowing access on error (don't block user)
                _aiPlanAvailability.value = AiPlanAvailability(
                    isAvailable = true,
                    remaining = 999,
                    limit = 999,
                    used = 0,
                    renewalDate = null,
                    isUnlimited = true
                )
            } finally {
                _aiPlanLoading.value = false
            }
        }
    }

    /**
     * Check if user can create a run route
     */
    fun checkRunRouteAvailability() {
        viewModelScope.launch {
            _runRouteLoading.value = true
            _runRouteError.value = null

            try {
                val response = apiService.checkFeatureAvailability("routesGenerated")
                _runRouteAvailability.value = RunRouteAvailability(
                    isAvailable = response.isAvailable,
                    remaining = response.remaining ?: 0,
                    limit = response.limit ?: 0,
                    used = response.used ?: 0,
                    renewalDate = response.renewalDate?.let { parseDate(it) },
                    isUnlimited = response.isUnlimited ?: false
                )
            } catch (e: Exception) {
                _runRouteError.value = e.message ?: "Failed to check availability"
                // Default to allowing access on error
                _runRouteAvailability.value = RunRouteAvailability(
                    isAvailable = true,
                    remaining = 999,
                    limit = 999,
                    used = 0,
                    renewalDate = null,
                    isUnlimited = true
                )
            } finally {
                _runRouteLoading.value = false
            }
        }
    }

    /**
     * Reset AI plan availability state
     */
    fun resetAiPlanAvailability() {
        _aiPlanAvailability.value = null
        _aiPlanError.value = null
        _aiPlanLoading.value = false
    }

    /**
     * Reset run route availability state
     */
    fun resetRunRouteAvailability() {
        _runRouteAvailability.value = null
        _runRouteError.value = null
        _runRouteLoading.value = false
    }

    // ── Helper Methods ──────────────────────────────────────────────────────

    private fun parseDate(dateString: String): LocalDate? {
        return try {
            LocalDate.parse(dateString)
        } catch (e: Exception) {
            null
        }
    }
}

// ── Data Classes ────────────────────────────────────────────────────────────

/**
 * AI Plan Availability Status
 */
data class AiPlanAvailability(
    val isAvailable: Boolean,           // Can create more plans?
    val remaining: Int = 0,             // How many left this month
    val limit: Int = 0,                 // Total allowed this month
    val used: Int = 0,                  // Already used
    val renewalDate: LocalDate? = null, // When subscription resets
    val isUnlimited: Boolean = false    // Unlimited access?
) {
    val message: String
        get() = when {
            isUnlimited -> "You have unlimited access to AI Plan Generation"
            remaining > 0 -> "You have $remaining of $limit AI plans remaining"
            else -> "You've used all $limit of your monthly AI plans"
        }

    val progressText: String
        get() = "$used / $limit plans used"
}

/**
 * Run Route Availability Status
 */
data class RunRouteAvailability(
    val isAvailable: Boolean,           // Can create more routes?
    val remaining: Int = 0,             // How many left this month
    val limit: Int = 0,                 // Total allowed this month
    val used: Int = 0,                  // Already used
    val renewalDate: LocalDate? = null, // When subscription resets
    val isUnlimited: Boolean = false    // Unlimited access?
) {
    val message: String
        get() = when {
            isUnlimited -> "You have unlimited access to Run Route Creation"
            remaining > 0 -> "You have $remaining of $limit run routes remaining"
            else -> "You've used all $limit of your monthly run routes"
        }

    val progressText: String
        get() = "$used / $limit routes created"
}

/**
 * Feature Availability Response from API
 */
data class FeatureAvailabilityResponse(
    val isAvailable: Boolean,
    val remaining: Int? = null,
    val limit: Int? = null,
    val used: Int? = null,
    val renewalDate: String? = null,
    val isUnlimited: Boolean? = false,
    val message: String? = null
)
