# Nino's AFO-Aware Coaching System — Visual Summary

## The Big Picture: What Changed

```
┌─────────────────────────────────────────────────────────┐
│                    NINO'S JOURNEY                        │
└─────────────────────────────────────────────────────────┘

BEFORE (Generic System):
┌─────────────────┐
│  Add Injuries   │  ← Limited to body part + status
│  + Notes        │
└─────────────────┘
        ↓
┌─────────────────────────────────────────┐
│  Training Plan (Generic Recovery Plan)  │  ← Doesn't understand AFO specifics
│  • Some walking, some running           │
│  • No AFO guidance                      │
│  • No right-leg monitoring              │
└─────────────────────────────────────────┘
        ↓
❌ Sessions not tailored to prosthetic needs


AFTER (AFO-Aware System):
┌──────────────────────────────────────┐
│  Add Injuries                        │
│  ├─ Body Part + Status               │  ← Now includes:
│  ├─ Notes                            │    • Is it a Prosthetic/AFO?
│  └─ Prosthetic Type (if applicable)  │    • Which type?
└──────────────────────────────────────┘
        ↓
┌──────────────────────────────────────────────────────────┐
│  Training Plan (AFO-AWARE & WALKING-FIRST)              │
│  + defaultSessionType = "walk"                           │
│  + Post-stroke recovery rules                            │
│  + AFO-SPECIFIC GUIDANCE in EVERY session ✅            │
│    ├─ Terrain recommendations                           │
│    ├─ Right-leg monitoring cues                         │
│    ├─ AFO fit checks                                    │
│    ├─ Cadence control guidance                          │
│    └─ Stop criteria (AFO-specific)                      │
└──────────────────────────────────────────────────────────┘
        ↓
✅ Every session tailored to prosthetic needs
✅ Walking-dominant progression
✅ Professional-grade coaching
```

---

## Data Flow: What Happens When Nino Creates a Plan

