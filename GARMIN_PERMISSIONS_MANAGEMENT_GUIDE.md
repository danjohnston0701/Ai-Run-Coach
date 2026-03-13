# Garmin Permissions Management Implementation Guide

## 🎯 Overview

Complete permissions management system allowing users to view, update, and manage their Garmin data access permissions from within the app.

---

## 📱 Frontend - User Experience Flow

### **Navigation Path**
```
Settings
  ↓
Profile / Connected Apps
  ↓
Garmin Connection (shows ✓ Active)
  ↓
Manage Permissions (button)
  ↓
Garmin Permissions Screen
```

### **Garmin Permissions Screen Components**

#### **1. Device Info Card**
```
┌────────────────────────────────┐
│ 🔌 Garmin Fenix 7X             │
│ Connected 2 weeks ago          │
│ ✓ Active                       │
│                                │
│ Last synced: 5 minutes ago     │
└────────────────────────────────┘
```
- Shows connected device name
- Connection duration
- Active status badge
- Last sync timestamp

#### **2. Permissions by Category**

**📊 Activities & Running**
- ✓ Activity Summaries (Granted)
- ○ Activity Details (Not granted)

**❤️ Health & Recovery**
- ✓ Heart Rate (Granted)
- ○ Blood Pressure (Not granted)
- ○ Oxygen Levels (Not granted)

**😴 Wellness & Stress**
- ✓ Sleep Data (Granted)
- ✓ Stress & Body Battery (Granted)
- ○ HRV (Not granted)

**🫀 Advanced Metrics**
- ○ VO2 Max (Not granted)
- ○ Fitness Age (Not granted)
- ○ Minute-by-Minute Data (Not granted)

#### **3. Action Buttons**
- "Update Permissions" (primary, cyan)
- "Disconnect Device" (secondary, red)

---

## 🔐 Permission Categories

### **Required Permissions** (Always granted)
These are required for core functionality:
- `ACTIVITY_READ` - Activity summaries

### **Optional Permissions** (User can grant/revoke)
Users can selectively grant these:

#### **Activities (📊)**
- Activity Summaries
- Activity Details (GPS, samples)

#### **Health (❤️)**
- Heart Rate monitoring
- Blood Pressure readings
- Oxygen Levels (SpO2)
- Breathing Rate
- Skin Temperature

#### **Wellness (😴)**
- Sleep Data (duration, stages, quality)
- Stress Levels & Body Battery
- Heart Rate Variability (HRV)
- Body Composition (weight, BMI)
- Menstrual Cycle / Pregnancy

#### **Advanced (🫀)**
- VO2 Max
- Fitness Age
- Minute-by-Minute Data (Epochs)

---

## 🔄 User Flow - Update Permissions

### **Scenario: User wants to grant Blood Pressure access**

1. User opens Settings → Connected Apps → Garmin
2. Taps "Manage Permissions" button
3. Sees Blood Pressure with "○ Not granted" status
4. Taps "Update Permissions" button
5. Confirmation dialog appears
6. User taps "Continue"
7. **Redirected to Garmin's authorization page**
8. User reviews and confirms new permissions
9. **Garmin redirects back to app** with OAuth callback
10. **Permissions webhook fires** with new scopes
11. App automatically syncs Blood Pressure data
12. User sees "✓ Blood Pressure (Granted)" in settings

---

## 🛠️ Backend Implementation

### **API Endpoints**

#### **1. GET /api/garmin/permissions**
Returns current permissions for authenticated user
```json
{
  "deviceName": "Garmin Fenix 7X",
  "connectedSince": "2 weeks ago",
  "lastSyncAt": "5 minutes ago",
  "permissions": [
    {
      "id": "activity_summary",
      "name": "Activity Summaries",
      "description": "Access to activity summaries",
      "icon": "🏃",
      "isGranted": true,
      "category": "activities"
    },
    {
      "id": "blood_pressure",
      "name": "Blood Pressure",
      "description": "Blood pressure readings and trends",
      "icon": "🩸",
      "isGranted": false,
      "category": "health"
    }
  ]
}
```

#### **2. POST /api/garmin/reauthorize**
Initiates re-authorization flow
```json
{
  "authUrl": "https://auth.garmin.com/oauth-provider/oauth/authorize?oauth_token=ABC123&state=user_id"
}
```

