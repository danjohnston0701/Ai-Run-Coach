# Sprint 1: Update AI Analysis for Garmin Watch Data

## Critical Principle

**NO NULL VALUES OR BLANK DATA TO AI**

The AI analysis must ONLY receive data we have collected. No hallucinating insights on missing data.

---

## Current Flow

```
User completes run
  ↓
RunSummaryViewModel.generateAIAnalysis()
  ↓
apiService.getComprehensiveRunAnalysis(runId)
  ↓
Backend: /api/runs/{id}/comprehensive-analysis
  ↓
Claude AI (with prompt)
  ↓
Response displayed in RunSummaryScreen
```

## New Flow

```
User completes run (with or without Garmin watch)
  ↓
RunSummaryViewModel queries:
  • RunSession (base metrics)
  • WatchBiometricSamples (if Garmin)
  • UserProfile (baseline + "What I know about you")
  ↓
Build AI prompt with ONLY data we have:
  • hasGarminData flag checks what's available
  • Null checks prevent blank sections
  • Computed values (baselines) included only if available
  ↓
apiService.getComprehensiveRunAnalysis(runId, garminDataSummary, userProfile)
  ↓
Backend builds conditional prompt based on data availability
  ↓
Claude AI (with conditional sections)
  ↓
Response displayed WITHOUT blank sections
```

---

## Key Data Structures

### What's Currently Passed

```kotlin
// Current endpoint
suspend fun getComprehensiveRunAnalysis(@Path("id") runId: String): ComprehensiveAnalysisResponse
```

### What We Need to Pass

```kotlin
data class ComprehensiveAnalysisRequest(
    val runId: String,
    
    // NEW: Garmin watch data summary (only if available)
    val garminDataSummary: GarminDataSummary? = null,
    
    // NEW: User profile for "What I know about you"
    val userProfile: UserProfileForAI? = null
)

data class GarminDataSummary(
    // Only include fields we actually have
    val hasGarminData: Boolean,
    val deviceName: String?,
    
    // Running Dynamics (only if non-null)
    val avgGroundContactTime: Float?,
    val avgVerticalOscillation: Float?,
    val avgStrideLength: Float?,
    val avgGroundContactBalance: Float?,
    val avgVerticalRatio: Float?,
    
    // Training (only if non-null)
    val aerobicTrainingEffect: Float?,
    val anaerobicTrainingEffect: Float?,
    val recoveryTimeMinutes: Int?,
    val vo2MaxEstimate: Float?,
    
    // Environmental (only if non-null)
    val avgAmbientPressure: Float?,
    val avgBearing: Float?,
    
    // Computed (server-side)
    val estimatedFatigue: Int?,  // 0-100
    val terrainSummary: String?  // "rolling with 150m elevation"
)

data class UserProfileForAI(
    val userId: String,
    val whatIKnowAboutYou: String,  // Free-text runner profile
    
    // NEW: Updated with Garmin insights
    val garminInsights: String?,  // Summary of watch data trends
    
    // Baseline (4-week)
    val baselineGCT: Float?,
    val baselineVO: Float?,
    val baselineStride: Float?,
    val baselineCadence: Int?,
    val baselineVO2Max: Float?
)
```

---

## Implementation Steps

### Step 1: Update API Service

**File**: `ApiService.kt`

```kotlin
// CHANGE FROM:
@POST("/api/runs/{id}/comprehensive-analysis")
suspend fun getComprehensiveRunAnalysis(@Path("id") runId: String): ComprehensiveAnalysisResponse

// CHANGE TO:
@POST("/api/runs/{id}/comprehensive-analysis")
suspend fun getComprehensiveRunAnalysis(
    @Path("id") runId: String,
    @Body request: ComprehensiveAnalysisRequest
): ComprehensiveAnalysisResponse
```

### Step 2: Update RunSummaryViewModel

**File**: `RunSummaryViewModel.kt`

**Location**: `generateAIAnalysis()` function (line 311)

