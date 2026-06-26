package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.domain.model.Injury

/**
 * Response from login/register endpoints
 * Backend returns the User object directly (not wrapped)
 * The token is sent via Set-Cookie header
 */
data class AuthResponse(
    // If backend wraps response: { user: User, token: string }
    @SerializedName("user")
    val user: User? = null,
    
    @SerializedName("token")
    val token: String? = null,
    
    // If backend returns User directly, we need to flatten it
    // All User fields as optional fallbacks
    @SerializedName("id")
    val id: String? = null,
    
    @SerializedName("email")
    val email: String? = null,
    
    @SerializedName("name")
    val name: String? = null,
    
    @SerializedName("userCode")
    val userCode: String? = null,
    
    @SerializedName("dob")
    val dob: String? = null,
    
    @SerializedName("gender")
    val gender: String? = null,
    
    @SerializedName("height")
    val height: String? = null,
    
    @SerializedName("weight")
    val weight: String? = null,
    
    @SerializedName("fitnessLevel")
    val fitnessLevel: String? = null,
    
    @SerializedName("desiredFitnessLevel")
    val desiredFitnessLevel: String? = null,
    
    @SerializedName("coachName")
    val coachName: String? = null,
    
    @SerializedName("coachGender")
    val coachGender: String? = null,
    
    @SerializedName("coachAccent")
    val coachAccent: String? = null,
    
    @SerializedName("coachTone")
    val coachTone: String? = null,
    
    @SerializedName("profilePic")
    val profilePic: String? = null,
    
    // Additional User fields that might be returned by backend
    @SerializedName("shortUserId")
    val shortUserId: String? = null,
    
    @SerializedName("location")
    val location: String? = null,
    
    @SerializedName("age")
    val age: Int? = null,
    
    @SerializedName("nicknameStyle")
    val nicknameStyle: String? = null,
    
    @SerializedName("distanceMinKm")
    val distanceMinKm: Float? = null,
    
    @SerializedName("distanceMaxKm")
    val distanceMaxKm: Float? = null,
    
    @SerializedName("distanceDecimalsEnabled")
    val distanceDecimalsEnabled: Boolean? = null,
    
    @SerializedName("subscriptionTier")
    val subscriptionTier: String? = null,
    
    @SerializedName("subscriptionStatus")
    val subscriptionStatus: String? = null,
    
    @SerializedName("distanceScale")
    val distanceScale: String? = null,
    
    @SerializedName("coachPaceEnabled")
    val coachPaceEnabled: Boolean? = null,
    
    @SerializedName("coachNavigationEnabled")
    val coachNavigationEnabled: Boolean? = null,
    
    @SerializedName("coachElevationEnabled")
    val coachElevationEnabled: Boolean? = null,
    
    @SerializedName("coachHeartRateEnabled")
    val coachHeartRateEnabled: Boolean? = null,
    
    @SerializedName("coachCadenceStrideEnabled")
    val coachCadenceStrideEnabled: Boolean? = null,
    
    @SerializedName("coachKmSplitsEnabled")
    val coachKmSplitsEnabled: Boolean? = null,
    
    @SerializedName("coachStruggleEnabled")
    val coachStruggleEnabled: Boolean? = null,
    
    @SerializedName("coachMotivationalEnabled")
    val coachMotivationalEnabled: Boolean? = null,
    
    @SerializedName("coachHalfKmCheckInEnabled")
    val coachHalfKmCheckInEnabled: Boolean? = null,
    
    @SerializedName("coachKmSplitIntervalKm")
    val coachKmSplitIntervalKm: Int? = null,
    
    @SerializedName("injuries")
    val injuries: List<Injury>? = null,

    // ISO-8601 trial expiry date (e.g. "2025-01-10") — account creation date + 14 days, set by server
    @SerializedName("trialExpiresAt")
    val trialExpiresAt: String? = null
) {
    /**
     * Extract the actual User object, whether it's wrapped or flattened
     * Handles both full User objects and flattened field responses
     */
    fun extractUser(): User? {
        return user ?: if (id != null && email != null && name != null) {
            User(
                id = id,
                email = email,
                name = name,
                shortUserId = shortUserId,
                location = location,
                age = age,
                dob = dob,
                gender = gender,
                height = height?.toDoubleOrNull(),
                weight = weight?.toDoubleOrNull(),
                fitnessLevel = fitnessLevel,
                desiredFitnessLevel = desiredFitnessLevel,
                coachName = coachName ?: "AI Coach",
                coachGender = coachGender ?: "male",
                coachAccent = coachAccent ?: "british",
                coachTone = coachTone ?: "energetic",
                nicknameStyle = nicknameStyle,
                profilePic = profilePic,
                distanceMinKm = distanceMinKm ?: 0f,
                distanceMaxKm = distanceMaxKm ?: 50f,
                distanceDecimalsEnabled = distanceDecimalsEnabled ?: false,
                subscriptionTier = subscriptionTier,
                subscriptionStatus = subscriptionStatus,
                distanceScale = distanceScale,
                coachPaceEnabled = coachPaceEnabled,
                coachNavigationEnabled = coachNavigationEnabled,
                coachElevationEnabled = coachElevationEnabled,
                coachHeartRateEnabled = coachHeartRateEnabled,
                coachCadenceStrideEnabled = coachCadenceStrideEnabled,
                coachKmSplitsEnabled = coachKmSplitsEnabled,
                coachStruggleEnabled = coachStruggleEnabled,
                coachMotivationalEnabled = coachMotivationalEnabled,
                coachHalfKmCheckInEnabled = coachHalfKmCheckInEnabled,
                coachKmSplitIntervalKm = coachKmSplitIntervalKm,
                injuries = injuries,
                trialExpiresAt = trialExpiresAt
            )
        } else {
            null
        }
    }
}
