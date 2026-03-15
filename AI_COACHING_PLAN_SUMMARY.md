# AI Coaching Plan Feature - Complete Summary for iOS Implementation

**Status**: ✅ Fully implemented and production-ready on Android  
**Last Updated**: March 15, 2026  
**For**: iOS Development Team

---

## Executive Summary

The **AI Coaching Plan** feature generates personalized, adaptive training plans using GPT-4 AI. Plans automatically adjust based on actual run performance, creating a dynamic coaching experience that learns and improves over time.

### Key Differentiators
- 🤖 **AI-Powered**: OpenAI GPT-4 generates plans tailored to each runner
- 📊 **Adaptive**: Plans automatically adjust based on performance
- 💪 **Intelligent**: Detects over-training, under-training, and progress
- 📱 **Device-Aware**: Integrates with Garmin/connected devices
- 🎯 **Goal-Oriented**: Supports 5K, 10K, half-marathon, marathon, ultra
- 📈 **Progressive**: Gradually increases volume and intensity

---

## Feature Overview

### What Users Can Do

1. **Generate Plans**
   - Select goal (5K, 10K, half-marathon, marathon, ultra)
   - Set target date and experience level
   - Choose training frequency (3-7 days/week)
   - Customize regular sessions (commute runs, etc.)
   - Get instant AI-generated 8-16 week plan

2. **Follow Plans**
   - View weekly breakdown with focus areas
   - See daily workouts with target pace/HR zones
   - Get coaching hints for each session
   - Log completed runs to link with plan

3. **Monitor Progress**
   - Track plan completion rate
   - See fitness progression (CTL/TSS)
   - View plan adherence metrics
   - Get AI insights on performance

4. **Experience Adaptation**
   - Plan automatically adjusts when user falls behind
   - Intensity reduced if over-training detected
   - Increased challenge if ahead of schedule
   - Recovery weeks added proactively
   - All changes tracked in audit trail

---

## Technical Architecture

### Database Schema

#### 1. **trainingPlans** (Main Plan Record)
```sql
id: UUID (Primary Key)
userId: UUID (Foreign Key → users)
goalType: TEXT ('5k' | '10k' | 'half_marathon' | 'marathon' | 'ultra')
targetDistance: REAL (km)
targetTime: INTEGER (seconds) — Optional, for time-based goals
targetDate: TIMESTAMP
currentWeek: INTEGER (1-16, tracks progress)
totalWeeks: INTEGER (8-16 weeks depending on plan)
experienceLevel: TEXT ('beginner' | 'intermediate' | 'advanced')
weeklyMileageBase: REAL (km) — Baseline from recent runs
daysPerWeek: INTEGER (3-7)
includeSpeedWork: BOOLEAN
includeHillWork: BOOLEAN
includeLongRuns: BOOLEAN
status: TEXT ('active' | 'completed' | 'paused')
aiGenerated: BOOLEAN (always true for now)
createdAt: TIMESTAMP
completedAt: TIMESTAMP (when plan finishes or is abandoned)
```

#### 2. **weeklyPlans** (Weekly Breakdown)
```sql
id: UUID
trainingPlanId: UUID (Foreign Key)
weekNumber: INTEGER (1-16)
weekDescription: TEXT (e.g., "Base Building - Aerobic Foundation")
totalDistance: REAL (km for entire week)
totalDuration: INTEGER (seconds for entire week)
focusArea: TEXT ('endurance' | 'speed' | 'recovery' | 'race_prep')
intensityLevel: TEXT ('easy' | 'moderate' | 'hard')
createdAt: TIMESTAMP
```

