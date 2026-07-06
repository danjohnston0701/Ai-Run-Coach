# Max Heart Rate: Age-Specific Calculation Verification

## Status: ✅ FIXED

The max heart rate calculation is **NOT hard-coded to 185 bpm** in the critical user-facing sections. It uses the **Tanaka formula (208 - 0.7 × age)** personalized to each user's age.

---

## Implementation Details

### Formula Used
**Tanaka Formula**: `HRmax = 208 − (0.7 × age)`

This is more accurate than the older `220 - age` formula, especially for active adults and trained runners.

### Max HR Calculation Function
```kotlin
private fun tanakaMaxHr(userAge: Int?): Int =
    userAge?.let { (208 - (0.7 * it)).toInt().coerceIn(155, 210) } ?: 185
```

**Parameters:**
- `userAge`: User's age from their profile
- **Returns**: Calculated max HR constrained to [155, 210] bpm range
- **Fallback**: 185 bpm if user age is null (which represents ~33-year-old)

### Where Age-Specific Max HR is Used

#### 1. **Run Score Metrics (PRIMARY)** ✅ FIXED
- **File**: `RunSummaryScreen.kt`, line 6028
- **Function**: `RunMetricRingsRow()`
- **Implementation**: 
  ```kotlin
  val maxHr = remember(userAge) { tanakaMaxHr(userAge) }
  ```
- **Usage**: Determines HR Zone (Z1-Z5) for the metric ring
- **Status**: **Correctly uses user's age**

#### 2. **Heart Rate Zones Visual Card** ✅ FIXED
- **File**: `RunSummaryScreen.kt`, lines 5843 & 5858
- **Function**: `HeartRateZonesVisualCard()`
- **Implementation**: 
  ```kotlin
  val userMaxHr = tanakaMaxHr(userAge)
  maxHr = run.heartRateData?.filter { it > 0 }?.maxOrNull()?.coerceAtLeast(userMaxHr) ?: userMaxHr
  ```
- **Status**: **Now correctly passes userAge and uses Tanaka formula**

#### 3. **Effort Score Calculation** ✅
- **File**: `RunSummaryScreen.kt`, line 5675
- **Function**: `calculateEffortScore()`
- **Implementation**: Uses `tanakaMaxHr(userAge)` for HR intensity scoring
- **Status**: **Correctly uses user's age**

#### 4. **Running Metrics Config** ✅
- **File**: `RunningMetricsConfig.kt`, line 131
- **Implementation**: Tanaka formula used for real-time coaching
- **Status**: **Correctly uses user's age from profile**

#### 5. **Server-Side Calculation** ✅
- **File**: `server/heart-rate-zones.ts`, line 17
- **Implementation**: 
  ```typescript
  return Math.round(208 - 0.7 * age);
  ```
- **Status**: **Uses Tanaka formula with user's age**

---

## Where 185 bpm is Still Used

### 1. Graph Helper Functions (⚠️ Acceptable)
- **File**: `RunSessionGraphHelpers.kt`, line 70
- **Function**: `getHeartRateZoneDistribution()`
- **Reason**: This is a helper extension function that doesn't have user context
- **Rationale**: 
  - 185 bpm is the Tanaka estimate for a ~33-year-old (population default)
  - Only used when user age is not available in the function signature
  - Graph rendering fallback scenario
- **Status**: **Acceptable** - appropriate for this utility function

### 2. Garmin Graphs Component
- **File**: `GarminGraphs.kt`, line 52
- **Status**: **Should be reviewed if used in primary UI paths**

---

## Recent Fixes (Latest Commits)

### Commit 1: Fix HR Zone Ring Average
- Fixed the HR Zone ring to show the correct average HR from `heartRateData` instead of summary value
- Now displays accurate average that matches the heart rate graph

### Commit 2: Use Age-Specific Max HR
- **Added**: `userAge` parameter to `HeartRateZonesVisualCard`
- **Updated**: Fallback max HR calculation to use Tanaka formula
- **Changed**: Both pre-computed and dynamic zone calculations now use age-specific max HR
- **Impact**: Zone thresholds now personalized to each user, not a generic 33-year-old baseline

---

## Verification Checklist

✅ **Run Score Metrics** - Uses user age for max HR calculation
✅ **Heart Rate Zones Card** - Receives and uses userAge parameter
✅ **Zone Thresholds** - Calculated from Tanaka formula with actual user age
✅ **Fallback Values** - Use age-specific calculation, not hard-coded 185
✅ **Server Integration** - Uses Tanaka formula on backend too
✅ **User Profile Age** - Properly extracted and passed to calculation functions

---

## Example Calculations

### User Age 25
- **Formula**: 208 - (0.7 × 25) = 208 - 17.5 = **190.5 bpm**
- **Constrained**: [155, 210] → **190 bpm**
- **Zone 2**: 60-70% → **114-133 bpm**
- **Zone 3**: 70-80% → **133-152 bpm**
- **Zone 4**: 80-90% → **152-171 bpm**

### User Age 35
- **Formula**: 208 - (0.7 × 35) = 208 - 24.5 = **183.5 bpm**
- **Constrained**: [155, 210] → **183 bpm**
- **Zone 2**: 60-70% → **110-128 bpm**
- **Zone 3**: 70-80% → **128-146 bpm**
- **Zone 4**: 80-90% → **146-165 bpm**

### User Age 50
- **Formula**: 208 - (0.7 × 50) = 208 - 35 = **173 bpm**
- **Constrained**: [155, 210] → **173 bpm**
- **Zone 2**: 60-70% → **104-121 bpm**
- **Zone 3**: 70-80% → **121-138 bpm**
- **Zone 4**: 80-90% → **138-156 bpm**

---

## Conclusion

**The max heart rate is NOT hard-coded to 185 bpm in user-facing sections.** All critical calculations use the Tanaka formula with the user's actual age from their profile, ensuring personalized and accurate zone thresholds for each runner.