```
NINO'S APP
┌─────────────────────────────────────┐
│ Create Plan Screen                  │
├─────────────────────────────────────┤
│ Goal: Build Endurance               │
│ Duration: 8 weeks                   │
│ Frequency: 5 days/week              │
│                                     │
│ INJURIES:                           │
│ ☐ Left leg: Recovering              │
│   (Post-stroke hemiparesis)         │
│   Is Prosthetic? NO                 │
│                                     │
│ ☑ Right leg: Chronic                │
│   (AFO brace for stability)          │
│   Is Prosthetic? YES ← NEW!         │
│   Type: Carbon fiber AFO ← NEW!     │
│                                     │
│ [Generate Plan]                     │
└─────────────────────────────────────┘
           ↓↓↓
        HTTP POST
           ↓↓↓
API ENDPOINT: /api/training-plans/generate
┌─────────────────────────────────────────────────┐
│ Request Body:                                   │
│ {                                               │
│   goalType: "build_endurance"                   │
│   daysPerWeek: 5                                │
│   injuries: [                                   │
│     {                                           │
│       bodyPart: "Left leg",                     │
│       status: "recovering",                     │
│       notes: "Post-stroke..."                   │
│       isProstheticOrAFO: false                  │
│     },                                          │
│     {                                           │
│       bodyPart: "Right leg",                    │
│       status: "chronic",                        │
│       notes: "AFO brace...",                    │
│       isProstheticOrAFO: true ← NEW!           │
│       prostheticType: "Carbon fiber AFO" ← NEW!│
│     }                                           │
│   ],                                            │
│   defaultSessionType: "walk" ← NEW!            │
│ }                                               │
└─────────────────────────────────────────────────┘
           ↓↓↓
      SERVER PROCESSING
           ↓↓↓
training-plan-service.ts
┌─────────────────────────────────────────────────┐
│ 1. Detect: hasProsthetic = true                 │
│                                                 │
│ 2. Build AI Prompt:                             │
│    ├─ PLAN TYPE & PRIMARY OBJECTIVE             │
│    ├─ ATHLETE'S SESSION TYPE PREFERENCE         │
│    │  └─ "Design walking-dominant sessions..."  │
│    ├─ HEALTH & INJURY CONTEXT                   │
│    │  ├─ Post-stroke recovery rules             │
│    │  └─ [NEW] AFO-SPECIFIC GUIDANCE SECTION    │
│    │     ├─ Terrain preferences (flat)          │
│    │     ├─ Asymmetrical loading rules          │
│    │     ├─ Cadence control guidance            │
│    │     ├─ Progression sequence                │
│    │     └─ Session instruction requirements    │
│    └─ [rest of prompt]                          │
│                                                 │
│ 3. Send to OpenAI GPT-4                         │
└─────────────────────────────────────────────────┘
           ↓↓↓
        OPENAI GPT-4
           ↓↓↓
┌──────────────────────────────────────────────────┐
│ PROMPT INSTRUCTIONS:                             │
│                                                  │
│ "This athlete prefers WALKING as primary        │
│  session type. Design walking-dominant..."      │
│                                                  │
│ "This athlete uses Carbon fiber AFO..."         │
│                                                  │
│ "CRITICAL RULES:                                │
│  1. TERRAIN: flat, even surfaces preferred     │
│  2. ASYMMETRICAL LOADING: right leg             │
│     may fatigue faster                          │
│  3. CADENCE: maintain steady, controlled rhythm │
│  4. WITHIN-SESSION RECOVERY: include breaks     │
│  5. PROGRESSION:                                │
│     Phase 1: Walking-only (weeks 1-2)           │
│     Phase 2: Walk/jog intervals (weeks 3-4)     │
│     Phase 3: Balanced walk/jog (weeks 5-6)      │
│     Phase 4: Easy jogging (weeks 7-8)           │
│  6. SESSION INSTRUCTIONS MUST INCLUDE:          │
│     - Terrain recommendation                    │
│     - Right-leg monitoring cue                  │
│     - AFO fit check reminder                    │
│     - Stop criteria (AFO-specific)              │
│  7. PERFORMANCE GOALS ARE SECONDARY..."         │
│                                                  │
│ [... plus all standard coaching guidance ...]   │
└──────────────────────────────────────────────────┘
           ↓↓↓
         GENERATES
           ↓↓↓
┌──────────────────────────────────────────────────┐
│ 8-WEEK TRAINING PLAN (AFO-AWARE)                │
│                                                  │
│ Week 1-2: WALKING FOUNDATION (10-11 km)         │
│  ├─ Mon: 2km walk (flat pavement only)           │
│  │  └─ Post-session: Check AFO fit, right ankle │
│  ├─ Wed: 2.5km walk (flat pavement)              │
│  ├─ Thu: 1.5km recovery walk                     │
│  ├─ Fri: 2.5km walk/jog (2:1 ratio)              │
│  │  └─ "Right ankle doing OK? Maintain rhythm"  │
│  ├─ Sat: 2km walk                                │
│  └─ Sun: 1.5km recovery walk                     │
│                                                  │
│ Week 3-4: WALK/JOG PROGRESSION (12-13 km)      │
│  ├─ Increase jog segments within walk/jog       │
│  ├─ Still mostly walking (walk > jog time)      │
│  ├─ All sessions: flat terrain, right-leg       │
│  │  monitoring, AFO checks                      │
│  └─ Voice coach: "Nice steady rhythm, Nino!"    │
│                                                  │
│ Week 5-6: EASY JOG INTRODUCTION (14-15 km)     │
│ Week 7-8: TAPER & CONSOLIDATION (12-13 km)    │
│                                                  │
│ EVERY SESSION INCLUDES:                         │
│ ✅ Terrain spec: "flat pavement only"            │
│ ✅ Monitor: "right ankle/knee for swelling"     │
│ ✅ Check: "skin under AFO for pressure points"  │
│ ✅ Cue: "maintain steady, controlled rhythm"    │
│ ✅ Stop: "AFO slipping? Right leg pain? STOP"   │
│ ✅ Recovery: "expected right leg fatigue OK"    │
└──────────────────────────────────────────────────┘
           ↓↓↓
   RETURNED TO NINO'S APP
           ↓↓↓
NINO'S PHONE
┌──────────────────────────────────────────────────┐
│ ✅ PLAN READY                                    │
│                                                  │
│ Week 1: Walking Foundation                      │
│ • Monday: 2km walk (flat pavement)               │
│ • Wednesday: 2.5km walk                          │
│ • Thursday: 1.5km recovery walk                  │
│ • Friday: 2.5km walk/jog (2:1 ratio)            │
│ • Saturday: 2km walk                             │
│ • Sunday: 1.5km recovery walk                    │
│                                                  │
│ [View Full Plan] [Share with Physio] [Start]    │
└──────────────────────────────────────────────────┘
           ↓↓↓
    NINO STARTS SESSION
           ↓↓↓
GARMIN + AI VOICE COACH
┌──────────────────────────────────────────────────┐
│ 🎙️ PRE-RUN BRIEFING:                             │
│                                                  │
│ "Ciao Nino! 2km walk on flat pavement today.    │
│  Your AFO should feel comfortable. Walk at       │
│  conversational pace, steady rhythm.             │
│  Monitor your right ankle—if it gets stiff,     │
│  slow down. You've got this!"                    │
│                                                  │
│ [Session starts - Garmin recording]              │
│                                                  │
│ 🎙️ DURING SESSION:                              │
│ "Nice steady pace! How's your right ankle?"     │
│ [checks every km]                                │
│                                                  │
│ 🎙️ POST-RUN SUMMARY:                            │
│ "Excellent work! Quick checks:                  │
│  1. Any pressure under AFO?                     │
│  2. Right ankle—any swelling?                    │
│  3. How's your body feeling?                     │
│  Log these and get some rest!"                   │
└──────────────────────────────────────────────────┘
```

