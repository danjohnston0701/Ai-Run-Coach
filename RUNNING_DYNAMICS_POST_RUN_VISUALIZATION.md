# 📊 Running Dynamics: Post-Run Visualization & Analysis Implementation Guide

## Overview

All Garmin running dynamics data is now captured, analyzed during the run, and persisted to the RunSession model. This guide covers:

1. **Live TTS abbreviation expansion** — runners hear "ground contact time" not "GCT"
2. **Post-run AI analysis** — all metrics sent to OpenAI for comprehensive feedback
3. **Visualization implementation** — graphs, data tables, and cards for post-run review

---

## ✅ What's Already Done

### 1. **TTS Abbreviation Expansion** (CoachingAudioQueue.kt)
All live coaching audio now expands abbreviations automatically:

```kotlin
// Before: "Your GCT is 245ms and VO is 7.2cm"
// After: "Your ground contact time is 245 milliseconds and vertical oscillation is 7.2 centimeters"

val expandedText = AbbreviationExpander.expandForSpeech(fallbackText)
tts.speak(expandedText, accent = next.accent, onComplete = onDone)
```

**Expansions include:**
- Metrics: `bpm`, `GCT`, `GCB`, `VO`, `VR`, `SL`, `RR`, etc.
- Units: `km`, `m`, `ms`, `min`, `sec`, `bpm`, `spm`, `%`
- Zones: `z1-z5`, `zone 1-5`, `hr zone`, `ae zone`

**Implementation**: `AbbreviationExpander.kt` with three methods:
- `expandForSpeech(text)` — regex-based full text expansion
- `expandMetric(abbr)` — single metric expansion
- `describeMetric(metric, value)` — human-readable metric descriptions

---

### 2. **Post-Run AI Analysis Data** (AnalysisHelpers.kt)
All running dynamics now included in `ComprehensiveAnalysisRequest`:

```kotlin
// GarminDataSummary now contains:
data class GarminDataSummary(
    // Running Dynamics
    val avgGroundContactTime: Float?
    val avgVerticalOscillation: Float?
    val avgStrideLength: Float?
    // ... 7 more dynamics metrics
    
    // NEW: Power & Respiration
    val avgRunningPower: Int?        // watts
    val maxRunningPower: Int?
    val avgRespirationRate: Float?   // breaths/min
    
    // Training Effect
    val aerobicTrainingEffect: Float?
    val anaerobicTrainingEffect: Float?
    val recoveryTimeMinutes: Int?
    val vo2MaxEstimate: Float?
)
```

**What OpenAI now receives:**
- "Ground contact time averaged 245ms, ranging 220-268ms"
- "Vertical oscillation peaked at 8.1cm during hills"
- "Running power averaged 312 watts, reaching 380W on climbs"
- "Respiration rate ranged 38-52 breaths/min"
- "Aerobic training effect 3.4/5.0 - good tempo session"
- "Recovery time estimate: 32 minutes"

---

## 📋 Implementation Checklist

### Phase 1: ✅ Complete
- [x] Capture all Activity.Info metrics from watch
- [x] Stream to phone (PhoneLink) and backend (DataStreamer)
- [x] Persist to RunSession model
- [x] Send to OpenAI in elite coaching requests (live)
- [x] Send to OpenAI in comprehensive analysis (post-run)
- [x] TTS abbreviation expansion (live coaching)

### Phase 2: In Progress — Post-Run Visualization

#### Running Dynamics Graphs Tab
**Location**: `RunSummaryScreen.kt` → `GraphsTabContent()` (lines 1086-1104)

**To implement**, replace placeholder with actual metric cards:

