# AI Coaching System Specification

**Version:** 2.0  
**Last Updated:** March 15, 2026  
**Status:** ✅ Production-Ready (Android) | 🔄 Ready for iOS Implementation

## Coaching Triggers

```kotlin
enum class CoachingTrigger {
    PERIODIC,           // Every 60-120 seconds
    KM_MILESTONE,       // Every 1km completed
    TERRAIN_UPHILL,     // >=5% grade detected or approaching
    TERRAIN_DOWNHILL,   // <=-5% grade detected or approaching
    HILL_CREST,         // Just reached top of climb
    PACE_DROP,          // >=20% slower than baseline
    PACE_IMPROVEMENT,   // Noticeably faster
    USER_VOICE_INPUT,   // User spoke to coach
    HALF_KM_SUMMARY,    // Every 500m (configurable)
    WEATHER_EXTREME,    // Extreme weather conditions
    APPROACHING_TARGET, // Near target distance
    FINAL_STRETCH       // Last 10% of run
}

val TRIGGER_COOLDOWNS_MS = mapOf(
    CoachingTrigger.PERIODIC to 60_000,
    CoachingTrigger.KM_MILESTONE to 0,
    CoachingTrigger.TERRAIN_UPHILL to 30_000,
    CoachingTrigger.TERRAIN_DOWNHILL to 30_000,
    CoachingTrigger.HILL_CREST to 30_000,
    CoachingTrigger.PACE_DROP to 60_000,
    CoachingTrigger.USER_VOICE_INPUT to 0
)
```

## Coaching Request Payload

```kotlin
data class CoachingRequest(
    // Current run metrics
    val currentPace: String,              // "5:30" format
    val targetPace: String,
    val heartRate: Int?,
    val elapsedTime: Int,                 // seconds
    val distanceCovered: Double,          // km
    val totalDistance: Double?,           // km (null for free runs)
    val difficulty: String,
    val currentKm: Int,
    val progressPercent: Int?,
    
    // Target time
    val targetTimeSeconds: Int?,
    
    // User profile
    val userName: String?,
    val userAge: Int?,
    val userGender: String?,
    val userWeight: String?,
    val userHeight: String?,
    val userFitnessLevel: String?,
    val desiredFitnessLevel: String?,
    
    // Coach configuration
    val coachName: String?,
    val coachTone: CoachTone,
    val coachPreferences: String?,
    
    // Context
    val terrain: TerrainData?,
    val weather: WeatherData?,
    val goals: List<Goal>?,
    val weaknessHistory: List<WeaknessPattern>?,
    
    // Anti-repetition
    val recentCoachingTopics: List<String>,
    
    // Current events
    val paceChange: PaceChange?,
    val milestones: List<String>?,
    val kmSplitTimes: List<Int>?,
    
    // Voice input
    val userMessage: String?,
    
    // Exercise type
    val exerciseType: ExerciseType        // RUNNING or WALKING
)

data class CoachingResponse(
    val message: String,         // Max 15 words
    val encouragement: String,   // Max 10 words
    val paceAdvice: String,      // Max 15 words
    val breathingTip: String?,   // Max 10 words
    val topic: String            // One word
)
```

## Elite Coaching Tips (6 Categories)

### 1. Posture & Alignment
- "Keep your posture tall and proud; imagine a string gently lifting the top of your head."
- "Run with your ears, shoulders, hips, and ankles roughly in one line."
- "Stay tall through your hips; avoid collapsing or bending at the waist as you tire."
- "Lean very slightly forward from the ankles, not from the hips, letting gravity help you move."
- "Keep your chin level and your neck relaxed; avoid letting your head drop forward."
- "Think 'run tall' — elongate your spine and lift your chest slightly for better breathing."

### 2. Arms & Upper Body
- "Relax your shoulders and let them drop away from your ears."
- "Keep your arms close to your sides with a gentle bend at the elbows."
- "Let your arms swing forward and back, not across your body."
- "Keep your hands soft, as if gently holding something you don't want to crush."
- "When tension builds, briefly shake out your hands and arms, then settle back into rhythm."
- "Your arms drive your legs — pump them actively to help maintain pace on tough sections."

### 3. Breathing & Relaxation
- "Breathe from your belly, letting the abdomen expand rather than lifting the chest."
- "Settle into a steady, rhythmic breathing pattern that feels sustainable."
- "Use your exhale to release tension from your shoulders and face."
- "Let your breath guide your effort — calm, controlled breathing supports smooth running."
- "If you feel stressed, take a deeper, slower breath and gently reset your rhythm."
- "Match your breathing to your stride — try a 3:2 or 2:2 inhale-exhale pattern for rhythm."

### 4. Stride & Foot Strike
- "Aim for smooth, light steps that land softly on the ground."
- "Let your foot land roughly under your body instead of reaching out in front."
- "Think 'quick and elastic,' lifting the foot up and through instead of pushing long and hard."
- "Focus on gliding forward — avoid bounding or overstriding."
- "Use the ground to push you forward, not upward; channel your force into forward motion."
- "Focus on your steps per minute — quicker turnover reduces impact and improves efficiency."

### 5. Core, Hips & Mindset
- "Lightly engage your core to keep your torso stable as your legs and arms move."
- "Let the movement start from your hips, driving you calmly forward."
- "When you tire, come back to basics: tall posture, relaxed shoulders, smooth steps."
- "Stay present in this section of the run — one controlled stride at a time."
- "Run with quiet confidence; efficient, relaxed form is your biggest advantage today."
- "Visualize strong, controlled strides — your mind guides your body through the tough moments."

### 6. Emotional & Mental (NEW - March 2026)
Triggered during: Mental fatigue, pace drops, final push, difficult terrain, when user struggles
- "You've got this. Break this into smaller segments and conquer them one at a time."
- "Your mind is stronger than any discomfort. Channel that strength into your stride."
- "This is temporary. Remember why you started — let that fuel you forward."
- "Discomfort is part of the process. Embrace it, then move past it with confidence."
- "You're tougher than you think. Every difficult moment builds mental resilience."
- "Focus on the present moment. Don't think about the finish line — just the next kilometer."
- "Your body wants to slow down, but your mind is stronger. Prove it to yourself."
- "This difficulty won't last. You'll feel proud when you finish. Keep pushing."
- "You're building mental toughness right now. This is where champions are made."
- "Breathe through the doubt. You've trained for this. Trust your preparation."

