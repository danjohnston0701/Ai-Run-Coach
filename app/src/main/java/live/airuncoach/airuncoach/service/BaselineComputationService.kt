package live.airuncoach.airuncoach.service

import live.airuncoach.airuncoach.domain.model.RunSession
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Computes 4-week rolling baseline metrics for personalized AI coaching.
 * 
 * Ensures AI analysis is personalized to the individual runner's patterns,
 * not generic comparisons. Essential for elite-level coaching.
 */
object BaselineComputationService {

    data class RunnerBaseline(
        val heartRate: Int? = null,           // bpm
        val groundContactTime: Double? = null, // ms
        val verticalOscillation: Double? = null, // cm
        val verticalRatio: Double? = null,    // %
        val strideLength: Double? = null,     // m
        val cadence: Int? = null,             // steps/min
        val pace: Double? = null,             // min/km
        val sampleCount: Int = 0              // how many runs in baseline
    )

    /**
     * Compute 4-week rolling baselines from recent run history.
     * 
     * @param recentRuns Runs from the past 4 weeks (unfiltered)
     * @return Runner's baseline metrics averaged across 4-week window
     */
    fun computeBaseline(recentRuns: List<RunSession>): RunnerBaseline {
        if (recentRuns.isEmpty()) {
            return RunnerBaseline()  // Return empty if no history
        }

        // Filter to only completed runs with valid data
        val validRuns = recentRuns.filter { run ->
            run.heartRate != null && run.heartRate!! > 0
        }

        if (validRuns.isEmpty()) {
            return RunnerBaseline()
        }

        return RunnerBaseline(
            heartRate = computeAverageInt(validRuns.mapNotNull { it.heartRate }),
            groundContactTime = computeAverageDouble(validRuns.mapNotNull { it.avgGroundContactTime?.toDouble() }),
            verticalOscillation = computeAverageDouble(validRuns.mapNotNull { it.avgVerticalOscillation?.toDouble() }),
            verticalRatio = computeAverageDouble(validRuns.mapNotNull { it.avgVerticalRatio?.toDouble() }),
            strideLength = computeAverageDouble(validRuns.mapNotNull { it.avgStrideLength?.toDouble() }),
            cadence = computeAverageInt(validRuns.mapNotNull { 
                // Approximate cadence from HR and pace if not directly available
                it.heartRate?.let { hr -> (hr * 0.75).toInt() }
            }),
            pace = computeAverageDouble(validRuns.mapNotNull { 
                // Pace in min/km from duration and distance
                if (it.distance > 0 && (it.elapsedTime ?: 0) > 0) {
                    ((it.elapsedTime ?: 0) / 60.0) / it.distance
                } else null
            }),
            sampleCount = validRuns.size
        )
    }

    /**
     * Compute percentage delta between current metric and baseline.
     * Useful for AI to understand variance context.
     */
    fun computeDelta(currentValue: Double?, baselineValue: Double?): Double? {
        if (currentValue == null || baselineValue == null || baselineValue == 0.0) {
            return null
        }
        return ((currentValue - baselineValue) / baselineValue) * 100.0
    }

    /**
     * Compute percentage delta for integers.
     */
    fun computeDelta(currentValue: Int?, baselineValue: Int?): Double? {
        if (currentValue == null || baselineValue == null || baselineValue == 0) {
            return null
        }
        return ((currentValue - baselineValue).toDouble() / baselineValue.toDouble()) * 100.0
    }

    /**
     * Generate human-readable baseline comparison text for AI prompts.
     * 
     * Example: "HR baseline 158 bpm (from 24 runs), GCT baseline 245ms"
     */
    fun generateBaselineContext(baseline: RunnerBaseline): String {
        if (baseline.sampleCount == 0) {
            return "No baseline available (first run)"
        }

        val parts = mutableListOf<String>()
        
        baseline.heartRate?.let { 
            parts.add("HR baseline $it bpm") 
        }
        baseline.groundContactTime?.let { 
            parts.add("GCT baseline ${it.roundToInt()}ms") 
        }
        baseline.verticalOscillation?.let { 
            parts.add("VO baseline ${String.format("%.1f", it)}cm") 
        }
        baseline.strideLength?.let { 
            parts.add("stride baseline ${String.format("%.2f", it)}m") 
        }
        baseline.pace?.let { 
            parts.add("pace baseline ${String.format("%.1f", it)} min/km") 
        }

        return "${parts.joinToString(", ")} (from ${baseline.sampleCount} runs)"
    }

    /**
     * Generate AI instruction text about how to compare current run to baseline.
     */
    fun generateComparisonInstructions(baseline: RunnerBaseline, currentRun: RunSession): String {
        if (baseline.sampleCount == 0) {
            return "This is the runner's first run - no historical baseline available yet."
        }

        val instructions = StringBuilder()
        instructions.append("This runner's 4-week baselines (from ${baseline.sampleCount} runs):\n")
        
        baseline.heartRate?.let { baselineHR ->
            currentRun.heartRate?.let { currentHR ->
                val delta = computeDelta(currentHR.toDouble(), baselineHR.toDouble())
                if (delta != null) {
                    instructions.append("- Heart Rate: baseline $baselineHR bpm, current $currentHR bpm (${String.format(Locale.US, "%.1f", delta)}% ${if (delta > 0) "higher" else "lower"})\n")
                }
            }
        }

        baseline.groundContactTime?.let { baselineGCT ->
            currentRun.avgGroundContactTime?.let { currentGCT ->
                val delta = computeDelta(currentGCT, baselineGCT)
                if (delta != null) {
                    instructions.append("- Ground Contact Time: baseline ${baselineGCT.roundToInt()}ms, current ${currentGCT.roundToInt()}ms (${String.format(Locale.US, "%.1f", delta)}% ${if (delta > 0) "slower" else "faster"})\n")
                }
            }
        }

        baseline.verticalOscillation?.let { baselineVO ->
            currentRun.avgVerticalOscillation?.let { currentVO ->
                val delta = computeDelta(currentVO, baselineVO)
                if (delta != null) {
                    instructions.append("- Vertical Oscillation: baseline ${String.format(Locale.US, "%.1f", baselineVO)}cm, current ${String.format(Locale.US, "%.1f", currentVO)}cm (${String.format(Locale.US, "%.1f", delta)}% ${if (delta > 0) "higher" else "lower"})\n")
                }
            }
        }

        baseline.strideLength?.let { baselineStride ->
            currentRun.avgStrideLength?.let { currentStride ->
                val delta = computeDelta(currentStride, baselineStride)
                if (delta != null) {
                    instructions.append("- Stride Length: baseline ${String.format(Locale.US, "%.2f", baselineStride)}m, current ${String.format(Locale.US, "%.2f", currentStride)}m (${String.format(Locale.US, "%.1f", delta)}%)\n")
                }
            }
        }

        instructions.append("\nUse these deltas to contextualize performance. ")
        instructions.append("A runner's baseline IS their normal - adaptations to that baseline are what matter for coaching.")

        return instructions.toString()
    }

    // Private helpers
    private fun computeAverageInt(values: List<Int>): Int? {
        return if (values.isNotEmpty()) values.average().roundToInt() else null
    }

    private fun computeAverageDouble(values: List<Double>): Double? {
        return if (values.isNotEmpty()) values.average() else null
    }
}
