# iOS Pre-Run Brief Documentation Index

**Last Updated:** August 4, 2026  
**Status:** Ready for Implementation  
**Target:** Make iOS pre-run brief match Android experience  

---

## The Problem

✅ **Android:** Shows beautiful AI-generated pre-run briefing before every run  
❌ **iOS:** Shows nothing (just a loading spinner)

---

## The Solution

iOS needs to **fetch and display the same pre-run brief** that Android uses. The backend API is ready at `POST /api/briefing` — iOS just needs to call it.

---

## Documentation Files

### 📚 1. **iOS_PRE_RUN_BRIEF_QUICK_START.md** (5 min read)
**Start here if you have limited time!**
- High-level overview
- Copy-paste API request/response
- Simple checklist (5 items)
- Common issues & fixes
- Links to full docs

**Read this first** → ~5 minutes

---

### 📖 2. **iOS_PRE_RUN_BRIEF.md** (Comprehensive Implementation Guide)
**Complete implementation guide with full Swift code examples.**
- Problem statement
- Step-by-step implementation (5 steps)
  - Models (PreRunBrief.swift)
  - API service method
  - ViewModel updates
  - UI component (PreRunBriefView.swift)
  - Integration into pre-run screen
- Full example pre-run screen code
- Android reference implementation
- Testing checklist
- Gotchas to avoid
- Support resources

**Use this during development** → ~1-2 hours implementation

---

### 🔧 3. **iOS_PRE_RUN_BRIEF_API_SPEC.md** (API Contract)
**Complete OpenAPI-style specification for the briefing endpoint.**
- Endpoint summary
- Request schema (all fields documented)
- Response schema (all fields explained)
- 4 complete example request/response pairs
  1. Tempo workout (coached plan)
  2. Easy free run (no route)
  3. Hilly route (with warnings)
  4. Walk activity
- Error response codes
- Field size limits
- Testing with cURL/Postman
- Handling in iOS code

**Use as reference while coding** → Bookmark it!

---

### 🎯 4. **iOS_vs_ANDROID_BRIEF_COMPARISON.md** (Visual Comparison)
**Side-by-side comparison of iOS (broken) vs Android (working).**
- Visual mockups of current state vs. desired state
- Field-by-field comparison table
- Android implementation references (with file line numbers)
- Flow diagrams for Android vs. iOS
- Code line references for Android
- Testing scenarios (3 cases)
- Quality checklist (12 items)

**Use to understand what Android does** → See iOS_PRE_RUN_BRIEF.md

---

## Quick Navigation

### "I want to start implementing RIGHT NOW"
1. Read **iOS_PRE_RUN_BRIEF_QUICK_START.md** (5 min)
2. Read **iOS_PRE_RUN_BRIEF.md** Steps 1-5 (30 min)
3. Implement Models, API, ViewModel, UI (1 hour)
4. Test against API (15 min)
5. ✅ Done

**Total time: ~2 hours**

---

### "I want to understand the full picture first"
1. Read **iOS_vs_ANDROID_BRIEF_COMPARISON.md** (15 min) — understand what's missing
2. Read **iOS_PRE_RUN_BRIEF.md** Introduction (5 min) — see the solution approach
3. Read **iOS_PRE_RUN_BRIEF_API_SPEC.md** (10 min) — understand the API contract
4. Read **iOS_PRE_RUN_BRIEF.md** Implementation Steps (1 hour) — implement step-by-step

**Total time: ~90 minutes of reading + 1-2 hours implementation**

---

### "I just need the API details"
→ Go straight to **iOS_PRE_RUN_BRIEF_API_SPEC.md**

---

### "I need to see Android's implementation for reference"
→ Read **iOS_vs_ANDROID_BRIEF_COMPARISON.md** (has line numbers for Android files)

---

### "I need exact Swift code to copy"
→ Go to **iOS_PRE_RUN_BRIEF.md** Step 1-5 (full code examples)

---

## What Gets Built

By following these docs, you'll create:

### New Files
- `PreRunBrief.swift` — Models for request/response
- `PreRunBriefView.swift` — SwiftUI component

### Modified Files
- Your API service → Add `fetchPreRunBrief()` method
- Your ViewModel → Add briefing state + fetch logic
- Your pre-run screen → Add PreRunBriefView component

### Result
iOS users will see **personalized AI coaching** before every run, just like Android:

```
📱 Pre-Run Screen

  Today's a tempo run at lactate threshold.
  We're doing 20 minutes at a hard but
  sustainable effort. The cloud cover
  means cooler conditions.

  💪 Keep your heart rate in zone 3
     (around 160-170 bpm).

  🌬️ Light wind from the north. Expect
     a headwind on the way back.

  ⚠️ Your body is showing some fatigue.
     Start conservatively and build in.

  📊 You're in good shape for a solid effort.

  🗺️ Final 400m has an 8% gradient — save
     a little for the finish.

  [  START RUN  ]
```

---

## API Overview

