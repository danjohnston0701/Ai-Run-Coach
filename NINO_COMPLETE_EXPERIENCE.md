# Nino's Complete AI Coaching Experience — End-to-End

## What Nino Gets: The Full Journey

### Phase 1: Setting Up His Profile

#### Step 1: Default Session Type
Nino sets his profile to prefer **Walking**:
```
Profile → Settings → Fitness Preferences
├─ Default Session Type: [Walking] ← Nino selects this
├─ Coach Name: AI Coach
├─ Coach Gender: Male
├─ Coach Accent: Italian (if available)
└─ Coach Tone: Motivating & Professional
```

#### Step 2: Add Injuries/Conditions
Nino navigates to the Injury Management section and adds TWO separate records:

**Record 1: Post-Stroke Recovery**
```
+ Add Injury/Condition
├─ Body Part: Left leg ✓
├─ Status: Recovering ✓
├─ Date of Injury: October 15, 2025
├─ Notes: "Post-stroke left-sided hemiparesis. Left leg weakness. 
           Working on rehabilitation with physio."
├─ Is this a Prosthetic/AFO? NO
└─ [Save]
```

**Record 2: Carbon Fiber AFO**
```
+ Add Injury/Condition
├─ Body Part: Right leg ✓
├─ Status: Chronic ✓
├─ Date of Condition: October 15, 2025
├─ Notes: "Wearing carbon fiber AFO (ankle-foot orthotic) on left foot
           for stability and support during post-stroke recovery.
           Right leg compensates and bears more load."
├─ Is this a Prosthetic/AFO? YES ✓
├─ Device Type: Carbon fiber AFO (ankle-foot orthotic) ✓
└─ [Save]
```

---

### Phase 2: Creating the Training Plan

#### Step 1: Plan Request
Nino clicks "Create AI Coaching Plan" and fills in:

```
TRAINING GOAL
├─ Goal Type: Build Endurance
├─ Target Distance: 25 km/week (peak volume)
├─ Duration: 8 weeks
├─ Sessions Per Week: 5 (Monday-Friday structure)
├─ Start Date: Next Monday
├─ Experience Level: Intermediate
│  (He's coming back from stroke, but has prior running background)
└─ Additional Info: "Structured Zone 2 walking using Garmin Forerunner 55"

HEALTH & INJURIES
├─ ☑ Left leg - Recovering (Post-stroke)
├─ ☑ Right leg - Chronic (Carbon fiber AFO) ← Prosthetic toggle ON
└─ [Review Injuries] (Shows both records)
```

#### Step 2: AI Generation (Behind the Scenes)

The system creates a prompt for GPT-4:

