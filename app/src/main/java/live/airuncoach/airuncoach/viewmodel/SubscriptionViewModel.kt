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
import java.time.LocalDate
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

    // ── Trial lifecycle helpers ──────────────────────────────────────────────

    /**
     * Read the cached User object from SharedPreferences.
     * Returns null if not found or parsing fails.
     */
    private fun getCachedUser(): User? = try {
        val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
        val userJson = sharedPrefs.getString("user", null) ?: return null
        Gson().fromJson(userJson, User::class.java)
    } catch (_: Exception) {
        null
    }

    /**
     * Returns the trial expiry date for the current user, or null if unavailable.
     * The server sets [User.trialExpiresAt] to accountCreatedAt + 14 days on sign-up.
     * Falls back to null (which means we cannot determine expiry — we treat as active).
     */
    fun getTrialExpiresAt(): LocalDate? {
        val user = getCachedUser() ?: return null
        val raw = user.trialExpiresAt ?: return null
        return try {
            // ISO-8601: "2025-01-10" or "2025-01-10T00:00:00.000Z" — take first 10 chars
            LocalDate.parse(raw.take(10))
        } catch (_: Exception) {
            null
        }
    }

    /**
     * True if the user's 14-day free trial has expired AND they have not upgraded.
     *
     * Paid users (lite/standard) are never considered expired — this only applies to
     * the "free" tier once the trial window has closed.
     *
     * Also respects the server-set [User.subscriptionStatus] == "trial_expired" flag
     * as an authoritative override (e.g. admin enforcement or immediate expiry).
     */
    fun isTrialExpired(): Boolean {
        val tier = getSubscriptionTier()
        if (tier != "free") return false  // Paid subscribers always have access

        val user = getCachedUser()

        // Server can explicitly flag the account as expired
        if (user?.subscriptionStatus == "trial_expired") return true

        // Client-side date check against trialExpiresAt
        val expiryDate = getTrialExpiresAt() ?: return false
        return LocalDate.now().isAfter(expiryDate)
    }

    /**
     * True if the user is currently within their 14-day free trial window (not yet expired).
     */
    fun isInActiveTrial(): Boolean {
        if (getSubscriptionTier() != "free") return false
        val expiry = getTrialExpiresAt() ?: return true  // No date → assume active
        return !LocalDate.now().isAfter(expiry)
    }

    /**
     * Returns the number of days remaining in the trial (0 if expired or no date available).
     */
    fun trialDaysRemaining(): Int {
        val expiry = getTrialExpiresAt() ?: return 0
        val today = LocalDate.now()
        if (today.isAfter(expiry)) return 0
        return (expiry.toEpochDay() - today.toEpochDay()).toInt()
    }

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
