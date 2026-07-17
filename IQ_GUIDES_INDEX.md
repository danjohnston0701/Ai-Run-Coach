# IQ File Guides Index

Complete reference for all IQ file building guides and tools.

---

## 📚 Documentation Overview

Created 5 comprehensive guides for building IQ files for Garmin Connect IQ Store:

```
┌─────────────────────────────────────────────────────────────┐
│                   IQ FILE GUIDES (5 files)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. IQ_FILE_GUIDE_SUMMARY.md          (This Index)         │
│     └─ Overview of all guides                              │
│                                                             │
│  2. CREATE_NEW_IQ_FILE_GUIDE.md       (Complete Guide)     │
│     └─ Step-by-step, detailed explanations                 │
│     └─ Best for: First-time builders, troubleshooting      │
│                                                             │
│  3. IQ_FILE_BUILD_QUICK_START.md      (Quick Reference)    │
│     └─ Fast commands and tips                              │
│     └─ Best for: Experienced builders, reminders           │
│                                                             │
│  4. IQ_BUILD_WORKFLOW.md              (Complete Workflow)  │
│     └─ Visual overview, full process                       │
│     └─ Best for: Understanding end-to-end flow             │
│                                                             │
│  5. IQ_BUILD_COMMAND_REFERENCE.md    (Command Reference)   │
│     └─ All commands in one place                           │
│     └─ Best for: Copy-paste workflows                      │
│                                                             │
│  ⚙️  build-new-iq-file.sh              (Build Script)       │
│     └─ Automated build tool                                │
│     └─ Best for: Hands-off automation                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Quick Navigation

### By Use Case

#### "I've never done this before"
1. Read: **CREATE_NEW_IQ_FILE_GUIDE.md** (10 min)
2. Follow: Step 1 (Install SDK)
3. Follow: Step 2-4 (Build and verify)
4. Follow: Step 5 (Upload to store)

#### "I need to build right now"
1. Run: `bash build-new-iq-file.sh`
2. Verify: `file garmin-companion-app/bin/AiRunCoach.iq`
3. Upload to: https://apps.garmin.com/developer/dashboard

#### "I need a quick reminder"
→ Use: **IQ_FILE_BUILD_QUICK_START.md**

#### "I want to understand everything"
→ Read: **IQ_BUILD_WORKFLOW.md**

#### "I need all the commands"
→ Use: **IQ_BUILD_COMMAND_REFERENCE.md**

---

## 📖 Guide Details

### 1. CREATE_NEW_IQ_FILE_GUIDE.md
**Type**: Complete, step-by-step guide  
**Length**: ~600 lines  
**Time to read**: 15-20 minutes  

**Contains**:
- Prerequisites checklist
- SDK installation (all platforms)
- Version number management
- Complete build process
- Output verification
- Garmin Store upload
- Comprehensive troubleshooting
- Full build script

**Best for**: 
- First-time builders
- Troubleshooting errors
- Learning the complete process

**Read this when**: You're stuck or want detailed explanations

---

### 2. IQ_FILE_BUILD_QUICK_START.md
**Type**: Quick reference guide  
**Length**: ~200 lines  
**Time to read**: 5 minutes  

**Contains**:
- Prerequisites checklist
- Fast path (one command)
- Step-by-step (manual)
- Build script usage
- Quick troubleshooting
- Common commands
- Tips and tricks

**Best for**:
- Experienced builders
- Quick lookups
- Reminders after time away

**Read this when**: You just need a quick reminder

---

### 3. IQ_BUILD_WORKFLOW.md
**Type**: Complete workflow overview  
**Length**: ~700 lines  
**Time to read**: 20-30 minutes  

**Contains**:
- Visual workflow diagram
- Step 1: SDK installation (all platforms)
- Step 2: Version management
- Step 3: Build process
- Step 4: Output verification
- Step 5: Garmin Store upload
- Step 6: Review process and timeline
- Step 7: Publication
- Build configuration reference
- Device list (24 total)
- Comprehensive troubleshooting
- Quick checklist
- Resource links

**Best for**:
- Understanding full process
- First-time understanding
- Learning about review timeline
- Project planning

**Read this when**: You want to understand the complete workflow

---

### 4. IQ_BUILD_COMMAND_REFERENCE.md
**Type**: Command reference  
**Length**: ~400 lines  
**Time to read**: 10 minutes (for reference)  

**Contains**:
- Super quick version (2 commands)
- Setup commands (all platforms)
- Before build commands
- Build commands (script and manual)
- Verification commands
- Cleanup commands
- Development commands
- Common workflows
- Build flag explanations
- Device list
- Troubleshooting commands
- Script examples

**Best for**:
- Copy-paste workflows
- Command reference
- Automation
- CI/CD integration

**Read this when**: You need the exact commands

---

### 5. IQ_FILE_GUIDE_SUMMARY.md (You Are Here)
**Type**: Index and navigation guide  
**Length**: ~300 lines  

**Contains**:
- Overview of all guides
- Navigation by use case
- Quick start (2 commands)
- Current configuration
- Prerequisites
- Important notes
- Learning resources
- File locations
- Next steps

**Best for**:
- Finding the right guide
- Quick overview
- Getting started

---

## ⚙️ build-new-iq-file.sh
**Type**: Automated build script  
**Executable**: Yes  

**Features**:
- ✅ Verifies SDK is installed
- ✅ Updates version (optional)
- ✅ Cleans previous build
- ✅ Compiles for all 24 devices
- ✅ Verifies output is 7-zip
- ✅ Shows upload instructions
- ✅ Clear error messages

**Usage**:
```bash
# Keep current version
bash build-new-iq-file.sh

