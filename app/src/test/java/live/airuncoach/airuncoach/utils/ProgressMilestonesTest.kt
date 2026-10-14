package live.airuncoach.airuncoach.utils

import live.airuncoach.airuncoach.utils.ProgressMilestones.Window
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProgressMilestonesTest {
    @Test fun windowScalesWithSpeedWithinBounds() {
        assertEquals(20.0, ProgressMilestones.windowMeters(1.4), 0.001)   // walker: floor
        assertEquals(24.0, ProgressMilestones.windowMeters(3.0), 0.001)   // 5:33/km runner
        assertEquals(50.0, ProgressMilestones.windowMeters(8.0), 0.001)   // cap
        assertEquals(20.0, ProgressMilestones.windowMeters(0.0), 0.001)
        assertEquals(20.0, ProgressMilestones.windowMeters(Double.NaN), 0.001)
    }

    @Test fun firesOnTimeOrNotAtAll() {
        // 3 km run, 50% = 1500 m, runner at 3 m/s → 24 m window
        assertEquals(Window.NOT_YET, ProgressMilestones.window(1500.0, 1499.0, 3.0))
        assertEquals(Window.OPEN, ProgressMilestones.window(1500.0, 1500.0, 3.0))
        assertEquals(Window.OPEN, ProgressMilestones.window(1500.0, 1524.0, 3.0))
        assertEquals(Window.MISSED, ProgressMilestones.window(1500.0, 1525.0, 3.0))
        // Miel's 2026-10-12 run: "25%" spoken at 1.4 km of 3 km — must be skipped now
        assertEquals(Window.MISSED, ProgressMilestones.window(750.0, 1400.0, 2.5))
    }

    @Test fun kmMarkerOverlap() {
        assertTrue(ProgressMilestones.overlapsKmMarker(1000.0))    // 25% of 4 km
        assertTrue(ProgressMilestones.overlapsKmMarker(2200.0))
        assertFalse(ProgressMilestones.overlapsKmMarker(1500.0))   // 50% of 3 km
        assertFalse(ProgressMilestones.overlapsKmMarker(750.0))    // before the first km split
        assertFalse(ProgressMilestones.overlapsKmMarker(1250.0))   // 25% of 5 km
    }

    @Test fun finalStretch() {
        assertTrue(ProgressMilestones.insideFinalStretch(1500.0, 2000.0, 500.0))   // 75% of 2 km
        assertFalse(ProgressMilestones.insideFinalStretch(3750.0, 5000.0, 500.0))  // 75% of 5 km
    }

    @Test fun parsesDistancePctThresholds() {
        assertEquals(50.0, ProgressMilestones.distancePctThreshold("distance_pct > 50")!!, 0.0)
        assertEquals(75.0, ProgressMilestones.distancePctThreshold("distance_pct>=75 && phase == main")!!, 0.0)
        assertEquals(33.5, ProgressMilestones.distancePctThreshold("distance_pct >= 33.5")!!, 0.0)
        assertNull(ProgressMilestones.distancePctThreshold("distance_pct < 90"))
        assertNull(ProgressMilestones.distancePctThreshold("hr > 160"))
        assertNull(ProgressMilestones.distancePctThreshold(null))
    }
}
