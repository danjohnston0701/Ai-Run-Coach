
# AI Run Coach - Project Status & Roadmap

**Last Updated:** January 26, 2026
**Last Session:** Completed Personal Details, Fitness Level, and Distance Scale screens with full backend integration. All profile settings screens now production-ready with Neon database support.
**Next Priority:** Events and History screen implementation, Run Session screen completion.

---

## 🎯 Project Overview

AI Run Coach is an Android fitness tracking app with AI-powered coaching, GPS tracking, and wearable device integration.

**Total Features:** 58+
**Completed:** 18 (Branding, GPS, Weather, Dashboard, Icons, Navigation, Create Goal, Goals Integration, Route Generation UI, Profile Screen, Connected Devices Screen, Premium Screen, Friends Screens, Group Runs Screens, AI Coach Settings Screen, Personal Details Screen, Fitness Level Screen, Distance Scale Screen)
**Specifications Received:** 9 major feature areas documented
**In Progress:** Events and History screens
**Remaining:** 40+ features

---

## ✅ Completed Features

### Feature 4: Profile & Settings Screens ✓
**Completed:** January 26, 2026
**Status:** UI Complete - Backend Integration Required

**What was done:**
- Implemented a comprehensive `ProfileScreen` with navigation to various settings.
- Created placeholder screens for all settings sections: `FriendsScreen`, `GroupRunsScreen`, `CoachSettingsScreen`, `PersonalDetailsScreen`, `FitnessLevelScreen`, `DistanceScaleScreen`, `NotificationsScreen`, `ConnectedDevicesScreen`, and `SubscriptionScreen`.
- The `ProfileScreen` now displays user information and provides a logout button.

### Feature 5: Connected Devices Screen ✓
**Completed:** January 26, 2026
**Status:** UI Complete - Backend Integration Required

**What was done:**
- Implemented the `ConnectedDevicesScreen` to display a list of connectable fitness devices.
- Created a `ConnectedDevicesViewModel` to manage the data for this screen, currently using placeholder data.

### Feature 6: Premium Subscription Screen ✓
**Completed:** January 26, 2026
**Status:** UI Complete - Backend Integration Required

**What was done:**
- Implemented the `SubscriptionScreen` (named `PremiumScreen` in the UI) to showcase the benefits of a premium subscription.
- Created a `SubscriptionViewModel` to manage subscription plans and UI state.

### Feature 7: Friends & Find Friends Screens ✓
**Completed:** January 26, 2026
**Status:** UI Complete - Backend Integration Required

**What was done:**
- Implemented `FriendsScreen` to display a user's friends list and `FindFriendsScreen` to search for new friends.
- Created a `FriendsViewModel` to manage friends list and search functionality, currently using placeholder data.
- Defined `GET /api/friends/{userId}` and `POST /api/friends/{userId}/add` endpoints in `ApiService.kt`.

### Feature 8: Group Runs Screens ✓
**Completed:** January 26, 2026
**Status:** UI Complete - Backend Integration Required

**What was done:**
- Implemented `GroupRunsScreen` to display a list of group runs and `CreateGroupRunScreen` to create new ones.
- Created a `GroupRunsViewModel` to manage group runs, currently using placeholder data.
- Defined `GET /api/group-runs` and `POST /api/group-runs` endpoints in `ApiService.kt`.

### Feature 9: AI Coach Settings Screen ✓
**Completed:** January 26, 2026
**Status:** Production Ready

**What was done:**
- Implemented the `CoachSettingsScreen` to allow users to customize the AI coach's name, gender, accent, and tone.
- Created a `CoachSettingsViewModel` that saves the settings to the backend via the new `PUT /api/users/{id}/coach-settings` endpoint.

### Feature 10: Goals Screen Redesign ✓
**Completed:** January 26, 2026
**Status:** Production Ready

**What was done:**
- Redesigned the `GoalsScreen` to include "Active", "Completed", and "Abandoned" tabs.
- Updated the `GoalsViewModel` to filter goals based on the selected tab.

### Feature 11: Personal Details Screen ✓
**Completed:** January 26, 2026
**Status:** Production Ready

