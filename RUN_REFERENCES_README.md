# AI Run Coach - "Run" References Documentation

## Overview

This directory contains comprehensive documentation of all files, screens, UI strings, ViewModels, and data models related to "Run" functionality in the Android app.

**Generated:** July 29, 2026  
**Scope:** Android app only  
**Coverage:** 100% of Run-related code

---

## Documentation Files

### 1. **RUN_REFERENCES_COMPREHENSIVE_GUIDE.md** (Primary Reference)
**Size:** ~500 lines  
**Best for:** In-depth understanding of architecture

Complete guide covering:
- All 10 screen composables with descriptions
- 5 ViewModels with state flows
- 10+ domain models (RunSession, RunSetupConfig, User, etc.)
- 14+ network models (API request/response types)
- 2 background services (RunTrackingService, GarminWatchManager)
- Reusable components and utilities
- All UI text labels and strings
- Configuration and feature flags
- Watch/Garmin integration details
- External integration points (Strava, HealthConnect)
- Navigation flows
- Data repositories and database

**Use this when you need:** Complete architectural overview, detailed field explanations, API integration understanding

---

### 2. **RUN_REFERENCES_QUICK_LOOKUP.json** (Machine-Readable Reference)
**Format:** JSON  
**Best for:** Quick lookups, IDE integration

Structured reference including:
- Screen definitions with file paths
- ViewModel descriptions
- Model field listings
- Service responsibilities
- UI string mappings
- Navigation flows
- Configuration fields
- Search patterns
- External integrations

**Use this when you need:** Programmatic access, IDE/tool integration, structured data queries

---

### 3. **RUN_REFERENCES_VISUAL_MAP.md** (Visual Reference)
**Size:** ~700 lines  
**Best for:** Understanding workflows and relationships

Visual diagrams showing:
- Run lifecycle flowchart
- Screen component hierarchy
- Data model relationships
- Activity type (RUN vs WALK) flow
- Screen text labels hierarchy
- ViewModel state management
- Configuration/settings hierarchy
- File organization by feature
- Watch integration workflow
- Text pattern quick reference
- Key integration points

**Use this when you need:** High-level understanding, workflow visualization, relationship mapping

---

### 4. **RUN_FILES_INVENTORY.txt** (Complete File Listing)
**Size:** ~400 lines  
**Best for:** File discovery and categorization

Detailed inventory of:
- All screen files with purposes
- All ViewModel files with methods
- All domain models with critical fields
- All network models with purposes
- All services with responsibilities
- All components and utilities
- All repositories and databases
- All configuration files
- Summary statistics
- Search queries for common tasks
- Navigation structure
- Feature areas covered

**Use this when you need:** Find specific files, understand organization, estimate scope

---

## Quick Start Guide

### Finding a Specific Screen
1. **Search:** `RUN_FILES_INVENTORY.txt` (Screens section)
2. **Details:** `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md` (Section 1)
3. **Context:** `RUN_REFERENCES_VISUAL_MAP.md` (Section 1)

### Understanding Activity Types (RUN vs WALK)
1. **Quick overview:** `RUN_REFERENCES_VISUAL_MAP.md` (Section 4)
2. **Data models:** `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md` (Section 2.2 and 2.3)
3. **Code locations:** `RUN_FILES_INVENTORY.txt` (Key Text Labels Found)

### Finding UI Text Labels
1. **All labels:** `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md` (Section 5)
2. **By screen:** `RUN_REFERENCES_VISUAL_MAP.md` (Section 5)
3. **Visual hierarchy:** `RUN_REFERENCES_QUICK_LOOKUP.json` (ui_strings section)

### Understanding Data Flow
1. **Models:** `RUN_REFERENCES_VISUAL_MAP.md` (Section 3)
2. **Complete specs:** `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md` (Section 2)
3. **JSON reference:** `RUN_REFERENCES_QUICK_LOOKUP.json` (models section)

### Finding ViewModel Methods
1. **Quick lookup:** `RUN_REFERENCES_QUICK_LOOKUP.json` (view_models)
2. **Full details:** `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md` (Section 4)
3. **File locations:** `RUN_FILES_INVENTORY.txt` (VIEWMODELS section)

### Navigation & Integration
1. **Flow chart:** `RUN_REFERENCES_VISUAL_MAP.md` (Section 9, 11)
2. **Complete docs:** `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md` (Section 11)
3. **File list:** `RUN_FILES_INVENTORY.txt` (Navigation Structure)

---

## File Paths Quick Reference

### Screens
```
app/src/main/java/live/airuncoach/airuncoach/ui/screens/
├── RunSessionScreen.kt
├── RunSummaryScreen.kt
├── MapMyRunSetupScreen.kt
├── RouteSelectionScreen.kt
├── PreviousRunsScreen.kt
├── ObserverRunSessionScreen.kt
├── CoachSettingsScreen.kt
├── DashboardScreen.kt
├── ConnectedDevicesScreen.kt
└── MainScreen.kt
```