```
═══════════════════════════════════════════════════════════════
COACHING COMMISSION — 8-WEEK PERSONALISED TRAINING PLAN

You are an elite AI running coach...

━━━ PLAN TYPE & PRIMARY OBJECTIVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏃 ENDURANCE BUILDING GOAL
This athlete wants to build their aerobic base and run farther...

━━━ ATHLETE'S SESSION TYPE PREFERENCE ━━━━━━━━━━━━━━━━━━━━━━━━

This athlete prefers WALKING as their primary session type. 
Design the plan with walking-dominant sessions in early weeks, 
then gradually introduce walk/run intervals and easy jogging 
only as fitness and recovery allow. Bias toward walking-based 
progressions throughout, especially in the foundation and 
base-building phases.

━━━ HEALTH & INJURY CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚕️ ACTIVE HEALTH CONDITIONS — APPLY CONSERVATIVE TRAINING MODIFICATIONS

COACHING PRIORITY ORDER:
1. SAFETY — Do not design sessions that risk re-injury
2. INJURY RECOVERY — Match loading to rehabilitation stage
3. GOAL ACHIEVEMENT — Work toward target within constraints
4. PERFORMANCE OPTIMISATION — Fine-tune only once recovered

- Left leg: Recovering — injured 8 weeks ago (October 15, 2025)
  Athlete notes: "Post-stroke left-sided hemiparesis. Left leg weakness..."

- Right leg: Chronic — injured 8 weeks ago (October 15, 2025)
  Athlete notes: "Wearing carbon fiber AFO on left foot for stability..."
  PROSTHETIC/ORTHOTIC: Carbon fiber AFO (ankle-foot orthotic)

This athlete has active or recovering injuries. Apply conservative 
training modifications. The performance goal is the eventual end target 
— it must not drive the early weeks.

━━━ PACING RULES FOR INJURY-MODIFIED PLANS ━━━━━━━━━━━━━━━━

⛔ DO NOT use historical running paces
✅ ALL pacing must be expressed as effort descriptors
   Use: "conversational pace", "easy shuffle", "slow jog (RPE 2-3/10)"
   Don't use: "5:50/km", "6:30/km"

━━━ PROSTHETIC / ORTHOTIC DEVICE COACHING CONSTRAINTS ━━━━━━━━━━

This athlete uses Carbon fiber AFO (ankle-foot orthotic).

CRITICAL COACHING RULES:

1. TERRAIN — Strongly prefer flat, even, smooth surfaces 
   (pavement, track, gym treadmill). Avoid grass, trails, uneven 
   ground, cobblestones in early weeks.

2. ASYMMETRICAL LOADING & COMPENSATORY FATIGUE — The right leg 
   (non-AFO side) typically fatigues faster due to compensation.
   • Design sessions where intensity can be modulated (walk/jog 
     intervals preferred)
   • Monitor right leg: may show fatigue, swelling, or stiffness sooner
   • This fatigue is DIFFERENT from aerobic fatigue

3. CADENCE & CONTROL — Prosthetic users benefit from lower, 
   controlled cadence.
   • Use effort descriptors: "maintain a steady, controlled rhythm"
   • Avoid high-speed bursts, uncontrolled acceleration, fartlek

4. WITHIN-SESSION RECOVERY — Include explicit recovery breaks.
   • Prosthetics add proprioceptive fatigue independent of aerobic effort

5. PROGRESSION SEQUENCE:
   • Phase 1 (weeks 1-2): Walking-only foundation, flat surfaces
   • Phase 2 (weeks 3-4): Walk/jog intervals (2:1 ratio)
   • Phase 3 (weeks 5-6): Balanced walk/jog (1:1) or more jogging
   • Phase 4 (weeks 7+): Easy jogging with walking breaks

6. SESSION INSTRUCTIONS — EVERY session MUST include:
   • Terrain recommendation
   • Post-session checks (skin, swelling)
   • Monitoring cues for right leg
   • Stop criteria for prosthetic-related issues
   • Expected response

7. PERFORMANCE GOALS ARE SECONDARY — Safety and AFO confidence first

[... rest of prompt ...]
```

---

### Phase 3: The Generated Plan (Week 1)

**AI Output: Week 1 — Walking Foundation**

