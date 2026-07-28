# Aerobic Decoupling — Complete Documentation Index

## 📚 Overview

This index provides comprehensive documentation about the **Aerobic Decoupling** metric in AiRunCoach — how it's calculated, where it appears, what it means, and how to use it.

---

## 🗂️ Documentation Files

### 1. **AEROBIC_DECOUPLING_QUICK_REFERENCE.md** ⭐ START HERE
**Best For**: Quick lookup, athletes, coaches

- What is aerobic decoupling in plain language
- Simple formula (3 steps)
- Color thresholds and what they mean
- Data sources and conditions
- Context-dependent interpretation (by workout type)
- Tips for improvement
- Debugging checklist

**Time to Read**: 5 minutes

---

### 2. **AEROBIC_DECOUPLING_COMPREHENSIVE_GUIDE.md** 🔬 TECHNICAL REFERENCE
**Best For**: Engineers, product managers, comprehensive understanding

Covers all 7 points requested:

1. **Definition & Calculation**
   - Full mathematical formula with variables
   - What each component means
   - Data validation conditions

2. **Composable Source Code**
   - Complete source of `AerobicDecouplingCard()`
   - Line numbers (7363–7477)
   - Well-commented code

3. **UI Location**
   - Screen: RunSummaryScreen
   - Tab: Graphs
   - Card order and layout hierarchy

4. **Exact Data Used**
   - Primary fields: `heartRateData`, `kmSplits`
   - Data processing pipeline
   - Parsing and filtering logic

5. **Color Rules & Design**
   - Complete color palette with hex codes
   - Visual hierarchy and layout
   - Card design elements (corners, borders, spacing)
   - Per-metric styling rules

6. **Thresholds & Reference Values**
   - Quality thresholds (< 3%, 3–5%, 5–8%, ≥ 8%)
   - Individual component thresholds (HR: > 5%, Pace: > 3%)
   - Interpretation guide with recommendations

7. **Early vs Late Computation**
   - Algorithm for splitting data at midpoint
   - Why this approach
   - Example walkthrough

Plus:
- Related metrics (Fatigue, Economy, Race Predictor)
- Data flow diagram
- Testing scenarios
- Coach integration points
- FAQ section
- Code references

**Time to Read**: 30–45 minutes

---

### 3. **AEROBIC_DECOUPLING_VISUAL_EXAMPLES.md** 🎨 VISUAL REFERENCE
**Best For**: Visual learners, designers, testing scenarios

Contains 10 detailed visual sections:

1. **Card Rendering Example** — Full screen layout with all UI elements
2. **Color Coding by Threshold** — Visual spectrum + 4 example cards (Excellent/Good/Moderate/High)
3. **Data Processing Flow Diagram** — Complete pipeline from RunSession to rendered card
4. **Early vs Late Split Examples** — 8 km run and negative split scenarios with numbers
5. **Threshold & Color Mapping Logic** — Decision tree for rating logic
6. **Rendering State Diagram** — Composable lifecycle and early returns
7. **Real-World Example: 10 km Tempo Run** — Complete walkthrough with actual data
8. **Component Hierarchy & Nesting** — Full Compose tree with all elements
9. **Color Hex Codes Reference** — All color definitions with values
10. **Animation & Transition Notes** — Timeline and visual behavior

**Time to Read**: 20 minutes (or just look at relevant diagrams)

---

## 🎯 Quick Navigation by Use Case

### "I'm an Athlete — What Does My Decoupling Score Mean?"
→ Read: **AEROBIC_DECOUPLING_QUICK_REFERENCE.md**
- Focus sections: "What It Means", "Context Matters", "How to Improve"

### "I'm Implementing Features — Show Me the Code"
→ Read: **AEROBIC_DECOUPLING_COMPREHENSIVE_GUIDE.md**
- Focus sections: "The Composable(s) — Full Source", "Exact Data Used", "Thresholds"
- Reference: `RunSummaryScreen.kt:7363–7477`

