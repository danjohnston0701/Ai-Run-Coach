package live.airuncoach.airuncoach.billing

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.*
import androidx.core.content.edit
import com.google.gson.Gson
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.VerifyPurchaseRequest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages Google Play Billing for subscriptions.
 *
 * Responsibilities:
 *  - Connect to the Google Play Billing service and query available products
 *  - Launch the purchase flow
 *  - Acknowledge completed purchases
 *  - Call POST /api/subscriptions/verify-purchase so the backend database is
 *    kept in sync with the user's entitlement (fixes the bug where the DB was
 *    never updated after a Google Play purchase). The backend verifies the
 *    token against the Play Developer API; cancellations/expiries are pushed
 *    to it via RTDN and an hourly reconcile, so the DB tier — not this client —
 *    is the source of truth for whether a lapsed subscriber still has access.
 *  - Tag each purchase with the user ID (setObfuscatedAccountId) so the backend
 *    can link Play notifications back to the account
 *  - Update the locally-cached user profile in SharedPreferences so the UI
 *    reflects the new tier immediately
 *  - Expose [purchaseVerificationResult] so ViewModels can react to purchase
 *    completions and refresh their state
 */
@Singleton
class BillingManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) {
    private lateinit var billingClient: BillingClient

    private val _subscriptionList = MutableStateFlow<List<ProductDetails>>(emptyList())
    val subscriptionList: StateFlow<List<ProductDetails>> = _subscriptionList

    private val _userPurchases = MutableStateFlow<List<Purchase>>(emptyList())
    val userPurchases: StateFlow<List<Purchase>> = _userPurchases

    private val _billingConnectionState = MutableStateFlow(false)
    val billingConnectionState: StateFlow<Boolean> = _billingConnectionState

    /**
     * Emits the result of the most recent purchase verification.
     * Null means no verification has been attempted yet this session.
     * ViewModels should collect this to refresh their subscription tier state.
     */
    private val _purchaseVerificationResult = MutableStateFlow<PurchaseVerificationResult?>(null)
    val purchaseVerificationResult: StateFlow<PurchaseVerificationResult?> = _purchaseVerificationResult

    private val scope = CoroutineScope(Dispatchers.IO)

    companion object {
        private const val TAG = "BillingManager"

        const val SUBSCRIPTION_LITE_MONTHLY    = "lite_monthly"
        const val SUBSCRIPTION_LITE_ANNUAL     = "lite_annual"
        const val SUBSCRIPTION_STANDARD_MONTHLY = "standard_monthly"
        const val SUBSCRIPTION_STANDARD_ANNUAL  = "standard_annual"

        // "No AI Plans" variants — same tier/period, AI training-plan generation excluded.
        const val SUBSCRIPTION_LITE_NOAI_MONTHLY     = "lite_noaiplan_monthly"
        const val SUBSCRIPTION_LITE_NOAI_ANNUAL      = "lite_noaiplan_annual"
        const val SUBSCRIPTION_STANDARD_NOAI_MONTHLY = "standard_noaiplan_monthly"
        const val SUBSCRIPTION_STANDARD_NOAI_ANNUAL  = "standard_noaiplan_annual"
    }

    // ── Initialization ───────────────────────────────────────────────────────

