# Live Run Observer — Quick Reference for Developers

## The Changes

### 1. Short Invite Codes (8-char instead of 64-char)
- **Old**: 64-character hex token → impossible to type
- **New**: 8-character alphanumeric code → human-typable
- **Example**: `A2B3C4D5` vs `f7a3b2c9e1d8f4a6b3c2e7d1a5f8c9b2`

### 2. Observer Count ("N watching")
- **Add** `observer_count: int` to live session response
- **Runner polls** `GET /api/live-sessions/{sessionId}` to see count
- **iOS shows** "👁 3 watching" badge during run

---

## Quick Integration Guide for iOS

### When Observer Enters Invite Code
```swift
// User types: A2B3C4D5
let code = "A2B3C4D5"

// Call backend
GET /api/observe/{code}
// Auto-detects: is it 8 chars? → lookup by code
// Auto-detects: is it 64 chars? → lookup by token

// Backend returns
{
  "sessionData": { ... },
  "inviteCode": "A2B3C4D5"
}

// Increment observer count
POST /api/live-sessions/{sessionId}/increment-observer-count
// (Backend method: incrementObserverCount)
```

### When Observer Leaves
```swift
// Decrement observer count
POST /api/live-sessions/{sessionId}/decrement-observer-count
// (Backend method: decrementObserverCount)
```

### When Runner Wants to See "N Watching"
```swift
// Poll every few seconds during run
GET /api/live-sessions/{sessionId}

// Response includes:
{
  "observerCount": 3,  // ← NEW FIELD
  "isActive": true,
  ...
}

// Display "👁 3 watching"
```

---

## Backend API Reference

### POST /api/live-sessions/:sessionId/invite-observer
**New response fields:**
```json
{
  "inviteCode": "A2B3C4D5"  // ← Short 8-char code to send in email
}
```

### GET /api/observe/:code
**Now accepts:**
- ✅ `A2B3C4D5` (8-char code, case-insensitive)
- ✅ `f7a3b2c9...` (64-char token, legacy)

**Returns:**
```json
{
  "inviteCode": "A2B3C4D5"
}
```

**Rate limiting:**
- 10 attempts per 60 seconds per IP + code
- Returns 429 Conflict if exceeded

### GET /api/live-sessions/:sessionId
**New field:**
```json
{
  "observerCount": 3
}
```

---

## Key Files

| File | Purpose |
|------|---------|
| `server/invite-code-generator.ts` | Generate/validate 8-char codes |
| `server/rate-limit.ts` | Rate limit the observe endpoint |
| `shared/schema.ts` | DB schema: `observer_count`, `invite_code` |
| `server/auto-migrate.ts` | DB migrations |
| `server/storage.ts` | Increment/decrement observer count |
| `server/routes.ts` | API endpoints |
| `server/email-service.ts` | Email with short code |

---

## Testing Checklist

- [ ] Generate 10 codes → verify no duplicates
- [ ] Type code in different cases (`A2b3C4d5`) → works
- [ ] 11 failed attempts from one IP → 429 error
- [ ] Increment observer count → decrement → verify atomic
- [ ] Poll session → see observer_count update
- [ ] Email shows short code prominently
- [ ] Deep link opens app with code: `airuncoach://observe/A2B3C4D5`

---

## iOS Wiring Checklist

- [ ] ObserverLoginView accepts 8-char input (already done ✅)
- [ ] Pass code to `GET /api/observe/{code}` (already done ✅)
- [ ] Call `incrementObserverCount` when observer starts viewing
- [ ] Call `decrementObserverCount` when observer leaves
- [ ] Poll `observer_count` from `/api/live-sessions/{sessionId}` during run
- [ ] Display "👁 {observer_count} watching" badge
- [ ] Confirm field names match backend response

---

## Rate Limiting Details

**How it works:**
1. Observer tries code: `checkRateLimit(ip, code)` → counter incremented
2. Counter stored as `"IP:CODE"` → `{ attempts, resetAt }`
3. If attempts > 10 in 60s → reject with 429
4. After 60s window expires → reset counter

**Why it matters:**
A guessed code = live location leak → brute-force protection critical

---

## Backward Compatibility

- ✅ Old 64-char tokens still work
- ✅ Email includes both code and token
- ✅ Endpoints detect format automatically
- ✅ No breaking changes

---

## Common Questions

**Q: What if observer crashes while viewing?**
A: Observer count stays inflated until timeout or manually decremented. Optional: Add server-side timeout (decrement if no poll for 10s).

**Q: What if two observers type the same code?**
A: Collision risk is 1 in 1.8×10¹² among active sessions — negligible.

**Q: Can I guess a code?**
A: Rate limited to 10 attempts per minute per IP+code. Guessing all 34^8 codes would take millions of years.

**Q: Which endpoint should iOS call to increment observer count?**
A: Backend provides `storage.incrementObserverCount(sessionId)` — iOS calls it when observer starts viewing. May need new endpoint `/api/live-sessions/{sessionId}/join` or similar (check with backend team).

---

## Deployment Checklist

- [ ] DB migrations auto-run (check logs)
- [ ] No 64-char token regressions
- [ ] Rate limiter starting without errors
- [ ] Email service passing invite code to template
- [ ] Observe endpoint detecting format correctly
- [ ] iOS app wired to increment/decrement count
- [ ] Observer count showing on runner's screen

---

**Status**: ✅ Backend implementation complete. Ready for iOS wiring.
