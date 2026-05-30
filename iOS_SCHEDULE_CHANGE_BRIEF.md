# iOS Schedule Change Feature Brief

## Overview
Implement the coaching plan schedule change feature on iOS to allow users to reschedule training sessions across different days within a week. This feature mirrors the Android implementation with iOS-native UI patterns and SwiftUI components.

## User Experience

### Flow
1. **Access Plan**: User opens a training plan detail view
2. **Expand Week**: Tap to expand any week's card
3. **Change Schedule Button**: "Change Schedule" button appears in expanded week view
4. **Dialog Opens**: Modal sheet displays all workouts for that week
5. **Select & Edit**: Tap a workout to expand and select a new day from a visual grid
6. **Apply Changes**: Tap "Apply Changes" button
7. **Plan Reloads**: Week view updates with new schedule

### Visual Design
- **Day Picker Grid**: 7 columns (Sun-Sat) with proper spacing
- **Selected State**: Primary color highlight for selected day
- **Current Day**: Bordered highlight to show baseline
- **Expandable Rows**: Each workout toggles day picker visibility
- **Batch Changes**: Support multiple changes before applying

## Technical Implementation

### Data Models (SwiftUI)

```swift
// Models/ScheduleModels.swift

struct WorkoutScheduleUpdate: Codable {
    let workoutId: String
    let dayOfWeek: Int  // 0=Sun, 1=Mon, ..., 6=Sat
    let scheduledDate: String  // ISO date "yyyy-MM-dd"
}

struct RescheduleSessionsRequest: Codable {
    let weekNumber: Int
    let updates: [WorkoutScheduleUpdate]
}

struct RescheduleSessionsResponse: Codable {
    let success: Bool
    let message: String?
    let planProgress: PlanProgressStats?
}
```

### API Service

```swift
// Services/TrainingPlanService.swift

func rescheduleWeekSessions(
    planId: String,
    request: RescheduleSessionsRequest
) async throws -> RescheduleSessionsResponse {
    let endpoint = "/api/training-plans/\(planId)/reschedule"
    return try await apiClient.put(endpoint, body: request)
}
```

### ViewModel

```swift
// ViewModels/TrainingPlanViewModel.swift

class TrainingPlanViewModel: ObservableObject {
    @Published var isRescheduleLoading = false
    @Published var rescheduleError: String?
    
    func rescheduleWeekSessions(
        planId: String,
        weekNumber: Int,
        updates: [WorkoutScheduleUpdate]
    ) async {
        isRescheduleLoading = true
        rescheduleError = nil
        
        let request = RescheduleSessionsRequest(
            weekNumber: weekNumber,
            updates: updates
        )
        
        do {
            let response = try await trainingPlanService.rescheduleWeekSessions(
                planId: planId,
                request: request
            )
            
            if response.success {
                // Reload plan details
                await loadPlanDetail(planId: planId)
            } else {
                rescheduleError = response.message ?? "Failed to reschedule sessions"
            }
        } catch {
            rescheduleError = "Failed to reschedule: \(error.localizedDescription)"
        }
        
        isRescheduleLoading = false
    }
}
```

### UI Components

#### ChangeScheduleSheet
Main modal sheet that displays week workouts

```swift
struct ChangeScheduleSheet: View {
    let week: WeekDetails
    let planCreatedAt: String?
    let planId: String
    @ObservedObject var viewModel: TrainingPlanViewModel
    @Environment(\.dismiss) var dismiss
    
    @State private var editStates: [ScheduleEditState] = []
    
    var body: some View {
        NavigationStack {
            List {
                ForEach(editStates) { editState in
                    ScheduleEditRow(
                        editState: editState,
                        weekStartDate: calculateWeekStartDate(),
                        onChange: { newDay, newDate in
                            updateEditState(editState.id, day: newDay, date: newDate)
                        }
                    )
                }
            }
            .navigationTitle("Change Schedule - Week \(week.weekNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: applyChanges) {
                        if viewModel.isRescheduleLoading {
                            ProgressView()
                        } else {
                            Text("Apply")
                        }
                    }
                    .disabled(viewModel.isRescheduleLoading || !hasChanges)
                }
            }
        }
    }
    
    private func applyChanges() {
        let updates = editStates
            .filter { $0.selectedDay != -1 }
            .map { state in
                WorkoutScheduleUpdate(
                    workoutId: state.workout.id,
                    dayOfWeek: state.selectedDay,
                    scheduledDate: state.selectedDate ?? state.currentDate
                )
            }
        
        Task {
            await viewModel.rescheduleWeekSessions(
                planId: planId,
                weekNumber: week.weekNumber,
                updates: updates
            )
            if viewModel.rescheduleError == nil {
                dismiss()
            }
        }
    }
    
    private var hasChanges: Bool {
        editStates.contains { $0.selectedDay != -1 }
    }
}
```

#### ScheduleEditRow
Individual workout editor with expandable day picker

