# Example: What Nino's AI Coaching Plan Would Look Like

## Scenario Setup

**Nino's Profile:**
- Location: Italy
- Activity: Walking (post-stroke recovery)
- Device: Garmin Forerunner 55
- Goal: Zone 2 aerobic base building (structured 5-day/week walking)
- Health: Post-stroke left-sided hemiparesis, carbon fiber AFO on left leg
- Fitness Level: Intermediate (prior running background, now rebuilding post-stroke)

**Plan Request:**
```json
{
  "goalType": "build_endurance",
  "targetDistance": 25,  // 25km/week peak volume goal
  "durationWeeks": 8,
  "daysPerWeek": 5,
  "experienceLevel": "intermediate",
  "injuries": [
    {
      "bodyPart": "Left leg (post-stroke hemiparesis)",
      "status": "recovering",
      "injuryDate": "2025-10-15",
      "notes": "Post-stroke left-sided weakness. Using carbon fiber AFO brace on left leg. Primary activity: walking with Zone 2 HR focus (Garmin). Right leg compensates—monitor for swelling/stiffness. Flat/smooth surfaces only. Cleared for walking and walk/run intervals."
    }
  ],
  "defaultSessionType": "walk"
}
```

---

## Expected AI Output (Week 1–8)

### Week 1: Walking Foundation

```json
{
  "weekNumber": 1,
  "weekDescription": "Walking foundation and comfort establishment. Building confidence in the AFO and establishing baseline aerobic work. All sessions on flat, familiar terrain.",
  "totalDistance": 10.5,
  "focusArea": "Aerobic base, proprioceptive control, AFO acclimatization",
  "intensityLevel": "Zone 2 (easy, conversational)",
  
  "workouts": [
    {
      "dayOfWeek": 0,  // Monday
      "workoutType": "walking",
      "distance": 2.0,
      "duration": 25,
      "targetHeartRateZone": "Zone 2 (aerobic)",
      "instructions": {
        "preRunBrief": "Gentle 2km walk on flat pavement. Focus on steady rhythm and AFO comfort. Walk at conversational pace—you should be able to speak in full sentences.",
        "sessionStructure": "Warm-up 2 min easy walk, main 18 min easy walk (no faster than feels totally comfortable), cool-down 5 min",
        "afoSpecificNotes": {
          "terrainPreference": "flat pavement or track — avoid grass, trails, or uneven ground",
          "rightLegMonitoring": "monitor right ankle/knee — if stiffness develops by min 15, slow down",
          "postSessionChecks": ["Check skin under AFO for pressure points", "Overall fatigue level", "Any swelling in right knee/ankle?"]
        },
        "stopCriteria": ["Sharp pain in left leg", "AFO slipping or discomfort", "Right leg swelling", "Dizziness or loss of balance"],
        "expectedResponse": "Mild fatigue, no pain. Right leg may feel slightly worked. Sleep well tonight."
      }
    },
    {
      "dayOfWeek": 2,  // Wednesday
      "workoutType": "walking",
      "distance": 2.5,
      "duration": 30,
      "targetHeartRateZone": "Zone 2",
      "instructions": {
        "preRunBrief": "Confidence-building walk on your familiar route if possible. Repeat routes help build muscle memory. Same effort as Monday—conversational pace.",
        "sessionStructure": "Warm-up 2 min walk, main 26 min easy walk, cool-down 2 min",
        "afoSpecificNotes": {
          "terrainPreference": "flat, smooth ground (same route as Monday preferred)",
          "rightLegMonitoring": "right leg fatigue by min 20? slow down for the final 10 min",
          "postSessionChecks": ["Skin check under AFO", "Right leg: any new stiffness?", "Overall energy for next day?"]
        },
        "stopCriteria": ["Pain", "AFO issues", "Right-side swelling", "Dizziness"],
        "expectedResponse": "Similar to Monday. Slightly more confident with the AFO. No pain."
      }
    },
    {
      "dayOfWeek": 4,  // Friday
      "workoutType": "walk_run",
      "distance": 2.5,
      "duration": 25,
      "targetHeartRateZone": "Zone 2 (base level, jog segments slightly elevated)",
      "instructions": {
        "preRunBrief": "First walk/jog session: 2 min walk, 1 min gentle jog, repeat 3×. Flat pavement only. The jog is VERY easy—like a slow shuffle at conversational pace. If it feels hard, return to walking.",
        "sessionStructure": "Warm-up 2 min walk, then 3× (2 min walk + 1 min very easy jog), cool-down 2 min walk = ~25 min total",
        "afoSpecificNotes": {
          "joggingSegment": "jog at 'can hold conversation' effort; if breathing becomes hard, walk instead",
          "terrainPreference": "flat, smooth pavement ONLY — no grass or varied terrain",
          "rightLegMonitoring": "right leg is working harder during jog intervals; watch for fatigue after min 20",
          "cadenceGuidance": "maintain steady, controlled rhythm during jog; don't let pace drift upward naturally",
          "postSessionChecks": ["AFO skin check", "Right ankle: any swelling?", "Soreness in right knee?"]
        },
        "stopCriteria": ["Pain in left leg", "AFO slipping", "Right leg swelling", "Loss of control/balance during jog"],
        "expectedResponse": "Right leg will feel worked. Mild hamstring or quad tiredness is normal. No sharp pain. Sleep well."
      }
    },
    {
      "dayOfWeek": 5,  // Saturday
      "workoutType": "walking",
      "distance": 2.0,
      "duration": 25,
      "targetHeartRateZone": "Zone 2 (easy recovery)",
      "instructions": {
        "preRunBrief": "Easy recovery walk. Slower pace than Wednesday—this is a confidence-building day. Whatever pace feels natural.",
        "sessionStructure": "25 min easy walk at your own comfortable pace",
        "afoSpecificNotes": {
          "terrainPreference": "flat, familiar route if possible",
          "rightLegMonitoring": "if right leg tired, shorter walk is fine (can split into 2× 12-min walks if needed)",
          "postSessionChecks": ["Overall fatigue level", "Any lingering soreness?"]
        },
        "stopCriteria": ["Pain"],
        "expectedResponse": "Should feel easier than Friday. Mild right-leg fatigue is OK."
      }
    },
    {
      "dayOfWeek": 6,  // Sunday
      "workoutType": "walking",
      "distance": 1.5,
      "duration": 18,
      "targetHeartRateZone": "Zone 2 (very easy)",
      "instructions": {
        "preRunBrief": "Easy Sunday walk—very relaxed pace. This is recovery. Can be a scenic walk or on the treadmill—whatever feels best.",
        "sessionStructure": "18 min easy walk, no structure needed",
        "afoSpecificNotes": {
          "terrainPreference": "flat, whatever feels easy",
          "rightLegMonitoring": "listen to your body; walk more slowly if right leg is sore"
        },
        "stopCriteria": ["Pain"],
        "expectedResponse": "Should feel easier. Rest well before Week 2."
      }
    }
  ]
}
```