**What was done:**
- Implemented comprehensive `PersonalDetailsScreen` with full user profile editing capabilities
- Created `PersonalDetailsViewModel` with backend integration via `PUT /api/users/{id}` endpoint
- Form fields: Full Name, Email, Date of Birth (with auto-formatting), Gender (dropdown), Weight (kg), Height (cm)
- Real-time state management using Kotlin StateFlow
- Data persisted to SharedPreferences and synced with Neon database
- Created `UpdateUserRequest` model for flexible partial updates
- Updated `User` model with new fields: `dob`, `gender`, `weight`, `height`, `fitnessLevel`, `distanceScale`

### Feature 12: Fitness Level Screen ✓
**Completed:** January 26, 2026
**Status:** Production Ready

**What was done:**
- Implemented `FitnessLevelScreen` with radio button selection UI
- Created `FitnessLevelViewModel` with backend integration
- Three fitness levels: Beginner, Intermediate, Advanced
- Real-time selection with visual feedback (highlighted cards)
- Data saved to Neon database via `PUT /api/users/{id}` endpoint
- Persisted locally to SharedPreferences for offline access

### Feature 13: Distance Scale Screen ✓
**Completed:** January 26, 2026
**Status:** Production Ready

**What was done:**
- Implemented `DistanceScaleScreen` with radio button selection UI
- Created `DistanceScaleViewModel` with backend integration
- Two options: Kilometers, Miles
- Real-time selection with visual feedback
- Data saved to Neon database via `PUT /api/users/{id}` endpoint
- Persisted locally to SharedPreferences for offline access

### Feature 14: Shared UI Components ✓
**Completed:** January 26, 2026
**Status:** Production Ready

**What was done:**
- Created reusable `SectionTitle` composable component
- Used across PersonalDetailsScreen, FitnessLevelScreen, and DistanceScaleScreen
- Consistent styling with uppercase text and proper spacing
- Improves UI consistency and code reusability

---

## 🚧 In Progress Features

### Backend Implementation for New Features ✅ COMPLETE
**Completed:** January 26, 2026
**Status:** Production Ready
**Server:** http://localhost:3000

**All backend API endpoints have been implemented and tested!**

✅ **PUT /api/users/{id}/coach-settings** - Update AI coach settings  
✅ **PUT /api/users/{id}** - Update user profile (Personal Details, Fitness Level, Distance Scale)  
✅ **GET /api/friends/{userId}** - Get user's friends list  
✅ **POST /api/friends/{userId}/add** - Add a friend (bidirectional)  
✅ **DELETE /api/friends/{userId}/{friendId}** - Remove a friend  
✅ **GET /api/group-runs** - List all group runs with filters  
✅ **POST /api/group-runs** - Create new group run  
✅ **POST /api/group-runs/{id}/join** - Join a group run  
✅ **DELETE /api/group-runs/{id}/leave** - Leave a group run  

**Backend Documentation:** See backend repo at `/Desktop/Ai-Run-Coach-IOS-and-Android/BACKEND_ANDROID_V2_COMPLETE.md`

**Completed Steps:**
1. ✅ Backend implementation COMPLETE
2. ✅ **COMPLETE**: Profile settings screens fully integrated with real API calls
3. ✅ Personal Details, Fitness Level, Distance Scale screens production-ready
4. ⏳ **TODO**: Replace mock data in Friends and Group Runs ViewModels with real API calls
5. ⏳ Test end-to-end flows (Friends → Group Runs)

---

**Backend API Endpoints (Implemented):**

**1. Update AI Coach Settings** ✅
*   **Method**: `PUT`
*   **Endpoint**: `/api/users/{id}/coach-settings`
*   **Request Body**: JSON object with `coachName`, `coachGender`, `coachAccent`, `coachTone`
*   **Action**: Update user's AI coach preferences in Neon database
*   **Status**: ✅ COMPLETE - Fully validated with tests

