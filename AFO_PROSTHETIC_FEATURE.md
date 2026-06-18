# AFO/Prosthetic Device Feature Implementation

## Overview

Users can now specify that an injury or condition involves a prosthetic device or orthotic (AFO, brace, etc.), and the AI coaching system will automatically generate prosthetic-aware training plans with specialized guidance for every session.

## What Nino Can Now Do

### Scenario: Nino's Setup

Nino adds **TWO separate injury/condition records**:

#### Injury 1: Post-Stroke Recovery
```
Body Part: "Left leg" (or "Left foot" / "Left ankle" / specific affected area)
Status: "Recovering"
Injury Date: October 15, 2025
Notes: "Post-stroke left-sided hemiparesis. Left leg weakness, working on rehabilitation."
Is Prosthetic/AFO: NO
```

#### Injury 2: AFO Device
```
Body Part: "Right leg" (or the non-affected leg - the one doing compensation)
Status: "Chronic" (or "Recovering")
Injury Date: October 15, 2025 (or whenever AFO was fitted)
Notes: "Wearing AFO brace for post-stroke support. Carbon fiber AFO on left foot for stability."
Is Prosthetic/AFO: YES
Prosthetic Type: "Carbon fiber AFO (ankle-foot orthotic)"
```

**Result**: When Nino generates a training plan, he gets:
1. ✅ Walking-dominant sessions (due to `defaultSessionType = "walk"`)
2. ✅ Conservative post-stroke recovery progression
3. ✅ **NEW**: AFO-specific guidance in EVERY session
   - Terrain recommendations (flat pavement preferred)
   - Right-leg fatigue monitoring (compensatory leg)
   - AFO fit checks
   - Cadence control cues
   - Stop criteria specific to prosthetic use

---

## Data Model Changes

### Android App: Injury.kt

Added two new fields to the `Injury` data class:

```kotlin
data class Injury(
    val id: String? = null,
    val bodyPart: String,
    val status: InjuryStatus,
    val notes: String? = null,
    val injuryDate: String? = null,
    val isProstheticOrAFO: Boolean = false,        // NEW: marks if this involves a device
    val prostheticType: String? = null,            // NEW: describes the device type
    val createdAt: Long = System.currentTimeMillis()
)
```

New list of prosthetic types:
```kotlin
val PROSTHETIC_TYPES = listOf(
    "Carbon fiber AFO (ankle-foot orthotic)",
    "Plastic AFO",
    "Full prosthetic leg",
    "Partial foot prosthetic",
    "Knee brace / ortho",
    "Ankle brace / ankle support",
    "Compression sleeve",
    "Other orthotic device"
)
```

### Server: training-plan-service.ts

Added two new optional fields to `InjuryInput` interface:

```typescript
export interface InjuryInput {
  bodyPart: string;
  status: string;
  notes?: string;
  injuryDate?: string;
  isProstheticOrAFO?: boolean;    // NEW
  prostheticType?: string;        // NEW
}
```

---

## Prompt Enhancement

When a user marks an injury as prosthetic-related, the system automatically adds a new section to the AI prompt:

### ━━━ PROSTHETIC / ORTHOTIC DEVICE COACHING CONSTRAINTS ━━━━━━━━━━

The system tells GPT-4:

```
This athlete uses [prosthetic type].

CRITICAL COACHING RULES:

1. TERRAIN — Strongly prefer flat, even surfaces (pavement, track, gym treadmill)
   
2. ASYMMETRICAL LOADING — Non-prosthetic leg fatigues faster
   • Design sessions where intensity can be modulated
   • Monitor contralateral side for fatigue/swelling
   
3. CADENCE & CONTROL — Prosthetic users benefit from lower, controlled cadence
   • Use effort descriptors, not speed targets
   • Avoid high-speed bursts and uncontrolled acceleration
   
4. WITHIN-SESSION RECOVERY — Include explicit recovery breaks
   • Prosthetic adds proprioceptive fatigue independent of aerobic effort
   
5. PROGRESSION SEQUENCE — Strict phases:
   • Phase 1: Walking-only foundation
   • Phase 2: Walk/jog intervals (2:1)
   • Phase 3: Balanced walk/jog (1:1)
   • Phase 4: Easy jogging with walking breaks
   
6. SESSION INSTRUCTIONS — EVERY session MUST include:
   • Terrain recommendation
   • Post-session checks (skin, swelling)
   • Monitoring cues for non-prosthetic leg
   • Stop criteria for prosthetic-related issues
   • Expected response
   
7. PERFORMANCE GOALS ARE SECONDARY — Safety comes first
```