#### 3. **plannedWorkouts** (Individual Sessions)
```sql
id: UUID
weeklyPlanId: UUID (Foreign Key)
trainingPlanId: UUID (Foreign Key)
dayOfWeek: INTEGER (0=Sunday, 6=Saturday)
scheduledDate: TIMESTAMP (when this workout is due)
workoutType: TEXT (see enum below)
distance: REAL (km target)
duration: INTEGER (seconds target)
targetPace: TEXT (e.g., "5:30/km")
intensity: TEXT ('z1' | 'z2' | 'z3' | 'z4' | 'z5') — Heart Rate Zone
hrZoneNumber: INTEGER (1-5)
hrZoneMinBpm: INTEGER (calculated from age + device)
hrZoneMaxBpm: INTEGER
hrZoneScenario: TEXT ('device' | 'history' | 'effort')
effortDescription: TEXT (for effort-based: "easy jog", "hold convo", etc.)
description: TEXT (AI-generated workout description)
instructions: TEXT (detailed coaching tips)
isCompleted: BOOLEAN
completedRunId: UUID (Foreign Key → runs, when user links a run)
createdAt: TIMESTAMP
```

#### 4. **planAdaptations** (Audit Trail of Changes)
```sql
id: UUID
trainingPlanId: UUID (Foreign Key)
adaptationDate: TIMESTAMP
reason: TEXT ('missed_workout' | 'injury' | 'over_training' | 'ahead_of_schedule' | 'user_request')
changes: JSONB (what was changed: {"week_3": "reduced_volume_20%", "added_recovery_day": true})
aiSuggestion: TEXT (why the change was made)
userAccepted: BOOLEAN (did user approve?)
createdAt: TIMESTAMP
```

### Workout Types

Plans use 7 core workout types:

| Type | Purpose | HR Zone | Effort |
|------|---------|---------|--------|
| **easy** | Recovery, aerobic base | Z1-Z2 | Comfortable, easy to talk |
| **tempo** | Threshold work, lactate clearance | Z3 | Uncomfortable, short phrases |
| **intervals** | VO2 Max, speed | Z4-Z5 | Hard, can't talk |
| **long_run** | Endurance, aerobic capacity | Z2-Z3 | Steady, conversational |
| **hill_repeats** | Strength, power | Z4-Z5 | Hard uphill efforts |
| **recovery** | Active recovery | Z1 | Very easy, feels effortless |
| **rest** | Complete rest day | — | No running |

---

## API Endpoints

### 1. Generate Training Plan
```
POST /api/training-plans/generate
Content-Type: application/json
Authorization: Bearer {token}

{
  "goalType": "marathon",                          // Required: 5k, 10k, half_marathon, marathon, ultra
  "targetDistance": 42.195,                        // Required: km
  "targetTime": 10800,                             // Optional: seconds (e.g., 3 hours)
  "targetDate": "2026-06-15",                      // Required: ISO date
  "experienceLevel": "intermediate",               // Required: beginner, intermediate, advanced
  "daysPerWeek": 5,                                // Optional, default: 4
  "includeSpeedWork": true,                        // Optional, default: true
  "includeHillWork": true,                         // Optional, default: true
  "includeLongRuns": true,                         // Optional, default: true
  "regularSessions": [                             // Optional: recurring training
    {
      "name": "Commute Run",
      "dayOfWeek": 2,                              // Tuesday
      "timeHour": 7,
      "timeMinute": 0,
      "distanceKm": 5.5,
      "countsTowardWeeklyTotal": true
    }
  ],
  "firstSessionStart": "tomorrow"                  // Optional: today, tomorrow, flexible
}

Response: {
  "planId": "plan-uuid",
  "goalType": "marathon",
  "targetDate": "2026-06-15",
  "totalWeeks": 16,
  "weeklyPlans": [
    {
      "weekNumber": 1,
      "weekDescription": "Base Building - Aerobic Foundation",
      "focusArea": "endurance",
      "totalDistance": 32.5,
      "workouts": [
        {
          "id": "workout-uuid",
          "dayOfWeek": 0,
          "workoutType": "easy",
          "distance": 6.5,
          "targetPace": "6:00/km",
          "instructions": "Focus on aerobic base..."
        },
        ...
      ]
    },
    ...
  ],
  "createdAt": "2026-03-15T19:30:00Z"
}
```

**Response Codes**:
- `201 Created` - Plan generated successfully
- `400 Bad Request` - Invalid parameters
- `401 Unauthorized` - User not authenticated
- `500 Server Error` - AI generation failed

---

