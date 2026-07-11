# AI Run Coach v1.6.0 - Release Bundle

**Build Date:** July 11, 2026  
**Version:** 1.6.0  
**Version Code:** 17  
**Bundle File:** `app/build/outputs/bundle/release/app-release.aab`  
**Bundle Size:** 19 MB

## What's New

### Account Management Features
- ✅ **Change Password** - Users can securely change their password with current/new/confirm validation
- ✅ **Privacy Policy & Terms of Use** - Direct browser navigation to website
- ✅ **Get Support** - In-app support request form with email composition to support@airuncoach.live
- ✅ **Delete Account** - Complete account deletion with confirmation dialog
  - Permanently deletes all user data from the database
  - Sends notification email to support@airuncoach.live with user details
  - User cannot log back in with deleted email address
  - All related records (runs, plans, connections, achievements) are cascaded deleted

### Backend Updates
- **New Endpoint:** `POST /api/auth/change-password` - Change password with current password verification
- **Updated:** `DELETE /api/users/:id` - Now sends account deletion notification email
- **New Service:** `sendAccountDeletionNotification()` in email-service

## Technical Details

### Files Modified
- `app/build.gradle.kts` - Version bump (16 → 17, 1.5.3 → 1.6.0)
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/SubscriptionScreen.kt` - Navigation wiring
- `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt` - Added password change endpoint
- `server/routes.ts` - Implemented password change and deletion email logic
- `server/email-service.ts` - Added account deletion notification function

### New Files
```
app/src/main/java/live/airuncoach/airuncoach/ui/screens/ChangePasswordScreen.kt
app/src/main/java/live/airuncoach/airuncoach/ui/screens/GetSupportScreen.kt
app/src/main/java/live/airuncoach/airuncoach/ui/screens/DeleteAccountScreen.kt
app/src/main/java/live/airuncoach/airuncoach/viewmodel/ChangePasswordViewModel.kt
app/src/main/java/live/airuncoach/airuncoach/viewmodel/DeleteAccountViewModel.kt
app/src/main/java/live/airuncoach/airuncoach/network/model/ChangePasswordRequest.kt
```

### Data Storage Changes
- `SessionManager.kt` - Added `clearSession()` method for comprehensive logout on account deletion

## Build Information

**Build Type:** Release  
**Signing Config:** Production Keystore  
**Minification:** Enabled (R8)  
**Resource Shrinking:** Enabled  
**Build Configuration:** Production (BASE_URL: https://airuncoach.live)

## Testing Checklist

- [ ] Change password works and validates input correctly
- [ ] Privacy Policy opens in browser
- [ ] Terms of Use opens in browser
- [ ] Support form sends email to support@airuncoach.live with device info
- [ ] Delete account confirmation dialog works
- [ ] Account deletion removes user from database
- [ ] Deleted user cannot log back in
- [ ] Support team receives deletion notification email with user ID and email
- [ ] All user related data is deleted (runs, plans, achievements, etc.)

## Deployment Instructions

### Upload to Google Play Console

1. **Go to Google Play Console:**
   - Navigate to: https://play.google.com/console/u/0/developers

2. **Select AI Run Coach App:**
   - Click on "AI Run Coach" app

3. **Go to Release Management → Releases:**
   - Click "Release" or "Create Release"

4. **Upload AAB Bundle:**
   - Drag and drop `app/build/outputs/bundle/release/app-release.aab`
   - Or click "Browse Files" and select the bundle

5. **Fill Release Details:**
   - **Release Name:** Version 1.6.0 - Account Management Features
   - **Release Notes:**
     ```
     New Features:
     • Change Password - Securely update your account password
     • Privacy Policy & Terms of Use - Easy access to legal documents
     • Get Support - Submit support requests directly from the app
     • Delete Account - Permanently delete your account and all data
     
     Bug Fixes:
     • Fixed account management screen navigation
     • Improved session management on logout
     ```

6. **Set Rollout:**
   - Recommended: Start with 5% rollout
   - Monitor for issues
   - Increase to 100% after 24-48 hours

7. **Review & Confirm:**
   - Review all changes
   - Click "Review Release"
   - Click "Start Rollout to Production"

## Rollback Plan

If critical issues are discovered:
1. Go to Google Play Console
2. Select AI Run Coach
3. Go to Release Management → Releases
4. Click the current release
5. Select "Stop rollout"
6. Publish v1.5.3 again (previously approved version)

## Post-Deployment Monitoring

- Monitor crash rates in Google Play Console
- Check support channel for user feedback
- Verify backend logs for password change and deletion requests
- Confirm deletion notification emails are being received

## Commit Hash

This bundle was built from commit: `ac7407a` (Account management features implementation)

---

**Built with:** Android Studio 2024 | Gradle 9.1.0 | Kotlin 2.0.0 | Compose 2024.06.00
