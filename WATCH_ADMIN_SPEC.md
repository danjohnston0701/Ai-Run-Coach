# Watch Integration & Admin Configuration

**Version:** 1.0  
**Last Updated:** January 24, 2026

## Watch Device Integration

### Supported Platforms

| Platform | SDK | Real-Time HR | Post-Run Sync |
|----------|-----|--------------|---------------|
| Apple Watch | HealthKit | ✅ | ✅ |
| Samsung Galaxy Watch | Samsung Health SDK | ✅ | ✅ |
| Garmin | Connect IQ SDK | ✅ | ✅ |
| Coros | Web API (OAuth) | ❌ | ✅ |
| Strava | Web API (OAuth) | ❌ | ✅ |

### Heart Rate Data Structure

```kotlin
data class HeartRateReading(
    val bpm: Int,
    val timestamp: Long,
    val source: DeviceSource,  // APPLE, SAMSUNG, GARMIN, MANUAL
    val confidence: Float?     // 0-1 quality score
)

// Heart rate zones (based on max HR = 220 - age, or custom)
fun getHeartRateZone(bpm: Int, maxHR: Int): HeartRateZone {
    val percent = (bpm.toFloat() / maxHR) * 100
    return when {
        percent < 60 -> HeartRateZone(1, "Recovery", "#3B82F6")
        percent < 70 -> HeartRateZone(2, "Fat Burn", "#22C55E")
        percent < 80 -> HeartRateZone(3, "Aerobic", "#EAB308")
        percent < 90 -> HeartRateZone(4, "Threshold", "#F97316")
        else -> HeartRateZone(5, "Max Effort", "#EF4444")
    }
}
```

### Real-Time HR in Coaching

```kotlin
val coachingContext = CoachingRequest(
    // ... existing fields
    heartRate = currentHeartRate,
    heartRateZone = getHeartRateZone(currentHeartRate, userMaxHR),
    avgHRThisKm = calculateAvgHR(heartRateHistory, lastKmStartTime),
    hrTrend = getHRTrend(heartRateHistory)  // rising, stable, falling
)
```

### Post-Run Device Data

```kotlin
data class DeviceSyncData(
    val userId: String,
    val runId: String,
    val activityId: String?,              // External activity ID
    val heartRateZones: HeartRateZones?,
    val vo2Max: Float?,
    val trainingEffect: Float?,           // 1.0 - 5.0
    val recoveryTimeHours: Int?,
    val stressLevel: Int?,                // 0-100
    val bodyBattery: Int?,                // 0-100
    val rawData: Map<String, Any>?        // Full device response
)

data class HeartRateZones(
    val zone1Minutes: Int,
    val zone2Minutes: Int,
    val zone3Minutes: Int,
    val zone4Minutes: Int,
    val zone5Minutes: Int
)
```

---

## Admin AI Configuration

### AI Coach Config Structure

```kotlin
data class AiCoachConfig(
    val description: String?,              // Custom coach identity
    val instructions: List<Instruction>?,  // Coaching guidelines
    val knowledge: List<Knowledge>?,       // Knowledge base
    val faqs: List<FAQ>?                   // Common Q&A
)

data class Instruction(
    val title: String,
    val content: String
)

data class Knowledge(
    val title: String,
    val content: String
)

data class FAQ(
    val question: String,
    val answer: String
)
```

### Admin Phase Configuration

```kotlin
data class AdminPhaseConfig(
    // Phase thresholds
    val earlyMaxKm: Double = 2.0,
    val earlyMaxPercent: Int = 10,
    val midMinKm: Double = 3.0,
    val midMaxKm: Double = 5.0,
    val midMinPercent: Int = 40,
    val midMaxPercent: Int = 50,
    val lateMinKm: Double = 7.0,
    val lateMinPercent: Int = 75,
    val lateMaxPercent: Int = 90,
    val finalMinPercent: Int = 90,
    
    // Coaching intervals
    val periodicCoachingIntervalSeconds: Int = 90,
    val minTimeBetweenTerrainCoachingSeconds: Int = 30,
    val minTimeBetweenPaceCoachingSeconds: Int = 60,
    
    // Feature toggles
    val kmMilestoneEnabled: Boolean = true,
    val halfKmSummaryEnabled: Boolean = false,
    val terrainCoachingEnabled: Boolean = true,
    val paceDropCoachingEnabled: Boolean = true,
    val weatherAwareCoachingEnabled: Boolean = true
)
```

### Coaching Log / Audit Trail

