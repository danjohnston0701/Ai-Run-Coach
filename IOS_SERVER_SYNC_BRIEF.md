# iOS App ↔ Server Sync Brief
## Session: 28 June 2026 — Post-Run Session Bug Fixes

This document describes every server-side change made today that the iOS app
must be aware of.  Most changes are **backwards-compatible** (the server handles
old payloads gracefully), but several require the iOS app to handle new response
shapes or send new fields to get full benefit.

---

## 1. In-Run Coaching Endpoints — New "Skip" Response Shape

**Affected endpoints (all POST):**
- `/api/coaching/pace-update`
- `/api/coaching/phase-coaching`
- `/api/coaching/struggle-coaching`
- `/api/coaching/cadence-coaching`
- `/api/coaching/elevation-coaching`
- `/api/coaching/elite-coaching`
- `/api/coaching/hr-coaching`
- `/api/coaching/interval-coaching`

### What changed
A server-side **coaching cooldown manager** now prevents back-to-back AI cues
from firing too close together.  When a cue is suppressed, the endpoint returns
HTTP **200** (not an error) with a skip payload instead of `{ message, audio }`.

### New response shape when suppressed

```json
{ "skipped": true, "reason": "cooldown",         "retryAfter": 42 }
{ "skipped": true, "reason": "split_interval"                      }
{ "skipped": true, "reason": "half_km_disabled"                    }
```

| `reason`             | Meaning                                                             |
|----------------------|---------------------------------------------------------------------|
| `cooldown`           | 90-second gap not yet elapsed since last non-milestone cue.        |
| `split_interval`     | User configured "every 2km" splits — this km number is skipped.   |
| `half_km_disabled`   | User has disabled 500m check-ins in their settings.                |

### Action required
iOS must check `response.skipped === true` before attempting to play audio or
display coaching text.  If skipped, silently discard — do **not** show an error
or play a fallback sound.

```swift
if let skipped = response["skipped"] as? Bool, skipped {
    return  // silently ignore
}
// else: play audio, display text as normal
```

---

## 2. Voice / Persona Settings — Server is Now Authoritative

**Affected endpoints:** all 8 coaching endpoints above.

### What changed
Previously the server used `coachGender`, `coachAccent`, `coachTone`, and
`coachName` directly from the request body.  The server now **overrides those
values with the user's stored DB preferences** — the request body values are
only used as a fallback if the DB lookup fails.

### Fields now DB-authoritative (server overrides)

| Field         | Affects                                                          |
|---------------|------------------------------------------------------------------|
| `coachGender` | Polly voice selection (male / female)                            |
| `coachAccent` | Polly voice selection + AI accent phrasing                       |
| `coachTone`   | Polly voice energy variant + AI coaching personality             |
| `coachName`   | TTS instructions persona (what the coach calls themselves)       |

### Action required
The iOS app should still **send all four fields** in every coaching request body
— they serve as the fallback if the DB lookup fails mid-run.  The values can
come from a local cached copy of the user's settings.

```swift
let coachPayload: [String: Any] = [
    "userId":      userId,
    "coachGender": userSettings.coachGender,   // "male" | "female"
    "coachAccent": userSettings.coachAccent,   // "british" | "irish" | "australian" | ...
    "coachTone":   userSettings.coachTone,     // "energetic" | "calm" | "encouraging" | ...
    "coachName":   userSettings.coachName,     // e.g. "Coach Sam"
    // ... run telemetry fields
]
```

---

## 3. POST /api/runs — Smart Unit Detection

### What changed
The server now auto-detects and normalises **distance** (metres vs km) and
**duration** (milliseconds vs seconds) using `startTime` as an anchor.

### Recommended payload fields

| Field        | Send as            | Notes                                                  |
|--------------|--------------------|--------------------------------------------------------|
| `distance`   | **metres** (Float) | e.g. `3401.9` for a 3.4km run                        |
| `duration`   | **milliseconds**   | e.g. `1191000` for a 19m 51s run                     |
| `startTime`  | **ISO 8601 string** or **epoch ms** | Critical for smart duration detection |

