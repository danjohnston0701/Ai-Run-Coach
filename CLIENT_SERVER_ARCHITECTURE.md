# AI Run Coach - Client-Server Architecture Documentation

**Created:** January 26, 2026  
**Purpose:** Clarify data storage responsibilities between Android client and backend server

---

## 🏗️ Architecture Overview

### **Principle: Server is Source of Truth**

All user data is **primarily stored in the Neon PostgreSQL database** on the backend server. The Android app uses **local caching** for performance and offline access, but the server is always the authoritative source.

---

## ✅ Proper Implementation Pattern (Currently Used)

### **How Data Flows:**

```
User Action → Android App → API Call → Backend Server → Neon Database
                    ↓
            Update Local Cache (SharedPreferences)
                    ↓
            Display Updated Data
```

### **Example: Updating Coach Settings**

1. **User edits coach name** in `CoachSettingsScreen`
2. **ViewModel calls** `apiService.updateCoachSettings(userId, request)`
3. **Backend receives request**, validates, updates Neon database
4. **Backend returns** updated User object with new coach settings
5. **Android saves** updated User to SharedPreferences (local cache)
6. **UI updates** to show new data

**✓ This is CORRECT** - Server stores the data, client caches it.

---

## 🗄️ Data Storage Breakdown

### **Server-Side Storage (Neon PostgreSQL)**

**Primary source of truth for ALL user data:**

#### User Profile Data
- ✅ Basic info: `name`, `email`, `dob`, `gender`, `weight`, `height`
- ✅ Preferences: `fitnessLevel`, `distanceScale`
- ✅ Coach settings: `coachName`, `coachGender`, `coachAccent`, `coachTone`
- ✅ Subscription: `subscriptionTier`, `subscriptionStatus`
- ✅ Profile picture URL: `profilePic` (URL to cloud storage)

#### Social Data
- ✅ **Friendships Table**: User relationships, friend requests
- ✅ **Friends List**: Retrieved via `GET /api/friends/{userId}`

#### Group Runs
- ✅ **Group Runs Table**: All group run data
- ✅ **Group Run List**: Retrieved via `GET /api/group-runs`

#### Goals
- ✅ **Goals Table**: All user goals and progress
- ✅ **Goals List**: Retrieved via `GET /api/goals/{userId}`

#### Profile Pictures
- ✅ **Cloud Storage** (S3/Cloudinary): Actual image files
- ✅ **Database**: Stores public URL to the image
- ✅ **Upload**: `POST /api/users/{id}/profile-picture`

---

### **Client-Side Storage (SharedPreferences)**

**Local cache ONLY - not primary storage:**

#### Cached User Object
```json
{
  "id": "user_id",
  "name": "User Name",
  "email": "user@example.com",
  "profilePic": "https://storage.example.com/profile.jpg",
  "coachName": "Coach Carter",
  "fitnessLevel": "Intermediate",
  ...
}
```

**Purpose:**
- Quick access without network calls
- Offline viewing of profile data
- Display user info while app loads
- Reduce server load

**Updates When:**
- User logs in
- Any profile data changes
- Settings are modified
- Profile picture uploaded

---

## 📱 Implementation by Feature

### ✅ Profile Settings (PRODUCTION READY)

**Files:** `PersonalDetailsViewModel.kt`, `FitnessLevelViewModel.kt`, `DistanceScaleViewModel.kt`

**Flow:**
1. Load cached data from SharedPreferences (quick display)
2. User edits data in UI
3. Call `PUT /api/users/{id}` with updated fields
4. Backend updates Neon database
5. Backend returns updated User object
6. Save to SharedPreferences (update cache)
7. UI reflects changes

**Backend Endpoint:**
```kotlin
PUT /api/users/{id}
Content-Type: application/json

{
  "name": "New Name",
  "weight": 75.5,
  "height": 180.0,
  "fitnessLevel": "Advanced",
  "distanceScale": "Kilometers"
}

Response: User object with all fields
```

---

### ✅ Coach Settings (PRODUCTION READY)

**File:** `CoachSettingsViewModel.kt`

