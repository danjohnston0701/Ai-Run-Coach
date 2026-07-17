# IQ File Guide Summary

All documentation on creating new IQ files for Garmin Connect IQ Store.

---

## 📚 Documentation Files Created

### 1. **CREATE_NEW_IQ_FILE_GUIDE.md** ⭐ Start Here
**Comprehensive, step-by-step guide**
- Complete SDK installation instructions
- Detailed build process explanation
- Troubleshooting for all common issues
- Full build script included
- **Best for**: First-time builders, troubleshooting

**Use this when**: You need detailed explanations or hit errors

---

### 2. **IQ_FILE_BUILD_QUICK_START.md** ⚡ Fast Reference
**Quick reference and common commands**
- Fast path for experienced builders
- Common commands reference
- Quick troubleshooting
- Tips and tricks
- **Best for**: Experienced builders, quick lookups

**Use this when**: You just need a quick reminder of the steps

---

### 3. **IQ_BUILD_WORKFLOW.md** 🔄 Complete Workflow
**End-to-end build and submission process**
- Visual workflow overview
- Detailed step-by-step instructions
- SDK installation (all platforms)
- Version management
- Garmin Store upload process
- Review timeline expectations
- Comprehensive troubleshooting
- **Best for**: Understanding the complete process

**Use this when**: You want to see the entire workflow from start to finish

---

### 4. **build-new-iq-file.sh** 🔧 Build Script
**Automated build script**
- One command to build
- Verifies SDK is installed
- Handles version updates
- Validates output
- Shows upload instructions
- **Best for**: Automation and consistency

**Use this when**: You want to automate the build process

```bash
# Basic usage
bash build-new-iq-file.sh

# With version
bash build-new-iq-file.sh 3.1.9
```

---

## 🚀 Quick Start (5 Minutes)

If you've done this before:

```bash
# 1. Update version
nano garmin-companion-app/manifest.xml
# Change version="3.1.8" to version="3.1.9"

# 2. Build
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
bash build-new-iq-file.sh

# 3. Verify
file garmin-companion-app/bin/AiRunCoach.iq

# 4. Upload
# Go to: https://apps.garmin.com/developer/dashboard
```

---

## 📖 Which Guide Should I Read?

### "I've never done this before"
→ Start with **CREATE_NEW_IQ_FILE_GUIDE.md**

### "I did this once, remind me how"
→ Use **IQ_FILE_BUILD_QUICK_START.md**

### "I want to understand the complete process"
→ Read **IQ_BUILD_WORKFLOW.md**

### "Just let the script do it"
→ Run `bash build-new-iq-file.sh`

---

## 🎯 Common Tasks

### Build a new IQ file
```bash
bash build-new-iq-file.sh
```
See: **IQ_FILE_BUILD_QUICK_START.md**

### Update to a specific version
```bash
bash build-new-iq-file.sh 3.2.0
```
See: **IQ_BUILD_WORKFLOW.md** (section: Update Version)

### Install SDK for first time
See: **IQ_BUILD_WORKFLOW.md** (section: Install SDK)

### Troubleshoot build errors
See: **CREATE_NEW_IQ_FILE_GUIDE.md** (section: Troubleshooting)

### Upload to Garmin Store
See: **IQ_BUILD_WORKFLOW.md** (section: Upload to Garmin Store)

---

## 📋 Current Configuration

**App Info**:
- **Name**: AI Run Coach
- **Current Version**: 3.1.8
- **App ID**: C7BF12555C184F9FB1F82B49E72E20A2
- **Supported Devices**: 24 (Fenix, Forerunner, VivoActive, Venu)
- **Output Location**: `garmin-companion-app/bin/AiRunCoach.iq`

**Files**:
- **Manifest**: `garmin-companion-app/manifest.xml`
- **Build Config**: `garmin-companion-app/monkey.jungle`
- **Developer Key**: `garmin-companion-app/developer_key.der`
- **Source Code**: `garmin-companion-app/source/`
- **Resources**: `garmin-companion-app/resources/`

---

## ✅ Prerequisites Checklist

Before building, ensure:

- [ ] Garmin Connect IQ SDK installed
- [ ] `monkeyc -v` command works
- [ ] Project repo cloned locally
- [ ] Internet connection (for Garmin Store upload)
- [ ] Garmin Developer Portal account (for upload)

---

## 🔐 Important Notes

✅ **Everything is already configured correctly**
- Manifest.xml: ✅ Ready
- Developer key: ✅ Ready
- monkey.jungle: ✅ Ready
- Source code: ✅ Ready
- Resources: ✅ Ready

