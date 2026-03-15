# Garmin Integration - Quick Reference for iOS Team

**Status**: ✅ Android Implementation Complete | 📱 iOS Implementation Pending

---

## What's New in Garmin Integration

### Core Features
1. **OAuth 2.0 Authentication** - Secure device connection with server-side state validation
2. **Webhook Processing** - Real-time activity sync (activities, epochs, dailies)
3. **Automatic Run Enrichment** - Garmin data (HR, cadence, elevation) merged into runs
4. **Manual Enrichment Button** - Users can manually update runs with Garmin data
5. **Training Plan Reassessment** - AI Coach automatically adjusts plans based on performance
6. **Push Notifications** - Users alerted when activities sync or runs are enriched
7. **Webhook Monitoring** - Dashboard showing sync status and match rates

---

## Key Endpoints for iOS

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/garmin` | POST | Get OAuth authorization URL |
| `/api/auth/garmin/callback` | GET | Handle OAuth callback |
| `/api/garmin/devices` | GET | List connected Garmin devices |
| `/api/garmin/devices/:id` | DELETE | Disconnect device |
| `/api/garmin/activities` | GET | Get recent Garmin activities |
| `/api/runs/:runId/enrich-with-garmin-data` | POST | Enrich run with Garmin data |
| `/api/garmin/webhook-stats` | GET | Get webhook processing statistics |

---

## Android Implementation Reference

### Key Files
- **UI**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/GarminPermissionsScreen.kt`
- **ViewModel**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/GarminPermissionsViewModel.kt`
- **API**: `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt`
- **Model**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSession.kt` (has `hasGarminData` field)

### RunSession Model Changes
```kotlin
// Added fields:
val hasGarminData: Boolean = false
val garminActivityId: String? = null
val uploadedToGarmin: Boolean? = null
val averageHeartRate: Int? = null
val maxHeartRate: Int? = null
// ... plus many other optional extended metrics
```

### Key UI Components
1. **GarminPermissionsScreen** - Device connection & management
2. **RunSummaryScreen** - Enhanced with "Update Run With Garmin Data" button
3. **TrainingPlanScreen** - Shows when plans are adjusted based on Garmin data
4. **Notifications** - Push alerts for activity sync and enrichment

---

## iOS Implementation Checklist

### Phase 1: OAuth Integration
- [ ] Add Universal Links configuration to Info.plist
- [ ] Implement Garmin OAuth flow handler
- [ ] Test OAuth callback with deep links
- [ ] Secure token storage (Keychain)

### Phase 2: UI Screens
- [ ] Build GarminPermissionsView
- [ ] Add device list/disconnect functionality
- [ ] Implement permission update instructions
- [ ] Add "Connect Garmin" button

### Phase 3: Run Enrichment
- [ ] Add enrichment button to RunSummaryView
- [ ] Implement enrichment API call
- [ ] Show loading state during enrichment
- [ ] Update UI with new Garmin data (HR, cadence, elevation)

### Phase 4: Notifications
- [ ] Configure push notification categories
- [ ] Handle "new_activity" notifications
- [ ] Handle "run_enriched" notifications
- [ ] Deep link to relevant screens

### Phase 5: Testing & Polish
- [ ] End-to-end testing with real device
- [ ] Performance testing with high webhook volume
- [ ] Error handling and edge cases
- [ ] UI/UX refinement

---

## Data Flow Diagrams

### Activity Sync Flow
```
Garmin Watch
    ↓
[User completes run]
    ↓
Garmin Cloud
    ↓
[Webhook → AI Run Coach]
    ↓
Fuzzy Match to Existing Run
    ├─ Match score > 50% → MERGE to existing run
    └─ Match score < 50% → CREATE new run
    ↓
[Trigger async processing]
    ├─ Reassess training plans
    ├─ Send push notification
    └─ Log to audit trail
    ↓
Push Notification to iOS App
    ↓
[User taps notification]
    ↓
Navigate to Run Summary
```

### Manual Enrichment Flow
```
RunSummaryScreen
    ↓
[User taps "Update Run With Garmin Data"]
    ↓
POST /api/runs/:runId/enrich-with-garmin-data
    ↓
[Backend searches Garmin activities ±10 min]
    ↓
[Finds match, pulls full activity details]
    ↓
[Updates run record with HR, cadence, elevation, etc.]
    ↓
[Updates database, sets hasGarminData=true]
    ↓
[ViewModel receives updated run]
    ↓
[UI re-renders with new data]
```

---

## Push Notification Examples

### Activity Arrived
```
Title: 🏃 Activity Synced!
Body: Your 5.2km run was imported from Garmin
Action: View Run → RunSummaryScreen(runId)
```

### Run Enriched
```
Title: ✨ Enhanced with Data
Body: Your run now includes Garmin heart rate and cadence
Action: View Details → RunSummaryScreen(runId)
```