**2. Update User Profile** ✅
*   **Method**: `PUT`
*   **Endpoint**: `/api/users/{id}`
*   **Request Body**: JSON object with optional fields: `name`, `email`, `dob`, `gender`, `weight`, `height`, `fitnessLevel`, `distanceScale`
*   **Action**: Partial update of user profile. Only provided fields are updated
*   **Database**: Neon PostgreSQL `users` table
*   **Status**: ✅ COMPLETE - Production ready
*   **Used By**: PersonalDetailsScreen, FitnessLevelScreen, DistanceScaleScreen

**3. Get Friends List** ✅
*   **Method**: `GET`
*   **Endpoint**: `/api/friends/{userId}`
*   **Action**: Retrieve friends list from `friendships` table with user details join
*   **Status**: ✅ COMPLETE - Awaiting frontend integration

**4. Add a Friend** ✅
*   **Method**: `POST`
*   **Endpoint**: `/api/friends/{userId}/add`
*   **Request Body**: JSON object with `friendId`
*   **Action**: Create bidirectional friendship entries in `friendships` table
*   **Status**: ✅ COMPLETE - Awaiting frontend integration

**5. Get All Group Runs** ✅
*   **Method**: `GET`
*   **Endpoint**: `/api/group-runs`
*   **Action**: Retrieve all group runs from `group_runs` table with filters
*   **Status**: ✅ COMPLETE - Awaiting frontend integration

**6. Create a Group Run** ✅
*   **Method**: `POST`
*   **Endpoint**: `/api/group-runs`
*   **Request Body**: JSON object with `name`, `meetingPoint`, `description`, `distance`, `maxParticipants`, `dateTime`
*   **Action**: Insert new group run into `group_runs` table
*   **Status**: ✅ COMPLETE - Awaiting frontend integration

---

## 🗄️ Neon Database Schema Updates

### Users Table Extensions ✅
**Status:** Implemented in Neon PostgreSQL

New columns added to support profile features:
- `dob` (VARCHAR) - Date of birth in dd/mm/yyyy format
- `gender` (VARCHAR) - User's gender (Male, Female, Non-binary, Prefer not to say)
- `weight` (DECIMAL) - User's weight in kilograms
- `height` (DECIMAL) - User's height in centimeters
- `fitness_level` (VARCHAR) - Beginner, Intermediate, or Advanced
- `distance_scale` (VARCHAR) - Kilometers or Miles preference
- `coach_name` (VARCHAR) - Custom AI coach name
- `coach_gender` (VARCHAR) - AI coach voice gender
- `coach_accent` (VARCHAR) - AI coach voice accent
- `coach_tone` (VARCHAR) - AI coach coaching style
- `subscription_tier` (VARCHAR) - User's subscription level
- `profile_pic` (TEXT) - Profile picture URL

### Friendships Table ✅
**Status:** Implemented in Neon PostgreSQL

```sql
CREATE TABLE friendships (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'accepted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, friend_id)
);
```

Features:
- Bidirectional friendships (requires 2 rows for mutual friendship)
- Status support for future friend requests feature
- Indexed on user_id, friend_id, and status for performance

### Group Runs Table ✅
**Status:** Implemented in Neon PostgreSQL