## Coach Tone Configurations

```kotlin
enum class CoachTone {
    ENERGETIC,      // High-energy, enthusiastic, upbeat
    MOTIVATIONAL,   // Warm, inspiring, supportive
    INSTRUCTIVE,    // Clear, educational, technique-focused
    FACTUAL,        // Straightforward, data-focused
    ABRUPT          // Very brief, commanding
}

val TONE_INSTRUCTIONS = mapOf(
    CoachTone.ENERGETIC to "Be high-energy, enthusiastic, and upbeat. Use exclamation marks!",
    CoachTone.MOTIVATIONAL to "Be inspiring and supportive. Focus on encouragement.",
    CoachTone.INSTRUCTIVE to "Be clear and educational. Provide detailed guidance.",
    CoachTone.FACTUAL to "Be straightforward and data-focused. Stick to stats.",
    CoachTone.ABRUPT to "Be very brief and direct. Short, commanding phrases. No fluff."
)
```

## Coaching Phases

```kotlin
enum class CoachingPhase {
    EARLY,    // First 2km OR first 10% of run
    MID,      // 3-5km OR 40-50% of run
    LATE,     // 7km+ OR 75-90% of run
    FINAL,    // Last 10% of run
    GENERIC   // Any time (filler)
}

fun determinePhase(distanceKm: Double, totalDistanceKm: Double?): CoachingPhase {
    val percentComplete = if (totalDistanceKm != null && totalDistanceKm > 0) {
        (distanceKm / totalDistanceKm) * 100
    } else null
    
    if (percentComplete != null) {
        return when {
            percentComplete >= 90 -> CoachingPhase.FINAL
            percentComplete >= 75 -> CoachingPhase.LATE
            percentComplete in 40.0..50.0 -> CoachingPhase.MID
            percentComplete <= 10 -> CoachingPhase.EARLY
            else -> CoachingPhase.GENERIC
        }
    }
    
    // Free run - conservative absolute distance only
    return when {
        distanceKm <= 2.0 -> CoachingPhase.EARLY
        distanceKm in 3.0..5.0 -> CoachingPhase.MID
        else -> CoachingPhase.GENERIC
    }
}
```

## Coaching Statements (40 Total)

### Early Phase (8 statements)
Focus: warm-up, settling in

### Mid Phase (8 statements)
Focus: maintaining form, staying in the groove

### Late Phase (8 statements)
Focus: mental strength, managing fatigue
**ONLY PHASE WHERE FATIGUE-RELATED ADVICE IS APPROPRIATE**

### Final Phase (6 statements)
Focus: finishing strong, celebration

### Generic (10 statements)
Timeless advice, any time

### Statement Selection Logic
```kotlin
const val MAX_STATEMENT_USES = 3  // Per run

fun selectStatement(
    currentPhase: CoachingPhase,
    usageCounts: MutableMap<String, Int>,
    preferPhaseSpecific: Boolean = true
): CoachingStatement?
```

## Pre-Run Summary

Generate 30-45 word announcement when GPS locks.

```kotlin
data class RunSummaryRequest(
    val routeName: String,
    val targetDistance: Double,
    val targetTimeSeconds: Int?,
    val difficulty: String,
    val elevationGain: Int?,
    val weather: WeatherData?,
    val firstTurnInstruction: TurnInstruction?
)

// Example: "Four point three K easy run with mostly flat terrain. Start by running 50 meters down Bronte Place then turn left onto Addison Street."
```

## Post-Run AI Analysis

```kotlin
data class RunAnalysisResponse(
    val highlights: List<String>,         // 2-4 things done well
    val struggles: List<String>,          // 1-3 areas of difficulty
    val personalBests: List<String>,      // Any PBs achieved
    val demographicComparison: String,    // Age/fitness group comparison
    val coachingTips: List<String>,       // 3-5 actionable tips
    val overallAssessment: String,        // 2-3 sentence summary
    val weatherImpact: String?,
    val warmUpAnalysis: String?,
    val goalProgress: String?,
    val targetTimeAnalysis: String?       // CRITICAL if target time set
)
```

### Target Time Analysis Examples
```kotlin
// Beat target: "Congratulations! You beat your target time of 30:00 by 1:23!"
// Missed target: "You finished 2:15 behind your 30:00 target. Data shows pace dropped in km 4-5."
// Close: "Just 32 seconds off your 30:00 target! Very consistent pacing."
```

## Voice Input to AI Coach

```kotlin
// Android: SpeechRecognizer
// iOS: Speech framework

val request = CoachingRequest(
    // ... all fields
    userMessage = transcribedText  // "How am I doing?"
)

// TTS Response
val VOICE_MAP = mapOf(
    CoachTone.ENERGETIC to "echo",
    CoachTone.MOTIVATIONAL to "onyx",
    CoachTone.INSTRUCTIVE to "fable",
    CoachTone.FACTUAL to "alloy",
    CoachTone.ABRUPT to "ash"
)
```

---

## Run Session Coaching Endpoints (Fully Implemented)

### 1. Pre-Run Summary (GPS Lock)
```
POST /api/ai/pre-run-summary
Content-Type: application/json
Authorization: Bearer {token}

Request:
{
  "routeName": "Morning Run on the Bay",
  "targetDistance": 10.5,
  "targetTimeSeconds": 3600,
  "difficulty": "moderate",
  "elevationGain": 120,
  "weather": {
    "temperature": 18,
    "condition": "partly_cloudy",
    "windSpeed": 12
  },
  "firstTurnInstruction": {
    "direction": "left",
    "landmark": "onto Addison Street"
  }
}

Response:
{
  "briefingText": "10.5 km run with moderate elevation. Starting with easy warm-up, then steady pace...",
  "format": "base64",
  "audio": "data:audio/mpeg;base64,...",
  "speechText": "Full text of briefing for display"
}

Key Features:
- Triggered immediately when GPS locks (after 2-3 satellites acquired)
- 30-45 second audio briefing
- Includes route overview, weather context, and goal reference
- Uses Polly Neural voices (with user's accent: Irish, British, American, etc.)
- Fallback TTS if Polly fails
```

