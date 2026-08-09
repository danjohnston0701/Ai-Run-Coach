# Pre-Run Brief/Briefing Display in iOS App - Comprehensive Analysis

## Executive Summary

The app implements a sophisticated **session-based pre-run coaching system** where briefings are AI-generated per training session and displayed to users before they start their run. The system is integrated with the training plan workflow and uses multi-stage coaching tone adaptation.

---

## 1. COMPONENTS DISPLAYING PRE-RUN BRIEFING

### 1.1 **Client-Side UI Components**

#### SwiftUI (iOS Native)
- **`StravaSettingsView` & `StravaViews.swift`** (lines 1-449)
  - Handles Strava integration and post-run sharing
  - Not directly involved in pre-run briefing display

#### React/TypeScript Components
- **`Home.tsx`** (Main Hub)
  - **`PreRunModal`** (lines ~1250-1350)
    - Modal dialog showing before a run starts
    - Allows users to configure: distance, time, AI coach toggling
    - Displayed when user clicks "Start Session" or "Map My Run"
    - Uses state: `showPreRunModal`, `preRunMode`, `preRunDistance`, `preRunTime`

- **`PreEvent.tsx`** (lines 1-568)
  - **Event-specific pre-run setup screen**
  - Shows event details (route map, distance, difficulty, elevation)
  - Toggle for: Target Time, AI Coach
  - Route information: polyline, waypoints, elevation data
  - **Pre-run button**: "Start Run" (line 556-564)
    - Navigates to `/run` with configured params
    - Passes: `routeId`, `distance`, `aiCoach`, `targetTime`, `eventId`

- **`RunSession.tsx`** (Main Running Screen)
  - **No explicit pre-run brief display** in the current implementation
  - Uses **phase-based coaching statements** from `@shared/coachingStatements`
  - Coaching is **real-time during the run**, not pre-run

- **`RoutePreview.tsx`** (inferred from route parameters)
  - Route preview before Map My Run starts
  - Shows AI-generated route on map

---

## 2. API CALLS TO FETCH BRIEFING

### 2.1 **Pre-Run Brief API Endpoint**

**Route Definition**: `server/routes-session-coaching.ts` (lines 22-111)

```typescript
GET /api/workouts/:workoutId/session-instructions
```

**Purpose**: Fetch pre-generated session instructions for a planned workout, called before a run starts

**Response Structure**:
```typescript
{
  id: string;
  plannedWorkoutId: string;
  preRunBrief: string;           // ← Main briefing text
  sessionStructure: {
    type: string;                 // "intervals", "tempo", "long_run", etc.
    goal: string;                 // "speed", "endurance", "recovery"
    phases: Array<{
      name: string;               // "warmup", "main_set", "cooldown"
      durationKm: number;
      durationSeconds: number;
      targetIntensity: string;    // "z1-z2", "z3-z4"
      description: string;
    }>;
    coachingTriggers: Array<{
      phase: string;
      trigger: string;            // "at_start", "at_end", "rep_start", etc.
      message: string;            // Coaching cue
    }>;
  };
  aiDeterminedTone: string;       // Tone determination
  coachingStyle: {
    encouragementLevel: string;    // "low" | "moderate" | "high"
    detailDepth: string;          // "minimal" | "moderate" | "detailed"
    technicalDepth: string;       // "simple" | "moderate" | "advanced"
  };
  insightFilters: {
    include: string[];
    exclude: string[];
  };
  toneReasoning: string;
}
```

**When Called**:
- Backend: Called on-demand if not pre-generated (line 54-70)
- Can be called when user starts a training plan session
- May be pre-generated during training plan creation (background job)

### 2.2 **Where Pre-Run Brief is Used**

**Server Route Analysis** (`server/routes.ts`, line 3561):
```typescript
// When fetching run analysis, session instructions are included:
sessionInstructions: sessionInstructions ? {
  aiDeterminedTone: sessionInstructions.aiDeterminedTone,
  coachingStyle: sessionInstructions.coachingStyle,
  insightFilters: sessionInstructions.insightFilters,
  sessionStructure: sessionInstructions.sessionStructure,
  preRunBrief: sessionInstructions.preRunBrief,  // ← Pre-run brief included here
} : undefined
```

This is returned as part of `GET /api/runs/:id/comprehensive-analysis`

---

## 3. COACH MESSAGING BEFORE RUN

### 3.1 **Pre-Run Coaching System**

The system has a **two-phase approach**:

#### Phase 1: **Session Design & Tone Determination** (Before Run)
- Called when user prepares to run (or during training plan creation)
- File: `server/session-coaching-service.ts`, lines 308-337

