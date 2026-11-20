package live.airuncoach.airuncoach.domain.model

import live.airuncoach.airuncoach.network.model.DynamicCoachingPhase
import live.airuncoach.airuncoach.network.model.DynamicCoachingTrigger
import live.airuncoach.airuncoach.network.model.DynamicSessionCoachingPlan
import live.airuncoach.airuncoach.network.model.DynamicTargetMetrics

/**
 * Builds a coaching plan on the phone from a runner-configured rep structure (setup screen →
 * "Configure session"), so the run engine's existing phase timeline calls every rep, recovery,
 * warm-up and cool-down — exactly how it runs an AI plan session — without asking the AI to
 * design anything. The in-run cues themselves still come from the live coach.
 *
 * With a plan loaded the engine suppresses km splits, pace coaching and the free-run prompts for
 * interval types, so this plan adds the HR and form cues the runner still wants.
 *
 * Marked with [SESSION_GOAL] so the service can tell it from a plan session (it has no workout ID
 * to link or complete).
 */
object SelfConfiguredSessionPlan {
    const val SESSION_GOAL = "self_configured"

    fun isSelfConfigured(plan: DynamicSessionCoachingPlan?): Boolean = plan?.sessionGoal == SESSION_GOAL

    fun build(type: SessionTypeOption, s: ManualSessionStructure, maxHr: Int?): DynamicSessionCoachingPlan {
        val isWalkRun = type.key == "walk_run"
        val workName = if (isWalkRun) "jog" else "work"
        val recoveryName = if (isWalkRun) "walk" else "recovery"
        // Zone tops from max HR (same % bands as the server's 5-zone model).
        val z2Top = maxHr?.let { (it * 0.70).toInt() }
        val z3Top = maxHr?.let { (it * 0.80).toInt() }
        val z5Top = maxHr

        val phases = mutableListOf<DynamicCoachingPhase>()
        var order = 0
        // Walk-run run segments are easy running with no pace pressure: never a target pace.
        val workPaceMin = if (isWalkRun) null else s.workPaceMinSec
        val workPaceMax = if (isWalkRun) null else s.workPaceMaxSec
        val workPaceText = paceRange(workPaceMin, workPaceMax)
        val repText = s.workMeters?.let { "$it m" } ?: s.workSeconds?.let { minutesText(it / 60.0) } ?: ""
        val easyPaceText = paceRange(s.easyPaceMinSec, s.easyPaceMaxSec)
        if (s.warmupMinutes > 0) {
            phases += phase("warmup", order++, minutes = s.warmupMinutes.toDouble(), km = null, hrMax = z2Top, effort = "easy", focus = "relaxation",
                instr = "Easy warm-up. Build gradually." + (easyPaceText?.let { " Around $it." } ?: ""),
                paceMin = s.easyPaceMinSec, paceMax = s.easyPaceMaxSec)
        }
        phases += phase(workName, order++,
            minutes = s.workSeconds?.let { it / 60.0 }, km = s.workMeters?.let { it / 1000.0 },
            hrMax = if (isWalkRun) z3Top else z5Top, effort = if (isWalkRun) "moderate" else "hard",
            focus = if (type.key == "hill_repeats") "power" else "speed",
            instr = (if (isWalkRun) "Run $repText, easy and relaxed." else "Each rep: $repText, hard but controlled.") +
                (workPaceText?.let { " Target $it." } ?: ""), reps = s.reps,
            paceMin = workPaceMin, paceMax = workPaceMax)
        phases += phase(recoveryName, order++,
            minutes = s.restSeconds?.let { it / 60.0 }, km = s.restMeters?.let { it / 1000.0 },
            hrMax = z2Top?.let { if (isWalkRun) it else z3Top }, effort = "easy", focus = "relaxation",
            instr = if (isWalkRun) "Walk and recover." else "Ease right off and recover.", reps = s.reps)
        if (s.cooldownMinutes > 0) {
            phases += phase("cooldown", order++, minutes = s.cooldownMinutes.toDouble(), km = null, hrMax = z2Top, effort = "easy", focus = "relaxation",
                instr = "Easy cool-down." + (easyPaceText?.let { " Around $it or easier." } ?: ""),
                paceMin = s.easyPaceMinSec, paceMax = s.easyPaceMaxSec)
        }

        val allTimed = phases.all { (it.distanceKm ?: 0.0) <= 0.0 }
        val allDistance = phases.all { (it.durationMinutes ?: 0.0) <= 0.0 }
        // A session mixing timed and distance phases (10 min warm-up + 4 × 400 m) has no fixed total
        // time or distance: leave both at 0 (the coach would otherwise be told "1.6 km total") and
        // let the phase engine end it when the last phase is done.
        val totalMin = if (allDistance || allTimed) phases.sumOf { (it.durationMinutes ?: 0.0) * (it.repetitions ?: 1) } else 0.0
        val totalKm = if (allDistance || allTimed) phases.sumOf { (it.distanceKm ?: 0.0) * (it.repetitions ?: 1) } else 0.0

        val triggers = mutableListOf<DynamicCoachingTrigger>()
        if (s.warmupMinutes > 0) {
            triggers += trigger("warmup_start", "phase_start", "phase == warmup",
                "Warm-up — ${minutesText(s.warmupMinutes.toDouble())} easy, then we start the reps.", "once")
        }
        if (s.cooldownMinutes > 0) {
            triggers += trigger("cooldown_start", "phase_start", "phase == cooldown",
                "Reps done. Easy cool-down now for ${minutesText(s.cooldownMinutes.toDouble())}.", "once")
        }
        if (maxHr != null) {
            triggers += trigger("recovery_hr_high", "hr_zone_high", "hr > targetHRMax",
                "Heart rate is still {hr}. Ease right off so you're ready for the next one.", "on_condition",
                suppress = null)
        }
        // Rep pace cues against the paces confirmed on the Confirm session screen. 10 s/km of
        // slack either side: GPS pace lags at the start of a short rep, and the live coach
        // judges the rep from there. Not for walk-run (easy running, no pace pressure).
        if (workPaceText != null && !isWalkRun) {
            triggers += trigger("rep_pace_slow", "pace_drift_slow", "phase == $workName AND pace > targetPaceMax + 10",
                "You're at {pace} — the target is {targetPaceMin} to {targetPaceMax}. Lift it if you can.", "on_condition")
            triggers += trigger("rep_pace_fast", "pace_drift_fast", "phase == $workName AND pace < targetPaceMin - 10",
                "You're at {pace}, quicker than the {targetPaceMin} to {targetPaceMax} target. Settle into it so every rep matches.", "on_condition")
        }
        triggers += trigger("form_check", "periodic", "always",
            "Form check — relaxed shoulders, quick light feet, drive with the arms.", "periodic", seconds = 240)
        if (allTimed && totalMin > 0) {
            triggers += trigger("session_complete", "session_complete", "elapsed_min >= ${"%.1f".format(totalMin)}",
                "That's the session done. Great work.", "once")
        } else if (allDistance && totalKm > 0) {
            triggers += trigger("session_complete", "session_complete", "distance >= ${"%.2f".format(totalKm)}",
                "That's the session done. Great work.", "once")
        }

        return DynamicSessionCoachingPlan(
            sessionType = type.key ?: "intervals",
            sessionGoal = SESSION_GOAL,
            coachingTone = "motivational",
            cueingStrategy = "interval",
            preRunBrief = "${type.label}: ${s.summary()}." + (workPaceText?.let { " Reps at $it." } ?: "") + " I'll call each rep and recovery.",
            whyThisSession = "A ${type.label.lowercase()} session the runner set up themselves.",
            phases = phases,
            triggers = triggers,
            targetMetrics = DynamicTargetMetrics(
                totalDurationMinutes = totalMin.toInt(),
                totalDistanceKm = totalKm,
                primaryMetric = if (workPaceText != null) "pace" else if (maxHr != null) "heart_rate" else "effort",
                secondaryMetric = "effort",
                mainEffortPaceMin = workPaceMin, mainEffortPaceMax = workPaceMax,
                mainEffortHRMin = null, mainEffortHRMax = z5Top,
                structure = "repeats",
                isSpeedWork = type.key == "intervals" || type.key == "fartlek",
                isEnduranceWork = isWalkRun,
                isStrengthWork = type.key == "hill_repeats",
                isRecovery = false,
            ),
            coachingPolicy = null,
        )
    }