### "I Need to Debug Why This Isn't Working"
→ Read: **AEROBIC_DECOUPLING_COMPREHENSIVE_GUIDE.md** + **AEROBIC_DECOUPLING_VISUAL_EXAMPLES.md**
- Focus sections: "Data Flow", "Rendering State Diagram", "Debug Checklist"

### "I'm Designing UI Changes — Show Me Visuals"
→ Read: **AEROBIC_DECOUPLING_VISUAL_EXAMPLES.md**
- Focus sections: "Card Rendering Example", "Color Coding", "Component Hierarchy"

### "I'm Training AI Coaches — What's the Context?"
→ Read: **AEROBIC_DECOUPLING_QUICK_REFERENCE.md** + **AEROBIC_DECOUPLING_COMPREHENSIVE_GUIDE.md**
- Focus sections: "Sport Science Context", "Coach Integration", "Interpretation Guide"

---

## 📊 Document Comparison Matrix

| Aspect | Quick Ref | Comprehensive | Visual |
|--------|-----------|---------------|--------|
| Plain Language Intro | ✅ | ✅ | — |
| Mathematical Formulas | — | ✅✅ | — |
| Complete Source Code | — | ✅✅ | — |
| Visual Diagrams | — | — | ✅✅ |
| Color Reference | — | ✅ | ✅ |
| Real Examples | ✅ | ✅ | ✅✅ |
| Code References | ✅ | ✅✅ | — |
| Testing Scenarios | — | ✅ | ✅ |
| Troubleshooting | ✅ | ✅ | ✅ |
| FAQ | — | ✅ | — |
| Length | ~5 min | ~45 min | ~20 min |

---

## 🔑 Key Facts at a Glance

### Definition
**Aerobic Decoupling** = Combined drift of heart rate and pace from first half to second half of run

### Formula
```
decoupling = (HR_drift %) + (pace_drift %)
hrDrift = (HR_2nd - HR_1st) / HR_1st × 100%
paceDrift = (pace_2nd - pace_1st) / pace_1st × 100%
```

### Display Location
- **Screen**: Run Summary (post-run)
- **Tab**: Graphs
- **Card**: "Aerobic Decoupling" with 🔬 emoji

### Data Requirements
- ≥10 heart rate samples (time-series)
- ≥2 km splits (pace per km)

### Color System
| < 3% | 3–5% | 5–8% | ≥ 8% |
|------|------|------|------|
| 🟢 Excellent | 🟢 Good | 🟡 Moderate | 🔴 High |
| Elite fitness | Solid base | Room to grow | Significant fatigue |

### What Improves It
- More Zone 2 easy runs
- Aerobic base building
- Consistent training volume
- Recovery between hard sessions

### How Often Calculated
- **Per run**: Always shown in Graphs tab if data available
- **Aggregated**: Could be trended over weeks (not yet in current UI)

---

## 📍 File Locations in Codebase

```
app/src/main/java/live/airuncoach/airuncoach/
├── ui/screens/
│   └── RunSummaryScreen.kt
│       ├── Line 1640: Composable call
│       ├── Line 5335–5346: parsePaceToSeconds() helper
│       └── Line 7363–7477: AerobicDecouplingCard() full source
│
├── domain/model/
│   └── RunSession.kt
│       ├── Line 69: heartRateData field
│       └── Line 23: kmSplits field
│
└── [Other model files]
    ├── ComprehensiveAnalysisRequest.kt: aerobicTrainingEffect field
    └── UploadRunRequest.kt: aerobicTrainingEffect field
```

---

## 🎓 Related Topics

### In Same UI Card Section
- **Fatigue Curve** — Pace decay across run thirds
- **Running Economy** — Pace per heartbeat efficiency
- **Race Predictor** — Estimated 5K/10K/marathon times

