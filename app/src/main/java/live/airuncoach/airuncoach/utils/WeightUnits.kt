package live.airuncoach.airuncoach.utils

import android.content.SharedPreferences
import java.util.Locale
import kotlin.math.roundToLong

/** Unit the runner enters and reads body weight in. The server always stores kilograms. */
enum class WeightUnit(val label: String) { KG("kg"), LB("lb") }

/**
 * Body-weight unit handling. The profile used to accept kilograms only, and US runners typed
 * pounds into it ("235" → stored as 235 kg, BMI 74), which skewed plan generation, calorie
 * estimates and coaching. The chosen unit is remembered per device; the default is pounds for
 * the countries that use them and kilograms everywhere else.
 */
object WeightUnits {
    const val KG_PER_LB = 0.45359237
    private const val PREF_KEY = "weight_unit"
    private val POUND_COUNTRIES = setOf("US", "LR", "MM")

    fun defaultFor(country: String?): WeightUnit {
        val c = (country?.takeIf { it.isNotBlank() } ?: Locale.getDefault().country).uppercase()
        return if (c in POUND_COUNTRIES) WeightUnit.LB else WeightUnit.KG
    }

    fun load(prefs: SharedPreferences, country: String?): WeightUnit =
        prefs.getString(PREF_KEY, null)?.let { saved -> WeightUnit.entries.firstOrNull { it.name == saved } }
            ?: defaultFor(country)

    fun save(prefs: SharedPreferences, unit: WeightUnit) {
        prefs.edit().putString(PREF_KEY, unit.name).apply()
    }

    /** Kilograms → the text shown in a field of [unit] ("106.6", "235"). */
    fun format(kg: Double?, unit: WeightUnit): String {
        if (kg == null || kg <= 0) return ""
        val v = if (unit == WeightUnit.LB) kg / KG_PER_LB else kg
        val tenths = (v * 10).roundToLong()
        return if (tenths % 10 == 0L) (tenths / 10).toString() else "${tenths / 10}.${tenths % 10}"
    }

    /** Text entered in [unit] → kilograms (one decimal), or null if it isn't a positive number. */
    fun toKg(text: String, unit: WeightUnit): Double? {
        val v = text.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 } ?: return null
        val kg = if (unit == WeightUnit.LB) v * KG_PER_LB else v
        return (kg * 10).roundToLong() / 10.0
    }

    /** Stored "kg" that is implausible for the height (BMI > 55) but plausible as pounds (BMI 15–55). */
    fun looksLikePoundsStoredAsKg(kg: Double?, heightCm: Double?): Boolean {
        if (kg == null || heightCm == null || heightCm < 100 || heightCm > 250) return false
        val m2 = (heightCm / 100) * (heightCm / 100)
        val asLbBmi = kg * KG_PER_LB / m2
        return kg / m2 > 55 && asLbBmi in 15.0..55.0
    }

    /**
     * Stored kilograms that are implausibly light for the height (BMI < 13) but plausible if the
     * number was really kilograms typed with the unit on pounds (Naeem, 2026-11-22: "70" entered
     * as lb, saved as 31.8 kg at 164 cm). iOS mirror: `WeightUnits.looksLikeKgStoredAsPounds`.
     */
    fun looksLikeKgStoredAsPounds(kg: Double?, heightCm: Double?): Boolean {
        if (kg == null || kg <= 0) return false
        return unitSlip(kg, WeightUnit.LB, heightCm) == WeightUnit.KG
    }

    /** Body weights this far outside the human range are refused outright. */
    val VALID_KG = 20.0..350.0
    const val RANGE_MESSAGE = "Please enter a weight between 20 and 350 kg (44 to 772 lb)."

    /**
     * When the number typed reads as an implausible weight in [entered] units but a plausible one
     * in the other unit, returns that other unit. With a valid height it goes by BMI (implausible
     * < 13 or > 55, plausible 15–55); without one, by an adult weight range (30–200 kg).
     * iOS mirror: `WeightUnits.unitSlip`.
     */
    fun unitSlip(kg: Double, entered: WeightUnit, heightCm: Double?): WeightUnit? {
        val other = if (entered == WeightUnit.KG) WeightUnit.LB else WeightUnit.KG
        // The same typed number, read in the other unit.
        val typed = if (entered == WeightUnit.LB) kg / KG_PER_LB else kg
        val otherKg = if (other == WeightUnit.LB) typed * KG_PER_LB else typed
        if (heightCm != null && HeightUnits.isPlausible(heightCm)) {
            val m2 = (heightCm / 100) * (heightCm / 100)
            val bmi = kg / m2
            val otherBmi = otherKg / m2
            return if ((bmi < 13 || bmi > 55) && otherBmi in 15.0..55.0) other else null
        }
        val plausible = 30.0..200.0
        return if (kg !in plausible && otherKg in plausible) other else null
    }

    /** Re-express a field's text when the runner flips the unit (keeps blanks / partial input as-is). */
    fun convertText(text: String, from: WeightUnit, to: WeightUnit): String {
        if (from == to) return text
        return toKg(text, from)?.let { format(it, to) } ?: text
    }
}
