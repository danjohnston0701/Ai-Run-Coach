
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import androidx.core.content.edit
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.AiConsentManager
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.UpdateUserRequest

data class Plan(val name: String, val price: String, val discount: String? = null)

sealed class DeleteAccountState {
    object Idle : DeleteAccountState()
    object Loading : DeleteAccountState()
    object Success : DeleteAccountState()
    data class Error(val message: String) : DeleteAccountState()
}

sealed class DowngradeState {
    object Idle : DowngradeState()
    object Loading : DowngradeState()
    object Success : DowngradeState()
    data class Error(val message: String) : DowngradeState()
}

class SubscriptionViewModel(private val context: Context) : ViewModel() {

    private val sessionManager = SessionManager(context)
    private val consentManager = AiConsentManager(context)
    private val apiService = RetrofitClient(context, sessionManager).instance
    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()

    private val _plans = MutableStateFlow<List<Plan>>(emptyList())
    val plans: StateFlow<List<Plan>> = _plans.asStateFlow()

    private val _selectedPlan = MutableStateFlow<Plan?>(null)
    val selectedPlan: StateFlow<Plan?> = _selectedPlan.asStateFlow()

    private val _deleteAccountState = MutableStateFlow<DeleteAccountState>(DeleteAccountState.Idle)
    val deleteAccountState: StateFlow<DeleteAccountState> = _deleteAccountState.asStateFlow()

    private val _downgradeState = MutableStateFlow<DowngradeState>(DowngradeState.Idle)
    val downgradeState: StateFlow<DowngradeState> = _downgradeState.asStateFlow()

    /** True when the user's stored subscription tier is a paid plan. */
    val isOnPaidPlan: Boolean
        get() {
            val userJson = sharedPrefs.getString("user", null) ?: return false
            return try {
                val user = gson.fromJson(userJson, User::class.java)
                val tier = user.subscriptionTier?.lowercase()
                // Treat null / "free" / "none" as free; anything else (e.g. "premium",
                // "monthly", "yearly", "pro") is considered a paid plan.
                tier != null && tier != "free" && tier != "none"
            } catch (e: Exception) {
                false
            }
        }

    init {
        loadPlans()
    }

    private fun loadPlans() {
        val planList = listOf(
            Plan("Monthly", "$9.99/month"),
            Plan("Yearly", "$79.99/year", "Save 33%")
        )
        _plans.value = planList
        _selectedPlan.value = planList.last()
    }

    fun selectPlan(plan: Plan) {
        _selectedPlan.value = plan
    }

    /**
     * Permanently deletes the user account.
     *
     * Calls DELETE /api/users/{userId}, then clears local session + consent data
     * and triggers navigation back to login via [onAccountDeleted].
     */
    fun deleteAccount(onAccountDeleted: () -> Unit) {
        val userId = sessionManager.getUserId() ?: run {
            _deleteAccountState.value = DeleteAccountState.Error("Unable to identify account. Please sign in again.")
            return
        }

        viewModelScope.launch {
            _deleteAccountState.value = DeleteAccountState.Loading
            try {
                val response = apiService.deleteUser(userId)
                if (response.isSuccessful) {
                    // Clear all local data
                    sessionManager.clearAuthToken()
                    consentManager.clearConsent()
                    sharedPrefs.edit { clear() }
                    context.getSharedPreferences("coaching_feature_prefs", Context.MODE_PRIVATE).edit { clear() }

                    _deleteAccountState.value = DeleteAccountState.Success
                    onAccountDeleted()
                } else {
                    _deleteAccountState.value = DeleteAccountState.Error(
                        "Failed to delete account (${response.code()}). Please try again."
                    )
                }
            } catch (e: Exception) {
                _deleteAccountState.value = DeleteAccountState.Error(
                    e.message ?: "An unexpected error occurred. Please check your connection."
                )
            }
        }
    }

    /**
     * Downgrades the user's subscription to the free tier without deleting their account.
     *
     * Updates the user record server-side then refreshes the local cached User object.
     */
    fun downgradeToFree(onDowngraded: () -> Unit) {
        val userId = sessionManager.getUserId() ?: run {
            _downgradeState.value = DowngradeState.Error("Unable to identify account. Please sign in again.")
            return
        }

        viewModelScope.launch {
            _downgradeState.value = DowngradeState.Loading
            try {
                val updatedUser = apiService.updateUser(
                    userId,
                    UpdateUserRequest(
                        subscriptionTier = "free",
                        subscriptionStatus = "cancelled"
                    )
                )
                // Refresh cached user so isOnPaidPlan re-evaluates correctly
                sharedPrefs.edit { putString("user", gson.toJson(updatedUser)) }
                _downgradeState.value = DowngradeState.Success
                onDowngraded()
            } catch (ex: Exception) {
                _downgradeState.value = DowngradeState.Error(
                    ex.message ?: "Failed to downgrade subscription. Please try again."
                )
            }
        }
    }

    fun resetDeleteState() {
        _deleteAccountState.value = DeleteAccountState.Idle
    }

    fun resetDowngradeState() {
        _downgradeState.value = DowngradeState.Idle
    }
}

class SubscriptionViewModelFactory(private val context: Context) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return SubscriptionViewModel(context) as T
    }
}