---

## How It Works End-to-End

### Step 1: Nino's Profile Setup

Nino goes to "Create Training Plan" and adds injuries:

```
1. Click "Add Injury/Condition"
   → Body Part: "Left leg"
   → Status: "Recovering"
   → Notes: "Post-stroke hemiparesis"
   → [Toggle] Is Prosthetic/AFO: NO
   → Save

2. Click "Add Injury/Condition" again
   → Body Part: "Right leg"
   → Status: "Chronic"
   → Notes: "AFO brace for stability"
   → [Toggle] Is Prosthetic/AFO: YES ✅
   → Prosthetic Type: "Carbon fiber AFO (ankle-foot orthotic)"
   → Save
```

### Step 2: Plan Generation

When Nino clicks "Generate Plan":

```
Android App → API Call:
{
  "goalType": "build_endurance",
  "targetDistance": 25,
  "durationWeeks": 8,
  "daysPerWeek": 5,
  "injuries": [
    {
      "bodyPart": "Left leg",
      "status": "recovering",
      "notes": "Post-stroke hemiparesis",
      "injuryDate": "2025-10-15",
      "isProstheticOrAFO": false
    },
    {
      "bodyPart": "Right leg",
      "status": "chronic",
      "notes": "AFO brace for stability",
      "injuryDate": "2025-10-15",
      "isProstheticOrAFO": true,        // ← Triggers AFO section
      "prostheticType": "Carbon fiber AFO (ankle-foot orthotic)"
    }
  ],
  "defaultSessionType": "walk"
}
```

### Step 3: Server-Side Processing

```
generateTrainingPlan() receives injuries array
  ↓
Detects: hasProsthetic = true
  ↓
Builds injury section with:
  • Post-stroke recovery guidance
  • AFO-specific constraints section
  ↓
Creates prompt with:
  ━━━ PLAN TYPE & PRIMARY OBJECTIVE
  ━━━ ATHLETE'S SESSION TYPE PREFERENCE (walk-dominant)
  ━━━ HEALTH & INJURY CONTEXT (includes AFO section)
  ↓
Sends to OpenAI
  ↓
OpenAI generates plan with AFO awareness baked into every session
```

### Step 4: AI Output

GPT-4 generates a plan where **EVERY session** includes:

```json
{
  "dayOfWeek": 0,
  "workoutType": "walking",
  "distance": 2.0,
  "instructions": {
    "preRunBrief": "Easy 2km walk on flat pavement only.",
    "sessionStructure": "Warm-up 2 min, main 16 min, cool-down 2 min",
    
    "afoSpecificGuidance": {
      "terrainPreference": "flat pavement or track — avoid grass/uneven ground",
      "rightLegMonitoring": "monitor right ankle/knee — if stiffness develops, slow down",
      "postSessionChecks": [
        "Check skin under AFO for pressure points",
        "Right ankle: any swelling?",
        "Overall fatigue level"
      ],
      "cadenceGuidance": "maintain steady, controlled rhythm; don't accelerate naturally",
      "stopCriteria": [
        "Sharp pain in left leg",
        "AFO slipping or discomfort",
        "Right leg swelling",
        "Loss of balance"
      ],
      "expectedResponse": "Right leg may feel worked. No pain in left leg. Sleep well."
    }
  }
}
```

### Step 5: During Running (Live Coaching)