---

## Session Card Example: What Nino Sees

```
┌─────────────────────────────────────────────────────┐
│  WEEK 1, FRIDAY — FIRST WALK/JOG SESSION           │
├─────────────────────────────────────────────────────┤
│  🎯 Goal: Introduce walk/jog intervals               │
│  📏 Distance: 2.5 km                                │
│  ⏱️ Duration: ~25 minutes                           │
│  ❤️ Target HR: Zone 2 (aerobic)                     │
│  💪 Intensity: EASY                                │
│                                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━        │
│  PRE-RUN BRIEF                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━        │
│  "Exciting day! Today you're doing your first      │
│   walk/jog session. Pattern:                       │
│   • 2 min walk (comfortable pace)                  │
│   • 1 min jog (VERY easy, like a shuffle)         │
│   • Repeat 3 times                                 │
│   Flat pavement only."                            │
│                                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━        │
│  AFO-SPECIFIC GUIDANCE ← NEW FEATURE               │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━        │
│                                                    │
│  🗺️ TERRAIN:                                       │
│     Flat pavement ONLY. NO grass, trails,         │
│     hills, or uneven ground.                      │
│                                                    │
│  👥 RIGHT-LEG MONITORING:                          │
│     Right leg works HARDER in jog segments.       │
│     Watch for: fatigue, stiffness, ankle pain    │
│     If any concern, walk the jog segments.        │
│                                                    │
│  🦶 CADENCE GUIDANCE:                              │
│     Maintain STEADY, CONTROLLED rhythm.           │
│     Don't let pace drift upward naturally.        │
│                                                    │
│  ⚠️ STOP CRITERIA:                                 │
│     ❌ Sharp pain in left leg → STOP              │
│     ❌ AFO slipping → STOP                         │
│     ❌ Right leg swelling → WALK instead           │
│     ❌ Loss of balance → STOP                      │
│                                                    │
│  ✅ POST-SESSION CHECKS:                           │
│     □ Skin under AFO (pressure points?)            │
│     □ Right ankle (any swelling?)                 │
│     □ Right knee (soreness?)                      │
│     □ Overall fatigue (ready for Saturday?)       │
│                                                    │
│  📊 EXPECTED RESPONSE:                             │
│     Right leg will feel worked. Mild              │
│     hamstring/quad tiredness is normal.           │
│     LEFT leg: NO pain. Sleep well!                │
│                                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━        │
│                                                    │
│  [Start Session] [View Full Details] [Share]      │
└─────────────────────────────────────────────────────┘
```

