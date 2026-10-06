package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * POST /api/onboarding-tour/guest-event — the unauthenticated counterpart of
 * [OnboardingTourEventRequest] for the pre-login "Take a Tour First" flow. Keyed by the
 * install id ([live.airuncoach.airuncoach.util.InstallIdentity]) and carrying the same device
 * details register/login send, so guest_tour_sessions reads like the users table does.
 */
data class GuestTourEventRequest(
    @SerializedName("deviceId") val deviceId: String,
    @SerializedName("event") val event: String,          // started | step | left | skipped | skip_prompt | completed | create_account
    @SerializedName("step") val step: Int? = null,
    @SerializedName("totalSteps") val totalSteps: Int? = null,
    @SerializedName("stepName") val stepName: String? = null,
    @SerializedName("watchChoice") val watchChoice: String? = null, // garmin_watch | samsung_watch | phone_only, once picked
    @SerializedName("platform") val platform: String = "android",
    @SerializedName("timezone") val timezone: String? = null,
    @SerializedName("country") val country: String? = null,
    @SerializedName("device") val device: DeviceInfo? = null,
)
