package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Records the first time a user reaches ("started") or completes ("completed") the onboarding
 * feature tour — see OnboardingTourScreen.kt. The server preserves the first occurrence of each
 * (write-once), so this can be called every time without worrying about overwriting the user's
 * original adoption timestamp.
 */
data class OnboardingTourEventRequest(
    @SerializedName("event") val event: String, // "started" | "completed"
)