```typescript
export async function generateSessionInstructions(
  userId: string,
  plannedWorkoutId: string,
  workoutData: SessionToneRequest
)
```

**What it generates**:
1. **AI-Determined Tone** (lines 323-324)
   - Analyzes runner profile, session type, intensity
   - Returns: tone, intensity level, encouragement level, detail depth
   - Can override user preference based on session context

2. **Pre-Run Brief** (lines 329)
   - AI-generated 2-4 sentence briefing specific to the session
   - Includes: what they're doing, what to focus on, why it matters
   - Generated by `generateAiSessionDesign()` (lines 345-441)

3. **Session Structure** (lines 330)
   - Phase breakdown (warmup, main effort, cooldown)
   - Phase-specific targets and coaching triggers

**AI Prompt** (lines 353-361):
```
You are an elite AI running coach designing a personalised coaching plan.
Your job is to:
1. Write a specific, motivating pre-run briefing (2-4 sentences)
2. Design a session structure with phases, targets, and coaching trigger messages
```

#### Phase 2: **Real-Time Coaching During Run**
- Phase-based coaching statements from `@shared/coachingStatements`
- **Not a pre-run briefing** but live coaching

### 3.2 **AI Coach Settings** (Client)

File: `client/src/lib/coachSettings.ts`

```typescript
export interface AiCoachSettings {
  gender: 'male' | 'female';
  accent: 'british' | 'australian' | 'american' | 'irish' | 'scottish' | 'new_zealand';
  tone: 'energetic' | 'motivational' | 'instructive' | 'factual' | 'abrupt';
}
```

- Loaded from user profile
- Can be customized in Settings
- Used to determine TTS voice and messaging style

---

## 4. PRE-RUN SCREENS / SETUP FLOWS

### 4.1 **Home Page Pre-Run Modal**

**Location**: `client/src/pages/Home.tsx`, lines ~1250-1400

**Trigger**: 
- Click "Start Session" or "Map My Run" button
- Opens animated modal overlay

**UI Elements**:
```tsx
showPreRunModal && (
  <motion.div className="fixed inset-0 bg-black/80 z-[100]">
    {/* Modal dialog */}
    <div>
      <h2>{preRunMode === "mapmyrun" ? "Map My Run Setup" : "Run Setup"}</h2>
      
      {/* Distance Control */}
      <div>
        <Slider value={preRunDistance} onChange={setPreRunDistance} />
      </div>
      
      {/* Time Control */}
      {preRunTimeEnabled && (
        <div>
          <input type="number" value={preRunTime.h} />
          <input type="number" value={preRunTime.m} />
          <input type="number" value={preRunTime.s} />
        </div>
      )}
      
      {/* AI Coach Toggle */}
      <Switch checked={aiCoachEnabled} />
      
      {/* Start Button */}
      <Button onClick={handleConfirmPreRun}>Start Run</Button>
    </div>
  </motion.div>
)
```

**Parameters Passed to Run**:
```typescript
{
  distance: string;
  level: string;
  lat: string;
  lng: string;
  targetTime: string;
  aiCoach: "on" | "off";
  liveTracking: "on" | "off";
  exerciseType: "running" | "walking";
}
```

### 4.2 **Event Pre-Run Screen**

**Location**: `client/src/pages/PreEvent.tsx`, lines 1-568

**Route**: `/event/:id`

**UI Components** (lines 329-565):
- Map showing route (Polyline with start/end markers)
- Event details (distance, difficulty, elevation)
- **Target Time toggle + input** (lines 464-527)
- **AI Coach toggle** (lines 529-552)
- **"Start Run" button** (lines 555-565)

**Flow**:
```
Event Page → Show Route Map + Details
         → User Sets Target Time (optional)
         → User Toggles AI Coach
         → Click "Start Run"
         → Navigate to /run with params
```

**Data Fetched** (line 219):
```typescript
const res = await fetch(`/api/events/${eventId}`);
// Response includes route with polyline and elevation
```

### 4.3 **Training Plan Workout Preparation**

**Flow** (inferred from routes-session-coaching.ts):

1. **User starts a planned workout**
2. **Fetch session instructions**:
   ```typescript
   GET /api/workouts/:workoutId/session-instructions
   ```
3. **Display to user** (implementation location: TBD, likely in Training Plans UI)
   - Show preRunBrief
   - Show sessionStructure phases
   - Show aiDeterminedTone

---

## 5. PRE-RUN BRIEF GENERATION DETAILS

### 5.1 **Generation Flow**

**Trigger Point**: `generateSessionInstructions()` (server/session-coaching-service.ts, line 308)

**Steps**:

1. **Fetch Context** (lines 314-318):
   ```typescript
   const [aiRunnerProfile, lastRunInsight, user] = await Promise.all([
     getRunnerProfile(userId),      // AI analysis of runner's style
     getLastRunCoachingInsight(userId), // Previous coaching feedback
     db.select().from(users)        // User profile
   ]);
   ```

2. **Parallel Generation** (lines 323-326):
   ```typescript
   const [toneDecision, sessionDesign] = await Promise.all([
     determineSessonCoachingTone(...),  // Tone & style selection
     generateAiSessionDesign(...)       // Pre-run brief + structure
   ]);
   ```

3. **Return Structure** (lines 328-336):
   - `preRunBrief`: The actual coaching message
   - `sessionStructure`: Phase breakdown
   - `aiDeterminedTone`: Selected tone
   - `coachingStyle`: Encouragement, detail depth, technical depth
   - `insightFilters`: What coaching to include/exclude

### 5.2 **Tone Determination System**

**File**: `server/session-coaching-service.ts`, lines 58-201

**Inputs to AI**:
```
Runner Athletic Profile:
- Athletic Grade (e.g., "elite", "intermediate")
- Fitness Level
- Prior Race Experience
- Weekly Mileage
- User's Preferred Tone
- Allow AI Adaptation?

Session Characteristics:
- Workout Type (easy, intervals, tempo, long_run, etc.)
- Heart Rate Zone (z1-z5)
- Session Goal (speed, endurance, recovery)
- Duration, Distance, Intervals

Last Run Assessment:
- What happened (coaching feedback from last run)
- Coach recommendation
- Adjustment needed?
```

**AI Decision** (lines 90-149):
```
Output JSON:
{
  "tone": "light_fun|direct|motivational|calm|serious|playful|instructive",
  "intensity": "relaxed|moderate|intense",
  "reasoning": "Brief explanation",
  "coachingStyle": {
    "encouragementLevel": "low|moderate|high",
    "detailDepth": "minimal|moderate|detailed",
    "technicalDepth": "simple|moderate|advanced"
  },
  "insightFilters": {
    "include": ["pace_deviation", "effort_level"],
    "exclude": ["km_splits"]
  }
}
```

### 5.3 **Pre-Run Brief Generation**

**File**: `server/session-coaching-service.ts`, lines 345-441

**AI System Prompt** (lines 353-361):
```
You are an elite AI running coach designing a personalised coaching plan.
Your job is to:
1. Write a specific, motivating pre-run briefing (2-4 sentences) that tells the athlete 
   exactly what they are doing today, what to focus on, and why this session matters
2. Design a session structure with phases, targets, and coaching trigger messages
```

**User Prompt Requirements** (lines 371-409):
- Session type and goal
- Last run context (if available)
- Phase design guidance
- Coaching trigger message format (under 20 words, active voice)

**Expected Response**:
```json
{
  "preRunBrief": "Today is your 5km tempo run building threshold pace. Push hard but controlled through the main effort, focusing on steady breathing and rhythm. This speed work prepares you for race-pace efforts.",
  "sessionStructure": {
    "type": "tempo",
    "goal": "threshold_development",
    "phases": [
      {
        "name": "warmup",
        "durationKm": 1.0,
        "durationSeconds": null,
        "targetIntensity": "z1-z2",
        "targetPaceNote": "Very easy, conversational",
        "description": "Dynamic warm-up jog"
      },
      {
        "name": "tempo_block",
        "durationKm": 3.5,
        "durationSeconds": null,
        "targetIntensity": "z4",
        "targetPaceNote": "Threshold pace (6:00-6:20/km)",
        "description": "Sustained threshold effort"
      },
      {
        "name": "cooldown",
        "durationKm": 0.5,
        "durationSeconds": null,
        "targetIntensity": "z1-z2",
        "description": "Easy cool-down jog"
      }
    ],
    "coachingTriggers": [
      {
        "phase": "warmup",
        "trigger": "at_end",
        "message": "Build into tempo pace now. Controlled, uncomfortable but manageable."
      },
      {
        "phase": "tempo_block",
        "trigger": "at_start",
        "message": "Tempo effort. Find your rhythm, breathe steady, hold the pace."
      },
      {
        "phase": "cooldown",
        "trigger": "at_start",
        "message": "Excellent tempo work. Easy jog to finish."
      }
    ]
  }
}
```

### 5.4 **Fallback Brief** (If AI Fails)

**File**: `server/session-coaching-service.ts`, lines 446-453

