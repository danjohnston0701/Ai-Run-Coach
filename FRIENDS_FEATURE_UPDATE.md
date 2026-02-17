# Friends Feature - Unified Screen Update

**Date:** February 12, 2026  
**Status:** ✅ COMPLETE

---

## Overview

Redesigned the Friends feature by merging "My Friends" and "Add Friends" into a single, unified **Friends** screen that provides a comprehensive friend management experience.

---

## Changes Made

### ✅ 1. Unified Friends Screen

**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/FriendsScreen.kt`

**New Structure (Top to Bottom):**

1. **Search Section**
   - Search bar at the top to find users by name or email
   - Real-time search results displayed below
   - "Add Friend" button sends friend request
   - Shows "Request Sent" state after sending

2. **Pending Friend Requests Section** *(Only visible when there are pending requests)*
   - **Received Requests:** Requests from others waiting for your response
     - Accept button (green checkmark)
     - Decline button (red X)
   - **Sent Requests:** Requests you've sent waiting for response
     - Cancel button (gray X) to revoke request
   - Shows profile picture, name, and status for each request

3. **My Friends List**
   - All accepted friends displayed
   - Shows profile picture, name, email
   - View activity button (eye icon) for each friend
   - Empty state message if no friends yet

### ✅ 2. Updated ViewModel

**File:** `app/src/main/java/live/airuncoach/airuncoach/viewmodel/FriendsViewModel.kt`

**New State Management:**
- `SearchUiState`: Handles user search (Idle, Loading, Success, Error)
- `PendingRequestsUiState`: Manages pending requests (Loading, Success with sent/received lists, Error)
- `FriendsUiState`: Existing friends list (Loading, Success, Error)

**New Functions:**
- `loadPendingRequests()`: Fetches sent and received friend requests
- `sendFriendRequest(friendId)`: Sends a new friend request
- `acceptFriendRequest(requestId)`: Accepts incoming request
- `declineFriendRequest(requestId)`: Declines incoming request
- `cancelSentRequest(requestId)`: Cancels a sent request

### ✅ 3. Updated API Service

**File:** `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt`

**New Endpoints:**
```kotlin
@POST("/api/friend-requests")
suspend fun sendFriendRequest(@Body request: Map<String, String>)

@GET("/api/friend-requests/{userId}")
suspend fun getFriendRequests(@Path("userId") userId: String): FriendRequestsResponse

@POST("/api/friend-requests/{id}/accept")
suspend fun acceptFriendRequest(@Path("id") requestId: String)

@POST("/api/friend-requests/{id}/decline")
suspend fun declineFriendRequest(@Path("id") requestId: String)
```

### ✅ 4. New Response Model

**File:** `app/src/main/java/live/airuncoach/airuncoach/network/model/FriendRequestsResponse.kt`

```kotlin
data class FriendRequestsResponse(
    val sent: List<FriendRequestItem>,
    val received: List<FriendRequestItem>
)

data class FriendRequestItem(
    val id: String,
    val requesterId: String,
    val addresseeId: String,
    val requesterName: String?,
    val requesterProfilePic: String?,
    val addresseeName: String?,
    val addresseeProfilePic: String?,
    val status: String,
    val message: String?,
    val createdAt: String
)
```

### ✅ 5. Updated Profile Screen

**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ProfileScreen.kt`

**Changes:**
- Renamed section from "Friends" to "Social"
- Changed "My Friends" to "Friends"
- Removed "Add Friends" option (now built into Friends screen)
- Kept friend count display: `X friends`

### ✅ 6. Updated Navigation

**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt`

**Changes:**
- Updated `friends` route to remove `onNavigateToFindFriends` parameter
- Removed `find_friends` route entirely

### ✅ 7. Deleted Old Screen

**Deleted:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/FindFriendsScreen.kt`

Functionality merged into the unified `FriendsScreen.kt`

### ✅ 8. Backend API Endpoint Added

**File:** `/Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android/server/routes.ts`

**New Endpoint:** `GET /api/friend-requests/:userId`

**Functionality:**
- Returns both sent and received friend requests for a user
- Enriches requests with user data (name, profile picture)
- Response format:
  ```json
  {
    "sent": [/* requests user has sent */],
    "received": [/* requests user has received */]
  }
  ```

---

## User Flow

### Sending a Friend Request:
1. User navigates to **Profile → Friends**
2. Types name/email in search bar
3. Taps "Search"
4. Results appear below
5. Taps "Add Friend" button
6. Request sent, button changes to "Request Sent"
7. Sent request appears in "Pending Requests" section

### Accepting a Friend Request:
1. User navigates to **Profile → Friends**
2. Sees incoming request in "Pending Requests" section
3. Taps green checkmark (Accept)
4. Request disappears from pending
5. Friend appears in "My Friends" list below

### Declining/Canceling a Request:
1. **Decline (Incoming):** Tap red X on received request
2. **Cancel (Sent):** Tap gray X on sent request
3. Request removed from pending list

---

## UI Components

### Search User Card
- Profile picture (or default avatar)
- User name
- User email
- "Add Friend" / "Request Sent" button

### Pending Request Card
- Profile picture
- User name
- Status message ("Wants to be friends" / "Request pending")
- Action buttons:
  - **Incoming:** Accept (✓) and Decline (✕)
  - **Outgoing:** Cancel (✕)

### Friend Card
- Profile picture
- User name
- User email
- View activity button (eye icon)

---

## Backend Requirements

The backend already has the following in place:

✅ **Database Table:** `friend_requests`
- id, requesterId, addresseeId, status, message, createdAt, respondedAt

✅ **Storage Functions:**
- `createFriendRequest()`
- `getFriendRequests()`
- `acceptFriendRequest()`
- `declineFriendRequest()`
- `getFriends()`

✅ **API Endpoints:**
- `POST /api/friend-requests` - Create request
- `GET /api/friend-requests/:userId` - Get user's requests (NEWLY ADDED)
- `POST /api/friend-requests/:id/accept` - Accept request
- `POST /api/friend-requests/:id/decline` - Decline request
- `GET /api/users/:userId/friends` - Get friends list
- `GET /api/users/search` - Search users

---

## Testing Checklist

- [ ] Search for users by name
- [ ] Search for users by email
- [ ] Send friend request
- [ ] Verify "Request Sent" button state
- [ ] Receive friend request notification
- [ ] Accept friend request
- [ ] Decline friend request
- [ ] Cancel sent request
- [ ] View friend in "My Friends" list
- [ ] Verify pending requests only show when present
- [ ] Test with no friends (empty state)
- [ ] Test with no pending requests (section hidden)

---

## Benefits

✅ **Unified Experience:** All friend management in one place  
✅ **Reduced Navigation:** No need to switch between screens  
✅ **Better UX:** Clear separation of search, pending, and friends  
✅ **Visibility:** Pending requests always visible when present  
✅ **Simplified Profile:** Cleaner profile menu with one "Friends" option  

---

## Next Steps (Optional Enhancements)

1. Add friend removal functionality
2. Implement friend activity viewing
3. Add push notifications for friend requests
4. Add friend request message support
5. Add friend stats (mutual friends, etc.)
6. Add friend filtering/sorting

---

**Status:** Ready for testing! 🚀
