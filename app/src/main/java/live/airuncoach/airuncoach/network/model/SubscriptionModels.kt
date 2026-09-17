package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.User

/**
 * Request body for POST /api/subscriptions/verify-purchase.
 *
 * Sent immediately after a Google Play purchase is acknowledged so the backend
 * can update the user's subscriptionTier in the database.
 */
data class VerifyPurchaseRequest(
    val purchaseToken: String,
    val productId: String,
    val packageName: String
)

/**
 * Response from POST /api/subscriptions/verify-purchase.
 *
 * Contains the resolved tier and billing period so the client can update its
 * local cache without a separate profile fetch.
 */
/**
 * Response from GET /api/googlePlayPricing
 * Contains localized prices for all subscription tiers and billing periods.
 */
data class GooglePlayPricingResponse(
    @SerializedName("lite_monthly")    val liteMonthly:    PricingTierData,
    @SerializedName("lite_annual")     val liteAnnual:     PricingTierData,
    @SerializedName("standard_monthly") val standardMonthly: PricingTierData,
    @SerializedName("standard_annual") val standardAnnual:  PricingTierData,
    // "No AI Plans" variants — same tier/period, AI training-plan generation excluded.
    @SerializedName("lite_noaiplan_monthly")    val liteNoAiMonthly:    PricingTierData? = null,
    @SerializedName("lite_noaiplan_annual")     val liteNoAiAnnual:     PricingTierData? = null,
    @SerializedName("standard_noaiplan_monthly") val standardNoAiMonthly: PricingTierData? = null,
    @SerializedName("standard_noaiplan_annual") val standardNoAiAnnual:  PricingTierData? = null
)

data class PricingTierData(
    @SerializedName("by_currency") val byCurrency: Map<String, Double>
)

// ─────────────────────────────────────────────────────────────────────────────

data class VerifyPurchaseResponse(
    val success: Boolean,
    /**
     * Whether Google Play confirmed the token still grants access. False when the backend
     * (verifying against the Play Developer API) found the subscription expired / on hold /
     * revoked — in that case [tier] and [user] describe the DB's current state, not the product.
     * Defaults to true for older backends that don't send it.
     */
    val entitled: Boolean = true,
    /** "lite" or "standard" (or "free" when [entitled] is false) */
    val tier: String,
    /** "monthly" or "annual" */
    val billingPeriod: String,
    val subscriptionStatus: String,
    /** Google's SubscriptionPurchaseV2.subscriptionState, e.g. SUBSCRIPTION_STATE_ACTIVE (null on older backends). */
    val subscriptionState: String? = null,
    /** ISO-8601 timestamp of the next renewal / expiry date (real when server-verified). */
    val expiresAt: String? = null,
    /** Full updated user record — cache this in SharedPreferences. */
    val user: User? = null
)
