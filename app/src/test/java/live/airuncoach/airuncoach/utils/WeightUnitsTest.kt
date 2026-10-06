package live.airuncoach.airuncoach.utils

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WeightUnitsTest {
    @Test fun poundsToKg() {
        assertEquals(106.6, WeightUnits.toKg("235", WeightUnit.LB)!!, 0.0001)
        assertEquals(80.0, WeightUnits.toKg("80", WeightUnit.KG)!!, 0.0001)
        assertEquals(72.5, WeightUnits.toKg("72,5", WeightUnit.KG)!!, 0.0001)   // comma decimal
    }

    @Test fun rejectsBlankAndNonPositive() {
        assertNull(WeightUnits.toKg("", WeightUnit.KG))
        assertNull(WeightUnits.toKg("abc", WeightUnit.LB))
        assertNull(WeightUnits.toKg("0", WeightUnit.KG))
    }

    @Test fun formatsForDisplay() {
        assertEquals("235", WeightUnits.format(106.6, WeightUnit.LB))
        assertEquals("106.6", WeightUnits.format(106.6, WeightUnit.KG))
        assertEquals("80", WeightUnits.format(80.0, WeightUnit.KG))
        assertEquals("", WeightUnits.format(null, WeightUnit.KG))
    }

    @Test fun flippingUnitsRoundTrips() {
        val lb = WeightUnits.convertText("106.6", WeightUnit.KG, WeightUnit.LB)
        assertEquals("235", lb)
        assertEquals("106.6", WeightUnits.convertText(lb, WeightUnit.LB, WeightUnit.KG))
        assertEquals("", WeightUnits.convertText("", WeightUnit.KG, WeightUnit.LB))
    }

    @Test fun defaultUnitByCountry() {
        assertEquals(WeightUnit.LB, WeightUnits.defaultFor("US"))
        assertEquals(WeightUnit.KG, WeightUnits.defaultFor("NZ"))
        assertEquals(WeightUnit.KG, WeightUnits.defaultFor("GB"))
    }
}
