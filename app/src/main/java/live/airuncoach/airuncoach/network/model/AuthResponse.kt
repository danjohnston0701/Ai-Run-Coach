package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.User

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
    val profilePic: String? = null
) {
    /**
     * Extract the actual User object, whether it's wrapped or flattened
     */
    fun extractUser(): User? {
        return user ?: if (id != null && email != null && name != null) {
            User(
                id = id,
                email = email,
                name = name,
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
                profilePic = profilePic
            )
        } else {
            null
        }
    }
}