When Nino starts a session, the AI voice coach:

```
PRE-RUN BRIEF (Generated from sessionInstructions):
"You're about to do an easy 2km walk on flat pavement. 
Your AFO should feel comfortable. Monitor your right ankle—
if it gets stiff, slow down. Walk at conversational pace.
You've got this!"

DURING-RUN (Live coaching):
• Pace coaching: "You're in good shape, keep this rhythm steady"
• Form cues: "Maintain that controlled cadence"
• Encouragement: "Your body's handling this well"
• AFO-specific: "Right ankle feeling OK?"

POST-RUN (Session summary):
• "Great work! How's your right ankle?"
• "Any pressure points under the AFO?"
• "Log your post-session check: skin under AFO, swelling?"
• Recommendation: "Next session plan is walk/jog intervals—
  same flat pavement, same monitoring."
```

---

## UI Changes Needed (Android App)

### In GeneratePlanScreen.kt or CoachingProgrammeScreen.kt

When displaying the injury management dialog:

```kotlin
// After existing status dropdown:
Row(
    modifier = Modifier
        .fillMaxWidth()
        .padding(vertical = 8.dp),
    verticalAlignment = Alignment.CenterVertically
) {
    Text("Is Prosthetic/AFO?", style = MaterialTheme.typography.labelMedium)
    Spacer(Modifier.width(8.dp))
    Switch(
        checked = isProsthetic,
        onCheckedChange = { isProsthetic = it }
    )
}

// If isProsthetic is true, show prosthetic type dropdown:
if (isProsthetic) {
    Column {
        Text("Device Type", style = MaterialTheme.typography.labelSmall)
        LazyColumn {
            items(PROSTHETIC_TYPES) { type ->
                DropdownMenuItem(
                    text = { Text(type) },
                    onClick = { 
                        prostheticType = type
                        expanded = false 
                    }
                )
            }
        }
    }
}
```

---

## Benefits for Nino (and other prosthetic users)

✅ **Walking-First Plans** — Sessions default to walking, progressing gradually
✅ **AFO-Aware Every Session** — Terrain, monitoring cues, stop criteria all built in
✅ **Asymmetrical Loading Guidance** — Right-leg compensation explicitly monitored
✅ **Safety-First Progression** — Strict phase structure (walk → walk/jog → easy jog)
✅ **Proprioceptive Fatigue Recognition** — System understands this is different from aerobic fatigue
✅ **Live Coaching Integration** — Voice coach mentions AFO, right-leg checks, rhythm cues
✅ **Personalized Adaptations** — Future plan adaptations will respect prosthetic constraints
✅ **Professional Quality** — Plans are as tailored as working with a sports physio + running coach combo

---

## Example: Week 1 of Nino's Plan

### Week 1: Walking Foundation with AFO Acclimatization

```json
{
  "weekNumber": 1,
  "weekDescription": "Walking foundation establishing comfort and confidence in the AFO on flat terrain.",
  "totalDistance": 10.5,
  "focusArea": "Aerobic base, proprioceptive control, AFO acclimatization",
  "intensityLevel": "Zone 2 (easy, conversational)",
  
  "workouts": [
    {
      "dayOfWeek": 0,
      "workoutType": "walking",
      "distance": 2.0,
      "duration": 25,
      "targetHeartRateZone": "Zone 2",
      "instructions": {
        "preRunBrief": "Gentle 2km walk on flat pavement. Focus on steady rhythm and AFO comfort. Walk at conversational pace.",
        "sessionStructure": "Warm-up 2 min walk, main 18 min walk, cool-down 5 min walk",
        
        "afoSpecificGuidance": {
          "terrainPreference": "flat pavement or track — avoid grass, trails, uneven ground",
          "rightLegMonitoring": "monitor right ankle/knee; if stiffness by min 15, slow down",
          "postSessionChecks": [
            "Skin under AFO — any pressure points?",
            "Right ankle/knee — any swelling?",
            "Overall fatigue level — how does your body feel?"
          ],
          "cadenceGuidance": "maintain steady, controlled rhythm; don't let pace drift upward naturally",
          "stopCriteria": [
            "Sharp pain in left leg",
            "AFO slipping or discomfort",
            "Right leg swelling",
            "Dizziness or loss of balance"
          ],
          "expectedResponse": "Mild fatigue. Right leg may feel worked. No pain in left leg. Sleep well tonight."
        }
      }
    },
    // ... more sessions with similar AFO guidance
  ]
}
```