**Flow:**
1. Load cached coach settings from SharedPreferences
2. User edits coach name, voice, accent, tone
3. Call `PUT /api/users/{id}/coach-settings`
4. Backend updates `coach_name`, `coach_gender`, `coach_accent`, `coach_tone` columns
5. Backend returns updated User object
6. Save to SharedPreferences
7. UI updates

**Backend Endpoint:**
```kotlin
PUT /api/users/{id}/coach-settings
Content-Type: application/json

{
  "coachName": "Coach Sarah",
  "coachGender": "female",
  "coachAccent": "Australian",
  "coachTone": "Motivational"
}

Response: User object
```

---

### ✅ Profile Picture Upload (PRODUCTION READY)

**File:** `ProfileViewModel.kt`

**Flow:**
1. User selects image from device
2. Android converts to byte array
3. Upload as multipart form data to `POST /api/users/{id}/profile-picture`
4. **Backend saves image to cloud storage** (S3/Cloudinary/etc.)
5. **Backend saves public URL** to `users.profile_pic` column in Neon
6. Backend returns updated User object with `profilePic` URL
7. Android saves User to SharedPreferences
8. `ProfileScreen` displays image using Coil library from URL

**Backend Requirements:**
```kotlin
POST /api/users/{id}/profile-picture
Content-Type: multipart/form-data

Part: profilePic (image file)

Backend must:
1. Receive multipart file
2. Upload to cloud storage (S3, Cloudinary, etc.)
3. Get public URL
4. Save URL to users.profile_pic in Neon database
5. Return updated User object

Response: {
  "id": "user_id",
  "profilePic": "https://storage.example.com/users/user_id/profile.jpg",
  ...
}
```

**Image Display:**
- Uses Coil library `AsyncImage` composable
- Loads from `user.profilePic` URL
- Shows placeholder if no image
- Automatically caches images locally for performance

---

### ✅ Friends Feature (NOW PRODUCTION READY)

**File:** `FriendsViewModel.kt`

**Flow:**
1. Call `GET /api/friends/{userId}` on screen load
2. Backend queries `friendships` table with JOIN to `users`
3. Returns list of Friend objects
4. Display in UI
5. **NEW:** Search users via `GET /api/users/search?query={name}`
6. Add friend via `POST /api/friends/{userId}/add`

**Backend Endpoints:**
```kotlin
// Get friends list
GET /api/friends/{userId}
Response: [
  {
    "id": "friend_id",
    "name": "Friend Name",
    "email": "friend@example.com",
    "profilePic": "url"
  }
]

// Search for users
GET /api/users/search?query=John
Response: [
  {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "profilePic": "url"
  }
]

// Add friend
POST /api/friends/{userId}/add
Body: { "friendId": "friend_user_id" }
Response: Friend object
```

**Data Storage:**
- ❌ NOT stored in SharedPreferences
- ✅ Always fetched from server
- Ensures real-time friend updates
- Uses server-side `friendships` table

---

### ✅ Group Runs Feature (NOW PRODUCTION READY)

**File:** `GroupRunsViewModel.kt`

**Flow:**
1. Call `GET /api/group-runs` on screen load
2. Backend queries `group_runs` table
3. Returns list of GroupRun objects
4. Display in UI with real-time data
5. Create new run via `POST /api/group-runs`

**Backend Endpoints:**
```kotlin
// Get all group runs
GET /api/group-runs
Response: [
  {
    "id": 1,
    "name": "Morning 5K",
    "description": "Easy pace morning run",
    "meetingPoint": "Central Park",
    "distance": 5.0,
    "dateTime": "2026-01-27T08:00:00Z",
    "maxParticipants": 10,
    "creatorId": "user_id"
  }
]

// Create group run
POST /api/group-runs
Body: {
  "name": "Evening Run",
  "meetingPoint": "City Square",
  "description": "Fast paced run",
  "distance": 10.0,
  "maxParticipants": 15,
  "dateTime": "2026-01-28T18:00:00Z"
}
Response: GroupRun object
```

**Data Storage:**
- ❌ NOT stored in SharedPreferences
- ✅ Always fetched from server
- Ensures real-time participant updates
- Uses server-side `group_runs` table