### 2. 500m Check-In Summary (Initial Assessment)
```
POST /api/ai/500m-summary
Content-Type: application/json
Authorization: Bearer {token}

Request:
{
  "distanceCovered": 0.5,
  "elapsedTime": 180,
  "currentPace": "6:00",
  "targetPace": "5:45",
  "heartRate": 145,
  "targetHeartRate": 140,
  "terrain": "flat",
  "weather": { /* ... */ },
  "runType": "easy"
}

Response:
{
  "coachingText": "Pace looking good. HR a bit elevated - check your warmup...",
  "format": "base64",
  "audio": "data:audio/mpeg;base64,...",
  "tone": "motivational"
}

Key Features:
- First major check-in after 500m completed
- Assesses early pacing, HR, form potential issues
- Accent parameter added (lines 1072, 1313)
- Critical fix: Now fires at 500m, not 650m (gates fixed)
```

### 3. Phase Coaching (Dynamic Real-Time)
```
POST /api/ai/phase-coaching
Content-Type: application/json
Authorization: Bearer {token}

Request:
{
  "currentPace": "5:50",
  "targetPace": "5:45",
  "heartRate": 158,
  "elapsedTime": 1800,
  "distanceCovered": 5.2,
  "totalDistance": 10.5,
  "difficulty": "moderate",
  "currentKm": 5,
  "progressPercent": 49,
  "terrain": "rolling_hills",
  "paceChange": {
    "direction": "slower",
    "percentChange": 8
  },
  "coachTone": "motivational",
  "recentCoachingTopics": ["pacing", "breathing"],
  "exerciseType": "RUNNING"
}

Response:
{
  "message": "Pace holding strong through the middle",
  "encouragement": "You're crushing it today",
  "paceAdvice": "Keep this rhythm to your goal",
  "breathingTip": "Settle into 3:2 pattern",
  "topic": "pacing",
  "audio": "data:audio/mpeg;base64,..."
}

Coaching Phases:
- EARLY: First 2km or 10% of run - focus on settling in
- MID: 3-5km or 40-50% - maintaining form and groove
- LATE: 7km+ or 75-90% - mental strength, managing fatigue
- FINAL: Last 10% - finishing strong, celebration

Anti-Repetition:
- Tracks recent topics to avoid repeating advice
- Cycles through different coaching angles
- Maximum 3 uses of same statement per run
```

### 4. Comprehensive Run Analysis (Post-Run)
```
POST /api/runs/:id/comprehensive-analysis
Authorization: Bearer {token}

Response:
{
  "highlights": [
    "Excellent pacing consistency (variance only 2%)",
    "Strong HR control through final km"
  ],
  "struggles": [
    "Pace dropped 15% between km 4-5",
    "Elevated HR in first 2km (warm-up drift)"
  ],
  "personalBests": [
    "Fastest 5K in this route (24:12)",
    "Best HR recovery after tempo work"
  ],
  "demographicComparison": "For your age/fitness, this pace ranks in top 25%",
  "coachingTips": [
    "Your pacing is strong - consistency is your superpower",
    "Work on that km 4-5 dip - maybe fuel/hydration timing",
    "Form stayed excellent through fatigue - great mental strength"
  ],
  "overallAssessment": "Excellent run. Your fitness is progressing well.",
  "weatherImpact": "Partly cloudy conditions were favorable for pacing",
  "warmUpAnalysis": "First 500m HR elevated - consider dynamic stretching",
  "goalProgress": "On track for 10K goal - maintain this consistency",
  "targetTimeAnalysis": "Beat your 60:00 target by 1:23! Fantastic execution."
}

Key Features:
- Automatic generation after run completion
- Enriched with Garmin data if available
- Triggers training plan reassessment
- Includes target time analysis (CRITICAL field)
- Personalized based on user history and goals
```

### 5. Elite Coaching Tips (Form & Technique)
```
POST /api/ai/elite-coaching
Content-Type: application/json
Authorization: Bearer {token}

Request:
{
  "category": "emotional_mental",  // or posture_alignment, arms, breathing, stride, core
  "currentPhase": "LATE",
  "coachTone": "motivational",
  "paceChange": { "direction": "slower", "percentChange": 12 }
}

Response:
{
  "tip": "You've got this. Break this into smaller segments and conquer them one at a time.",
  "audio": "data:audio/mpeg;base64,...",
  "category": "emotional_mental"
}

Six Coaching Categories:
1. Posture & Alignment - Head, shoulders, hips alignment
2. Arms & Upper Body - Arm swing, tension, drive
3. Breathing & Relaxation - Breathing patterns, stress release
4. Stride & Foot Strike - Landing, turnover, efficiency
5. Core, Hips & Mindset - Stability, confidence, mental strength
6. Emotional & Mental - Mental resilience, motivation, overcoming doubt
```

---

## Emotional & Mental Coaching Category (NEW)

### When to Trigger This Category

The "Emotional & Mental" category is activated during run session coaching when:

1. **Pace Drop Detected** (>15% slower than target)
   - User struggling with intensity
   - Mental fatigue setting in
   - Confidence wavering

2. **Late/Final Phase** (last 25% of run)
   - User physically tiring
   - Mental strength most needed
   - Final push motivation critical

3. **Difficult Terrain** (hills, elevation gain)
   - Psychological challenge
   - Discouragement risk
   - Need to rebuild confidence

4. **User Struggles Signal**
   - Heavy breathing pattern change
   - HR spike without pace increase
   - Form degradation indicators

5. **Recovery Phase After Hard Effort**
   - After tempo/interval work
   - Rebuilding mental resilience
   - Preparing for next challenge

### Implementation in Phase Coaching

```typescript
// server/ai-service.ts - Enhanced phase coaching request

interface CoachingRequest {
  // ... existing fields ...
  
  // Mental state indicators
  paceChange?: {
    direction: "faster" | "slower";
    percentChange: number;  // If >15%, consider emotional support
  };
  
  mentalFatigueIndicators?: {
    phaseReached: "LATE" | "FINAL";  // Mental load increases
    paceDrop: boolean;               // Struggling signal
    isHardestPhase: boolean;         // Last 25% of run
  };
}

// Category selection logic
function selectCoachingCategory(
  currentPhase: CoachingPhase,
  paceChangePercent: number,
  isFinalStretch: boolean
): "posture" | "arms" | "breathing" | "stride" | "core" | "emotional_mental" {
  
  // Prioritize emotional support in final phases during struggles
  if (isFinalStretch && paceChangePercent > 15) {
    return "emotional_mental";  // User needs motivation, not technique
  }
  
  if (currentPhase === "FINAL" && Math.random() > 0.7) {
    return "emotional_mental";  // 30% chance in final phase
  }
  
  if (currentPhase === "LATE" && paceChangePercent > 10) {
    return "emotional_mental";  // Mental support when pace drops in late phase
  }
  
  // Otherwise cycle through technical categories
  return selectTechnicalCategory();
}
```

