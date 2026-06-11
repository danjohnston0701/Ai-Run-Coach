package live.airuncoach.airuncoach.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.*
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages Google Play Billing for subscriptions and in-app purchases.
 * Handles:
 * - Subscription products setup
 * - Purchase flows
 * - Subscription status queries
 */
@Singleton
class BillingManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private lateinit var billingClient: BillingClient

    private val _subscriptionList = MutableStateFlow<List<ProductDetails>>(emptyList())
    val subscriptionList: StateFlow<List<ProductDetails>> = _subscriptionList

    private val _userPurchases = MutableStateFlow<List<Purchase>>(emptyList())
    val userPurchases: StateFlow<List<Purchase>> = _userPurchases

    private val _billingConnectionState = MutableStateFlow(false)
    val billingConnectionState: StateFlow<Boolean> = _billingConnectionState

    private val scope = CoroutineScope(Dispatchers.Main)

    // Define your subscription product IDs here (create these in Google Play Console first)
    companion object {
        const val SUBSCRIPTION_LITE_MONTHLY = "lite_monthly"
        const val SUBSCRIPTION_LITE_ANNUAL = "lite_annual"
        const val SUBSCRIPTION_STANDARD_MONTHLY = "standard_monthly"
        const val SUBSCRIPTION_STANDARD_ANNUAL = "standard_annual"
    }

    /**
     * Initialize the billing client and fetch available subscriptions.
     */
    fun initialize() {
        scope.launch {
            billingClient = BillingClient.newBuilder(context)
                .setListener(::onPurchasesUpdated)
                .enablePendingPurchases()
                .build()

            startBillingConnection()
        }
    }

    /**
     * Start connection to Google Play Billing service.
     */
    private fun startBillingConnection() {
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    _billingConnectionState.value = true
                    scope.launch {
                        querySubscriptions()
                        queryPurchaseHistory()
                    }
                } else {
                    _billingConnectionState.value = false
                }
            }

            override fun onBillingServiceDisconnected() {
                _billingConnectionState.value = false
            }
        })
    }

    /**
     * Query available subscription products from Google Play.
     */
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

        val queryParams = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        val response = billingClient.queryProductDetails(queryParams)
        if (response.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            _subscriptionList.value = response.productDetailsList ?: emptyList()
        }
    }

    /**
     * Query user's existing purchases.
     */
    private suspend fun queryPurchaseHistory() {
        val result = billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        )

        if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            _userPurchases.value = result.purchasesList
        }
    }

    /**
     * Launch the purchase flow for a subscription.
     */
    fun launchBillingFlow(activity: Activity, productDetails: ProductDetails) {
        scope.launch {
            // Get the first offer (standard pricing)
            val offerToken = productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken

            if (offerToken != null) {
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
    }

    /**
     * Callback when a purchase is completed or updated.
     */
    private fun onPurchasesUpdated(billingResult: BillingResult, purchases: MutableList<Purchase>?) {
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            _userPurchases.value = purchases
            // Handle each purchase (acknowledge, validate, etc.)
            purchases.forEach { purchase ->
                if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                    // Acknowledge the purchase if not already done
                    if (!purchase.isAcknowledged) {
                        acknowledgePurchase(purchase)
                    }
                }
            }
        }
    }

    /**
     * Acknowledge a purchase to confirm receipt with Google Play.
     */
    private fun acknowledgePurchase(purchase: Purchase) {
        scope.launch {
            val acknowledgeParams = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()

            billingClient.acknowledgePurchase(acknowledgeParams) { billingResult ->
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    // Purchase acknowledged successfully
                    // Update your backend or local database to grant access
                }
            }
        }
    }

    /**
     * Check if user has an active subscription.
     */
    fun hasActiveSubscription(): Boolean {
        return _userPurchases.value.any { purchase ->
            purchase.purchaseState == Purchase.PurchaseState.PURCHASED
        }
    }

    /**
     * Get subscription status for a specific product.
     */
    fun getSubscriptionStatus(productId: String): Purchase? {
        return _userPurchases.value.firstOrNull { purchase ->
            purchase.products.contains(productId) &&
            purchase.purchaseState == Purchase.PurchaseState.PURCHASED
        }
    }

    /**
     * Get the user's current subscription tier.
     * Returns: "free", "lite", "standard", or null if unable to determine
     */
    fun getSubscriptionTier(): String {
        val activeSubscription = _userPurchases.value.firstOrNull { purchase ->
            purchase.purchaseState == Purchase.PurchaseState.PURCHASED
        }

        return when {
            activeSubscription == null -> "free"
            activeSubscription.products.any { it.contains("lite") } -> "lite"
            activeSubscription.products.any { it.contains("standard") } -> "standard"
            else -> "free"
        }
    }

    /**
     * Get the AI Coaching Plans limit for the user's subscription tier.
     */
    fun getAiCoachingPlansLimit(): Int {
        return when (getSubscriptionTier()) {
            "free" -> 0
            "lite" -> 1
            "standard" -> 3
            else -> 0
        }
    }

    /**
     * Disconnect billing client (call in onDestroy).
     */
    fun endConnection() {
        if (::billingClient.isInitialized) {
            billingClient.endConnection()
        }
    }
}
