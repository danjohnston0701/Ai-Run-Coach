# Google Play Store Release Workflow

## Complete Release Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                  AiRunCoach Release Workflow                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

PHASE 1: PREPARATION (5-10 minutes)
═════════════════════════════════════════════════════════════════════

    ┌─────────────────────┐
    │  Edit build.gradle  │  Update Version Code & Name
    │  Update Version     │  • versionCode = 32
    └──────────┬──────────┘  • versionName = "1.9.3"
               │
               ▼
    ┌─────────────────────┐
    │ Commit Changes      │  git add & commit
    │ to Git              │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │  Prepare Release    │  • Write release notes
    │  Documentation      │  • Review screenshots
    └──────────┬──────────┘  • Verify content
               │
               ▼
          READY TO BUILD


PHASE 2: BUILD (2-5 minutes)
═════════════════════════════════════════════════════════════════════

    Option A: Interactive Script (Recommended)
    ──────────────────────────────────────────
         $ ./build-release.sh
               │
               ├─► Check Prerequisites
               │   • Verify keystore exists
               │   • Confirm signing config
               │
               ├─► Choose Build Type
               │   1. AAB (App Bundle) ← Recommended
               │   2. APK
               │   3. Both
               │
               ├─► Clean & Build
               │   $ ./gradlew clean
               │   $ ./gradlew bundleRelease
               │
               └─► Generate Artifacts
                   • app-release.aab (50-80 MB)
                   • Checksums


    Option B: Manual Commands
    ─────────────────────────
         $ ./gradlew clean bundleRelease
              │
              ├─► Resolve Dependencies
              │
              ├─► Compile Kotlin Code
              │   (10-30 sec)
              │
              ├─► Compile Resources
              │   (5-10 sec)
              │
              ├─► Apply ProGuard/R8
              │   • Obfuscate code
              │   • Remove unused classes
              │
              ├─► Generate Bundle
              │   (20-30 sec)
              │
              └─► Sign with Release Keystore
                  (5 sec)


PHASE 3: VERIFICATION (2-3 minutes)
═════════════════════════════════════════════════════════════════════

    ┌──────────────────────┐
    │ Check Build Output   │  ls -lh app/build/outputs/
    │ Verify File Exists   │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Verify File Size     │  Typical: 50-80 MB for AAB
    │ Is Reasonable?       │         70-100 MB for APK
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Generate & Verify    │  $ shasum -a 256 app-release.aab
    │ SHA-256 Checksum     │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ (Optional) Test APK  │  $ adb install -r app-release.apk
    │ On Real Device       │  Verify app functions properly
    └──────────┬───────────┘
               │
               ▼
          BUILD READY


PHASE 4: UPLOAD TO PLAY STORE (5-10 minutes)
═════════════════════════════════════════════════════════════════════

    ┌─────────────────────────────┐
    │ Open Play Console           │  https://play.google.com/console
    │ Select "AiRunCoach" App     │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Navigate to Release Section │  Release → Production
    │                             │  (or Internal Testing first)
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Create New Release          │  Click "Create New Release"
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Upload Build File           │  AAB: app-release.aab
    │                             │  (Auto-validates)
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Wait for Upload             │  Typical: 1-2 minutes
    │ & Validation                │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Update Release Notes        │  Describe what's new:
    │ & Content                   │  • New features
    │                             │  • Bug fixes
    │                             │  • Improvements
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Review All Details          │  • Screenshots (optional update)
    │ & Verify Content            │  • Description (verify current)
    │                             │  • Permissions (auto-listed)
    │                             │  • Target SDK (35+)
    └──────────┬──────────────────┘
               │
               ▼
          READY TO ROLLOUT


PHASE 5: ROLLOUT (5-60 seconds depending on strategy)
═════════════════════════════════════════════════════════════════════

    RECOMMENDED: Staged Rollout
    ───────────────────────────
    
    ┌─────────────────────────────┐
    │ Click "Start Rollout to     │
    │ Production"                 │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Select Rollout Strategy     │
    │                             │
    │ Options:                    │
    │ • 5% rollout (day 1)        │
    │ • 25% rollout (day 2-3)     │
    │ • 50% rollout (day 4-5)     │
    │ • 100% rollout (day 6+)     │
    │                             │
    │ RECOMMENDED: 5% → 25% → 100%│
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Confirm Rollout             │  Last chance to review!
    │                             │
    │ Check:                      │
    │ • Version code correct?     │
    │ • Release notes okay?       │
    │ • Ready to deploy?          │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ DEPLOY!                     │  Release is now LIVE
    │                             │  (to selected %)
    └─────────────────────────────┘


PHASE 6: MONITORING (24-48 hours)
═════════════════════════════════════════════════════════════════════

    Minute 0-30
    ───────────
    ✓ Check Play Console loads
    ✓ Verify version is visible
    ✓ Check installation numbers increase
    
                    │
                    ▼
    
    Hour 1-6
    ────────
    ✓ Monitor crash rate
    ✓ Check Firebase Crashlytics
    ✓ Monitor ANR reports
    ✓ Review first user reviews
    
                    │
                    ▼
    
    Hour 6-24
    ─────────
    ✓ Verify no critical issues
    ✓ Monitor daily active users
    ✓ Check user retention
    ✓ Decide on expanding rollout
    
                    │
                    ▼
    
    Day 1-3: Expand Rollout
    ───────────────────────
    IF NO CRITICAL ISSUES:
        5% → 25%
    
                    │
                    ▼
    
    Day 3-7: Full Rollout
    ─────────────────────
    IF STILL STABLE:
        25% → 100%
    
    IF ISSUES FOUND:
        → Pause rollout
        → Prepare hotfix (new version code)
        → Push emergency release