```json
{
  "weekNumber": 1,
  "weekDescription": "Walking foundation establishing comfort and confidence 
                      in the AFO on flat terrain. Easy Zone 2 work.",
  "totalDistance": 10.5,
  "focusArea": "Aerobic base, proprioceptive control, AFO acclimatization",
  "intensityLevel": "Zone 2 (easy, conversational)",
  
  "workouts": [
    {
      "dayOfWeek": 1,  // Monday
      "workoutType": "walking",
      "distance": 2.0,
      "duration": 25,
      "targetHeartRateZone": "Zone 2 (110-130 bpm estimated)",
      "description": "Easy walking foundation session",
      
      "instructions": {
        "preRunBrief": "Good morning Nino! Today you're doing a gentle 2km walk 
                        on flat pavement. Your AFO should feel comfortable at this 
                        pace. Walk at conversational pace—you should be able to speak 
                        in full sentences. Focus on steady, controlled rhythm.",
        
        "sessionStructure": "Warm-up: 2 min easy walk at very relaxed pace
                            Main: 18 min walking at conversational pace (Zone 2)
                            Cool-down: 5 min easy walk, very gentle",
        
        "afoSpecificGuidance": {
          "terrainPreference": "Flat pavement or outdoor track. AVOID: grass, 
                               trails, uneven ground, hills at this stage.",
          "rightLegMonitoring": "Pay attention to your right ankle and knee. 
                                If you feel stiffness developing around minute 15, 
                                slow down even more or walk shorter tomorrow.",
          "cadenceGuidance": "Maintain a steady, controlled rhythm. Don't let 
                            your pace naturally drift upward. Keep it easy.",
          "postSessionChecks": [
            "Check the skin under your AFO when you're done—any pressure points or redness?",
            "Your right ankle—any swelling or puffiness compared to your left?",
            "Overall fatigue level—how does your body feel? Energy for the rest of the day?"
          ],
          "stopCriteria": [
            "Sharp pain in your left leg (stop immediately)",
            "AFO slipping, shifting, or discomfort (stop immediately)",
            "Swelling in your right ankle or knee (stop if mild, walk slower if noticeable)",
            "Dizziness, lightheadedness, or loss of balance (stop immediately)"
          ],
          "expectedResponse": "Your right leg may feel mildly worked—this is normal, 
                              it's doing extra work. Your left leg should have NO pain. 
                              Mild fatigue is OK. You should sleep well tonight."
        },
        
        "aiDeterminedTone": "Encouraging, careful, safety-focused",
        "aiDeterminedIntensity": "Zone 2 aerobic base"
      }
    },
    
    {
      "dayOfWeek": 3,  // Wednesday
      "workoutType": "walking",
      "distance": 2.5,
      "duration": 30,
      "description": "Confidence-building walk on familiar route",
      
      "instructions": {
        "preRunBrief": "Beautiful day for walking, Nino. If possible, walk the same 
                        route as Monday—your body learns the route and you build confidence. 
                        Same effort as Monday: conversational pace, flat terrain, steady rhythm.",
        
        "sessionStructure": "Warm-up: 2 min walk  |  Main: 26 min  |  Cool-down: 2 min",
        
        "afoSpecificGuidance": {
          "terrainPreference": "Same flat, smooth ground as Monday. Stick to familiar route.",
          "rightLegMonitoring": "By minute 20, your right leg might feel more tired. 
                                That's OK. If it feels strained, walk the last 10 minutes 
                                even slower or take a 1-minute walking break.",
          "cadenceGuidance": "Keep that steady, controlled rhythm. You should feel calm.",
          "postSessionChecks": [
            "AFO check: skin pressure points?",
            "Right leg: new stiffness since yesterday?",
            "Ready for Friday's session, or do you need more recovery?"
          ],
          "stopCriteria": [
            "Pain, AFO issues, right-side swelling, dizziness"
          ],
          "expectedResponse": "Similar to Monday. You're getting stronger. Right leg 
                              might feel a bit sore tonight—normal. Sleep well."
        }
      }
    },
    
    {
      "dayOfWeek": 4,  // Thursday — RECOVERY DAY
      "workoutType": "walking",
      "distance": 1.5,
      "duration": 18,
      "description": "Very easy recovery walk",
      
      "instructions": {
        "preRunBrief": "Today's a light day. Just a relaxed 18-minute walk at 
                        whatever pace feels natural. This helps your body recover 
                        for Friday. No effort required.",
        
        "sessionStructure": "18 minutes easy walking, no structure needed",
        
        "afoSpecificGuidance": {
          "terrainPreference": "Flat, whatever feels easy",
          "rightLegMonitoring": "If your right leg is sore from Monday/Wednesday, 
                                walk slowly. Listen to your body.",
          "postSessionChecks": [
            "Overall fatigue—are you ready for one more walking session tomorrow, 
             or do you need extra rest?"
          ],
          "stopCriteria": ["Pain"],
          "expectedResponse": "Should feel easy. Rest well before Friday's first walk/jog session."
        }
      }
    },
    
    {
      "dayOfWeek": 5,  // Friday — FIRST WALK/JOG
      "workoutType": "walk_run",
      "distance": 2.5,
      "duration": 25,
      "description": "Graduated walk/jog introduction: 2 min walk / 1 min jog intervals",
      
      "instructions": {
        "preRunBrief": "Exciting day, Nino! Today you're introducing your first short 
                        jogging segments. Here's how it works: walk for 2 minutes at 
                        comfortable pace, then jog very gently for 1 minute. The jog 
                        should be SLOW—like an easy shuffle. If it feels hard, just walk 
                        instead. We're building confidence, not pushing hard.",
        
        "sessionStructure": "Warm-up: 2 min easy walk
                            Main: 3 × (2 min walk + 1 min gentle jog) = 9 min cycles
                            Cool-down: 2 min easy walk
                            Total: ~25 min",
        
        "afoSpecificGuidance": {
          "terrainPreference": "FLAT pavement ONLY. No varied terrain today. Track or 
                               smooth pavement ideal.",
          "joggingSegment": "The jog should feel VERY easy—like a slow shuffle where 
                           you can still chat. If breathing gets hard, walk instead. 
                           No judgment.",
          "rightLegMonitoring": "Right leg works HARDER during jog segments. Watch for: 
                               fatigue, stiffness, ankle discomfort. If any concern, 
                               walk the remaining jog segments.",
          "cadenceGuidance": "During both walk AND jog: maintain steady, controlled rhythm. 
                            Don't accelerate naturally.",
          "postSessionChecks": [
            "AFO fit and skin: any new pressure issues?",
            "Right ankle: swelling? stiffness? pain?",
            "Right knee: how does it feel after the jog intervals?",
            "How did the jog feel? Too hard or manageable?"
          ],
          "stopCriteria": [
            "Left leg pain (stop immediately)",
            "AFO slipping (stop immediately)",
            "Right leg swelling or sharp pain (stop, walk rest of session)",
            "Loss of balance or dizziness (stop immediately)"
          ],
          "expectedResponse": "Right leg will feel worked. Mild hamstring/quad tiredness 
                              is normal. Left leg: no pain. Sleep extra tonight—you did 
                              great work!"
        }
      }
    },
    
    {
      "dayOfWeek": 6,  // Saturday
      "workoutType": "walking",
      "distance": 2.0,
      "duration": 25,
      "description": "Weekend walk: moderate effort, familiar route",
      
      "instructions": {
        "preRunBrief": "Weekend walk time. Conversational pace, familiar route. 
                        Just enjoy moving your body.",
        
        "sessionStructure": "25 min steady walking at comfortable pace",
        
        "afoSpecificGuidance": {
          "terrainPreference": "Flat, familiar route",
          "rightLegMonitoring": "If right leg sore from Friday, walk slower. Listen to it.",
          "postSessionChecks": [
            "How is your right leg recovering from Friday's walk/jog?",
            "Energy level for Sunday walk?"
          ],
          "expectedResponse": "Should feel OK. Right leg might be a bit sore but managing."
        }
      }
    },
    
    {
      "dayOfWeek": 0,  // Sunday
      "workoutType": "walking",
      "distance": 1.5,
      "duration": 18,
      "description": "Easy recovery walk to end the week",
      
      "instructions": {
        "preRunBrief": "Final walk of the week. Very easy pace. This is about recovery 
                        and preparing for Week 2.",
        
        "sessionStructure": "18 min easy walk, no structure",
        
        "afoSpecificGuidance": {
          "terrainPreference": "Flat, easy route",
          "rightLegMonitoring": "Walk at whatever pace feels sustainable",
          "postSessionChecks": [
            "How was Week 1?",
            "Right leg: ready for Week 2 progression?",
            "Any concerns before we progress to more jog intervals?"
          ],
          "expectedResponse": "Should feel manageable. Rest well. Week 2 will slightly 
                              increase the jog intervals."
        }
      }
    }
  ]
}
```

