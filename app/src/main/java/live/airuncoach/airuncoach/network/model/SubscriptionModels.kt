package live.airuncoach.airuncoach.network.model

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
data class VerifyPurchaseResponse(
    val success: Boolean,
    /** "lite" or "standard" */
    val tier: String,
    /** "monthly" or "annual" */
    val billingPeriod: String,
    val subscriptionStatus: String,
    /** ISO-8601 timestamp of the approximate next renewal date. */
    val expiresAt: String? = null,
    /** Full updated user record — cache this in SharedPreferences. */
    val user: User? = null
)
