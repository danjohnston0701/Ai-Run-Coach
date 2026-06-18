# Injury Recovery Tracking: Critical Gap Analysis

## The Problem

You've identified a critical issue: **Temporary injuries permanently impact future coaching plans.**

### Current State
✅ System stores injuries with `status` field (RECOVERING, HEALED, CHRONIC)  
✅ System filters out HEALED injuries from plan generation  
✅ System checks injury date to calculate "weeks since injury"  
❌ **Users have NO way to mark an injury as "HEALED"** after plan is created  
❌ Users can only delete injuries (not mark recovered)  

### Impact on Nino's Example
```
Week 0: Nino has [post-stroke recovery, AFO]
Week 2: Nino's post-stroke recovery is progressing well
Week 4: Nino has NEW knee pain (temporary, likely 2-3 weeks)
Week 7: Knee pain is HEALED, Nino is back to normal
Week 8-12: Next plan generation happens...

PROBLEM:
├─ Knee pain from Week 4 is STILL in injuryHistory
├─ Status is still "RECOVERING" (user can't update it)
├─ Next plan treats knee as ongoing constraint
└─ Even though it healed a month ago!
```

---

## Root Cause

### Where Injuries Come From
1. **Plan Generation Screen** (`GeneratePlanScreen.kt`)
   - User adds injuries BEFORE generating plan
   - Uses local viewModel state
   - Updates temporary list, NOT backend database

2. **User Profile** (`users.injuryHistory`)
   - JSONB field on users table
   - Contains array of Injury objects with status
   - Only way to update: Delete and re-add

3. **What's Missing**
   - ❌ No "Health/Recovery Settings" screen
   - ❌ No dedicated injury management interface
   - ❌ No API to update injury status
   - ❌ No UI to mark injury as "healed"
   - ❌ No way to distinguish temporary vs permanent injuries

---

## System Impact

### How Injury Status is Used

**In Plan Generation** (training-plan-service.ts):
```typescript
const hasActiveInjury = injuries && injuries.some(i =>
  ['active','recovering','ACTIVE','RECOVERING','chronic','CHRONIC'].includes(i.status)
);

if (hasActiveInjury) {
  // Use effort-based pacing (no speed targets)
  // Conservative progression
  // Avoid intensity work
}
```

**If status remains "RECOVERING"**:
- Next plan generation will apply same conservative constraints
- Even if injury is actually healed

**If user deletes injury instead**:
- No record of it ever existed
- Can't track recovery history
- History information lost

---

## The Solution: Injury Recovery Tracking Feature

### What We Need to Build

#### 1. API Endpoint: Update Injury Status
```typescript
// PUT /api/user/injuries/:injuryId
// Body: { status: "HEALED" | "CHRONIC" }
// Response: Updated injury object

app.put('/api/user/injuries/:injuryId', async (req, res) => {
  const { status } = req.body;
  const userId = req.user.id;
  const injuryId = req.params.injuryId;
  
  // Get current user profile
  const user = await storage.getUser(userId);
  
  // Find and update the injury
  const updatedInjuries = user.injuryHistory.map((inj: Injury) => {
    if (inj.id === injuryId) {
      return { ...inj, status, healedAt: new Date() };
    }
    return inj;
  });
  
  // Save to database
  await storage.updateUser(userId, { injuryHistory: updatedInjuries });
  
  res.json(updatedInjuries);
});
```

#### 2. UI Screen: Injury Recovery Management
```
Navigation:
Profile → Health & Injuries (or Settings → Injuries)

Screen shows:
├─ Active/Recovering Injuries
│  ├─ [Post-stroke recovery] - Recovering (injured 8 weeks ago)
│  │  └─ Button: "Mark as Healed"
│  └─ [AFO prosthetic] - Chronic (permanent)
��     └─ Button: "Edit notes" (can't change status)
│
├─ Healed Injuries (Archive)
│  └─ [Knee pain] - Healed on 2026-06-15
│     └─ Button: "Mark as Recovering" (revert if needed)
│
└─ Actions
   ├─ Add New Injury
   └─ Delete (only if HEALED or CHRONIC)
```

#### 3. Enhanced Injury Model
```typescript
data class Injury(
    val id: String? = null,
    val bodyPart: String,
    val status: InjuryStatus,  // RECOVERING, HEALED, CHRONIC
    val notes: String? = null,
    val injuryDate: String? = null,     // When injured
    val healedDate: String? = null,     // NEW: When marked healed
    val isProstheticOrAFO: Boolean = false,
    val prostheticType: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()  // NEW: Last status change
)
```

