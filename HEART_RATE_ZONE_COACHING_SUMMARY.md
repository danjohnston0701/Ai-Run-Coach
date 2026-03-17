# Heart Rate Zone-Aware Coaching Implementation Summary

## Overview

We implemented comprehensive **zone-aware real-time coaching** that adapts all AI coaching prompts and messaging based on the target heart rate zone of the training session. This allows the coaching to be contextually relevant to the runner's actual training objective.

## Key Implementation Details

### 1. Zone Detection in Coaching Context

**Parameter Added**: `targetHeartRateZone?: number` (values: 1-5)

This parameter is passed through:
- Training plan context (from `WorkoutDetailScreen`)
- Pre-run briefing API calls
- Real-time coaching message generation
- Post-run analysis

### 2. Zone-Specific Coaching Logic

#### **Zone 1-2 (Aerobic/Recovery Focus)**

**When `targetHeartRateZone <= 2`**, the coaching system completely changes its messaging strategy:

##### A. **Struggle Coaching** (When pace drops)
- **Before**: Blamed pace drop on fatigue, asked runner to "push harder"
- **After**: Reframes pace drop as intentional aerobic training
- **Message**: "This aerobic work is building your base. Every Zone 2 session improves your capillary density and fat-burning efficiency. That's why elite runners spend 80% of their time at easy paces — you're conditioning your heart to sustain faster paces later. Heart rate is the goal here, not pace. Slow down as needed to stay in Zone 2 — that's exactly right."