```kotlin
data class CoachingLog(
    val id: String,
    val sessionKey: String,
    val userId: String,
    val runId: String?,
    val timestamp: Long,
    val eventType: CoachingEventType,
    val trigger: String,
    val distanceKm: Double,
    val elapsedSeconds: Int,
    val currentPace: String?,
    val heartRate: Int?,
    val cadence: Int?,
    val terrain: TerrainData?,
    val weather: WeatherData?,
    val topic: String?,
    val requestPayload: String,            // Full request JSON
    val responseText: String?,             // AI response
    val responsePayload: String?,          // Full response JSON
    val modelUsed: String?,                // gpt-4o, gpt-4o-mini
    val tokensUsed: Int?,
    val latencyMs: Int?
)

enum class CoachingEventType {
    PERIODIC,
    KM_MILESTONE,
    HALF_KM_SUMMARY,
    TERRAIN_UPHILL,
    TERRAIN_DOWNHILL,
    HILL_CREST,
    PACE_DROP,
    PACE_IMPROVEMENT,
    USER_VOICE_INPUT,
    WEAKNESS_DETECTED,
    WEATHER_ALERT,
    PRE_RUN_SUMMARY,
    POST_RUN_ANALYSIS
}
```

### Admin Dashboard Queries

```kotlin
// Get all coaching logs for a run
// GET /api/admin/coaching-logs?runId={runId}

// Get logs by event type
// GET /api/admin/coaching-logs?eventType=TERRAIN_UPHILL&startDate=2024-01-01

// Get AI usage stats
// GET /api/admin/ai-stats?userId={userId}&startDate=2024-01-01
data class AIUsageStats(
    val totalCoachingCalls: Int,
    val totalTokensUsed: Int,
    val avgLatencyMs: Int,
    val callsByEventType: Map<CoachingEventType, Int>,
    val callsByTopic: Map<String, Int>
)
```

---

## Free Run (Run Without Route)

### Key Differences from Routed Runs

| Feature | Routed Run | Free Run |
|---------|-----------|----------|
| Total distance | Known | Unknown |
| Phase detection | Uses percentage | Uses absolute distance only |
| Elevation profile | Pre-loaded | Sampled in real-time |
| Navigation | Turn-by-turn | None |
| Target time | Can be set | Can be set (with distance estimate) |
| Late/Final phases | At 75%/90% | Never triggered (safety) |

### Phase Detection for Free Runs

```kotlin
// NEVER trigger late/final phase coaching to avoid fatigue messages early

fun determinePhaseForFreeRun(distanceKm: Double): CoachingPhase {
    return when {
        distanceKm <= 2.0 -> CoachingPhase.EARLY
        distanceKm in 3.0..5.0 -> CoachingPhase.MID
        else -> CoachingPhase.GENERIC  // Stay generic beyond 5km
    }
}
```

### All Features Available in Free Run
- AI coaching (periodic, terrain-triggered, pace-based)
- Voice input to coach
- Km milestone announcements
- Struggle point detection
- Post-run AI analysis
- Weather-aware coaching
- Watch heart rate integration
- Cadence analysis

---

## API Endpoints Reference

### Route Generation
```
POST /api/routes/generate
Request: RouteGenerationRequest
Response: { success: boolean, routes: RouteCandidate[] }
```

### AI Coaching
```
POST /api/ai/coaching
Request: CoachingRequest
Response: CoachingResponse
```

### Pre-Run Summary
```
POST /api/ai/run-summary
Request: RunSummaryRequest
Response: { summary: string }
```

### Post-Run Analysis
```
POST /api/ai/run-analysis
Request: RunAnalysisRequest
Response: RunAnalysisResponse
```

### Text-to-Speech
```
POST /api/tts
Request: TTSRequest
Response: audio/mpeg (MP3 buffer)
```

### Weakness Events
```
POST /api/runs/{runId}/weakness-events/bulk
Request: { events: WeaknessEvent[] }
Response: { success: boolean }

GET /api/users/{userId}/weakness-patterns
Response: WeaknessPattern[]
```

### Coaching Logs
```
POST /api/coaching-logs
Request: CoachingLog
Response: { id: string }

GET /api/coaching-logs?sessionKey={key}
Response: CoachingLog[]
```

### Device Sync
```
POST /api/device-data/sync
Request: DeviceSyncData
Response: { success: boolean }
```

## Implementation Files to Create
- `WatchHealthKit.kt` (iOS)
- `WatchSamsungHealth.kt` (Android)
- `WatchGarminConnect.kt`
- `HeartRateZoneCalculator.kt`
- `AdminCoachConfigManager.kt`
- `CoachingLogger.kt`
- `FreeRunManager.kt`
