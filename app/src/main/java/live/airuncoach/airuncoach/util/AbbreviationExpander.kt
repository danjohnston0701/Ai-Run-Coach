package live.airuncoach.airuncoach.util

/**
 * Expands running-related abbreviations and acronyms to full words for text-to-speech.
 * Ensures runners hear clear, conversational feedback without confusing acronyms during runs.
 *
 * Examples:
 * - "Your bpm is 145" → "Your beats per minute is 145"
 * - "GCT is 240ms" → "Ground contact time is 240 milliseconds"
 * - "VO jumped to 8cm" → "Vertical oscillation jumped to 8 centimeters"
 */
object AbbreviationExpander {

    /**
     * Expands running metrics abbreviations in text for TTS.
     * Preserves original capitalization and context.
     */
    fun expandForSpeech(text: String): String {
        var result = text

        // ── Heart Rate & Zones ────────────────────────────────────────────────────
        result = result.replace(Regex("\\bbpm\\b", RegexOption.IGNORE_CASE), "beats per minute")
        result = result.replace(Regex("\\bhr\\b", RegexOption.IGNORE_CASE), "heart rate")
        result = result.replace(Regex("\\bhz?\\b", RegexOption.IGNORE_CASE), "heart rate zone")
        result = result.replace(Regex("\\bzone (\\d)\\b", RegexOption.IGNORE_CASE), "zone $1")
        result = result.replace(Regex("\\bz(\\d)\\b", RegexOption.IGNORE_CASE), "zone $1")

        // ── Running Dynamics ──────────────────────────────────────────────────────
        result = result.replace(Regex("\\bgct\\b", RegexOption.IGNORE_CASE), "ground contact time")
        result = result.replace(Regex("\\bgcb\\b", RegexOption.IGNORE_CASE), "ground contact balance")
        result = result.replace(Regex("\\bvo\\b", RegexOption.IGNORE_CASE), "vertical oscillation")
        result = result.replace(Regex("\\bvr\\b", RegexOption.IGNORE_CASE), "vertical ratio")
        result = result.replace(Regex("\\bsl\\b", RegexOption.IGNORE_CASE), "stride length")

        // ── Power & Breathing ─────────────────────────────────────────────────────
        result = result.replace(Regex("\\bw\\b", RegexOption.IGNORE_CASE), "watts")
        result = result.replace(Regex("\\bpwr\\b", RegexOption.IGNORE_CASE), "power")
        result = result.replace(Regex("\\brr\\b", RegexOption.IGNORE_CASE), "respiration rate")
        result = result.replace(Regex("\\bresp\\b", RegexOption.IGNORE_CASE), "respiration")

        // ── Training Effect & Recovery ────────────────────────────────────────────
        result = result.replace(Regex("\\bate\\b", RegexOption.IGNORE_CASE), "aerobic training effect")
        result = result.replace(Regex("\\banate\\b", RegexOption.IGNORE_CASE), "anaerobic training effect")
        result = result.replace(Regex("\\bte\\b", RegexOption.IGNORE_CASE), "training effect")
        result = result.replace(Regex("\\bvo2\\s*max\\b", RegexOption.IGNORE_CASE), "VO2 max")

        // ── Distance & Time ───────────────────────────────────────────────────────
        result = result.replace(Regex("\\bkm\\b", RegexOption.IGNORE_CASE), "kilometers")
        result = result.replace(Regex("\\bm\\b", RegexOption.IGNORE_CASE), "meters")
        result = result.replace(Regex("\\bms\\b", RegexOption.IGNORE_CASE), "milliseconds")
        result = result.replace(Regex("\\bsec\\b", RegexOption.IGNORE_CASE), "seconds")
        result = result.replace(Regex("\\bmin\\b", RegexOption.IGNORE_CASE), "minutes")

        // ── Pace & Speed ──────────────────────────────────────────────────────────
        result = result.replace(Regex("\\bk\\/h\\b", RegexOption.IGNORE_CASE), "kilometers per hour")
        result = result.replace(Regex("\\bmph\\b", RegexOption.IGNORE_CASE), "miles per hour")
        result = result.replace(Regex("\\bm\\/s\\b", RegexOption.IGNORE_CASE), "meters per second")

        // ── Elevation & Grade ─────────────────────────────────────────────────────
        result = result.replace(Regex("\\bm\\/km\\b", RegexOption.IGNORE_CASE), "meters per kilometer")
        result = result.replace(Regex("\\bftm\\b", RegexOption.IGNORE_CASE), "feet per mile")

        // ── Percentage & Ratios ───────────────────────────────────────────────────
        result = result.replace(Regex("\\b%\\b", RegexOption.IGNORE_CASE), "percent")

        // ── Cadence ────────────────────────────────────────────────────────────────
        result = result.replace(Regex("\\bcad\\b", RegexOption.IGNORE_CASE), "cadence")
        result = result.replace(Regex("\\bspm\\b", RegexOption.IGNORE_CASE), "steps per minute")

        // ── Miscellaneous ─────────────────────────────────────────────────────────
        result = result.replace(Regex("\\bgps\\b", RegexOption.IGNORE_CASE), "GPS")
        result = result.replace(Regex("\\bai\\b", RegexOption.IGNORE_CASE), "AI")
        result = result.replace(Regex("\\btss\\b", RegexOption.IGNORE_CASE), "training stress score")
        result = result.replace(Regex("\\beta\\b", RegexOption.IGNORE_CASE), "estimated time of arrival")

        // ── Pace-difference cleanup ────────────────────────────────────────────
        // When OpenAI expresses a pace difference as "by X seconds per kilometer" immediately
        // after already naming the pace unit (e.g. "6:36 per kilometer by 42 seconds per
        // kilometer"), the repeated unit sounds like "per kilometer per kilometer" aloud.
        // Remove the redundant "per kilometer" from pace-difference clauses.
        result = cleanPaceDifference(result)

        return result
    }