# Set specific version
bash build-new-iq-file.sh 3.1.9
```

**Best for**: Hands-off automation

---

## 🚀 Start Here

### Option A: "I want the quick version"
```bash
# 1. Read this (2 minutes)
cat IQ_FILE_BUILD_QUICK_START.md

# 2. Run this (2 minutes)
bash build-new-iq-file.sh

# 3. You're done!
```

### Option B: "I want to understand everything"
```bash
# 1. Read this (20 minutes)
cat CREATE_NEW_IQ_FILE_GUIDE.md

# 2. Install SDK (10 minutes)
# Follow section: "Step 1: Install Garmin SDK"

# 3. Build (2 minutes)
bash build-new-iq-file.sh

# 4. Upload (5 minutes)
# Follow section: "Step 5: Upload to Garmin Store"
```

### Option C: "Just give me the commands"
```bash
# 1. Look this up (5 minutes)
cat IQ_BUILD_COMMAND_REFERENCE.md

# 2. Run what you need
bash build-new-iq-file.sh

# 3. Done!
```

---

## 📋 Current Project Status

**Application**: AI Run Coach (Garmin Watch App)

**Current Version**: 3.1.8  
**Location**: `garmin-companion-app/manifest.xml`  

**Supported Devices**: 24
- Fenix series (11): 6, 6 Pro, 6S, 6S Pro, 6X Pro, 7, 7S, 7X, 7 Pro, 7S Pro, 7X Pro
- Forerunner series (7): 55, 245, 255, 265, 945, 955, 965
- VivoActive series (2): 4, 5
- Venu series (4): Venu, Venu 2, Venu 2 Plus, Venu 3

**Output File**: `garmin-companion-app/bin/AiRunCoach.iq`  
**Output Type**: 7-zip archive  
**Output Size**: 1.0 - 1.8 MB  

**Store**: Garmin Connect IQ Store  
**Portal**: https://apps.garmin.com/developer/dashboard  

---

## ✅ Prerequisites

Before building, ensure you have:

- [ ] **Garmin SDK installed** (download from https://developer.garmin.com/connect-iq/sdk/)
- [ ] **`monkeyc` command works** (run `monkeyc -v`)
- [ ] **Project cloned** locally
- [ ] **Developer account** for Garmin Store (for upload)

All source files and configuration are already in place. No changes needed to manifest, developer key, or build configuration.

---

## 🎓 Learning Path

### Complete Beginner
1. Read: **CREATE_NEW_IQ_FILE_GUIDE.md**
2. Install Garmin SDK
3. Run: `bash build-new-iq-file.sh`
4. Upload to store
5. Refer to: **IQ_BUILD_WORKFLOW.md** for upload steps

### Experienced Developer
1. Skim: **IQ_FILE_BUILD_QUICK_START.md**
2. Run: `bash build-new-iq-file.sh`
3. Use: **IQ_BUILD_COMMAND_REFERENCE.md** as reference

### Need Specific Help
- **"How do I install the SDK?"** → See: CREATE_NEW_IQ_FILE_GUIDE.md (Step 1)
- **"How do I build?"** → See: IQ_FILE_BUILD_QUICK_START.md (Fast Path)
- **"How do I upload?"** → See: IQ_BUILD_WORKFLOW.md (Section 5)
- **"What's the exact command?"** → See: IQ_BUILD_COMMAND_REFERENCE.md
- **"What does each flag do?"** → See: IQ_BUILD_WORKFLOW.md (Build Flags Explained)
- **"I got an error"** → See: CREATE_NEW_IQ_FILE_GUIDE.md (Troubleshooting)

---

## 💡 Quick Tips

✅ **Use the build script** - Handles everything automatically  
✅ **Always update version** - Each upload needs a unique number  
✅ **Use the `-e` flag** - Critical for Garmin Store format  
✅ **Verify file type** - Must be "7-zip archive data"  
✅ **Test locally first** - Use Connect IQ simulator  

⚠️ **Don't forget versions** - Garmin rejects duplicate versions  
⚠️ **Don't forget to submit** - Click "Submit for Review", not just "Save"  
⚠️ **Don't modify core files** - manifest.xml and monkey.jungle are correct  
⚠️ **Don't use -w flag** - That's for debugging, not store  

---

## 📞 Support Resources

### For IQ Building
- **Garmin SDK**: https://developer.garmin.com/connect-iq/sdk/
- **Monkey C API**: https://developer.garmin.com/connect-iq/api-docs/Monkey-C/
- **Developer Portal**: https://apps.garmin.com/developer/dashboard

### In This Repo
- **Complete Guide**: `CREATE_NEW_IQ_FILE_GUIDE.md`
- **Quick Start**: `IQ_FILE_BUILD_QUICK_START.md`
- **Workflow**: `IQ_BUILD_WORKFLOW.md`
- **Commands**: `IQ_BUILD_COMMAND_REFERENCE.md`
- **This Index**: `IQ_GUIDES_INDEX.md`

---

## 🎯 Next Actions

### First Time?
1. Read: `CREATE_NEW_IQ_FILE_GUIDE.md` (Step 1: Install SDK)
2. Install the Garmin SDK
3. Run: `bash build-new-iq-file.sh`
4. Upload to store

### Ready to Build?
```bash
bash build-new-iq-file.sh
```

### Need Details?
- Quick reference: `IQ_FILE_BUILD_QUICK_START.md`
- Complete guide: `CREATE_NEW_IQ_FILE_GUIDE.md`
- Workflow overview: `IQ_BUILD_WORKFLOW.md`
- All commands: `IQ_BUILD_COMMAND_REFERENCE.md`

---

## 📂 File Structure

```
/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/