---

### Phase 4: Voice Coaching During Sessions

When Nino starts a session on his Garmin and the app connects, the AI voice coach speaks to him:

#### **Monday, Week 1 - Walking Session**

```
🎙️ PRE-RUN BRIEFING (30 seconds):

"Ciao Nino! You're about to do an easy 2km walk on flat pavement. 
Your AFO should feel comfortable at this pace. I want you to focus 
on a steady, controlled rhythm—not too fast. Walk at a pace where 
you can speak in full sentences. Monitor your right ankle: if you 
feel stiffness around minute 15, slow down even more. You've got this!"

[Session starts]

🎙️ DURING SESSION (Every 0.5 km or every minute):

"Minute 3: You're doing great! Nice steady pace. Keep that rhythm smooth."

"Minute 8: How's your right ankle? Feeling good? Keep going."

"Minute 15: Halfway done! Your right leg might be feeling it by now. 
That's normal. If it's uncomfortable, walk a bit slower for the last few minutes."

"Minute 20: Great work, Nino. One final minute to go. Nice and easy."

🎙️ POST-RUN SUMMARY (2 minutes):

"That was excellent! You completed 2km at a nice, controlled pace. 
Before you go, a few quick checks:

1. How's your AFO? Any pressure points or discomfort?
2. Your right ankle—did it swell at all? Any stiffness?
3. Overall, how does your body feel?

Log these in the app so I can track how you're adapting. 
Great first session! Rest well, and I'll see you Wednesday."
```

#### **Friday, Week 1 - Walk/Jog Session**

