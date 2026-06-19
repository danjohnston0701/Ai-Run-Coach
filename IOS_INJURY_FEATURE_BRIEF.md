# iOS Brief: Health & Injuries Feature

## Context

We've just shipped a comprehensive **Health & Injuries** management feature to the Android app. The iOS app needs the same feature. This brief describes exactly what to build, including all API contracts, data models, and UI behaviour.

---

## 1. Data Model

Create an `Injury` struct and supporting enums. This maps 1:1 to the JSON the server returns.

```swift
struct Injury: Codable, Identifiable {
    var id: String?
    var bodyPart: String
    var status: InjuryStatus
    var severity: InjurySeverity
    var notes: String?
    var injuryDate: String?           // "YYYY-MM-DD"
    var estimatedRecoveryWeeks: Int?
    var recoveryDate: String?         // "YYYY-MM-DD" — set when status → HEALED
    var updatedAt: Int64
    var isProstheticOrAFO: Bool
    var prostheticType: String?
    var createdAt: Int64
}

enum InjuryStatus: String, Codable, CaseIterable {
    case recovering = "RECOVERING"
    case healed     = "HEALED"
    case chronic    = "CHRONIC"
}

enum InjurySeverity: String, Codable, CaseIterable {
    case mild     = "MILD"
    case moderate = "MODERATE"
    case severe   = "SEVERE"
}
```

The existing `User` model already has an `injuries` array. Confirm it is typed as `[Injury]?` and that `JSONDecoder` maps it correctly (the server key is `injuries` on the `/api/users/me` response).

---

## 2. Static Reference Lists

```swift
let bodyParts = [
    "Knee", "Ankle", "Shin", "Hip", "Back", "Neck / Cervical Spine",
    "Foot", "Calf", "Hamstring", "Quad", "Groin", "Shoulder",
    "Wrist", "IT Band", "Achilles", "Plantar Fascia", "Other"
]

let prostheticTypes = [
    "Carbon fiber AFO (ankle-foot orthotic)",
    "Plastic AFO",
    "Full prosthetic leg",
    "Partial foot prosthetic",
    "Knee brace / ortho",
    "Ankle brace / ankle support",
    "Compression sleeve",
    "Other orthotic device"
]
```

---

## 3. API Endpoints

All endpoints require the existing auth token in the `Authorization: Bearer <token>` header.

### GET /api/user/injuries
Returns injuries grouped by status. Use to pre-populate the screen.

```
Response: {
  "active":  [Injury],   // RECOVERING status
  "chronic": [Injury],   // CHRONIC status
  "healed":  [Injury],   // HEALED status
  "all":     [Injury]    // full list
}
```

### POST /api/user/injuries
Add a new injury.

```
Request body (JSON):
{
  "bodyPart": "Knee",
  "status": "RECOVERING",
  "severity": "MODERATE",
  "notes": "Twisted during hill run",
  "injuryDate": "2026-06-10",
  "estimatedRecoveryWeeks": 3,
  "isProstheticOrAFO": false,
  "prostheticType": null
}

Response: Injury (with server-assigned id and timestamps)
```

### PUT /api/user/injuries/:injuryId
Update an injury. Send the full updated `Injury` object.

```
Response: Updated Injury
```

To **mark as healed**, send:
```
{ "status": "HEALED", "recoveryDate": "2026-06-24" }
```
(merged with existing fields server-side)

### DELETE /api/user/injuries/:injuryId
Delete an injury. Only HEALED or CHRONIC injuries can be deleted.

```
Response: { "message": "Injury deleted successfully" }
Error 400: "Cannot delete active/recovering injuries. Mark as healed first."
```

---

## 4. Screen: Health & Injuries

### Where It Lives
Accessible from the **Profile screen** as a navigation row:

```
Profile → Health & Injuries
```

Add a row to the Profile settings list (same style as "Goals", "Personal Details", etc.):
- Icon: medical/health icon (e.g. `heart.text.square` SF Symbol)
- Label: "Health & Injuries"
- Value: show active injury count if > 0, e.g. "2 active"
- Navigation: pushes `InjuryManagementView` onto the navigation stack

---

### Screen Layout

The screen has a **navigation bar** with title "Health & Injuries" and a **+ button** (top right) to add a new injury.

Display injuries in a `List` or `ScrollView`, sectioned by status:

```
Section: "Active / Recovering"   — RECOVERING status
Section: "Chronic / Ongoing"     — CHRONIC status
Section: "Healed / Archive"      — HEALED status (collapsed by default or at bottom)
```

If no injuries, show a centred empty-state message: *"No injuries recorded. Tap + to add one."*

---

### Injury Row / Card

Each injury displays:

```
┌─────────────────────────────────────────┐
│  Knee                  [Recovering]     │
│  Injured on 2026-06-01                  │
│  Recovery: 75%  (3 of 4 weeks)          │
│  Notes: Twisted during hill run         │
│                                         │
│  [Mark Healed]   [Edit]        🗑        │
└─────────────────────────────────────────┘
```

- **Status badge**: colour-coded pill
  - RECOVERING → orange `#E65100`
  - CHRONIC    → purple `#7B1FA2`
  - HEALED     → green  `#2E7D32`

- **Recovery progress**: only shown when `estimatedRecoveryWeeks` is set. Calculate:
  ```
  weeksElapsed = daysBetween(injuryDate, today) / 7
  progress = min(weeksElapsed / estimatedRecoveryWeeks, 1.0)
  ```

- **"Mark Healed" button**: shown only for `RECOVERING` injuries.
  - On tap: update `status = "HEALED"`, set `recoveryDate` to today, call PUT endpoint, refresh list.

- **"Edit" button**: opens the Add/Edit sheet for all non-HEALED injuries.

- **Delete (🗑)**: confirms before calling DELETE. Show `"Mark as healed before deleting"` alert if server returns 400.

- **Prosthetic indicator**: if `isProstheticOrAFO == true`, show a blue info line:
  `"Device: Carbon fiber AFO (ankle-foot orthotic)"`

---

### Add / Edit Sheet

A modal sheet or form with the following fields in order:

| Field | Control | Notes |
|---|---|---|
| Body Part | Picker / Menu | Use `bodyParts` list; allow typing custom |
| Status | Segmented control or Picker | RECOVERING / CHRONIC / HEALED |
| Severity | Segmented control | MILD / MODERATE / SEVERE |
| Injury Date | DatePicker | date-only, outputs `"YYYY-MM-DD"` |
| Est. Recovery (weeks) | Stepper or numeric field | Optional |
| Notes | TextEditor (multi-line) | Optional |
| Uses Prosthetic/AFO | Toggle | |
| Device Type | Picker (if toggle ON) | Use `prostheticTypes` list; allow typing |

**Validation**: `bodyPart` must be non-empty before Save is enabled.

On **Save**:
- New injury → POST → refresh user + injury list
- Edit → PUT with full updated object → refresh

---

## 5. After Any Change: Refresh User Profile

After every add/update/delete, re-fetch the user from `GET /api/users/me` and update the local cached user. This ensures `user.injuries` stays in sync and the coaching plan picker reflects the latest state.

---

## 6. How It Affects the Training Plan / Coaching

No iOS-specific changes are needed for this part — it's all server-side. Once the user's injury data is correctly saved via the API:

- **Plan generation** automatically uses active injuries as constraints
- **Healed injuries are ignored** — they won't appear as constraints in new plans
- **Session type preference** (`user.defaultSessionType`) is already passed to the prompt — confirm this field exists in the iOS `User` model

---

## 7. Existing Profile Navigation Pattern

Check how existing profile navigation rows are implemented (e.g. the "Goals" or "Connected Devices" rows) and match the same pattern exactly for consistency. On iOS this is likely a `NavigationLink` within a `List` inside `ProfileView`.

---

## 8. Summary Checklist

- [ ] `Injury` struct + `InjuryStatus` + `InjurySeverity` enums (Codable)
- [ ] `User` model has `injuries: [Injury]?` and deserialises from `/api/users/me`
- [ ] `InjuryService` (or equivalent) with `getInjuries()`, `addInjury()`, `updateInjury()`, `deleteInjury()`
- [ ] `InjuryManagementView` — list sectioned by status, empty state, nav bar + button
- [ ] `InjuryCard` / row — status badge, recovery progress, Mark Healed, Edit, Delete
- [ ] `AddEditInjuryView` — sheet with all fields, pickers for body part and prosthetic type
- [ ] Mark Healed: sets status + recoveryDate → PUT → refresh
- [ ] Delete: 404/400 error handling, confirm dialog
- [ ] Profile screen: add "Health & Injuries" navigation row with active-count badge
- [ ] Refresh `GET /api/users/me` after every mutation