```kotlin
// ═══════════════════════════════════════════════════════════════════════
// RUNNING DYNAMICS SECTION (when Garmin data available)
// ═══════════════════════════════════════════════════════════════════════

if (run.hasGarminData) {
    stickyHeader {
        GraphSectionHeader(
            title = "Running Dynamics",
            expanded = dynamicsExpanded,
            onToggle = { dynamicsExpanded = !dynamicsExpanded }
        )
    }

    if (dynamicsExpanded) {
        // ── GROUND CONTACT TIME CHART ──
        item {
            MetricCardWithChart(
                title = "Ground Contact Time",
                unit = "milliseconds",
                current = run.groundContactTimeData?.lastOrNull() ?: 0f,
                average = if (run.groundContactTimeData?.isNotEmpty() == true)
                    run.groundContactTimeData.average().toFloat() else null,
                min = run.groundContactTimeData?.minOrNull(),
                max = run.groundContactTimeData?.maxOrNull(),
                data = run.groundContactTimeData ?: emptyList(),
                benchmarkRange = 200f to 300f,  // Efficient: 200-300ms
                benchmark Description = "Efficient runners maintain 200-300ms. Shorter can be overstriding.",
                lineChartColor = Colors.primary
            )
        }

        // ── VERTICAL OSCILLATION CHART ──
        item {
            MetricCardWithChart(
                title = "Vertical Oscillation",
                unit = "centimeters",
                current = run.verticalOscillationData?.lastOrNull() ?: 0f,
                average = if (run.verticalOscillationData?.isNotEmpty() == true)
                    run.verticalOscillationData.average().toFloat() else null,
                min = run.verticalOscillationData?.minOrNull(),
                max = run.verticalOscillationData?.maxOrNull(),
                data = run.verticalOscillationData ?: emptyList(),
                benchmarkRange = 6f to 8f,  // Efficient: 6-8cm
                benchmarkDescription = "Lower is more efficient. >10cm = wasted energy.",
                lineChartColor = Colors.secondary
            )
        }

        // ── STRIDE LENGTH CHART ──
        item {
            MetricCardWithChart(
                title = "Stride Length",
                unit = "meters",
                current = run.strideLengthData?.lastOrNull() ?: 0f,
                average = run.avgStrideLength,
                min = run.minStrideLength,
                max = run.maxStrideLength,
                data = run.strideLengthData?.map { it.toFloat() } ?: emptyList(),
                benchmarkRange = 1.1f to 1.3f,  // Typical 1.1-1.3m
                benchmarkDescription = "Too long = overstriding (braking). Too short = inefficient.",
                lineChartColor = Colors.tertiary
            )
        }

        // ── GROUND CONTACT BALANCE (LEFT/RIGHT) ──
        item {
            BalanceGaugeCard(
                title = "Ground Contact Balance",
                leftPercent = run.groundContactBalanceData?.average()?.toFloat() ?: 50f,
                benchmarkDescription = "50% = perfect symmetry. <48% or >52% = asymmetry warning."
            )
        }

        // ── VERTICAL RATIO CHART ──
        item {
            MetricCardWithChart(
                title = "Vertical Ratio",
                unit = "percent",
                current = run.verticalRatioData?.lastOrNull() ?: 0f,
                average = if (run.verticalRatioData?.isNotEmpty() == true)
                    run.verticalRatioData.average().toFloat() else null,
                data = run.verticalRatioData ?: emptyList(),
                benchmarkRange = 8f to 10f,  // Efficient: 8-10%
                benchmarkDescription = "Oscillation ÷ stride. Lower = more horizontal power.",
                lineChartColor = Colors.accent
            )
        }

        // ── RUNNING POWER CHART (if available) ──
        if (run.runningPowerData?.isNotEmpty() == true) {
            item {
                MetricCardWithChart(
                    title = "Running Power",
                    unit = "watts",
                    current = run.runningPowerData?.lastOrNull()?.toFloat() ?: 0f,
                    average = run.avgRunningPower?.toFloat(),
                    max = run.maxRunningPower?.toFloat(),
                    data = run.runningPowerData?.map { it.toFloat() } ?: emptyList(),
                    benchmarkDescription = "Lower power at same pace = better efficiency. Typical: 200-400W.",
                    lineChartColor = Color(0xFFFF6B35)  // Orange
                )
            }
        }

        // ── RESPIRATION RATE CHART (if available) ──
        if (run.respirationRateData?.isNotEmpty() == true) {
            item {
                MetricCardWithChart(
                    title = "Respiration Rate",
                    unit = "breaths per minute",
                    current = run.respirationRateData?.lastOrNull() ?: 0f,
                    average = if (run.respirationRateData?.isNotEmpty() == true)
                        run.respirationRateData.average().toFloat() else null,
                    data = run.respirationRateData ?: emptyList(),
                    benchmarkDescription = "Easy: 30-35. Tempo: 40-50. VO2 Max: 50-65.",
                    lineChartColor = Color(0xFF4ECDC4)  // Teal
                )
            }
        }

        // ── TRAINING EFFECT & RECOVERY SUMMARY ──
        item {
            TrainingEffectCard(
                aerobicEffect = run.aerobicTrainingEffect,
                anaerobicEffect = run.anaerobicTrainingEffect,
                recoveryTimeMinutes = run.recoveryTimeMinutes,
                vo2MaxEstimate = run.vo2MaxEstimate
            )
        }
    }
}
```