```
🎙️ PRE-RUN BRIEFING:

"Ciao Nino! Today's exciting—you're doing your first walk/jog session! 
Here's how it works: 2 minutes walking at comfortable pace, then 
1 minute of very easy jogging. Think 'gentle shuffle,' not 'running.' 
If the jog feels hard, just walk instead. No judgment. We're building 
confidence with your AFO.

I'll guide you through the intervals. On flat pavement only, OK?"

[Session starts]

🎙️ DURING WALK/JOG INTERVALS:

"OK, walking now. Easy pace. Conversational."

[2 min walk]

"Now jog gently for 1 minute. Easy shuffle. You can chat."

[1 min jog]

"Great! Walk now. Recover for 2 minutes."

[2 min walk]

"Right leg doing OK? Good. Let's jog again. Easy shuffle."

[1 min jog - repeated]

"Final jog segment coming. How's the AFO? Feeling secure? 
Alright, gentle jog for the last time this session."

🎙️ POST-RUN:

"Fantastic, Nino! You did THREE walk/jog cycles! Your right leg 
is working hard, which is expected. Let me know:

1. Right ankle—any swelling?
2. Right knee—soreness?
3. AFO feel secure the whole time?

You've earned some rest. Tomorrow is an easy recovery walk. Sleep well!"
```

---

### Phase 5: Plan Adaptation (Week 2+)

#### After Week 1 Performance Data

Nino completes Week 1 and logs data:
- Monday: 2km walk ✓ Right ankle fine
- Wednesday: 2.5km walk ✓ Right leg mildly sore but managed
- Thursday: 1.5km recovery walk ✓
- Friday: 2.5km walk/jog ✓ Right leg fatigued, no pain
- Saturday: 2km walk ✓
- Sunday: 1.5km recovery walk ✓

**System Analysis:**
```
Week 1 Performance:
✅ Completed all 5 sessions
✅ Post-session checks: right leg working, manageable
✅ Heart rate data: staying in Zone 2 as planned
✅ No adverse events
✅ AFO tolerance good

RECOMMENDATION FOR WEEK 2:
✅ Maintain walking foundation (Week 1 was perfect)
✅ Increase walk/jog intervals to 4 cycles (from 3)
✅ Add one more walk/jog session (Wednesday becomes walk/jog too)
✅ Continue monitoring right leg

Week 2 will progress cautiously, respecting prosthetic adaptation timeline.
```

#### Week 2 Plan Regeneration

The system adapts the plan:

```json
{
  "weekNumber": 2,
  "weekDescription": "Consolidating Week 1 gains and testing repeated walk/jog 
                      progressions. Still primarily walking with graduated jog intervals.",
  "totalDistance": 11.5,
  "focusArea": "Aerobic base continuation, walk/jog intervals, AFO confidence building",
  
  "workouts": [
    {
      "dayOfWeek": 1,
      "workoutType": "walking",
      "distance": 2.0,
      "instructions": {
        "preRunBrief": "Excellent start last week, Nino! This week we're building 
                        on that success. Today: same as last Monday, 2km easy walk..."
      }
    },
    {
      "dayOfWeek": 3,
      "workoutType": "walk_run",
      "distance": 2.5,
      "instructions": {
        "preRunBrief": "Great news! You handled Friday's walk/jog so well, 
                        we're adding walk/jog sessions earlier in the week. 
                        Same pattern: 2 min walk, 1 min jog, repeat 4 times today..."
      }
    },
    // ... rest of Week 2 with progressive jog intervals
  ]
}
```

---

### Phase 6: Progression Timeline (Weeks 1-8)

```
WEEK 1: FOUNDATION
├─ 5 sessions, 10.5 km total
├─ Activities: 4× walking only, 1× walk/jog (2:1 ratio)
└─ AFO learning phase, right-leg acclimatization

WEEK 2: CONSOLIDATION
├─ 5 sessions, 11.5 km total
├─ Activities: 3× walking, 2× walk/jog (2:1 ratio, 4 cycles each)
└─ Increased jog volume with walking breaks

WEEK 3: WALK/JOG BALANCE
├─ 5 sessions, 12.5 km total
├─ Activities: 2× walking, 3× walk/jog (2:1.5 ratio)
└─ More jogging, but still walk-dominant

WEEK 4: WALK/JOG PARITY
├─ 5 sessions, 13.5 km total
├─ Activities: 1× walking, 4× walk/jog (1:1 ratio - equal walk & jog)
└─ Right leg should be handling compensation well

WEEKS 5-6: EASY JOG INTRODUCTION
├─ 5 sessions, 14-15 km total
├─ Activities: 2-3× walk/jog, 2-3× easy jog (with walk breaks as needed)
└─ Transition toward sustained jogging

WEEKS 7-8: TAPER & CONSOLIDATION
├─ 5 sessions, 12-13 km total (volume reduction for rest)
├─ Activities: Mix of easy jog and walk/jog to maintain fitness
└─ Recovery focus, AFO confidence established, ready for next phase
```

