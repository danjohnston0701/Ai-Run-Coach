# Plan Adaptations Status Tracking Brief

## Overview
Implementation of status tracking for plan adaptations to distinguish between pending, accepted, and declined suggestions. Only "pending" adaptations should be displayed to users.

---

## Data Model Changes

### Backend Schema Update (Neon SQL)

```sql
-- Add status column to plan_adaptations table
ALTER TABLE plan_adaptations
ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending', 'accepted', 'declined'));

-- Create indexes for performance
CREATE INDEX idx_plan_adaptations_status ON plan_adaptations(status);
CREATE INDEX idx_plan_adaptations_plan_status ON plan_adaptations(training_plan_id, status);

-- Migrate existing data
UPDATE plan_adaptations SET status = 'pending' WHERE status IS NULL OR user_accepted = false;
UPDATE plan_adaptations SET status = 'accepted' WHERE user_accepted = true;
```

### API Response Schema

Update the `PendingAdaptation` response to include status field:

```json
{
  "id": "a3ca4cd0-a1d8-47ae-92c6-65aa3773b23f",
  "training_plan_id": "c51fdd78-e122-4fe9-87bf-b9e7444db7d2",
  "adaptation_date": "2026-07-21 05:23:44.068491",
  "reason": "run_data_feedback",
  "status": "pending",
  "changes": { ... },
  "ai_suggestion": "To improve your endurance...",
  "created_at": "2026-07-21 05:23:44.068491"
}
```

**Field Details:**
- `status` (String): One of `"pending"`, `"accepted"`, or `"declined"`
- Default: `"pending"` for new adaptations
- **Removed**: `user_accepted` boolean (replaced by status field)

---

## iOS Implementation

### 1. Data Model Update

Update the `PendingAdaptation` Codable struct:

```swift
struct PendingAdaptation: Codable {
    let id: String
    let trainingPlanId: String
    let adaptationDate: String
    let reason: String
    let status: String  // "pending", "accepted", "declined"
    let changes: [String: AnyCodable]?
    let aiSuggestion: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case trainingPlanId = "training_plan_id"
        case adaptationDate = "adaptation_date"
        case reason
        case status
        case changes
        case aiSuggestion = "ai_suggestion"
    }
}
```

### 2. ViewModel/State Management

**Filter for pending adaptations only:**

```swift
@Published var pendingAdaptations: [PendingAdaptation] = []

func loadPendingAdaptations(planId: String) {
    apiService.getPendingAdaptations(planId: planId) { result in
        switch result {
        case .success(let response):
            // Only show adaptations with status == "pending"
            self.pendingAdaptations = response.adaptations.filter { $0.status == "pending" }
        case .failure(let error):
            print("Failed to load adaptations: \(error)")
            self.pendingAdaptations = []
        }
    }
}
```

### 3. Accept/Decline Actions

When user accepts or declines an adaptation:

```swift
func acceptAdaptation(_ adaptationId: String) {
    apiService.acceptAdaptation(adaptationId: adaptationId) { result in
        switch result {
        case .success:
            // Remove from pending list (status will become "accepted" on backend)
            self.pendingAdaptations.removeAll { $0.id == adaptationId }
        case .failure(let error):
            print("Failed to accept: \(error)")
        }
    }
}

func declineAdaptation(_ adaptationId: String) {
    apiService.declineAdaptation(adaptationId: adaptationId) { result in
        switch result {
        case .success:
            // Remove from pending list (status will become "declined" on backend)
            self.pendingAdaptations.removeAll { $0.id == adaptationId }
        case .failure(let error):
            print("Failed to decline: \(error)")
        }
    }
}
```

### 4. UI Visibility Logic

**Only display the Adaptive Plan Update card when:**

```swift
// In your run summary view
if run.linkedPlanId != nil && !viewModel.pendingAdaptations.isEmpty {
    AdaptivePlanUpdateView(
        adaptations: viewModel.pendingAdaptations,
        onAccept: { viewModel.acceptAdaptation($0) },
        onDecline: { viewModel.declineAdaptation($0) }
    )
}
```

---

## API Endpoints

### Get Pending Adaptations
- **Endpoint**: `GET /api/training-plans/{planId}/adaptations/pending`
- **Response**: 
  ```json
  {
    "adaptations": [
      { "id": "...", "status": "pending", ... },
      { "id": "...", "status": "pending", ... }
    ],
    "count": 2
  }
  ```
- **Note**: Backend should already filter to return only pending adaptations

### Accept Adaptation
- **Endpoint**: `POST /api/adaptations/{adaptationId}/accept`
- **Backend Action**: Updates status from "pending" to "accepted"
- **Response**: `{ "success": true, "message": "..." }`

### Decline Adaptation
- **Endpoint**: `POST /api/adaptations/{adaptationId}/decline`
- **Backend Action**: Updates status from "pending" to "declined"
- **Response**: `{ "success": true, "message": "..." }`

---

## Visibility & Display Rules

| Scenario | Display Component | Notes |
|----------|------------------|-------|
| Run linked to plan, has pending adaptations | ✅ Yes | Show card with all pending items |
| Run linked to plan, no pending adaptations | ❌ No | Hide card completely |
| Run not linked to plan | ❌ No | Hide card completely |
| User accepts/declines all adaptations | ❌ No | Card disappears as list becomes empty |
| Loading adaptations | ✅ Yes | Show loading spinner while fetching |

---

## Key Implementation Notes

1. **Single Source of Truth**: Only `status` field matters for visibility; don't rely on other fields
2. **Filtering Happens Client-Side**: The app filters to "pending" status, even if backend returns all statuses
3. **Removal on Accept/Decline**: Remove items from the displayed list immediately after successful API call
4. **Status Values**: Always use lowercase: `"pending"`, `"accepted"`, `"declined"`
5. **Carousel for Multiple**: If multiple pending adaptations exist, implement pagination/carousel like Android

---

## Testing Checklist

- [ ] API returns adaptations with new `status` field
- [ ] Model decodes correctly (snake_case conversion working)
- [ ] Only "pending" adaptations display to user
- [ ] Accepted/declined adaptations removed from UI
- [ ] Card hides when all adaptations are acted upon
- [ ] Loading state shows while fetching
- [ ] Multiple adaptations display with carousel/pagination
- [ ] Accepted/declined status persists after app close
- [ ] Decline action works correctly

---

## Migration Notes

- **Backwards Compatibility**: Ensure old `user_accepted` boolean field is handled if still present
- **Default Status**: New adaptations default to `"pending"` automatically
- **Existing Data**: Migration script handles converting old boolean to status enum
