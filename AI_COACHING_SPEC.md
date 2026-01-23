# AI Coaching System Specification

**Version:** 1.0  
**Last Updated:** January 24, 2026

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

## Elite Coaching Tips (5 Categories)

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
- "Aim for around 180 steps per minute — quicker turnover reduces impact and improves efficiency."

### 5. Core, Hips & Mindset
- "Lightly engage your core to keep your torso stable as your legs and arms move."
- "Let the movement start from your hips, driving you calmly forward."
- "When you tire, come back to basics: tall posture, relaxed shoulders, smooth steps."
- "Stay present in this section of the run — one controlled stride at a time."
- "Run with quiet confidence; efficient, relaxed form is your biggest advantage today."
- "Visualize strong, controlled strides — your mind guides your body through the tough moments."

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

## Implementation Files to Create
- `CoachingService.kt`
- `CoachingPhaseManager.kt`
- `EliteCoachingTips.kt`
- `CoachingStatements.kt`
- `VoiceInputHandler.kt`
- `TTSService.kt`
- `PreRunSummaryGenerator.kt`
- `PostRunAnalyzer.kt`