```kotlin
fun generateAIAnalysis() {
    val session = _runSession.value ?: return

    if (hasAnalysis()) return

    viewModelScope.launch {
        _analysisState.value = AiAnalysisState.Loading
        try {
            // Persist self-assessment
            val updateRequest = UpdateRunProgressRequest(
                runId = session.id,
                userComments = _userPostRunComments.value.ifBlank { null },
                strugglePoints = _strugglePoints.value
            )
            try { apiService.updateRunProgress(updateRequest) } catch (_: Exception) {}

            try {
                Log.d("RunSummaryViewModel", "Building AI analysis request with Garmin data...")
                
                // Build Garmin data summary (ONLY if we have data)
                val garminDataSummary = if (session.hasGarminData) {
                    GarminDataSummary(
                        hasGarminData = true,
                        deviceName = session.garminDeviceName,
                        
                        // ONLY include non-null values
                        avgGroundContactTime = session.avgGroundContactTime,
                        avgVerticalOscillation = session.avgVerticalOscillation,
                        avgStrideLength = session.avgStrideLength,
                        avgGroundContactBalance = session.avgGroundContactBalance,
                        avgVerticalRatio = session.avgVerticalRatio,
                        
                        // Training metrics (only if present)
                        aerobicTrainingEffect = session.aerobicTrainingEffect,
                        anaerobicTrainingEffect = session.anaerobicTrainingEffect,
                        recoveryTimeMinutes = session.recoveryTimeMinutes,
                        vo2MaxEstimate = session.vo2MaxEstimate,
                        
                        // Environmental
                        avgAmbientPressure = session.avgAmbientPressure,
                        avgBearing = session.avgBearing,
                        
                        // Terrain summary (computed on phone)
                        terrainSummary = computeTerrainSummary(session)
                    )
                } else {
                    null  // No Garmin data for this run
                }
                
                // Get user profile with "What I know about you"
                val userProfile = try {
                    apiService.getUserProfile(session.userId)
                } catch (e: Exception) {
                    Log.w("RunSummaryViewModel", "Failed to fetch user profile: ${e.message}")
                    null
                }
                
                // Build AI analysis request
                val analysisRequest = ComprehensiveAnalysisRequest(
                    runId = session.id,
                    garminDataSummary = garminDataSummary,
                    userProfile = userProfile
                )
                
                Log.d("RunSummaryViewModel", "Requesting AI analysis for run ${session.id}..." +
                    (if (garminDataSummary != null) " [WITH Garmin data]" else " [NO Garmin data]"))
                
                val response = withTimeout(60_000L) {
                    apiService.getComprehensiveRunAnalysis(session.id, analysisRequest)
                }
                
                Log.d("RunSummaryViewModel", "AI analysis received")
                _analysisState.value = AiAnalysisState.Comprehensive(response.analysis)

                // Save for future loading
                val saveJson = gson.toJsonTree(mapOf(
                    "comprehensive" to true,
                    "analysis" to response.analysis
                ))
                try { apiService.saveRunAnalysis(session.id, SaveRunAnalysisRequest(saveJson)) } 
                catch (_: Exception) {}
                
            } catch (analysisError: Exception) {
                Log.w("RunSummaryViewModel", "Analysis failed: ${analysisError.message}", analysisError)
                _analysisState.value = AiAnalysisState.Error(
                    "AI analysis unavailable. Tap to try again."
                )
            }

        } catch (e: Exception) {
            Log.e("RunSummaryViewModel", "Analysis generation failed: ${e.message}", e)
            _analysisState.value = AiAnalysisState.Error(
                e.message ?: "Failed to generate AI analysis. Tap to try again."
            )
        }
    }
}

// Helper: Compute terrain summary from run session
private fun computeTerrainSummary(session: RunSession): String {
    val gain = session.elevationGain ?: 0
    val loss = session.elevationLoss ?: 0
    
    return when {
        gain == 0 && loss == 0 -> "flat terrain"
        gain > 0 && loss == 0 -> "with ${gain}m elevation gain"
        gain == 0 && loss > 0 -> "with ${loss}m elevation loss"
        else -> "rolling with ${gain}m gain and ${loss}m loss"
    }
}
```

### Step 3: Create Data Models

**File**: `network/model/ComprehensiveAnalysisRequest.kt` (NEW FILE)

```kotlin
package live.airuncoach.airuncoach.network.model

data class ComprehensiveAnalysisRequest(
    val runId: String,
    val garminDataSummary: GarminDataSummary? = null,
    val userProfile: UserProfileForAI? = null
)

data class GarminDataSummary(
    val hasGarminData: Boolean,
    val deviceName: String?,
    
    // Running Dynamics
    val avgGroundContactTime: Float?,
    val avgVerticalOscillation: Float?,
    val avgStrideLength: Float?,
    val avgGroundContactBalance: Float?,
    val avgVerticalRatio: Float?,
    
    // Training
    val aerobicTrainingEffect: Float?,
    val anaerobicTrainingEffect: Float?,
    val recoveryTimeMinutes: Int?,
    val vo2MaxEstimate: Float?,
    
    // Environmental
    val avgAmbientPressure: Float?,
    val avgBearing: Float?,
    
    // Summaries
    val terrainSummary: String?
)

data class UserProfileForAI(
    val userId: String,
    val whatIKnowAboutYou: String,  // The free-text runner description
    val garminInsights: String?,     // NEW: Garmin data insights/trends
    
    // Baseline metrics (only if available)
    val baselineGCT: Float?,
    val baselineVO: Float?,
    val baselineStride: Float?,
    val baselineCadence: Int?,
    val baselineVO2Max: Float?
)
```