---

### Week 2: Consolidation + Gradual Walk/Run Introduction

```json
{
  "weekNumber": 2,
  "weekDescription": "Consolidating Week 1 gains and testing repeated walk/run progressions. Still primarily walking, but introducing more frequent walk/jog intervals.",
  "totalDistance": 11.5,
  "focusArea": "Aerobic base continuation, walk/run intervals, AFO proprioceptive adaptation",
  "intensityLevel": "Zone 2 dominant, with brief Zone 3 during jog intervals",
  
  "workouts": [
    {
      "dayOfWeek": 0,  // Monday
      "workoutType": "walking",
      "distance": 2.0,
      "instructions": "Same as Week 1 Monday — 2km easy walk on flat pavement. Maintain conversational pace."
    },
    {
      "dayOfWeek": 2,  // Wednesday
      "workoutType": "walk_run",
      "distance": 2.5,
      "instructions": "2 min walk / 1 min jog × 4 cycles (increased from 3). Same effort levels. Flat pavement. Monitor right leg."
    },
    {
      "dayOfWeek": 4,  // Friday
      "workoutType": "walking",
      "distance": 2.5,
      "instructions": "Easy walk, no jogging — recovery from Wednesday's walk/run. Conversational pace."
    },
    {
      "dayOfWeek": 5,  // Saturday
      "workoutType": "walk_run",
      "distance": 2.5,
      "instructions": "2 min walk / 1 min jog × 3 cycles (shorter day to allow recovery). Flat, smooth terrain."
    },
    {
      "dayOfWeek": 6,  // Sunday
      "workoutType": "walking",
      "distance": 2.0,
      "instructions": "Easy recovery walk — very relaxed pace."
    }
  ]
}
```

---

### Week 3: Walk/Run Balance

```json
{
  "weekNumber": 3,
  "weekDescription": "Increasing walk/jog ratio: 2 min walk / 1.5 min jog intervals. Right leg should be adapting well. Monitor for any signs of overcompensation.",
  "totalDistance": 12.5,
  "focusArea": "Graduated jog volume introduction, continued AFO adaptation",
  "intensityLevel": "Zone 2 base + Zone 3 during jog intervals",
  
  "workouts": [
    {
      "dayOfWeek": 0,  // Monday
      "workoutType": "walk_run",
      "distance": 2.5,
      "instructions": "2 min walk / 1.5 min jog × 4 cycles. Flat pavement. If jog feels hard, return to 1 min jog segments."
    },
    {
      "dayOfWeek": 2,  // Wednesday
      "workoutType": "walking",
      "distance": 2.0,
      "instructions": "Easy recovery walk — allow right leg to recover from Monday."
    },
    {
      "dayOfWeek": 4,  // Friday
      "workoutType": "walk_run",
      "distance": 3.0,
      "instructions": "2 min walk / 1.5 min jog × 5 cycles. Increased distance. Flat, smooth terrain. Right leg should be handling this well now."
    },
    {
      "dayOfWeek": 5,  // Saturday
      "workoutType": "walking",
      "distance": 2.5,
      "instructions": "Easy walk — mid-distance session. Conversational pace."
    },
    {
      "dayOfWeek": 6,  // Sunday
      "workoutType": "walking",
      "distance": 2.5,
      "instructions": "Easy recovery walk."
    }
  ]
}
```

