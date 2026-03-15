# AI Coaching Plan - Quick Reference for iOS

**Status**: ✅ Production Ready  
**Complexity**: Medium-High  
**Est. Implementation**: 95 hours (4 weeks)

---

## Quick Facts

| Aspect | Detail |
|--------|--------|
| **Technology** | OpenAI GPT-4 + Drizzle ORM |
| **Database Tables** | 4 main + 1 audit trail |
| **API Endpoints** | 7 core endpoints |
| **Workout Types** | 7 (easy, tempo, intervals, long_run, hill_repeats, recovery, rest) |
| **Plan Duration** | 8-16 weeks |
| **Goals Supported** | 5K, 10K, half-marathon, marathon, ultra |
| **Adaptation Trigger** | After every completed run (auto-reassess) |

---

## Data Model Summary

```
TrainingPlan (parent)
├── WeeklyPlan (8-16 per plan)
│   └── PlannedWorkout (4-7 per week)
│       └── completedRunId (links to runs.id)
└── PlanAdaptation (audit trail)
```

---

## Core Screens Needed

1. **Training Plan List** - Show all plans with progress
2. **Plan Generation Sheet** - Goal/date/experience selection
3. **Weekly Overview** - Show 7 workouts with difficulty
4. **Workout Detail** - Target pace/HR zones/instructions
5. **Completed Workout** - Planned vs Actual comparison
6. **Adaptations Timeline** - Show all AI-made changes

---

## API Endpoints Quick Lookup

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/training-plans/generate` | Create new plan |
| GET | `/training-plans?status=active` | List plans |
| GET | `/training-plans/{id}/weeks/{num}` | Get workouts for week |
| POST | `/training-plans/{id}/workouts/{id}/link-run` | Link completed run |
| GET | `/training-plans/{id}/adaptations` | Get plan changes |
| POST | `/training-plans/{id}/adaptations/{id}/accept` | Approve AI change |
| POST | `/training-plans/{id}/status` | Pause/resume/complete |

---

## Implementation Checklist

### Week 1: UI + Data Models
- [ ] Create data models (TrainingPlan, WeeklyPlan, etc.)
- [ ] Build TrainingPlanAPIClient
- [ ] Design 6 screens (list, generate, weekly, detail, completed, adaptations)
- [ ] Mock API responses for testing
- [ ] Implement TrainingPlanViewModel

### Week 2: API Integration
- [ ] Connect generate endpoint
- [ ] Implement active plans loading
- [ ] Build workout linking flow
- [ ] Add adaptation display
- [ ] Error handling + retry logic

### Week 3: Enhanced Features
- [ ] HR zone calculation from device
- [ ] Performance comparison UI
- [ ] Progress tracking visualization
- [ ] Adaptation acceptance flow
- [ ] Push notifications integration

### Week 4: Polish + Testing
- [ ] Integration testing with backend
- [ ] Performance optimization
- [ ] Accessibility review
- [ ] User testing scenarios
- [ ] App Store submission prep

---

## Key Integration Points

### With Runs Feature
```
When user completes a run:
1. Show dialog: "Link to Training Plan?"
2. List matching planned workouts
3. User selects workout to link
4. Run is marked as completed in plan
5. Refresh plan view with updated progress
```

### With Garmin Feature
```
When run enriched with Garmin data:
1. Update completed workout HR metrics
2. Recalculate performance vs target
3. Trigger plan reassessment in backend
4. Show AI adaptation notification if needed
```

### With Push Notifications
```
Notify user for:
- Plan generated: "Your 16-week marathon plan is ready!"
- Adaptation: "Updated your plan based on performance"
- Week complete: "Great week! You're 3/16 through your plan"
- Milestone: "You've completed 50% of training!"
```

---

## Common Implementation Gotchas

### 1. Timezone Handling
- Plan uses server time (UTC)
- Convert scheduledDate to user's timezone for display
- Store user timezone in preferences

### 2. Week Numbering
- Week 1 starts on Monday or user's preferred day
- Current week calculated from today's date
- Allow skipping/rescheduling workouts

### 3. HR Zones
- Three scenarios: device-based, history-based, effort-based
- Show appropriate UI for each scenario
- For effort-based: show descriptions ("hold a conversation", "hard effort")

### 4. Adaptation Notifications
- Some adaptations are "auto-accepted"
- Some require user approval
- Failed adaptations don't block the app

### 5. Plan Completion
- Gracefully handle early completion (user finished plan faster)
- Show "Congratulations" screen
- Offer next plan generation

---

## Error Scenarios

### Handle These Gracefully

1. **Plan generation fails**
   - Show error message
   - Provide "Try Again" button
   - Log for debugging

2. **Linking run to workout fails**
   - Offer manual linking option
   - Allow user to retry
   - Don't break the run creation flow

3. **Adaptation not available**
   - Show "Updated your plan" but don't require action
   - Still display plan as-is
   - Try fetching again next app launch

4. **No active plans**
   - Show welcome message
   - Big CTA: "Generate My First Plan"
   - Show onboarding flow

---

## Performance Tips

### Caching Strategy
```swift
// Cache downloaded plans for 1 hour
let cachedPlans = UserDefaults.standard.data(forKey: "activeTrainingPlans")

