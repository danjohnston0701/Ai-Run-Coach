# Bug Fix: Training Plan NaN Database Error

## Issue

User Terry encountered a **500 error** when creating an AI training plan on iOS:

```
Error: invalid input syntax for type integer: "NaN"
Error generating training plan: error: invalid input syntax for type integer: "NaN"
```

The error occurred at the database layer when trying to insert `totalWeeks` field.

---

## Root Cause

The `weeksUntilTarget` calculation could become `NaN` in these scenarios:

1. **Missing both `durationWeeks` and `targetDate`**: Falls back to `getPlanDuration()` (safe)
2. **Invalid `targetDate` format**: `new Date(invalidDate)` → `NaN` in calculations
3. **Missing `durationWeeks` AND invalid `targetDate`**: Results in `NaN`
4. **Both values provided but invalid**: `NaN` from date math

The problematic code:
```typescript
const weeksUntilTarget = (durationWeeks && durationWeeks > 0) ? durationWeeks : 
  (targetDate ? 
    Math.ceil((targetDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)) : 
    getPlanDuration(goalType, experienceLevel));
```

If `targetDate.getTime()` is invalid, the division returns `NaN`, which gets inserted into the database.

---

## Solution Implemented

### 1. **Robust Duration Calculation** (`training-plan-service.ts`)

```typescript
// Priority: durationWeeks (user-selected) > targetDate > default based on goal/experience
let weeksUntilTarget = 0;
if (durationWeeks && durationWeeks > 0) {
  weeksUntilTarget = durationWeeks;
} else if (targetDate && targetDate instanceof Date && !isNaN(targetDate.getTime())) {
  const calculatedWeeks = Math.ceil((targetDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000));
  // Ensure result is a valid positive number, fallback to default if calculation failed
  weeksUntilTarget = (calculatedWeeks && calculatedWeeks > 0) ? calculatedWeeks : getPlanDuration(goalType, experienceLevel);
} else {
  weeksUntilTarget = getPlanDuration(goalType, experienceLevel);
}

// Safety check: ensure weeksUntilTarget is a valid positive integer
if (!Number.isInteger(weeksUntilTarget) || weeksUntilTarget <= 0) {
  weeksUntilTarget = getPlanDuration(goalType, experienceLevel);
}
```

**Key improvements:**
- ✅ Type-checks `targetDate` as `instanceof Date`
- ✅ Validates `getTime()` is not `NaN`
- ✅ Only uses calculated value if positive
- ✅ Falls back to safe default if anything fails
- ✅ Final validation ensures result is a valid positive integer

### 2. **Input Validation** (`routes.ts`)

```typescript
// Validate duration inputs
if (!durationWeeks && !targetDate) {
  return res.status(400).json({ 
    error: "Either durationWeeks or targetDate must be provided" 
  });
}

// Validate durationWeeks if provided
if (durationWeeks && (!Number.isInteger(durationWeeks) || durationWeeks <= 0)) {
  return res.status(400).json({ 
    error: "durationWeeks must be a positive integer" 
  });
}

// Validate and parse targetDate
let parsedTargetDate: Date | undefined;
if (targetDate) {
  parsedTargetDate = new Date(targetDate);
  if (isNaN(parsedTargetDate.getTime())) {
    return res.status(400).json({ 
      error: "targetDate must be a valid date (ISO 8601 format)" 
    });
  }
  // Ensure target date is in the future
  if (parsedTargetDate.getTime() <= Date.now()) {
    return res.status(400).json({ 
      error: "targetDate must be in the future" 
    });
  }
}
```

**Key improvements:**
- ✅ Rejects requests with invalid input before processing
- ✅ Validates date format early
- ✅ Ensures target date is in the future (no past dates)
- ✅ Clear error messages to client (helps iOS fix the request)

---

## How It Was Happening

1. **iOS sends request** with invalid/missing `targetDate`
2. **Routes receives request**, but validation is missing
3. **Backend calculates `weeksUntilTarget`** from invalid date → `NaN`
4. **Database insert fails** because `NaN` cannot be cast to integer
5. **500 error** returned to user with "invalid input syntax for type integer"

---

## What Will Happen Now

### Scenario 1: Valid `durationWeeks`
- ✅ Uses `durationWeeks` directly
- ✅ No date parsing needed
- ✅ Immediate success

### Scenario 2: Valid `targetDate`
- ✅ Early validation catches format errors → 400 response
- ✅ Checks date is in future → 400 response if not
- ✅ Calculates weeks correctly
- ✅ Success

### Scenario 3: Both Missing
- ✅ Early validation catches it → 400 response
- ✅ User fixes request and retries
- ✅ No 500 error

### Scenario 4: Both Invalid/Malformed
- ✅ Early validation catches it → 400 response
- ✅ Clear error message tells iOS what's wrong
- ✅ No database errors

---

## Files Modified

1. **`server/training-plan-service.ts`** (lines 238-254)
   - Robust `weeksUntilTarget` calculation
   - Multiple fallback safety checks

2. **`server/routes.ts`** (lines 10210-10243)
   - Input validation before processing
   - Early rejection of invalid data
   - Clear error messages

---

## Testing

✅ Test with valid `durationWeeks` (e.g., 12)
✅ Test with valid `targetDate` (future date, ISO format)
✅ Test with both provided (should use `durationWeeks`)
✅ Test with invalid date format (should get 400)
✅ Test with past target date (should get 400)
✅ Test with both missing (should get 400)
✅ Test with non-integer `durationWeeks` (should get 400)

---

## Result

**Before fix:**
```
POST /api/training-plans/generate
Status: 500 Internal Server Error
Error: invalid input syntax for type integer: "NaN"
```

**After fix:**
```
POST /api/training-plans/generate
Status: 400 Bad Request  (if validation fails)
Error: "Either durationWeeks or targetDate must be provided"
OR: "targetDate must be a valid date (ISO 8601 format)"
OR: "durationWeeks must be a positive integer"

Success: 201 Created (plan generated successfully)
```

---

## Why This Happened

The iOS app was likely:
1. Not providing `targetDate` in ISO 8601 format (e.g., sending "2026-05-15" without timezone)
2. Or parsing the date incorrectly and sending an invalid value
3. Or both `durationWeeks` and `targetDate` were missing

The backend had no validation, so it silently accepted the bad data and failed at the database layer (worst place to fail).

---

## Prevention

✅ Input validation is now in place
✅ Clear error messages guide client fixes
✅ Database layer won't receive invalid data
✅ Similar validations needed for other endpoints

**Next step**: Review iOS app's training plan creation screen to ensure it's sending valid data in the correct format.