### 2. Get Active Plans
```
GET /api/training-plans?status=active
Authorization: Bearer {token}

Response: {
  "plans": [
    {
      "id": "plan-uuid",
      "goalType": "marathon",
      "targetDate": "2026-06-15",
      "currentWeek": 3,
      "totalWeeks": 16,
      "status": "active",
      "weeklyPlans": [ ... ],
      "createdAt": "2026-03-01T10:00:00Z"
    }
  ]
}
```

---

### 3. Get Weekly Workouts
```
GET /api/training-plans/{planId}/weeks/{weekNumber}
Authorization: Bearer {token}

Response: {
  "weekNumber": 3,
  "weekDescription": "Building Volume - Endurance Focus",
  "totalDistance": 38.2,
  "focusArea": "endurance",
  "intensityLevel": "moderate",
  "workouts": [
    {
      "id": "workout-uuid",
      "dayOfWeek": 0,
      "scheduledDate": "2026-03-16",
      "workoutType": "easy",
      "distance": 6.0,
      "duration": 2160,
      "targetPace": "6:00/km",
      "intensity": "z2",
      "hrZoneMinBpm": 120,
      "hrZoneMaxBpm": 140,
      "description": "Easy recovery run...",
      "instructions": "Keep effort conversational...",
      "isCompleted": false,
      "completedRunId": null
    },
    ...
  ]
}
```

---

### 4. Link Completed Run to Workout
```
POST /api/training-plans/{planId}/workouts/{workoutId}/link-run
Content-Type: application/json
Authorization: Bearer {token}

{
  "runId": "run-uuid"
}

Response: {
  "workoutId": "workout-uuid",
  "isCompleted": true,
  "completedRunId": "run-uuid",
  "actualDistance": 6.2,
  "actualDuration": 2145,
  "actualPace": "5:47/km",
  "performance": {
    "versus_target": "100%+",
    "feedback": "Great job! You ran faster and farther than planned."
  }
}
```

---

### 5. Get Plan Adaptations
```
GET /api/training-plans/{planId}/adaptations
Authorization: Bearer {token}

Response: {
  "adaptations": [
    {
      "id": "adaptation-uuid",
      "adaptationDate": "2026-03-14T18:00:00Z",
      "reason": "over_training",
      "changes": {
        "week_4": "reduced_volume_20%",
        "added_recovery_day": true,
        "reduced_intensity": "z3 → z2"
      },
      "aiSuggestion": "Your heart rate has been elevated and recovery is slow. I've reduced this week's volume by 20% and added a recovery day.",
      "userAccepted": true
    }
  ]
}
```

---

### 6. Accept/Reject Adaptation
```
POST /api/training-plans/{planId}/adaptations/{adaptationId}/accept
Authorization: Bearer {token}

{
  "accepted": true
}

Response: {
  "adaptationId": "adaptation-uuid",
  "userAccepted": true,
  "appliedAt": "2026-03-14T18:05:00Z"
}
```

---

### 7. Pause/Resume/Complete Plan
```
POST /api/training-plans/{planId}/status
Content-Type: application/json
Authorization: Bearer {token}

{
  "status": "paused"  // "active", "paused", "completed"
}

Response: {
  "planId": "plan-uuid",
  "status": "paused",
  "statusChangedAt": "2026-03-15T20:00:00Z"
}
```

---

## Implementation Guide for iOS

### Phase 1: UI Screens (Week 1)

#### 1.1 Training Plan List Screen
- Shows all active/completed plans
- Displays goal, target date, progress (X of Y weeks)
- Shows current week's mileage vs plan
- CTA: "Generate New Plan" button

#### 1.2 Plan Generation Sheet
- Goal selection (5K → Ultra)
- Target date picker
- Experience level selector
- Training frequency slider (3-7 days/week)
- Optional: Regular sessions configuration
- CTA: "Generate My Plan" button

#### 1.3 Weekly Overview Screen
- Week number and focus area
- Total distance and duration for week
- List of 7 workout types with descriptions
- Visual intensity graph (easy → hard → easy progression)
- Toggle: "Expand all workouts"