---

#### Data Tab Extensions
**Location**: `RunSummaryScreen.kt` → `DataTabFlagship()` (line 5801)

**Add new sections:**

```kotlin
// ── RUNNING DYNAMICS DATA TABLE ──
if (run.hasGarminData) {
    stickyHeader {
        SectionHeader("Running Dynamics Summary")
    }
    
    item {
        DataTable(
            rows = listOf(
                DataRow("Ground Contact Time (avg)", 
                    "${run.avgGroundContactTime?.toInt()}ms", 
                    "200-300ms efficient"),
                DataRow("GCT Range", 
                    "${run.minGroundContactTime?.toInt()}–${run.maxGroundContactTime?.toInt()}ms"),
                DataRow("Ground Contact Balance", 
                    "${run.avgGroundContactBalance?.toInt()}%", 
                    "50% = perfect"),
                DataRow("Vertical Oscillation (avg)", 
                    "${run.avgVerticalOscillation}cm", 
                    "6-8cm efficient"),
                DataRow("Vertical Oscillation Peak", 
                    "${run.maxVerticalOscillation}cm"),
                DataRow("Vertical Ratio (avg)", 
                    "${run.avgVerticalRatio?.toInt()}%", 
                    "8-10% efficient"),
                DataRow("Stride Length (avg)", 
                    "${String.format("%.2f", run.avgStrideLength)}m"),
                DataRow("Stride Length Range", 
                    "${String.format("%.2f", run.minStrideLength)}–${String.format("%.2f", run.maxStrideLength)}m"),
            )
        )
    }
}

// ── POWER & RESPIRATION DATA TABLE ──
if (run.hasGarminData && (run.avgRunningPower != null || run.avgRespirationRate != null)) {
    stickyHeader {
        SectionHeader("Power & Respiration")
    }
    
    item {
        DataTable(
            rows = listOf(
                run.avgRunningPower?.let { 
                    DataRow("Avg Running Power", "$it watts") 
                },
                run.maxRunningPower?.let { 
                    DataRow("Peak Running Power", "$it watts") 
                },
                run.avgRespirationRate?.let { 
                    DataRow("Avg Respiration Rate", 
                        "${it.toInt()} breaths/min") 
                },
            ).filterNotNull()
        )
    }
}

// ── TRAINING EFFECT DATA TABLE ──
if (run.hasGarminData) {
    stickyHeader {
        SectionHeader("Training Effect & Recovery")
    }
    
    item {
        DataTable(
            rows = listOf(
                run.aerobicTrainingEffect?.let { 
                    DataRow("Aerobic Training Effect", 
                        "${String.format("%.1f", it)}/5.0") 
                },
                run.anaerobicTrainingEffect?.let { 
                    DataRow("Anaerobic Training Effect", 
                        "${String.format("%.1f", it)}/5.0") 
                },
                run.recoveryTimeMinutes?.let { 
                    DataRow("Recovery Time", "$it minutes") 
                },
                run.vo2MaxEstimate?.let { 
                    DataRow("VO2 Max Estimate", 
                        "${String.format("%.1f", it)} ml/kg/min") 
                },
            ).filterNotNull()
        )
    }
}
```

---

#### AI Analysis Tab Enhancements
**Location**: `RunSummaryScreen.kt` → `AiInsightsTabContent()` (line 228)

The AI analysis already receives all Garmin data via `GarminDataSummary`. Examples of insights it could provide:

**Form Analysis:**
- "Your ground contact time is excellent at 245ms — shows efficient stride mechanics. The consistency (220-268ms range) suggests you maintained good form throughout."
- "Vertical oscillation peaked at 8.2cm during the final km — slight form breakdown as fatigue set in, which is normal."

