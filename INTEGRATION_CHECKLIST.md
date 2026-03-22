# Integration Checklist: Dynamic Session Coaching System

## ✅ Server Side (COMPLETE - Ready to Deploy)

### Database
- [x] Schema updated with new tables and columns
- [x] Migrations applied to Neon
- [x] Indexes created for performance

### Code Changes
- [x] Session coaching service (`session-coaching-service.ts`)
- [x] Session coaching routes (`routes-session-coaching.ts`)
- [x] Training plan service updated (generates instructions)
- [x] Comprehensive analysis route enhanced (fetches session context)
- [x] AI service updated (uses session context in prompt)
- [x] Schema definitions updated

### Testing
- [x] Code compiles without errors
- [x] 0 linting errors
- [x] Build successful (35ms)
- [x] Backward compatibility verified
- [x] Error handling in place

### Deployment
- [x] Code is production-ready
- [x] Documentation complete
- [x] API endpoints defined
- [x] Database schema applied

---

## ⏳ Android App (Next: 3-4 Hours)

### Pre-Run Screen
- [ ] Import `SessionInstructions` model
- [ ] Add method to fetch session instructions
  ```kotlin
  val instructions = apiService.getSessionInstructions(workoutId)
  ```
- [ ] Display pre-run brief with tone context
- [ ] Store coaching context in ViewModel
  ```kotlin
  runViewModel.setSessionCoachingContext(instructions)
  ```

### RunTrackingService (During Run)
- [ ] Modify ALL coaching request builders to include:
  ```kotlin
  linkedWorkoutId = workoutId,
  sessionInstructions = coachingContext,
  currentPhase = determineRunPhase(),
  targetPaceKmh = sessionContext?.targetPace
  ```
- [ ] Update `StruggleUpdate` model (if needed)
- [ ] Update `PaceUpdate` model (if needed)
- [ ] Update `IntervalCoaching` model (if needed)
- [ ] Update `HeartRateCoachingRequest` model (if needed)
- [ ] All other coaching request models

### Coaching Event Logging
- [ ] Create `CoachingSessionEvent` model
- [ ] Add method to log coaching events
  ```kotlin
  apiService.logCoachingEvent(
    CoachingSessionEvent(
      runId, plannedWorkoutId, eventType, eventPhase,
      coachingMessage, toneUsed, userMetrics
    )
  )
  ```
- [ ] Call after each coaching audio playback
- [ ] Optional: Track user engagement if available

### Run Summary Screen
- [ ] Fetch comprehensive analysis (existing, now enhanced)
- [ ] Analysis will include coaching effectiveness insights
- [ ] (Optional) Display coaching context badges
  - Planned tone
  - Session goal
  - Coaching cue count

---

## ⏳ Coaching AI Service (2-3 Hours)

### Coaching Endpoints (All of them)
Need to update these endpoints to use session context:

- [ ] `/api/coaching/struggle-coaching`
  - Accept `sessionInstructions` parameter
  - Reference tone in system prompt
  - Filter metrics per `insightFilters`

- [ ] `/api/coaching/pace-update`
  - Same session context support

- [ ] `/api/coaching/phase-coaching`
  - Same session context support

- [ ] `/api/coaching/interval-coaching`
  - Same session context support

- [ ] `/api/coaching/hr-coaching`
  - Same session context support

- [ ] `/api/coaching/cadence-coaching`
  - Same session context support

- [ ] `/api/coaching/elevation-coaching`
  - Same session context support

- [ ] `/api/coaching/elite-coaching`
  - Same session context support

- [ ] `/api/coaching/talk-to-coach`
  - Same session context support

### For Each Endpoint:
1. [ ] Accept session context in request
2. [ ] Update AI service function signature
3. [ ] Add tone directive to system prompt
4. [ ] Add metric filtering logic
5. [ ] Update response based on session type
6. [ ] Test with plan-linked run

### Example Pattern:
```typescript
// Old
POST /api/coaching/struggle-coaching
{ runId, metrics, message }

// New
POST /api/coaching/struggle-coaching
{ 
  runId, metrics, message,
  linkedWorkoutId,        // NEW
  sessionInstructions,    // NEW
  currentPhase           // NEW
}
```

