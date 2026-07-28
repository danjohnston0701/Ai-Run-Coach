# Aerobic Decoupling — Quick Reference Card

## 📍 What is it?

**Aerobic Decoupling** measures how well your **heart rate and pace stayed aligned** during a run.
- Low = Good aerobic fitness (HR didn't need to spike to maintain pace)
- High = Fatigue detected (HR increased significantly while pace slowed)

---

## 🧮 The Formula (3 Steps)

```
Step 1: Calculate HR Drift
  hrDrift = (HR_second_half - HR_first_half) / HR_first_half × 100%

Step 2: Calculate Pace Drift  
  paceDrift = (Pace_second_half - Pace_first_half) / Pace_first_half × 100%
  
Step 3: Combine Both
  decoupling = hrDrift + paceDrift
```

**Example**: HR +3%, Pace +2% → Decoupling +5% (GOOD) ✅

---

## 📍 Location in App

| Aspect | Details |
|--------|---------|
| **Screen** | Run Summary (post-run analysis) |
| **Tab** | Graphs |
| **Card** | "Aerobic Decoupling" (after Fatigue Curve) |
| **Shown When** | ≥10 HR samples AND ≥2 km splits |

---

## 🎨 Color Thresholds

| Decoupling | Rating | Color | Meaning |
|-----------|--------|-------|---------|
| < 3% | 🟢 Excellent | Bright Green | Elite aerobic efficiency |
| 3–5% | 🟢 Good | Light Green | Solid aerobic base |
| 5–8% | 🟡 Moderate | Yellow | Room for improvement |
| ≥ 8% | 🔴 High | Red | Significant fatigue |

---

## 📊 Data Used

```
Input: 
  • run.heartRateData     (List<Int>, time-series)
  • run.kmSplits          (List<KmSplit>, per-km pace)

Processing:
  1. Filter invalid HR values (≤ 0)
  2. Parse pace strings ("4:32/km" → 272 seconds)
  3. Split both arrays at midpoint (chronologically)
  4. Average first half vs second half
  5. Calculate % change for each
  6. Sum to get decoupling
```

---

## 💡 What It Means

| Decoupling | Interpretation | Action |
|-----------|-----------------|--------|
| < 3% | **Excellent aerobic efficiency** | Ready for race-pace/tempo work |
| 3–5% | **Strong baseline fitness** | Continue Zone 2 volume |
| 5–8% | **Adequate but room to grow** | Add 1–2 easy runs per week |
| 8–15% | **Some fatigue evident** | Focus on aerobic base building |
| 15%+ | **Significant breakdown** | Take a recovery day; check for overtraining |

---

## 🎯 Context Matters

| Workout Type | Expected Decoupling | Acceptable? |
|--------------|-------------------|------------|
| Easy run (Z1–2) | < 5% | ✅ Ideal target |
| Long run | 5–8% | ✅ Normal (fatigue expected) |
| Tempo/threshold | 8–15% | ✅ Expected (hard effort) |
| VO2 Max intervals | 15–25% | ✅ Normal (high intensity) |
| Recovery run | < 3% | ✅ Gold standard |

---

## 🔧 How to Improve Decoupling

```
Target: Lower decoupling = Better aerobic fitness

✅ DO:
  • Run more Zone 2 easy runs (the "boring" stuff)
  • Build aerobic base with volume
  • Do long, slow distance regularly
  • Trust the process (4–8 weeks to see improvement)

❌ AVOID:
  • Too much high-intensity work without base
  • Skipping easy runs
  • Running all workouts at threshold pace
  • Insufficient recovery between hard days
```

---

## 📈 Trending

**What to Look For**:
- **Improving Decoupling**: Running same pace with lower HR = fitness gain 🎉
- **Worsening Decoupling**: Same pace needs more HR = fatigue or overtraining ⚠️

**How to Track**:
- Screenshot each run's decoupling score
- Build simple spreadsheet over 4 weeks
- Look for downward trend = better aerobic fitness

---

## ❌ When Card Doesn't Show

The card **won't render** if:
- Fewer than 10 HR samples (not enough data)
- Fewer than 2 km splits (can't calculate drift)
- No Garmin watch / HR device used

**Fix**: Use HR-capable device (Garmin, Apple Watch, etc.)

---

## 🔗 Related Metrics (Same Card Row)

| Metric | Measures | Threshold |
|--------|----------|-----------|
| **Fatigue Curve** | Pace decay over run thirds | < 6% = healthy |
| **Aerobic Decoupling** | HR + pace drift alignment | < 5% = good |
| **Running Economy** | Pace per heartbeat | > 5.5 = good |
| **Race Predictor** | 5K/10K/marathon pace estimate | Based on fitness |

---

## 🧠 Quick Interpretation Guide

```
YOUR DECOUPLING SCORE IS... HERE'S WHAT'S HAPPENING:

2.3%  → "Aerobic system is strong — great run."
         ✅ Next: Try a tempo session

4.8%  → "Solid baseline fitness building."
         ✅ Next: Continue easy runs, add volume

6.5%  → "Some fatigue creeping in."
         ⚠️  Next: Focus on easy runs for 2 weeks

10.2% → "Heart rate spiked while pace dropped."
         🔴 Next: Check if intentional hard effort, or take recovery day

15%+  → "Significant breakdown."
         🚨 Next: Easy runs only, consider if overtrained
```

---

## 📋 Debug Checklist

- [ ] Run has ≥10 HR samples? (Garmin sync'd data)
- [ ] Run has ≥2 km splits? (At least 2 km completed)
- [ ] HR values are positive? (Device recording properly)
- [ ] Pace values are in "M:SS/km" format? (Parsed correctly)
- [ ] Card appears in Graphs tab? (Composable rendering)
- [ ] Color matches threshold? (Logic correct)
- [ ] Both drift values show? (HR & pace computed)

---

## 🎓 Sport Science Context

**Industry Standard**:
- Elite runners: 1–3% decoupling in easy runs
- Trained runners: 3–6% in easy runs
- Recreational: 5–10% normal
- Untrained/high intensity: 10–20%+ expected

**Why It Matters**:
- **Aerobic fitness** = ability to sustain pace without HR spike
- **Zone 2 training** (60–70% max HR) improves this metric most
- **Key to longevity** = high aerobic capacity with low HR demand

---

## 📚 File References

| File | Purpose | Lines |
|------|---------|-------|
| `RunSummaryScreen.kt` | Composable implementation | 7363–7477 |
| `RunSummaryScreen.kt` | Pace parsing helper | 5335–5346 |
| `RunSession.kt` | Data model fields | 69, 23 |
| `AEROBIC_DECOUPLING_COMPREHENSIVE_GUIDE.md` | Full technical docs | — |
| `AEROBIC_DECOUPLING_VISUAL_EXAMPLES.md` | Diagrams & examples | — |

---

## 🚀 Tips for Best Results

1. **Use a Garmin watch** (best HR + pace data)
2. **Run at least 5 km** (more data = better analysis)
3. **Easy runs should be **easy**** (Zone 1–2, ~60–70% max HR)
4. **Track over weeks** (individual runs noisy; trends matter)
5. **Focus on aerobic base** (Zone 2 builds decoupling improvements)

---

**Last Updated**: July 2026 | **Status**: Quick reference complete