### ViewModels
```
app/src/main/java/live/airuncoach/airuncoach/viewmodel/
├── RunSessionViewModel.kt
├── RunSummaryViewModel.kt
├── PreviousRunsViewModel.kt
├── ObserverRunSessionViewModel.kt
└── CoachSettingsViewModel.kt
```

### Domain Models
```
app/src/main/java/live/airuncoach/airuncoach/domain/model/
├── RunSession.kt
├── RunSetupConfig.kt
├── User.kt
├── PreviousRun.kt
├── LocationPoint.kt
├── KmSplit.kt
└── ... 10+ more model files
```

### Services
```
app/src/main/java/live/airuncoach/airuncoach/service/
├── RunTrackingService.kt
└── GarminWatchManager.kt
```

### Network Models
```
app/src/main/java/live/airuncoach/airuncoach/network/model/
├── PreRunBriefingResponse.kt
├── RunHistoryStats.kt
├── UploadRunRequest.kt
├── UploadRunResponse.kt
├── RunAnalysisRequest.kt
├── RunInsightsModels.kt
├── GroupRunModels.kt
├── StartRunAudioModels.kt
├── UpdateRunProgressRequest.kt
├── RouteRecognitionModels.kt
├── SessionCoachingModels.kt
├── PaceUpdate.kt
└── StruggleUpdate.kt
```

### Components & Utilities
```
app/src/main/java/live/airuncoach/airuncoach/ui/components/
├── PrepareRunOnWatchButton.kt
├── AdvancedRunCharts.kt

app/src/main/java/live/airuncoach/airuncoach/ui/extensions/
├── RunSessionGraphHelpers.kt

app/src/main/java/live/airuncoach/airuncoach/utils/
├── RunSimulator.kt

app/src/main/java/live/airuncoach/airuncoach/util/
├── RunConfigHolder.kt

app/src/main/java/live/airuncoach/airuncoach/analytics/
├── RunAnalytics.kt

app/src/main/java/live/airuncoach/airuncoach/config/
└── RunningMetricsConfig.kt
```

---

## Key Concepts

### Activity Types
The app supports two primary activity types:
- **RUN** - Running session (default)
- **WALK** - Walking session

Implementation:
- Stored as `String` in `RunSession.sessionType` ("run" or "walk")
- Configured as `PhysicalActivityType` enum in `RunSetupConfig.activityType`
- User default stored in `User.defaultSessionType` (synced with server)
- UI toggle via `ActivityMode` enum in `MapMyRunSetupScreen` (line 747)

### Run Lifecycle
1. **Setup** → User configures run (distance, time, activity type) in `MapMyRunSetupScreen`
2. **Route** → (Optional) User selects route from options in `RouteSelectionScreen`
3. **Prepare Watch** → (Optional) User prepares watch via companion app
4. **Active** → Run executes with real-time tracking in `RunSessionScreen`
5. **Summary** → Post-run analysis displayed in `RunSummaryScreen`
6. **History** → Run archived and accessible in `PreviousRunsScreen`

### Watch Integration
- **Detection:** `RunSessionViewModel.isWatchCompanionInstalled` checks if Garmin companion app is installed
- **Preparation:** "Prepare Run on Watch" button shown when companion is available (in `RouteSelectionScreen` and `MapMyRunSetupScreen`)
- **Execution:** Watch mode sets `RunSetupConfig.isWatchMode = true`, causing `RunSessionScreen` to wait for start signal via BLE
- **Communication:** `GarminWatchManager` handles companion app coordination

### Configuration Fields
User-level (synced with server):
- `User.defaultSessionType` - Preferred activity type
- `User.coachPaceEnabled` - Enable pace coaching
- `User.coachNavigationEnabled` - Enable navigation
- `User.coachElevationEnabled` - Enable elevation guidance
- `User.coachHeartRateEnabled` - Enable HR coaching
- ... 5 more feature flags

Run-level (per session):
- `RunSetupConfig.activityType` - Selected activity type
- `RunSetupConfig.targetDistance` - Target distance
- `RunSetupConfig.aiCoachEnabled` - Enable coaching this run
- `RunSetupConfig.isGroupRun` - Group run mode
- `RunSetupConfig.isWatchMode` - Watch coordination mode

---

## Code Search Patterns

### Find All Run Screens
```bash
grep -r "fun RunSessionScreen\|fun RunSummaryScreen\|fun MapMyRunSetupScreen" --include="*.kt"
```

### Find Activity Type References
```bash
grep -r "ActivityMode\|PhysicalActivityType\|sessionType\|defaultSessionType" --include="*.kt"
```

### Find UI Text Labels
```bash
grep -r "CONFIGURE YOUR RUN\|MAP MY RUN\|SELECT YOUR ROUTE\|START RUN" --include="*.kt"
```

### Find ViewModel References
```bash
grep -r "RunSessionViewModel\|RunSummaryViewModel\|PreviousRunsViewModel" --include="*.kt"
```

