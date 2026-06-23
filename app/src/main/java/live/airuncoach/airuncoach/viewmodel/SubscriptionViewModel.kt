package live.airuncoach.airuncoach.viewmodel

import android.app.Activity
import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.billing.BillingManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.ApiService
import javax.inject.Inject

/**
 * ViewModel for managing subscription and premium feature UI.
 */
@HiltViewModel
class SubscriptionViewModel @Inject constructor(
    private val billingManager: BillingManager,
    private val apiService: ApiService,
    @ApplicationContext private val context: Context
) : ViewModel() {

    val subscriptions: StateFlow<List<ProductDetails>> = billingManager.subscriptionList
    val userPurchases: StateFlow<List<Purchase>> = billingManager.userPurchases
    val billingConnectionState: StateFlow<Boolean> = billingManager.billingConnectionState
    
    // Usage data state
    private val _usageState = MutableStateFlow<UsageState>(UsageState.Loading)
    val usageState: StateFlow<UsageState> = _usageState.asStateFlow()

    init {
        viewModelScope.launch {
            billingManager.initialize()
        }
    }

    /**
     * Launch the purchase flow for a subscription.
     */
    fun purchaseSubscription(activity: Activity, productDetails: ProductDetails) {
        viewModelScope.launch {
            billingManager.launchBillingFlow(activity, productDetails)
        }
    }

    /**
     * Check if user has active premium subscription.
     * Uses the same database-first priority as getSubscriptionTier().
     */
    fun isPremiumUser(): Boolean {
        val tier = getSubscriptionTier()
        return tier == "lite" || tier == "standard"
    }

    /**
     * Get the user's active subscription product ID.
     */
    fun getActiveSubscriptionId(): String? {
        return userPurchases.value.firstOrNull { purchase ->
            purchase.purchaseState == Purchase.PurchaseState.PURCHASED
        }?.products?.firstOrNull()
    }

    /**
     * Get the user's current subscription tier: "free", "lite", or "standard".
     *
     * Source of truth priority:
     * 1. Database-synced tier from the user profile (reflects server-side state:
     *    purchases, admin overrides, promo codes, free trials etc.)
     * 2. Google Play local purchase state as a fallback (e.g. first launch before
     *    the profile has been fetched, or the profile is stale / missing).
     *
     * The database is kept in sync by the backend via Google Play RTDN webhooks,
     * so it will always reflect the verified, canonical subscription state once
     * the user has logged in and their profile has been downloaded.
     */
    fun getSubscriptionTier(): String {
        // 1. Try the database-synced tier from the locally-cached user profile
        try {
            val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
            val userJson = sharedPrefs.getString("user", null)
            if (userJson != null) {
                val user = Gson().fromJson(userJson, User::class.java)
                val dbTier = user?.subscriptionTier?.lowercase()?.trim()
                if (!dbTier.isNullOrEmpty() && dbTier != "null") {
                    return dbTier
                }
            }
        } catch (_: Exception) {
            // Fall through to Google Play check
        }

        // 2. Fall back to Google Play purchase state
        return billingManager.getSubscriptionTier()
    }

    /**
     * Get the AI Coaching Plans limit for the user's tier.
     */
    fun getAiCoachingPlansLimit(): Int = billingManager.getAiCoachingPlansLimit()
    
    /**
     * Load current usage data from the API
     */
    fun loadUsageData() {
        viewModelScope.launch {
            try {
                _usageState.value = UsageState.Loading
                val response = apiService.getCurrentUsage()
                _usageState.value = UsageState.Success(
                    UsageData(
                        tier = response.tier,
                        yearMonth = response.yearMonth,
                        aiCoachingKmUsed = response.usage.aiCoachingKm.toInt(),
                        aiCoachingKmLimit = response.limits.aiCoachingKm?.toInt() ?: -1,
                        trainingPlansUsed = response.usage.trainingPlansGenerated,
                        trainingPlansLimit = response.limits.trainingPlansGenerated ?: -1,
                        routesGeneratedUsed = response.usage.routesGenerated,
                        routesGeneratedLimit = response.limits.routesGenerated ?: -1,
                        postRunAnalysesUsed = response.usage.postRunAnalyses,
                        postRunAnalysesLimit = response.limits.postRunAnalyses ?: -1
                    )
                )
            } catch (e: Exception) {
                _usageState.value = UsageState.Error(e.message ?: "Unknown error")
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        billingManager.endConnection()
    }
    
    // ── State and Data Classes ───────────────────────────────────────────
    
    sealed class UsageState {
        object Loading : UsageState()
        data class Success(val usage: UsageData) : UsageState()
        data class Error(val message: String) : UsageState()
    }
    
    data class UsageData(
        val tier: String,
        val yearMonth: String,
        val aiCoachingKmUsed: Int,
        val aiCoachingKmLimit: Int,
        val trainingPlansUsed: Int,
        val trainingPlansLimit: Int,
        val routesGeneratedUsed: Int,
        val routesGeneratedLimit: Int,
        val postRunAnalysesUsed: Int,
        val postRunAnalysesLimit: Int
    )
}
