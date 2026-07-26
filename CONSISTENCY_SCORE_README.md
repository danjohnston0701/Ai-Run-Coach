# Consistency Score — iOS Implementation Briefs

## Overview

This folder contains **4 comprehensive briefs** that explain how the **Consistency Score** is calculated in Android and what iOS needs to implement to match it.

The consistency score is one of 3 circular metrics displayed in the **Run Summary → Graphs tab**. It's currently showing **0 in iOS** and needs to be fixed.

## Documents Included

### 1. **CONSISTENCY_SCORE_BRIEF_FOR_IOS.md** ⭐ START HERE
- **Purpose**: Quick overview for the iOS team
- **Length**: 2 pages
- **Contains**: Formula, step-by-step calculation, quality tiers, data sources, edge cases
- **Audience**: iOS developers who want the essentials
- **Time to read**: 5-10 minutes

### 2. **CONSISTENCY_SCORE_IMPLEMENTATION_GUIDE.md** 🔧 FOR CODING
- **Purpose**: Complete implementation guide with working code
- **Length**: 4 pages
- **Contains**: Swift code examples, complete function, testing cases, integration points
- **Audience**: iOS developers ready to implement
- **Includes**: Debug tips, data model requirements, color reference
- **Time to read**: 10-15 minutes

### 3. **CONSISTENCY_SCORE_VISUAL_REFERENCE.md** 📊 FOR UNDERSTANDING
- **Purpose**: Visual walkthroughs and real-world examples
- **Length**: 3 pages
- **Contains**: Formula visualization, 6 real-world examples with step-by-step calculations, ring design specs
- **Audience**: Anyone who learns better with examples and diagrams
- **Time to read**: 10 minutes

### 4. **CONSISTENCY_SCORE_QUICK_REFERENCE.md** 🎯 FOR QUICK LOOKUP
- **Purpose**: One-page cheat sheet for quick reference during coding
- **Length**: 1 page
- **Contains**: Formula, tiers, display format, examples, checklist
- **Audience**: Developers who want a desk reference card
- **Time to read**: 2-3 minutes (during implementation)

---

## The Formula (TL;DR)

```
Consistency Score = (1 - CV × 5) × 100%

Where CV = Coefficient of Variation = StdDev / Mean
(Clamped to [0%, 100%])
```

**Data**: km split times (preferred) OR pace data samples (fallback)  
**Quality**: 90%+ = Excellent, 75%+ = Solid, 55%+ = Variable, <55% = Uneven  
**Ring**: Circular metric that fills 0-100% with color indicating quality

---

## Which Document Should I Read?

### "I just want to know how it works"
→ Read **CONSISTENCY_SCORE_BRIEF_FOR_IOS.md** (5 min)

### "I need to implement this in Swift"
→ Read **CONSISTENCY_SCORE_IMPLEMENTATION_GUIDE.md** (15 min) + **QUICK_REFERENCE.md** (at desk)

### "I want to understand with examples"
→ Read **CONSISTENCY_SCORE_VISUAL_REFERENCE.md** (10 min)

### "I need a desk reference while coding"
→ Print **CONSISTENCY_SCORE_QUICK_REFERENCE.md**

### "I want everything"
→ Read all 4 in order (30 min total)

---

## Quick Facts

| Aspect | Details |
|--------|---------|
| **Feature** | Consistency Score (pace evenness) |
| **Location** | Run Summary → Graphs tab (3 circular metrics) |
| **Current Status** | ✅ Working in Android, ❌ Showing 0 in iOS |
| **Data Source** | km split times (≥2) OR pace data (≥10 samples) |
| **Calculation** | Coefficient of Variation based |
| **Range** | 0-100% |
| **Quality Tiers** | 5 levels (Excellent, Solid, Variable, Uneven, No Data) |
| **Complexity** | Low-medium (straightforward statistics) |
| **Testing Difficulty** | Easy (deterministic, testable) |
| **Estimated Implementation Time** | 30-60 minutes |

---

## Android Source Code

The calculation lives in **RunSummaryScreen.kt** at **lines 6772-6793**:

```kotlin
val consistencyFraction: Float? = remember(run.kmSplits, run.paceData) {
    val samples: List<Double> = if (run.kmSplits.size >= 2) {
        run.kmSplits.map { it.time.toDouble() }
    } else {
        val pd = run.paceData?.filter { it > 0 }.orEmpty()
        if (pd.size >= 10) pd else emptyList()
    }
    if (samples.size >= 2) {
        val mean = samples.average()
        val stdDev = sqrt(samples.map { (it - mean).pow(2) }.average())
        val cv = if (mean > 0) stdDev / mean else 0.0
        (1f - (cv * 5f).toFloat()).coerceIn(0f, 1f)
    } else null
}
```

The briefs translate this exact logic to Swift for iOS.

---

## Quality Tier Colors

```
90-100%  🟢 Green    → "Excellent" — Very even pace
75-89%   🟢 Lt.Grn   → "Solid" — Steady pace  
55-74%   🟡 Yellow   → "Variable" — Moderate variation
0-54%    🟠 Orange   → "Uneven" — Significant variation
null     ⚪ Gray/Muted → "No data" — Insufficient data
```

---

## Implementation Checklist

- [ ] Read one of the briefs above
- [ ] Understand the formula and why it works
- [ ] Copy the implementation code from the guide
- [ ] Integrate into your ViewModel/Presenter
- [ ] Connect to the ring UI component
- [ ] Test with the provided test cases
- [ ] Verify scores match Android for same runs
- [ ] Deploy and celebrate consistency! 🎉

---

## Key Points to Remember

✅ **What it measures**: Pace consistency (split-to-split evenness)  
✅ **How it works**: Coefficient of Variation with a 5× scaling factor  
✅ **Data sources**: km splits (preferred) or pace samples (fallback)  
✅ **Range**: 0-100% with 5 quality tiers  

❌ **What it DOESN'T do**: 
- Account for elevation/hills
- Compare to pace targets
- Adjust for terrain difficulty
- Consider effort (only pace variance)

---

## Why These Briefs?

Each document serves a different purpose:

1. **BRIEF_FOR_IOS** — Get you up to speed quickly
2. **IMPLEMENTATION_GUIDE** — Give you working code you can use
3. **VISUAL_REFERENCE** — Help you learn through examples
4. **QUICK_REFERENCE** — Be your desk companion while coding

Together, they ensure no one gets stuck while implementing this feature.

---

## Questions?

- **"How is this different from Android's Effort Score?"** → Effort is multi-factor; Consistency is pure pace variance
- **"Why the CV × 5 multiplier?"** → Empirically chosen to make the scale intuitive (0.01 CV = 95%, 0.15 CV = 25%)
- **"What if there's no data?"** → Show "—" and disable the ring (handled in the guides)
- **"Does elevation affect the score?"** → No, it's purely based on km split times or pace samples

---

## Status

✅ **Android**: Implemented and working (lines 6772-6793 in RunSummaryScreen.kt)  
❌ **iOS**: Currently showing 0 — needs implementation  
📋 **Documentation**: Complete and ready (4 briefs)

**Next Steps**: 
1. iOS team reads one or more briefs
2. iOS implements using the provided code/formula
3. Test against the provided test cases
4. Verify scores match Android
5. Deploy! 🚀

---

**Last Updated**: 2026-07-26  
**For**: iOS Implementation Team  
**Status**: Ready for implementation
