# iOS Walking Session Implementation - Quick Reference

## TL;DR

Add walking session support to iOS. Backend + coaching logic already done. You just need:
1. UI for activity type selection (2 screens)
2. Split frequency logic (1 function)
3. API integration (add 1 field)

**Time**: 2-3 hours | **Complexity**: Medium | **Risk**: Low

---

## 3 Key Changes

### 1. Onboarding (30 min)

**File**: ProfileSetupScreen or equivalent

**Add after fitness level picker**:
```swift
Picker("Preferred Activity Type", selection: $profile.defaultSessionType) {
    Text("Running").tag("run")
    Text("Walking").tag("walk")
    Text("Interval Training").tag("interval")
}

// Save to API:
PATCH /api/users/{id}
{ "defaultSessionType": "walk" }
```

---

### 2. Run Session - Split Frequency (45 min)

**File**: RunSession.swift equivalent

**Add function**:
```swift
func getSplitFrequency(sessionType: String) -> Double {
    return sessionType == "walk" ? 0.5 : 1.0
}

// Update split detection:
let splitFrequency = getSplitFrequency(sessionType: sessionMetadata.sessionType)
let currentSplitDistance = floor(distance / splitFrequency) * splitFrequency

if currentSplitDistance > lastKmAnnounced {
    // Trigger split at 0.5km, 1.0km, 1.5km for walkers
    // Trigger split at 1km, 2km, 3km for runners
}
```

---

### 3. API Integration (30 min)

**Add to both coaching API calls**:
```swift
let payload = [
    "currentPace": "...",
    "distance": distance,
    "sessionType": sessionMetadata.sessionType  // ← ADD
]
```

---

## File Changes Summary

| File | Change | Effort |
|------|--------|--------|
| ProfileSetupScreen | Add activity type picker | 10 min |
| RunSetupScreen | Add activity type toggle | 10 min |
| RunSession | Add `getSplitFrequency()` | 20 min |
| RunSession | Update split detection | 20 min |
| RunSession | Update API calls (2x) | 10 min |
| Tests | Add unit/integration tests | 30 min |

**Total**: ~2 hours coding + testing

---

## Test Scenarios

```
✓ Walk 6km at 12:00/km → splits at 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, ..., 6.0km
✓ Run 6km at 6:00/km → splits at 1, 2, 3, 4, 5, 6km
✓ Phase transitions feel natural
✓ Walking statements appear (not running)
✓ Running behavior unchanged
```

---

## Copy-Paste Code Blocks

### Split Frequency Function
```swift
func getSplitFrequency(sessionType: String) -> Double {
    return sessionType == "walk" ? 0.5 : 1.0
}
```

### Split Detection Logic
```swift
let splitFrequency = getSplitFrequency(sessionType: sessionMetadata.sessionType)
let currentSplitDistance = floor(distance / splitFrequency) * splitFrequency

if currentSplitDistance > lastKmAnnounced && currentSplitDistance > 0 {
    lastKmAnnounced = currentSplitDistance
    
    let splitLabel = String(format: "%.1f", currentSplitDistance) + "km"
    print("[Split] \(splitLabel) reached")
    
    // Trigger coaching
}
```

### API Payload Addition
```swift
let payload: [String: Any] = [
    "userId": userId,
    "currentPace": currentPace,
    "distance": distance,
    "sessionType": sessionMetadata.sessionType,  // ← ADD THIS LINE
    // ... other fields ...
]
```

### Phase Determination with Activity Type
```swift
let phase = determinePhase(
    distanceKm: currentDistance,
    totalDistanceKm: targetDistance,
    activityType: sessionMetadata.sessionType  // ← ADD THIS
)
```

---

## What NOT to Change

✅ **Leave unchanged**:
- Running behavior (already perfect)
- Existing split messages
- Coaching API structure
- Database schema (already updated)
- Shared coaching-statements.ts (already done)

---

## Verification Checklist

After implementation:
- [ ] No breaking changes to runner experience
- [ ] Walker gets splits every 6-7 minutes
- [ ] Phase transitions feel right
- [ ] No linting errors
- [ ] Tests pass
- [ ] Backward compatible

---

## Resources

- **Full Brief**: `iOS_WALKING_SESSION_IMPLEMENTATION_BRIEF.md`
- **Walking Coaching Examples**: `WALKING_COACHING_EXAMPLES.md`
- **Android Reference**: `client/src/pages/RunSession.tsx`
- **Shared Logic**: `shared/coaching-statements.ts`

---

## Success = Done

You're done when:
1. ✅ Activity type selector in onboarding + run setup
2. ✅ 500m splits for walkers, 1km for runners
3. ✅ sessionType passed to APIs
4. ✅ All tests pass
5. ✅ No breaking changes

---

## Questions?

Check `iOS_WALKING_SESSION_IMPLEMENTATION_BRIEF.md` for:
- Detailed code examples
- Testing strategy
- Troubleshooting guide
- Performance considerations
- API documentation

**Good luck! You've got this.** 🚀