#### 4. Backend Logic: Filter Healed Injuries from Plans
```typescript
// In training-plan-service.ts generateTrainingPlan()

// Only include active/recovering/chronic injuries
const activeInjuries = injuries.filter(i => 
  ['active','recovering','ACTIVE','RECOVERING','chronic','CHRONIC'].includes(i.status)
);

// Pass to OpenAI only active ones
const injuryLines = activeInjuries.map(i => {
  // ... show status and weeks since injury ...
});
```

---

## Implementation Roadmap

### Phase 1: Backend (2 hours)
- [ ] Add `healedDate` and `updatedAt` to Injury model
- [ ] Add PUT endpoint `/api/user/injuries/:injuryId`
- [ ] Add POST endpoint `/api/user/injuries/:injuryId/mark-healed` (simpler)
- [ ] Update training plan logic to ignore HEALED injuries

### Phase 2: UI (3 hours)
- [ ] Create "Health & Injuries" management screen
- [ ] Show active vs healed injuries in separate sections
- [ ] Add "Mark as Healed" button to each injury
- [ ] Add confirmation dialog before marking healed
- [ ] Show injury timeline (created, healed, duration)

### Phase 3: Testing (1 hour)
- [ ] Test marking injury as healed
- [ ] Generate new plan, verify healed injury doesn't affect it
- [ ] Test reverting marked injury back to recovering
- [ ] Test with Nino's scenario

### Total Effort: ~6 hours

---

## Alternative Solutions (Not Recommended)

### Option A: Auto-Expire Injuries
```
Problem: How do we know when injury is healed?
├─ Could auto-expire after 12 weeks
├─ But some take 6 weeks, some take 6 months
├─ Could be wrong for most users
└─ Unpredictable for coaches
```

### Option B: Remove Injury Tracking Entirely
```
Problem: Loses all recovery history
├─ Can't see what injuries user had
├─ Can't track recovery progress
├─ Coaching becomes less informed
└─ Bad for comeback training plans
```

### Option C: Just Delete Instead of Healing
```
Problem: No recovery record
├─ User loses injury history
├─ Can't see when it was recovered
├─ Can't reference in future plans
└─ Wastes the context we collected
```

---

## Why This Matters

### For Nino
```
Good Implementation:
└─ Week 4: Add knee pain (temporary)
└─ Week 7: Mark knee pain as HEALED
└─ Week 8: Next plan ignores knee entirely
└─ Result: Personalized plan for current state ✓

Current System:
└─ Week 4: Add knee pain (temporary)
└─ Week 7: Knee is healed but status still "RECOVERING"
└─ Week 8: Next plan is still overly conservative for knee
└─ Result: Wasted conservative constraints ✗
```

### For Planning Edge Cases
```
AFO Prosthetic:
├─ Status: CHRONIC (never fully "healed")
├─ But could be improved/upgraded
├─ Could mark as HEALED if removed surgically
├─ System must support permanent injuries ✓

Post-stroke Recovery:
├─ Status: RECOVERING initially
├─ Can transition to CHRONIC if limits remain
├─ Or HEALED if full recovery
├─ System must support all transitions ✓
```

---

## Technical Considerations

### Database
- injuryHistory is JSONB — perfect for this
- Just add healedDate and updatedAt fields
- No migration needed (JSONB is flexible)

### API Design
```typescript
// Simple approach
PUT /api/user/injuries/:injuryId
{ "status": "HEALED" }

// OR more explicit
POST /api/user/injuries/:injuryId/mark-healed
{ }
```

### Filtering in Plans
```typescript
// Before: Include all injuries
const injuries = user.injuryHistory || [];

// After: Only active/recovering/chronic
const activeInjuries = (user.injuryHistory || []).filter(i =>
  ['RECOVERING','ACTIVE','CHRONIC'].includes(i.status?.toUpperCase())
);
```

### Plan Regeneration
```
When injury status changes:
├─ Should we auto-regenerate active plans? NO
├─ Should we just apply it to next plan? YES
├─ Should we notify user? YES
└─ Should we suggest regeneration? MAYBE
```

---

## Summary

**The Problem**: Temporary injuries become permanent constraints because users can't mark them as healed.

**The Solution**: Add injury management UI + API to update status, filter healed injuries from plan logic.

**The Impact**: Nino's plan adapts to his current health state, not his entire injury history.

**The Effort**: ~6 hours to implement fully.

**The Alternative**: Users delete injuries (losing history) or live with outdated constraints.

---

## Next Steps

1. **Decide**: Do we implement this feature?
2. **If Yes**: Start with Phase 1 (backend) since UI can wait
3. **If No**: Document limitation: "Temporary injuries should be deleted after recovery"

**Recommendation**: This is important for long-term plan quality. Worth implementing.