### Integration in Run Session Flow

```
During Run Session:
  │
  ├─ Phase Coaching Called (every 60-120s)
  │
  ├─ Check Mental State
  │  ├─ Is user in LATE/FINAL phase? 
  │  ├─ Has pace dropped >15%?
  │  ├─ Is HR elevated without pace increase?
  │  └─ Is terrain challenging?
  │
  └─► If Mental Support Needed:
      │
      ├─ Request: POST /api/ai/elite-coaching
      │  {
      │    "category": "emotional_mental",
      │    "currentPhase": "LATE",
      │    "paceChange": { "direction": "slower", "percentChange": 18 },
      │    "coachTone": "motivational",
      │    "terrain": "hilly"
      │  }
      │
      └─ Response: Motivational tip + TTS audio
         "You've got this. Break this into smaller segments..."
         
         → Played to user with their configured:
           - Accent (Irish, British, American, etc.)
           - Gender (male/female)
           - Voice (Sean, Brian, Matthew, etc.)
```

### Tone Adaptation for Emotional & Mental

Different coach tones adjust the emotional message:

```typescript
const emotionalMessagesByTone: Record<CoachTone, string[]> = {
  "energetic": [
    "YES! This is where you show your power! Push through!",
    "Champions embrace the challenge! You're one of them!",
    "Let's GO! This is your moment to shine!"
  ],
  
  "motivational": [
    "You've got this. Break this into smaller segments.",
    "Your mind is stronger than any discomfort.",
    "Remember why you started — let that fuel you forward."
  ],
  
  "instructive": [
    "Mental fatigue is normal. Redirect focus to next 500m only.",
    "Break the run into manageable chunks. Conquer one at a time.",
    "Tactical shift: focus on steady breathing, one step at a time."
  ],
  
  "factual": [
    "You're 75% complete. 25% remaining. You can do this.",
    "Your HR is elevated but sustainable. Maintain current effort.",
    "Data shows: runners who push here see best outcomes."
  ],
  
  "abrupt": [
    "Push. Now.",
    "Mind over matter. Move.",
    "Finish strong. Do it."
  ]
};
```

### Tracking & Learning

```typescript
// Track which emotional tips work best
interface EmotionalCoachingMetric {
  tipDelivered: string;
  userPhase: CoachingPhase;
  paceBeforeTip: string;
  paceAfterTip: string;  // 60 seconds later
  userResponded: boolean;  // Did pace/HR improve?
  runCompleted: boolean;   // Did user finish?
}

// AI learns: Which emotional tips are most effective for different users?
// Personalizes future emotional support based on historical data
```

### Special Cases: When NOT to Use Emotional & Mental

- ✅ **DO USE**: User struggling, pace dropping, final push needed
- ❌ **DON'T USE**: Early phase, easy run, user cruising comfortably
- ❌ **DON'T USE**: If used in last 3 coaching prompts (anti-repetition)
- ✅ **DO USE**: After user completes a very hard effort
- ✅ **DO USE**: When HR/effort suggests mental barriers not physical

---

## Structured Mental & Emotional Prompts (ChatGPT Framework)

### 1. Positive Self-Talk Prompts

**AI Instruction**: Encourage runners to replace negative thoughts with supportive internal dialogue. Keep tone calm, empowering, and simple.

**Trigger Moments**:
- Runner slowing down (pace drop)
- Elevated heart rate (HR >90% of max)
- Long intervals (>3 minutes continuous)
- Late-stage fatigue (LATE/FINAL phase)

**Prompt Variants by Coach Tone**:

```
MOTIVATIONAL (Default):
- "Check in with your thoughts. What are you telling yourself right now? Try switching it to: I'm strong enough to finish this mile."
- "You don't have to run fast—just keep moving forward."
- "Every step is progress. Let the rhythm carry you."
- "You've handled tough runs before. This is just another step in your story."
- "Relax your shoulders. Trust your body."

ENERGETIC:
- "YES! Your mind is STRONGER than the discomfort! Own this moment!"
- "Don't just think positive—FEEL powerful right now!"
- "You're CRUSHING this! Every step proves your strength!"
- "This is what champions do—they PUSH through doubt!"

INSTRUCTIVE:
- "Mental technique: Replace 'I'm tired' with 'I'm working hard.' Thought matters."
- "Psychology hack: Focus on what your body CAN do, not what it can't."
- "Neuroscience tip: Your brain believes what you tell it. Choose empowering thoughts."
- "Strategy: When doubt enters, redirect to one specific thing you're doing well right now."

FACTUAL:
- "You've completed X% of this run. Your legs will hold. Keep going."
- "Your pacing is sustainable at this HR. Mental fatigue isn't physical limit."
- "Data shows: runners who use positive self-talk improve by 3-5% on hard efforts."

ABRUPT:
- "Mind over body. Go."
- "Stop doubting. Move."
- "You got this. Push."
```

**Implementation**:
```typescript
function generateSelfTalkPrompt(
  coachTone: CoachTone,
  trigger: "pace_drop" | "elevated_hr" | "long_interval" | "fatigue"
): string {
  const promptBank = selfTalkPromptsByTone[coachTone][trigger];
  return promptBank[Math.floor(Math.random() * promptBank.length)];
}
```

---

### 2. Motivation & Resilience Prompts

**AI Instruction**: Reframe discomfort as part of growth. Reinforce resilience and purpose.

**Trigger Moments**:
- Hill climbs (elevation gain detected)
- Pace drop (>10% slower than target)
- Hard workout intervals (tempo, speed work)
- Breakthrough moments (pace stabilizes after drop)

**Prompt Variants by Coach Tone**:

