# 🧪 Pace Interpretation Test Scenarios

Use these test scenarios to verify that pace handling is working correctly across all AI features.

---

## Talk to Coach Tests

### Scenario 1: User Behind Target Pace

**Setup**
- Active run at 4.2km of 10km
- Target pace: 5:00/km
- Current pace: 5:25/km (25 seconds slower)
- User asks: "How is my pace tracking?"

**Expected Response**
- ✅ AI should recognize that 5:25 > 5:00 (slower)
- ✅ AI should say they're BEHIND pace
- ✅ AI should suggest picking up the pace
- ✅ Example: "You're running 5:25 per km, which is 25 seconds slower than your target of 5:00. You need to pick up the pace a bit to hit your goal time."

**What Would Be WRONG**
- ❌ "You're running 5:25, which is slower than usual. Keep going!"
- ❌ "Your pace of 5:25 is above your target of 5:00, so you're doing great!"
- ❌ Praising slow pace as if it were good

---

### Scenario 2: User Ahead of Target Pace

**Setup**
- Active run at 6.5km of 10km
- Target pace: 5:00/km
- Current pace: 4:40/km (20 seconds faster)
- User asks: "How's my pace?"

**Expected Response**
- ✅ AI should recognize that 4:40 < 5:00 (faster)
- ✅ AI should say they're AHEAD of pace
- ✅ AI should suggest easing off to conserve energy
- ✅ Example: "You're running 4:40 per km, which is 20 seconds faster than your 5:00 target. That's great! Just ease off slightly to conserve energy for the second half."

**What Would Be WRONG**
- ❌ "You're running 4:40, which is slower than your target—speed up!"
- ❌ "Your smaller pace number means you're behind. Push harder!"

---

### Scenario 3: User On Target Pace

**Setup**
- Active run at 5.0km of 10km
- Target pace: 5:00/km
- Current pace: 5:01/km (1 second slower - on target)
- User asks: "Am I on pace?"

**Expected Response**
- ✅ AI recognizes difference is negligible
- ✅ AI provides positive reinforcement
- ✅ Example: "You're running 5:01 per km, right on your target pace of 5:00. Excellent pacing—keep this rhythm going!"

**What Would Be WRONG**
- ❌ "You're 1 second behind. Speed up!"
- ❌ "Your pace is slightly off target"

---

### Scenario 4: No Training Plan (Graceful Degradation)

**Setup**
- Active run, no linked training plan
- No race goal pace set
- Current pace: 4:50/km
- User asks: "How's my pace?"

**Expected Response**
- ✅ AI should not fail
- ✅ AI should give generic encouraging response about pace consistency
- ✅ Example: "You're holding a steady 4:50 per km. Great consistency! Keep up this effort."

**What Would Be WRONG**
- ❌ Error response
- ❌ Crash or timeout
- ❌ Empty response

---

## Real-Time Coaching Tests

### Scenario 5: Phase Coaching — Tempo Run Too Slow

**Setup**
- Phase: Middle (tempo)
- Target pace for tempo: 4:15/km
- Current pace: 4:45/km (30 seconds too slow)
- Trigger: Phase coaching cue

**Expected Response**
- ✅ AI recognizes 4:45 > 4:15 (slower)
- ✅ AI coaches to increase intensity
- ✅ Example: "You're running 4:45, but this tempo session calls for 4:15 pace. Pick up the intensity—let's build that lactate threshold!"

---

### Scenario 6: Phase Coaching — Easy Run Too Fast

**Setup**
- Phase: Early (recovery/warm-up)
- Target pace for easy: 6:00/km
- Current pace: 5:15/km (45 seconds too fast)
- Trigger: Phase coaching cue

**Expected Response**
- ✅ AI recognizes 5:15 < 6:00 (faster)
- ✅ AI coaches to slow down
- ✅ Example: "You're pushing 5:15 per km, but this warm-up should be at 6:00. Ease back—let your body settle into the run. You'll need the energy later."

