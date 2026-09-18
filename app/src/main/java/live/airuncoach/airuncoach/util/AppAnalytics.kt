package live.airuncoach.airuncoach.util

import android.content.Context
import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics

/**
 * Thin wrapper around Firebase Analytics.
 *
 * Event names are shared with iOS (`AppAnalytics.swift`) so the Firebase funnels read across
 * both apps. Two groups:
 *  - Onboarding funnel (subscription screen, tour, dashboard) — the original set.
 *  - Activation funnel (2026-09-18) — `first_open` → `signup_*` → `email_verified` /
 *    `login_success` → `run_started` → `run_completed` → `goal_created` / `plan_generated` /
 *    `route_generated`. Before these, nothing was logged between first_open and
 *    dashboard_reached, so the 78% install→account drop-off was unexplainable.
 */
object AppAnalytics {
    object Event {
        const val ONBOARDING_SUBSCRIPTION_VIEWED = "onboarding_subscription_viewed"
        const val ONBOARDING_CONTINUE_TO_DASHBOARD_TAPPED = "onboarding_continue_to_dashboard_tapped"
        const val ONBOARDING_SEE_PLANS_TAPPED = "onboarding_see_plans_tapped"
        const val ONBOARDING_PLAN_PURCHASE_TAPPED = "onboarding_plan_purchase_tapped"
        const val ONBOARDING_CONNECT_WATCH_TAPPED = "onboarding_connect_watch_tapped"
        const val ONBOARDING_TAKE_TOUR_TAPPED = "onboarding_take_tour_tapped"
        const val ONBOARDING_TOUR_COMPLETED = "onboarding_tour_completed"
        const val ONBOARDING_TOUR_SKIPPED = "onboarding_tour_skipped"
        const val DASHBOARD_REACHED = "dashboard_reached"

        // ── Activation funnel ────────────────────────────────────────────────
        /** Sign-up form shown. */
        const val SIGNUP_STARTED = "signup_started"
        /** Register API succeeded (account exists; verification may still be pending). */
        const val SIGNUP_COMPLETED = "signup_completed"
        /** Email OTP accepted — the user is now fully in. */
        const val EMAIL_VERIFIED = "email_verified"
        /** Returning-user login succeeded. */
        const val LOGIN_SUCCESS = "login_success"
        /** Tracking started. Params: session_type. */
        const val RUN_STARTED = "run_started"
        /** Run finalised and queued for upload. Params: session_type, distance_km, distance_bucket, duration_min. */
        const val RUN_COMPLETED = "run_completed"
        /** Params: goal_type. */
        const val GOAL_CREATED = "goal_created"
        /** Params: goal_type, duration_weeks. */
        const val PLAN_GENERATED = "plan_generated"
        /** Params: route_count, distance_km, generator ("ai" | "intelligent"). */
        const val ROUTE_GENERATED = "route_generated"
    }

    object Param {
        const val SESSION_TYPE = "session_type"
        const val DISTANCE_KM = "distance_km"
        const val DISTANCE_BUCKET = "distance_bucket"
        const val DURATION_MIN = "duration_min"
        const val GOAL_TYPE = "goal_type"
        const val DURATION_WEEKS = "duration_weeks"
        const val ROUTE_COUNT = "route_count"
        const val GENERATOR = "generator"
    }

    fun logEvent(context: Context, name: String, params: Bundle? = null) {
        FirebaseAnalytics.getInstance(context).logEvent(name, params)
    }

    /** Convenience: `logEvent(ctx, Event.X, Param.A to 1, Param.B to "x")`. Nulls are dropped. */
    fun logEvent(context: Context, name: String, vararg params: Pair<String, Any?>) {
        val bundle = Bundle()
        for ((k, v) in params) {
            when (v) {
                null -> {}
                is Int -> bundle.putInt(k, v)
                is Long -> bundle.putLong(k, v)
                is Double -> bundle.putDouble(k, v)
                is Float -> bundle.putDouble(k, v.toDouble())
                is Boolean -> bundle.putString(k, v.toString())
                else -> bundle.putString(k, v.toString())
            }
        }
        logEvent(context, name, bundle)
    }

    /**
     * Coarse distance bucket so Firebase can separate "tapped start and stopped" (under_0_5)
     * from real sessions without needing a numeric-parameter report. Same buckets on iOS.
     */
    fun distanceBucket(km: Double): String = when {
        km < 0.5 -> "under_0_5"
        km < 2.0 -> "0_5_to_2"
        km < 5.0 -> "2_to_5"
        km < 10.0 -> "5_to_10"
        km < 21.0 -> "10_to_21"
        else -> "21_plus"
    }
}