⚠️ **Only update version number**
- Don't modify manifest.xml structure
- Don't move developer_key.der
- Don't edit monkey.jungle device list
- Don't rename files

✅ **Version format**
- Use semantic versioning: X.Y.Z
- Each version must be unique
- Garmin Store rejects duplicates

---

## 📊 Build Output

### Expected Output File

```
garmin-companion-app/bin/AiRunCoach.iq
```

**Properties**:
- **Format**: 7-zip archive
- **Size**: 1.0 - 1.8 MB
- **Contains**: 24 device-specific binaries
- **Signed**: With developer_key.der
- **Ready**: For Garmin Store upload

### Verify Output

```bash
# Check file exists
ls -lh garmin-companion-app/bin/AiRunCoach.iq

# Check file type
file garmin-companion-app/bin/AiRunCoach.iq
# Output: "7-zip archive data"

# View contents
unzip -l garmin-companion-app/bin/AiRunCoach.iq | head -30
```

---

## 🎓 Learning Resources

### Garmin Official
- **SDK Download**: https://developer.garmin.com/connect-iq/sdk/
- **Monkey C API Docs**: https://developer.garmin.com/connect-iq/api-docs/Monkey-C/
- **Developer Portal**: https://apps.garmin.com/developer/dashboard

### Our Documentation
- **Complete Guide**: CREATE_NEW_IQ_FILE_GUIDE.md
- **Quick Start**: IQ_FILE_BUILD_QUICK_START.md
- **Workflow**: IQ_BUILD_WORKFLOW.md
- **Build Script**: build-new-iq-file.sh

---

## 🔄 Build Process Overview

```
┌──────────────────────────────────────┐
│ 1. Install SDK (one-time)            │
├──────────────────────────────────────┤
│ 2. Update version in manifest        │
├──────────────────────────────────────┤
│ 3. Run: bash build-new-iq-file.sh    │
├──────────────────────────────────────┤
│ 4. Verify: file bin/AiRunCoach.iq    │
├──────────────────────────────────────┤
│ 5. Upload to Garmin Store            │
├──────────────────────────────────────┤
│ 6. Wait for review (1-2 hours)       │
├──────────────────────────────────────┤
│ 7. Published! 🎉                     │
└──────────────────────────────────────┘
```

---

## 💡 Tips

✅ **Use the build script** - Handles everything automatically  
✅ **Always update version** - Each submission needs a unique number  
✅ **Read release notes** - Users see these on Garmin Store  
✅ **Test locally first** - Use Connect IQ simulator before uploading  
✅ **Keep changelog** - Track what changed in each version  

⚠️ **Don't forget the `-e` flag** - File won't work without it  
⚠️ **Don't upload drafts** - Click "Submit for Review", not "Save"  
⚠️ **Don't modify core files** - manifest.xml and monkey.jungle are correct  
⚠️ **Don't use `-w` flag** - That's for debugging, not store  

---

## 🆘 Need Help?

### For SDK Issues
→ Visit: https://developer.garmin.com/connect-iq/sdk/

### For Build Errors
→ See: **CREATE_NEW_IQ_FILE_GUIDE.md** → Troubleshooting section

### For Upload Issues
→ See: **IQ_BUILD_WORKFLOW.md** → Upload to Garmin Store section

### For Workflow Questions
→ See: **IQ_BUILD_WORKFLOW.md** (complete reference)

---

## 📝 File Locations

```
/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/

├── CREATE_NEW_IQ_FILE_GUIDE.md         ← Detailed guide
├── IQ_FILE_BUILD_QUICK_START.md        ← Quick reference
├── IQ_BUILD_WORKFLOW.md                ← Complete workflow
├── IQ_FILE_GUIDE_SUMMARY.md            ← This file
├── build-new-iq-file.sh                ← Build script
│
└── garmin-companion-app/
    ├── manifest.xml                    ← Update version here
    ├── monkey.jungle
    ├── developer_key.der
    ├── source/
    ├── resources/
    └── bin/
        └── AiRunCoach.iq              ← Output file
```

---

## 🎬 Next Steps

1. **First time?** Read: `CREATE_NEW_IQ_FILE_GUIDE.md`
2. **Ready to build?** Run: `bash build-new-iq-file.sh`
3. **Need details?** Check: `IQ_BUILD_WORKFLOW.md`
4. **Need quick ref?** Use: `IQ_FILE_BUILD_QUICK_START.md`

---

## Summary

You now have:
✅ **Complete guide** for building IQ files  
✅ **Quick reference** for experienced builders  
✅ **Full workflow** from start to store submission  
✅ **Automated script** to handle the build  
�� **Troubleshooting** for common issues  

Everything you need to build and submit IQ files to Garmin Store! 🚀
