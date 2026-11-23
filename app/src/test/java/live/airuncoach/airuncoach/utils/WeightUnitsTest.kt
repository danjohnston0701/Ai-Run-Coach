package live.airuncoach.airuncoach.utils

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    // Naeem (2026-11-22): typed 70 with lb selected → 31.8 kg at 164 cm.
    @Test fun unitSlipCatchesKgTypedAsPounds() {
        val kg = WeightUnits.toKg("70", WeightUnit.LB)!!
        assertEquals(WeightUnit.KG, WeightUnits.unitSlip(kg, WeightUnit.LB, 164.0))
        assertTrue(WeightUnits.looksLikeKgStoredAsPounds(31.8, 164.0))
    }

    @Test fun unitSlipCatchesPoundsTypedAsKg() {
        assertEquals(WeightUnit.LB, WeightUnits.unitSlip(235.0, WeightUnit.KG, 178.0))
    }

    @Test fun unitSlipLeavesPlausibleWeightsAlone() {
        assertNull(WeightUnits.unitSlip(70.0, WeightUnit.KG, 164.0))
        assertNull(WeightUnits.unitSlip(WeightUnits.toKg("154", WeightUnit.LB)!!, WeightUnit.LB, 164.0))
        assertNull(WeightUnits.unitSlip(25.0, WeightUnit.KG, 125.0))   // a child
        assertFalse(WeightUnits.looksLikeKgStoredAsPounds(70.0, 164.0))
    }

    @Test fun heightMessagesNameTheSlip() {
        assertTrue(HeightUnits.cmEntryMessage(55.0).startsWith("Did you mean 5 ft 5 in?"))
        assertTrue(HeightUnits.cmEntryMessage(5.5).startsWith("5.5 looks like feet"))
        assertTrue(HeightUnits.cmEntryMessage(65.5).startsWith("65.5 looks like inches (5 ft 6 in, 166 cm)"))
        assertEquals(HeightUnits.RANGE_MESSAGE, HeightUnits.cmEntryMessage(300.0))
    }
}
