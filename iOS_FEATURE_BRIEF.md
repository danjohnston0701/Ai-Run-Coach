# AI Run Coach iOS App — Feature Parity Brief
## Updated Features & Implementation Guide (May 2026)

---

## Overview
This brief outlines all new features implemented in the Android app today that need to be mirrored in iOS. Focus on data models, API contracts, and UI/UX patterns.

---

## 1. Injury Recovery Goal Type
### What Changed
Added a new goal sub-type under "Health & Wellbeing" for users recovering from injuries.

### Data Model Changes
**Goal model** — Add these new optional fields:
```
injuryBodyPart: String?        // "Knee", "Ankle", "Hip", "Shin", "Foot", "Back", "Shoulder", "Other", etc.
injuryDate: String?            // ISO 8601 date (YYYY-MM-DD) — when the injury occurred
injurySeverity: String?        // "active" | "recovering" | "chronic"
injuryNotes: String?           // User's detailed description of the injury
injurySide: String?            // "left" | "right" | "both" (for bilateral body parts)
```

### UI Changes
**CreateGoalScreen (Health & Wellbeing section):**
- Replace the old "Mental Wellbeing" chip with "🩹 Injury Recovery"
- Health target layout is now:
  - Row 1: "Improve fitness" | "Lose weight" | "Build strength"
  - Row 2: "Better recovery" | "🩹 Injury Recovery" (50/50 width, side-by-side)

**When "Injury Recovery" is selected, show InjuryRecoverySection with:**
- Injured body part selector (chips: Knee, Ankle, Hip, Shin, Foot, Back, Shoulder, Other)
- Date of injury picker (calendar UI, ISO date format)
- Injury status selector (Active / Acute, Recovering, Chronic / Ongoing)
- Injury notes text field with placeholder: "e.g., Torn meniscus and sprained MCL. Pain 3/10 walking. Cleared for light activity by physio."

### API Changes
**POST /api/goals** and **PUT /api/goals/:id** now accept:
```json
{
  "healthTarget": "Injury Recovery",
  "injuryBodyPart": "Knee",
  "injuryDate": "2026-05-08",
  "injurySeverity": "active",
  "injuryNotes": "Torn meniscus...",
  "injurySide": "both"
}
```

**GET /api/goals/:userId** response now includes all injury fields in each goal object.

---

## 2. Goal-First Plan Creation Flow
### What Changed
Users can now create a coaching plan starting from Goals screen, with optional goal linking during plan creation.

### New Flow
1. User is in **Goals** tab
2. Taps "Generate Plan"
3. Navigates to **GeneratePlanScreen** (no goal pre-filled)
4. Sees a **Goal Link Nudge card** at the top:
   - **Text:** "Link this plan to a goal?"
   - **Button 1:** "Create a goal first" → navigates to CreateGoalScreen
   - **Button 2:** "Continue without a goal" → dismisses card
5. If user creates goal, they're redirected back to GeneratePlanScreen with goal pre-filled
6. Nudge disappears when goal is pre-filled

### Implementation Details
- **Nudge visibility logic:** Only show when `prefilledGoal == null`
- **Navigation:** Goal creation should return to GeneratePlanScreen with goal ID in route parameter
- **Auto-population:** If generating plan from Injury Recovery goal, auto-inject injury data into injuries list (no manual re-entry)

---

## 3. Safety Disclaimer for Injury Plans
### What Changed
When a user creates a coaching plan with injuries, the AI generates a safety disclaimer that's displayed prominently.

### Data Model Changes
**TrainingPlan model** — Add:
```
safetyDisclaimer: SafetyDisclaimerObject?
```

Where `SafetyDisclaimerObject` contains:
```
disclaimer: String              // Plain-language disclaimer text
prerequisiteChecks: List<String>   // Items user should verify (✓ checkboxes)
stopCriteria: List<String>      // Warning signs to stop immediately (✕ red items)
```