**Breathing Patterns:**
- "Respiration rate stayed 38-42 bpm during the easy section, jumping to 48-52 during the tempo portion. Your breathing pattern matches the intensity perfectly."
- "RR hit 58 bpm briefly on the hill — you were at lactate threshold. Great workout intensity for a tempo day."

**Power Efficiency:**
- "You averaged 312 watts at 5:35/km pace. This is 8% more efficient than your run 3 days ago (340W at same pace) — your body is adapting well."
- "Power remained stable (305-320W) throughout, but pace increased — you're getting stronger. Confidence: +10% from baseline."

**Training Load:**
- "Aerobic training effect 3.4/5.0 — this was a solid aerobic workout, perfect for a Zone 3 base-building session."
- "Recovery time: 32 minutes. Much faster than your typical 48 minutes — light effort really pays off."

---

## 🎨 UI Component Templates

### MetricCardWithChart
```kotlin
@Composable
fun MetricCardWithChart(
    title: String,
    unit: String,
    current: Float,
    average: Float?,
    min: Float? = null,
    max: Float? = null,
    data: List<Float>,
    benchmarkRange: Pair<Float, Float>? = null,
    benchmarkDescription: String? = null,
    lineChartColor: Color = Colors.primary
)
```

### BalanceGaugeCard
```kotlin
@Composable
fun BalanceGaugeCard(
    title: String,
    leftPercent: Float,
    benchmarkDescription: String? = null
)
```

### TrainingEffectCard
```kotlin
@Composable
fun TrainingEffectCard(
    aerobicEffect: Float?,
    anaerobicEffect: Float?,
    recoveryTimeMinutes: Int?,
    vo2MaxEstimate: Float?
)
```

---

## 🔧 File References

### Modified Files:
1. ✅ `AbbreviationExpander.kt` — NEW, TTS expansion
2. ✅ `CoachingAudioQueue.kt` — Uses abbreviation expansion
3. ✅ `ComprehensiveAnalysisRequest.kt` — Added power/respiration fields
4. ✅ `AnalysisHelpers.kt` — buildGarminDataSummary includes new metrics
5. ✅ `EliteCoachingRequest.kt` — Added running dynamics fields for live coaching
6. ✅ `RunTrackingService.kt` — buildBaseEliteRequest populates all metrics

### Files to Update (Phase 2):
1. `RunSummaryScreen.kt` — Add metric card composables (lines 1086-1104)
2. `DataTabFlagship()` — Add running dynamics data tables (line 5801)
3. `ChartsSectionFlagship.kt` — Add new chart builders
4. `AdvancedRunCharts.kt` — Extend with running dynamics cards

---

## 📈 Data Flow Diagram

```
Activity.Info (Garmin Watch)
    ↓
RunView.mc variables
    ↓
PhoneLink.sendRunData() + DataStreamer.sendData()
    ↓
WatchBiometricFrame (raw)
    ↓
RunTrackingService (accumulates, averages)
    ↓
RunSession persistence
    ├─ avgRunningPower, maxRunningPower
    ├─ avgRespirationRate
    ├─ groundContactTimeData[]
    ├─ verticalOscillationData[]
    ├─ strideLengthData[]
    ├─ runningPowerData[]
    └─ respirationRateData[]
    ↓
├─ EliteCoachingRequest (live, during run)
│   └─ OpenAI coaching
│
├─ ComprehensiveAnalysisRequest (post-run)
│   └─ OpenAI post-run analysis
│
└─ RunSummaryScreen visualization
    ├─ GraphsTab (metric charts)
    ├─ DataTab (metric tables)
    └─ AITab (narrative analysis)
```

---

## 🚀 Next Steps

1. **Create base card composables** (`MetricCardWithChart`, `BalanceGaugeCard`, `TrainingEffectCard`)
2. **Implement GraphsTabContent replacements** for running dynamics section
3. **Extend DataTabFlagship()** with running dynamics tables
4. **Test with live Garmin watch data** from a sample run
5. **Refine visualizations** based on user feedback

All data pipelines are ready. Only UI visualization remains.
