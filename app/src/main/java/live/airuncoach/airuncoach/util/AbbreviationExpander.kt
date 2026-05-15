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