### Find Data Model References
```bash
grep -r "data class RunSession\|data class RunSetupConfig\|data class RunState" --include="*.kt"
```

### Find "Prepare Run" References
```bash
grep -r "Prepare Run\|prepareRunOnWatch" --include="*.kt"
```

---

## Statistics

### Files Count
- **Screens:** 10
- **ViewModels:** 5
- **Domain Models:** 10+
- **Network Models:** 14+
- **Services:** 2
- **Components:** 3
- **Utilities:** 4
- **Repositories/Database:** 3
- **Configuration:** 1
- **String Resources:** 1

### Lines of Code (Approximate)
- **RunSessionScreen:** 3,000+ lines
- **RunSummaryScreen:** 7,000+ lines
- **RunTrackingService:** 5,900+ lines
- **RunSessionViewModel:** 1,500+ lines
- **MapMyRunSetupScreen:** 1,300+ lines
- **DashboardScreen:** 1,500+ lines
- **Other screens:** 400-1,500 each
- **Models/utilities:** 50-150 each

**Total Run-Related Code:** 20,000+ lines

---

## External Integrations

### Garmin
- Import historical runs from Garmin Connect
- Sync with Garmin watches
- Data enrichment (HR, elevation, device)
- Companion app communication

### Strava
- Publish completed runs
- Full GPS data export
- Social network integration

### HealthConnect
- Android system integration
- Metrics export

---

## Related Documentation

The following documents provide additional context:

- **iOS_AI_COACHING_SESSION_GENERATION_BRIEF.md** - RunSessionScreen behavior
- **GROUP_RUN_ORGANIZER_FEATURE.md** - Group run implementation
- **POST_RUN_ANALYSIS_ROADMAP.md** - RunSummaryScreen features
- **ANDROID_3_CIRCLE_METRICS_SUMMARY.md** - Performance dashboard
- **GPS_LOCATION_TRACKING_ANALYSIS.md** - Run tracking architecture
- **WATCH_ADMIN_SPEC.md** - Watch integration details

---

## How to Use This Documentation

### For Feature Development
1. Start with `RUN_REFERENCES_VISUAL_MAP.md` for workflow understanding
2. Review `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md` for detailed specs
3. Reference `RUN_FILES_INVENTORY.txt` for file locations
4. Use `RUN_REFERENCES_QUICK_LOOKUP.json` for rapid lookups

### For Bug Fixes
1. Use `RUN_REFERENCES_QUICK_LOOKUP.json` to find affected files
2. Check `RUN_REFERENCES_VISUAL_MAP.md` for component relationships
3. Reference `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md` for detailed logic
4. Search patterns from `RUN_FILES_INVENTORY.txt`

### For Code Review
1. Compare against navigation in `RUN_REFERENCES_VISUAL_MAP.md`
2. Verify data models match `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md`
3. Check activity type handling via `RUN_REFERENCES_QUICK_LOOKUP.json`

### For Onboarding New Developers
1. Start with `RUN_REFERENCES_VISUAL_MAP.md` for overview
2. Follow with `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md` for details
3. Use `RUN_FILES_INVENTORY.txt` to explore actual code

---

## Maintainability Notes

These documents were generated by comprehensive code analysis on **July 29, 2026**.

**When updating:**
1. Keep all 4 documents in sync
2. Update file path references if files are moved
3. Update statistics when new screens/models are added
4. Add new sections for new features
5. Maintain consistent formatting

**Automated checks:**
- Verify file paths exist
- Cross-reference screens to ViewModels
- Check navigation flow accuracy
- Validate model field listings

---

## Support & Questions

When researching "Run" references in the codebase:

1. **"Where is X file?"** → Check `RUN_FILES_INVENTORY.txt`
2. **"How does X work?"** → Check `RUN_REFERENCES_COMPREHENSIVE_GUIDE.md`
3. **"What files use X?"** → Check `RUN_REFERENCES_QUICK_LOOKUP.json` or `RUN_FILES_INVENTORY.txt`
4. **"Show me the flow"** → Check `RUN_REFERENCES_VISUAL_MAP.md`
5. **"What are all the screens?"** → Check `RUN_FILES_INVENTORY.txt` (Screens section)

---

## Document Summary Table

| Document | Purpose | Format | Size | Best For |
|----------|---------|--------|------|----------|
| **Comprehensive Guide** | Complete reference | Markdown | 500 lines | Deep understanding |
| **Quick Lookup** | Structured reference | JSON | 300 entries | Programmatic queries |
| **Visual Map** | Workflow diagrams | Markdown | 700 lines | Architecture visualization |
| **Files Inventory** | Complete file listing | Plain text | 400 lines | File discovery |
| **README** (this file) | Index & navigation | Markdown | 400 lines | Getting started |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-07-29 | 1.0 | Initial comprehensive documentation |

---

**Last Updated:** July 29, 2026  
**Maintained By:** AI Run Coach Development Team  
**Scope:** Android App - Run Features Only