##### B. **Technique/Form Coaching**
- **Before**: Corrected posture, form, arm angle (applicable to high-intensity runs)
- **After**: Shifts to breathing rhythm and relaxation
- **Focus**:
  - Steady, conversational breathing (if you can't speak full sentences, ease up)
  - Relaxation: jaw, shoulders, arms (tension wastes energy)
  - Natural rhythm establishment
  - Message: "Elite runners built their speed HERE" — validates the easy pace as legitimate training

##### C. **Heart Rate Check Coaching** (NEW coaching type)
- **Purpose**: Dedicated prompts that reinforce HR control as the primary goal
- **Logic**:
  - Target HR range: approximately 85%-105% of current HR
  - If HR too high: "Slow down slightly to bring it back into range. This is exactly the work — controlling your heart rate is how you build aerobic capacity."
  - If HR too low: "You can pick up the pace slightly. You want to work at that sustainable effort level where adaptation happens."
  - If HR in zone: "Your HR is right where it should be! This is the sweet spot for aerobic training. You're building your cardiovascular engine right now."
- **Aerobic Base Building Context**:
  ```
  - Increases mitochondrial density (more aerobic power)
  - Improves capillary density (better oxygen delivery)
  - Trains your body to burn fat efficiently (sustainable energy source)
  - Increases stroke volume (your heart pumps more blood per beat)
  - Allows faster paces to feel easier later (your "easy" pace will speed up naturally)
  ```

##### D. **Milestone Celebrations**
- **Before**: Generic celebration of distance
- **After**: Emphasizes aerobic adaptation happening in real-time
- **Message**: "Every kilometer at this steady effort is building your aerobic base. You're accumulating time in the mitochondrial adaptation zone. This sustainable effort is where real endurance is built."

##### E. **Final Push/Sprint Coaching** (final_500m, final_100m)
- **Before**: Encouraged runner to accelerate/push hard
- **After**: **Completely suppressed** for Zone 1-2 runs
- **Logic**: Zone 2 sessions are about sustaining aerobic effort, not sprinting
- **Replacement**: "Maintain Zone effort to the finish. Focus on HR, not pace."

##### F. **Route Terrain Coaching**
- **Before**: Used if runner had a planned route
- **After**: **Completely suppressed** for Zone 1-2 runs
- **Logic**: Zone 2 guidance ignores terrain variations (which can spike HR) — focus is on steady heart rate maintenance

### 3. Zone 3-5 Coaching (Default Behavior)

For higher-intensity zones (tempo, threshold, VO2, sprint), coaching remains focused on:
- Pace targets and adherence
- Form corrections for high intensity
- Terrain-based cues (if route available)
- Final push and sprint messaging
- Power and speed-based celebration

### 4. Cadence Calculation (Profile-Aware)

**Dynamic cadence targets** based on both **pace AND user profile**:

```
Base cadence ranges (from pace alone):
- Very slow (12+ min/km): 100-120 spm
- Zone 2 easy (10-12 min/km): 110-130 spm
- Zone 2/3 boundary (8-10 min/km): 130-150 spm
- Zone 3/4 boundary (6-8 min/km): 150-170 spm
- Zone 4+ fast (< 6 min/km): 170-185 spm

Adjustments applied:
- Height: Taller runners (-2 spm per 5cm above 175cm baseline)
  • Longer legs naturally stride further
- Fitness level:
  • Beginner: +2 spm (less running economy)
  • Intermediate: 0 spm
  • Advanced: -3 spm (better efficiency)
- Age: ~-1 spm per decade (older runners more joint-friendly)
```

**Result**: Instead of generic "aim for 180 spm," coaching says: "Your cadence target is 115 steps per minute — that's perfect for your pace and build."

### 5. Pre-Run Briefing

#### Coaching Plan Context Prioritization

When a run is started from a training plan (`trainingPlanId` present), the pre-run briefing **leads with plan context**, not distance/pace:

**Coached Workout Example**:
> "You're on Week 3 tempo run of your half-marathon build. Your lactate threshold work for today focuses on sustaining pace in Zone 4. You've been building your aerobic base all week — today is where you practice pushing that threshold higher. Weather is 15°C, light wind. You're ready. This is where the speed comes from."

**Free Run** (no plan context):
> "5km run at target 5:30/km pace. Current conditions are 15°C with light wind. Get your GPS locked, focus on consistent splits, and settle into your rhythm early."

#### Prompt Refinement

- **Max length**: 50 words total across ALL fields (briefing + intensity advice + readiness insight)
- **Spoken brevity**: ~10 second audio when spoken aloud
- **Tone**: "Punchy, direct — short sentences land harder"
- **Landing**: Plan context creates context-aware urgency and relevance

### 6. Real-Time Coaching Trigger Adaptation

Coaching message types shown during the run are filtered by zone:

| Coaching Type | Zone 1-2 | Zone 3+ |
|---|---|---|
| **Struggle** | Show (reframed as aerobic work) | Show (push harder) |
| **Heart Rate Check** | Show (new type, HR control focus) | Show if HR > max |
| **Technique Form** | Show (breathing/relaxation) | Show (posture/form) |
| **Milestone** | Show (aerobic adaptation) | Show (standard celebration) |
| **Cadence** | Show (profile-aware targets) | Show (profile-aware targets) |
| **Positive Reinforcement** | Show | Show |
| **Route Terrain** | Hide (suppress zone variation) | Show |
| **Final 500m/100m** | Hide (suppress sprint) | Show |
| **ETA Update** | Show | Show |

### 7. Integration Points for iOS

To implement this on iOS, ensure these data flows are in place:

#### A. **Pass `targetHeartRateZone` to Real-Time Coaching Endpoint**

When requesting coaching messages during a run:

```json
{
  "coachingType": "heart_rate_check" | "struggle" | "milestone" | ...,
  "targetHeartRateZone": 2,
  "currentHR": 145,
  "distance": 2.5,
  "elapsedTime": 900,
  "currentPace": "5:00/km",
  "heartRate": 145,
  "cadence": 165,
  // ... other metrics
}
```

#### B. **Conditional Coaching Type Selection**

For Zone 1-2 runs:
- **Always include** `heart_rate_check` coaching type option (check HR every 1-2 minutes)
- **Remove** final sprint coaching types from the pool
- **Filter out** terrain-based coaching if zone <= 2

#### C. **Pre-Run Briefing Implementation**

- Extract `trainingPlanId`, `workoutType`, `planWeekNumber`, `targetHeartRateZone`, `goalType` from the plan
- Pass to `/api/coaching/pre-run-briefing-audio` endpoint
- Ensure briefing generation **leads with plan context** before distance/pace/weather

#### D. **Visual UI Changes**

**For Zone 1-2 sessions on the run session screen**:
- Add prominent "Heart Rate Zone" indicator at top
- Show target HR range (e.g., "Zone 2: 120-155 bpm")
- If HR drifts outside zone, show coaching prompt: "HR is high, ease back to stay in Zone 2"
- Include "Aerobic Base Building" label/badge on session start

### 8. Summary of Changes to Prompts

All coaching generation functions now accept `targetHeartRateZone` and branch behavior:

1. **`generateStruggleCoaching()`**
   - Detects Zone 1-2 → returns aerobic context instead of fatigue messaging
   - Zones 3-5 → original struggle/push harder coaching

2. **`generateCadenceCoaching()`**
   - Calls `getOptimalCadenceForPace()` with user height, age, fitness level
   - Returns personalized cadence targets instead of hardcoded 170-180 spm

3. **`generateEliteCoaching()`**
   - `case 'technique_form'`: Branches on zone
     - Zone 1-2: Breathing + relaxation
     - Zones 3-5: Form + posture correction
   - `case 'milestone'`: Branches on zone
     - Zone 1-2: Adds "accumulating aerobic adaptation" message
     - Zones 3-5: Standard celebration
   - `case 'heart_rate_check'` (NEW): Dedicated Zone 2 HR control coaching
   - `case 'final_500m'` & `case 'final_100m'`: Return empty for Zone 1-2

4. **`generateWellnessAwarePreRunBriefing()`**
   - Detects `trainingPlanId`
   - If present: leads with workout type + zone + week context
   - If absent: leads with distance + pace + weather

---

## Testing Checklist for iOS Implementation

- [ ] Zone 2 run: Pace drop triggers aerobic messaging (not "you're slowing down, push harder")
- [ ] Zone 2 run: Heart rate check appears naturally (every 1-2 min)
- [ ] Zone 2 run: No final sprint/push coaching shown
- [ ] Zone 2 run: Cadence target reflects user height/fitness (e.g., "115 spm" not "180 spm")
- [ ] Coached workout: Pre-run briefing leads with "Week 3 tempo run" not just "5km"
- [ ] Coached workout: Auto-starts briefing + tracking (no manual "Start Run" tap)
- [ ] Zone 3-5 run: Pace drop coaching is aggressive (original behavior)
- [ ] Zone 3-5 run: Final 500m/100m sprint coaching shown
- [ ] Profile data used: Cadence adjusted for runner height/age/fitness level

---

## Key Behavioral Differences

### Before Zone-Aware Coaching
- All runs received identical coaching regardless of zone
- Zone 2 easy runs felt like the system was criticizing slow pace
- Cadence always 170-180 spm (generic, not personalized)
- Final sprint coaching on recovery runs (counterintuitive)

### After Zone-Aware Coaching
- Zone 1-2 runs celebrate steady effort and aerobic adaptation
- Runner understands slow pace is **strategic**, not failure
- Cadence targets match runner's build + fitness level
- Coaching types filtered by zone appropriately
- Pre-run briefing creates plan-aware context before run starts
- HR check messaging reinforces long-term aerobic benefit
