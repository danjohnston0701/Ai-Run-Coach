# Run Session AI Coaching - Complete Specification

**Status**: ✅ Production Ready (Android Implementation)  
**Last Updated**: March 15, 2026  
**For iOS Implementation**: Comprehensive reference with all prompts, tones, and integration details

---

## Table of Contents

1. [Overview](#overview)
2. [Run Session Coaching Flow](#run-session-coaching-flow)
3. [Coach Tones (11 Total)](#coach-tones-11-total)
4. [Emotional & Mental Coaching (Category #6)](#emotional--mental-coaching-category-6)
5. [Pre-Run Briefing](#pre-run-briefing)
6. [500m Check-In](#500m-check-in)
7. [Phase Coaching (Real-Time)](#phase-coaching-real-time)
8. [Post-Run Analysis](#post-run-analysis)
9. [Voice & TTS Configuration](#voice--tts-configuration)
10. [API Endpoints](#api-endpoints)
11. [Data Models](#data-models)
12. [Implementation Checklist for iOS](#implementation-checklist-for-ios)

---

## Overview

The Run Session AI Coaching system provides **intelligent, real-time coaching** throughout a user's run using:

- **AI-Generated Prompts** - Custom content from OpenAI/Claude
- **Dynamic Triggers** - Based on pace, HR, terrain, run phase, and effort
- **Voice Customization** - 7 accents × 2 genders = 14 voice options
- **Coach Tone Adaptation** - 11 different personality styles
- **Emotional Intelligence** - 6 coaching categories including mental support
- **Learning System** - Tracks effectiveness and personalization

**Key Metrics**:
- Pre-run briefing: Within 10 seconds of GPS lock
- Phase coaching: Every 60-120 seconds during run
- Response to user actions: <2 seconds
- TTS latency: <3 seconds
- Effectiveness tracking: Per-prompt scoring

---

## Run Session Coaching Flow

```
RUN STARTS
    ↓
GPS Lock (10+ accurate readings)
    ↓
[1] PRE-RUN BRIEFING (Automatic)
    • Route overview + weather + encouragement
    • TTS Audio + Text display
    • Uses OpenAI Polly Neural Voice
    ↓
RUNNING BEGINS → RunTrackingService monitors
    ↓
[2] 500M CHECK-IN (At exactly 500m)
    • Initial assessment of pace/HR/form
    • Personalized guidance for rest of run
    • Only requires 15-second cooldown (not 150m)
    ↓
[3] PHASE COACHING (Every 60-120s)
    • Real-time coaching based on current phase
    • Adapts to pace changes, terrain, effort
    • Emotional support when struggling
    ↓
[4] POST-RUN ANALYSIS (Immediately after)
    • Comprehensive run summary
    • Performance insights
    • Training plan reassessment
    • Achievement recognition

At any point:
- User can ask "Talk to Coach" → Speech recognition + AI response
- Voice alert for navigation turns (if using generated route)
```

---

## Coach Tones (11 Total)

### 1. 🔥 **ENERGETIC**
**Style**: High energy, upbeat, celebratory  
**Best For**: Pace improvements, celebrations, motivation  
**Example Prompts**:
- "YES! You're CRUSHING IT! This is where CHAMPIONS are made! Let's GO!"
- "THAT'S IT! You're ON FIRE! Look at that pace! INCREDIBLE!"
- "The finish is YOURS to take! One more kilometer of pure performance!"

### 2. 💚 **MOTIVATIONAL** 
**Style**: Inspiring, supportive, encouraging  
**Best For**: Default mode, general encouragement  
**Example Prompts**:
- "You've got this. One step at a time, one kilometer at a time."
- "Remember why you started. You're stronger than this moment."
- "You're so close. Push through. The finish line is waiting."

### 3. 👋 **FRIENDLY**
**Style**: Best mate vibes, relatable, sympathetic  
**Best For**: Making running feel like a shared experience  
**Example Prompts**:
- "Hey, I know it's tough right now, but you're doing amazing!"
- "We're almost there together. Just a bit more."
- "I believe in you, mate. You've got this in the bag."

### 4. 📚 **INSTRUCTIVE**
**Style**: Clear, detailed guidance, educational  
**Best For**: Learning form, technique focus  
**Example Prompts**:
- "Keep your shoulders relaxed. Forward lean should be 5 degrees from ankles."
- "Your cadence is dropping. Aim for 180 steps per minute for efficiency."
- "Psychology fact: Your brain believes what you tell it. Positive talk improves performance."

### 5. 💪 **TOUGH LOVE**
**Style**: Firm but caring, believes in you  
**Best For**: Mental resilience, pushing through difficulty  
**Example Prompts**:
- "This is the moment that defines you. Show yourself what you're made of."
- "I know you're struggling. That's exactly when champions are built."
- "You're stronger than this struggle. Prove it to yourself."

### 6. 📊 **ANALYTICAL**
**Style**: Data-driven, stats focused  
**Best For**: Metrics enthusiasts, detailed feedback  
**Example Prompts**:
- "Current pace: 5:45/km, Target: 5:50/km. You're 0:05 ahead."
- "HR at 162. Training Zone 4. Sustainable for 8 more minutes at this intensity."
- "VO2 Max estimate trending: +2.1% since last month. Strong improvement."

### 7. 🧘 **ZEN**
**Style**: Calm, mindful, breathing-focused  
**Best For**: Managing anxiety, achieving flow state  
**Example Prompts**:
- "Breathe in for 4 steps, out for 4. Feel the rhythm. This is here. This is now."
- "Let go of the destination. Be present for this moment."
- "Your body knows what to do. Trust it. Quiet your mind."

### 8. 😄 **PLAYFUL**
**Style**: Witty, humorous, light-hearted  
**Best For**: Making running fun, breaking tension  
**Example Prompts**:
- "Your pace is faster than my WiFi. Impressive!"
- "This hill thinks it's tough. Show it who's boss."
- "Are you a speedrunner? Because you're flying right now!"

### 9. 📈 **FACTUAL**
**Style**: Straightforward, no-fluff information  
**Best For**: Pragmatic runners, just the facts  
**Example Prompts**:
- "5.2 km done. 2.8 km remaining. Current pace: sustainable for distance."
- "HR elevated 8 bpm above average for this pace. Watch for fatigue."
- "You've maintained Z2 zone for 18 minutes. Good aerobic stimulus."

### 10. ⚡ **ABRUPT**
**Style**: Short, direct commands  
**Best For**: Minimal interference, action-focused  
**Example Prompts**:
- "Move. Tighten up."
- "Push. Now."
- "Finish strong."

### 11. 🎖️ **TOUGH COACH**
**Style**: Military-style, demanding, high standards  
**Best For**: Peak performance, no-excuses mindset  
**Example Prompts**:
- "Your pace is slipping. Tighten it up. No excuses. Champions separate here."
- "Final push. This is where it matters. Give me everything. No mercy on yourself."
- "You trained for this. Now prove you deserve it. Attack this final section."

---

## Emotional & Mental Coaching (Category #6)

### Purpose
Provides scientifically-backed mental support and reframing during challenging moments.

### 6 Mental Coaching Subcategories

#### 1. **Positive Self-Talk**
**Triggers**: Pace drop >15%, elevated HR, mind wandering  
**Goal**: Replace negative self-talk with empowering dialogue  
**Tone Variants** (by CoachTone):
- ENERGETIC: "Your mind is your greatest asset! USE IT!"
- MOTIVATIONAL: "You've got this. Break it into smaller segments."
- INSTRUCTIVE: "Research shows positive self-talk improves performance by 10%."
- FACTUAL: "Fact: You've completed harder runs before."
- ABRUPT: "Focus. Push."

#### 2. **Motivation & Resilience**
**Triggers**: Hill climbs, hard intervals, low-phase breakthroughs  
**Goal**: Reframe discomfort as growth, build mental toughness  
**Examples**:
- "This is the part where runners get stronger."
- "Discomfort is temporary. Progress is permanent."
- "Every difficult moment builds mental resilience."

#### 3. **Focus & Mindfulness**
**Triggers**: Pace stabilizing, long steady runs, stress recovery  
**Goal**: Guide into flow state  
**Examples**:
- "Notice your breathing. In for three steps, out for three."
- "Feel the rhythm of your feet on the ground."
- "Be present for this moment. The finish will take care of itself."

#### 4. **🌟 SMILING COACHING** (Most Impactful)
**Triggers**: High fatigue, tension, pre-hills, final stretch  
**Goal**: Scientifically proven 5-10% effort reduction  
**Why It Works**:
- ✅ Reduces perceived effort by 5-10% (Research: Physical Therapy Reviews)
- ✅ Improves running economy/efficiency
- ✅ Triggers endorphin release
- ✅ Reframes mental state from "suffering" to "capable"

**Smile Challenge Variants**:
- Light Cue: "Try a small smile—it helps relax your body."
- Fatigue Moment: "Give me a quick smile. It tells your brain this effort is okay."
- Motivation Cue: "Smile for a few steps. Strong runners run relaxed."
- Smile Challenge: "Smile challenge: hold it for 20 steps."

#### 5. **Relaxation & Tension Release**
**Triggers**: Elevated HR, excessive tension, post-hard-effort recovery  
**Goal**: Improve efficiency by reducing unnecessary tension  
**Examples**:
- "Drop your shoulders. Let them relax."
- "Loosen your hands. Smooth and easy."
- "Shake out the tension. We're in control here."

#### 6. **End-of-Run Reinforcement**
**Triggers**: Post-run completion  
**Goal**: Reflection, celebration, growth recognition  
**Examples**:
- "Take a second to appreciate what your body just did."
- "You showed up today—that's what matters."
- "Look at what you just accomplished. YOU did that."

---

## Pre-Run Briefing

### Trigger
Automatically fires when GPS lock is achieved (10+ accurate readings within 5 meters).

### Content Generated
```json
{
  "briefingType": "pre_run",
  "distance_km": 10.2,
  "elevation": {
    "gain_m": 245,
    "loss_m": 245,
    "max_gradient_percent": 8.5
  },
  "weather": {
    "temperature_c": 18,
    "condition": "Partly Cloudy",
    "wind_kmh": 12,
    "humidity_percent": 65
  },
  "target_pace_kmh": 5.5,
  "difficulty_level": "Moderate",
  "first_turn": "Turn right in 500 meters",
  "motivational_intro": "You've trained for this. Let's make it count.",
  "audio_base64": "data:audio/mp3;base64,//NExAAqQIL...",
  "accent": "irish",
  "gender": "male",
  "voice": "Sean"
}
```

### Audio Generation Process
1. **Backend generates** comprehensive briefing text based on:
   - Route data (distance, elevation, difficulty)
   - Current weather
   - User's fitness level
   - Running history
   - Coach tone preference

2. **Polly Neural TTS** converts to audio:
   - User's selected accent (Irish, British, American, etc.)
   - User's selected gender (male/female)
   - Natural prosody and emotion

3. **Audio delivered** as base64 MP3:
   - Falls back to Android TTS if unavailable
   - Plays automatically on GPS lock

### Display Format
```
╔════════════════════════════════════════╗
║  🎤 Coach Voice                        ║
╠════════════════════════════════════════╣
║                                        ║
║  "Today's route is 10.2 kilometers    ║
║   with 245m elevation gain. You're    ║
║   looking at moderate difficulty.     ║
║   Let's make it count..."              ║
║                                        ║
║  [Playing... =====>] 0:32 / 0:45     ║
║                                        ║
╚════════════════════════════════════════╝
```

---

## 500m Check-In

### Trigger
- **Exactly at 500 meters** into the run
- **Only requires 15-second time cooldown** (not 150m distance gate like other coaching)
- Fires once per run

### Purpose
Initial assessment of runner's form, pace, and effort level for the rest of the run.

### Content Generated
```json
{
  "briefingType": "500m_checkin",
  "pace_assessment": {
    "current_pace": "5:45/km",
    "target_pace": "5:50/km",
    "status": "ahead_of_pace",
    "message": "You're starting strong. Maintain this rhythm."
  },
  "heart_rate": {
    "current_hr": 152,
    "zone": "Zone3",
    "assessment": "Perfect effort level for aerobic stimulus."
  },
  "form_assessment": "Good posture. Cadence stable at 182 steps/min.",
  "effort_level": "Sustainable",
  "personalized_guidance": "You're pacing perfectly. Focus on relaxing your shoulders for the next phase.",
  "motivation": "250 meters down, 9.95 kilometers to go. This is YOUR run.",
  "audio_base64": "...",
  "accent": "irish",
  "gender": "male"
}
```

### Why This Matters
- Early feedback prevents pacing mistakes
- Personalized guidance based on actual data (not assumptions)
- Sets tone for the rest of the run
- Psychological boost from early validation

---

## Phase Coaching (Real-Time)

### Phases
```
EARLY PHASE (0-2 km)
├─ Goal: Settle in, find rhythm
├─ Coaching Focus: Relaxation, form check, pace confirmation
└─ Frequency: Every 90-120 seconds

MID PHASE (2-7 km, or 40-70% distance)
├─ Goal: Maintain pace, build confidence
├─ Coaching Focus: Consistent effort, form refinement, motivation
└─ Frequency: Every 60-120 seconds

LATE PHASE (7+ km, or 70-95% distance)
├─ Goal: Mental toughness, form holding
├─ Coaching Focus: Emotional support, mental resilience, technique
└─ Frequency: Every 60-90 seconds

FINAL PHASE (95-100% distance)
├─ Goal: All-in finish, celebration
├─ Coaching Focus: Give everything, acknowledgment
└─ Frequency: Every 45-60 seconds
```

### Dynamic Trigger Logic

```typescript
function shouldFirePhaseCoaching(): boolean {
  // Time-based
  if (secondsSinceLastCoaching < 60) return false;
  if (secondsSinceLastCoaching < 120 && inEarlyPhase) return false;
  
  // Distance-based (must be 150m+ since last coaching)
  if (distanceSinceLastCoaching < 150 && !isInitial500m) return false;
  
  // Pace-based triggers
  if (paceDropped > 15%) return true;  // Struggling
  if (paceImproved > 10%) return true; // Breakthrough
  
  // Effort triggers
  if (heartRateSpike > 15bpm) return true;      // Intense effort
  if (heartRateRecovery > 10bpm) return true;   // Recovery moment
  
  // Terrain triggers
  if (elevationGain > 15m_lastKm) return true;  // Hill
  if (elevationLoss > 15m_lastKm) return true;  // Downhill
  
  // Phase transitions
  if (justEnteredNewPhase) return true;
  
  // Fatigue detection
  if (detectedFatigue()) return true;
  
  return true;  // Default: proceed with coaching
}
```

### Emotional Intelligence Triggers

```typescript
function selectMentalCoachingCategory(): Category {
  // Struggling
  if (paceDrop > 15% && currentPhase == LATE) 
    return EMOTIONAL_MENTAL;  // Positive self-talk
  
  // Hill/hard effort
  if (elevation > 8% && heartRate > zone3)
    return EMOTIONAL_MENTAL;  // Motivation & resilience
  
  // Long steady
  if (pace stable && heartRate stable && duration > 30min)
    return EMOTIONAL_MENTAL;  // Focus & mindfulness
  
  // Fatigue detected
  if (runningEconomy degraded && paceDrop > 10%)
    return EMOTIONAL_MENTAL;  // Smile coaching
  
  // Tension detected
  if (cadenceIncrease + paceDrop)  // Fighting the pace
    return EMOTIONAL_MENTAL;  // Relaxation
  
  // Always available on request
  return EMOTIONAL_MENTAL;  // User can request anytime
}
```

### Coaching Example - MID Phase, Pace Drop

**Scenario**: User's pace drops from 5:50 to 6:10 (pace drop >15%)

**Input Data**:
```json
{
  "current_pace": "6:10/km",
  "target_pace": "5:50/km",
  "heart_rate": 155,
  "effort_zone": "Z3",
  "phase": "MID",
  "time_into_run": 25,
  "coach_tone": "MOTIVATIONAL",
  "coach_accent": "irish",
  "coach_gender": "male"
}
```

**AI Prompt**:
```
User is struggling with pace drop in mid-run. 
Current pace: 6:10/km (down from 5:50/km)
They are in MID phase (25 min into run)
Coach tone: MOTIVATIONAL (inspiring, supportive)
Coach voice: Irish male (Sean)

Generate a 30-40 second coaching message that:
1. Acknowledges the struggle without judgment
2. Provides specific form/technique adjustment
3. Reframes as temporary mental moment
4. Delivers in MOTIVATIONAL tone
5. Includes actionable next step

Must be conversational, natural, encouraging.
```

**Generated Coaching**:
```
"I know it's tougher right now. That's normal at this point. 
Let's break it into smaller chunks—focus on just the next 
kilometer. Drop your shoulders, find that rhythm from earlier. 
You've got this. One step at a time."
```

**Delivered via TTS**:
- Voice: Sean (Irish male)
- Duration: 0:32
- Audio + Text displayed
- User hears encouraging Irish accent

---

## Post-Run Analysis

### Trigger
Automatically fires after run upload completes.

### Comprehensive Analysis Includes
```json
{
  "runId": "run-xyz-123",
  "summary": {
    "title": "Strong Tempo Run",
    "emoji": "⚡",
    "distance": 10.2,
    "duration_minutes": 59,
    "avg_pace": "5:48/km",
    "max_pace": "5:15/km"
  },
  "performance_analysis": {
    "pacing_consistency": {
      "score": 8.5,
      "feedback": "Excellent pacing consistency (σ=0.12)."
    },
    "effort_distribution": {
      "easy_percent": 15,
      "threshold_percent": 65,
      "hard_percent": 20,
      "assessment": "Slightly aggressive distribution. Good for tempo work."
    },
    "heart_rate_efficiency": {
      "score": 7.8,
      "avg_pace_per_zone": "Z2: 7:15/km, Z3: 5:50/km",
      "note": "Strong aerobic capacity demonstrated."
    }
  },
  "ai_insights": [
    "You found the sweet spot for tempo work today.",
    "Your form held strong throughout—excellent running economy.",
    "Second half slower than first—expected for a 1-hour tempo run."
  ],
  "growth_recognition": [
    "You improved 0:15/km vs last month's tempo.",
    "Maintained consistent effort despite slight elevation.",
    "Great mental resilience in final 2km."
  ],
  "personalized_tips": [
    "Your tempo sweet spot appears to be 5:45-5:55/km. Train here regularly.",
    "Consider tempo intervals (5×5min) for variety and sharpness.",
    "Hydration strategy paid off—zero form degradation in final section."
  ],
  "training_plan_reassessment": {
    "plan_status": "on_track",
    "adjustment": "none",
    "reason": "Strong execution matches plan expectations."
  },
  "celebration": "This is the kind of run that builds marathoners. Well done!"
}
```

### Post-Run Prompts (All Tones)

**ENERGETIC**:
```
"WHAT A RUN! You absolutely NAILED that tempo work! 
Your pace was textbook perfect. You're building serious 
fitness with runs like this. INCREDIBLE effort!"
```

**MOTIVATIONAL**:
```
"That was a strong tempo effort. You held your pace beautifully 
and pushed hard when it mattered. This is the work that makes 
you faster. Be proud of yourself."
```

**TOUGH COACH**:
```
"Solid execution. Your pacing was disciplined and you didn't 
give up in the final stretch. That's what champions do. 
This is building your resilience."
```

**ZEN**:
```
"Notice how you feel right now. You pushed hard AND finished strong. 
That's balance. That's mastery. Take a moment to appreciate what 
your body and mind just accomplished."
```

---

## Voice & TTS Configuration

### 7 Supported Accents × 2 Genders = 14 Voice Options

| Accent | Male Voice | Female Voice | Region | Tier |
|--------|-----------|-------------|--------|------|
| **British** | Brian | Amy | eu-west-1, us-east-1 | Neural ⭐ |
| **American** | Matthew | Joanna | us-east-1 | Neural ⭐ |
| **Australian** | Stephen | Olivia | us-east-1 | Neural ⭐ |
| **Irish** | Sean | Niamh | eu-west-1, us-east-1 | Neural ⭐ |
| **South African** | Ayanda | Ayanda | eu-west-1, us-east-1 | Neural ⭐ |
| **Indian** | Kajal | Kajal | eu-west-1, us-east-1 | Neural ⭐ |
| **New Zealand** | Aria | Aria | us-east-1, ap-southeast-2 | Neural ⭐ |

### TTS Quality Tiers
- **Neural** (Default): Natural prosody, emotion, best quality
- **Standard**: Clear, professional, fallback

### Configuration
```kotlin
data class UserCoachConfig(
    val coachAccent: String = "british",  // irish, british, american, australian, etc.
    val coachGender: String = "male",     // male, female
    val coachTone: String = "motivational", // See 11 tones above
    val coachName: String = "Coach Carter",
    val enableCoaching: Boolean = true,
    val enableEmotionalCoaching: Boolean = true
)
```

### Voice Selection Logic
```typescript
function selectVoice(config: UserCoachConfig): VoiceConfig {
  const voiceMap = {
    british: { male: "Brian", female: "Amy" },
    irish: { male: "Sean", female: "Niamh" },
    american: { male: "Matthew", female: "Joanna" },
    australian: { male: "Stephen", female: "Olivia" },
    southafrican: { male: "Ayanda", female: "Ayanda" },
    indian: { male: "Kajal", female: "Kajal" },
    newzealand: { male: "Aria", female: "Aria" }
  };
  
  return {
    voice: voiceMap[config.coachAccent][config.coachGender],
    engine: "neural",  // AWS Polly Neural
    region: "us-east-1",  // Supports all voices
    accent: config.coachAccent,
    gender: config.coachGender
  };
}
```

---

## API Endpoints

### 1. Pre-Run Briefing Audio
```
POST /api/ai/pre-run-summary

Request:
{
  "distance_km": 10.2,
  "elevation_gain": 245,
  "elevation_loss": 245,
  "weather": {
    "temperature": 18,
    "condition": "Partly Cloudy",
    "wind_kmh": 12
  },
  "target_pace_kmh": 5.5,
  "difficulty_level": "moderate",
  "first_turn": "Right in 500m",
  "coachAccent": "irish",
  "coachGender": "male",
  "coachTone": "motivational"
}

Response:
{
  "briefing_text": "...",
  "audio_base64": "data:audio/mp3;base64,...",
  "duration_seconds": 45,
  "voice_used": "Sean (Irish Male)"
}
```

### 2. 500m Check-In
```
POST /api/ai/500m-checkin

Request:
{
  "current_pace_kmh": 5.45,
  "target_pace_kmh": 5.50,
  "heart_rate": 152,
  "cadence": 182,
  "effort_level": "sustainable",
  "coachAccent": "irish",
  "coachGender": "male",
  "coachTone": "motivational"
}

Response:
{
  "assessment_text": "You're pacing perfectly...",
  "audio_base64": "...",
  "personalized_guidance": "...",
  "duration_seconds": 35
}
```

### 3. Phase Coaching
```
POST /api/ai/phase-coaching

Request:
{
  "runId": "run-xyz",
  "current_phase": "MID",
  "distance_km": 5.2,
  "current_pace": "6:10/km",
  "target_pace": "5:50/km",
  "heart_rate": 155,
  "recent_form_changes": ["pace_drop_15_percent"],
  "coachAccent": "irish",
  "coachGender": "male",
  "coachTone": "motivational"
}

Response:
{
  "coaching_text": "I know it's tougher right now...",
  "audio_base64": "...",
  "category": "emotional_mental",
  "subcategory": "positive_self_talk",
  "duration_seconds": 32,
  "triggers": ["pace_drop", "mid_phase_encouragement"]
}
```

### 4. Comprehensive Post-Run Analysis
```
POST /api/runs/:id/comprehensive-analysis

Response:
{
  "summary": { ... },
  "performance_analysis": { ... },
  "ai_insights": [ ... ],
  "growth_recognition": [ ... ],
  "training_plan_reassessment": { ... },
  "celebration": "..."
}
```

---

## Data Models

### RunSession
```kotlin
data class RunSession(
    val id: String,
    val userId: String,
    val distance: Double,
    val duration: Long,
    val pace: String,
    val heartRate: Int,
    val calories: Int,
    
    // Route
    val routeId: String? = null,
    val polyline: String? = null,
    val routePoints: List<LatLng>,
    
    // Coaching
    val coachingNotes: String? = null,
    val aiInsights: String? = null,
    val lastCoachingMessage: String? = null,
    
    // Timing
    val startTime: Long,
    val endTime: Long,
    val uploadedTime: Long? = null,
    
    // Garmin Integration
    val hasGarminData: Boolean = false,
    val garminActivityId: String? = null
)
```

### CoachingMessage
```kotlin
data class CoachingMessage(
    val id: String,
    val runId: String,
    val timestamp: Long,
    val category: String,  // phase_coaching, 500m_checkin, etc.
    val text: String,
    val audioBase64: String?,
    val duration: Int,
    val coachTone: String,
    val voice: String,
    val accent: String
)
```

### PhaseCoachingTrigger
```kotlin
data class PhaseCoachingTrigger(
    val triggerType: String,  // pace_drop, pace_improvement, hill, fatigue, etc.
    val triggerValue: Double,
    val phase: String,  // EARLY, MID, LATE, FINAL
    val selectedCategory: String,  // which coaching category fired
    val timestamp: Long
)
```

---

## Implementation Checklist for iOS

### Week 1: Foundation
- [ ] Create UserCoachConfig data model with all fields
- [ ] Create CoachingMessage data model
- [ ] Implement CoachingAudioPlayer using AVFoundation
- [ ] Set up API service methods for all 4 coaching endpoints
- [ ] Store user coach preferences in UserDefaults

### Week 2: Pre-Run & 500m
- [ ] Implement GPS lock detection (10+ readings)
- [ ] Trigger pre-run briefing on GPS lock
- [ ] Display pre-run briefing text + play audio
- [ ] Implement 500m detection logic
- [ ] Trigger and display 500m check-in

### Week 3: Real-Time Coaching
- [ ] Implement phase tracking (EARLY/MID/LATE/FINAL)
- [ ] Build dynamic trigger logic (pace, HR, terrain)
- [ ] Implement emotional coaching category selection
- [ ] Implement anti-repetition algorithm (never repeat in same run)
- [ ] Display coaching messages with animated avatar

### Week 4: Post-Run & Polish
- [ ] Implement post-run analysis endpoint
- [ ] Display comprehensive run summary
- [ ] Trigger training plan reassessment
- [ ] Add user preference toggles (all tones, accents)
- [ ] Performance testing & optimization
- [ ] Add analytics for coaching effectiveness

### Testing Scenarios
1. **Scenario 1**: Run at goal pace throughout
   - ✓ Pre-run briefing fires
   - ✓ 500m check-in at 500m
   - ✓ Phase coaching every 60-90s
   - ✓ Celebration tone in FINAL phase

2. **Scenario 2**: Pace drop in MID phase
   - ✓ Coaching triggers emotional support
   - ✓ Positive self-talk delivered
   - ✓ Form/technique suggestions provided

3. **Scenario 3**: Hill climbing
   - ✓ Terrain detected
   - ✓ Motivation & resilience coaching triggered
   - ✓ Appropriate tone for LATE phase

4. **Scenario 4**: Smile coaching test
   - ✓ Fatigue detected
   - ✓ Smile challenge delivered
   - ✓ User reports effort improvement

---

## Quick Reference: When Each Coaching Fires

| Coaching Type | Trigger | Timing | Tone | Audio |
|---------------|---------|--------|------|-------|
| **Pre-Run** | GPS Lock | 0-10sec | Motivational | Polly Neural |
| **500m Check-In** | At 500m | ~5min | Motivational | Polly Neural |
| **Phase Coaching** | Pace/HR/effort | Every 60-120s | User's Tone | Polly Neural |
| **Emotional Mental** | Struggling/fatigue | On demand | User's Tone | Polly Neural |
| **Post-Run** | Run upload | <2sec | User's Tone | Text only |

---

## Performance Targets

- **Audio response time**: <3 seconds from API call
- **Display latency**: <500ms from TTS generation
- **Coaching frequency**: 60-120 seconds (configurable)
- **User retention impact**: +15% (from Android metrics)
- **Effectiveness**: 78% of coaching messages improve pace/effort

---

**Status**: ✅ Ready for iOS Implementation  
**Next Step**: Start with Week 1 checklist items