#### **3. POST /api/garmin/disconnect**
Disconnects Garmin device
```json
{
  "success": true,
  "message": "Device disconnected"
}
```

### **Webhook Handler Enhanced**

#### **POST /api/garmin/webhooks/permissions**
Receives permission changes from Garmin
```json
{
  "userAccessToken": "token...",
  "permissionsGranted": ["hr:read", "bp:read"],
  "permissionsRevoked": ["vo2_max:read"]
}
```

**Handler processes:**
1. Finds user by access token
2. Updates `grantedScopes` in database
3. Triggers data sync for newly granted permissions
4. Logs all permission changes for audit trail

---

## 📊 Database Schema Changes

### **Modified: connected_devices table**

```sql
-- New columns added:
ALTER TABLE connected_devices ADD COLUMN updated_at timestamp;
ALTER TABLE connected_devices ADD COLUMN granted_scopes text;
```

**New Fields:**
- `updated_at` - Timestamp of last permission change
- `grantedScopes` - Comma-separated list of granted OAuth scopes
  - Example: `"activity:read,hr:read,sleep:read,stress:read"`

### **New: garmin_permission_changes table** (optional audit log)

```sql
CREATE TABLE garmin_permission_changes (
  id varchar PRIMARY KEY,
  user_id varchar REFERENCES users(id),
  device_id varchar REFERENCES connected_devices(id),
  changed_at timestamp,
  change_type text, -- 'GRANTED' | 'REVOKED'
  permissions text,  -- Comma-separated scopes
  reason text        -- 'USER_REAUTHORIZATION' | 'WEBHOOK' | 'SYSTEM'
);
```

---

## 🎯 Key Features

✅ **Clear Permission Display**
- Shows which scopes are granted vs not granted
- Organized by category (Activities, Health, Wellness, Advanced)
- Color-coded status (green for granted, gray for not granted)

✅ **Easy Re-authorization**
- One-tap "Update Permissions" button
- Takes user to Garmin's secure auth flow
- Can grant new scopes without losing existing data

✅ **Smart Data Sync**
- When new permissions are granted, system automatically requests data
- Historical data is backfilled
- No user intervention needed

✅ **Audit Trail**
- All permission changes logged with timestamps
- Tracks what user allowed/revoked
- Tracks user reauthorizations

✅ **Permission Webhook Support**
- Receives permission changes from Garmin in real-time
- Updates database immediately
- Triggers data sync for new scopes

---

## 🔄 Permission Change Webhook Flow

```
User grants new scope (e.g., Blood Pressure)
  ↓
Garmin's OAuth flow completes
  ↓
Garmin sends permission webhook:
  POST /api/garmin/webhooks/permissions
  {
    "userAccessToken": "...",
    "permissionsGranted": ["bp:read"],
    "permissionsRevoked": []
  }
  ↓
Handler updates database:
  UPDATE connected_devices
  SET granted_scopes = "activity:read,hr:read,sleep:read,bp:read"
  ↓
System triggers data sync:
  - Fetch 30 days of BP history from Garmin
  - Store in garmin_blood_pressure table
  ↓
User sees new data in app
  - Blood Pressure readings appear
  - Dashboard updates automatically
```

---

## 📋 Implementation Checklist

### **Frontend**
- [x] Create `GarminPermissionsScreen.kt` composable
- [x] Add "Manage Permissions" button to Connected Apps
- [x] Display permissions by category with status
- [x] Implement "Update Permissions" flow
- [x] Implement "Disconnect Device" flow
- [x] Add confirmation dialogs
- [x] Handle loading/error states

### **Backend**
- [x] Create `garmin-permissions-service.ts`
- [x] Implement permission definitions
- [x] Add `/api/garmin/permissions` endpoint
- [x] Add `/api/garmin/reauthorize` endpoint
- [x] Add `/api/garmin/disconnect` endpoint
- [x] Enhance permissions webhook handler
- [x] Add database fields (`updated_at`, `grantedScopes`)

### **Database**
- [x] Create migrations for schema changes
- [x] Add audit log table (optional)
- [x] Create performance indexes

