# App Update Notification System

This guide covers sending app update notifications to users and prompting them to update from Google Play Store.

## Part 1: Backend - Send Push Notification via Replit Shell

### Step 1: Create Backend API Endpoint

Add this endpoint to your `server/routes.ts`:

```typescript
// POST /api/admin/send-app-update-notification
app.post("/api/admin/send-app-update-notification", async (req, res) => {
  try {
    // Check admin authorization
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { minVersion, title, body, playStoreUrl } = req.body;

    // Validate inputs
    if (!minVersion || !title || !body) {
      return res.status(400).json({ error: "Missing required fields: minVersion, title, body" });
    }

    const finalPlayStoreUrl = playStoreUrl || "https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach";

    // Get all users with FCM tokens
    const allUsers = await db.query.users.findMany();
    const usersWithTokens = allUsers.filter(u => u.fcmToken);

    if (usersWithTokens.length === 0) {
      return res.json({ 
        success: true, 
        message: "No users with FCM tokens to notify",
        sent: 0 
      });
    }

    const { sendPushNotification } = await import("./notification-service");

    let successCount = 0;
    let failureCount = 0;

    // Send to each user
    for (const user of usersWithTokens) {
      try {
        await sendPushNotification(
          user.id,
          {
            title,
            body,
            data: {
              type: "app_update",
              minVersion,
              playStoreUrl: finalPlayStoreUrl,
              timestamp: new Date().toISOString()
            }
          },
          true // createInAppNotification
        );
        successCount++;
      } catch (err) {
        console.error(`Failed to send to user ${user.id}:`, err);
        failureCount++;
      }
    }

    res.json({
      success: true,
      message: `Sent to ${successCount} users, ${failureCount} failed`,
      sent: successCount,
      failed: failureCount,
      total: usersWithTokens.length
    });

  } catch (error) {
    console.error("Error sending app update notification:", error);
    res.status(500).json({ error: error.message });
  }
});
```

### Step 2: Create Shell Script in Replit

Create a file: `server/scripts/send-app-update.sh`

```bash
#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REPLIT_API_URL="${REPLIT_API_URL:-https://airuncoach.live}"
ADMIN_TOKEN="${ADMIN_TOKEN}"

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${RED}Error: ADMIN_TOKEN environment variable not set${NC}"
  exit 1
fi

# Parse command line arguments
MIN_VERSION="${1:-}"
TITLE="${2:-New Version Available}"
BODY="${3:-Please update to get the latest features and bug fixes}"
PLAY_STORE_URL="${4:-https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach}"

if [ -z "$MIN_VERSION" ]; then
  echo -e "${YELLOW}Usage: ./send-app-update.sh <minVersion> [title] [body] [playStoreUrl]${NC}"
  echo ""
  echo "Example:"
  echo "  ./send-app-update.sh 1.4.2 'Version 1.4.2 Available' 'Fix for login crash' 'https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach'"
  exit 0
fi

echo -e "${YELLOW}Sending app update notification...${NC}"
echo "Min Version: $MIN_VERSION"
echo "Title: $TITLE"
echo "Body: $BODY"
echo "Play Store URL: $PLAY_STORE_URL"
echo ""

# Send the request
RESPONSE=$(curl -s -X POST "$REPLIT_API_URL/api/admin/send-app-update-notification" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{
    \"minVersion\": \"$MIN_VERSION\",
    \"title\": \"$TITLE\",
    \"body\": \"$BODY\",
    \"playStoreUrl\": \"$PLAY_STORE_URL\"
  }")

echo "Response:"
echo "$RESPONSE" | jq '.' || echo "$RESPONSE"

# Check if successful
if echo "$RESPONSE" | grep -q '"success":true'; then
  SENT=$(echo "$RESPONSE" | jq '.sent // 0')
  echo -e "${GREEN}✅ Successfully sent to $SENT users${NC}"
  exit 0
else
  echo -e "${RED}❌ Failed to send notification${NC}"
  exit 1
fi
```

### Step 3: Make Script Executable and Test

```bash
chmod +x server/scripts/send-app-update.sh

# Test the script
./server/scripts/send-app-update.sh 1.4.2 "Critical Bug Fix" "Please update immediately"
```

