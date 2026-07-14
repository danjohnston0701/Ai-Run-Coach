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
import live.airuncoach.airuncoach.network.model.GooglePlayPricingResponse
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

    /**
     * Reactive subscription tier — always reflects the most up-to-date value
     * (database cache > Google Play fallback).  Collects from
     * [BillingManager.purchaseVerificationResult] so the UI updates immediately
     * after a purchase without requiring a screen navigation.
     */
    private val _subscriptionTier = MutableStateFlow(getSubscriptionTier())
    val subscriptionTierState: StateFlow<String> = _subscriptionTier.asStateFlow()

    /**
     * Emits true immediately after a purchase is verified so the UI can show
     * an upgrade success banner/snackbar.
     */
    private val _purchaseJustCompleted = MutableStateFlow(false)
    val purchaseJustCompleted: StateFlow<Boolean> = _purchaseJustCompleted.asStateFlow()

    /** The billing period of the most recent successful purchase ("monthly" / "annual"). */
    private val _lastBillingPeriod = MutableStateFlow<String?>(null)
    val lastBillingPeriod: StateFlow<String?> = _lastBillingPeriod.asStateFlow()

    // ── Currency + localized pricing ─────────────────────────────────────────

    /** The user's inferred currency code (e.g. "NZD", "GBP"). Defaults to "USD". */
    private val _userCurrency = MutableStateFlow(getCachedUserCurrency())
    val userCurrency: StateFlow<String> = _userCurrency.asStateFlow()

    /** Full Google Play pricing table fetched from /api/googlePlayPricing. */
    private val _pricingData = MutableStateFlow<GooglePlayPricingResponse?>(null)
    val pricingData: StateFlow<GooglePlayPricingResponse?> = _pricingData.asStateFlow()

    // Usage data state
    private val _usageState = MutableStateFlow<UsageState>(UsageState.Loading)
    val usageState: StateFlow<UsageState> = _usageState.asStateFlow()

    init {
        viewModelScope.launch {
            billingManager.initialize()
        }

        // Fetch localized pricing on startup so subscription tiles show correct amounts.
        viewModelScope.launch {
            try {
                val pricing = apiService.getGooglePlayPricing()
                _pricingData.value = pricing
            } catch (_: Exception) {
                // Non-fatal — falls back to default USD pricing in the UI
            }
        }

        // React to purchase verification results from BillingManager.
        // When the backend confirms a new tier, refresh all reactive state so
        // the UI updates without requiring the user to navigate away and back.
        viewModelScope.launch {
            billingManager.purchaseVerificationResult.collect { result ->
                if (result is BillingManager.PurchaseVerificationResult.Success) {
                    _subscriptionTier.value = result.tier
                    _lastBillingPeriod.value = result.billingPeriod
                    _purchaseJustCompleted.value = true
                    // Also reload usage data to show the new tier's limits
                    loadUsageData()
                }
            }
        }
    }

    // ── Purchase flow ────────────────────────────────────────────────────────

    fun purchaseSubscription(activity: Activity, productDetails: ProductDetails) {
        viewModelScope.launch {
            billingManager.launchBillingFlow(activity, productDetails)
        }
    }

    /** Call this after the UI has consumed and displayed the upgrade success banner. */
    fun clearPurchaseJustCompleted() {
        _purchaseJustCompleted.value = false
    }

    // ── Tier helpers ─────────────────────────────────────────────────────────

    /**
     * Check if user has active premium subscription.
     */
    fun isPremiumUser(): Boolean {
        val tier = _subscriptionTier.value
        return tier == "lite" || tier == "standard"
    }

    /**
     * Get the user's active subscription product ID from Google Play local state.
     */
    fun getActiveSubscriptionId(): String? =
        userPurchases.value.firstOrNull { it.purchaseState == Purchase.PurchaseState.PURCHASED }
            ?.products?.firstOrNull()

    /**
     * Get the user's current subscription tier: "free", "lite", or "standard".
     *
     * Source of truth priority:
     * 1. Database-synced tier from the locally-cached user profile (reflects
     *    server-side state: purchases, admin overrides, promo codes, free trials).
     * 2. Google Play local purchase state as a fallback (e.g. first launch
     *    before the profile has been fetched, or the profile is stale/missing).
     *
     * After a purchase, [BillingManager] updates the SharedPreferences cache
     * AND emits via [BillingManager.purchaseVerificationResult], which causes
     * [subscriptionTierState] to update reactively.
     */
    fun getSubscriptionTier(): String {
        // 1. Try the database-synced tier from the locally-cached user profile
        try {
            val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
            val userJson    = sharedPrefs.getString("user", null)
            if (userJson != null) {
                val user    = Gson().fromJson(userJson, User::class.java)
                val dbTier  = user?.subscriptionTier?.lowercase()?.trim()
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
     * Get the billing period for the current subscription ("monthly" / "annual" / null).
     * Reads from SharedPreferences (entitlementType stored as "google_play_monthly" etc.)
     * with a fallback to the Google Play local purchase state.
     */
    fun getBillingPeriod(): String? = billingManager.getBillingPeriod()

    /** AI Coaching Plans limit for the user's tier. */
    fun getAiCoachingPlansLimit(): Int = billingManager.getAiCoachingPlansLimit()

    // ── Trial lifecycle helpers ──────────────────────────────────────────────

    private fun getCachedUser(): User? = try {
        val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
        val userJson    = sharedPrefs.getString("user", null) ?: return null
        Gson().fromJson(userJson, User::class.java)
    } catch (_: Exception) {
        null
    }

    /**
     * Reads the user's currency from the locally-cached user profile.
     * Returns "USD" if not set (e.g. before first login or migration not run).
     */
    private fun getCachedUserCurrency(): String =
        getCachedUser()?.currency?.takeIf { it.isNotBlank() } ?: "USD"

    fun getTrialExpiresAt(): LocalDate? {
        val user = getCachedUser() ?: return null
        val raw  = user.trialExpiresAt ?: return null
        return try {
            LocalDate.parse(raw.take(10))
        } catch (_: Exception) {
            null
        }
    }

    fun isTrialExpired(): Boolean {
        val tier = getSubscriptionTier()
        if (tier != "free") return false

        val user = getCachedUser()
        if (user?.subscriptionStatus == "trial_expired") return true

        val expiryDate = getTrialExpiresAt() ?: return false
        return LocalDate.now().isAfter(expiryDate)
    }

    fun isInActiveTrial(): Boolean {
        if (getSubscriptionTier() != "free") return false
        val expiry = getTrialExpiresAt() ?: return true
        return !LocalDate.now().isAfter(expiry)
    }

    fun trialDaysRemaining(): Int {
        val expiry = getTrialExpiresAt() ?: return 0
        val today  = LocalDate.now()
        if (today.isAfter(expiry)) return 0
        return (expiry.toEpochDay() - today.toEpochDay()).toInt()
    }

    // ── Usage data ───────────────────────────────────────────────────────────

    fun loadUsageData() {
        viewModelScope.launch {
            try {
                _usageState.value = UsageState.Loading
                val response = apiService.getCurrentUsage()
                _usageState.value = UsageState.Success(
                    UsageData(
                        tier                  = response.tier,
                        yearMonth             = response.yearMonth,
                        aiCoachingKmUsed      = response.usage.aiCoachingKm.toInt(),
                        aiCoachingKmLimit     = response.limits.aiCoachingKm?.toInt() ?: -1,
                        trainingPlansUsed     = response.usage.trainingPlansGenerated,
                        trainingPlansLimit    = response.limits.trainingPlansGenerated ?: -1,
                        routesGeneratedUsed   = response.usage.routesGenerated,
                        routesGeneratedLimit  = response.limits.routesGenerated ?: -1,
                        postRunAnalysesUsed   = response.usage.postRunAnalyses,
                        postRunAnalysesLimit  = response.limits.postRunAnalyses ?: -1
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

    // ── State and Data Classes ───────────────────────────────────────────────

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