    private fun phase(
        name: String, order: Int, minutes: Double?, km: Double?, hrMax: Int?, effort: String, focus: String,
        instr: String, reps: Int? = null, paceMin: Int? = null, paceMax: Int? = null,
    ) = DynamicCoachingPhase(
        name = name, order = order, durationMinutes = minutes, distanceKm = km,
        targetPaceMin = paceMin, targetPaceMax = paceMax, targetHRMin = null, targetHRMax = hrMax,
        effort = effort, coachingFocus = focus, phaseInstructions = instr,
        repetitions = reps?.takeIf { it > 1 },
    )

    /** "1 minute", "5 minutes", "90 seconds", "2.5 minutes". */
    private fun minutesText(min: Double): String = when {
        min < 1.0 -> "${(min * 60).toInt()} seconds"
        min == 1.0 -> "1 minute"
        min % 1.0 == 0.0 -> "${min.toInt()} minutes"
        else -> "${"%.1f".format(min)} minutes"
    }

    /** "4:40–4:50/km", or null when either end is missing. */
    fun paceRange(min: Int?, max: Int?): String? {
        if (min == null || max == null || min <= 0 || max <= 0) return null
        fun f(s: Int) = "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
        return if (min == max) "${f(min)}/km" else "${f(min)}–${f(max)}/km"
    }

    private fun trigger(
        id: String, type: String, condition: String, message: String, frequency: String,
        seconds: Int? = null, suppress: List<String>? = null,
    ) = DynamicCoachingTrigger(
        id = id, type = type, condition = condition, message = message, frequency = frequency,
        frequencySeconds = seconds, alternativeMessages = null, alertType = null,
        suppressWhenIntensity = suppress, targetCadence = null,
    )
}