    fun initialize() {
        scope.launch {
            billingClient = BillingClient.newBuilder(context)
                .setListener(object : PurchasesUpdatedListener {
                    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: MutableList<Purchase>?) {
                        this@BillingManager.onPurchasesUpdated(billingResult, purchases)
                    }
                })
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build()

            startBillingConnection()
        }
    }

    private fun startBillingConnection() {
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    _billingConnectionState.value = true
                    scope.launch {
                        querySubscriptions()
                        queryAndSyncPurchases()
                    }
                } else {
                    _billingConnectionState.value = false
                    Log.w(TAG, "Billing setup failed: ${billingResult.debugMessage}")
                }
            }

            override fun onBillingServiceDisconnected() {
                _billingConnectionState.value = false
                Log.w(TAG, "Billing service disconnected")
            }
        })
    }

    // ── Product query ────────────────────────────────────────────────────────

    private suspend fun querySubscriptions() {
        val productList = listOf(
            SUBSCRIPTION_LITE_MONTHLY,
            SUBSCRIPTION_LITE_ANNUAL,
            SUBSCRIPTION_STANDARD_MONTHLY,
            SUBSCRIPTION_STANDARD_ANNUAL,
            SUBSCRIPTION_LITE_NOAI_MONTHLY,
            SUBSCRIPTION_LITE_NOAI_ANNUAL,
            SUBSCRIPTION_STANDARD_NOAI_MONTHLY,
            SUBSCRIPTION_STANDARD_NOAI_ANNUAL
        ).map { productId ->
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        }

        val response = billingClient.queryProductDetails(
            QueryProductDetailsParams.newBuilder().setProductList(productList).build()
        )
        if (response.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            _subscriptionList.value = response.productDetailsList ?: emptyList()
        }
    }

    // ── Purchase history query + server sync ─────────────────────────────────

    /**
     * Query active purchases from Google Play and sync any active subscription
     * with the backend database.  Called on every billing connection (i.e. app
     * start) so renewals are picked up even without a new purchase flow.
     */
    private suspend fun queryAndSyncPurchases() {
        val result = billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        )

        if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            _userPurchases.value = result.purchasesList

            // Sync every active, acknowledged purchase with the backend.
            // This ensures renewals are reflected in the database even when the
            // user hasn't gone through the purchase flow again.
            result.purchasesList
                .filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                .forEach { purchase ->
                    if (!purchase.isAcknowledged) {
                        acknowledgePurchase(purchase)
                    } else {
                        // Already acknowledged — just sync DB if needed
                        syncPurchaseWithBackend(purchase)
                    }
                }
        }
    }

    // ── Purchase flow ────────────────────────────────────────────────────────

    fun launchBillingFlow(activity: Activity, productDetails: ProductDetails) {
        scope.launch {
            val offerToken = productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken
                ?: run {
                    Log.e(TAG, "No offer token for ${productDetails.productId}")
                    return@launch
                }

            val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(
                    listOf(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(productDetails)
                            .setOfferToken(offerToken)
                            .build()
                    )
                )
                .apply {
                    // Google echoes this back as externalAccountIdentifiers.obfuscatedExternalAccountId
                    // on the Play Developer API, which is how the backend links an RTDN
                    // (renewal / cancellation / expiry) to a user when the purchase token isn't
                    // already on file — the Play analogue of StoreKit's appAccountToken.
                    sessionManager.getUserId()?.let { setObfuscatedAccountId(it) }
                }
                .build()

            billingClient.launchBillingFlow(activity, flowParams)
        }
    }

    // ── Purchase result callback ─────────────────────────────────────────────

    private fun onPurchasesUpdated(billingResult: BillingResult, purchases: MutableList<Purchase>?) {
        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                if (purchases != null) {
                    _userPurchases.value = purchases
                    purchases.forEach { purchase ->
                        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                            if (!purchase.isAcknowledged) {
                                // acknowledgePurchase calls syncPurchaseWithBackend internally
                                acknowledgePurchase(purchase)
                            } else {
                                // Already acknowledged — sync DB on a new coroutine
                                scope.launch { syncPurchaseWithBackend(purchase) }
                            }
                        }
                    }
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                Log.i(TAG, "Purchase cancelled by user")
            }
            else -> {
                Log.w(TAG, "Purchase update error: ${billingResult.responseCode} — ${billingResult.debugMessage}")
            }
        }
    }

    // ── Acknowledgment ───────────────────────────────────────────────────────

    /**
     * Acknowledge a purchase with Google Play, then sync the entitlement with
     * the backend database.
     */
    private fun acknowledgePurchase(purchase: Purchase) {
        scope.launch {
            val acknowledgeParams = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()

            billingClient.acknowledgePurchase(acknowledgeParams) { billingResult ->
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    Log.i(TAG, "Purchase acknowledged: ${purchase.products}")
                    scope.launch { syncPurchaseWithBackend(purchase) }
                } else {
                    Log.e(TAG, "Acknowledgment failed: ${billingResult.debugMessage}")
                }
            }
        }
    }

    // ── Backend sync ─────────────────────────────────────────────────────────

    /**
     * Call POST /api/subscriptions/verify-purchase to update the user's tier
     * in the database, then refresh the locally-cached user profile in
     * SharedPreferences so SubscriptionViewModel.getSubscriptionTier() returns
     * the correct value immediately.
     */
    private suspend fun syncPurchaseWithBackend(purchase: Purchase) {
        val productId = purchase.products.firstOrNull() ?: return
        Log.i(TAG, "Syncing purchase with backend — product=$productId token=${purchase.purchaseToken.take(20)}...")

        try {
            val response = apiService.verifyPurchase(
                VerifyPurchaseRequest(
                    purchaseToken  = purchase.purchaseToken,
                    productId      = productId,
                    packageName    = context.packageName
                )
            )

            if (response.success && !response.entitled) {
                // The backend checked the token with Google and it no longer grants access
                // (expired / on hold / revoked). Play can still hand us such a purchase from
                // queryPurchasesAsync for a short while after lapse — take the DB's word for
                // the tier rather than the product ID, and don't announce a purchase.
                Log.w(TAG, "Backend says purchase is not entitled (state=${response.subscriptionState}) — tier=${response.tier}")
                updateCachedUserTier(
                    tier               = response.tier,
                    subscriptionStatus = response.subscriptionStatus,
                    aiPlansEnabled     = response.user?.aiPlansEnabled ?: true,
                    updatedUser        = response.user
                )
            } else if (response.success) {
                Log.i(TAG, "Backend confirmed tier=${response.tier} billingPeriod=${response.billingPeriod} expires=${response.expiresAt}")

                // ── Update the locally-cached user profile ───────────────────
                // The SubscriptionViewModel reads subscriptionTier from this
                // cache (SharedPreferences key "user" in "user_prefs").
                updateCachedUserTier(
                    tier               = response.tier,
                    subscriptionStatus = response.subscriptionStatus,
                    aiPlansEnabled     = !productId.contains("noai"),
                    updatedUser        = response.user
                )

                _purchaseVerificationResult.value = PurchaseVerificationResult.Success(
                    tier          = response.tier,
                    billingPeriod = response.billingPeriod
                )
            } else {
                Log.w(TAG, "Backend returned success=false for product=$productId")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to verify purchase with backend: ${e.message}", e)
            // Don't block the user — the local Google Play state is still the fallback
        }
    }

    /**
     * Persist the verified tier directly into the SharedPreferences user cache.
     *
     * If the backend returned a full User object, replace the entire cache entry.
     * Otherwise, patch just the subscription fields on the existing cached object.
     */
    private fun updateCachedUserTier(
        tier: String,
        subscriptionStatus: String,
        aiPlansEnabled: Boolean,
        updatedUser: User?
    ) {
        try {
            val prefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
            val gson  = Gson()

            if (updatedUser != null) {
                prefs.edit { putString("user", gson.toJson(updatedUser)) }
                Log.i(TAG, "Cached full updated user profile (tier=${updatedUser.subscriptionTier}, aiPlansEnabled=${updatedUser.aiPlansEnabled})")
                return
            }

            // Patch the existing cached user when the backend didn't return a full User object
            val existingJson = prefs.getString("user", null)
            if (existingJson != null) {
                val existing = gson.fromJson(existingJson, User::class.java)
                val patched  = existing.copy(
                    subscriptionTier   = tier,
                    subscriptionStatus = subscriptionStatus,
                    aiPlansEnabled     = aiPlansEnabled
                )
                prefs.edit { putString("user", gson.toJson(patched)) }
                Log.i(TAG, "Patched cached user profile: subscriptionTier=$tier, aiPlansEnabled=$aiPlansEnabled")
            } else {
                Log.w(TAG, "No cached user found — tier will be read from Google Play fallback")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update cached user tier: ${e.message}", e)
        }
    }

    // ── Tier helpers ─────────────────────────────────────────────────────────

    /**
     * Derive the tier from locally-cached Google Play purchases.
     * Used as a fallback by SubscriptionViewModel.getSubscriptionTier() when
     * the database-backed user profile is missing or has no tier set.
     */
    fun getSubscriptionTier(): String {
        val active = _userPurchases.value.firstOrNull {
            it.purchaseState == Purchase.PurchaseState.PURCHASED
        } ?: return "free"

        // "lite_noaiplan_monthly" still contains "lite" — tier derivation is unaffected
        // by the AI-plans axis, checked separately via getAiPlansEnabled().
        return when {
            active.products.any { it.contains("lite") }     -> "lite"
            active.products.any { it.contains("standard") } -> "standard"
            else                                             -> "free"
        }
    }

    /**
     * Derive AI-plans inclusion from locally-cached Google Play purchases.
     * Used as a fallback by SubscriptionViewModel.getAiPlansEnabled() when the
     * database-backed user profile is missing or has no value set.
     */
    fun getAiPlansEnabled(): Boolean {
        val active = _userPurchases.value.firstOrNull {
            it.purchaseState == Purchase.PurchaseState.PURCHASED
        } ?: return true
        return active.products.none { it.contains("noai") }
    }

    /**
     * Derive the billing period ("monthly" or "annual") from local Google Play
     * purchases.  Returns null when there is no active subscription.
     */
    fun getBillingPeriod(): String? {
        val active = _userPurchases.value.firstOrNull {
            it.purchaseState == Purchase.PurchaseState.PURCHASED
        } ?: return null

        return when {
            active.products.any { it.contains("annual") }  -> "annual"
            active.products.any { it.contains("monthly") } -> "monthly"
            else                                            -> "monthly"
        }
    }

    fun getAiCoachingPlansLimit(): Int {
        if (!getAiPlansEnabled()) return 0
        return when (getSubscriptionTier()) {
            "lite"     -> 1
            "standard" -> 3
            else       -> 0
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    fun endConnection() {
        if (::billingClient.isInitialized) {
            billingClient.endConnection()
        }
    }

    // ── Result types ─────────────────────────────────────────────────────────

    sealed class PurchaseVerificationResult {
        data class Success(
            val tier: String,
            val billingPeriod: String
        ) : PurchaseVerificationResult()

        data class Error(val message: String) : PurchaseVerificationResult()
    }
}
