# ⚠️ NEVER DO THIS - Critical Guidelines

**Purpose:** Prevent common mistakes and ensure version control integrity

---

## 🚫 File Management

### ❌ NEVER Restore These Deleted Files
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSetupScreen.kt`
  - **Deleted:** Feb 5, 2026
  - **Reason:** Replaced by `MapMyRunSetupScreen.kt`
  - **If found:** Delete immediately and reference `RUN_SETUP_UNIFIED_DOCUMENTATION.md`

### ❌ NEVER Create Files With These Names
- `RunSetupScreen.kt` (any variation)
- Any file that duplicates `MapMyRunSetupScreen.kt` functionality

### ❌ NEVER Reference Old Navigation Routes
- `run_setup/{mode}` - This route is DELETED
- Use `map_my_run_setup` instead

---

## 🚫 Code Patterns

### ❌ NEVER Use These Navigation Patterns
```kotlin
// DON'T DO THIS
navController.navigate("run_setup/route")
navController.navigate("run_setup/non-route")
navController.navigate("route_generation/{...}")  // Old pattern
```

### ✅ ALWAYS Use These Patterns
```kotlin
// DO THIS
navController.navigate("map_my_run_setup")
```

---

## 🚫 Design Decisions

### ❌ NEVER Create Multiple Setup Screens
- There is ONE setup screen: `MapMyRunSetupScreen.kt`
- If you need variations, add parameters/options to existing screen
- DO NOT create separate screens for different flows

### ❌ NEVER Use Plain Text Fields For Setup
- Always use card-based layouts
- Always use sliders for numeric inputs when appropriate
- Follow the established design system in `MapMyRunSetupScreen.kt`

---

## 🚫 Component Modifications

### ❌ NEVER Reduce TargetTimeCard Size
- Size was deliberately DOUBLED on Feb 5, 2026
- User feedback required larger, more visible time inputs
- Current size is: 64dp × 48dp input boxes, 24sp font

### ❌ NEVER Increase AiCoachToggle Size  
- Size was deliberately REDUCED 25% on Feb 5, 2026
- User feedback: it was too prominent
- Current scale: 0.6f for switch, 12dp for icon

---

## 🚫 Version Control

### ❌ NEVER Commit Without Documentation Updates
If you modify:
- `MapMyRunSetupScreen.kt`
- `TargetTimeCard.kt` 
- `MainScreen.kt` (setup-related routes)
- `DashboardScreen.kt` (AI Coach toggle)

You MUST:
1. Update `RUN_SETUP_UNIFIED_DOCUMENTATION.md`
2. Reference documentation in commit message
3. Test all affected flows

### ❌ NEVER Force Push Without Team Review
- Especially on `main` or `feat/*` branches
- Changes to setup flow affect entire app
- Get approval before pushing breaking changes

---

## 🚫 Import Statements

### ❌ NEVER Import These (They Don't Exist)
```kotlin
import live.airuncoach.airuncoach.ui.screens.RunSetupScreen
// This file is DELETED - use MapMyRunSetupScreen instead
```

### ✅ ALWAYS Import These
```kotlin
import live.airuncoach.airuncoach.ui.screens.MapMyRunSetupScreen
import live.airuncoach.airuncoach.ui.components.TargetTimeCard
```

---

## 🚫 Merge Conflicts

### ❌ NEVER Blindly Accept Old Versions
If you see merge conflicts in:
- `MapMyRunSetupScreen.kt`
- `MainScreen.kt` 
- `TargetTimeCard.kt`

DO NOT auto-accept "theirs" or "ours" without reviewing.

**Instead:**
1. Check `RUN_SETUP_UNIFIED_DOCUMENTATION.md` for current spec
2. Check git log for recent changes
3. Verify which version matches documentation
4. Test thoroughly after resolving

---

## 🚫 Code Review Red Flags

### If You See These In A PR, REJECT:
- ❌ New file: `RunSetupScreen.kt`
- ❌ Navigation to: `run_setup/{mode}`
- ❌ Restored deleted files
- ❌ Multiple setup screens
- ❌ Size reductions to `TargetTimeCard` components
- ❌ Size increases to `AiCoachToggle`
- ❌ Plain text fields instead of card layouts
- ❌ No documentation updates with UI changes

---

## 🚫 Build/Deployment

### ❌ NEVER Deploy Without Testing Setup Flows
Before any deployment:
- [ ] Test "Generate Route" button
- [ ] Test "Start Run Without Route" button  
- [ ] Test close icon navigation
- [ ] Test home icon navigation
- [ ] Verify TargetTimeCard is large and readable
- [ ] Verify AiCoachToggle is compact
- [ ] No crashes in setup flow

---

## ✅ What To Do Instead

### If You Need To Change Setup Flow:
1. ✅ Read `RUN_SETUP_UNIFIED_DOCUMENTATION.md` first
2. ✅ Modify `MapMyRunSetupScreen.kt` only
3. ✅ Update documentation
4. ✅ Test both flows (with/without route)
5. ✅ Commit with references to docs
6. ✅ Get code review

### If You Find Old Code:
1. ✅ Check git history for when it was removed
2. ✅ Check if it was intentionally deleted
3. ✅ If intentional, do NOT restore
4. ✅ Update any lingering references to point to new code

### If You're Unsure:
1. ✅ Check `RUN_SETUP_UNIFIED_DOCUMENTATION.md`
2. ✅ Look at recent git commits
3. ✅ Ask team before making changes
4. ✅ Test changes locally before committing

---

## 📞 Emergency Recovery

### If Someone Accidentally Restores Old Code:

**Immediate Actions:**
1. `git revert <bad-commit>`
2. `git push`
3. Notify team in Slack/Discord
4. Review this document and `RUN_SETUP_UNIFIED_DOCUMENTATION.md`

**Verification:**
```bash
# Check if bad file exists
ls app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSetupScreen.kt
# Should output: No such file or directory

# Check current routes
rg "run_setup/\{mode\}" app/src/main/java
# Should output: Nothing (pattern not found)

# Check for correct route
rg "map_my_run_setup" app/src/main/java
# Should find references in MainScreen.kt
```

---

## 🔒 Commit Message Keywords

### If You See These, Review Carefully:
- "restore RunSetupScreen"
- "bring back old design"
- "revert setup changes"
- "use old navigation"

### These Are Good:
- "update MapMyRunSetupScreen"
- "enhance setup flow"
- "fix setup navigation"
- "improve setup UI"

---

## 📚 Required Reading

Before working on setup flow:
1. `RUN_SETUP_UNIFIED_DOCUMENTATION.md` (MUST READ)
2. This file (`NEVER_DO_THIS.md`)
3. Recent git log for setup-related files

---

**Remember:** These guidelines exist because mistakes were made before. Learn from history, don't repeat it.

**Last Updated:** February 5, 2026  
**Commit:** c507a0f