**Endpoint:** `POST /api/briefing`  
**Auth:** Bearer token required  
**Input:** Route metrics + weather + coach personality  
**Output:** AI-generated brief + intensity + warnings + audio  

**Backend:** Ready and tested with Android  
**iOS:** Ready to implement with these docs

---

## Implementation Checklist

- [ ] **Day 1 Morning:** Read Quick Start + Comparison (20 min)
- [ ] **Day 1 Morning:** Create PreRunBrief.swift models (15 min)
- [ ] **Day 1 Afternoon:** Add API method to APIService (15 min)
- [ ] **Day 1 Afternoon:** Update ViewModel with briefing state (30 min)
- [ ] **Day 1 Afternoon:** Create PreRunBriefView.swift UI (30 min)
- [ ] **Day 2 Morning:** Integrate into pre-run screen (30 min)
- [ ] **Day 2 Morning:** Manual testing with cURL/Postman (15 min)
- [ ] **Day 2 Afternoon:** Test on simulator (30 min)
- [ ] **Day 2 Afternoon:** Compare side-by-side with Android (15 min)
- [ ] **Day 2 End:** Deploy to TestFlight (10 min)

**Total: ~3-4 hours development + testing**

---

## Common Questions

### Q: Do I need to modify the backend?
**A:** No! The backend API is ready. iOS just needs to call it.

### Q: What if I don't have weather data?
**A:** The API handles missing weather gracefully. Omit it or send null.

### Q: Should I pre-generate audio like Android does?
**A:** Not required. The API can return optional base64 MP3 audio, but iOS can skip it.

### Q: What about the training plan context?
**A:** Include `trainingPlanId`, `workoutType`, etc. if available. The brief will be more personalized.

### Q: Can I test the API before implementing?
**A:** Yes! Use the cURL example in iOS_PRE_RUN_BRIEF_API_SPEC.md

### Q: How do I compare my implementation to Android?
**A:** See the checklist in iOS_vs_ANDROID_BRIEF_COMPARISON.md

---

## File Structure

```
📦 AiRunCoach
├── 📄 iOS_PRE_RUN_BRIEF_DOCS_INDEX.md           ← You are here
├── 📄 iOS_PRE_RUN_BRIEF_QUICK_START.md          ← 5 min overview
├── 📄 iOS_PRE_RUN_BRIEF.md                      ← Full guide (start here)
├── 📄 iOS_PRE_RUN_BRIEF_API_SPEC.md             ← API reference
├── 📄 iOS_vs_ANDROID_BRIEF_COMPARISON.md        ← Visual comparison
│
└── 🚀 Implementation:
    ├── ios/
    │   ├── PreRunBrief.swift                    ← Create (models)
    │   ├── PreRunBriefView.swift                ← Create (UI)
    │   ├── APIService.swift                     ← Modify (add method)
    │   ├── RunSessionViewModel.swift            ← Modify (add state)
    │   └── PreRunScreen.swift                   ← Modify (integrate UI)
```

---

## Success Criteria

✅ Pre-run brief appears on pre-run screen  
✅ Shows all fields (brief, intensity, warnings, readiness, route)  
✅ Displays with emojis matching Android  
✅ Optional audio plays if available  
✅ Gracefully handles missing fields  
✅ Error message shows if API fails  
✅ Side-by-side comparison shows iOS ≈ Android  

---

## Next Steps

1. **Pick your starting point:**
   - Short on time? → Read **QUICK_START.md**
   - Want full context? → Read **iOS_vs_ANDROID_BRIEF_COMPARISON.md**
   - Ready to code? → Read **iOS_PRE_RUN_BRIEF.md**

2. **Implement in order:**
   - Models (PreRunBrief.swift)
   - API method
   - ViewModel
   - UI component
   - Integration

3. **Test:**
   - Verify API call succeeds
   - Check all fields display
   - Compare to Android
   - Handle errors gracefully

4. **Deploy:**
   - TestFlight release
   - Monitor for issues
   - Gather user feedback

---

## Support Resources

- **API issues?** → Check iOS_PRE_RUN_BRIEF_API_SPEC.md examples
- **Swift syntax?** → See code in iOS_PRE_RUN_BRIEF.md Steps 1-5
- **UI layout?** → See PreRunBriefView.swift example
- **Integration?** → See full screen example at end of iOS_PRE_RUN_BRIEF.md
- **Comparison?** → See iOS_vs_ANDROID_BRIEF_COMPARISON.md for reference
- **Testing?** → Use cURL command in iOS_PRE_RUN_BRIEF_API_SPEC.md

---

## TL;DR

**Problem:** iOS pre-run brief is empty  
**Solution:** Call `POST /api/briefing` and display the response  
**Timeline:** 3-4 hours  
**Difficulty:** Easy-Medium (mostly UI work)  

**Start with:** iOS_PRE_RUN_BRIEF.md or iOS_PRE_RUN_BRIEF_QUICK_START.md

---

**Let's make iOS pre-run briefs as good as Android! 🚀**

---

*Generated August 4, 2026 for AI Run Coach project*  
*Backend API ready • iOS implementation docs complete • Ready to build*
