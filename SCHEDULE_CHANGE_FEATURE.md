# Schedule Change Feature - Implementation Summary

## Overview
Added a comprehensive schedule management feature that allows users to change workout days for individual sessions within any week of their coaching plan. Users can now reschedule sessions across the week with an intuitive day picker interface.

## Feature Description

### User Experience Flow
1. **Access Schedule Change**: User opens an expanded week card in the training plan view
2. **Tap "Change Schedule" Button**: A button appears in each week's expanded view
3. **Select Workouts to Reschedule**: The dialog shows all workouts for that week with their current day assignments
4. **Modify Schedule**: User can toggle each workout to edit and select a new day from a visual day picker
5. **Confirm Changes**: Apply changes which get sent to the backend and reflected immediately in the plan

### UI Components

#### ChangeScheduleDialog Composable
**File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ChangeScheduleDialog.kt`

The main dialog component that provides:
- **Week Information Display**: Shows week number for context
- **Workout List**: Displays each workout in the week with current day assignment
- **Expandable Edit Rows**: Each workout can be toggled to show/hide the day picker
- **Visual Day Picker Grid**: A 7-column grid (Sun-Sat) with:
  - Selected day highlighted in primary color
  - Current day with bordered highlight
  - Actual date calculation based on plan creation date
- **Apply/Cancel Buttons**: Users can save changes or dismiss without saving

#### ScheduleEditRow Composable
Shows individual workout with:
- **Workout Type & Description**
- **Current Day Assignment**
- **Distance Information**
- **Toggle Button** to expand/collapse the day picker
- **Day Picker Grid** (when expanded)

#### DayButton Composable
Individual day button with:
- **Day Abbreviation** (Sun, Mon, etc.)
- **Visual State**: Selected, current, or default
- **Automatic Date Calculation**: Computes actual date for the selected day in that week

## Backend Integration

### API Endpoint
**PUT** `/api/training-plans/{planId}/reschedule`

### Request Model
```kotlin
data class RescheduleSessionsRequest(
    val weekNumber: Int,
    val updates: List<WorkoutScheduleUpdate>
)

data class WorkoutScheduleUpdate(
    val workoutId: String,
    val dayOfWeek: Int,  // 0=Sun, 1=Mon, ..., 6=Sat
    val scheduledDate: String  // ISO date "yyyy-MM-dd"
)
```

### Response Model
```kotlin
data class RescheduleSessionsResponse(
    val success: Boolean,
    val message: String? = null,
    val planProgress: PlanProgressStats? = null
)
```

## Code Changes

### 1. Data Models (`TrainingPlanModels.kt`)
- Added `WorkoutScheduleUpdate` - represents a single workout's schedule change
- Added `RescheduleSessionsRequest` - wraps week number and list of updates
- Added `RescheduleSessionsResponse` - backend response

### 2. API Service (`ApiService.kt`)
- Added `rescheduleWeekSessions()` endpoint definition
- Maps to `PUT /api/training-plans/{planId}/reschedule`

### 3. ViewModel (`TrainingPlanViewModel.kt`)
- Added `rescheduleWeekSessions()` function that:
  - Sends request to API
  - Shows loading state during request
  - Reloads plan detail after successful update
  - Handles errors with user-facing messages

### 4. UI Components (`ChangeScheduleDialog.kt` - New File)
Created comprehensive schedule change UI with:
- Main `ChangeScheduleDialog` composable (dialog wrapper)
- `ScheduleEditRow` (individual workout editor)
- `DayPickerGrid` (2-row grid of day buttons)
- `DayButton` (individual day selector)
- Helper functions for date calculations

### 5. Integration (`CoachingProgrammeScreen.kt`)
- Modified `ExpandableWeekCard()` to include:
  - "Change Schedule" button in expanded view
  - Dialog state management
  - Dialog trigger and confirmation handlers
  - Integration with ViewModel

## Key Features

### Smart Date Handling
- **Automatic Date Calculation**: Derives actual dates from plan creation date and week number
- **Week-based Anchoring**: Ensures dates are consistent with the plan's week structure
- **Visual Feedback**: Shows both day name and actual date for clarity

### User-Friendly Interface
- **Expandable Rows**: Each workout starts collapsed, expands only when needed
- **Visual Day Grid**: 7-button grid for easy selection
- **Clear Status Indicators**: Selected day highlighted, current day with border
- **Batch Updates**: Change multiple sessions at once before applying

### Robust Error Handling
- **Loading States**: Disabled interactions while API request is in progress
- **Error Messages**: User-facing error feedback if reschedule fails
- **Validation**: Only changed sessions are sent to backend

## Testing Considerations

To test this feature:

1. **Basic Rescheduling**
   - Open a training plan
   - Expand a week
   - Tap "Change Schedule"
   - Select a different day for a session
   - Confirm changes
   - Verify workout moves to new day

2. **Multiple Changes**
   - Reschedule multiple workouts in one dialog
   - Confirm all changes are applied

3. **Date Accuracy**
   - Verify calculated dates are correct for the week
   - Check across different weeks to ensure consistency

4. **Error Handling**
   - Test with network offline
   - Verify error messages display correctly
   - Confirm UI state recovers after errors

## Backend Requirements

The backend must implement:
1. New endpoint: `PUT /api/training-plans/{planId}/reschedule`
2. Validate all workouts belong to specified week
3. Update `scheduledDate` and `dayOfWeek` for each workout
4. Return updated plan progress
5. Log changes for audit trail (recommended)

Example backend logic:
- Parse request body
- Validate planId and weekNumber
- For each update:
  - Verify workout exists in plan
  - Update workout's dayOfWeek and scheduledDate
  - Check for scheduling conflicts (optional)
- Return success with updated progress

## Future Enhancements

1. **Conflict Detection**: Alert if user schedules two sessions on same day
2. **Drag & Drop**: Alternative UI for power users
3. **Recurring Patterns**: Save "preferred days" for future plans
4. **Smart Recommendations**: AI suggests optimal day based on user's history
5. **Bulk Edit**: Change multiple weeks at once
6. **Undo/Redo**: Restore previous schedule if needed

## Notes

- The feature respects the plan's creation date for accurate week calculations
- Only workouts that have been modified are sent to the backend
- The dialog is non-destructive - canceling doesn't apply changes
- Plan detail reloads automatically after successful reschedule
- Loading state prevents double-submission

---

**Status**: Ready for backend integration and testing
**Files Modified**: 5 core files + 1 new file
**Lines Added**: ~400 (UI) + ~100 (data models and ViewModel)
