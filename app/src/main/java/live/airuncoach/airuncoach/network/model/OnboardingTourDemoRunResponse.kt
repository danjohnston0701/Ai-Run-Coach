package live.airuncoach.airuncoach.network.model

import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName
import live.airuncoach.airuncoach.domain.model.RunSession

/**
 * GET /api/onboarding-tour/demo-run — a genuine run (server-side constant ID, readable by any
 * signed-in user, owner identifiers stripped) that the onboarding feature tour renders the real
 * run-summary UI over. `run` is the same transformed shape GET /api/runs/{id} returns; `analysis`
 * is the saved analysis object (the `analysis` field of GET /api/runs/{id}/analysis), or null.
 */
data class OnboardingTourDemoRunResponse(
    @SerializedName("run") val run: RunSession,
    @SerializedName("analysis") val analysis: JsonElement?,
)