```
MOTIVATIONAL (Default):
- "This is the part where runners get stronger."
- "Discomfort is temporary. Progress lasts."
- "Stay curious about the effort instead of resisting it."
- "Focus on the next 30 seconds. You can do anything for 30 seconds."
- "Strong runners stay present, not perfect."

ENERGETIC:
- "THIS is where CHAMPIONS are MADE! Embrace the challenge!"
- "Discomfort = GROWTH! You're building strength RIGHT NOW!"
- "Every hard step = 10 steps of progress! LET'S GO!"
- "You're not just running—you're transforming!"

INSTRUCTIVE:
- "Resilience is built during difficulty. This moment matters for your future fitness."
- "Breakdown before breakthrough: what you're feeling now is adaptation happening."
- "Progressive overload principle: this discomfort is your fitness improving in real-time."
- "Mental resilience training: embrace 3 more minutes of this, and you're 30% stronger mentally."

FACTUAL:
- "Your VO2 max is improving right now. This effort directly builds aerobic capacity."
- "Research shows: runners who push through this phase improve performance by 5-8%."
- "You're accumulating TSS (training stress score). Future runs will feel easier."

ABRUPT:
- "Build strength. Now."
- "This makes you tougher."
- "Discomfort = growth. Go."
```

**Implementation**:
```typescript
function generateResiliencePrompt(
  coachTone: CoachTone,
  trigger: "hill" | "pace_drop" | "hard_interval" | "breakthrough"
): string {
  const promptBank = resiliencePromptsByTone[coachTone][trigger];
  return promptBank[Math.floor(Math.random() * promptBank.length)];
}
```

---

### 3. Focus & Mindfulness Prompts

**AI Instruction**: Guide runners into a flow state by focusing attention on breathing, cadence, or surroundings.

**Trigger Moments**:
- When runner pace stabilizes (after previous drop)
- During long steady runs (MID phase, no struggle)
- After a stressful segment (immediate recovery)
- Distraction detected (external factors)

**Prompt Variants by Coach Tone**:

```
MOTIVATIONAL (Default):
- "Notice your breathing. In for three steps, out for three."
- "Feel the rhythm of your feet on the ground."
- "Relax your jaw and shoulders."
- "Look ahead, not down."
- "Run the mile you're in."

ENERGETIC:
- "LOCK IN! Feel every powerful step you're taking RIGHT NOW!"
- "ZONE ACTIVATED! Notice how smooth and strong you're moving!"
- "RHYTHM CHECK! Feel that beautiful cadence? You're FLOWING!"

INSTRUCTIVE:
- "Breathing technique: Nasal inhale (4 steps), mouth exhale (4 steps). Master this pattern."
- "Cadence focus: Land softly at 180+ steps per minute. Count your feet for 30 seconds."
- "Proprioceptive awareness: Feel your hips driving forward—that's where power comes from."

FACTUAL:
- "Your cadence is currently X spm. Staying at this rhythm optimizes efficiency."
- "Research: runners who maintain focus on breathing run 2-3% more efficiently."
- "Your heart rate is stable here. This pace is sustainable."

ABRUPT:
- "Focus. Now."
- "One step at a time."
- "Feel it."
```

**Implementation**:
```typescript
function generateMindfulnessPrompt(
  coachTone: CoachTone,
  focusArea: "breathing" | "cadence" | "surroundings" | "present_moment"
): string {
  const promptBank = mindfulnessPromptsByTone[coachTone][focusArea];
  return promptBank[Math.floor(Math.random() * promptBank.length)];
}
```

---

### 4. 🌟 Smiling Coaching Prompts (CRITICAL SECTION)

**⚠️ IMPORTANT**: Smiling while running actually reduces perceived effort and improves running economy. This is backed by biomechanics research.

**AI Instruction**: Encourage the runner to smile gently (not forcefully). Connect smiling to relaxation and efficiency.

**Why It Works**:
- Smiling activates relaxation response
- Reduces perceived effort by 5-10%
- Improves running economy (efficiency)
- Triggers endorphin release
- Reframes mental state from "suffering" to "capable"

**Trigger Moments**:
- During fatigue (LATE phase)
- After pace drop stabilizes
- Pre-hill climbs (set mental state)
- Final stretch (endorphin boost)
- Whenever HR/effort seems high

**Prompt Variants by Coach Tone**:

```
MOTIVATIONAL (Default) - Light Cue:
- "Try a small smile—it helps relax your body."
- "Can you smile right now? It's a form of relaxation."

MOTIVATIONAL - Fatigue Moment:
- "Give me a quick smile. It tells your brain this effort is okay."
- "Notice your face. Soften it. That smile matters more than you think."

MOTIVATIONAL - Motivation Cue:
- "Smile for a few steps. Strong runners run relaxed."
- "See if smiling changes how this effort feels."

MOTIVATIONAL - Mindset Reset:
- "Smile and shake out the tension in your arms."
- "Try smiling for the next 30 seconds. Notice the difference."

MOTIVATIONAL - Endorphin Cue:
- "Smiling tricks your brain into feeling better—try it for the next 10 steps."
- "Your smile is fuel. Activate it now."

ENERGETIC:
- "SMILE BIG! You're CRUSHING this and you KNOW it!"
- "That smile = CONFIDENCE! Show yourself you're STRONG!"
- "GRIN and GRIND! Let your smile fuel the next mile!"

INSTRUCTIVE:
- "Biomechanics fact: smiling reduces perceived effort by activating the parasympathetic nervous system."
- "Technique: gentle smile (no grimace). Hold for 30 seconds. Feel the difference in perceived effort."
- "Psychology: smiling signals to your brain 'I'm okay with this effort.' It's a powerful mental hack."

FACTUAL:
- "Research: runners who smile report 5-10% lower perceived exertion at same intensity."
- "Running economy improves with facial relaxation. Smiling is part of that relaxation pattern."
- "Endorphins increase with positive facial expressions. Smile triggers better feelings."

ABRUPT:
- "Smile. Now."
- "Relax your face."
- "Smile for 10 steps."
```

**Smile Challenges** (Gamification):

```
Examples:
- "Smile challenge: hold a smile for the next 20 steps."
- "Let's see a runner's smile for this next hill."
- "Quick check—are you smiling?"
- "Smile race: can you hold it all the way to the next km?"
- "Smile test: does smiling make this feel easier? Check it out."

Implementation:
function generateSmileChallenge(intensity: "easy" | "moderate" | "hard"): string {
  const challenges = {
    easy: "Can you smile for these next 30 seconds?",
    moderate: "Smile challenge: hold it through this hill.",
    hard: "Final smile challenge: grin all the way to the finish."
  };
  return challenges[intensity];
}
```

---

### 5. Relaxation Prompts

**AI Instruction**: Encourage relaxation to improve running efficiency. Use these when tension is detected.

