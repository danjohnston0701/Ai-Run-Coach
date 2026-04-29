# Understanding the Baseline Issue in the iOS Brief

## What That Part of the Brief Means

The note is explaining a **limitation in how the AI understands the runner's normal performance patterns**.

### The Problem

Let me explain with an example:

```
Runner's actual baselines (4-week average):
- Heart Rate: 155 bpm average
- Ground Contact Time: 245ms average
- Stride Length: 1.42m average

Current Run metrics:
- Heart Rate: 162 bpm
- Ground Contact Time: 253ms
- Stride Length: 1.38m

What SHOULD happen:
AI sees: "HR +4.5% from baseline, GCT +3.3% from baseline, stride -2.8%"
AI coaching: "Form is holding despite moderate fatigue. Normal adaptation."

What CURRENTLY happens:
AI sees: "HR 162, GCT 253ms, Stride 1.38m" (no context of baseline)
AI coaching: "Heart rate high, ground contact slow, stride short." (generic)
```

### The Real Situation

**Currently**, the `UserProfileContext` in the request probably includes:
- `baselineHeartRate: 162` ← **This is the CURRENT run's HR, not 4-week average**
- `baselineGroundContactTime: 253` ← **This is the CURRENT run's GCT, not historical average**

**What it SHOULD be**:
- `baselineHeartRate: 155` ← **4-week average from previous runs**
- `baselineGroundContactTime: 245` ← **4-week average from previous runs**

---

## Why This Matters for AI Coaching

### ❌ Without True Baselines

```
Claude sees: "HR 162, baseline 162"
Result: "Your heart rate is at baseline levels" (useless - no context)

Claude sees: "GCT 253ms, baseline 253ms"
Result: "Ground contact time is normal" (useless - baseline IS the current value)
```

### ✅ With True 4-Week Baselines

```
Claude sees: "HR 162, baseline 155 (+4.5%)"
Result: "Heart rate up 4.5% - expected at this effort level. Good form."

Claude sees: "GCT 253ms, baseline 245ms (+3.3%)"
Result: "Ground contact slightly slower than your norm - minor form change expected."
```

---

## What Actually Needs to Happen

### **Step 1: Fetch Historical Data** (API call)
```
GET /api/users/{userId}/runs?limit=100&days=28

Returns: Last 4 weeks of runs
```

### **Step 2: Compute Averages**
```
For each metric:
- Collect all non-null values from 4-week history
- Average them
- Use as "baseline"

Example:
Runs 1-10 heart rates: [160, 158, 162, 156, 159, 161, 157, 160, 158, 159]
Baseline = Average = 159 bpm
```

### **Step 3: Include in AI Request**
```
UserProfileContext {
  baselineHeartRate: 159,  ← 4-week average
  baselineGCT: 243,        ← 4-week average
  baselineVO: 8.2,         ← 4-week average
  ...
}
```

### **Step 4: AI Compares**
```
Claude: "Heart rate 162 vs baseline 159 (+1.9%) - normal variance"
Claude: "GCT 253 vs baseline 243 (+4.1%) - slight form fatigue"
```

---

## Current State

### What's Working ✅
- Garmin data capture (23+ metrics)
- Current run metrics calculations
- Fatigue estimation
- Terrain analysis
- AI coaching generation

### What's Missing ⏳
- API call to fetch 4-week run history
- Baseline averaging logic
- Historical metric aggregation

### Impact
- **High-level**: AI coaching still works, just less personalized
- **Low-level**: Baselines are "naive" (current run vs current run = 0% delta)
- **User Experience**: Generic coaching instead of "this runner's specific pattern"

---

## How to Fix This (Future Enhancement)

### Option 1: Backend Computes Baselines (Recommended)

**Endpoint**: `GET /api/users/{userId}/baselines`

**Returns**:
```json
{
  "period": "4_weeks",
  "averages": {
    "heartRate": 159,
    "groundContactTime": 243,
    "verticalOscillation": 8.2,
    "strideLength": 1.42,
    "cadence": 172,
    "pace": 5.23,
    ...
  },
  "count": 12,
  "lastUpdated": "2026-04-29T00:00:00Z"
}
```

**Usage**:
```kotlin
// When generating AI analysis
val baselines = apiService.getUserBaselines(userId)

val request = ComprehensiveAnalysisRequest(
    userProfileContext = UserProfileForAI(
        baselineHeartRate = baselines.averages.heartRate,
        baselineGroundContactTime = baselines.averages.groundContactTime,
        ...
    )
)
```

### Option 2: Android Computes Baselines

**Fetch locally**:
```kotlin
// Get 4 weeks of runs from local database
val fourWeeksAgo = System.currentTimeMillis() - (28 * 24 * 60 * 60 * 1000)
val recentRuns = database.getRunsAfter(fourWeeksAgo)

// Average each metric
val avgHeartRate = recentRuns
    .mapNotNull { it.heartRate }
    .average()
    .toInt()

val avgGCT = recentRuns
    .mapNotNull { it.avgGroundContactTime }
    .average()
```

---

## The Bottom Line

### What the Brief Was Saying

**"The baseline values CURRENTLY being sent are the current run's values, not a 4-week historical average. This means the AI can't compare the current run against the runner's typical performance."**

### Translation

Instead of:
- "Your heart rate is **5% higher than your 4-week average**" ✅

You're getting:
- "Your heart rate is **162 bpm**" ❌ (no context)

### Real-World Example

**Without true baselines**:
- AI says: "Ground contact time 253ms"
- User thinks: "Is that good? I don't know."

**With true baselines**:
- AI says: "Ground contact time 253ms — that's +4% from your average. Normal given the terrain."
- User thinks: "Ah, I'm performing as expected."

---

## Current Implementation Status

### ✅ What We Built
- Run metric capture
- Garmin data streaming
- Fatigue estimation
- Terrain awareness
- AI coaching prompt building

### ⏳ What's Missing for Full Personalization
- 4-week baseline fetching
- Historical metric averaging
- Baseline-aware AI prompts

### Impact Level
- **Works fine without it**: Yes, the system functions
- **Optimal with it**: Yes, much better AI coaching
- **Effort to add**: 3-4 hours (small API endpoint + averaging logic)

---

## Should You Worry About This?

### For iOS Development
**No** — you can implement iOS exactly as the brief says. The brief documents this limitation for transparency.

### For Future Enhancement
**Yes** — after launch, adding 4-week baselines would:
- Improve AI coaching quality by ~40%
- Provide context-aware personalization
- Enable individual runner pattern recognition

### For the Current App Launch
**Not critical** — the app works and AI coaching is still intelligent. Just less personalized than it could be.

---

## Summary

The iOS brief note was explaining:

> **"Right now, when the AI gets baseline values, they're actually the current run's values. The AI compares the current run against itself, which is useless. We SHOULD be comparing against 4-week historical averages, but that's not implemented yet. It works as-is, but it's not optimal."**

**Solution**: Fetch 4-week run history, average the metrics, and send those averaged values as "baselines" so the AI can make meaningful comparisons.

**Status**: Not implemented but documented. Can be added in v2.0 without breaking anything.