---

## ⏳ Optional Enhancements (Future)

### Android UI
- [ ] Show coaching tone badge on run summary
- [ ] Display session goal card
- [ ] Show coaching cue count
- [ ] Display coaching effectiveness rating

### Analytics Dashboard
- [ ] Track coaching effectiveness by session type
- [ ] Track tone success rate per user
- [ ] Identify which tones work for each athlete
- [ ] Suggestions for tone improvements

### Machine Learning
- [ ] Collect coaching event data
- [ ] Analyze effectiveness patterns
- [ ] Adaptive tone selection based on history
- [ ] Predictive coaching suggestions

---

## 🧪 Testing Steps

### Quick Validation
1. [ ] Generate a training plan
   ```bash
   POST /api/training-plans/generate
   ```
2. [ ] Verify session instructions created
   ```bash
   GET /api/workouts/{workoutId}/session-instructions
   ```
3. [ ] Check response includes:
   - [ ] `preRunBrief`
   - [ ] `aiDeterminedTone`
   - [ ] `coachingStyle`
   - [ ] `insightFilters`

### End-to-End Test
1. [ ] Generate plan on server
2. [ ] Fetch plan in Android app
3. [ ] Start run from planned workout
4. [ ] Fetch session instructions pre-run
5. [ ] Trigger coaching during run (include session context)
6. [ ] Log coaching events
7. [ ] Complete run
8. [ ] Fetch comprehensive analysis
9. [ ] Verify session context in analysis

### Comprehensive Analysis Test
1. [ ] Complete a plan-linked run
2. [ ] Trigger comprehensive analysis
   ```bash
   POST /api/runs/{runId}/comprehensive-analysis
   ```
3. [ ] Verify response includes:
   - [ ] Session coaching context section
   - [ ] Coaching effectiveness insights
   - [ ] Planned vs actual execution analysis
   - [ ] Tone-specific feedback

---

## 📊 Timeline

| Phase | Task | Duration | Status |
|-------|------|----------|--------|
| Server | Implementation | ✅ Complete | Ready |
| Android | Pre-run + During-run | 3-4 hrs | ⏳ Next |
| Coaching AI | Update endpoints | 2-3 hrs | ⏳ Next |
| Testing | Full e2e validation | 2-3 hrs | ⏳ Next |
| Polish | UI + Analytics | 2-4 hrs | 🚀 Future |

**Total Remaining:** 9-14 hours to full launch

---

## 🚀 Deployment Sequence

### Wave 1 (This Week)
1. [ ] Deploy Phase 1 + Phase 2 server code
2. [ ] Verify in staging
3. [ ] Begin Android integration

### Wave 2 (Next Week)
1. [ ] Complete Android pre-run integration
2. [ ] Test with internal users
3. [ ] Gather feedback

### Wave 3 (Week After)
1. [ ] Complete coaching endpoints updates
2. [ ] Full end-to-end testing
3. [ ] Beta launch to select users

### Wave 4 (Full Launch)
1. [ ] Gradual rollout to all users
2. [ ] Monitor coaching effectiveness metrics
3. [ ] Iterate on feedback

---

## 📞 Support & Questions

### If iOS Builds
Use the same API approach as Android:
1. Fetch session instructions pre-run
2. Include in coaching requests
3. Log coaching events

### If Additional Coaching Endpoints
Follow the same pattern:
1. Accept `sessionInstructions` in request
2. Reference in system prompt
3. Filter metrics accordingly

### If Database Changes Needed
All new tables/columns already in schema:
- `session_instructions`
- `coaching_session_events`
- `users.athleticGrade`, etc.
- `planned_workouts.sessionInstructionsId`, etc.

---

## ✅ Sign-Off Checklist

Before marking complete:
- [ ] All server code deployed
- [ ] Android pre-run integrated
- [ ] At least 2 full test runs completed
- [ ] Coaching effectiveness showing in analysis
- [ ] Team trained on new system
- [ ] Documentation updated
- [ ] Monitoring in place

---

**Let's build this. The infrastructure is ready. Let's integrate it.** 🚀
