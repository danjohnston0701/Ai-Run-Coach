# Garmin Connect IQ App Build & Upload Guide

## Critical Settings (Must Match)

### 1. **App ID**
- **Manifest:** `garmin-companion-app/manifest.xml` → `<iq:application id="..."`
- **Android Code:** `app/src/main/java/.../GarminWatchManager.kt` → `const val APP_ID = "..."`
- **Portal:** https://apps.garmin.com/en-US/developer/ → App Settings → App ID
- **MUST MATCH EXACTLY** or upload will fail with error: "The app ID within the manifest file deviates from the one originally registered"

### 2. **Manifest XML Attributes** (Critical Order & Names)
```xml
<!-- CORRECT (original working format) -->
<iq:manifest xmlns:iq="http://www.garmin.com/xml/connectiq" version="3">
    <iq:application 
        entry="AiRunCoachApp" 
        id="F05F6F7A3B2347668CCACE4B043DB794" 
        launcherIcon="@Drawables.LauncherIcon" 
        minApiLevel="3.2.0"
        name="@Strings.AppName" 
        type="watch-app" 
        version="2.0.0">
```

**Key Points:**
- Use **`minApiLevel`** (NOT `minSdkVersion`)
- Order matters: `xmlns:iq` before `version`
- Include `<iq:barrels/>` closing tag
- No XML encoding declaration needed

### 3. **Device List in Manifest**
All devices MUST be listed in `<iq:products>` section:

```xml
<iq:products>
    <iq:product id="fenix6"/>
    <iq:product id="fenix6pro"/>
    <iq:product id="fenix6s"/>
    <iq:product id="fenix6spro"/>
    <iq:product id="fenix6xpro"/>
    <iq:product id="fenix7"/>
    <iq:product id="fenix7s"/>
    <iq:product id="fenix7x"/>
    <iq:product id="fenix7pro"/>
    <iq:product id="fenix7spro"/>
    <iq:product id="fenix7xpro"/>
    <iq:product id="fr55"/>
    <iq:product id="fr245"/>
    <iq:product id="fr255"/>
    <iq:product id="fr265"/>
    <iq:product id="fr945"/>
    <iq:product id="fr955"/>
    <iq:product id="fr965"/>
    <iq:product id="vivoactive4"/>
    <iq:product id="vivoactive5"/>
    <iq:product id="venu"/>
    <iq:product id="venu2"/>
    <iq:product id="venu2plus"/>
    <iq:product id="venu3"/>
</iq:products>
```

### 4. **monkey.jungle Configuration**
Must define **ALL** devices from the manifest:

```
project.manifest = manifest.xml
base.sourcePath = source
base.resourcePath = resources
base.lang = eng

# EVERY device from manifest must have an entry
fenix6.sourcePath = $(base.sourcePath)
fenix6.resourcePath = $(base.resourcePath)

fenix6pro.sourcePath = $(base.sourcePath)
fenix6pro.resourcePath = $(base.resourcePath)

# ... repeat for all 24 devices
```

## Build Process (For Garmin Developer Portal)

### Step 1: Verify manifest.xml
```bash
cd garmin-companion-app
cat manifest.xml | grep -E "id=|minApiLevel|xmlns:iq"
```

### Step 2: Build using `-e` (package-app) flag
```bash
monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r
```

**Flags explained:**
- `-o bin/AiRunCoach.iq` — output file
- `-f monkey.jungle` — build config
- `-y developer_key.der` — private key for signing
- **`-e`** — CRITICAL: `--package-app` (creates proper 7-zip store package)
- `-r` — release build (strips debug symbols, reduces size)

**Output should show:**
```
55 OUT OF 55 DEVICES BUILT
BUILD SUCCESSFUL
```

Result: `bin/AiRunCoach.iq` (~1.0 MB, 7-zip format)

### Step 3: Verify file
```bash
file bin/AiRunCoach.iq  # Should show: "7-zip archive"
ls -lh bin/AiRunCoach.iq  # Should be ~1.0 MB
```

### Step 4: Upload to Garmin Developer Portal
1. Go https://apps.garmin.com/en-US/developer/
2. Find your app (by ID: `F05F6F7A3B2347668CCACE4B043DB794`)
3. Click **"Update App"** or **"Submit New Version"**
4. Upload the `.iq` file
5. Fill in release notes
6. Submit for review

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "The app supported product types must be specified" | Missing `<iq:barrels/>` or wrong manifest attributes | Use exact manifest format above |
| "The app ID within the manifest file deviates..." | App ID mismatch between manifest and portal | Update manifest `id=` to match portal |
| "There was an error processing the manifest file" | Wrong attribute names (`minSdkVersion` instead of `minApiLevel`) | Use `minApiLevel="3.2.0"` |
| File is 126 KB instead of 1.0 MB | Missing `-e` flag in monkeyc | Always use `monkeyc ... -e -r` |
| File type is "data" instead of "7-zip" | Not using `-e --package-app` | Add `-e` flag |

## Version Bumping
When uploading a new version:
1. Increment `version="X.Y.Z"` in manifest.xml
2. Keep the same app ID
3. Keep the same device list
4. Rebuild with `-e` flag
5. Upload

## Testing Before Upload
### Local testing (simulator):
```bash
monkeydo bin/AiRunCoach.prg fenix7 --sim
```

### Testing on device:
```bash
monkeydo bin/AiRunCoach.prg fenix7
```

### Store package structure (FYI):
The `-e` flag creates a 7-zip containing:
- Per-device `.prg` files (55 devices total, even if not all listed)
- Manifest with metadata
- Resources (icons, strings, layouts)
- Debug symbols (stripped with `-r`)

## Quick Reference: Full Build Command
```bash
cd garmin-companion-app && \
rm -f bin/AiRunCoach.iq && \
monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r \
  2>&1 | tail -5 && \
ls -lh bin/AiRunCoach.iq
```

Expected output:
```
55 OUT OF 55 DEVICES BUILT
BUILD SUCCESSFUL
-rw-r--r--  ...   1.0M  ... bin/AiRunCoach.iq
```

Then upload to Garmin Developer Portal.
