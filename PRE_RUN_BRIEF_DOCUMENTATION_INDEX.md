# Pre-Run Brief Documentation Index

## 📚 Documentation Overview

This directory contains comprehensive documentation of the **Pre-Run Briefing System** found in the iOS app codebase. The system generates AI-powered coaching briefs shown to users before they start their runs.

---

## 📄 Documents Included

### 1. **PRE_RUN_BRIEFING_ANALYSIS.md** (17 KB)
**Comprehensive Technical Reference**

The most detailed document covering all aspects of the pre-run briefing system.

**Sections:**
- Executive Summary
- Components displaying pre-run briefing (Swift & React)
- API calls to fetch briefings
- Coach messaging before run
- Pre-run screens and setup flows
- Pre-run brief generation details
- Coaching cooldown & messaging management
- iOS native components
- Data flow summary
- Key files reference (table)
- Notes on iOS app status

**Use this document when:** You need complete technical details, architecture understanding, or want to understand the full system.

---

### 2. **PRE_RUN_BRIEF_QUICK_REFERENCE.md** (8 KB)
**Quick Start & Integration Guide**

Practical quick reference guide with examples, checklists, and testing instructions.

**Sections:**
- What is a Pre-Run Brief? (definition + example)
- Where to find pre-run briefs
- How briefings are generated (trigger + process)
- API endpoint details
- How AI decides tone (with examples table)
- Data models (SessionInstructions interface)
- Client integration checklist
- Pre-run vs real-time coaching comparison
- Fallback behavior
- Coaching cooldown rules
- Key files reference (table)
- Next steps to display briefs
- Testing the system (curl example)

**Use this document when:** You want practical guidance, need to integrate the system, or want quick answers.

---

### 3. **PRE_RUN_BRIEF_FINDINGS_SUMMARY.txt** (18 KB)
**Executive Summary & Status Report**

High-level findings summary with status indicators and recommendations.

**Sections:**
- Key findings (7 main findings with ✓ checks)
- Missing implementations (4 areas not yet built)
- Architecture overview (ASCII diagram)
- Files & locations (all files listed with line numbers)
- Data flow example (tempo session scenario)
- Summary statistics (components, endpoints, models, voices)
- Implementation status (complete ✅, incomplete ❌, partial ⚠️)
- Recommendations (4 priority levels)
- Documentation generated (summary of all docs)

**Use this document when:** You need a high-level overview, status check, or to understand what's missing.

---

### 4. **PRE_RUN_BRIEF_DOCUMENTATION_INDEX.md** (This File)
**Navigation & Guide**

Quick navigation guide to all documentation.

---

## 🎯 Quick Start by Use Case

### "I want to understand the whole system"
→ Start with **PRE_RUN_BRIEF_FINDINGS_SUMMARY.txt**
→ Then read **PRE_RUN_BRIEFING_ANALYSIS.md**

### "I need to display briefs in the UI"
→ Start with **PRE_RUN_BRIEF_QUICK_REFERENCE.md** (Client Integration Checklist)
→ Reference **PRE_RUN_BRIEFING_ANALYSIS.md** for API details

### "I need to understand the AI system"
→ Start with **PRE_RUN_BRIEFING_ANALYSIS.md** (Section 5: Pre-Run Brief Generation Details)
→ Quick reference for tone options: **PRE_RUN_BRIEF_QUICK_REFERENCE.md** (How AI Decides Tone)

### "I want to test the system"
→ Go to **PRE_RUN_BRIEF_QUICK_REFERENCE.md** (Testing the System section)
→ See example curl command and expected response

### "I need to fix something"
→ Check **PRE_RUN_BRIEF_FINDINGS_SUMMARY.txt** (Missing Implementations)
→ Reference the specific file locations for the feature you're working on

---

## 🔍 Key Information at a Glance

### API Endpoint
```
GET /api/workouts/:workoutId/session-instructions
```
**Location:** `server/routes-session-coaching.ts` (lines 22-111)
**Response includes:** `preRunBrief`, `sessionStructure`, `aiDeterminedTone`, `coachingStyle`

### Brief Generation Function
```
generateSessionInstructions(userId, workoutId, workoutData)
```
**Location:** `server/session-coaching-service.ts` (line 308)
**Process:** Tone determination + Brief generation (parallel)

### Client Components
| Component | File | Purpose |
|-----------|------|---------|
| PreRunModal | Home.tsx (~1250-1400) | Free run setup (brief not displayed yet) |
| PreEvent Screen | PreEvent.tsx (1-568) | Event setup (brief not displayed yet) |
| RunSession | RunSession.tsx | Real-time coaching during run |

