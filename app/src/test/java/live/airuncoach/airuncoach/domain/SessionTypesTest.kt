package live.airuncoach.airuncoach.domain

import live.airuncoach.airuncoach.domain.model.ChosenSession
import live.airuncoach.airuncoach.domain.model.ManualSessionStructure
import live.airuncoach.airuncoach.domain.model.PhysicalActivityType
import live.airuncoach.airuncoach.domain.model.RunSetupConfig
import live.airuncoach.airuncoach.domain.model.SelfConfiguredSessionPlan
import live.airuncoach.airuncoach.domain.model.SessionKind
import live.airuncoach.airuncoach.domain.model.SessionTypes
import live.airuncoach.airuncoach.domain.model.withChosenSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionTypesTest {

    @Test
    fun freeTypesHaveNoWorkoutTypeAndMatchTheOldToggle() {
        assertNull(SessionTypes.FREE_RUN.key)
        assertNull(SessionTypes.FREE_WALK.key)
        assertEquals(PhysicalActivityType.WALK, SessionTypes.defaultFor(PhysicalActivityType.WALK).activity)
        assertEquals(SessionTypes.FREE_RUN, SessionTypes.byKey(null))
    }

    @Test
    fun repAndRaceKeys() {
        assertEquals(setOf("intervals", "hill_repeats", "fartlek", "walk_run"), SessionTypes.REP_KEYS)
        assertEquals(setOf("race", "walk_race"), SessionTypes.RACE_KEYS)
        // Race days aren't AI-designable; a coach-designed walk is.
        assertFalse(SessionTypes.aiDesignable.any { it.kind == SessionKind.RACE })
        assertTrue(SessionTypes.aiDesignable.any { it.key == "walk" })
    }

    @Test
    fun structureValidityNeedsExactlyOneWorkAndOneRestLength() {
        assertTrue(ManualSessionStructure(reps = 6, workMeters = 400, restSeconds = 90).isValid())
        assertFalse(ManualSessionStructure(reps = 6, workMeters = 400, workSeconds = 60, restSeconds = 90).isValid())
        assertFalse(ManualSessionStructure(reps = 6, workMeters = 400).isValid())
        assertFalse(ManualSessionStructure(reps = 0, workMeters = 400, restSeconds = 90).isValid())
        assertEquals("10 min warm-up, 6 × 400 m, 90 s recovery, 5 min cool-down",
            ManualSessionStructure(reps = 6, workMeters = 400, restSeconds = 90, warmupMinutes = 10, cooldownMinutes = 5).summary())
    }

    @Test
    fun timedRepsPlanHasPhasesRepsAndATimedFinish() {
        val type = SessionTypes.byKey("hill_repeats")!!
        val s = ManualSessionStructure(reps = 8, workSeconds = 60, restSeconds = 90, warmupMinutes = 10, cooldownMinutes = 5)
        val plan = SelfConfiguredSessionPlan.build(type, s, maxHr = 190)
        assertTrue(SelfConfiguredSessionPlan.isSelfConfigured(plan))
        assertEquals("hill_repeats", plan.sessionType)
        assertEquals(listOf("warmup", "work", "recovery", "cooldown"), plan.phases.map { it.name })
        assertEquals(8, plan.phases[1].repetitions)
        // 10 + 8×1 + 8×1.5 + 5 = 35 min
        assertEquals(35, plan.targetMetrics.totalDurationMinutes)
        val finish = plan.triggers.single { it.type == "session_complete" }
        assertEquals("elapsed_min >= 35.0", finish.condition)
        assertTrue(plan.triggers.any { it.type == "hr_zone_high" })
    }

    @Test
    fun walkRunUsesJogAndWalkPhasesAndNoHrTriggerWithoutAge() {
        val plan = SelfConfiguredSessionPlan.build(SessionTypes.byKey("walk_run")!!,
            ManualSessionStructure(reps = 6, workSeconds = 180, restSeconds = 60), maxHr = null)
        assertEquals(listOf("jog", "walk"), plan.phases.map { it.name })
        assertFalse(plan.triggers.any { it.type == "hr_zone_high" })
    }

    @Test
    fun repSessionDropsDistanceAndTimeGoals() {
        val base = RunSetupConfig(targetDistance = 5f, hasTargetTime = true, targetMinutes = 25)
        val reps = base.withChosenSession(ChosenSession("intervals", null, "leave_open"))
        assertNull(reps.targetDistance)
        assertFalse(reps.hasTargetTime)
        assertEquals("intervals", reps.chosenWorkoutType)
        assertEquals("leave_open", reps.planSessionChoice)
        val tempo = base.withChosenSession(ChosenSession("tempo", null, null))
        assertEquals(5f, tempo.targetDistance)
        assertTrue(tempo.hasTargetTime)
    }
}