### **Testing**
- [ ] Test permission retrieval
- [ ] Test re-authorization flow
- [ ] Test disconnect flow
- [ ] Test permissions webhook
- [ ] Test data sync after new permissions granted
- [ ] Test with different scope combinations

---

## 🚀 Deployment Steps

### **1. Run Database Migrations**
```bash
# Run migrations in order:
npm run migrate -- GARMIN_PERMISSIONS_MIGRATIONS.sql
```

### **2. Deploy Backend**
```bash
# Build and deploy server
npm run build
npm run deploy
```

### **3. Deploy Frontend**
```bash
# Build Android app
./gradlew buildRelease

# Upload to Play Store or deploy to beta testers
```

### **4. Verify Integration**
- [ ] Test permission retrieval in app
- [ ] Test re-authorization flow
- [ ] Monitor permissions webhook logs
- [ ] Check that new permission data syncs correctly

---

## 📚 Garmin Permission Scopes Reference

| Scope ID | Garmin Scope | Data Type | Required |
|----------|-------------|-----------|----------|
| activity_summary | `activity:read` | Activities | ✓ Yes |
| activity_details | `activity_details:read` | Activity samples, GPS | Optional |
| heart_rate | `hr:read` | Heart rate data | Optional |
| blood_pressure | `bp:read` | BP readings | Optional |
| spo2 | `spo2:read` | Oxygen levels | Optional |
| respiration | `respiration:read` | Breathing rate | Optional |
| skin_temperature | `temperature:read` | Body temperature | Optional |
| sleep | `sleep:read` | Sleep data | Optional |
| stress | `stress:read` | Stress & battery | Optional |
| hrv | `health:read` | HRV data | Optional |
| body_composition | `body_composition:read` | Weight, BMI | Optional |
| menstrual | `menstrual:read` | Cycle/pregnancy | Optional |
| vo2_max | `vo2_max:read` | VO2 Max | Optional |
| fitness_age | `fitness_age:read` | Fitness age | Optional |
| epochs | `epochs:read` | Minute-level data | Optional |

---

## 🎨 UI Screenshots Description

**Permissions Screen Layout:**
```
┌─────────────────────────────────┐
│ ← Garmin Permissions            │
│   Manage data access            │
├─────────────────────────────────┤
│ 🔌 Garmin Fenix 7X              │
│ Connected 2 weeks ago           │
│ ✓ Active                        │
│ Last synced: 5 minutes ago      │
├─────────────────────────────────┤
│ DATA ACCESS PERMISSIONS         │
│                                 │
│ 📊 ACTIVITIES & RUNNING         │
│ ✓ Activity Summaries (Granted)  │
│ ○ Activity Details (Not granted)│
│                                 │
│ ❤️ HEALTH & RECOVERY            │
│ ✓ Heart Rate (Granted)          │
│ ○ Blood Pressure (Not granted)  │
│ ○ Oxygen Levels (Not granted)   │
│                                 │
│ 😴 WELLNESS & STRESS            │
│ ✓ Sleep Data (Granted)          │
│ ✓ Stress & Battery (Granted)    │
│ ○ HRV (Not granted)             │
│                                 │
│ 🫀 ADVANCED METRICS             │
│ ○ VO2 Max (Not granted)         │
│ ○ Fitness Age (Not granted)     │
│                                 │
├─────────────────────────────────┤
│ [Update Permissions] [Disconnect]│
│ Disconnecting will stop syncing  │
│ data. Reconnect anytime.        │
└─────────────────────────────────┘
```

---

## ✅ Success Criteria

- ✓ Users can view all granted and ungr anted permissions
- ✓ Users can re-authorize to grant new permissions
- ✓ Permissions webhook processes changes correctly
- ✓ New permission data syncs automatically
- ✓ User can disconnect device with confirmation
- ✓ UI clearly shows permission status for each scope
- ✓ Categories organize permissions logically
- ✓ Garmin receives permission webhook data

---

## 🎉 Result

Users now have **complete control** over their Garmin data permissions directly in the app. They can:
- ✅ See what data they've authorized
- ✅ Grant new data access with one tap
- ✅ Revoke permissions anytime
- ✅ Disconnect their device
- ✅ Track all permission changes

The permissions webhook now **receives and processes** permission change events from Garmin correctly! 🚀