```sql
CREATE TABLE group_runs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creator_id VARCHAR(255) NOT NULL REFERENCES users(id),
    meeting_point TEXT NOT NULL,
    meeting_lat DECIMAL(10, 8),
    meeting_lng DECIMAL(11, 8),
    distance DECIMAL(5, 2) NOT NULL,
    date_time TIMESTAMP NOT NULL,
    max_participants INTEGER DEFAULT 10,
    is_public BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Features:
- Full group run management with location coordinates
- Status tracking (upcoming, in_progress, completed, cancelled)
- Public/private run support
- Indexed on creator_id and date_time for performance

---

## 📱 Screen Status

| Screen | Status | Notes |
|--------|--------|-------|
| **Login** | ✅ Complete | Connects to backend API |
| **Location Permission** | ✅ Complete | Requests GPS permissions |
| **Dashboard (Home)** | ✅ Complete | Fully redesigned, production ready |
| **History** | 📝 Placeholder | Needs implementation |
| **Events** | 📝 Placeholder | Needs implementation |
| **Goals** | ✅ Complete | Redesigned with tabs |
| **Profile** | ✅ Complete | UI complete, navigation working |
| **Map My Run Setup** | ✅ Complete | Distance, time, live tracking, group runs |
| **Route Generation Loading** | ✅ Complete | AI brain animation, status messages |
| **Route Selection** | ✅ Complete | Difficulty grouping, map previews, selection |
| **Run Session** | 📝 Placeholder | RUN WITHOUT ROUTE - navigation working |
| **Create Goal** | ✅ Complete | Full form with 4 categories, conditional fields |
| **Friends** | ✅ Complete | UI complete, uses placeholder data |
| **Find Friends** | ✅ Complete | UI complete, uses placeholder data |
| **Group Runs** | ✅ Complete | UI complete, uses placeholder data |
| **Create Group Run** | ✅ Complete | UI complete, uses placeholder data |
| **Coach Settings** | ✅ Complete | UI and backend integration complete |
| **Connected Devices** | ✅ Complete | UI complete, uses placeholder data |
| **Subscription** | ✅ Complete | UI complete, uses placeholder data |
| **Personal Details** | ✅ Complete | Full backend integration, production ready |
| **Fitness Level** | ✅ Complete | Full backend integration, production ready |
| **Distance Scale** | ✅ Complete | Full backend integration, production ready |
| **Notifications** | 📝 Placeholder | Needs implementation |


---

## 📱 Android Implementation Details

### New Models ✅
- **`UpdateUserRequest`** - Flexible request model for partial user profile updates
  - All fields optional: `name`, `email`, `dob`, `gender`, `weight`, `height`, `fitnessLevel`, `distanceScale`
  - Enables targeted updates without affecting unchanged fields

### Updated Models ✅
- **`User`** - Extended with new profile fields
  - Personal: `dob`, `gender`, `weight`, `height`
  - Preferences: `fitnessLevel`, `distanceScale`
  - Maintains backward compatibility with existing fields

### New ViewModels ✅
1. **`PersonalDetailsViewModel`**
   - Manages all user profile fields with StateFlow
   - Auto-formats date of birth input (dd/mm/yyyy)
   - Validates and saves data to backend via `PUT /api/users/{id}`
   - Syncs with SharedPreferences for offline access

2. **`FitnessLevelViewModel`**
   - Manages fitness level selection (Beginner, Intermediate, Advanced)
   - Real-time state updates with visual feedback
   - Persists to Neon database and SharedPreferences

3. **`DistanceScaleViewModel`**
   - Manages distance preference (Kilometers, Miles)
   - Real-time state updates with visual feedback
   - Persists to Neon database and SharedPreferences

### New UI Components ✅
- **`SectionTitle`** - Reusable section header component
  - Uppercase styling with consistent spacing
  - Used across multiple settings screens
  - Improves UI consistency and maintainability

### Integration Patterns ✅
- **State Management**: Kotlin StateFlow for reactive UI updates
- **Data Persistence**: Dual-layer (Backend + SharedPreferences)
- **Error Handling**: Try-catch blocks with graceful degradation
- **Form Validation**: Real-time input formatting and validation
- **Navigation**: Composable navigation with back button support

---

## 📝 Notes for Future Sessions

**When resuming this project:**
1. Read this file first to understand current state
2. Check "Last Session" note at top for context
3. Review "In Progress Features" for incomplete work
4. Ask user for next feature priority if not specified
5. Update this file after completing each feature/task
6. Always mark completion dates and status changes

**Important Contexts:**
- ✅ Backend is fully updated with all required endpoints and connected to Neon PostgreSQL database
- ✅ Profile settings screens (Personal Details, Fitness Level, Distance Scale) are production-ready with full backend integration
- ⏳ Friends and Group Runs ViewModels still use placeholder data - need to integrate with existing backend APIs
- ⏳ Connected Devices screen uses placeholder data - awaiting device integration implementation
- All user profile data is now persisted to Neon database with local SharedPreferences backup

---

**End of Project Status Document**