```typescript
function buildFallbackBrief(workout: SessionToneRequest): string {
  const distStr = workout.distance ? `${workout.distance.toFixed(1)}km` : "today's";
  const typeStr = workout.workoutType.replace(/_/g, " ");
  
  if (workout.intervalCount) {
    return `Today is ${distStr} ${typeStr} with ${workout.intervalCount} repetitions. 
            Hit each rep hard and recover well between them. 
            This session builds your speed and fitness — trust the process.`;
  }
  
  return `Today's ${distStr} ${typeStr} session focuses on ${workout.sessionGoal?.replace(/_/g, " ") || "building your fitness"}. 
          Run at a controlled effort and stay consistent throughout.`;
}
```

---

## 6. COACHING COOLDOWN & MESSAGING MANAGEMENT

**File**: `server/coaching-cooldown.ts` (lines 1-202)

**Purpose**: Prevent coaching cues from firing back-to-back while guaranteeing distance milestones

**Cooldown Rules**:
- **NON_MILESTONE_COOLDOWN**: 90 seconds between non-milestone cues
- **POST_MILESTONE_BUFFER**: 45 seconds of silence after any milestone
- **Milestones** (always fire):
  - Km splits (honors user's split interval setting)
  - 500m check-in
  - Final 500m / Final 100m
  - Interval transitions
  - Navigation turns

**Implementation**:
```typescript
export async function checkCooldown(
  endpointName: string,
  body: any,
  userId: string | null | undefined
): Promise<CooldownResult>
```

---

## 7. iOS NATIVE COMPONENTS

**Files**: 
- `ios/StravaViewModel.swift`
- `ios/StravaViews.swift`

**Current Implementation**: Limited scope (Strava integration only)

**No Direct Pre-Run Brief Component** in Swift currently. The main app appears to be web-based (React) with potential for iOS WebView embedding.

---

## 8. DATA FLOW SUMMARY

```
User at Home Page
    ↓
Click "Start Session" or "Map My Run"
    ↓
showPreRunModal = true
    ↓
[Pre-Run Configuration Modal]
    - Set Distance
    - Set Target Time (optional)
    - Toggle AI Coach
    - Configure Live Tracking
    ↓
Click "Start Run"
    ↓
Navigate to /run (free run) or /route-preview (map run)
    ↓
FOR TRAINING PLANS:
    ↓
Fetch: GET /api/workouts/:workoutId/session-instructions
    ↓
[Display Pre-Run Brief & Session Structure]
    - Show preRunBrief (2-4 sentences)
    - Show phases with targets
    - Show coaching style info
    ↓
User Starts Run
    ↓
RunSession component loads
    ↓
During run: Real-time coaching from coachingStatements
```

---

## 9. KEY FILES REFERENCE

| File | Purpose | Key Functions |
|------|---------|----------------|
| `server/routes-session-coaching.ts` | Session coaching endpoints | `GET /api/workouts/:workoutId/session-instructions` |
| `server/session-coaching-service.ts` | Brief & structure generation | `generateSessionInstructions()`, `generateAiSessionDesign()`, `determineSessonCoachingTone()` |
| `server/coaching-cooldown.ts` | Coaching message throttling | `checkCooldown()`, `recordFired()` |
| `server/src/models/SessionCoaching.ts` | Data models | `SessionCoaching`, `CoachingPhase`, `CoachingTrigger` |
| `client/src/pages/Home.tsx` | Main pre-run modal | `handleStartSession()`, `handleConfirmPreRun()` |
| `client/src/pages/PreEvent.tsx` | Event-specific pre-run screen | `handleStartRun()` |
| `client/src/lib/coachSettings.ts` | Coach personalization | `loadCoachSettings()`, `saveCoachSettings()` |
| `ios/StravaViews.swift` | Strava integration UI | Post-run sharing only |

---

## 10. NOTES ON iOS APP STATUS

- **Native Swift Components**: Limited to Strava integration
- **Main App**: React/TypeScript web app (likely served via WebView or Expo)
- **Pre-Run Brief Display**: Web-based, no dedicated iOS-specific implementation
- **Training Plan Integration**: Server-side ready, client display location TBD

---

## SUMMARY

The app implements a **sophisticated AI-powered pre-run coaching system** with:

1. ✅ **Pre-run briefing generation** (2-4 sentence AI-generated coaching message)
2. ✅ **Tone adaptation** (AI determines optimal tone based on runner profile + session type)
3. ✅ **Session structure** (AI-designed phases with coaching triggers)
4. ✅ **UI components** to configure and start runs (Home modal, Event page)
5. ✅ **API endpoints** to fetch pre-generated briefings
6. ✅ **Coach messaging** during and before runs
7. ✅ **Cooldown management** to prevent messaging overload
8. ⚠️ **iOS display**: Currently web-based; native Swift implementation minimal