### Step 4: Update Backend Claude Prompt

**Backend location**: `/api/runs/{id}/comprehensive-analysis`

**NEW Conditional Prompt Structure**:

```
You are an elite running coach analyzing a run.

## RUN DATA
Distance: 10km
Time: 48 min
Pace: 4:48/km
Elevation: {terrain_summary}

## WHAT I KNOW ABOUT {USER_NAME}
{what_i_know_about_you_text}

{IF GARMIN DATA:}
## GARMIN WATCH METRICS (Device: {deviceName})

### Running Dynamics
Ground Contact Time: {avg_gct}ms (Your baseline: {baseline_gct}ms)
Ground Contact Balance: {avg_gcb}% (Perfectly balanced = 50%)
Vertical Oscillation: {avg_vo}cm (Your baseline: {baseline_vo}cm)
Vertical Ratio: {avg_vr}%
Stride Length: {avg_sl}m (Your baseline: {baseline_sl}m)

### Training Load
Aerobic Effect: {ae_te} (0-5 scale)
Anaerobic Effect: {an_te}
Recovery Time: {rt} hours
VO2 Max Estimate: {vo2}ml/kg/min

### Environmental
Ambient Pressure: {pres}Pa
Average Bearing: {bearing}°

{ENDIF GARMIN}

## ANALYSIS
Based on the data available for this run, provide insights on:

{IF GARMIN DATA:}
1. FORM & EFFICIENCY
   [Analyze GCT, VO, stride, balance against baseline]
2. TRAINING LOAD
   [Interpret TE, recovery, VO2 data]
3. PACE vs EFFORT
   [Analyze pace/HR alignment]
4. ELEVATION RESPONSE
   [How they handled the terrain]
{ELSE:}
1. RUNNING ANALYSIS
   [Analyze pace, distance, time, HR zones (if available)]
{ENDIF}

5. OVERALL ASSESSMENT
   [How this run fits into their profile from "What I know about you"]

IMPORTANT:
- Only provide sections for data you have
- Never hallucinate metrics or insights
- Reference their baseline only when we have both current and baseline
- Make insights personal to them using "What I know about you"
- No blank sections, no missing data speculations
```

### Step 5: Update User Profile Endpoint

**Backend location**: `/api/users/{id}/profile`

**Add new response fields**:

```typescript
interface UserProfileResponse {
  userId: string;
  whatIKnowAboutYou: string;      // Existing
  garminInsights?: string;         // NEW: Last computed Garmin insights
  lastGarminInsightUpdate?: Date;  // When last updated
  
  // Baselines (computed from last 4 weeks)
  baselineGCT?: number;
  baselineVO?: number;
  baselineStride?: number;
  baselineCadence?: number;
  baselineVO2Max?: number;
}
```

---

## "What I Know About You" Updates

### Current Usage
Free-text field that's already in the prompt to personalize coaching.

### Enhancement: Auto-Update with Garmin Insights

After generating AI analysis with Garmin data, extract key insights and append to "What I know about you".

**Example Auto-Update**:

```
[Existing text]
"John is a consistent base-builder who prefers steady-state runs. 
Runs mostly in the morning. Has a background in track."

[Auto-appended from Garmin analysis]
"Ground contact time typically 245-250ms, showing efficient running form. 
Prefers Zone 3 pace of 5:25-5:35/km for steady runs. Strong climber 
(6:30/km pace on hills). Shows good HR control. Last VO2 Max estimate: 58ml/kg/min."
```

**Implementation**:

```kotlin
// After AI analysis is received and displayed
// Extract Garmin insights from Claude response
val garminInsights = extractGarminInsights(claudeResponse, session.hasGarminData)

if (garminInsights.isNotEmpty()) {
    // Update user's "What I know about you" with new insights
    val updateRequest = UpdateUserProfileRequest(
        whatIKnowAboutYou = updateWhatIKnowAboutYou(
            existingProfile = userProfile.whatIKnowAboutYou,
            garminInsights = garminInsights,
            lastInsights = userProfile.garminInsights
        ),
        garminInsights = garminInsights
    )
    try {
        apiService.updateUserProfile(session.userId, updateRequest)
        Log.d("RunSummaryViewModel", "Updated user profile with Garmin insights")
    } catch (e: Exception) {
        Log.w("RunSummaryViewModel", "Failed to update user profile: ${e.message}")
    }
}

private fun extractGarminInsights(response: String, hasGarminData: Boolean): String {
    if (!hasGarminData) return ""
    
    // Extract key insights from Claude response
    // Look for sentences about GCT, VO, stride, TE, baseline comparisons
    // Condense into 2-3 sentences
    
    // Example parsing:
    val insights = mutableListOf<String>()
    
    if (response.contains("ground contact", ignoreCase = true)) {
        // Extract GCT insight
        insights.add("Ground contact time typically ${extractNumber(response, "ground contact")}ms")
    }
    if (response.contains("vertical oscillation", ignoreCase = true)) {
        insights.add("Vertical oscillation around ${extractNumber(response, "oscillation")}cm")
    }
    if (response.contains("stride length", ignoreCase = true)) {
        insights.add("Prefers stride length of ${extractNumber(response, "stride")}m")
    }
    if (response.contains("VO2 Max", ignoreCase = true)) {
        insights.add("Recent VO2 Max estimate: ${extractNumber(response, "VO2")}ml/kg/min")
    }
    
    return insights.joinToString(". ")
}

private fun updateWhatIKnowAboutYou(
    existingProfile: String,
    garminInsights: String,
    lastInsights: String?
): String {
    // If we have Garmin insights already, replace old ones
    // Otherwise append
    
    val baseProfile = if (lastInsights != null) {
        // Remove last Garmin insights
        existingProfile.replace(lastInsights, "").trim()
    } else {
        existingProfile
    }
    
    return if (garminInsights.isNotEmpty()) {
        "$baseProfile\n\n[From Garmin Watch Data] $garminInsights"
    } else {
        baseProfile
    }
}

private fun extractNumber(text: String, keyword: String): String {
    // Simple regex to find numbers near keyword
    val pattern = Regex("$keyword.*?(\\d+\\.?\\d*)", RegexOption.IGNORE_CASE)
    return pattern.find(text)?.groupValues?.get(1) ?: "data"
}
```

---

## Null Safety Rules

### ❌ NEVER DO THIS

```kotlin
// WRONG - passes nulls to AI
val request = ComprehensiveAnalysisRequest(
    runId = runId,
    garminDataSummary = GarminDataSummary(
        hasGarminData = session.hasGarminData,
        deviceName = session.garminDeviceName,
        avgGroundContactTime = session.avgGroundContactTime,  // null!
        avgVerticalOscillation = null,  // null!
        avgStrideLength = null,  // null!
        // ... more nulls
    )
)
```

### ✅ DO THIS INSTEAD

```kotlin
// CORRECT - only pass data we have
val garminDataSummary = if (session.hasGarminData) {
    GarminDataSummary(
        hasGarminData = true,
        deviceName = session.garminDeviceName,
        avgGroundContactTime = session.avgGroundContactTime,  // has value
        avgVerticalOscillation = session.avgVerticalOscillation,  // has value
        avgStrideLength = session.avgStrideLength,  // has value
        // Only include fields that are non-null
        avgGroundContactBalance = session.avgGroundContactBalance,
        avgVerticalRatio = session.avgVerticalRatio,
        aerobicTrainingEffect = session.aerobicTrainingEffect,
        // ... etc
    )
} else {
    null  // No Garmin data, don't create empty summary
}
```

---

## Testing Checklist

### Unit Tests
- [ ] `ComprehensiveAnalysisRequest` serializes correctly
- [ ] `computeTerrainSummary()` produces correct strings
- [ ] `extractGarminInsights()` parses key metrics
- [ ] `updateWhatIKnowAboutYou()` appends without duplication

### Integration Tests
- [ ] Run without Garmin data → prompt has no Garmin section
- [ ] Run with Garmin data → all metrics included
- [ ] Run with partial Garmin data (some nulls) → only non-null fields sent
- [ ] AI response doesn't hallucinate missing sections
- [ ] "What I know about you" updates after Garmin run

### Manual Testing
- [ ] Non-Garmin run analysis works as before
- [ ] Garmin run analysis includes watch metrics
- [ ] No blank sections in AI response
- [ ] Insights mention runner's name/profile
- [ ] Device name appears in analysis

---

## Success Criteria

✅ **No null values in AI prompt** - Only data we have is sent
✅ **Conditional prompt sections** - Garmin sections only when data exists
✅ **Personal to user** - "What I know about you" used throughout
✅ **Auto-updates profile** - Garmin insights appended after analysis
✅ **No hallucinations** - AI only comments on real data
✅ **Backward compatible** - Non-Garmin runs work exactly as before

---

## Timeline
- **Today**: API update + request models (2 hours)
- **Tomorrow**: ViewModel changes + helper functions (3 hours)
- **Day 3**: Backend prompt update + profile endpoint (4 hours)
- **Day 4**: Testing & refinement (2 hours)

**Total Sprint 1: ~11 hours**