---

### ✅ Goals Feature (PRODUCTION READY)

**File:** `GoalsViewModel.kt`

**Flow:**
1. Call `GET /api/goals/{userId}` on screen load
2. Backend queries `goals` table filtered by user
3. Returns list of Goal objects
4. Display in UI with tabs (Active, Completed, Abandoned)
5. Create/update goals via backend endpoints

**Backend Endpoints:**
```kotlin
GET /api/goals/{userId}
POST /api/goals
PUT /api/goals/{goalId}
DELETE /api/goals/{goalId}
```

**Data Storage:**
- ❌ NOT stored in SharedPreferences
- ✅ Always fetched from server
- Ensures progress tracking accuracy
- Uses server-side `goals` table

---

## 📝 Expected Placeholder Data (Not Issues)

### Connected Devices
**File:** `ConnectedDevicesViewModel.kt`

**Status:** Hardcoded device list is INTENTIONAL
- Device integration requires SDKs (Samsung Health, Garmin, COROS, Strava)
- Each has separate OAuth/API integration
- Not stored in database until connected
- Future feature to track connected devices in database

### Subscription Plans
**File:** `SubscriptionViewModel.kt`

**Status:** Hardcoded plans are STANDARD PRACTICE
- Subscription tiers (Free, Lite, Premium, Premium+) are app-defined
- Prices shown in UI, not stored in database
- User's subscription tier IS stored in database (`users.subscription_tier`)
- Actual subscription management uses payment provider (Stripe, etc.)

---

## 🔐 Authentication Flow

### Login Process
1. User enters email/password in `LoginScreen`
2. Call `POST /api/auth/login`
3. Backend validates credentials against Neon database
4. Backend returns `{ token, user }` object
5. Android saves token to **encrypted SharedPreferences** via `SessionManager`
6. Android saves user object to **standard SharedPreferences**
7. All subsequent API calls include auth token in headers

### Token Storage
- ✅ Stored in **EncryptedSharedPreferences** (Android secure storage)
- ✅ Included in all API requests via Retrofit interceptor
- ✅ Cleared on logout

### User Data Refresh
- On app launch: Load from cache, display immediately
- Then refresh from server in background
- On login: Fetch fresh data from server
- On profile update: Server returns latest data

---

## 🚫 Common Misconceptions

### ❌ "SharedPreferences stores user data permanently"
**Reality:** SharedPreferences is a **cache**. If user logs out, cache is cleared. All data remains safe in Neon database.

### ❌ "Need to build backend endpoints to save to SharedPreferences"
**Reality:** SharedPreferences is client-side only. Backend doesn't know about it. Backend saves to Neon database, Android saves the response to SharedPreferences.

### ❌ "Profile picture uploaded to Android device storage"
**Reality:** Image uploaded to **cloud storage** (S3/Cloudinary). Only the **URL** is saved to device. Image is always loaded from cloud URL.

---

## ✅ Current Status Summary

### **Production Ready (Backend Integrated)**
- ✅ User Profile (Personal Details, Fitness Level, Distance Scale)
- ✅ Coach Settings
- ✅ Profile Picture Upload
- ✅ Goals Management
- ✅ Friends (with search)
- ✅ Group Runs
- ✅ Authentication

### **Using Placeholder Data (Intentional)**
- 📝 Connected Devices (awaiting SDK integration)
- 📝 Subscription Plans (hardcoded pricing is standard)

---

## 🎯 Key Takeaways

1. **Server = Source of Truth**: All user data stored in Neon PostgreSQL
2. **Client = Cache**: SharedPreferences for quick access and offline viewing
3. **API-First**: Every data change goes through backend API
4. **Image Storage**: Cloud storage (S3/Cloudinary) + URL in database
5. **Real-time Features**: Friends and Group Runs always fetch from server
6. **Profile Data**: Cached locally, synced to server on changes

---

**This architecture ensures:**
- ✅ Data consistency across devices
- ✅ Secure cloud backup
- ✅ Fast app performance
- ✅ Offline viewing capability
- ✅ Real-time social features
- ✅ Scalable infrastructure

---

**End of Architecture Documentation**
