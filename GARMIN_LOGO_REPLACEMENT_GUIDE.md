# 📱 Garmin Connect IQ Logo Replacement

## Issue
The Garmin logo on the Connected Devices screen was displaying corrupted/degraded (showing just the "C" logo).

## Solution
Replace with the official "available on GARMIN CONNECT IQ" logo that you provided.

---

## Location
**File**: `app/src/main/res/drawable/ic_garmin_connect_logo.png`

**Usage**: Connected Devices screen, Garmin watch section

**Size**: Currently 14 KB

---

## What Needs to Be Done

### Step 1: Save the New Logo
The logo you provided shows:
- Blue "IQ" logo on the left
- Gray background
- Text "available on" above
- "GARMIN.CONNECT IQ." text on the right
- Professional, clean design

**File to replace**: `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/res/drawable/ic_garmin_connect_logo.png`

### Step 2: Recommended Specifications
- **Format**: PNG (with transparency recommended)
- **Dimensions**: 400 x 100 pixels (landscape, button-sized)
- **Resolution**: 2x or 3x density for best quality on devices
- **Background**: Transparent or match app background

### Step 3: Save the File
Place the corrected logo image at:
```
app/src/main/res/drawable/ic_garmin_connect_logo.png
```

### Step 4: Rebuild
- Clean build: `./gradlew clean build`
- Or just rebuild: `./gradlew build`

---

## File Information
- **Current broken file backed up as**: `ic_garmin_connect_logo.png.bak`
- **Location**: `app/src/main/res/drawable/`
- **Referenced in**: `ConnectedDevicesScreen.kt` line 421

---

## How It's Used in Code

In `ConnectedDevicesScreen.kt`:

```kotlin
Image(
    painter = painterResource(id = R.drawable.ic_garmin_connect_logo),
    contentDescription = "Garmin Connect IQ Logo",
    modifier = Modifier
        .fillMaxWidth()
        .height(80.dp)
)
```

The logo displays as a banner-style image in the Garmin watch connection section.

---

## Related Files
- `app/src/main/res/drawable/ic_garmin_tag.xml` - Tag icon (separate)
- `app/src/main/res/drawable/ic_garmin_logo.png` - Simple logo (separate)

---

## Steps to Replace (For Android Developer)

1. **Export the logo image** you provided as PNG
2. **Optimize the PNG** (use ImageOptim or similar to keep under 50KB)
3. **Copy to project**:
   ```bash
   cp new_logo.png app/src/main/res/drawable/ic_garmin_connect_logo.png
   ```
4. **Clean and rebuild**:
   ```bash
   ./gradlew clean build
   ```
5. **Test the Connected Devices screen** to verify logo displays correctly

---

## Notes
- The backup of the old (broken) logo is saved as `.bak` file
- No code changes needed - just the image file replacement
- The logo will scale automatically to fit the UI constraints
- Make sure the new PNG is properly optimized for app size

---

## Verification
After replacing, check:
- ✅ Logo displays cleanly in Connected Devices screen
- ✅ Logo is crisp and not pixelated
- ✅ Logo colors are correct (blue IQ, gray background, black text)
- ✅ Logo doesn't stretch or distort
- ✅ App builds without errors

---

## File Status
- **Old logo**: Backed up as `ic_garmin_connect_logo.png.bak`
- **New logo**: Ready to be saved as `ic_garmin_connect_logo.png`
- **Status**: Awaiting file replacement