    /**
     * Removes the redundant "per kilometer" unit from AI-generated pace-difference
     * descriptions so that spoken audio sounds natural.
     *
     * Root cause: OpenAI correctly labels the pace-delta unit as "per kilometer"
     * but this immediately follows another "per kilometer" in context, producing
     * the audible artefact "per kilometer per kilometer".
     *
     * Apply this to every coaching message string *before* passing it to the audio
     * queue or storing it in coaching history.
     *
     * Examples:
     *   "ahead by 42 seconds per kilometer" → "ahead by 42 seconds"
     *   "per kilometer per kilometer"        → "per kilometer"
     */
    fun cleanPaceDifference(text: String): String {
        var result = text

        // "by N seconds per kilometer" → "by N seconds"
        result = result.replace(
            Regex(
                "\\bby\\s+(\\d+)\\s+(second|minute)s?\\s+per\\s+kilo(?:meter|metre)s?",
                RegexOption.IGNORE_CASE
            )
        ) { mr ->
            val amount = mr.groupValues[1]
            val unit   = mr.groupValues[2]
            "by $amount ${unit}s"
        }

        // "by N minutes and M seconds per kilometer" → "by N minutes and M seconds"
        result = result.replace(
            Regex(
                "\\bby\\s+(\\d+)\\s+minutes?\\s+and\\s+(\\d+)\\s+seconds?\\s+per\\s+kilo(?:meter|metre)s?",
                RegexOption.IGNORE_CASE
            )
        ) { mr ->
            "by ${mr.groupValues[1]} minutes and ${mr.groupValues[2]} seconds"
        }

        // Direct duplicate fallback: "per kilometer per kilometer" → "per kilometer"
        result = result.replace(
            Regex(
                "\\bper\\s+kilo(?:meter|metre)s?\\s+per\\s+kilo(?:meter|metre)s?",
                RegexOption.IGNORE_CASE
            ),
            "per kilometer"
        )

        return result
    }

    /**
     * Formats raw seconds into human-readable time notation: "HH:MM:SS", "MM:SS", or "SS seconds".
     * 
     * This normalizes OpenAI coaching messages that might contain raw seconds like:
     * - "131 seconds faster" → "2 minutes and 11 seconds faster"
     * - "expected finish time 5400 seconds" → "1 hour and 30 minutes"
     *
     * Rules:
     * - 0-59 seconds: "X seconds"
     * - 60-3599 seconds: "M minutes and S seconds" (drops "and S" if S=0)
     * - 3600+ seconds: "H hours, M minutes and S seconds" (drops zero-value parts)
     *
     * Examples:
     *   formatDurationForSpeech(42) → "42 seconds"
     *   formatDurationForSpeech(131) → "2 minutes and 11 seconds"
     *   formatDurationForSpeech(3661) → "1 hour, 1 minute and 1 second"
     *   formatDurationForSpeech(5400) → "1 hour and 30 minutes"
     */
    fun formatDurationForSpeech(totalSeconds: Long): String {
        when {
            totalSeconds < 60 -> return "$totalSeconds seconds"
            totalSeconds < 3600 -> {
                val minutes = totalSeconds / 60
                val seconds = totalSeconds % 60
                return when {
                    seconds == 0L -> "$minutes minute${if (minutes == 1L) "" else "s"}"
                    else -> "$minutes minute${if (minutes == 1L) "" else "s"} and $seconds second${if (seconds == 1L) "" else "s"}"
                }
            }
            else -> {
                val hours = totalSeconds / 3600
                val remainingSeconds = totalSeconds % 3600
                val minutes = remainingSeconds / 60
                val seconds = remainingSeconds % 60
                
                val parts = mutableListOf<String>()
                if (hours > 0) parts.add("$hours hour${if (hours == 1L) "" else "s"}")
                if (minutes > 0) parts.add("$minutes minute${if (minutes == 1L) "" else "s"}")
                if (seconds > 0) parts.add("$seconds second${if (seconds == 1L) "" else "s"}")
                
                return when (parts.size) {
                    0 -> "0 seconds"
                    1 -> parts[0]
                    2 -> "${parts[0]} and ${parts[1]}"
                    else -> "${parts.dropLast(1).joinToString(", ")}, and ${parts.last()}"
                }
            }
        }
    }