```swift
struct ScheduleEditRow: View {
    let editState: ScheduleEditState
    let weekStartDate: Calendar?
    let onChange: (Int, String) -> Void
    
    @State private var isExpanded = false
    
    var dayName: String {
        let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        return days[editState.currentDay % 7]
    }
    
    var body: some View {
        VStack(spacing: 12) {
            // Workout info
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(editState.workout.description ?? workoutTypeLabel(editState.workout.workoutType))
                        .font(.subheadline)
                        .fontWeight(.semibold)
                    
                    HStack(spacing: 8) {
                        Text("Currently: \(dayName)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        if let distance = editState.workout.distance {
                            Text("\(String(format: "%.1f", distance))km")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                Spacer()
                
                if !isExpanded {
                    Button("Reschedule") {
                        isExpanded = true
                        onChange(editState.currentDay, editState.currentDate)
                    }
                    .font(.caption)
                    .buttonStyle(.bordered)
                }
            }
            
            // Day picker (when expanded)
            if isExpanded {
                Divider()
                
                Text("Change to:")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity, alignment: .leading)
                
                DayPickerGrid(
                    selectedDay: editState.selectedDay,
                    currentDay: editState.currentDay,
                    weekStartDate: weekStartDate,
                    onDaySelected: onChange
                )
            }
        }
        .padding(.vertical, 8)
    }
}
```

#### DayPickerGrid
Visual 7-column grid of day buttons

```swift
struct DayPickerGrid: View {
    let selectedDay: Int
    let currentDay: Int
    let weekStartDate: Calendar?
    let onDaySelected: (Int, String) -> Void
    
    private let dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 7)
    
    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(0..<7, id: \.self) { dayOfWeek in
                DayButton(
                    dayOfWeek: dayOfWeek,
                    dayName: dayNames[dayOfWeek],
                    isSelected: selectedDay == dayOfWeek,
                    isCurrent: currentDay == dayOfWeek,
                    weekStartDate: weekStartDate,
                    onSelected: onDaySelected
                )
            }
        }
    }
}
```

#### DayButton
Individual selectable day

```swift
struct DayButton: View {
    let dayOfWeek: Int
    let dayName: String
    let isSelected: Bool
    let isCurrent: Bool
    let weekStartDate: Calendar?
    let onSelected: (Int, String) -> Void
    
    private var dateString: String {
        guard let weekStart = weekStartDate else { return "" }
        var calendar = weekStart
        calendar.add(.day, value: dayOfWeek)
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: calendar.date ?? Date())
    }
    
    var body: some View {
        Button(action: { onSelected(dayOfWeek, dateString) }) {
            VStack(spacing: 4) {
                Text(dayName)
                    .font(.caption)
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56)
        }
        .foregroundColor(isSelected ? .white : .primary)
        .background(isSelected ? Color.accentColor : Color(.systemGray6))
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.accentColor, lineWidth: isCurrent && !isSelected ? 2 : 0)
        )
    }
}
```

### Integration with Week View

In `TrainingPlanDetailView.swift`, add button to expanded week card:

```swift
VStack {
    // Week header and stats...
    
    if isExpanded {
        Divider()
        
        Button(action: { showChangeScheduleSheet = true }) {
            HStack {
                Image(systemName: "calendar")
                Text("Change Schedule")
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .sheet(isPresented: $showChangeScheduleSheet) {
            ChangeScheduleSheet(
                week: week,
                planCreatedAt: plan.createdAt,
                planId: plan.id,
                viewModel: viewModel
            )
        }
        
        // Workouts list...
    }
}
```

## Key Features

✅ **Visual Day Picker**: 7-column grid with clear day selection  
✅ **Expandable Rows**: Each workout toggles editor inline  
✅ **Batch Changes**: Reschedule multiple workouts at once  
✅ **Date Calculation**: Auto-computes dates from plan creation date  
✅ **Loading States**: Disabled UI while API request in progress  
✅ **Error Handling**: User-friendly error messages  
✅ **Plan Reload**: Automatic refresh after successful reschedule  

## Design Guidelines

### Colors
- **Selected Day**: Use `.accentColor` (primary app color)
- **Current Day**: Border with `.accentColor`
- **Default**: `.systemGray6` background
- **Text**: `.primary` for headers, `.secondary` for details

### Typography
- **Headers**: `.subheadline` + `.semibold`
- **Labels**: `.caption` + `.semibold`
- **Details**: `.caption` + `.secondary`

### Spacing
- **Grid Spacing**: 8pt between day buttons
- **Row Spacing**: 12pt between sections
- **Padding**: 12pt-16pt edges

### Interaction
- **Sheet Presentation**: Modal bottom sheet for dialog
- **Button Style**: `.bordered` for secondary actions
- **Loading**: Standard `ProgressView()` on button

## Testing Checklist

- [ ] Open week and tap "Change Schedule"
- [ ] Expand individual workouts and select new days
- [ ] Change multiple workouts in single dialog
- [ ] Verify dates calculated correctly per week
- [ ] Test network error handling
- [ ] Confirm plan reloads after successful change
- [ ] Verify dismissal on cancel
- [ ] Test loading state prevents double-submit
- [ ] Verify offline behavior

## Backend Dependency

Requires implementation of:
```
PUT /api/training-plans/{planId}/reschedule
```

Request body:
```json
{
  "weekNumber": 2,
  "updates": [
    {
      "workoutId": "...",
      "dayOfWeek": 2,
      "scheduledDate": "2026-06-10"
    }
  ]
}
```

Response:
```json
{
  "success": true,
  "message": "Schedule updated",
  "planProgress": { ... }
}
```

## Notes

- Uses SwiftUI `@State` and `@ObservedObject` for state management
- Modal sheet for non-destructive dialog pattern
- Automatic date calculation based on plan creation date
- Only changed workouts sent to backend
- Full error recovery on API failure

---

**Status**: Ready for iOS implementation  
**Complexity**: Medium  
**Time Estimate**: 4-6 hours  
**Dependencies**: TrainingPlanService API integration
