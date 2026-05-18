# 📱 Android Connected Devices Screen - Updated Layout

## Summary of Changes

The **Connected Devices screen** has been restructured to prioritize the **Strava integration** and simplify the interface.

---

## What Changed

### 1. **Removed from "Coming Soon" Section**
- ❌ **Apple Watch** - Marked as iOS only
- ❌ **COROS** - Not needed for MVP

### 2. **Garmin Connect Hidden**
- The Garmin Connect card is now **commented out** with explanation
- Reason: Garmin Connect data cannot be used for AI processing per requirements
- Can be re-enabled if needed in the future

### 3. **New Section Order**
The updated order is now:

```
1. Page Subtitle (updated copy)
2. ┌─ Garmin Watch App
   │  └─ Download from Connect IQ Store
3. ┌─ Strava Integration ⭐ NEW
   │  └─ Connect Strava Account
4. ┌─ Coming Soon
   │  └─ Samsung Galaxy Watch
```

---

## New Strava Card Design

### **Visual Layout**
```
┌────────────────────────────────────┐
│  [S] Strava Integration            │
│      Publish runs with...          │
├────────────────────────────────────┤
│  Connect your Strava account to    │
│  publish completed runs with full  │
│  GPS tracks, heart rate, cadence,  │
│  and elevation data...             │
├────────────────────────────────────┤
│  🌍 Route Map  ❤️ All Metrics      │
│  📤 Social Share                   │
├────────────────────────────────────┤
│  [  Connect Strava Account  ]      │
└────────────────────────────────────┘
```

### **Key Features**
- **Strava branding** with orange color (0xFFFC5200)
- **3 feature chips**: Route Map, All Metrics, Social Share
- **Single CTA button**: "Connect Strava Account"
- **Consistent styling** with Garmin cards

### **Color Scheme**
- **Primary**: Strava Orange `#FC5200`
- **Icon Background**: Strava Orange box with white "S"
- **Accent**: Orange badges and buttons

---

## Code Structure

### **New Function Added**
```kotlin
@Composable
private fun StravaIntegrationCard(
    onNavigateToStrava: () -> Unit
)
```

### **Updated Function Signature**
```kotlin
fun ConnectedDevicesScreen(
    // ... existing params ...
    onNavigateToStrava: () -> Unit = {},  // ⭐ NEW
    // ... other params ...
)
```

### **Updated Page Text**
- **Old**: "Watch apps provide realtime data... publish to Strava... or sync Garmin Connect"
- **New**: "Get real-time coaching with your Garmin watch, and publish completed runs to Strava with full GPS data and metrics"

---

## Integration Points

### **Navigation Parameter**
The screen now accepts `onNavigateToStrava` callback:

```kotlin
ConnectedDevicesScreen(
    onNavigateBack = { /* ... */ },
    onNavigateToGarminConnect = { /* ... */ },
    onNavigateToGarminWatchApp = { /* ... */ },
    onNavigateToGarminPermissions = { /* ... */ },
    onNavigateToStrava = { /* Navigate to Strava auth */ },  // ⭐ NEW
    viewModel = viewModel
)
```

### **Where to Wire Up**
In the navigation/routing code, when user taps "Connect Strava Account":

```kotlin
onNavigateToStrava = {
    navController.navigate("strava_auth")
    // or open web browser for OAuth flow
}
```

---

## Next Steps

1. **Create Strava Navigation Route**
   - Add route for `strava_auth`
   - Implement OAuth web view or browser opening

2. **Create Strava Auth Screen** (or use web view)
   - Option A: Web view that opens Strava OAuth
   - Option B: Deep link handling for callback

3. **Handle OAuth Callback**
   - Deep link listener for `airuncoach://strava/auth-complete?success=true`
   - Update UI to show connection status

4. **Add Strava Logo**
   - Replace the temporary "S" box with actual Strava logo drawable
   - TODO comment left in code at line ~471

---

## UI Consistency

✅ **Follows Existing Patterns**
- Uses `Card` with `RoundedCornerShape(16.dp)`
- Uses `SmallChip` for feature tags
- Uses consistent spacing (8.dp, 12.dp, 14.dp, 20.dp)
- Matches typography: `AppTextStyles`
- Matches color scheme: `Colors` object

✅ **Maintains Visual Hierarchy**
- Orange accent color differentiates Strava from Garmin (blue/green)
- Positioned prominently as main integration after Garmin Watch

---

## File Changes

**Modified**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ConnectedDevicesScreen.kt`

- Lines 56-97: Updated `comingSoonDevices` list
- Line 49: Added `onNavigateToStrava` parameter
- Lines 138-141: Updated page subtitle
- Lines 157-172: Replaced Garmin Connect with Strava section
- Lines 395-470: Added new `StravaIntegrationCard()` composable
- Line 12: Added Link icon import

---

## Build Status

✅ **Compiles successfully**
- No TypeScript errors
- No Kotlin compilation errors
- No warnings introduced

---

## Future Enhancements

1. **Connection Status**
   - Show "Connected" badge when account is linked
   - Show account name/email
   - Add "Manage" and "Disconnect" buttons

2. **Share Sheet Integration**
   - Add "Share to Strava" button in post-run screen
   - One-click publish without OAuth re-entry

3. **Strava Logo Asset**
   - Replace placeholder "S" with official Strava logo
   - Add proper dimensions and colors

---

## Related Documentation

- See: `ANDROID_STRAVA_SETUP.md` - Full Android implementation guide
- See: `STRAVA_INTEGRATION_GUIDE.md` - Backend API details
- See: `NEXT_STEPS_ANDROID_iOS.md` - Complete integration workflow

