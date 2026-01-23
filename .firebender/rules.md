# Firebender Project Rules - AI Run Coach

## 🎯 Mandatory Session Initialization

**CRITICAL:** Every new Firebender session MUST follow these steps:

### 1. Always Read PROJECT_STATUS.md First
```
Before responding to ANY user query, read /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/PROJECT_STATUS.md
```

This file contains:
- Complete project roadmap (58 features total)
- Completed features with detailed implementation notes
- Current work in progress
- Next priorities
- Last session context
- Technical debt
- Screen status
- API integrations

### 1.5 Read All Feature Specifications
```
After PROJECT_STATUS.md, read these comprehensive specification files:
- ROUTE_GENERATION_SPEC.md - Route generation system (100 templates, validation algorithms)
- AI_COACHING_SPEC.md - AI coaching system (triggers, phases, statements, TTS)
- ELEVATION_STRUGGLE_SPEC.md - Terrain analysis and struggle detection
- WATCH_ADMIN_SPEC.md - Watch integration, admin config, free runs, API endpoints
```

These files contain:
- Complete implementation specifications from Replit agent
- Algorithms with full code examples
- Data structures and models
- API endpoint definitions
- Feature requirements and constraints
- Implementation guidance for all major features

### 2. Context Understanding
After reading PROJECT_STATUS.md and specification files, you will know:
- What features are complete
- What was done in the last session
- What the next priority is
- The overall project architecture
- Known limitations and dependencies
- **Complete implementation specifications for 9 major features**
- **Exact algorithms and data structures to implement**
- **All API endpoints and their payloads**

### 3. Acknowledge Project State
When user starts conversation, briefly mention:
- Features completed so far (e.g., "2.5 out of 58 features complete")
- Last session summary (e.g., "Last session: Goals API + specifications received")
- Specifications available (e.g., "Complete specs loaded for route generation, AI coaching, elevation, etc.")
- Current status (e.g., "Ready to implement any feature from the specifications")

---

## 📝 Automatic Documentation Updates

### When Completing ANY Feature or Task:

**YOU MUST automatically update PROJECT_STATUS.md with:**

1. **Update "Last Updated" date** at the top
2. **Update "Last Session" note** with what was just completed
3. **Move completed feature** from "Upcoming" to "Completed" section
4. **Add completion details:**
   - Completion date
   - Status (Production Ready / Functional / Needs Testing)
   - What was done (bullet points)
   - Files created (with full paths)
   - Files modified (with full paths)
   - Dependencies added
   - Known issues or action required

5. **Update counters:**
   - Total completed count
   - Remaining count
   - In progress count

6. **Add technical notes** if relevant:
   - New technical debt
   - Future improvements
   - Breaking changes
   - Migration notes

### Example Update Pattern:
```markdown
### Feature X: [Feature Name] ✓
**Completed:** [Date]
**Status:** [Production Ready / Functional / Needs Testing]

**What was done:**
- [Action 1]
- [Action 2]
- [Action 3]

**Files Created:**
- `path/to/new/file.kt`

**Files Modified:**
- `path/to/modified/file.kt`

**Dependencies Added:**
- `implementation("com.example:library:1.0.0")`

**Notes:**
- [Any important context]
```

---

## 🚨 Critical Behaviors

### Never Skip PROJECT_STATUS.md Updates
- Even for small changes, update the file
- Add notes about partial progress if feature isn't complete
- Track all file modifications

### Session Handoff
When ending a session, ensure:
- PROJECT_STATUS.md "Last Session" reflects final state
- Any incomplete work is noted in "In Progress" section
- Next steps are clear for future sessions

### Feature Tracking
- User has 58+ features planned
- Features 1-2.3 are complete (Logo, GPS/Weather, Goals API, Icons)
- **Complete specifications received for 9 major feature areas** (Jan 24, 2026)
- Features 56-57 are Garmin/Samsung SDK (end of roadmap)
- Don't get ahead of priorities - wait for user direction
- All specifications are documented in dedicated .md files

---

## 🏗️ Project-Specific Guidelines

### Architecture
- **MVVM architecture** with Jetpack Compose
- ViewModels in `viewmodel/` package
- Repositories in `data/` package
- Domain models in `domain/model/` package
- UI screens in `ui/screens/` package

### Code Style
- Kotlin with Jetpack Compose
- Material 3 design system
- Dark theme colors from `Colors.kt`
- Typography from `AppTextStyles.kt`
- Spacing from `Spacing.kt`

### Testing Approach
- Real device testing required for GPS features
- Emulator for UI testing
- API key needed for weather testing

### Git Workflow
- Meaningful commit messages
- Reference feature numbers in commits
- User may request commits for milestones

---

## 🎨 Design System (Reference)

### Colors
```kotlin
Colors.primary = #00D4FF (Cyan)
Colors.backgroundRoot = #0A0F1A (Dark)
Colors.success = #00E676 (Green)
Colors.textPrimary = #FFFFFF (White)
```

### Key Components
- Bottom navigation is consistent across all screens
- Cards use `Colors.backgroundSecondary` with alpha
- Icons are 24dp for nav, 28dp for cards
- Buttons are 60dp height

---

## 📦 Dependencies Reference

### Always Available
- Jetpack Compose
- Material 3
- Navigation Compose
- Retrofit + Gson
- Google Play Services Location
- Room (configured but not fully used)

### Commented Out (Don't Enable Unless Requested)
- Garmin Connect IQ SDK (feature 56)

---

## 🔄 Session Workflow

```
1. User opens Android Studio
2. AI reads PROJECT_STATUS.md automatically
3. AI understands complete project context
4. AI greets user with project status
5. User requests work
6. AI completes work
7. AI updates PROJECT_STATUS.md automatically
8. AI confirms update to user
9. Repeat steps 5-8
```

---

## ⚠️ Important Reminders

- **Don't assume:** Always read PROJECT_STATUS.md, don't rely on memory
- **Always update:** Even small changes deserve documentation
- **Ask when unclear:** If user's request is ambiguous, ask for clarification
- **Track everything:** File changes, dependencies, decisions
- **Be thorough:** Future sessions depend on your documentation quality

---

## 🎯 Success Criteria

A session is successful when:
1. ✅ PROJECT_STATUS.md was read at session start
2. ✅ Work was completed as requested
3. ✅ PROJECT_STATUS.md was updated with details
4. ✅ User understands project progress
5. ✅ Next session can pick up seamlessly

---

**These rules ensure continuity across all Firebender sessions for AI Run Coach project.**