If `startTime` is absent the server falls back to a threshold check (`> 86400`
= treat as ms).  Sending `startTime` makes unit detection more accurate for
short runs (< 90 seconds) where the threshold alone is ambiguous.

### Storage rule (canonical — server enforces)
Regardless of what iOS sends, the DB always stores:
- `runs.distance` → **km**
- `runs.duration` → **seconds**

---

## 4. New Field on Run Records — `coachingInsight`

### What changed
After every run save the server runs a background AI plan reassessment and
stores the result on `runs.coaching_insight` (JSONB).

### Shape
```json
{
  "reason":         "Your HR stayed in zone 3 — good aerobic effort.",
  "recommendation": "Keep tomorrow's run easy; don't add volume yet.",
  "adjustmentType": "none",          // "none" | "volume_reduction" | "volume_increase" | "intensity_adjustment" | "recovery_addition"
  "needsAdjustment": false,
  "generatedAt":    "2026-06-28T12:30:00.000Z"
}
```

This field is **null** for users without an active training plan.

### Action required
The `coaching_insight` field will now appear on any `GET /api/runs/:id` response.
iOS should handle it being `null` gracefully (no crash).  If your post-run
summary screen wants to surface the coach's assessment, read `coachingInsight`
from the run object — it is also automatically included in the comprehensive
analysis prompt so the AI summary will reference it.

---

## 5. POST /api/runs/:id/comprehensive-analysis — Now Uses coaching_insight

### What changed
The post-run AI summary now automatically incorporates the plan reassessment
insight stored in `runs.coaching_insight`.  No payload change needed — the
server reads it from the run record internally.

### What iOS sees
The response shape is unchanged.  The AI-generated text will now naturally
include the plan-specific coaching observation (e.g. "Your coach noted your HR
was high — here's what that means for your training this week…").

---

## 6. New DB Columns — Handle Nulls Gracefully

Several new columns were added to existing tables.  All are **nullable** — iOS
must not crash if they are absent or null.

| Table        | New Column(s)                                                           |
|--------------|-------------------------------------------------------------------------|
| `user_stats` | `pb_20k_duration_ms`, `pb_20k_run_id`, `pb_20k_date`                   |
| `user_stats` | `longest_run_time_sec`, `highest_elevation_m`                           |
| `user_stats` | `most_consecutive_runs`, `goals_achieved`                               |
| `user_stats` | `ai_runner_profile`, `ai_runner_profile_updated_at`                     |
| `user_stats` | `coaching_observations` (JSONB)                                         |
| `segments`   | `avg_gradient` (REAL), `max_gradient` (REAL)                            |
| `runs`       | `coaching_insight` (JSONB) — see section 4 above                        |

---

## 7. TTS Pace Format — No Action Required

The server now converts all `M:SS` pace notation to spoken English before
sending to Polly (e.g. `"5:20"` → `"5 minutes and 20 seconds per kilometer"`).
This is server-side only — iOS does not need to change anything, but note that
**TTS audio will sound more natural** starting from this deployment.

---

## 8. Summary of Required iOS Changes

| Priority | Change                                                                              |
|----------|-------------------------------------------------------------------------------------|
| **Must** | Handle `{ skipped: true }` response from all 8 coaching endpoints (Section 1)      |
| **Must** | Handle `runs.coaching_insight` being null or a JSONB object (Section 4)            |
| **Must** | Handle new nullable `user_stats` columns without crashing (Section 6)              |
| **Should** | Send `startTime` in `POST /api/runs` payload for accurate unit detection (Section 3) |
| **Should** | Send all 4 coach persona fields in coaching requests as DB fallback (Section 2)    |
| **Optional** | Surface `coaching_insight.recommendation` in post-run summary UI (Section 4)    |

---

## 9. Endpoints NOT Changed

These endpoints work exactly as before — no iOS changes needed:

- `GET /api/runs` (run list)
- `GET /api/runs/:id` (single run — shape unchanged, new nullable fields added)
- `GET /api/user/stats`
- All training plan endpoints
- All goal endpoints
- All Garmin webhook/sync endpoints
- `POST /api/coaching/session-instructions` (pre-run briefing)