#### 1.4 Daily Workout Detail Screen
- Workout type badge (easy, tempo, intervals, etc.)
- Target metrics:
  - Distance (km)
  - Duration (time)
  - Pace (min/km)
  - HR Zone (Z1-Z5 with BPM range)
- Coaching instructions from AI
- "Mark as Completed" button or "Link Completed Run"
- Status indicator (not started, in progress, completed, skipped)

#### 1.5 Completed Workout Screen
- Comparison: Planned vs Actual
  - Distance: 6.0 km → 6.2 km ✅
  - Pace: 6:00/km → 5:47/km ✅
  - Duration: 36:00 → 34:50 ✅
- AI feedback: "Great effort! You ran faster than planned."
- Option to view full run details
- Option to edit/unlink run

#### 1.6 Adaptations Screen
- Timeline of all plan adjustments
- Each card shows:
  - Reason (over-training, ahead of schedule, etc.)
  - What changed (volume -20%, added recovery day, etc.)
  - AI explanation
  - User acceptance status
  - "Accept" / "Reject" buttons (if pending)

### Phase 2: Data Model (Week 1)

```swift
// MARK: - Training Plan Models

struct TrainingPlan: Codable, Identifiable {
    let id: String
    let userId: String
    let goalType: GoalType
    let targetDistance: Double // km
    let targetTime: Int? // seconds
    let targetDate: Date
    let currentWeek: Int
    let totalWeeks: Int
    let experienceLevel: ExperienceLevel
    let weeklyMileageBase: Double
    let daysPerWeek: Int
    let includeSpeedWork: Bool
    let includeHillWork: Bool
    let includeLongRuns: Bool
    let status: PlanStatus
    let weeklyPlans: [WeeklyPlan]
    let createdAt: Date
    let completedAt: Date?
}

enum GoalType: String, Codable {
    case fiveK = "5k"
    case tenK = "10k"
    case halfMarathon = "half_marathon"
    case marathon = "marathon"
    case ultra = "ultra"
}

enum ExperienceLevel: String, Codable {
    case beginner, intermediate, advanced
}

enum PlanStatus: String, Codable {
    case active, completed, paused
}

struct WeeklyPlan: Codable, Identifiable {
    let id: String
    let trainingPlanId: String
    let weekNumber: Int
    let weekDescription: String
    let totalDistance: Double
    let totalDuration: Int // seconds
    let focusArea: FocusArea
    let intensityLevel: IntensityLevel
    let workouts: [PlannedWorkout]
}

enum FocusArea: String, Codable {
    case endurance, speed, recovery, racePreperty
}

enum IntensityLevel: String, Codable {
    case easy, moderate, hard
}

struct PlannedWorkout: Codable, Identifiable {
    let id: String
    let weeklyPlanId: String
    let trainingPlanId: String
    let dayOfWeek: Int // 0=Sunday
    let scheduledDate: Date
    let workoutType: WorkoutType
    let distance: Double? // km
    let duration: Int? // seconds
    let targetPace: String? // "5:30/km"
    let intensity: HeartRateZone? // z1-z5
    let hrZoneNumber: Int?
    let hrZoneMinBpm: Int?
    let hrZoneMaxBpm: Int?
    let hrZoneScenario: HRZoneScenario?
    let effortDescription: String?
    let description: String
    let instructions: String
    let isCompleted: Bool
    let completedRunId: String?
    let createdAt: Date
}

enum WorkoutType: String, Codable {
    case easy, tempo, intervals
    case longRun = "long_run"
    case hillRepeats = "hill_repeats"
    case recovery, rest
}

enum HeartRateZone: String, Codable {
    case z1, z2, z3, z4, z5
}

enum HRZoneScenario: String, Codable {
    case device, history, effort
}

struct PlanAdaptation: Codable, Identifiable {
    let id: String
    let trainingPlanId: String
    let adaptationDate: Date
    let reason: AdaptationReason
    let changes: [String: String]
    let aiSuggestion: String
    let userAccepted: Bool
}

enum AdaptationReason: String, Codable {
    case missedWorkout = "missed_workout"
    case injury
    case overTraining = "over_training"
    case aheadOfSchedule = "ahead_of_schedule"
    case userRequest = "user_request"
}
```