### Plan Updated
```
Title: 📋 Training Plan Adjusted
Body: Your plan was updated based on today's strong performance
Action: View Plan → TrainingPlanScreen()
```

---

## Testing Scenarios

### Test 1: Device Connection
1. Tap "Connect Garmin"
2. Complete OAuth flow
3. Verify device appears in settings
4. Verify last sync time displays

### Test 2: Activity Sync
1. Complete run on real Garmin watch
2. Wait 2-5 minutes for sync
3. Verify push notification received
4. Tap notification and verify run appears

### Test 3: Data Enrichment
1. Create run WITHOUT Garmin watch
2. View run summary (no HR data)
3. Later, connect Garmin watch and sync
4. Go back to run and tap "Update with Garmin Data"
5. Verify HR, cadence, elevation now showing

### Test 4: Webhook Monitoring
1. Go to Garmin Status screen (if available)
2. Verify webhook stats display
3. Verify recent syncs show correct match scores

---

## Performance Targets

| Metric | Target |
|--------|--------|
| OAuth callback → app response | < 10 seconds |
| Push notification delivery | < 30 seconds |
| Enrichment API response | < 3 seconds |
| UI update after enrichment | < 500ms |
| Webhook match accuracy | > 90% |

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| OAuth fails silently | Deep link not configured | Verify Universal Links in Info.plist |
| "Update Garmin Data" button not showing | Garmin not connected OR run already has data | Check `isGarminConnected` and `run.hasGarminData` flags |
| Activity not syncing | Watch didn't sync to Garmin Cloud | Wait 5-10 minutes, manual sync on watch |
| No push notifications | User denied permission | Prompt user to enable in Settings |
| Enrichment takes > 5s | API timeout or server lag | Show timeout message and allow retry |

---

## Database Considerations

### New Tables Created
- `oauth_state_store` - OAuth state security
- `notifications` - Push/in-app notifications
- `garmin_webhook_events` - Webhook audit trail

### Modified Tables
- `runs` - Added `hasGarminData`, `garminActivityId` columns
- `garmin_epochs_aggregate` - Added motion intensity columns (requires migration)

### Indexes Added
- Run ID lookups for enrichment
- User ID lookups for notifications
- Timestamp lookups for sorting

---

## Security Features

✅ **Server-side OAuth state** - Prevents state tampering  
✅ **10-minute state expiration** - Prevents replay attacks  
✅ **Encrypted token storage** - Tokens encrypted in DB  
✅ **Token auto-refresh** - Handles expiring Garmin tokens  
✅ **User validation** - Only users can see their own data  

---

## Related Documentation

- **Full Details**: See `GARMIN_INTEGRATION_SUMMARY.md`
- **Webhook Errors**: See `GARMIN_WEBHOOK_FIXES.md`
- **DB Migrations**: See `FIX_GARMIN_EPOCHS_COLUMNS.sql`
- **Android Reference**: See Android app source code

---

## iOS Development Resources

### Swift Packages to Consider
- **Alamofire** - HTTP networking
- **Combine** - Reactive programming
- **KeychainAccess** - Secure token storage
- **WebKit** - OAuth flow in WKWebView

### Key Swift Patterns
```swift
// OAuth callback handling
func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
       let url = userActivity.webpageURL {
        handleGarminCallback(url: url)
    }
}

// Enrichment button with loading state
Button(action: { enrichRun() }) {
    if isEnriching {
        ProgressView()
    } else {
        Label("Update with Garmin Data", systemImage: "arrow.clockwise")
    }
}.disabled(isEnriching)

// Push notification handling
func userNotificationCenter(_ center: UNUserNotificationCenter,
                          didReceive response: UNNotificationResponse,
                          withCompletionHandler handler: @escaping () -> Void) {
    let userInfo = response.notification.request.content.userInfo
    if let runId = userInfo["runId"] as? String {
        appCoordinator.navigateToRunSummary(runId: runId)
    }
    handler()
}
```

---

## Timeline Recommendation

- **Week 1**: OAuth setup and testing
- **Week 2**: UI screens and notifications
- **Week 3**: Enrichment feature and integration testing
- **Week 4**: Final testing with real devices and beta release

---

## Questions for iOS Team

1. **Where should we store tokens?** Recommendation: Keychain with SecureEncodable
2. **How to handle OAuth deep links?** Recommendation: Universal Links with scene delegation
3. **Should enrichment button always be visible?** Recommendation: Only when relevant (garmin connected AND no data)
4. **What about offline support?** Recommendation: Queue enrichment requests, sync when online
5. **How to handle rate limiting?** Recommendation: Show retry button, exponential backoff

---

## Contact & Support

- **Backend Team**: For API questions and Garmin integration specifics
- **Android Team**: For UI/UX reference implementation
- **Garmin Developer Docs**: https://developer.garmin.com

---

**Document Version**: 1.0  
**Last Updated**: March 15, 2026  
**Status**: Ready for iOS Implementation ✅