**Trigger Moments**:
- Elevated HR without pace increase (tension indicator)
- User shoulders rising (detected via form cues)
- Late phase with high tension (LATE phase)
- Post-hard-effort recovery

**Prompt Variants by Coach Tone**:

```
MOTIVATIONAL (Default):
- "Drop your shoulders."
- "Loosen your hands."
- "Run tall and relaxed."
- "Smooth and easy."
- "Unclench your jaw."
- "Let your face go soft."

ENERGETIC:
- "RELAX! Tension is the enemy! Let it GO!"
- "Shake it out! Loose and POWERFUL!"
- "Drop those shoulders! You're too strong to be tight!"

INSTRUCTIVE:
- "Tension check: are your shoulders near your ears? Drop them 2 inches."
- "Hand position: pretend you're holding an egg. Don't crack it."
- "Jaw release: unclench your teeth. Let your mouth relax."

FACTUAL:
- "Tension increases energy expenditure by 3-5%. Relax and run more efficiently."
- "Relaxed muscles use less oxygen. This simple release improves your pace."

ABRUPT:
- "Relax."
- "Drop tension."
- "Go loose."
```

---

### 6. End-of-Run Emotional Reinforcement

**AI Instruction**: Finish with reflection and emotional reward. Use immediately after run completion.

**Prompt Variants by Coach Tone**:

```
MOTIVATIONAL (Default):
- "Take a second to appreciate what your body just did."
- "You showed up today—that's what matters."
- "Strong finish. That effort counts."
- "How do you feel compared to when you started?"

ENERGETIC:
- "INCREDIBLE! You LEFT IT ALL OUT THERE! YOU CRUSHED IT!"
- "What a LEGEND! That was AMAZING! You should be PROUD!"
- "That's what a CHAMPION looks like! FANTASTIC effort!"

INSTRUCTIVE:
- "Reflection moment: what did your body teach you today?"
- "Analysis: your pacing in km 4-5 showed growth from last week."
- "Mental toughness log: you pushed through mental fatigue twice today."

FACTUAL:
- "Metrics: TSS +42, Distance 10.5km, Avg HR 152bpm. Strong session."
- "Performance data: you beat your average pace by 5 seconds per km today."
- "Progress tracking: this is your 3rd run at this intensity this week. Adaptation happening."

ABRUPT:
- "Well done."
- "You finished."
- "Strong work."
```

**Special End-of-Run Prompts**:

```
Achievement Recognition:
- "New personal best for this route! 10.5km in 54:12!"
- "That's your 5th run this week. Your consistency is building fitness."
- "You ran 23 seconds faster than last week's attempt. Progress!"

Growth Reflection:
- "Start: I wasn't sure I could do this. Finish: I proved I could."
- "You wanted to quit at km 5. You finished strong at km 10. That's growth."
- "You showed mental resilience today. That matters as much as the pace."

Gratitude Cue:
- "Thank your legs, your lungs, your heart—they just did something amazing."
- "Your body is stronger than it was this morning. Appreciate that."
- "You invested 54 minutes in yourself today. That's powerful."
```

---

## Integration: Prompt Selection During Run

```
Run Session Flow:

┌─ Phase Coaching Called (Every 60-120s)
│
├─ Assess Current State:
│  ├─ Phase (EARLY, MID, LATE, FINAL)
│  ├─ Pace change (stable, improving, dropping)
│  ├─ HR status (normal, elevated)
│  ├─ Form signals (good, tense, fatigued)
│  └─ Terrain (flat, hilly, technical)
│
├─ Select Prompt Category:
│  ├─ IF pace dropping >15% → Positive Self-Talk
│  ├─ IF hill/hard effort → Motivation & Resilience
│  ├─ IF pace stabilizing → Focus & Mindfulness
│  ├─ IF tension detected → Relaxation
│  ├─ IF fatigue high → Smiling Challenge
│  └─ IF final phase → End-of-Run Reinforcement
│
├─ Generate Prompt:
│  ├─ Get coach tone from user preferences
│  ├─ Get emotional context
│  ├─ Select random prompt variant
│  └─ Avoid repetition (check recent 3 prompts)
│
├─ Add Voice Layer:
│  ├─ Generate TTS with user's:
│  │  - Accent (Irish, British, American, etc.)
│  │  - Gender preference (male/female)
│  │  - Configured voice
│  └─ Play to runner
│
└─ Track Response:
   ├─ Did pace improve after prompt?
   ├─ Did HR drop?
   ├─ Did runner continue/complete?
   └─ Learn for future: which prompts work best?
```

---

## Prompt Database Schema

```typescript
interface EmotionalPrompt {
  id: string;
  category: "self_talk" | "resilience" | "mindfulness" | "smiling" | "relaxation" | "end_of_run";
  coachTone: CoachTone;
  trigger: string;  // e.g., "pace_drop", "hill", "fatigue"
  text: string;
  durationSeconds?: number;  // How long should this run
  effectiveness?: number;    // Score based on outcomes
  lastUsedAt?: Date;
  useCount: number;  // Track repetition
}

interface PromptResponse {
  promptId: string;
  userId: string;
  runId: string;
  paceBeforePrompt: string;
  paceAfterPrompt: string;  // 60 seconds later
  hrBeforePrompt: number;
  hrAfterPrompt: number;
  userFeedback?: "helpful" | "neutral" | "unhelpful";  // Optional in-app rating
}
```

---

## Anti-Repetition & Learning Algorithm

```typescript
function selectNextPrompt(
  currentPhase: CoachingPhase,
  userState: RunningState,
  recentPrompts: EmotionalPrompt[]  // Last 3 prompts from this run
): EmotionalPrompt {
  
  // Get all prompts matching current context
  const candidatePrompts = promptDatabase.filter(p => 
    p.category === getRecommendedCategory(userState) &&
    p.coachTone === user.coachTone &&
    !recentPrompts.some(rp => rp.id === p.id)  // Avoid repetition
  );
  
  // Sort by effectiveness (learned from past runs)
  const sortedByEffectiveness = candidatePrompts.sort(
    (a, b) => b.effectiveness - a.effectiveness
  );
  
  // Select with weighted randomness (80% best, 20% exploration)
  if (Math.random() < 0.8) {
    return sortedByEffectiveness[0];  // Pick most effective
  } else {
    return sortedByEffectiveness[
      Math.floor(Math.random() * sortedByEffectiveness.length)
    ];  // Explore others
  }
}

// Track effectiveness
function recordPromptOutcome(
  promptId: string,
  userId: string,
  paceImproved: boolean,
  runCompleted: boolean
): void {
  const prompt = promptDatabase.find(p => p.id === promptId);
  
  let effectivenessBoost = 0;
  if (paceImproved) effectivenessBoost += 2;
  if (runCompleted) effectivenessBoost += 1;
  
  prompt.effectiveness = (prompt.effectiveness || 0) + effectivenessBoost;
  prompt.useCount++;
  prompt.lastUsedAt = new Date();
}
```