IQ Guides (You are here):
├── IQ_GUIDES_INDEX.md                  ← Navigation
├── IQ_FILE_GUIDE_SUMMARY.md            ← Overview
├── CREATE_NEW_IQ_FILE_GUIDE.md         ← Complete guide
├── IQ_FILE_BUILD_QUICK_START.md        ← Quick ref
├── IQ_BUILD_WORKFLOW.md                ← Full workflow
├── IQ_BUILD_COMMAND_REFERENCE.md       ← Commands
└── build-new-iq-file.sh                ← Build script

Garmin App (What you're building):
└── garmin-companion-app/
    ├── manifest.xml                    ← App version
    ├── monkey.jungle                   ← Build config
    ├── developer_key.der               ← Signing key
    ├── source/                         ← Source code
    │   ├── AiRunCoachApp.mc
    │   ├── views/
    │   │   ├── StartView.mc
    │   │   └── RunView.mc
    │   └── networking/
    │       └── DataStreamer.mc
    ├── resources/                      ← Assets
    │   ├── drawables/
    │   ├── strings/
    │   ├── layouts/
    │   └── menus/
    └── bin/
        └── AiRunCoach.iq               ← Output (generated)
```

---

## 🚀 You're All Set!

Everything is ready. All documentation is in place. All tools are prepared.

**Choose your starting point above and get building!** 🎉

---

## Summary

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **IQ_FILE_GUIDE_SUMMARY.md** | This file - navigation | 5 min |
| **CREATE_NEW_IQ_FILE_GUIDE.md** | Complete guide | 15 min |
| **IQ_FILE_BUILD_QUICK_START.md** | Quick reference | 5 min |
| **IQ_BUILD_WORKFLOW.md** | Full workflow | 20 min |
| **IQ_BUILD_COMMAND_REFERENCE.md** | All commands | 10 min |
| **build-new-iq-file.sh** | Build script | - |

**Total reading time if starting from zero**: ~30-40 minutes (includes SDK installation)  
**Time to build after SDK installed**: 5 minutes  

You've got everything you need! 🚀
