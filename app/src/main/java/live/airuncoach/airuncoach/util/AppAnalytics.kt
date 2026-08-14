package live.airuncoach.airuncoach.util

import android.content.Context
import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics

/**
 * Thin wrapper around Firebase Analytics. Start with the events actually needed
 * (currently: onboarding subscription-screen funnel) rather than a general-purpose
 * abstraction — add event names here as new tracking is needed.
 */
object AppAnalytics {
    object Event {
        const val ONBOARDING_SUBSCRIPTION_VIEWED = "onboarding_subscription_viewed"
        const val ONBOARDING_CONTINUE_TO_DASHBOARD_TAPPED = "onboarding_continue_to_dashboard_tapped"
        const val ONBOARDING_SEE_PLANS_TAPPED = "onboarding_see_plans_tapped"
        const val ONBOARDING_PLAN_PURCHASE_TAPPED = "onboarding_plan_purchase_tapped"
        const val DASHBOARD_REACHED = "dashboard_reached"
    }

    fun logEvent(context: Context, name: String, params: Bundle? = null) {
        FirebaseAnalytics.getInstance(context).logEvent(name, params)
    }
}