### AI Models
- **Tone Determination:** `gpt-4o-mini` (model=gpt-4o-mini)
- **Brief Generation:** `gpt-4o-mini` (model=gpt-4o-mini)

### Brief Characteristics
- **Length:** 2-4 sentences
- **Tone Options:** 7-8 variations (light_fun, direct, motivational, calm, serious, playful, instructive)
- **Session-Specific:** Tailored to workout type, intensity, goal
- **Adaptive:** Can override user preference based on session context

### Coaching Cooldown
- **Non-Milestone Cooldown:** 90 seconds between non-milestone cues
- **Post-Milestone Buffer:** 45 seconds of silence after any milestone
- **Milestones (always fire):** Km splits, 500m check-in, final 500m/100m, intervals, navigation turns

---

## 📊 System Status

### ✅ Complete & Implemented
- Pre-run brief AI generation system
- Session structure design
- Tone determination logic
- API endpoint for fetching briefs
- Database storage & caching
- Real-time coaching during runs
- Coach voice/accent settings

### ❌ Not Yet Implemented
- Free run brief display
- Event brief display
- Training plan pre-run screen
- Brief UI components
- Native iOS SwiftUI implementation

### ⚠️ Partial/In Progress
- iOS native components (Strava integration exists, pre-run brief missing)
- Training plan integration (API ready, client UI TBD)

---

## 🔗 File Cross-References

### Server Files
- **routes-session-coaching.ts** - API endpoint definitions
- **session-coaching-service.ts** - Brief generation logic, tone determination, fallback
- **coaching-cooldown.ts** - Message throttling system
- **src/models/SessionCoaching.ts** - Data models and interfaces
- **routes.ts** - Session instructions inclusion in run analysis

### Client Files
- **pages/Home.tsx** - Free run pre-run modal (needs brief display)
- **pages/PreEvent.tsx** - Event pre-run screen (needs brief display)
- **pages/RunSession.tsx** - Real-time coaching during run
- **lib/coachSettings.ts** - Coach personalization and voice settings

### iOS Files
- **StravaViews.swift** - Strava integration (post-run, not pre-run)
- **StravaViewModel.swift** - Strava API calls

---

## 💡 Implementation Tips

### Adding Brief Display to Home.tsx
1. Fetch brief when user clicks "Start Session"
2. Show brief in pre-run modal before "Start Run" button
3. Display session structure (phases + targets)
4. Use same API as training plan: `/api/workouts/:workoutId/session-instructions`

### Adding Brief Display to PreEvent.tsx
1. Generate workoutId from event
2. Fetch session instructions
3. Display preRunBrief in setup screen
4. Show coaching tone indicator
5. Display phases if available

### Creating Training Plan Pre-Run Screen
1. Create new component: `TrainingPlanPreRun.tsx`
2. Fetch `/api/workouts/:workoutId/session-instructions`
3. Display brief, phases, coaching style
4. Navigate to RunSession with session context

### Testing the Endpoint
```bash
curl http://localhost:3000/api/workouts/{workoutId}/session-instructions \
  -H "Authorization: Bearer {token}"
```

---

## 📞 Document Maintenance

**Last Updated:** 2026-08-04
**Search Scope:** iOS app codebase (Swift + React/TypeScript)
**Coverage:** Pre-run briefing system - complete analysis
**Status:** ✅ Comprehensive search completed

**Files Searched:**
- ✓ Swift files (2 files: StravaViews.swift, StravaViewModel.swift)
- ✓ TypeScript/React files (4 main: Home.tsx, PreEvent.tsx, RunSession.tsx, coachSettings.ts)
- ✓ Server files (10+ coaching-related files)
- ✓ API definitions and routes

---

## 🚀 Next Steps

### Immediate
1. Review **PRE_RUN_BRIEF_FINDINGS_SUMMARY.txt** for overview
2. Check **Missing Implementations** section for what to build next
3. Use **Quick Reference** for practical guidance

### Short Term
1. Implement brief display in free run modal (Home.tsx)
2. Implement brief display in event setup (PreEvent.tsx)
3. Create training plan pre-run screen

### Medium Term
1. Add tone visualization (emoji/color/icon)
2. Create phase structure UI
3. Add difficulty/duration estimation

### Long Term
1. Native iOS SwiftUI implementation
2. Enhanced coach voice personalization
3. Advanced coaching trigger visualization

---

## 📖 Reading Guide

**For Executives:** Read the summary findings (2 min read)
**For Product Managers:** Read quick reference overview (5 min read)
**For Developers:** Read comprehensive analysis (15 min read)
**For Code Review:** Reference specific sections by topic

---

**Happy coding! 🏃‍♂️**

For questions about the pre-run briefing system, refer to the detailed analysis or the quick reference guide.
