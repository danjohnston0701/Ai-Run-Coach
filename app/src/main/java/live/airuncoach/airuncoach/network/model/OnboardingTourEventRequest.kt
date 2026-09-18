package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * One lifecycle event of the onboarding feature tour — see OnboardingTourScreen.kt and
 * POST /api/user/onboarding-tour-event.
 *
 *  - "started"   the tour screen was reached (server keeps the first occurrence)
 *  - "step"      a page was shown — [step] 0 = watch choice, 1..[totalSteps] = the paged tour
 *  - "left"      the app went to the background / was closed while on [step]
 *  - "skipped"   Skip tapped on [step] (server keeps the first occurrence)
 *  - "completed" reached the natural end (server keeps the first occurrence)
 *
 * First-occurrence fields are write-once server-side, the furthest step is a running max, and
 * the last event is always the newest — so this can be sent freely without clobbering a user's
 * original adoption data.
 */
data class OnboardingTourEventRequest(
    @SerializedName("event") val event: String,
    @SerializedName("step") val step: Int? = null,
    @SerializedName("totalSteps") val totalSteps: Int? = null,
    @SerializedName("stepName") val stepName: String? = null,
)
