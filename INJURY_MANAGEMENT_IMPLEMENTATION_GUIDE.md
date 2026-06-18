# Injury Management Feature — Implementation Guide

## Quick Summary

**Problem**: Users can't mark injuries as healed, so temporary injuries permanently impact plans  
**Solution**: Add API + UI to update injury status  
**Effort**: ~6 hours  
**Priority**: HIGH (affects plan quality)

---

## Phase 1: Backend (2 hours)

### Step 1: Update Injury Model (Android)

File: `app/src/main/java/live/airuncoach/airuncoach/domain/model/Injury.kt`

```kotlin
data class Injury(
    val id: String? = null,
    val bodyPart: String,
    val status: InjuryStatus,
    val notes: String? = null,
    val injuryDate: String? = null,
    val healedDate: String? = null,          // NEW
    val isProstheticOrAFO: Boolean = false,
    val prostheticType: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()  // NEW
)
```

### Step 2: Add API Endpoint (Server)

File: `server/routes.ts`

Add this after other user-related endpoints:

```typescript
// ==========================================
// INJURY MANAGEMENT ENDPOINTS
// ==========================================

/**
 * Update injury status (mark as healed, revert to recovering, etc.)
 * PUT /api/user/injuries/:injuryId
 */
app.put('/api/user/injuries/:injuryId', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { injuryId } = req.params;
    const { status } = req.body;  // "HEALED" | "RECOVERING" | "CHRONIC"

    // Validate status
    const validStatuses = ['HEALED', 'RECOVERING', 'CHRONIC', 'ACTIVE'];
    if (!validStatuses.includes(status?.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid injury status' });
    }

    // Get current user
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get current injuries
    const injuries = user.injuryHistory || [];

    // Find and update injury
    const updatedInjuries = injuries.map((inj: any) => {
      if (inj.id === injuryId) {
        return {
          ...inj,
          status: status.toUpperCase(),
          updatedAt: Date.now(),
          healedDate: status.toUpperCase() === 'HEALED' ? new Date().toISOString() : inj.healedDate,
        };
      }
      return inj;
    });

    // Check if injury was actually found
    if (updatedInjuries.length === injuries.length && 
        !updatedInjuries.some((inj: any) => inj.id === injuryId)) {
      return res.status(404).json({ error: 'Injury not found' });
    }

    // Save to database
    await storage.updateUser(userId, { injuryHistory: updatedInjuries });

    res.json({ 
      message: 'Injury status updated',
      injury: updatedInjuries.find((inj: any) => inj.id === injuryId)
    });
  } catch (error) {
    console.error('Error updating injury:', error);
    res.status(500).json({ error: 'Failed to update injury' });
  }
});

/**
 * Get user's injuries
 * GET /api/user/injuries
 */
app.get('/api/user/injuries', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const injuries = user.injuryHistory || [];
    
    // Separate by status
    const active = injuries.filter((i: any) => 
      ['RECOVERING', 'ACTIVE'].includes(i.status?.toUpperCase())
    );
    const chronic = injuries.filter((i: any) => 
      i.status?.toUpperCase() === 'CHRONIC'
    );
    const healed = injuries.filter((i: any) => 
      i.status?.toUpperCase() === 'HEALED'
    );

    res.json({ active, chronic, healed, all: injuries });
  } catch (error) {
    console.error('Error fetching injuries:', error);
    res.status(500).json({ error: 'Failed to fetch injuries' });
  }
});

/**
 * Delete healed injury
 * DELETE /api/user/injuries/:injuryId
 */
app.delete('/api/user/injuries/:injuryId', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { injuryId } = req.params;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const injuries = user.injuryHistory || [];
    const injury = injuries.find((i: any) => i.id === injuryId);

    // Only allow deleting HEALED or CHRONIC injuries
    if (injury && ['HEALED', 'CHRONIC'].includes(injury.status?.toUpperCase())) {
      const updatedInjuries = injuries.filter((i: any) => i.id !== injuryId);
      await storage.updateUser(userId, { injuryHistory: updatedInjuries });
      res.json({ message: 'Injury deleted' });
    } else {
      res.status(400).json({ error: 'Cannot delete active/recovering injuries' });
    }
  } catch (error) {
    console.error('Error deleting injury:', error);
    res.status(500).json({ error: 'Failed to delete injury' });
  }
});
```