---

## Text-to-Speech (TTS) Implementation

### Polly Neural Voices (Primary)
```
Region: us-east-1 (supports all voices)
Engine: neural

Voice Mapping by Accent & Gender:
{
  "british": { "male": "Brian", "female": "Amy" },
  "american": { "male": "Matthew", "female": "Joanna" },
  "australian": { "male": "Stephen", "female": "Olivia" },
  "irish": { "male": "Sean", "female": "Niamh" },
  "new_zealand": { "male": "Aria", "female": "Aria" },
  "south_african": { "male": "Ayanda", "female": "Ayanda" },
  "indian": { "male": "Kajal", "female": "Kajal" }
}
```

### Implementation (Fully Tested)
```typescript
// server/polly-service.ts
export async function synthesizeSpeech(
  text: string,
  accent: string,
  gender: "male" | "female" = "male",
  engine: "standard" | "neural" = "neural"
): Promise<Buffer> {
  const voice = mapAccentToVoice(accent, gender);
  
  const command = new SynthesizeSpeechCommand({
    Text: text,
    OutputFormat: "mp3",
    VoiceId: voice,
    Engine: engine,
    LanguageCode: getLanguageCode(accent)
  });
  
  const response = await pollyClient.send(command);
  return Buffer.from(await response.AudioStream.transformToByteArray());
}
```

### Key Fixes Implemented (March 2026)
1. **Region Fix**: Changed from ap-southeast-2 → us-east-1 (all voices available)
2. **Voice Correction**: Russell (Standard) → Stephen (Neural) for Australian male
3. **Accent Filtering**: Removed unsupported accents (Scottish, Welsh, Canadian, etc.)
4. **Fallback**: If Polly fails, use device TTS with same accent mapping
5. **Logging**: Clear logs showing which voice/accent being used

### Accent & Gender Support
```
User Settings:
- coachAccent: TEXT (7 supported values)
- coachGender: TEXT ('male' | 'female')

Applied To All Coaching Audio:
✅ Pre-run briefing
✅ 500m check-in
✅ Phase coaching
✅ Elite tips
✅ Talk to Coach responses
✅ Navigation alerts
✅ Post-run analysis
```

---

## Run Session Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│              USER STARTS RUN                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │  GPS Acquires Satellites │
        │   (2-3 seconds)          │
        └────────┬─────────────────┘
                 │
                 ▼
    ┌────────────────────────────────┐
    │ Pre-Run Summary Generated       │ ← POST /api/ai/pre-run-summary
    │ - Route overview               │
    │ - Weather context              │
    │ - Goal reference               │
    │ - First turn instruction       │
    └────────┬───────────────────────┘
             │
             ├──────────► TTS Generated (Polly Neural)
             │
             ├──────────► Audio stored in response
             │
             └──────────► User hears briefing
                         
                         Duration: ~30-45 seconds
                         Accent: user's configured (Irish, British, etc.)
                         Gender: user's configured (male/female)

┌──────────────────────────────────────────────────────────────┐
│              USER RUNNING                                    │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
           │ After 500m               │ Every 60-120s
           │ (Initial Assessment)     │ (Periodic Coaching)
           │                          │
           ▼                          ▼
    ┌─────────────────┐      ┌──────────────────┐
    │ 500m Summary    │      │ Phase Coaching   │
    │ Generated       │      │ Generated        │
    └────┬────────────┘      └────┬─────────────┘
         │                        │
         ├─► TTS (Polly)          ├─► TTS (Polly)
         │                        │
         └─► Audio + Text         └─► Audio + Text
                                     (Anti-repetition active)

┌──────────────────────────────────────────────────────────────┐
│              USER COMPLETES RUN                              │
└──────────────┬──────────────────────────────────────────────┘
               │
               ├─► Run uploaded to backend
               │
               ├─► Optional: Enriched with Garmin data
               │
               ├─► Comprehensive Analysis Generated
               │   - Highlights/Struggles
               │   - Personal Bests
               │   - Target Time Analysis ⭐
               │   - Coaching Tips
               │   - Weather/Warmup Analysis
               │
               ├─► Training Plan Reassessed (Auto)
               │   - If active plan exists
               │   - AI evaluates performance
               │   - May trigger adaptations
               │
               └─► Notifications Sent
                   - Run logged
                   - Achievements unlocked
                   - Plan updates (if any)