---

## The Complete Coaching Loop

```
WEEK 1 EXECUTION
├─ Mon: 2km walk ✅ → AFO fit ✅, right ankle ✅
├─ Wed: 2.5km walk ✅ → right leg mildly sore (normal)
├─ Thu: 1.5km recovery ✅ → preparing for Friday
├─ Fri: 2.5km walk/jog ✅ → right leg worked, AFO secure
├─ Sat: 2km walk ✅ → managing well
└─ Sun: 1.5km recovery ✅ → ready for Week 2

        ↓ SYSTEM ANALYZES DATA ↓

ADAPTATION ALGORITHM
├─ Heart rate data: all in Zone 2 ✅
├─ Performance: completed all 5 sessions ✅
├─ AFO tolerance: stable, no issues ✅
├─ Right-leg compensation: manageable ✅
└─ Post-stroke recovery: on track ✅

        ↓ RECOMMENDATION ↓

WEEK 2 PLAN GENERATION
├─ Continue walking foundation (Nino's not ready for heavy jogging)
├─ Add more walk/jog intervals (he handled Friday well)
├─ Still mostly walking (2:1 walk:jog ratio)
├─ Maintain AFO guidance in every session
└─ Expect right-leg fatigue to stabilize

        ↓ AND SO ON ↓

By WEEK 4:
├─ Nino is comfortable with 1:1 walk/jog ratios
├─ Right leg is strong and managing compensation
├─ AFO feels natural and secure
└─ Ready for easy jogging introduction

By WEEK 8:
├─ Easy jogging with walking breaks established
├─ Can sustain 20-25 km/week
├─ AFO confidence is high
└─ Ready for next 8-week block (more jogging)
```

---

## The Key Difference: AFO Awareness

### Session WITHOUT AFO Awareness:
```
Monday: Easy 3km jog

- Start running
- Coach: "Keep your pace steady"
- Continue running
- Post-run summary: "Good job"

❌ No awareness of:
   • His AFO needs flat terrain
   • Right leg is compensating
   • Proprioceptive fatigue exists
   • AFO fit should be checked
   • Cadence should be controlled
```

### Session WITH AFO Awareness:
```
Monday: Easy 3km walk/jog

- Coach: "Flat pavement only, control your rhythm"
- Start: Walk 2 min, jog 1 min, repeat
- During: "How's your right ankle feeling?"
- Post: "Check AFO fit, right leg for swelling"
- Tomorrow: Plan adapted based on right-leg readiness

✅ Fully aware of:
   • Terrain preference (flat pavement)
   • Compensation patterns (right leg)
   • Unique fatigue type (proprioceptive)
   • Prosthetic durability (AFO checks)
   • Optimal mechanics (controlled cadence)
```

---

## Summary: Three Pillars

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  WALKING    │    │   POST-STROKE│    │     AFO     │
│  PREFERENCE │    │   RECOVERY   │    │   AWARENESS │
├─────────────┤    ├──────────────┤    ├─────────────┤
│ Plans bias  │    │ Conservative │    │ Every       │
│ toward      │    │ progression  │    │ session     │
│ walking     │    │ Effort-based │    │ includes:   │
│ sessions in │    │ pacing       │    │ • Terrain   │
│ early weeks │    │ No intensity │    │ • Monitoring│
│ with        │    │ until        │    │ • Checks    │
│ gradual     │    │ recovered    │    │ • Stop      │
│ jog intro   │    │              │    │   criteria  │
└─────────────┘    └──────────────┘    └─────────────┘
      ↓                  ↓                    ↓
    ALL INTEGRATED INTO NINO'S TRAINING PLAN & VOICE COACHING
      ↓
    PROFESSIONAL-GRADE COACHING FOR HIS SPECIFIC NEEDS
```

---

**Nino now has a system that understands his complete recovery journey!** 🇮🇹💪
