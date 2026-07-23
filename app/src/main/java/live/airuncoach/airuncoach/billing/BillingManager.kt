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
 *    never updated after a Google Play purchase)
 *  - Update the locally-cached user profile in SharedPreferences so the UI
 *    reflects the new tier immediately
 *  - Expose [purchaseVerificationResult] so ViewModels can react to purchase
 *    completions and refresh their state
 */
@Singleton
class BillingManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService
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
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(SUBSCRIPTION_LITE_MONTHLY)
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(SUBSCRIPTION_LITE_ANNUAL)
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(SUBSCRIPTION_STANDARD_MONTHLY)
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(SUBSCRIPTION_STANDARD_ANNUAL)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        )

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

            if (response.success) {
                Log.i(TAG, "Backend confirmed tier=${response.tier} billingPeriod=${response.billingPeriod}")

                // ── Update the locally-cached user profile ───────────────────
                // The SubscriptionViewModel reads subscriptionTier from this
                // cache (SharedPreferences key "user" in "user_prefs").
                updateCachedUserTier(
                    tier               = response.tier,
                    subscriptionStatus = response.subscriptionStatus,
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
        updatedUser: User?
    ) {
        try {
            val prefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
            val gson  = Gson()

            if (updatedUser != null) {
                prefs.edit { putString("user", gson.toJson(updatedUser)) }
                Log.i(TAG, "Cached full updated user profile (tier=${updatedUser.subscriptionTier})")
                return
            }

            // Patch the existing cached user when the backend didn't return a full User object
            val existingJson = prefs.getString("user", null)
            if (existingJson != null) {
                val existing = gson.fromJson(existingJson, User::class.java)
                val patched  = existing.copy(
                    subscriptionTier   = tier,
                    subscriptionStatus = subscriptionStatus
                )
                prefs.edit { putString("user", gson.toJson(patched)) }
                Log.i(TAG, "Patched cached user profile: subscriptionTier=$tier")
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

        return when {
            active.products.any { it.contains("lite") }     -> "lite"
            active.products.any { it.contains("standard") } -> "standard"
            else                                             -> "free"
        }
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

    fun getAiCoachingPlansLimit(): Int = when (getSubscriptionTier()) {
        "lite"     -> 1
        "standard" -> 3
        else       -> 0
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