---

## Part 2: Android App - In-App Update Prompt

### Step 1: Add Google Play Core Library Dependency

Edit `app/build.gradle.kts`:

```gradle
dependencies {
    // Google Play In-App Updates
    implementation("com.google.android.play:core:1.10.3")
    
    // ... rest of dependencies
}
```

### Step 2: Create AppUpdateManager Utility

Create `app/src/main/java/live/airuncoach/airuncoach/util/AppUpdateManager.kt`:

```kotlin
package live.airuncoach.airuncoach.util

import android.app.Activity
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import kotlinx.coroutines.launch

/**
 * Manages in-app updates using Google Play's In-App Update API
 */
class AppUpdateChecker(private val activity: Activity) {
    
    private val appUpdateManager: AppUpdateManager = AppUpdateManagerFactory.create(activity)
    private val TAG = "AppUpdateChecker"
    private var updateAvailable = false
    
    /**
     * Check if an app update is available
     * Optionally start the update flow if updateIfAvailable = true
     */
    fun checkForUpdates(updateIfAvailable: Boolean = false) {
        val appUpdateInfoTask = appUpdateManager.appUpdateInfo
        
        appUpdateInfoTask.addOnSuccessListener { appUpdateInfo ->
            Log.d(TAG, "Update check - Available: ${appUpdateInfo.updateAvailability()}")
            
            // Check if flexible update is available
            if (appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                && appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                
                updateAvailable = true
                Log.d(TAG, "✅ Flexible update available: ${appUpdateInfo.availableVersionCode()}")
                
                if (updateIfAvailable) {
                    startFlexibleUpdate(appUpdateInfo)
                }
            } else {
                Log.d(TAG, "ℹ️ No update available")
            }
        }
        
        appUpdateInfoTask.addOnFailureListener { exception ->
            Log.e(TAG, "❌ Failed to check for updates: ${exception.message}")
        }
    }
    
    /**
     * Start the in-app update flow
     */
    private fun startFlexibleUpdate(appUpdateInfo: AppUpdateInfo) {
        try {
            appUpdateManager.startUpdateFlow(
                appUpdateInfo,
                AppUpdateType.FLEXIBLE,
                activity,
                UPDATE_REQUEST_CODE
            )
            Log.d(TAG, "Update flow started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start update flow: ${e.message}")
        }
    }
    
    /**
     * Set up listener for installation progress (flexible updates only)
     */
    fun setupInstallStateListener(onInstallComplete: () -> Unit = {}) {
        val installStateUpdatedListener = InstallStateUpdatedListener { state ->
            when (state.installStatus()) {
                InstallStatus.PENDING -> {
                    Log.d(TAG, "Update pending...")
                }
                InstallStatus.DOWNLOADING -> {
                    Log.d(TAG, "Downloading update...")
                }
                InstallStatus.DOWNLOADED -> {
                    Log.d(TAG, "✅ Update downloaded - prompting to install")
                    // Show snackbar prompting user to restart app
                    promptUserToCompleteUpdate(onInstallComplete)
                }
                InstallStatus.INSTALLING -> {
                    Log.d(TAG, "Installing update...")
                }
                InstallStatus.INSTALLED -> {
                    Log.d(TAG, "✅ Update installed successfully")
                    onInstallComplete()
                }
                InstallStatus.FAILED -> {
                    Log.e(TAG, "Update failed")
                }
                else -> {
                    Log.d(TAG, "Update state: ${state.installStatus()}")
                }
            }
        }
        appUpdateManager.registerListener(installStateUpdatedListener)
    }
    
    /**
     * Prompt user to complete update (flexible flow)
     */
    private fun promptUserToCompleteUpdate(onInstallComplete: () -> Unit) {
        try {
            appUpdateManager.completeUpdate()
            onInstallComplete()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to complete update: ${e.message}")
        }
    }
    
    companion object {
        const val UPDATE_REQUEST_CODE = 9001
    }
}

/**
 * For use in ViewModels
 */
fun ViewModel.checkForAppUpdates(activity: Activity) {
    viewModelScope.launch {
        val checker = AppUpdateChecker(activity)
        checker.checkForUpdates(updateIfAvailable = true)
        checker.setupInstallStateListener()
    }
}
```