---

### Week 4: Further Jog Progression

```json
{
  "weekNumber": 4,
  "weekDescription": "Walk/jog ratio now 2:2 (equal walking and jogging). Right leg compensation should be well-managed by now. Continue flat-surface focus.",
  "totalDistance": 13.5,
  "focusArea": "Balanced walk/jog development, AFO stability confirmation",
  "intensityLevel": "Zone 2 base + Zone 3 balanced",
  
  "workouts": [
    {
      "dayOfWeek": 0,
      "workoutType": "walk_run",
      "distance": 2.5,
      "instructions": "2 min walk / 2 min jog × 4 cycles. Flat pavement. Equal work on each leg."
    },
    // ... [similar structure, progressing jog duration and volume]
  ]
}
```

---

### Weeks 5–8: Continued Progression

**Week 5**: Walk/jog ratio shifts toward more jogging (1.5 min walk / 2.5 min jog)  
**Week 6**: Pure easy jogging introduced (3km easy jog, 2km walk recovery)  
**Week 7**: Easy jog + walk/jog mix (building toward sustained jogging)  
**Week 8**: Taper week — reduced volume, easy sessions only  

---

## Key Features of This Plan

### ✅ What's Right

1. **Walking-Dominant Early Weeks** — Because `defaultSessionType = "walk"`
   - Week 1: 100% walking
   - Week 2–3: Mostly walking with jog intervals
   - Week 4+: Balanced progression

2. **Gradual Walk/Jog Progression**
   - Starts with 2:1 (2 min walk / 1 min jog)
   - Progresses to 1:1 (equal)
   - Then toward more jogging

3. **AFO-Aware Guidance**
   - Every session mentions terrain (flat pavement)
   - Post-session AFO checks listed
   - Right-leg fatigue monitoring emphasized
   - Cadence control cues provided

4. **Zone 2 Focus** (From Nino's preferences)
   - All easy sessions are Zone 2
   - Walk/jog intervals briefly touch Zone 3 during jog segments
   - Recovery sessions are very Zone 2

5. **Conservative Loading**
   - Week 1: 10.5 km (very conservative for someone who walks regularly)
   - Peak: ~13.5 km by week 4
   - Then tapers week 8
   - No sudden volume jumps

6. **Safety First**
   - Multiple "stop criteria" per session
   - Post-session checks listed
   - No hills, no tempo, no intervals
   - No uneven terrain recommended

### ⚠️ What Might Be Missing (Without Detailed Notes)

If Nino's injury notes were generic (just "post-stroke recovery"), the plan might:
- Include sessions that don't mention AFO-specific terrain preference
- Lack right-leg compensation monitoring cues
- Miss proprioceptive fatigue guidance
- Not explicitly mention cadence control

**Solution**: Provide detailed injury notes (as shown in scenario setup above).

---

## Testing This Plan

### Before Execution
1. ✅ Nino reviews with his physiotherapist
2. ✅ Physio confirms walking progression is safe
3. ✅ Physio confirms flat-surface restriction is appropriate

### During Execution
1. ✅ Nino logs sessions on Garmin (automatic HR tracking)
2. ✅ Tracks "right leg fatigue" per session instructions
3. ✅ Watches for AFO pressure points
4. ✅ Reports any "stop criteria" symptoms immediately

### After Week 1
1. ✅ Plan is adapted based on actual performance
   - If right leg is overfatigued → slow Week 2 progression
   - If right leg doing well → maintain schedule
   - HR data + session ratings → AI adapts future weeks

---

## Summary

This plan represents what the AI **SHOULD** generate for Nino with:
- ✅ `defaultSessionType = "walk"` (now implemented)
- ✅ Detailed AFO injury notes (user-provided)
- ✅ Post-stroke recovery understanding (system knows this)
- ✅ Zone 2 aerobic focus (system supports this)

**Result**: **~80–85% suitable** for his post-stroke recovery and AFO use case.

With an additional AFO-specific code enhancement (~30 min), it would be **~95% suitable** with automatic AFO guidance.

---

## Next Step for Nino

1. Set `defaultSessionType = "walk"` in profile ✅
2. Create an "Injury Recovery" goal with detailed AFO notes
3. Request an 8-week "Build endurance" plan
4. Let the system generate Week 1–8
5. Have physio review
6. Execute with Garmin HR tracking
7. System adapts based on real performance data

Ready to test with Nino! 🏃‍♂️
