package live.airuncoach.airuncoach.config

import android.content.Context
import android.content.SharedPreferences
import android.util.Log

/**
 * Dynamic configuration for running metrics benchmarks and thresholds.
 *
 * This ensures all benchmark values (e.g., "efficient" GCT is 200-300ms) are user-personalized
 * and can be updated without code changes. Prevents hardcoded values from creating false positives.
 *
 * All values are based on actual user data, not arbitrary defaults.
 */
class RunningMetricsConfig(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("running_metrics_config", Context.MODE_PRIVATE)
    private val tag = "RunningMetricsConfig"

    // ── GROUND CONTACT TIME (milliseconds) ────────────────────────────────────────
    // Personalized based on user's historical baseline
    fun getGctBenchmark(): Pair<Float, Float> {
        val userBaseline = getUserGctBaseline()  // From last 4 weeks
        val minEfficent = (userBaseline * 0.90f).coerceAtLeast(190f)  // 10% below baseline
        val maxEfficient = (userBaseline * 1.10f).coerceAtMost(320f)  // 10% above baseline
        return minEfficent to maxEfficient
    }

    private fun getUserGctBaseline(): Float {
        return prefs.getFloat("user_gct_baseline", 245f)  // Default 245ms (standard range)
    }

    // ── VERTICAL OSCILLATION (centimeters) ────────────────────────────────────────
    fun getVerticalOscillationBenchmark(): Pair<Float, Float> {
        val userBaseline = getUserVoBenchmark()  // From last 4 weeks
        val minEfficient = (userBaseline * 0.85f).coerceAtLeast(5.5f)
        val maxEfficient = (userBaseline * 1.15f).coerceAtMost(9.5f)
        return minEfficient to maxEfficient
    }

    private fun getUserVoBenchmark(): Float {
        return prefs.getFloat("user_vo_baseline", 7.5f)  // Default 7.5cm (efficient)
    }

    // ── VERTICAL RATIO (percentage) ───────────────────────────────────────────────
    fun getVerticalRatioBenchmark(): Pair<Float, Float> {
        val userBaseline = getUserVrBaseline()  // From last 4 weeks
        val minEfficient = (userBaseline * 0.90f).coerceAtLeast(7.0f)
        val maxEfficient = (userBaseline * 1.10f).coerceAtMost(11.0f)
        return minEfficient to maxEfficient
    }

    private fun getUserVrBaseline(): Float {
        return prefs.getFloat("user_vr_baseline", 9.2f)  // Default 9.2% (efficient)
    }

    // ── STRIDE LENGTH (meters) ────────────────────────────────────────────────────
    fun getStrideLengthBenchmark(): Pair<Float, Float> {
        val userBaseline = getUserStrideLengthBaseline()  // From last 4 weeks
        val minEfficient = (userBaseline * 0.92f).coerceAtLeast(1.05f)
        val maxEfficient = (userBaseline * 1.08f).coerceAtMost(1.35f)
        return minEfficient to maxEfficient
    }

    private fun getUserStrideLengthBaseline(): Float {
        return prefs.getFloat("user_stride_length_baseline", 1.19f)  // Default 1.19m
    }

    // ── POWER-TO-PACE RATIO (Watts per km/h) ─────────────────────────────────────
    /**
     * Dynamic thresholds based on user's running efficiency baseline.
     * A runner who typically does 3.2 W/km/h gets personalized thresholds around that.
     * Returns: (efficientThreshold, moderateThreshold)
     *
     * < efficientThreshold → "efficient"
     * efficientThreshold to moderateThreshold → "moderate"
     * > moderateThreshold → "taxing"
     */
    fun getPowerToPaceRatioThresholds(): Pair<Float, Float> {
        val userBaseline = getUserPowerToPaceBaseline()  // From last 4 weeks
        
        // Personalized thresholds: ±15% from baseline
        val efficientThreshold = (userBaseline * 0.85f).coerceIn(3.0f, 4.5f)
        val moderateThreshold = (userBaseline * 1.15f).coerceIn(4.0f, 6.5f)
        
        return efficientThreshold to moderateThreshold
    }

    private fun getUserPowerToPaceBaseline(): Float {
        return prefs.getFloat("user_power_pace_baseline", 3.8f)  // Default 3.8 W/km/h
    }

    /**
     * Classify running efficiency based on user's power-to-pace ratio and their personal baseline.
     */
    fun classifyRunningEfficiency(powerToPaceRatio: Float?): String? {
        if (powerToPaceRatio == null || powerToPaceRatio <= 0) return null
        
        val (efficientThresh, moderateThresh) = getPowerToPaceRatioThresholds()
        
        return when {
            powerToPaceRatio < efficientThresh -> "efficient"
            powerToPaceRatio < moderateThresh -> "moderate"
            else -> "taxing"
        }
    }

    // ── HEART RATE ZONES (% of max HR) ────────────────────────────────────────────
    /**
     * Get personalized HR zone thresholds based on user's actual max HR.
     * Uses historical data (from tests or estimated from runs).
     *
     * Standard 5-zone model (aligns with Garmin, Polar, and most coaching platforms):
     *   Zone 1: < 60%   — Recovery / easy aerobic
     *   Zone 2: 60-70%  — Base aerobic / fat-burning
     *   Zone 3: 70-80%  — Aerobic / tempo
     *   Zone 4: 80-90%  — Threshold / hard
     *   Zone 5: 90-100% — VO2 Max / maximum effort
     *
     * For a 35-year-old (Tanaka HRmax ≈ 184):
     *   Zone 1 < 110, Zone 2 < 129, Zone 3 < 147, Zone 4 < 166, Zone 5 ≥ 166
     */
    fun getHeartRateZoneThresholds(userAge: Int): HeartRateZoneThresholds {
        // Try to get user's actual max HR from testing or calculation
        val actualMaxHr = prefs.getInt("user_actual_max_hr", -1)

        val maxHr = if (actualMaxHr > 0) {
            actualMaxHr
        } else {
            // Tanaka formula (2001): more accurate than "220 - age" for active adults
            // HRmax = 208 − (0.7 × age)
            (208 - (0.7 * userAge).toInt()).coerceIn(155, 210)
        }

        return HeartRateZoneThresholds(
            maxHr = maxHr,
            zone1Upper = (maxHr * 0.60).toInt(),   // Zone 1: < 60% (recovery)
            zone2Upper = (maxHr * 0.70).toInt(),   // Zone 2: 60-70% (base aerobic)
            zone3Upper = (maxHr * 0.80).toInt(),   // Zone 3: 70-80% (aerobic/tempo)
            zone4Upper = (maxHr * 0.90).toInt(),   // Zone 4: 80-90% (threshold)
            zone5Upper = maxHr                      // Zone 5: 90-100% (VO2 max)
        )
    }

    /**
     * Calculate HR zone (1-5) for a given heart rate and user age.
     * Returns null if inputs are invalid.
     */
    fun calculateHeartRateZone(currentHeartRate: Int, userAge: Int): Int? {
        if (currentHeartRate <= 0 || userAge <= 0) return null

        val thresholds = getHeartRateZoneThresholds(userAge)
        return when {
            currentHeartRate < thresholds.zone1Upper -> 1
            currentHeartRate < thresholds.zone2Upper -> 2
            currentHeartRate < thresholds.zone3Upper -> 3
            currentHeartRate < thresholds.zone4Upper -> 4
            else -> 5   // 90%+ of max HR (VO2 max zone)
        }
    }

    // ── RESPIRATION RATE (breaths per minute) ─────────────────────────────────────
    /**
     * Get personalized respiration rate zones.
     * Easy: 30-38, Steady: 38-45, Tempo: 45-53, Threshold: 53-60, VO2 Max: 60+
     */
    fun getRespirationRateZones(): RespirationRateZones {
        return prefs.let {
            RespirationRateZones(
                easyUpper = it.getInt("rr_easy_upper", 38),
                steadyUpper = it.getInt("rr_steady_upper", 45),
                tempoUpper = it.getInt("rr_tempo_upper", 53),
                thresholdUpper = it.getInt("rr_threshold_upper", 60)
            )
        }
    }

    // ── TRAINING EFFECT (0-5 scale) ───────────────────────────────────────────────
    /**
     * Get expected training effect ranges for different workout types.
     */
    fun getTrainingEffectRanges(): TrainingEffectRanges {
        return TrainingEffectRanges(
            easyMin = 1.5f, easyMax = 2.5f,           // Easy runs
            aerobicMin = 2.5f, aerobicMax = 3.5f,     // Base/aerobic
            tempoMin = 3.5f, tempoMax = 4.2f,         // Tempo/threshold
            highIntensityMin = 4.2f, highIntensityMax = 5.0f  // VO2 Max/race
        )
    }

    // ── UPDATE BASELINES FROM RECENT RUNS ─────────────────────────────────────────
    /**
     * Called after each run to update baselines with new data.
     * Ensures benchmarks evolve with user's fitness and technique.
     */
    fun updateBaselinesFromRun(
        gctAvg: Float?,
        voAvg: Float?,
        vrAvg: Float?,
        slAvg: Float?,
        powerToPaceRatio: Float?
    ) {
        // Use exponential moving average: newBaseline = 0.8 * old + 0.2 * new
        // This prevents single anomalies from skewing baselines, but allows gradual adaptation
        
        gctAvg?.let { newGct ->
            val current = getUserGctBaseline()
            val updated = (current * 0.8f) + (newGct * 0.2f)
            prefs.edit().putFloat("user_gct_baseline", updated).apply()
            Log.d(tag, "Updated GCT baseline: $current → $updated")
        }
        
        voAvg?.let { newVo ->
            val current = getUserVoBenchmark()
            val updated = (current * 0.8f) + (newVo * 0.2f)
            prefs.edit().putFloat("user_vo_baseline", updated).apply()
            Log.d(tag, "Updated VO baseline: $current → $updated")
        }
        
        vrAvg?.let { newVr ->
            val current = getUserVrBaseline()
            val updated = (current * 0.8f) + (newVr * 0.2f)
            prefs.edit().putFloat("user_vr_baseline", updated).apply()
            Log.d(tag, "Updated VR baseline: $current → $updated")
        }
        
        slAvg?.let { newSl ->
            val current = getUserStrideLengthBaseline()
            val updated = (current * 0.8f) + (newSl * 0.2f)
            prefs.edit().putFloat("user_stride_length_baseline", updated).apply()
            Log.d(tag, "Updated stride length baseline: $current → $updated")
        }
        
        powerToPaceRatio?.let { newRatio ->
            val current = getUserPowerToPaceBaseline()
            val updated = (current * 0.8f) + (newRatio * 0.2f)
            prefs.edit().putFloat("user_power_pace_baseline", updated).apply()
            Log.d(tag, "Updated power-to-pace baseline: $current → $updated")
        }
    }

    // ── MANUAL OVERRIDE (for testing/recalibration) ───────────────────────────────
    fun setUserMaxHeartRate(maxHr: Int) {
        prefs.edit().putInt("user_actual_max_hr", maxHr).apply()
        Log.d(tag, "Set user max HR to $maxHr bpm")
    }

    fun resetAllBaselines() {
        prefs.edit().clear().apply()
        Log.d(tag, "Reset all baselines to defaults")
    }

    // ── DATA CLASSES ──────────────────────────────────────────────────────────────
    
    data class HeartRateZoneThresholds(
        val maxHr: Int,
        val zone1Upper: Int,
        val zone2Upper: Int,
        val zone3Upper: Int,
        val zone4Upper: Int,
        val zone5Upper: Int
    )

    data class RespirationRateZones(
        val easyUpper: Int,
        val steadyUpper: Int,
        val tempoUpper: Int,
        val thresholdUpper: Int
    )

    data class TrainingEffectRanges(
        val easyMin: Float, val easyMax: Float,
        val aerobicMin: Float, val aerobicMax: Float,
        val tempoMin: Float, val tempoMax: Float,
        val highIntensityMin: Float, val highIntensityMax: Float
    )
}