### Phase 3: API Client Methods (Week 1-2)

```swift
// MARK: - Training Plan API

class TrainingPlanAPIClient {
    private let apiService: APIService
    
    // Generate new training plan
    func generateTrainingPlan(
        goalType: GoalType,
        targetDistance: Double,
        targetDate: Date,
        experienceLevel: ExperienceLevel,
        targetTime: Int? = nil,
        daysPerWeek: Int = 4,
        includeSpeedWork: Bool = true,
        includeHillWork: Bool = true,
        includeLongRuns: Bool = true
    ) async throws -> TrainingPlan {
        let request = GeneratePlanRequest(
            goalType: goalType.rawValue,
            targetDistance: targetDistance,
            targetDate: ISO8601DateFormatter().string(from: targetDate),
            experienceLevel: experienceLevel.rawValue,
            targetTime: targetTime,
            daysPerWeek: daysPerWeek,
            includeSpeedWork: includeSpeedWork,
            includeHillWork: includeHillWork,
            includeLongRuns: includeLongRuns
        )
        
        return try await apiService.post(
            "/training-plans/generate",
            body: request,
            responseType: TrainingPlan.self
        )
    }
    
    // Get active plans
    func getActivePlans() async throws -> [TrainingPlan] {
        let response = try await apiService.get(
            "/training-plans?status=active",
            responseType: [String: [TrainingPlan]].self
        )
        return response["plans"] ?? []
    }
    
    // Get weekly workouts
    func getWeeklyWorkouts(
        planId: String,
        weekNumber: Int
    ) async throws -> WeeklyPlan {
        return try await apiService.get(
            "/training-plans/\(planId)/weeks/\(weekNumber)",
            responseType: WeeklyPlan.self
        )
    }
    
    // Link completed run to workout
    func linkRunToWorkout(
        planId: String,
        workoutId: String,
        runId: String
    ) async throws {
        let request = ["runId": runId]
        try await apiService.post(
            "/training-plans/\(planId)/workouts/\(workoutId)/link-run",
            body: request
        )
    }
    
    // Get plan adaptations
    func getAdaptations(planId: String) async throws -> [PlanAdaptation] {
        let response = try await apiService.get(
            "/training-plans/\(planId)/adaptations",
            responseType: [String: [PlanAdaptation]].self
        )
        return response["adaptations"] ?? []
    }
    
    // Accept/reject adaptation
    func respondToAdaptation(
        planId: String,
        adaptationId: String,
        accepted: Bool
    ) async throws {
        let request = ["accepted": accepted]
        try await apiService.post(
            "/training-plans/\(planId)/adaptations/\(adaptationId)/accept",
            body: request
        )
    }
    
    // Update plan status
    func updatePlanStatus(
        planId: String,
        status: PlanStatus
    ) async throws {
        let request = ["status": status.rawValue]
        try await apiService.post(
            "/training-plans/\(planId)/status",
            body: request
        )
    }
}
```

### Phase 4: ViewModel Implementation (Week 2)

