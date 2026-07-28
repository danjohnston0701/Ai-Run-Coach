# Adaptation System - Complete Structure Summary

## Overview
The AiRunCoach application implements an AI-driven plan adaptation system that allows the app to suggest and apply modifications to training plans based on user performance, injuries, and other factors.

---

## 1. Domain Model Classes

### Location: `app/src/main/java/live/airuncoach/airuncoach/domain/model/TrainingPlan.kt`

#### Primary Adaptation Data Classes:

##### `PlanAdaptation` (Lines 155-160)
```kotlin
data class PlanAdaptation(
    val date: LocalDate,
    val reason: String,
    val change: String,
    val applied: Boolean
)
```
**Purpose**: Represents a single AI-suggested adaptation to a training plan
- **date**: When the adaptation was suggested
- **reason**: Why the adaptation was suggested (e.g., "missed_workout", "injury", "over_training")
- **change**: Description of the change
- **applied**: Whether the adaptation has been applied to the plan

##### `PlanProgress` (Lines 141-150)
```kotlin
data class PlanProgress(
    val plan: TrainingPlan,
    val completedWorkouts: Int,
    val totalWorkouts: Int,
    val currentWeek: Int,
    val weeklyCompliance: List<Float>,
    val onTrack: Boolean,
    val projectedCompletion: LocalDate,
    val adaptations: List<PlanAdaptation>
)
```
**Purpose**: Tracks overall progress on a training plan, including pending and applied adaptations

---

## 2. Network Model / API Request/Response Classes

### Location: `app/src/main/java/live/airuncoach/airuncoach/network/model/PlanAdaptationRequest.kt`

#### API Data Classes:

##### `PendingAdaptation` (Lines 20-28)
```kotlin
data class PendingAdaptation(
    @SerializedName("id") val id: String,
    @SerializedName("training_plan_id") val trainingPlanId: String,
    @SerializedName("adaptation_date") val adaptationDate: String,
    @SerializedName("reason") val reason: String,
    @SerializedName("status") val status: String = "pending",
    @SerializedName("changes") val changes: Map<String, Any>? = null,
    @SerializedName("ai_suggestion") val aiSuggestion: String? = null
)
```
**Purpose**: Represents an adaptation returned from the API with detailed information
- **id**: Unique identifier for the adaptation
- **trainingPlanId**: Associated training plan ID
- **adaptationDate**: When the adaptation was generated
- **reason**: Reason types: `run_data_feedback`, `missed_workout`, `injury`, `over_training`, `ahead_of_schedule`
- **status**: Can be `pending`, `accepted`, or `declined`
- **changes**: Map containing specific workout/plan changes
- **aiSuggestion**: Natural language explanation of the adaptation

##### `PendingAdaptationsResponse` (Lines 30-33)
```kotlin
data class PendingAdaptationsResponse(
    @SerializedName("adaptations") val adaptations: List<PendingAdaptation> = emptyList(),
    @SerializedName("count") val count: Int = 0
)
```
**Purpose**: API response wrapper for fetching pending adaptations

##### `AcceptAdaptationRequest` (Lines 5-7)
```kotlin
data class AcceptAdaptationRequest(
    @SerializedName("adaptationId") val adaptationId: String
)
```
**Purpose**: Request body when user accepts an adaptation

##### `DeclineAdaptationRequest` (Lines 9-11)
```kotlin
data class DeclineAdaptationRequest(
    @SerializedName("adaptationId") val adaptationId: String
)
```
**Purpose**: Request body when user declines an adaptation

##### `AdaptationResponse` (Lines 13-18)
```kotlin
data class AdaptationResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String? = null,
    @SerializedName("workoutsUpdated") val workoutsUpdated: Int = 0,
    @SerializedName("error") val error: String? = null
)
```
**Purpose**: Generic response for accepting/declining adaptations

---

## 3. Database Entities

### Current State: **NO Dedicated Adaptation Database Entities**

#### Location: `app/src/main/java/live/airuncoach/airuncoach/data/database/AiRunCoachDatabase.kt`

The main database schema currently only includes:
- `PendingSyncEntity` - for offline run caching

**Note**: Adaptations are managed via API and not persisted locally to the database. The system:
1. Fetches pending adaptations from the API
2. Displays them to the user
3. Sends accept/decline responses back to the API
4. Does not store adaptation history locally

---

## 4. ViewModel Layer

### Location: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/AdaptationViewModel.kt`

#### `AdaptationViewModel` (Hilt-injected)

**State Management:**
- `pendingAdaptations`: StateFlow<List<PendingAdaptation>> - List of pending adaptations
- `isLoading`: StateFlow<Boolean> - Loading indicator
- `errorMessage`: StateFlow<String?> - Error messages
- `successMessage`: StateFlow<String?> - Success feedback

**Key Functions:**
1. **loadPendingAdaptations(planId: String)**
   - Fetches pending adaptations from API for a specific plan
   - Updates UI state with results