// Refresh on:
// - App launch
// - Manual pull-to-refresh
// - After 1 hour

// Don't refresh:
// - While viewing plan detail
// - While scrolling list
// - During background sync
```

### Data Fetching
```
First Load:
1. Fetch list of plans
2. Load current week (active plan)
3. Load recent adaptations

On Tab Selection:
1. Check if data stale (>1 hour)
2. If stale: refresh in background
3. If fresh: use cached data

On Detail View:
1. Load full week data if not in memory
2. Lazy-load adaptations
```

---

## Testing Checklist

### Manual Testing
- [ ] Generate 5K plan and verify 8-week duration
- [ ] Generate marathon plan and verify 16-week duration
- [ ] Link a run to a planned workout
- [ ] View weekly breakdown with all 7 workouts
- [ ] Check HR zone display for device/history/effort scenarios
- [ ] Accept/reject an adaptation
- [ ] Pause and resume a plan
- [ ] Complete a plan and see "Congratulations" screen

### Automated Testing
- [ ] API client methods all respond correctly
- [ ] Data models decode from JSON without errors
- [ ] ViewModel state updates propagate to UI
- [ ] Error messages display for failed requests
- [ ] Cached data is used when available
- [ ] Stale cache triggers refresh

---

## HR Zone Scenarios Explained

### 1. Device-Based (Best)
```
Requirements:
- Garmin or Apple Watch connected
- Device has HR monitor

Display:
- "Based on your device:"
- "Zone 2: 120-140 bpm"
- Sync heart rate from device
```

### 2. History-Based (Good)
```
Requirements:
- 3+ runs with HR data
- AI calculates zones from history

Display:
- "Based on your running history:"
- "Zone 3: 150-165 bpm"
- Updates as user runs more
```

### 3. Effort-Based (Default)
```
Requirements:
- None, always available

Display:
- "Effort level: Moderate"
- "You should be able to hold a conversation"
- "Comfortably fast but not racing pace"
```

---

## Code Snippets

### Loading Plans
```swift
@MainActor
class TrainingPlanViewModel: ObservableObject {
    func loadActivePlans() async {
        isLoading = true
        do {
            let plans = try await apiClient.getActivePlans()
            self.activePlans = plans
            if let first = plans.first {
                self.currentPlan = first
                await loadWeek(first.currentWeek)
            }
        } catch {
            self.error = "Failed to load plans"
        }
        isLoading = false
    }
}
```

### Linking a Run
```swift
func linkRunToWorkout(_ runId: String, _ workoutId: String) async {
    guard let planId = currentPlan?.id else { return }
    
    do {
        try await apiClient.linkRunToWorkout(
            planId: planId,
            workoutId: workoutId,
            runId: runId
        )
        // Reload week to show updated workout
        await loadWeek(currentPlan?.currentWeek ?? 1)
        showSuccess("Run linked to workout!")
    } catch {
        showError("Failed to link run")
    }
}
```

### Handling Adaptation
```swift
func acceptAdaptation(_ id: String) async {
    guard let planId = currentPlan?.id else { return }
    
    do {
        try await apiClient.respondToAdaptation(
            planId: planId,
            adaptationId: id,
            accepted: true
        )
        // Refresh adaptations list
        await loadAdaptations()
        showNotification("Plan updated based on AI analysis")
    } catch {
        showError("Failed to accept adaptation")
    }
}
```

---

## Metrics to Track

### User Engagement
- % of users who generate a plan
- Average plan completion rate
- Time from plan generation to first linked run
- Number of adaptations per plan

### Plan Performance
- Success rate by goal type (5K vs marathon)
- Average plan adherence rate
- Most common adaptation reasons
- User satisfaction with AI adjustments

### Technical Performance
- API response times
- Plan generation latency (should be <5 sec)
- Cache hit rate
- Error rate on linking runs

---

## Next Steps

1. **Download Full Documentation**
   - `AI_COACHING_PLAN_SUMMARY.md` (1,000+ lines)
   - Contains full API details, code examples, architecture

2. **Kickoff Meeting**
   - Clarify any questions with backend team
   - Align on UI/UX approach
   - Decide on development timeline

3. **Start Development**
   - Week 1: Data models + basic UI
   - Week 2: API integration
   - Week 3: Advanced features
   - Week 4: Polish + testing

4. **Coordinate With**
   - Runs feature team (for linking)
   - Garmin team (for HR zones)
   - Notifications team (for alerts)

---

## Support

**Backend Lead**: Responsible for API endpoints + AI reassessment  
**iOS Lead**: Responsible for UI/UX + app integration  
**QA Lead**: Responsible for testing + validation

All questions should be tracked in GitHub issues labeled `coaching-plan`.
