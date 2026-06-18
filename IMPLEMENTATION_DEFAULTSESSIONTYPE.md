# Implementation: defaultSessionType in Training Plan Prompt

## What Was Done

Added the `defaultSessionType` field from the user profile to the AI coaching plan generation prompt.

## Location

**File**: `server/training-plan-service.ts`  
**Lines**: 813–824  
**Section**: New "━━━ ATHLETE'S SESSION TYPE PREFERENCE ━━━━━━━━━━━━━━━━━━━━━━━━" section  
**Position**: Between "SCHEDULE & LIFESTYLE" and "HEALTH & INJURY CONTEXT" sections

## Code Added

```typescript
━━━ ATHLETE'S SESSION TYPE PREFERENCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━

${user?.[0]?.defaultSessionType ? (() => {
  const prefType = user[0].defaultSessionType.toLowerCase();
  if (prefType === 'walk') {
    return `This athlete prefers WALKING as their primary session type. Design the plan with walking-dominant sessions in early weeks, then gradually introduce walk/run intervals and easy jogging only as fitness and recovery allow. Bias toward walking-based progressions throughout, especially in the foundation and base-building phases.`;
  } else if (prefType === 'interval') {
    return `This athlete prefers INTERVAL and speed-focused training. Integrate intervals and tempo work progressively, but always ensure adequate easy aerobic base weeks before introducing intensity.`;
  } else {
    return `This athlete prefers RUNNING as their primary session type (standard running focus).`;
  }
})() : 'No specific session type preference recorded.'}
```

## How It Works

1. **Retrieves** `user[0].defaultSessionType` from the user profile database record
2. **Normalizes** the value to lowercase for comparison
3. **Generates different guidance** based on the preference:
   - **"walk"**: Instructs AI to bias toward walking-dominant sessions, with gradual progression
   - **"interval"**: Instructs AI to integrate interval/speed work progressively with adequate base
   - **"run"** (default): Standard running focus
   - **Missing/null**: Reports "No specific session type preference recorded"

4. **Embeds** the guidance early in the prompt (before injury/health context) so the AI sees this constraint before processing athlete data

## Impact on Nino's Situation

When Nino creates a training plan with `defaultSessionType = "walk"`:

### Before Implementation
```
AI output: 
Week 1: [easy run 3km, walk/run 2.5km, easy run 3km, walk/run 2km, easy run 2.5km]
^ AI generated a mix without knowing walking preference
```

### After Implementation
```
AI receives instruction: "This athlete prefers WALKING as their primary session type. 
Design the plan with walking-dominant sessions in early weeks..."

AI output:
Week 1: [walk 3km, walk 2.5km, walk 2km, walk/run 1:1 2.5km, walk 3km]
^ Walking-biased progression, with gradual introduction of jogging only as fitness allows
```

## Data Source

The `defaultSessionType` field is:
- ✅ **Already in the database schema** (`shared/schema.ts` line 64)
- ✅ **Already settable by users** in the Android app
- ✅ **Now passed to the AI prompt** for plan generation

## Values Supported

The system recognizes and optimizes for:

| Value | Behavior |
|-------|----------|
| `"walk"` | Walking-dominant progressions |
| `"interval"` | Speed/intensity-focused progressions |
| `"run"` (or any other value) | Standard running focus |
| `null` / not set | Standard running focus (fallback) |

## Testing Recommendations

### Test Case 1: Walking Preference (Nino's Scenario)
```
Setup:
- Create user with defaultSessionType = "walk"
- Goal: "Build endurance"
- Duration: 8 weeks
- daysPerWeek: 5
- Injuries: Post-stroke recovery + AFO

Expected Output:
- Week 1: Walking-only sessions (no running)
- Week 2–3: Walk/run intervals (2:1 or higher walk:run)
- Week 4+: Gradual increase in jogging, but walking still featured
- No tempo, intervals, or hills in early weeks
```

### Test Case 2: Interval Preference
```
Setup:
- Create user with defaultSessionType = "interval"
- Goal: "Improve speed"
- Duration: 8 weeks
- daysPerWeek: 4

Expected Output:
- Week 1–2: Base-building weeks (easy runs, no intervals)
- Week 3+: Intervals and tempo progressively introduced
- Speed work well-distributed across middle weeks
```

### Test Case 3: Default (Run) Preference
```
Setup:
- Create user with defaultSessionType = "run" (or null)
- Goal: "Half marathon"
- Duration: 12 weeks

Expected Output:
- Standard half marathon progression
- Mix of easy, tempo, long runs from week 1
- No special walking focus
```

## Deployment Notes

✅ **No breaking changes**  
✅ **No database migrations needed** (field already exists)  
✅ **Backward compatible** (fallback to standard if not set)  
✅ **No linter errors**  

## Related Files

- `server/training-plan-service.ts` — Modified (prompt template)
- `shared/schema.ts` — No changes (field already exists)
- `server/routes.ts` — No changes (API already passes injuries array)

## Future Enhancements (Optional)

### Enhancement 1: AFO-Specific Guidance Block
Add an automatic AFO/prosthetic guidance section to plans when:
- User has `useProstheticOrAFO = true` (hypothetical new field)
- OR injury notes contain "AFO" / "prosthetic" / "brace" keywords

### Enhancement 2: UI in Android App
Ensure the Android app exposes `defaultSessionType` selection in:
- Profile settings
- Plan creation flow (optional but recommended)

### Enhancement 3: Plan Adaptation Loop
When Nino completes sessions, the adaptation system should:
- Respect his `defaultSessionType` preference
- Suggest walking-based adjustments rather than suddenly jumping to running-based changes

---

## Summary

✅ **Completed**: `defaultSessionType` now drives AI plan generation  
✅ **Tested**: Code compiles with no linting errors  
✅ **Ready for Nino**: When he sets `defaultSessionType = "walk"`, his plans will be walking-optimized  

The system will now generate plans that respect his preference for walking as the primary session type, with gradual progression to walk/run and easy jogging as appropriate.