### UI Changes
**CoachingProgrammeScreen (AiPlanSummary):**
When `plan.safetyDisclaimer != null`, show an **"⚠️ Injury Modification — Important"** card:
- Background: amber/warning color
- Header: "⚠️ Injury Modification — Important"
- Content sections:
  1. **Disclaimer text** (italicized, user-facing explanation)
  2. **Before You Start** (green checkmarks, prerequisite checks)
  3. **Stop Immediately If** (red X marks, stop criteria)

### API Changes
**POST /api/training-plans/generate** response now includes:
```json
{
  "plan": {
    "safetyDisclaimer": {
      "disclaimer": "...",
      "prerequisiteChecks": ["..."],
      "stopCriteria": ["..."]
    }
  }
}
```

---

## 4. DatePicker for Injury Dates
### What Changed
Replaced manual text input (YYYY-MM-DD) with calendar-based DatePicker UI for injury dates.

### Locations
1. **CreateGoalScreen** → InjuryRecoverySection → "Date of Injury" field
2. **GeneratePlanScreen** → AddInjuryDialog → "Date of Injury" field

### Implementation Details
- Use native iOS DatePicker component (Calendar/DatePickerStyle)
- Format output as ISO 8601: `YYYY-MM-DD`
- Support both user's local timezone (convert to UTC before sending to API)
- Show helper text: "Helps the AI calculate your exact recovery stage"

---

## 5. Coaching Plan Session Context
### What Changed
Two-tier model for suppressing free-run coaching prompts during structured training sessions.

### Tier 1 Sessions (Full AI Control)
When generating from a coaching plan, suppress ALL supplementary free-run prompts for:
- `intervals`
- `hill_repeats`
- Any other session type NOT in Tier 2 list (conservative default)

**Suppress:** km split coaching, struggle detection, pace coaching, phase coaching, 500m check-ins

**Keep active:** cadence coaching, elevation coaching, final 500m motivation

### Tier 2 Sessions (Hybrid Mode)
Allow supplementary coaching for continuous-effort sessions:
- `tempo`
- `long_run`
- `easy`
- `recovery`
- `threshold`
- `race_pace`

**Allow:** km split coaching, struggle coaching (with training context)
**Suppress:** race-goal pace comparisons

### Implementation
- RunTrackingService should check `workoutType` from linked workout
- If `workoutType` exists AND not in Tier 2 list → suppress free-run prompts
- Pass `workoutType` to all coaching API calls (PaceUpdate, StruggleCoaching, etc.)

---

## 6. Goals Tab Filtering
### What Changed
Goals screen tabs now properly filter goals by status.

### Tabs & Filtering Logic
| Tab | Filter Condition |
|-----|------------------|
| **Active** | `isActive == true AND isCompleted == false` |
| **Completed** | `isCompleted == true` |
| **Abandoned** | `isActive == false AND isCompleted == false` |

### Badge Counts
Each tab should show the count of goals in that specific category, NOT total count.

### Implementation
- Filter goals list BEFORE passing to GoalsListContent
- Update badge counts dynamically based on filtered list
- Empty state message should reflect selected tab

---

## 7. AI Plan Safety & Prompt Improvements
### What Changed
Significantly improved injury-aware plan generation with better medical framing.

### Server Changes
The training plan generation prompt now includes:

1. **Medical/Legal Framing**
   - System prompt: "AI running coach with broad knowledge of general sports rehabilitation principles...not a medical professional"
   - Explicit disclaimer: "Nothing in this plan constitutes medical advice, diagnosis, or treatment"
   - Safety disclaimer output requirement: AI must explicitly state "AI training guidance, not medical advice"

2. **Priority Hierarchy for Injured Athletes**
   1. Safety
   2. Injury Recovery
   3. Goal Achievement
   4. Performance Optimisation

3. **Pacing Rules for Injury-Modified Plans**
   - No specific pace targets for rehab sessions
   - Use effort descriptors only: "comfortable conversational pace", "gentle jog — RPE 2-3/10"
   - Goal pace is labeled "LONG-TERM TARGET ONLY — do not use to anchor session paces"
   - Run history pace is ignored for injured athletes