```swift
@MainActor
class TrainingPlanViewModel: ObservableObject {
    @Published var activePlans: [TrainingPlan] = []
    @Published var currentPlan: TrainingPlan?
    @Published var currentWeek: WeeklyPlan?
    @Published var adaptations: [PlanAdaptation] = []
    @Published var isLoading = false
    @Published var error: String?
    
    private let apiClient: TrainingPlanAPIClient
    
    init(apiClient: TrainingPlanAPIClient) {
        self.apiClient = apiClient
    }
    
    func loadActivePlans() async {
        isLoading = true
        do {
            activePlans = try await apiClient.getActivePlans()
            if let firstPlan = activePlans.first {
                currentPlan = firstPlan
                await loadWeek(firstPlan.currentWeek)
                await loadAdaptations()
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
    
    func generatePlan(
        goalType: GoalType,
        targetDistance: Double,
        targetDate: Date,
        experienceLevel: ExperienceLevel
    ) async {
        isLoading = true
        do {
            let newPlan = try await apiClient.generateTrainingPlan(
                goalType: goalType,
                targetDistance: targetDistance,
                targetDate: targetDate,
                experienceLevel: experienceLevel
            )
            currentPlan = newPlan
            activePlans.append(newPlan)
            await loadWeek(1)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
    
    func loadWeek(_ weekNumber: Int) async {
        guard let planId = currentPlan?.id else { return }
        isLoading = true
        do {
            currentWeek = try await apiClient.getWeeklyWorkouts(
                planId: planId,
                weekNumber: weekNumber
            )
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
    
    func loadAdaptations() async {
        guard let planId = currentPlan?.id else { return }
        do {
            adaptations = try await apiClient.getAdaptations(planId: planId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
    
    func linkRunToWorkout(workoutId: String, runId: String) async {
        guard let planId = currentPlan?.id else { return }
        isLoading = true
        do {
            try await apiClient.linkRunToWorkout(
                planId: planId,
                workoutId: workoutId,
                runId: runId
            )
            // Reload week data to show updated workout
            await loadWeek(currentPlan?.currentWeek ?? 1)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}
```

---

## How AI Adaptation Works

### The Reassessment Process

After every completed run, the backend automatically:

1. **Collects Data**
   - User profile (age, fitness level, current CTL)
   - Plan details (goal, progress, weeks remaining)
   - Recent runs (last 10 completions)
   - New completed run data (distance, pace, HR, elevation)

2. **Evaluates Performance**
   - Is user ahead/behind schedule?
   - Over-training signals? (elevated HR, slow recovery, low compliance)
   - Under-training signals? (easy runs feeling too easy, consistently beating targets)
   - Injury indicators? (sudden pace drop, increased perceived effort)

3. **AI Decision** (GPT-4)
   - Analyzes user performance against plan
   - Determines if adjustments needed
   - Generates specific changes with reasoning
   - Suggests when/how to adapt

4. **User Experience**
   - If changes needed: Push notification alerts user
   - User reviews proposed changes
   - Can accept automatically or review details
   - Changes appear in next workout or current week

### Example Adaptation Scenarios

**Scenario 1: Over-Training Detection**
```
AI Analysis:
- User completed 5 of 5 workouts this week
- Average HR elevated 10 bpm above target
- Recovery runs completed at faster pace than planned
- Resting HR 5 bpm higher than baseline

Action:
- Reduce week 4 volume by 20%
- Convert 2 tempo workouts to easy
- Add extra recovery day
- Reduce intensity from Z3→Z2

User Notification:
"Your HR data suggests you're training hard. I've reduced this week 
to help with recovery. Trust the process!"
```

**Scenario 2: Ahead of Schedule**
```
AI Analysis:
- Completed 4 of 4 workouts, all faster than planned
- Paces consistently 30-60 sec/km faster
- HR zones lower than expected for workload
- User consistently exceeds targets

Action:
- Increase week 5-6 volume by 15%
- Add speed work intervals
- Increase intensity from Z2→Z3
- Progress race pace efforts

User Notification:
"Great fitness gains! You're ready for more challenge.
Let's push your limits this week."
```

**Scenario 3: Missed Workouts**
```
AI Analysis:
- Completed 2 of 5 planned workouts
- Skipped 3 consecutive days
- No runs in last week

Action:
- Extend plan by 1 week
- Reduce intensity back to base building
- Focus on consistency over performance
- Add motivational coaching

User Notification:
"I noticed you missed some workouts. That's okay! 
Let's focus on getting back into routine this week."
```

---

## Key Metrics & Monitoring

### Performance Indicators Users See

1. **Plan Adherence**
   - % of workouts completed
   - Distance vs plan (actual/target km)
   - Consistency score (0-100%)

2. **Fitness Progress**
   - CTL (Chronic Training Load) graph
   - TSS (Training Stress Score) per week
   - Recovery time trends

3. **Pace Progression**
   - Easy run pace trend
   - Long run pace trend
   - Threshold pace trend

4. **Completion Status**
   - Weeks completed: 3/16
   - Days to race: 87 days
   - Workouts completed: 12/68
   - On track / Behind schedule