---

### Phase 7: What Nino Experiences Holistically

**Day 1 (Monday, Week 1):**
- ✅ Opens app, sees "Week 1 - Walking Foundation"
- ✅ Clicks Monday's walk session
- ✅ Reads: "Gentle 2km walk on flat pavement. AFO should feel comfortable..."
- ✅ Sees AFO-specific guidance: terrain (flat pavement), right-leg monitoring, stop criteria
- ✅ Starts Garmin recording, AI voice coach briefs him
- ✅ Walks 2km while listening to encouragement and form cues
- ✅ Voice coach asks post-session: "Any pressure under your AFO?"
- ✅ Logs: AFO fit ✓, right ankle ✓, overall fatigue ✓
- ✅ Reads post-session note: "Great! Sleep well tonight"

**After Week 1:**
- ✅ System analyzes all 5 session data points
- ✅ Sees right leg is handling load well
- ✅ Sees HR stayed in Zone 2 (perfect for his goals)
- ✅ Confirms AFO is comfortable
- ✅ Generates Week 2 automatically: walking + more walk/jog intervals

**By Week 4:**
- ✅ Nino is doing 1:1 walk/jog sessions comfortably
- ✅ Voice coach cues evolving: "Nice cadence, Nino. Very controlled."
- ✅ Right leg monitoring shows: manageable fatigue, no concerning swelling
- ✅ Post-stroke left leg: no pain, getting stronger
- ✅ AFO confidence high

**By Week 8:**
- ✅ Nino is comfortable with easy jogging + walking breaks
- ✅ Can do 20-25 km/week across 5 sessions
- ✅ AFO feels natural, right leg is strong
- ✅ Voice coach recognizes his progress: "Nino, look at you! 
        8 weeks ago you were walking gently, now you're jogging miles!"
- ✅ Plan tapers for recovery, ready for Phase 2 (next 8-week block)

---

## The Difference: Before vs. After This Feature

### BEFORE (Generic Injury)
```
Plan Generation:
Injury: "Left leg, recovering"
↓
Generic conservative plan
↓
Sessions might say: "Easy 3km jog on flat or hilly terrain"
↓
No AFO-specific guidance
↓
Voice coach: "Keep your effort steady"
↓
Result: Some sessions may not be suitable, user has to manually adjust
```

### AFTER (AFO-Aware)
```
Plan Generation:
Injury 1: "Left leg, recovering" (post-stroke)
Injury 2: "Right leg, chronic, AFO (carbon fiber)" ← AFO toggle ON
↓
System recognizes AFO + post-stroke + defaultSessionType=walk
↓
Generates walking-first, AFO-specific plan
↓
Every session includes:
  - Terrain: "flat pavement only"
  - Monitor: "right ankle for swelling"
  - Cadence: "steady, controlled rhythm"
  - Stop: "AFO slipping? Pain? Stop."
↓
Voice coach: "Maintain that controlled rhythm, Nino. 
  How's your right ankle? Great work!"
↓
Result: Every session tailored to his exact situation
        Plan respects his recovery journey
        Safety built into every step
```

---

## Summary: What Nino Gets

✅ **Walking-First Plans** — His preference respected from day 1  
✅ **AFO-Aware Coaching** — Every session knows about his prosthetic  
✅ **Right-Leg Monitoring** — System tracks his compensation  
✅ **Post-Stroke Safety** — Conservative progressions, effort-based pacing  
✅ **Zone 2 Optimization** — HR-based guidance for his structured approach  
✅ **Voice Coaching Integration** — AI coach mentions AFO, right-leg checks, cadence  
✅ **Adaptive Progression** — Plan evolves based on his actual performance  
✅ **Professional Quality** — Like having a sports physio + running coach + AI coaching together  

**Result**: Nino gets a training plan as tailored to his situation as working 1-on-1 with a specialist coach who understands post-stroke recovery, AFO biomechanics, and personal coaching goals.

---

**Ready to make Nino's training journey world-class!** 🇮🇹💪🏃‍♂️