### Step 3: Update Plan Generation to Ignore Healed Injuries

File: `server/training-plan-service.ts` (around line 758)

```typescript
// BEFORE:
const hasActiveInjury = injuries && injuries.some(i =>
  ['active','recovering','ACTIVE','RECOVERING','chronic','CHRONIC'].includes(i.status)
);

// AFTER:
const hasActiveInjury = injuries && injuries.some(i =>
  ['active','recovering','ACTIVE','RECOVERING','chronic','CHRONIC'].includes(i.status) &&
  i.status?.toUpperCase() !== 'HEALED'
);
```

Do this for ALL checks (around lines 758, 776, 832) to ensure consistency.

---

## Phase 2: UI (3 hours)

### Step 1: Create Injury Management Screen

File: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/InjuryManagementScreen.kt`

```kotlin
@Composable
fun InjuryManagementScreen(
    viewModel: UserViewModel = hiltViewModel()
) {
    val user by viewModel.user.collectAsState()
    val injuries = user?.injuryHistory ?: emptyList()
    
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Health & Injuries", style = MaterialTheme.typography.headlineSmall)
        
        // Active Injuries
        if (injuries.any { it.status == InjuryStatus.RECOVERING || it.status == InjuryStatus.ACTIVE }) {
            Text("Active / Recovering", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
            injuries.filter { it.status == InjuryStatus.RECOVERING || it.status == InjuryStatus.ACTIVE }.forEach { injury ->
                InjuryCard(
                    injury = injury,
                    onMarkHealed = { viewModel.updateInjuryStatus(injury.id!!, InjuryStatus.HEALED) },
                    onEdit = { /* Navigate to edit screen */ }
                )
            }
        }
        
        // Chronic Injuries
        if (injuries.any { it.status == InjuryStatus.CHRONIC }) {
            Text("Chronic / Ongoing", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
            injuries.filter { it.status == InjuryStatus.CHRONIC }.forEach { injury ->
                InjuryCard(injury = injury, onMarkHealed = null, onEdit = { /* Navigate */ })
            }
        }
        
        // Healed Injuries (Archive)
        if (injuries.any { it.status == InjuryStatus.HEALED }) {
            Text("Healed / Archive", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
            injuries.filter { it.status == InjuryStatus.HEALED }.forEach { injury ->
                InjuryCard(
                    injury = injury,
                    onMarkHealed = null,
                    onDelete = { viewModel.deleteInjury(injury.id!!) }
                )
            }
        }
    }
}

@Composable
fun InjuryCard(
    injury: Injury,
    onMarkHealed: (() -> Unit)? = null,
    onEdit: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text("${injury.bodyPart} - ${injury.status.name}", fontWeight = FontWeight.Bold)
            if (injury.notes != null) Text(injury.notes!!, fontSize = 12.sp)
            if (injury.injuryDate != null) {
                val weeksAgo = calculateWeeksSince(injury.injuryDate!!)
                Text("Injured $weeksAgo weeks ago", fontSize = 12.sp, color = Color.Gray)
            }
            
            Row(modifier = Modifier.padding(top = 8.dp)) {
                if (onMarkHealed != null) {
                    Button(onClick = onMarkHealed, modifier = Modifier.weight(1f), modifier = Modifier.padding(end = 4.dp)) {
                        Text("Mark Healed")
                    }
                }
                if (onDelete != null) {
                    Button(onClick = onDelete, colors = ButtonDefaults.buttonColors(containerColor = Color.Red)) {
                        Text("Delete")
                    }
                }
            }
        }
    }
}
```

### Step 2: Add Navigation to Settings

File: Settings screen or Profile screen

```kotlin
Button(onClick = { navController.navigate("injuryManagement") }) {
    Text("Health & Injuries")
}
```

### Step 3: Update ViewModel

File: `app/.../viewmodel/UserViewModel.kt`

```kotlin
fun updateInjuryStatus(injuryId: String, newStatus: InjuryStatus) {
    viewModelScope.launch {
        try {
            val response = apiClient.put(
                "/api/user/injuries/$injuryId",
                mapOf("status" to newStatus.name)
            )
            // Refresh user profile
            refreshUserProfile()
        } catch (e: Exception) {
            // Show error
        }
    }
}