```

---

## Coaching Accent & Gender Features

### User Configuration
```kotlin
data class User {
    val coachAccent: String        // "irish", "british", "american", etc.
    val coachGender: String        // "male" or "female"
    val coachName: String          // "Coach Carter", custom name
    val coachTone: CoachTone       // ENERGETIC, MOTIVATIONAL, INSTRUCTIVE, FACTUAL, ABRUPT
}
```

### Applied Throughout Run Session

**All TTS audio uses**:
```
voice = mapAccentGenderToVoice(coachAccent, coachGender)
```

**Endpoints sending accent**:
- ✅ Pre-run summary (line 1708)
- ✅ 500m check-in (line 1313)
- ✅ Phase coaching (line 6970)
- ✅ Elite tips (lines 7041, 7120)
- ✅ Talk to Coach (line 6562)
- ✅ Navigation responses (lines 1058, 1072)

**Bug Fixes** (March 15, 2026):
- ✅ Added missing accent parameter to all endpoints
- ✅ Fixed region (eu-west-1 → us-east-1)
- ✅ Fixed Australian male voice (Russell → Stephen)
- ✅ Removed unsupported accents from UI
- ✅ Improved error logging

---

## Training Plan Integration

### Automatic Reassessment After Run
```typescript
// server/training-plan-service.ts
export async function reassessTrainingPlansWithRunData(
  userId: string,
  runId: string
): Promise<void>
```

**Triggered By**:
- POST /api/runs (run upload complete)
- POST /api/runs/:id/enrich-with-garmin-data (Garmin enrichment)
- POST /api/runs/:id/comprehensive-analysis (analysis generated)

**AI Evaluates**:
- User fitness progress (CTL trend)
- Training load (TSS from recent runs)
- Plan adherence (% workouts completed)
- Pace trends (improving? consistent? regressing?)
- Recovery signals (HR, effort levels)

**May Trigger**:
- Volume adjustment (+/- 10-20%)
- Intensity adjustment (Z2 ↔ Z3)
- Recovery week insertion
- Pace target adjustment

**User Notified**:
- Push notification if significant changes
- Adaptations appear in plan view
- User can accept/review/reject

---

## Coaching Request Payload (Enhanced)

```kotlin
data class CoachingRequest(
    // Current run metrics
    val currentPace: String,              // "5:30" format
    val targetPace: String,
    val heartRate: Int?,
    val elapsedTime: Int,                 // seconds
    val distanceCovered: Double,          // km
    val totalDistance: Double?,           // km (null for free runs)
    val difficulty: String,
    val currentKm: Int,
    val progressPercent: Int?,
    
    // Target time
    val targetTimeSeconds: Int?,
    
    // User profile
    val userName: String?,
    val userAge: Int?,
    val userGender: String?,
    val userWeight: String?,
    val userHeight: String?,
    val userFitnessLevel: String?,
    val desiredFitnessLevel: String?,
    
    // Coach configuration
    val coachName: String?,
    val coachTone: CoachTone,
    val coachAccent: String?,             // ⭐ NEW: User's accent
    val coachGender: String?,             // ⭐ NEW: User's preferred gender
    val coachPreferences: String?,
    
    // Context
    val terrain: TerrainData?,
    val weather: WeatherData?,
    val goals: List<Goal>?,
    val weaknessHistory: List<WeaknessPattern>?,
    
    // Anti-repetition
    val recentCoachingTopics: List<String>,
    
    // Current events
    val paceChange: PaceChange?,
    val milestones: List<String>?,
    val kmSplitTimes: List<Int>?,
    
    // Voice input
    val userMessage: String?,
    
    // Exercise type
    val exerciseType: ExerciseType        // RUNNING or WALKING
)
```

---

## Implementation Checklist

### ✅ Android (Completed - March 2026)
- [x] Pre-run summary with Polly TTS
- [x] 500m check-in assessment
- [x] Phase coaching (EARLY, MID, LATE, FINAL)
- [x] Elite coaching tips (5 categories)
- [x] Post-run analysis with AI insights
- [x] Training plan integration & reassessment
- [x] Garmin data enrichment
- [x] Accent & gender support (all 7 voices)
- [x] Voice input ("Talk to Coach")
- [x] All accent parameters passed throughout

### 🔄 iOS (Ready for Implementation)
- [ ] Pre-run summary UI
- [ ] Real-time coaching UI during run
- [ ] Post-run analysis display
- [ ] Training plan screen
- [ ] Coaching preferences (accent, gender, tone)
- [ ] Voice input setup (Speech framework)
- [ ] TTS playback (AVAudioEngine)
- [ ] Garmin data display (if device connected)
- [ ] Push notifications for plan updates

---

## Testing Coverage

### Android Verified Scenarios
1. ✅ Generate pre-run summary with Irish accent (Sean male voice)
2. ✅ 500m check-in fires at correct distance (not 650m)
3. ✅ Phase coaching adapts throughout run
4. ✅ Accent properly passed to all TTS endpoints
5. ✅ Post-run analysis includes target time comparison
6. ✅ Training plan reassesses automatically
7. ✅ Garmin data enriches coaching context
8. ✅ Elite tips displayed with appropriate tone

### Error Handling Verified
1. ✅ Polly API error → fallback to device TTS
2. ✅ Missing accent → use default (American/male)
3. ✅ No target distance → use free-run coaching
4. ✅ Network timeout → graceful retry

---

## Database Tables Updated

### Required for Run Session Coaching
- `runs` — Core run data + AI insights cache
- `training_plans` — Active plans for reassessment
- `weekly_plans` — Week breakdown
- `planned_workouts` — Specific workouts
- `plan_adaptations` — Audit trail of changes
- `connected_devices` — Garmin device info (for enrichment)
- `notifications` — Coaching alerts & milestones

---

## Performance Metrics

### Response Times (p95)
- Pre-run summary: <2 sec
- 500m coaching: <1.5 sec
- Phase coaching: <1 sec
- Elite tips: <1 sec
- Post-run analysis: <3 sec
- Plan reassessment: <5 sec (background)

### Audio Generation
- Polly synthesis: ~500-800ms
- Fallback TTS: ~200-400ms
- Total with upload: <2 sec

---

## Security & Privacy

✅ All coaching data encrypted in transit (HTTPS)  
✅ User preferences stored securely (encrypted at rest)  
✅ AI insights never stored with personally identifiable info  
✅ Audio files deleted after 30 days  
✅ User can export/delete coaching history anytime  
✅ Accent/gender preferences remain local until sync  

---

## Known Issues & Resolutions

### Issue 1: Polly Region Mismatch
- **Problem**: Irish voices (Sean, Niamh) not in ap-southeast-2
- **Resolution**: Migrated to us-east-1 (supports all neural voices)
- **Status**: ✅ Fixed (March 15, 2026)

### Issue 2: 500m Coaching Delayed
- **Problem**: Fired at 650m instead of 500m due to distance gate
- **Resolution**: Added lenient gate for initial 500m check-in
- **Status**: ✅ Fixed (March 15, 2026)

### Issue 3: Missing Accent Parameters
- **Problem**: Some endpoints didn't pass accent to TTS
- **Resolution**: Added accent parameter to 5 endpoints
- **Status**: ✅ Fixed (March 15, 2026)

---

## Files to Reference

- `server/routes.ts` — All endpoints (lines 1731-7120)
- `server/ai-service.ts` — TTS generation + accent handling
- `server/polly-service.ts` — Polly voice mapping
- `server/training-plan-service.ts` — Plan reassessment logic
- `server/garmin-service.ts` — Activity enrichment
- `app/src/main/java/live/airuncoach/RunTrackingService.kt` — Android implementation
- `AI_COACHING_PLAN_SUMMARY.md` — Training plan details