---

### Scenario 7: Session Coaching — Pace Abandonment

**Setup**
- Target time: 50 minutes for 10km (5:00 pace)
- Current pace: 5:45/km (45 seconds behind)
- Distance: 7km in, 3km remaining
- Projected finish: 58 minutes (8 minutes over target)
- Status: Target abandoned (can't catch up)

**Expected Response**
- ✅ AI recognizes pace is unsustainable for goal
- ✅ AI pivots to encouragement + effort management
- ✅ Example: "The target time isn't in the cards today at this pace, but you're putting in great work. Let's focus on finishing strong and learning from this effort."

**What Would Be WRONG**
- ❌ "You're 45 seconds behind—push harder!" (unrealistic/demoralizing)
- ❌ Ignoring the abandonment status

---

## Post-Run Analysis Tests

### Scenario 8: Comprehensive Analysis — Negative Pace Trend

**Setup**
- 10km run completed
- First 5km: 4:50 pace (good)
- Last 5km: 5:30 pace (fading)
- Target: 5:00 pace
- Overall: 5:10 pace

**Expected Response**
- ✅ AI identifies fade pattern
- ✅ AI analyzes why (fatigue, pacing mistake, etc.)
- ✅ AI provides actionable feedback
- ✅ Example: "Your first half was strong at 4:50 pace, but you faded to 5:30 in the second half. This suggests you went out too fast. Next time, focus on an even pace throughout."

---

### Scenario 9: Comprehensive Analysis — Pace Management Success

**Setup**
- 10km run completed
- First 5km: 5:05 pace
- Last 5km: 4:55 pace (negative split)
- Target: 5:00 pace
- Overall: 5:00 pace

**Expected Response**
- ✅ AI recognizes excellent pacing strategy
- ✅ AI reinforces the behavior
- ✅ Example: "Excellent pacing! You ran a negative split—holding back in the first half and finishing strong. This is exactly what we want to see. Your discipline paid off."

---

## Edge Cases

### Scenario 10: Very Close to Target

**Setup**
- Target: 5:00/km
- Current: 4:59/km (1 second faster)
- Difference: 1 second

**Expected Response**
- ✅ AI should treat as "on target" (within margin of error)
- ✅ Positive reinforcement
- ✅ Example: "You're running 4:59—essentially perfect pace! Keep this up."

---

### Scenario 11: Significantly Ahead (Very Fast)

**Setup**
- Target: 5:00/km
- Current: 4:30/km (30 seconds faster)
- Difference: -30 seconds

**Expected Response**
- ✅ AI recognizes this is very fast
- ✅ AI warns about early burnout
- ✅ Example: "You're flying at 4:30 per km—30 seconds faster than target. This is risky for a longer run. Ease back to your target pace before you hit the wall."

---

### Scenario 12: Significantly Behind (Very Slow)

**Setup**
- Target: 5:00/km
- Current: 6:00/km (60 seconds slower)
- Difference: +60 seconds
- Distance: 7km in, can't realistically catch up

**Expected Response**
- ✅ AI recognizes unsustainable lag
- ✅ AI adjusts expectations
- ✅ Example: "You're at 6:00 per km, a full minute behind target. This pace won't work for your goal. Let's refocus on what's realistic for today and finish strong."

---

## Testing Checklist

Use this checklist to verify all scenarios:

### Talk to Coach Feature
- [ ] Test Scenario 1: Behind target
- [ ] Test Scenario 2: Ahead of target
- [ ] Test Scenario 3: On target
- [ ] Test Scenario 4: No plan (graceful degradation)

### Real-Time Coaching
- [ ] Test Scenario 5: Tempo run too slow
- [ ] Test Scenario 6: Easy run too fast
- [ ] Test Scenario 7: Pace abandonment

### Post-Run Analysis
- [ ] Test Scenario 8: Negative pace trend
- [ ] Test Scenario 9: Negative split success

### Edge Cases
- [ ] Test Scenario 10: Very close to target
- [ ] Test Scenario 11: Significantly ahead
- [ ] Test Scenario 12: Significantly behind

---

## Manual Testing Steps

### For Talk to Coach

1. **Start a run** with a training plan that has a target pace
2. **Run for 2-3km** at a pace clearly different from target
3. **Say "Hey Coach"** (or tap the button)
4. **Ask**: "How is my pace tracking?"
5. **Verify**: Response correctly identifies if you're ahead, behind, or on pace
6. **Listen**: Make sure the verdict matches reality

### For Real-Time Coaching

1. **Start a tempo workout** with prescribed pace of 4:15/km
2. **Run at 4:45/km** (30 seconds slower)
3. **Wait for coaching cue** (should happen every ~3-4 minutes)
4. **Verify**: AI tells you to speed up, not slow down
5. **Run at 4:00/km** (15 seconds faster)
6. **Verify**: AI tells you to ease off, not continue

---

## Automated Testing (For Developers)

```typescript
// Example unit test for pace interpretation
function testPaceComparison() {
  // Test case 1: Behind target
  const target = 300; // 5:00 in seconds
  const current = 320; // 5:20 in seconds
  const diff = current - target; // 20
  
  expect(diff).toBeGreaterThan(0);
  expect(getPaceVerdict(diff)).toBe("BEHIND TARGET");
  
  // Test case 2: Ahead of target
  const target2 = 300; // 5:00
  const current2 = 285; // 4:45
  const diff2 = current2 - target2; // -15
  
  expect(diff2).toBeLessThan(0);
  expect(getPaceVerdict(diff2)).toBe("AHEAD OF TARGET");
  
  // Test case 3: On target
  const target3 = 300; // 5:00
  const current3 = 302; // 5:02
  const diff3 = current3 - target3; // 2
  
  expect(Math.abs(diff3)).toBeLessThan(10);
  expect(getPaceVerdict(diff3)).toBe("ON TARGET");
}

function getPaceVerdict(diffSeconds: number): string {
  if (diffSeconds > 15) return "BEHIND TARGET";
  if (diffSeconds > 0) return "SLIGHTLY BEHIND";
  if (diffSeconds < -15) return "AHEAD OF TARGET";
  if (diffSeconds < 0) return "SLIGHTLY AHEAD";
  return "ON TARGET";
}
```

---

## Common Mistakes to Catch

### ❌ Mistake 1: Treating Higher Pace Values as Better
```
WRONG: "Your pace of 5:30 is higher than 5:00, so you're doing better!"
RIGHT: "Your pace of 5:30 is slower than 5:00, so you need to speed up."
```

### ❌ Mistake 2: Not Converting to Seconds
```
WRONG: Comparing "5:30" > "5:00" as strings
RIGHT: 330 > 300 = true (slower)
```

### ❌ Mistake 3: Forgetting Negative Splits
```
WRONG: "Your second half was slower, so you're fading."
RIGHT: "Your second half was faster (better)—that's a negative split, well done!"
```

### ❌ Mistake 4: Ignoring Context
```
WRONG: "You're slower than your 5K pace, so you're not pushing hard enough."
RIGHT: "For an easy 10K, your 6:00 pace is perfect. You're supposed to be slower than a 5K effort."
```

---

## Success Criteria

✅ **All AI responses correctly interpret pace**
- Lower values = faster
- Higher values = slower
- Proper comparison logic applied

✅ **Talk to Coach handles pace questions**
- Includes target pace in context
- Makes proper comparisons
- Gives actionable feedback

✅ **Real-time coaching adjusts correctly**
- Too fast → ease off
- Too slow → speed up
- On pace → maintain rhythm

✅ **Edge cases handled gracefully**
- No plan → generic encouragement
- Pace abandoned → focus on effort
- Very close → treat as on pace

✅ **No errors or crashes**
- Missing data handled gracefully
- AI always has valid response
- System remains stable