---

## Integration Points with Other Features

### 1. Runs Integration
- Users link completed runs to plan workouts
- Run metrics compared against plan targets
- Run data used for automatic plan reassessment
- PR/achievement tracking within plan context

### 2. Garmin Integration
- Garmin data enriches completed workout details
- HR zones automatically calculated from Garmin device
- Real-time performance metrics available
- Better reassessment accuracy with device data

### 3. AI Coaching
- AI Coach provides real-time guidance during workouts
- Pre-run briefing references plan goal
- Post-run analysis includes plan context
- Coaching advice tailored to week's focus

### 4. Push Notifications
- Plan generated notification
- Workout reminders (opt-in)
- Adaptation alerts
- Milestone achievements
- Week/month completion congratulations

---

## Testing Scenarios

### Test 1: Generate Marathon Plan
```
Input:
- Goal: Marathon (42.195 km)
- Target Date: June 15, 2026
- Experience: Intermediate
- Days/Week: 5

Expected Output:
- 16-week plan generated
- Progressively increasing mileage (30→60 km/week)
- Mix of easy, tempo, intervals, long runs
- AI-generated coaching tips for each session
```

### Test 2: Link Run to Workout
```
Input:
- Planned: 6.0 km easy run at 6:00/km pace
- Completed: 6.2 km run at 5:47/km pace

Expected Output:
- Workout marked complete
- Performance feedback: "Great job! 3% faster than planned"
- Linked run appears in history
- Plan week progress updated
```

### Test 3: Trigger Plan Adaptation
```
Input:
- Complete all 5 workouts of week 2
- All paces 30+ sec/km faster than planned
- Heart rates consistently lower than target

Expected Output:
- Plan adaptation triggered
- Suggested changes: +15% volume, increase intensity
- Push notification: "You're performing great!"
- User can accept/review changes
```

---

## Error Handling

### Common Errors & Resolutions

| Error | Cause | Resolution |
|-------|-------|-----------|
| `400 Bad Goal Date` | Target date is in past | Show date picker validation |
| `400 Invalid Experience` | Unknown experience level | Validate enum values |
| `429 Rate Limited` | Too many plan generations | Show retry UI, wait 60s |
| `500 AI Generation Failed` | GPT-4 API error | Show error + retry button |
| `404 Plan Not Found` | Plan ID invalid/deleted | Show error, reload plans list |

---

## Performance Considerations

### Optimization Tips

1. **Cache Weekly Plans**
   - Store downloaded weekly plans locally
   - Only refresh when user advances week
   - Implement pagination for large plans

2. **Background Tasks**
   - Check for adaptations on app launch
   - Refresh active plans every 6 hours
   - Batch adaptation notifications

3. **Data Fetching**
   - Load full plan only once on generation
   - Fetch one week at a time when viewing
   - Lazy load adaptations on demand

4. **Image/Resource Optimization**
   - Cache HR zone icons
   - Preload workout type badges
   - Compress plan detail images

---

## Privacy & Security

- ✅ Plans stored per-user with role-based access
- ✅ No plan data shared without permission
- ✅ User can export/delete plans anytime
- ✅ AI insights never stored with PII
- ✅ Adaptation history retained for user reference

---

## Future Enhancements

1. **Social Features**
   - Share plans with friends
   - Group training plans
   - Coach-created plans

2. **Advanced AI**
   - Injury risk prediction
   - Weather-aware adjustments
   - Real-time coaching during runs

3. **Integration**
   - Apple Health integration
   - Apple Watch app with live metrics
   - Siri shortcuts for workout logging

4. **Analytics**
   - Plan success rates by goal type
   - Trainer leaderboards
   - Performance benchmarking

---

## Questions?

Reach out to the backend team for:
- API clarifications
- Data model questions
- Adaptation algorithm details
- Testing scenarios

All documentation files available in repository:
- `AI_COACHING_PLAN_SUMMARY.md` (this file)
- `GARMIN_INTEGRATION_SUMMARY.md`
- `GARMIN_API_REFERENCE.md`
- Code examples in `server/training-plan-service.ts`