### Step 3: Check for Updates on Login

Add to `LoginViewModel.kt` after successful login:

```kotlin
// After successful login, check for app updates
private suspend fun checkForAppUpdates() {
    try {
        val currentVersionCode = BuildConfig.VERSION_CODE
        val response = apiService.getCurrentAppVersion() // endpoint you'll create
        
        if (response.minimumVersionCode > currentVersionCode) {
            // App update required - show dialog to user
            Log.w("LoginViewModel", "⚠️ App update required: ${response.minimumVersionCode} > $currentVersionCode")
        }
    } catch (e: Exception) {
        Log.d("LoginViewModel", "Could not check app version: ${e.message}")
        // Silently fail - don't block login
    }
}
```

### Step 4: Add Network Model for App Version Info

Create `app/src/main/java/live/airuncoach/airuncoach/network/model/AppVersionResponse.kt`:

```kotlin
package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class AppVersionResponse(
    @SerializedName("currentVersion")
    val currentVersion: String,
    
    @SerializedName("currentVersionCode")
    val currentVersionCode: Int,
    
    @SerializedName("minimumVersionCode")
    val minimumVersionCode: Int,
    
    @SerializedName("updateUrl")
    val updateUrl: String,
    
    @SerializedName("releaseNotes")
    val releaseNotes: String? = null,
    
    @SerializedName("updateRequired")
    val updateRequired: Boolean = false
)
```

### Step 5: Add API Endpoint

Add to `server/routes.ts`:

```typescript
// GET /api/app/version
app.get("/api/app/version", (req, res) => {
  res.json({
    currentVersion: "1.4.2",
    currentVersionCode: 9,
    minimumVersionCode: 9,  // Set this to force updates
    updateUrl: "https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach",
    releaseNotes: "Bug fixes and performance improvements",
    updateRequired: false
  });
});
```

### Step 6: Add to ApiService

Add to `ApiService.kt`:

```kotlin
@GET("/api/app/version")
suspend fun getCurrentAppVersion(): AppVersionResponse
```

---

## Usage

### Send Push Notification from Replit Shell

```bash
# Set admin token first (do this once per session)
export ADMIN_TOKEN="your-secret-admin-token"

# Send basic update notification
./server/scripts/send-app-update.sh 1.4.2

# Send with custom message
./server/scripts/send-app-update.sh 1.4.2 \
  "Critical Update" \
  "Please update to fix a critical bug"

# Send with custom Play Store URL
./server/scripts/send-app-update.sh 1.4.2 \
  "New Features Available" \
  "Update now to get access to new AI coaching features" \
  "https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach"
```

### What Users See

1. **Push Notification** (Firebase Cloud Messaging):
   - Title: "New Version Available"
   - Body: "Please update to get the latest features and bug fixes"
   - User taps → Opens Play Store listing

2. **In-App Prompt** (when launching app):
   - If minimum version is not met, show update dialog
   - User can update directly from Play Store
   - App continues to function with older version (flexible update)

3. **Install Complete**:
   - When user restarts app, new version is active

---

## Admin Token Setup

Generate a secure admin token and add to your `.env` file in Replit:

```
ADMIN_TOKEN="your-very-secret-token-here"
```

Then access it in the shell:

```bash
export ADMIN_TOKEN=$ADMIN_TOKEN
./server/scripts/send-app-update.sh 1.4.2
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unauthorized" error | Check ADMIN_TOKEN is set correctly |
| "No users with FCM tokens" | Ensure users have logged in with notifications enabled |
| Users not receiving notification | Check Firebase is configured correctly |
| Update dialog not showing in app | Ensure minimum version code in API is higher than current |

---

## Security Notes

- Keep ADMIN_TOKEN secret - don't commit to git
- Only admins should have access to send notifications
- Version codes must always increase (1 → 2 → 3...)
- Test with a test user account first before sending to all users

This system allows you to:
✅ Send push notifications about new versions
✅ Prompt users in-app to update
✅ Force critical updates by increasing minimumVersionCode
✅ Provide custom release notes
✅ Track update adoption