### Related Metrics in App
- **HR Zone Quality** (Ring #2) — Zone distribution quality
- **Consistency Score** (Ring #3) — Pace variation analysis
- **Effort Score** (Ring #1) — Multi-factor effort percentage

### Training Context
- **Zone 2 Training** — Primary method to improve decoupling
- **Aerobic Base** — Fitness foundation that reduces decoupling
- **Cardiac Drift** — Scientific term for HR increase at constant pace

---

## 🛠️ Development Notes

### Calculation Done Client-Side (Android)
- No server processing required
- Uses local RunSession data
- Very fast computation (< 5ms)

### Data Availability
- **Garmin/SmartWatch Data**: Full HR time-series included
- **Manual/Native Runs**: May have limited HR data
- **Fallback**: Card doesn't render if insufficient data

### UI Framework
- **Jetpack Compose** (Kotlin)
- **Material Design 3** colors and shapes
- **Canvas-based** card with text layers

### Performance Considerations
- Calculation cached with `remember {}` blocks
- No animations (static card)
- Suitable for all phone sizes

---

## ✅ Verification Checklist

When reviewing aerobic decoupling implementation:

- [ ] Card only renders when HR data ≥ 10 samples
- [ ] Card only renders when km splits ≥ 2
- [ ] HR drift calculated from time-series data
- [ ] Pace drift calculated from km split pace data
- [ ] Both values shown in UI (not just combined)
- [ ] Decoupling color matches threshold logic
- [ ] Rating badge matches decoupling value
- [ ] Advice text is contextually appropriate
- [ ] Card appears in Graphs tab (not Summary tab)
- [ ] Data sources are heartRateData + kmSplits (not other fields)

---

## 🔄 Update History

| Date | Status | Notes |
|------|--------|-------|
| July 2026 | ✅ Complete | All 7 requirements documented with examples |
| — | — | Comprehensive guide with formulas & code |
| — | — | Visual guide with 10+ diagrams |
| — | — | Quick reference for athletes & coaches |

---

## 📞 Questions & Answers

**Q: Where exactly in the code is the calculation?**
A: `RunSummaryScreen.kt`, lines 7363–7390 (AerobicDecouplingCard function)

**Q: Why isn't my card showing?**
A: You need ≥10 HR samples AND ≥2 km splits. Likely missing Garmin watch data.

**Q: Can I change the color thresholds?**
A: Yes, modify the `when` statement starting at line 7383 in RunSummaryScreen.kt

**Q: How do I trend this over time?**
A: Not yet in UI, but you could add a "Decoupling History" chart in My Data tab

**Q: Is this metric used in AI coaching recommendations?**
A: Currently display-only. Could integrate into `session-coaching-service.ts` for smarter advice.

---

## 📖 Reading Recommendations

### For Different Audiences

**Athlete/Coach**
1. Start: QUICK_REFERENCE.md (5 min)
2. Deep dive: Sections "What It Means", "Context Matters" in COMPREHENSIVE_GUIDE.md

**Product Manager**
1. Start: QUICK_REFERENCE.md overview
2. Then: COMPREHENSIVE_GUIDE.md full walkthrough
3. Reference: VISUAL_EXAMPLES.md for design context

**Software Engineer**
1. Start: COMPREHENSIVE_GUIDE.md "The Composable(s)" section
2. Reference: VISUAL_EXAMPLES.md data flow diagram
3. Code: Line 7363 in RunSummaryScreen.kt

**Designer**
1. Start: VISUAL_EXAMPLES.md card rendering section
2. Reference: Color palette and component hierarchy
3. Verify: Screenshots in QUICK_REFERENCE.md

**QA/Tester**
1. Start: QUICK_REFERENCE.md debug checklist
2. Test scenarios: VISUAL_EXAMPLES.md real-world examples
3. Code paths: COMPREHENSIVE_GUIDE.md data flow

---

## 🎯 Summary

The **Aerobic Decoupling** metric is a sophisticated but simple indicator of aerobic fitness, implemented as a single composable card in the Graphs tab of the Run Summary screen. It measures how well heart rate and pace alignment during a run, with thresholds that align with modern running science.

**Key Takeaway**: Lower decoupling = better aerobic efficiency. Improving this metric requires consistent Zone 2 (easy) running, not hard workouts.

---

**Documentation Created**: July 2026  
**Completeness**: ✅ All 7 requirements fulfilled  
**Total Pages**: 4 markdown files, ~150 KB  
**Audience**: Athletes, Coaches, Engineers, Designers, QA