    /**
     * Normalizes raw time values in coaching text.
     * Finds patterns like "131 seconds" and converts to "2 minutes and 11 seconds".
     * 
     * Examples:
     *   "...131 seconds faster..." → "...2 minutes and 11 seconds faster..."
     *   "...expected in 5400 seconds" → "...expected in 1 hour and 30 minutes"
     */
    fun normalizeTimeValues(text: String): String {
        var result = text
        
        // Match patterns like "N seconds" where N is a number >= 60
        // and replace with formatted duration
        result = result.replace(Regex("(\\d+)\\s+seconds(?!\\s+per)")) { mr ->
            val seconds = mr.groupValues[1].toLongOrNull() ?: return@replace mr.value
            if (seconds >= 60) {
                formatDurationForSpeech(seconds)
            } else {
                mr.value
            }
        }
        
        // Also handle patterns like "in N seconds" or "by N seconds"
        // for consistency
        result = result.replace(Regex("([a-z]\\s+)(\\d+)\\s+seconds\\b")) { mr ->
            val prefix = mr.groupValues[1]
            val seconds = mr.groupValues[2].toLongOrNull() ?: return@replace mr.value
            if (seconds >= 60) {
                "$prefix${formatDurationForSpeech(seconds)}"
            } else {
                mr.value
            }
        }
        
        return result
    }

    /**
     * Expands specific running metrics for clarity in speech.
     * Use this when you have structured data that needs human-readable output.
     *
     * Example:
     * ```
     * "Your ${expandMetric("GCT")} is 245 milliseconds"
     * // Output: "Your ground contact time is 245 milliseconds"
     * ```
     */
    fun expandMetric(abbreviation: String): String {
        return when (abbreviation.uppercase()) {
            "BPM" -> "beats per minute"
            "HR" -> "heart rate"
            "GCT" -> "ground contact time"
            "GCB" -> "ground contact balance"
            "VO" -> "vertical oscillation"
            "VR" -> "vertical ratio"
            "SL" -> "stride length"
            "PWR", "W" -> "power in watts"
            "RR", "RESP" -> "respiration rate"
            "ATE" -> "aerobic training effect"
            "ANATE" -> "anaerobic training effect"
            "TE" -> "training effect"
            "VO2" -> "VO2 max"
            "CAD", "SPM" -> "steps per minute"
            "KM" -> "kilometers"
            "M" -> "meters"
            "MS" -> "milliseconds"
            "SEC" -> "seconds"
            "MIN" -> "minutes"
            "K/H" -> "kilometers per hour"
            "MPH" -> "miles per hour"
            "M/S" -> "meters per second"
            "GPS" -> "GPS"
            "AI" -> "AI"
            "TSS" -> "training stress score"
            "ETA" -> "estimated time of arrival"
            else -> abbreviation
        }
    }

    /**
     * Creates human-readable descriptions of metrics with expanded units.
     * Use for TTS output when describing specific metrics.
     *
     * Example:
     * ```
     * describeMetric("GCT", 245.5)
     * // Output: "Ground contact time is 245 milliseconds"
     * ```
     */
    fun describeMetric(metric: String, value: Any?): String {
        if (value == null) return ""
        
        return when (metric.uppercase()) {
            "GCT" -> "Ground contact time is ${value} milliseconds"
            "GCB" -> "Ground contact balance is ${value} percent"
            "VO" -> "Vertical oscillation is ${value} centimeters"
            "VR" -> "Vertical ratio is ${value} percent"
            "SL" -> "Stride length is ${value} meters"
            "PWR", "RUNNINGPOWER" -> "Running power is ${value} watts"
            "RR", "RESPIRATIONRATE" -> "Respiration rate is ${value} breaths per minute"
            "BPM", "HR" -> "Heart rate is ${value} beats per minute"
            "CADENCE" -> "Cadence is ${value} steps per minute"
            "ATE" -> "Aerobic training effect is ${value} out of five"
            "ANATE" -> "Anaerobic training effect is ${value} out of five"
            "VO2MAX" -> "VO2 max is ${value} milliliters per kilogram per minute"
            else -> "$metric is $value"
        }
    }
}