PHASE 7: POST-RELEASE
══════════════════════════════════════════��══════════════════════════

    Immediate
    ─────────
    ✓ Document release in git/CHANGELOG
    ✓ Update version history
    ✓ Notify team members
    
    Daily for 1 week
    ────────────────
    ✓ Monitor crash trends
    ✓ Check app rating changes
    ✓ Review user feedback
    ✓ Prepare hotfix if needed
    
    Weekly onwards
    ──────────────
    ✓ Plan next release
    ✓ Gather feature requests
    ✓ Track performance metrics
    ✓ Schedule next update


═════════════════════════════════════════════════════════════════════
```

## Build Output Structure

```
app/build/outputs/
├── bundle/
│   └── release/
│       └── app-release.aab         ← Upload this to Play Store
│           (50-80 MB, optimized)
│
└── apk/
    └── release/
        └── app-release.apk         ← Use for testing on device
            (70-100 MB, universal)
```

## Directory Structure for Files

```
AiRunCoach/
├── app/
│   ├── build.gradle.kts            ← Update version here
│   ├── google-services.json        ← Firebase config
│   └── proguard-rules.pro          ← Code obfuscation
│
├── build-release.sh                ← Run this script
│
├── local.properties                ← Keystore credentials (in .gitignore)
│
└── Documentation/
    ├── GOOGLE_PLAY_BUILD_GUIDE.md          ← Complete guide (300+ lines)
    ├── QUICK_RELEASE_CHECKLIST.md          ← Fast reference
    ├── BUILD_COMMANDS_REFERENCE.md         ← 30+ commands
    ├── RELEASE_SUMMARY.md                  ← Overview
    ├── RELEASE_VERIFICATION_REPORT.md      ← Pre-flight checks
    └── RELEASE_WORKFLOW_DIAGRAM.md         ← This file
```

## Decision Tree: Which Build Type?

```
                        Need to Release?
                              │
                    ┌─────────┴─────────┐
                    │                   │
                YES─▶                   ◀─NO
                    │                   │
                    ▼                   ▼
        AAB or APK needed?        Skip building
                    │              (Done)
        ┌───────────┼───────────┐
        │           │           │
       AAB        BOTH         APK
        │           │           │
        │           │      For direct
        │           │    installation or
        │           │      testing only
        │           │
        │           └─────┬─────┘
        │                 │
    Recommended      Also good
    for Play Store   for testing
```

## Release Readiness Checklist (Visual)

```
CODE QUALITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [✓] All code committed
  [✓] Version updated
  [✓] Tests passing
  [✓] No critical crashes

BUILD CONFIGURATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [✓] Min SDK >= 26
  [✓] Target SDK >= 35
  [✓] Version code incremented
  [✓] Keystore configured

SECURITY & SIGNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [✓] Keystore file exists
  [✓] Signing credentials in local.properties
  [✓] local.properties in .gitignore
  [✓] Credentials not shared

GOOGLE PLAY SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [✓] App created in Play Console
  [✓] Package name matches
  [✓] Privacy policy URL set
  [✓] Content rating completed

TESTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [✓] Tested on real device
  [✓] No startup crashes
  [✓] Core features work
  [✓] No ANR (slow app) issues

DOCUMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [✓] Release notes prepared
  [✓] Screenshots updated (if needed)
  [✓] Description current
  [✓] All guides available

READY FOR RELEASE? ──▶ YES ✓ PROCEED
```

## Common Issues & Recovery

```
BUILD FAILS
────────────────────────────────────────────
Problem: Keystore not found
Solution: Check KEYSTORE_PATH in local.properties
          Verify file exists: ls -la /path/to/keystore

Problem: Duplicate version code
Solution: Increment versionCode in app/build.gradle.kts

Problem: Out of memory during build
Solution: export GRADLE_OPTS="-Xmx2048m"
          ./gradlew clean bundleRelease


UPLOAD FAILS
────────────────────────────────────────────
Problem: "Version code already exists"
Solution: Ensure versionCode is unique and higher

Problem: "Invalid signing configuration"
Solution: Verify keystore password in local.properties
          Test: keytool -list -keystore [path]

Problem: "Target SDK too low"
Solution: Ensure targetSdk = 35 in build.gradle.kts


MONITORING ISSUES
────────────────────────────────────────────
Problem: High crash rate after release
Solution: Check Firebase Crashlytics for stack traces
          Prepare emergency hotfix (new version code)
          Pause rollout while fixing

Problem: Users can't install
Solution: Check device compatibility
          Verify min SDK version
          Check Play Console for device restrictions
```

## Time Estimates

```
Activity                          Typical Time
─────────────────────────────────────────────
Prepare (version, notes)          5-10 min
Build (clean → bundle)            2-5 min
Verify (test + checksums)         2-3 min
Upload to Play Store              5-10 min
Review & configure release        5 min
Initial rollout (5%)              1 min
Wait for initial feedback         1-6 hours
Expand rollout (25%)              1 min
Full rollout (100%)               1 min
─────────────────────────────────────────────
Total (first 24 hours)            1-2 hours
(Most time is waiting & monitoring)
```

---

## Quick Links

- **Build Script**: Run `./build-release.sh`
- **Full Guide**: See `GOOGLE_PLAY_BUILD_GUIDE.md`
- **Commands**: See `BUILD_COMMANDS_REFERENCE.md`
- **Checklist**: See `QUICK_RELEASE_CHECKLIST.md`
- **Play Console**: [play.google.com/console](https://play.google.com/console)

---

## Next Step

Run the build script to start:

```bash
./build-release.sh
```

Choose option **1: Build AAB only** for Play Store release.