2. **acceptAdaptation(adaptationId: String)**
   - Sends accept request to API
   - Removes adaptation from pending list
   - Shows success message

3. **declineAdaptation(adaptationId: String)**
   - Sends decline request to API
   - Removes adaptation from pending list
   - Shows success message

4. **clearError()** / **clearSuccess()**
   - Clear message state

---

## 5. UI Layer

### Location: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/AdaptationReviewScreen.kt`

#### `AdaptationReviewScreen` Composable
A full-screen interface for reviewing and managing plan adaptations

**Features:**
- Loads adaptations on screen entry
- Displays list of pending adaptations
- Shows loading state, error state, or empty state
- Allows user to accept or decline each adaptation
- Confirmation dialog before accepting/declining
- Auto-navigates back when all adaptations handled

#### Sub-composables:
1. **AdaptationCard**
   - Displays individual adaptation with:
     - Reason (formatted for display)
     - Adaptation date
     - "Pending" status badge
     - AI suggestion text
     - Changes preview (key-value pairs)
     - Accept/Decline buttons

2. **AdaptationErrorCard**
   - Shows error messages with warning icon

3. **AdaptationEmptyState**
   - Shows success message when no pending adaptations

#### Helper Functions:
- `reasonToDisplayName(reason: String)`: Converts reason codes to readable text
  - `missed_workout` → "Missed Workout"
  - `injury` → "Injury Recovery"
  - `over_training` → "Over Training Detected"
  - `ahead_of_schedule` → "Ahead of Schedule"

---

## 6. API Integration

### Location: `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt`

**Adaptation Endpoints:**
- `GET /api/plans/{planId}/adaptations` - Fetch pending adaptations
- `POST /api/adaptations/{adaptationId}/accept` - Accept an adaptation
- `POST /api/adaptations/{adaptationId}/decline` - Decline an adaptation

---

## 7. Adaptation Reason Categories

The system recognizes these adaptation reasons:

| Reason Code | Display Name | Trigger |
|---|---|---|
| `run_data_feedback` | Run Data Feedback | Performance analysis from completed runs |
| `missed_workout` | Missed Workout | User skipped a scheduled workout |
| `injury` | Injury Recovery | User reported an injury |
| `over_training` | Over Training Detected | System detected overtraining |
| `ahead_of_schedule` | Ahead of Schedule | User consistently performing above plan |

---

## 8. Data Flow Diagram

```
API Server
    ↓
PendingAdaptationsResponse
    ↓
AdaptationViewModel.loadPendingAdaptations()
    ↓
StateFlow<List<PendingAdaptation>>
    ↓
AdaptationReviewScreen (Composable)
    ↓
User Action (Accept/Decline)
    ↓
AdaptationViewModel.acceptAdaptation() or declineAdaptation()
    ↓
API POST Request
    ↓
AdaptationResponse
    ↓
Update UI + Auto-navigate
```

---

## 9. Key Files Summary

| File Path | Purpose | Type |
|---|---|---|
| `domain/model/TrainingPlan.kt` | Domain models for adaptations | Data Classes |
| `network/model/PlanAdaptationRequest.kt` | API request/response models | Serializable Data |
| `viewmodel/AdaptationViewModel.kt` | State management and API calls | ViewModel |
| `ui/screens/AdaptationReviewScreen.kt` | User interface for adaptation review | Composable |
| `data/database/AiRunCoachDatabase.kt` | Database schema (currently no adaptation table) | Database |

---

## 10. Important Notes

### ✅ Current Implementation
- Full API integration for fetching, accepting, and declining adaptations
- Clean separation of concerns (domain, network, viewmodel, UI)
- Reactive state management with StateFlow
- User-friendly confirmation dialogs

### ⚠️ Missing/Future Work
- **No local database persistence** for adaptation history
- **No DAO/Entity classes** for Room database
- **No adaptation history view** to see previously applied adaptations
- **No background sync** for pending adaptations

### 📋 Recommended Database Schema (if needed)
```kotlin
@Entity(tableName = "adaptations")
data class AdaptationEntity(
    @PrimaryKey val id: String,
    val trainingPlanId: String,
    val adaptationDate: String,
    val reason: String,
    val status: String, // pending, accepted, declined
    val changes: String, // JSON string
    val aiSuggestion: String,
    val syncedAt: Long
)
```

---

## 11. Related Files with Adaptation References

Files that reference or use the adaptation system:
- `ui/screens/RunSummaryScreen.kt` - May show adaptation suggestions
- `ui/screens/WorkoutDetailScreen.kt` - May display adaptation impacts
- `ui/components/AdaptivePlanUpdateCard.kt` - UI component for adaptations
- `ui/screens/CoachingProgrammeScreen.kt` - Integration point for adaptations
- `viewmodel/TrainingPlanViewModel.kt` - Manages training plan state
- `network/ApiService.kt` - API endpoints for adaptations
- `service/RunTrackingService.kt` - May trigger adaptation suggestions
- `config/RunningMetricsConfig.kt` - Configuration for adaptation rules

