package live.airuncoach.airuncoach.viewmodel

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.billing.BillingManager
import javax.inject.Inject

/**
 * ViewModel for managing subscription and premium feature UI.
 */
@HiltViewModel
class SubscriptionViewModel @Inject constructor(
    private val billingManager: BillingManager
) : ViewModel() {

    val subscriptions: StateFlow<List<ProductDetails>> = billingManager.subscriptionList
    val userPurchases: StateFlow<List<Purchase>> = billingManager.userPurchases
    val billingConnectionState: StateFlow<Boolean> = billingManager.billingConnectionState

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
     */
    fun isPremiumUser(): Boolean = billingManager.hasActiveSubscription()

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
     */
    fun getSubscriptionTier(): String = billingManager.getSubscriptionTier()

    /**
     * Get the AI Coaching Plans limit for the user's tier.
     */
    fun getAiCoachingPlansLimit(): Int = billingManager.getAiCoachingPlansLimit()

    override fun onCleared() {
        super.onCleared()
        billingManager.endConnection()
    }
}