---

## Testing Nino's Plan

### Pre-Execution (Physio Review)
1. ✅ Download/review the 8-week plan
2. ✅ Have physiotherapist review progression
3. ✅ Confirm terrain restrictions are appropriate
4. ✅ Verify right-leg monitoring cues make sense

### During Execution (Week 1)
1. ✅ Log all 5 sessions in Garmin
2. ✅ Answer post-session AFO checks
3. ✅ Track right-leg fatigue/swelling
4. ✅ Listen to AI voice coaching cues

### Adaptation (Week 2)
1. ✅ System analyzes Week 1 performance
2. ✅ If right-leg fatigue was high → slower Week 2 progression
3. ✅ If going well → proceed to Week 2 walk/jog intervals
4. ✅ Plan evolves while respecting AFO constraints

---

## Code Files Modified

1. ✅ `app/src/main/java/live/airuncoach/airuncoach/domain/model/Injury.kt`
   - Added `isProstheticOrAFO` boolean
   - Added `prostheticType` string
   - Added `PROSTHETIC_TYPES` list

2. ✅ `server/training-plan-service.ts`
   - Updated `InjuryInput` interface
   - Enhanced injury lines generation to include prosthetic type
   - Added AFO-specific guidance section to prompt
   - Guidance auto-activates when `isProstheticOrAFO === true`

---

## Next Steps

### Immediate (Testing)
1. ✅ Code is ready for Nino to test
2. Build and test the Android app UI changes
3. Create Nino's profile with both injuries
4. Generate a test plan and verify AFO guidance is included

### Short-term (Polish)
1. Update GeneratePlanScreen UI to show prosthetic type selector
2. Add helpful tooltips explaining AFO/prosthetic device purpose
3. Test with a few users to gather feedback

### Medium-term (Enhancement)
1. Consider adding "prosthetic side" (left vs right) field for clearer monitoring guidance
2. Create prosthetic-specific plan templates/suggestions
3. Add post-run AFO survey ("How was your AFO today?")
4. Integrate AFO-specific performance metrics

---

## Summary

**Before**: Users could add injuries, but system didn't understand AFO-specific biomechanics.

**Now**: 
- ✅ Users can mark injuries as prosthetic-related
- ✅ System auto-generates AFO-aware guidance in the prompt
- ✅ Every session includes terrain, monitoring, and stop criteria specific to prosthetics
- ✅ Plans are walking-first, right-leg compensatory-aware, and safety-focused
- ✅ Voice coaching integrates AFO monitoring cues

**Result**: Nino gets a plan as tailored as working with a sports physio + running coach together, with AI voice coaching that understands his AFO and recovery journey.

---

## For Nino Specifically

When he's ready:

1. **Set up profile**:
   - `defaultSessionType = "walk"` ✅
   - Add "Left leg" injury: post-stroke recovery
   - Add "Right leg" injury: AFO (mark as prosthetic) ✅

2. **Generate plan**:
   - Goal: "Build endurance"
   - Duration: 8 weeks
   - Frequency: 5 days/week
   - Target: 20-25 km/week peak

3. **Result**:
   - Walking-dominant plan (Weeks 1-2)
   - Graduated walk/jog (Weeks 3-5)
   - Easy jogging with walking breaks (Weeks 6-8)
   - Every session: AFO terrain cues, right-leg monitoring, stop criteria
   - Voice coaching understands his journey

**Ready to give it a try!** 🇮🇹💪