4. **Post-Generation Validation**
   - Deterministic checks prevent dangerous plans:
     - Single-week volume jumps >30% flagged
     - Injured athletes: total weekly volume >20km in early weeks flagged
     - Session distance cannot exceed week total
     - Interval total cannot exceed session distance
     - Pace sanity checks (3:00/km minimum, 15:00/km maximum)
     - High-intensity sessions (intervals, strides, hills) flagged for weeks 1-2 of injury plans

5. **Improved HR Zone Derivation**
   - Max HR uses Tanaka formula (`208 - 0.7 × age`) instead of `220 - age`
   - Estimated max HR from history when 3+ HR-tracked runs exist (95th percentile)
   - Estimated LTHR from Zone 3/4 runs in history
   - Both values with source labels injected into prompt

### Client Impact
No iOS changes needed for these server improvements — they're automatic in API responses.

---

## 8. TTS Quality Improvements
### What Changed
Fixed unnatural pauses in text-to-speech coaching cues.

### Changes
All AI coaching prompts now include explicit rule: **"Do NOT use commas anywhere in your response."**

Example rewrite:
- ❌ Before: "Great pace, keep pushing, just 2km to go"
- ✅ After: "Great pace. Keep pushing. Just 2km to go."

### Client Impact
No iOS changes needed — handled on server side.

---

## 9. Mental Wellbeing Goal Type Removal
### What Changed
Removed "Mental Wellbeing" from Health & Wellbeing goal options.

### Updated UI Layout
Health target options are now (in CreateGoalScreen):
- Row 1: "Improve fitness" | "Lose weight" | "Build strength"
- Row 2: "Better recovery" | "🩹 Injury Recovery" (50/50 width)

Removed: "Mental Wellbeing" option entirely.

---

## API Summary

### New/Modified Endpoints
| Method | Endpoint | Changes |
|--------|----------|---------|
| **POST** | `/api/goals` | Now accepts injury fields, returns full injury data in response |
| **PUT** | `/api/goals/:id` | Now accepts injury fields, returns full injury data in response |
| **GET** | `/api/goals/:userId` | Now returns all injury fields for each goal |
| **POST** | `/api/training-plans/generate` | Response now includes `safetyDisclaimer` object |

### Field Additions Summary
```
Injury-related:
- injuryBodyPart: String?
- injuryDate: String? (ISO 8601)
- injurySeverity: String?
- injuryNotes: String?
- injurySide: String?

Safety:
- safetyDisclaimer: SafetyDisclaimerObject?
  - disclaimer: String
  - prerequisiteChecks: List<String>
  - stopCriteria: List<String>

Session context (not stored, runtime only):
- workoutType: String? (passed to coaching endpoints)
```

---

## Testing Checklist for iOS

- [ ] Create Injury Recovery goal with all fields (body part, date, severity, notes, side)
- [ ] Verify injury data persists when editing goal
- [ ] Generate plan from Injury Recovery goal → injuries auto-populate
- [ ] Verify safety disclaimer displays correctly in plan details
- [ ] Create plan without pre-filled goal → nudge appears → create goal → redirects back with goal data
- [ ] Verify DatePicker works for injury dates (both goal creation and plan creation)
- [ ] Test Goals tab filtering (Active, Completed, Abandoned show correct goals)
- [ ] Verify coaching plan sessions suppress free-run prompts for interval types
- [ ] Verify TTS coaching cues have no comma-induced pauses

---

## Notes for iOS Team
- All date fields are ISO 8601 format (YYYY-MM-DD)
- `injurySeverity` is one of: `"active"`, `"recovering"`, `"chronic"`
- `injurySide` is one of: `"left"`, `"right"`, `"both"`
- `workoutType` is one of: `"easy"`, `"tempo"`, `"long_run"`, `"intervals"`, `"hill_repeats"`, `"recovery"`, `"threshold"`, `"race_pace"`, `"walk_run"`, or custom session names
- The safety disclaimer should be displayed prominently before the user starts the plan
- All injury-related fields are optional (goal can be created without injuries)

---

**Generated:** May 27, 2026  
**Android App Version:** Current  
**Target iOS Feature Parity:** Complete