fun deleteInjury(injuryId: String) {
    viewModelScope.launch {
        try {
            apiClient.delete("/api/user/injuries/$injuryId")
            refreshUserProfile()
        } catch (e: Exception) {
            // Show error
        }
    }
}
```

---

## Phase 3: Testing (1 hour)

### Test Case 1: Mark Injury as Healed
```
1. User has [knee pain] status RECOVERING
2. Click "Mark Healed"
3. Check: status changed to HEALED
4. Check: healedDate is set
5. Expected: ✅ Status updated
```

### Test Case 2: Healed Injury Doesn't Affect Plan
```
1. Create plan with [knee pain] status RECOVERING
2. Mark as HEALED
3. Generate new plan
4. Check: Plan doesn't mention knee as constraint
5. Expected: ✅ Healed injury ignored
```

### Test Case 3: Revert Healed to Recovering
```
1. Mark [knee pain] as HEALED
2. Click "Mark Recovering" (if pain returns)
3. Check: status reverted
4. Expected: ✅ Can toggle status
```

### Test Case 4: Nino's Scenario
```
1. Create plan with [post-stroke, AFO]
2. Execute Week 1-3
3. Add [knee pain] mid-plan
4. Run plan reassessment
5. Check: Knee pain mentioned as NEW
6. After 2 weeks, mark knee as HEALED
7. Run reassessment again
8. Check: Knee pain no longer mentioned
9. Expected: ✅ Plan adapts to recovered injuries
```

---

## Code Checklist

- [ ] Add healedDate + updatedAt to Injury model
- [ ] Add PUT /api/user/injuries/:injuryId endpoint
- [ ] Add GET /api/user/injuries endpoint
- [ ] Add DELETE /api/user/injuries/:injuryId endpoint
- [ ] Update all injury status checks to exclude HEALED
- [ ] Create InjuryManagementScreen UI
- [ ] Add navigation to injury management
- [ ] Add updateInjuryStatus to ViewModel
- [ ] Add deleteInjury to ViewModel
- [ ] Test marking injury healed
- [ ] Test plan ignores healed injuries
- [ ] Test with Nino scenario

---

## Database Notes

**No migration needed!** 

The `injuryHistory` is a JSONB field, so adding new properties is automatically supported:

```typescript
// Old injury
{ id: "123", bodyPart: "knee", status: "RECOVERING", injuryDate: "2026-06-01" }

// Updated injury (backward compatible)
{ id: "123", bodyPart: "knee", status: "HEALED", injuryDate: "2026-06-01", healedDate: "2026-06-15", updatedAt: 1718478000000 }
```

---

## Deployment Order

1. Deploy backend (API endpoints first)
2. Update Injury model (Android)
3. Deploy UI screen
4. Test end-to-end
5. Announce to users: "You can now mark injuries as healed"

---

## Success Criteria

✅ Users can mark injuries as healed  
✅ Healed injuries don't affect new plans  
✅ Users can revert status if needed  
✅ Nino's plan adapts when injuries recover  
✅ No breaking changes to existing plans  
