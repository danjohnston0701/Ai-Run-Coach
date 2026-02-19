package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class PreRunBriefingResponse(
    // AI-generated structured fields (from generateWellnessAwarePreRunBriefing)
    @SerializedName("briefing") val briefing: String? = null,
    @SerializedName("intensityAdvice") val intensityAdvice: String? = null,
    @SerializedName("warnings") val warnings: List<String>? = null,
    @SerializedName("readinessInsight") val readinessInsight: String? = null,
    @SerializedName("garminConnected") val garminConnected: Boolean? = null,

    // OpenAI TTS audio fields
    @SerializedName("audio") val audio: String? = null,
    @SerializedName("format") val format: String? = null,
    @SerializedName("voice") val voice: String? = null,

    // Combined text fallback (for device TTS)
    @SerializedName("text") val text: String? = null
) {
    /**
     * Build the full briefing text from all available fields.
     * Prefers structured AI fields (briefing, intensityAdvice, etc.) over raw text.
     */
    fun getFullBriefingText(): String {
        // If we have structured AI fields, compose them
        val hasStructuredFields = !briefing.isNullOrBlank() || !intensityAdvice.isNullOrBlank()

        if (hasStructuredFields) {
            val parts = mutableListOf<String>()

            if (!briefing.isNullOrBlank()) parts.add(briefing)
            if (!intensityAdvice.isNullOrBlank()) parts.add(intensityAdvice)

            if (!warnings.isNullOrEmpty()) {
                parts.add("Heads up: ${warnings.joinToString(". ")}")
            }

            if (!readinessInsight.isNullOrBlank()) {
                parts.add(readinessInsight)
            }

            return parts.joinToString("\n\n")
        }

        // Fallback to raw text field
        if (!text.isNullOrBlank()) return text

        return "Ready to run! Tap Start when you're ready."
    }

    /**
     * Build a shorter text suitable for TTS speech.
     * Includes briefing + intensity advice but skips verbose readiness insights.
     */
    fun getSpeechText(): String {
        val parts = mutableListOf<String>()

        if (!briefing.isNullOrBlank()) parts.add(briefing)
        if (!intensityAdvice.isNullOrBlank()) parts.add(intensityAdvice)

        if (parts.isNotEmpty()) return parts.joinToString(" ")

        // Fallback to text field
        if (!text.isNullOrBlank()) return text

        return "Ready to run. Let's go!"
    }
}
