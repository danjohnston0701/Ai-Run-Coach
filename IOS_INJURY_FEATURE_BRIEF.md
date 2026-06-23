# iOS Brief: Health & Injuries Feature

## Context

We've just shipped a comprehensive **Health & Injuries** management feature to the Android app with significant UI/UX improvements. The iOS app needs the same feature. This brief describes exactly what to build, including all API contracts, data models, and UI behaviour.

---

## 1. Data Model

Create an `Injury` struct and supporting enums. This maps 1:1 to the JSON the server returns.

```swift
struct Injury: Codable, Identifiable {
    var id: String?
    var bodyPart: String
    var injurySide: String?            // "Left" or "Right" for bilateral body parts
    var status: InjuryStatus
    var severity: InjurySeverity
    var notes: String?
    var injuryDate: String?            // "YYYY-MM-DD"
    var estimatedRecoveryWeeks: Int?
    var recoveryDate: String?          // "YYYY-MM-DD" — set when status → HEALED
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

// Body parts that have left/right variants
let bilateralBodyParts = Set([
    "Knee", "Ankle", "Hip", "Shoulder", "Elbow", "Wrist", "Foot", "Leg", "Arm",
    "Hamstring", "Quad", "Calf", "IT Band", "Achilles", "Plantar Fascia"
])

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
  "injurySide": "Left",
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
Delete an injury. **Can be deleted at any status** (RECOVERING, CHRONIC, or HEALED).

```
Response: { "message": "Injury deleted successfully" }
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

### Screen Layout — Tabbed Interface (NEW)

Instead of sections, use **3 tabs** to organize injuries by status:

```
[Recovering: 1]  [Chronic: 0]  [Healed: 3]
```

Each tab shows:
- Tab label + count badge (number of injuries in that status)
- List of injuries for that status
- Empty state if no injuries

**Tab styling**:
- Active tab has underline indicator
- Count badges show number in a small circle
- Match the Goals screen tab design for consistency

**Empty states** (customized per tab):
- Recovering: "No active injuries. Add one to get personalized training."
- Chronic: "No chronic conditions recorded."
- Healed: "You have no healed injuries."

---

### Injury Card

Each injury displays in a card with:

```
╔════════════════════════════════════════╗
║  Knee · Left              [✎ Edit]     ║  ← Edit button top-right
║  Since 2026-06-01                      ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║  ⚠ Moderate                            ║
║  ⏱ Recovery 75% (3 of 4 weeks)         ║
║  Notes: Twisted during hill run        ║
║  🦿 Device: Carbon fiber AFO           ║
║                                        ║
║  [✓ Mark as Healed]         [🗑 Delete]║  ← Action buttons
╚════════════════════════════════════════���
```

**Key improvements from Android implementation**:

- **Edit button in top-right** — moved from bottom row for better accessibility
- **Status badge removed** — redundant since viewing a specific tab
- **"Mark as Healed" button expanded** — full width with better touch target
- **Delete icon button** — smaller, on the right side
- **Left accent bar** — 4dp colored bar (amber/purple/green) matches status
- **Date format**: "Since DD-MM-YYYY" for display
- **Recovery progress**: only shown when `estimatedRecoveryWeeks` is set

**Status colors**:
- RECOVERING → amber `#FFB300`
- CHRONIC    → purple `#AB47BC`
- HEALED     → green  `#4CAF50`

**Actions**:
- **"Mark Healed"** (RECOVERING only): updates status, sets recoveryDate to today, calls PUT, refreshes tab
- **Edit**: opens the Add/Edit sheet
- **Delete**: no confirmation needed, deletes immediately at any status (all statuses allowed per server)

**Prosthetic indicator**: if `isProstheticOrAFO == true`, show:
```
🦿 Device: Carbon fiber AFO (ankle-foot orthotic)
```

---

### Add / Edit Sheet

A modal sheet or form with the following fields in order:

| Field | Control | Notes |
|---|---|---|
| Body Part | TextField with autocomplete | Use `bodyParts` list; allow typing custom |
| Which Side? | 2 buttons: Left / Right | Only show if `bilateralBodyParts` contains selected body part |
| Status | Radio buttons or Picker | RECOVERING / CHRONIC / HEALED (3 options with descriptions) |
| Severity | 3 buttons (segmented) | MILD / MODERATE / SEVERE |
| Date of Injury | DatePicker | **MUST be a calendar picker, not free-text** |
| Est. Recovery (weeks) | TextField (numeric) | Optional, only show when status = RECOVERING |
| Notes | TextEditor (multi-line) | Optional |
| Prosthetic/AFO Device | Toggle | |
| Device Type | Picker or TextField | Only show if toggle ON; use `prostheticTypes` list |

**Key UX improvements**:

1. **Date picker MUST be a native calendar picker** — not a text field
   - Tap the field → calendar appears
   - User selects date → calendar closes, date displays as "DD-MM-YYYY"
   - Internally store as "YYYY-MM-DD"

2. **Sheet scrolling** — must scroll properly when keyboard is open
   - When user types in notes, keyboard shouldn't hide buttons
   - Users should see Cancel/Save buttons at all times

3. **Validation**: `bodyPart` must be non-empty before Save is enabled

4. **On Save**:
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

## 7. Usage Tracking: AI Coaching KM

**IMPORTANT**: When tracking AI coaching usage, the system now uses **actual coaching data** instead of just a toggle flag:

- If a run has **AI coaching notes** (`aiCoachingNotes.count > 0`) → the km is deducted from the user's quota
- If a run has **no coaching notes** (empty array) → km is **NOT** deducted, even if the user had AI enabled

This allows watch-started runs, briefing-only runs, and Garmin-native imports to correctly avoid quota deduction when coaching didn't actually occur.

---

## 8. Existing Profile Navigation Pattern

Check how existing profile navigation rows are implemented (e.g. the "Goals" or "Connected Devices" rows) and match the same pattern exactly for consistency. On iOS this is likely a `NavigationLink` within a `List` inside `ProfileView`.

---

## 9. Summary Checklist

- [ ] `Injury` struct + `InjuryStatus` + `InjurySeverity` enums (Codable)
- [ ] `injurySide` field added to Injury struct ("Left"/"Right" for bilateral parts)
- [ ] `User` model has `injuries: [Injury]?` and deserializes from `/api/users/me`
- [ ] `InjuryService` (or equivalent) with `getInjuries()`, `addInjury()`, `updateInjury()`, `deleteInjury()`
- [ ] `InjuryManagementView` — **tabbed interface** (Recovering, Chronic, Healed) with count badges
- [ ] `InjuryCard` — status color bar, recovery progress, Edit button in top-right, Mark Healed + Delete buttons
- [ ] `AddEditInjuryView` — all fields, **native calendar date picker** (not text field)
- [ ] Side selector — conditionally shown for bilateral body parts
- [ ] Mark Healed: sets status + recoveryDate → PUT → refresh
- [ ] Delete: no confirmation needed, allowed at any status
- [ ] Profile screen: add "Health & Injuries" navigation row with active-count badge
- [ ] Refresh `GET /api/users/me` after every mutation
- [ ] Sheet scrolls properly when keyboard is open
- [ ] Body part suggestions/autocomplete in Add/Edit sheet
