# Plan Adaptations: iOS Implementation Brief

## 🎯 Overview

The plan adaptations system has been updated to support **contextual filtering**. Adaptations are now linked to specific sources (plan, run, or workout) instead of displaying all adaptations on every run record.

**Status**: Backend API complete ✅ | Android complete ✅ | iOS needed ⏳

---

## 📱 What Changed

### Old Behavior
- All adaptations for a plan were visible on every run record
- Cluttered UI with many irrelevant suggestions

### New Behavior
- **Plan-level adaptations**: Visible only on Plan Adaptation Screen
- **Run-specific adaptations**: Visible only on that run's summary
- **Workout-specific adaptations**: Visible only on that workout's summary

---

## 🏗️ Data Model

### New Fields in `PendingAdaptation`

```swift
struct PendingAdaptation: Codable {
    let id: String
    let trainingPlanId: String
    let adaptationDate: String
    let reason: String
    let status: String           // "pending", "accepted", "declined"
    let changes: [String: Any]?
    let aiSuggestion: String?
    
    // NEW FIELDS
    let runRecordId: String?       // Non-null = run-specific
    let plannedWorkoutId: String?  // Non-null = workout-specific
    // Both null = plan-level
}
```

---

## 🔌 API Endpoints

### Existing Endpoints
- `GET /api/training-plans/{planId}/adaptations/pending` - Now returns **plan-level only**
- `POST /api/training-plans/adaptations/{id}/accept`
- `POST /api/training-plans/adaptations/{id}/decline`

### New Endpoints
- `GET /api/runs/{runId}/adaptations/pending` - **Run-specific adaptations**
- `GET /api/planned-workouts/{workoutId}/adaptations/pending` - **Workout-specific adaptations**

---

## 💻 Implementation Checklist

### 1. Update Data Model
- [ ] Add `runRecordId: String?` to `PendingAdaptation`
- [ ] Add `plannedWorkoutId: String?` to `PendingAdaptation`
- [ ] Ensure Codable serialization works (snake_case: `run_record_id`, `planned_workout_id`)

### 2. Update API Service
- [ ] Add method: `func getPendingAdaptationsByRunId(_ runId: String) async throws -> PendingAdaptationsResponse`
- [ ] Add method: `func getPendingAdaptationsByWorkoutId(_ workoutId: String) async throws -> PendingAdaptationsResponse`
- [ ] Update existing `getPendingAdaptations()` - should now filter plan-level only

### 3. Update ViewModels
- [ ] Create/update view model to load run-specific adaptations
- [ ] Create/update view model to load workout-specific adaptations
- [ ] Add @Published properties for:
  - `pendingAdaptations: [PendingAdaptation] = []`
  - `isLoadingAdaptations: Bool = false`

### 4. Update Run Summary Screen
- [ ] Call `loadPendingAdaptationsByRunId(runId)` when loading run
- [ ] Display in new section: "✨ Based on This Run"
- [ ] Show run-specific adaptations with accept/decline buttons
- [ ] Handle empty state (no adaptations for this run)

### 5. Update Plan Adaptation Screen
- [ ] No changes needed - already shows plan-level adaptations
- [ ] Verify filtering works (should not show run/workout-specific)

### 6. Accept/Decline Logic
- [ ] Existing endpoints work with all adaptation types
- [ ] Remove from list after accept/decline
- [ ] Show success message

---

## 📊 UI Flow

### Run Summary Screen

```
Run Summary
├── Run Metrics (distance, pace, etc.)
├── Struggle Points
├── ✨ Based on This Run          ← NEW SECTION
│   ├── Adaptation 1
│   │   └── [Accept] [Decline]
│   ├── Adaptation 2
│   │   └── [Accept] [Decline]
│   └── (Empty state if none)
└── Other Sections...
```

### Plan Adaptation Screen
```
Plan Adaptations
├── Adaptation 1 (Plan-level)    ← Only shows runId=null & workoutId=null
├── Adaptation 2 (Plan-level)
└── Adaptation 3 (Plan-level)
```

---

## 🔑 Key Points

1. **Adaptation Type Detection**:
   - `runRecordId != nil && plannedWorkoutId == nil` → Run-specific
   - `plannedWorkoutId != nil && runRecordId == nil` → Workout-specific
   - `runRecordId == nil && plannedWorkoutId == nil` → Plan-level

2. **Filtering is Done by Backend**:
   - `/api/runs/{runId}/adaptations/pending` returns only run-specific
   - `/api/training-plans/{planId}/adaptations/pending` returns only plan-level
   - No need to filter on client

3. **Same Accept/Decline Flow**:
   - Works with all three types
   - Same endpoints, same logic
   - Just remove from list after action

