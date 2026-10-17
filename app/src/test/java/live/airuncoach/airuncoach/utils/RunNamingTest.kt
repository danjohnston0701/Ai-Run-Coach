package live.airuncoach.airuncoach.utils

import org.junit.Assert.assertEquals
import org.junit.Test

/** Same expectations as the server's defaultRunName() (server/utils/run-derivation.ts). */
class RunNamingTest {

    @Test
    fun `free runs are named for the time of day`() {
        assertEquals("Night Run", RunNaming.defaultName("run", 4, "free"))
        assertEquals("Morning Run", RunNaming.defaultName("run", 5, null))
        assertEquals("Morning Walk", RunNaming.defaultName("walk", 11, "watch_standalone"))
        assertEquals("Lunch Run", RunNaming.defaultName("run", 12, null))
        assertEquals("Afternoon Run", RunNaming.defaultName("run", 14, null))
        assertEquals("Evening Run", RunNaming.defaultName("run", 20, null))
        assertEquals("Night Walk", RunNaming.defaultName("walk", 21, null))
    }

    @Test
    fun `planned runs are named for the session`() {
        assertEquals("Tempo Run", RunNaming.defaultName("run", 7, "tempo"))
        assertEquals("Long Run", RunNaming.defaultName("run", 7, "long run"))
        assertEquals("Hill Repeats", RunNaming.defaultName("run", 7, "hill_repeats"))
        assertEquals("parkrun Progression Run", RunNaming.defaultName("run", 7, "parkrun_progression"))
        assertEquals("Easy Walk", RunNaming.defaultName("walk", 7, "easy"))
        assertEquals("Walk/Run", RunNaming.defaultName("walk", 7, "walk_run"))
    }

    @Test
    fun `an existing name always wins`() {
        assertEquals("TWR Sunday", RunNaming.displayName("TWR Sunday", "run", 0L, "tempo"))
    }
}
