package live.airuncoach.airuncoach.utils

import android.content.SharedPreferences
import java.util.Locale
import kotlin.math.roundToInt

/** Unit the runner enters height in. The server always stores centimetres. */
enum class HeightUnit(val label: String) { CM("cm"), FT_IN("ft in") }

/**
 * Height entry — iOS mirror is `HeightUnits` in WeightUnits.swift. The field used to take
 * centimetres only, and Karen (2026-11-23) typed 5'5" as "55", which skewed calories, cadence and
 * BMI. Feet and inches are offered, and anything outside 100–250 cm is refused (the server
 * ignores it too).
 */
object HeightUnits {
    val VALID_CM = 100.0..250.0
    const val CM_PER_INCH = 2.54
    const val RANGE_MESSAGE = "Please enter a height between 100 and 250 cm (3 ft 4 in to 8 ft 2 in)."
    private const val PREF_KEY = "height_unit"
    private val FEET_COUNTRIES = setOf("US", "LR", "MM", "GB")

    fun defaultFor(country: String?): HeightUnit {
        val c = (country?.takeIf { it.isNotBlank() } ?: Locale.getDefault().country).uppercase()
        return if (c in FEET_COUNTRIES) HeightUnit.FT_IN else HeightUnit.CM
    }

    fun load(prefs: SharedPreferences, country: String?): HeightUnit =
        prefs.getString(PREF_KEY, null)?.let { saved -> HeightUnit.entries.firstOrNull { it.name == saved } }
            ?: defaultFor(country)

    fun save(prefs: SharedPreferences, unit: HeightUnit) {
        prefs.edit().putString(PREF_KEY, unit.name).apply()
    }

    fun isPlausible(cm: Double?): Boolean = cm != null && cm in VALID_CM

    /** Centimetres → whole feet and inches (165 → 5 ft 5 in). */
    fun feetInches(cm: Double): Pair<Int, Int> {
        val total = (cm / CM_PER_INCH).roundToInt()
        return total / 12 to total % 12
    }

    /** Feet and inches as typed → centimetres (one decimal); null when both are blank. */
    fun cm(feet: String, inches: String): Double? {
        val f = feet.trim().toDoubleOrNull() ?: 0.0
        val i = inches.trim().replace(',', '.').toDoubleOrNull() ?: 0.0
        if (f <= 0 && i <= 0) return null
        return ((f * 12 + i) * CM_PER_INCH * 10).roundToInt() / 10.0
    }

    private fun g(v: Double): String = if (v % 1.0 == 0.0) v.toInt().toString() else v.toString()

    /**
     * Why a centimetre entry is out of range, naming the likely slip: feet ("5.5") or inches ("65.5")
     * typed into the cm field, or a feet-and-inches number run together ("55" for 5 ft 5 in).
     * iOS mirror: `HeightUnits.cmEntryMessage`.
     */
    fun cmEntryMessage(cm: Double): String {
        if (cm >= 3 && cm < 9) {
            return "${g(cm)} looks like feet. Switch to ft in, or enter centimetres (5 ft 5 in is 165 cm)."
        }
        // Karen typed 5 ft 5 in as "55" (2026-11-23): a whole number reads as feet then inches.
        if (cm in 30.0..89.0 && cm % 1.0 == 0.0) {
            val feet = cm.toInt() / 10
            val inches = cm.toInt() % 10
            return "Did you mean $feet ft $inches in? Switch to ft in, or enter centimetres (${((feet * 12 + inches) * CM_PER_INCH).roundToInt()} cm)."
        }
        if (cm in 39.0..98.0) {
            val asInches = cm * CM_PER_INCH
            if (asInches in VALID_CM) {
                val (f, i) = feetInches(asInches)
                return "${g(cm)} looks like inches ($f ft $i in, ${asInches.roundToInt()} cm). Please enter centimetres or switch to ft in."
            }
        }
        return RANGE_MESSAGE
    }

    fun cm(text: String): Double? = text.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 }
}