4. **Backward Compatible**:
   - Existing adaptations without `runRecordId`/`plannedWorkoutId` are plan-level
   - Old code continues to work

---

## 📝 Code Examples

### Swift Model with Codable

```swift
struct PendingAdaptation: Codable, Identifiable {
    let id: String
    let trainingPlanId: String
    let adaptationDate: String
    let reason: String
    let status: String
    let changes: [String: AnyCodable]?
    let aiSuggestion: String?
    let runRecordId: String?
    let plannedWorkoutId: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case trainingPlanId = "training_plan_id"
        case adaptationDate = "adaptation_date"
        case reason
        case status
        case changes
        case aiSuggestion = "ai_suggestion"
        case runRecordId = "run_record_id"
        case plannedWorkoutId = "planned_workout_id"
    }
}
```

### ViewModel Method

```swift
@MainActor
class RunSummaryViewModel: ObservableObject {
    @Published var pendingAdaptations: [PendingAdaptation] = []
    @Published var isLoadingAdaptations = false
    
    func loadPendingAdaptationsByRunId(_ runId: String) async {
        isLoadingAdaptations = true
        defer { isLoadingAdaptations = false }
        
        do {
            let response = try await apiService.getPendingAdaptationsByRunId(runId)
            self.pendingAdaptations = response.adaptations
        } catch {
            print("Error loading run adaptations: \(error)")
            self.pendingAdaptations = []
        }
    }
}
```

### Calling from View

```swift
.onAppear {
    Task {
        await viewModel.loadPendingAdaptationsByRunId(runId)
    }
}
```

---

## 🧪 Testing

### Unit Tests
```swift
func testRunSpecificAdaptations() {
    // Mock API response with runRecordId set
    let adaptation = PendingAdaptation(
        id: "adapt-1",
        trainingPlanId: "plan-1",
        runRecordId: "run-123",    // Set
        plannedWorkoutId: nil,     // Null
        ...
    )
    // Verify it's treated as run-specific
}

func testPlanLevelAdaptations() {
    // Mock API response with both null
    let adaptation = PendingAdaptation(
        id: "adapt-2",
        trainingPlanId: "plan-1",
        runRecordId: nil,          // Null
        plannedWorkoutId: nil,     // Null
        ...
    )
    // Verify it's treated as plan-level
}
```

### UI Tests
- Load run summary with run-specific adaptations
- Verify "Based on This Run" section appears
- Accept adaptation and verify removal
- Decline adaptation and verify removal
- Load run with no adaptations - verify empty state

---

## 🚀 Implementation Priority

**Phase 1 (Must Have)**
1. Update data model with new fields
2. Add two new API methods
3. Update run summary screen to load and display run-specific adaptations

**Phase 2 (Nice to Have)**
1. Loading state UI improvements
2. Animation when adaptations appear/disappear
3. Fetch both plan-level and run-specific together

---

## 🔗 Related Documentation

- **PLAN_ADAPTATIONS_UPDATE.md** - Complete API reference
- **PLAN_ADAPTATIONS_ARCHITECTURE.md** - System design
- **PLAN_ADAPTATIONS_CODE_CHANGES.md** - What changed in Android

---

## ❓ Common Questions

**Q: Do I need to change the accept/decline endpoints?**  
A: No, they work with all three adaptation types. Same endpoints, same logic.

**Q: Should I filter on the client?**  
A: No, the backend does it. Just call the right endpoint for the context.

**Q: What if both `runRecordId` and `plannedWorkoutId` are set?**  
A: This shouldn't happen. Each adaptation is tied to one source only.

**Q: How do I know if an adaptation is for this specific run?**  
A: Check `runRecordId == runId`. The backend filters it, but you can verify in code.

---

## 📞 Support

If you have questions about:
- **API**: See PLAN_ADAPTATIONS_BACKEND_UPDATES_REQUIRED.md
- **Android**: See PLAN_ADAPTATIONS_CODE_CHANGES.md
- **Architecture**: See PLAN_ADAPTATIONS_ARCHITECTURE.md

---

## ✅ Completion Checklist

- [ ] Data model updated
- [ ] API service methods added
- [ ] ViewModel methods implemented
- [ ] Run summary screen updated
- [ ] Plan adaptation screen verified
- [ ] Unit tests added
- [ ] UI tests added
- [ ] Code reviewed
- [ ] Tested on simulator
- [ ] Tested on device
- [ ] Ready to merge

---

**Version**: 1.0  
**Status**: Ready for implementation  
**Target**: iOS 14+  
**Framework**: SwiftUI / UIKit (specify based on your codebase)
