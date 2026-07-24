package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class AcceptAdaptationRequest(
    @SerializedName("adaptationId") val adaptationId: String
)

data class DeclineAdaptationRequest(
    @SerializedName("adaptationId") val adaptationId: String
)

data class AdaptationResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String? = null,
    @SerializedName("workoutsUpdated") val workoutsUpdated: Int = 0,
    @SerializedName("error") val error: String? = null
)

data class PendingAdaptation(
    @SerializedName("id") val id: String,
    @SerializedName("training_plan_id") val trainingPlanId: String,
    @SerializedName("adaptation_date") val adaptationDate: String,
    @SerializedName("reason") val reason: String,  // run_data_feedback, missed_workout, injury, over_training, ahead_of_schedule
    @SerializedName("status") val status: String = "pending",  // pending, accepted, declined
    @SerializedName("changes") val changes: Map<String, Any>? = null,
    @SerializedName("ai_suggestion") val aiSuggestion: String? = null
)

data class PendingAdaptationsResponse(
    @SerializedName("adaptations") val adaptations: List<PendingAdaptation> = emptyList(),
    @SerializedName("count") val count: Int = 0
)
