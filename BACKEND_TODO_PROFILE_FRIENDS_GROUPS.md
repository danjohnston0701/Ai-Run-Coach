# Backend Implementation Guide - Profile, Friends & Group Runs

**Date:** January 25, 2026  
**Status:** Required for Android v2 Features  
**Priority:** High

---

## 🎯 Overview

The Android app has been updated with several new screens for user profile management, social features (friends), and group runs. This document outlines the backend API endpoints and database schema required to support these features.

---

## 📊 Database Schema Updates

### 1. Users Table - Add Coach Settings Columns

Add the following columns to the existing `users` table:

```sql
ALTER TABLE users
ADD COLUMN coach_name VARCHAR(100) DEFAULT 'Coach Carter',
ADD COLUMN coach_gender VARCHAR(20) DEFAULT 'male',
ADD COLUMN coach_accent VARCHAR(50) DEFAULT 'American',
ADD COLUMN coach_tone VARCHAR(50) DEFAULT 'motivational',
ADD COLUMN subscription_tier VARCHAR(20) DEFAULT 'free',
ADD COLUMN profile_pic TEXT;
```

**Column Descriptions:**
- `coach_name`: User's custom name for their AI coach (default: "Coach Carter")
- `coach_gender`: Voice gender preference ("male" or "female")
- `coach_accent`: Voice accent preference (American, British, Australian, Irish, South African)
- `coach_tone`: Coaching style preference (motivational, energetic, calm, professional, friendly)
- `subscription_tier`: User's subscription level ("free", "lite", "premium", "premium_plus")
- `profile_pic`: URL to user's profile picture

### 2. Friendships Table - Create New

```sql
CREATE TABLE friendships (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, friend_id)
);

-- Indexes for performance
CREATE INDEX idx_friendships_user_id ON friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX idx_friendships_status ON friendships(status);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_friendships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER friendships_updated_at_trigger
BEFORE UPDATE ON friendships
FOR EACH ROW
EXECUTE FUNCTION update_friendships_updated_at();
```

**Design Notes:**
- Friendships are unidirectional (user_id → friend_id)
- For mutual friendships, create two rows (A→B and B→A)
- `status` field supports future friend request functionality
- Currently defaulting to "accepted" for simple add flow

### 3. Group Runs Table - Create New

```sql
CREATE TABLE group_runs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creator_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meeting_point TEXT NOT NULL,
    meeting_lat DECIMAL(10, 8),
    meeting_lng DECIMAL(11, 8),
    distance DECIMAL(5, 2) NOT NULL,
    date_time TIMESTAMP NOT NULL,
    max_participants INTEGER DEFAULT 10,
    is_public BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_group_runs_creator_id ON group_runs(creator_id);
CREATE INDEX idx_group_runs_date_time ON group_runs(date_time);
CREATE INDEX idx_group_runs_status ON group_runs(status);

-- Trigger for updated_at
CREATE TRIGGER group_runs_updated_at_trigger
BEFORE UPDATE ON group_runs
FOR EACH ROW
EXECUTE FUNCTION update_friendships_updated_at();
```

### 4. Group Run Participants Table - Create New

```sql
CREATE TABLE group_run_participants (
    id SERIAL PRIMARY KEY,
    group_run_id INTEGER NOT NULL REFERENCES group_runs(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'joined' CHECK (status IN ('joined', 'declined', 'cancelled')),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_run_id, user_id)
);

-- Indexes
CREATE INDEX idx_group_run_participants_group_run_id ON group_run_participants(group_run_id);
CREATE INDEX idx_group_run_participants_user_id ON group_run_participants(user_id);
```

---

## 🔌 API Endpoints to Implement

### 1. Update User Coach Settings

**Endpoint:** `PUT /api/users/{id}/coach-settings`  
**Authentication:** Required (user must be updating their own settings)

**Request Body:**
```json
{
  "coachName": "Coach Sarah",
  "coachGender": "female",
  "coachAccent": "British",
  "coachTone": "calm"
}
```

**Response (200 OK):**
```json
{
  "id": "user_123",
  "name": "John Doe",
  "email": "john@example.com",
  "coachName": "Coach Sarah",
  "coachGender": "female",
  "coachAccent": "British",
  "coachTone": "calm",
  "subscriptionTier": "premium",
  "profilePic": "https://example.com/profile.jpg"
}
```

**Validation Rules:**
- `coachGender`: Must be "male" or "female"
- `coachAccent`: Must be one of: American, British, Australian, Irish, South African
- `coachTone`: Must be one of: motivational, energetic, calm, professional, friendly
- `coachName`: Max 100 characters

**Implementation Notes:**
```typescript
// Example implementation (Node.js/Express)
router.put('/api/users/:id/coach-settings', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { coachName, coachGender, coachAccent, coachTone } = req.body;
  
  // Verify user is updating their own settings
  if (req.user.id !== id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Validate inputs
  const validGenders = ['male', 'female'];
  const validAccents = ['American', 'British', 'Australian', 'Irish', 'South African'];
  const validTones = ['motivational', 'energetic', 'calm', 'professional', 'friendly'];
  
  if (coachGender && !validGenders.includes(coachGender)) {
    return res.status(400).json({ error: 'Invalid coach gender' });
  }
  
  // Update database
  const updatedUser = await db.query(
    `UPDATE users 
     SET coach_name = $1, coach_gender = $2, coach_accent = $3, coach_tone = $4
     WHERE id = $5
     RETURNING *`,
    [coachName, coachGender, coachAccent, coachTone, id]
  );
  
  res.json(updatedUser.rows[0]);
});
```

---

### 2. Get User's Friends List

**Endpoint:** `GET /api/friends/{userId}`  
**Authentication:** Required

**Query Parameters:**
- `status` (optional): Filter by friendship status ("pending", "accepted", "blocked")

**Response (200 OK):**
```json
{
  "friends": [
    {
      "id": "friend_123",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "profilePicUrl": "https://example.com/jane.jpg",
      "subscriptionTier": "premium",
      "friendshipStatus": "accepted",
      "friendsSince": "2026-01-15T10:30:00Z"
    },
    {
      "id": "friend_456",
      "name": "John Smith",
      "email": "john.smith@example.com",
      "profilePicUrl": "https://example.com/john.jpg",
      "subscriptionTier": "free",
      "friendshipStatus": "accepted",
      "friendsSince": "2026-01-10T14:20:00Z"
    }
  ],
  "count": 2
}
```

**Implementation Notes:**
```typescript
router.get('/api/friends/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { status } = req.query;
  
  // Verify user is requesting their own friends or has permission
  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  let query = `
    SELECT 
      u.id, u.name, u.email, u.profile_pic as "profilePicUrl",
      u.subscription_tier as "subscriptionTier",
      f.status as "friendshipStatus",
      f.created_at as "friendsSince"
    FROM friendships f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = $1
  `;
  
  const params = [userId];
  
  if (status) {
    query += ' AND f.status = $2';
    params.push(status);
  }
  
  query += ' ORDER BY f.created_at DESC';
  
  const result = await db.query(query, params);
  
  res.json({
    friends: result.rows,
    count: result.rows.length
  });
});
```

---

### 3. Search Users (Find Friends)

**Endpoint:** `GET /api/users/search`  
**Authentication:** Required

**Query Parameters:**
- `q` (required): Search query (searches name and email)
- `limit` (optional): Max results to return (default: 20, max: 100)

**Response (200 OK):**
```json
{
  "users": [
    {
      "id": "user_789",
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "profilePicUrl": "https://example.com/alice.jpg",
      "subscriptionTier": "lite",
      "isFriend": false
    },
    {
      "id": "user_101",
      "name": "Bob Wilson",
      "email": "bob@example.com",
      "profilePicUrl": null,
      "subscriptionTier": "free",
      "isFriend": true
    }
  ],
  "count": 2
}
```

**Implementation Notes:**
```typescript
router.get('/api/users/search', authMiddleware, async (req, res) => {
  const { q, limit = 20 } = req.query;
  
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }
  
  const searchPattern = `%${q}%`;
  const maxLimit = Math.min(parseInt(limit), 100);
  
  const query = `
    SELECT 
      u.id, u.name, u.email, u.profile_pic as "profilePicUrl",
      u.subscription_tier as "subscriptionTier",
      CASE 
        WHEN f.id IS NOT NULL THEN true 
        ELSE false 
      END as "isFriend"
    FROM users u
    LEFT JOIN friendships f ON f.friend_id = u.id AND f.user_id = $1
    WHERE (u.name ILIKE $2 OR u.email ILIKE $2)
      AND u.id != $1
    ORDER BY u.name
    LIMIT $3
  `;
  
  const result = await db.query(query, [req.user.id, searchPattern, maxLimit]);
  
  res.json({
    users: result.rows,
    count: result.rows.length
  });
});
```

---

### 4. Add a Friend

**Endpoint:** `POST /api/friends/{userId}/add`  
**Authentication:** Required

**Request Body:**
```json
{
  "friendId": "user_789"
}
```

**Response (201 Created):**
```json
{
  "id": "friend_789",
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "profilePicUrl": "https://example.com/alice.jpg",
  "subscriptionTier": "lite",
  "friendshipStatus": "accepted",
  "friendsSince": "2026-01-25T15:45:00Z"
}
```

**Error Responses:**
- `400 Bad Request`: Missing friendId or trying to add self
- `404 Not Found`: Friend user not found
- `409 Conflict`: Friendship already exists

**Implementation Notes:**
```typescript
router.post('/api/friends/:userId/add', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { friendId } = req.body;
  
  // Verify user is adding to their own friends list
  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Can't add self
  if (userId === friendId) {
    return res.status(400).json({ error: 'Cannot add yourself as a friend' });
  }
  
  // Check if friend user exists
  const friendUser = await db.query('SELECT * FROM users WHERE id = $1', [friendId]);
  if (friendUser.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Check if friendship already exists
  const existingFriendship = await db.query(
    'SELECT * FROM friendships WHERE user_id = $1 AND friend_id = $2',
    [userId, friendId]
  );
  
  if (existingFriendship.rows.length > 0) {
    return res.status(409).json({ error: 'Friendship already exists' });
  }
  
  // Create friendship (unidirectional)
  await db.query(
    'INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3)',
    [userId, friendId, 'accepted']
  );
  
  // Optionally: Create reverse friendship for mutual friends
  await db.query(
    'INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [friendId, userId, 'accepted']
  );
  
  // Return friend details
  const friend = await db.query(
    `SELECT 
      u.id, u.name, u.email, u.profile_pic as "profilePicUrl",
      u.subscription_tier as "subscriptionTier",
      f.status as "friendshipStatus",
      f.created_at as "friendsSince"
    FROM users u
    JOIN friendships f ON f.friend_id = u.id
    WHERE f.user_id = $1 AND f.friend_id = $2`,
    [userId, friendId]
  );
  
  res.status(201).json(friend.rows[0]);
});
```

---

### 5. Remove a Friend

**Endpoint:** `DELETE /api/friends/{userId}/{friendId}`  
**Authentication:** Required

**Response (204 No Content)**

**Implementation Notes:**
```typescript
router.delete('/api/friends/:userId/:friendId', authMiddleware, async (req, res) => {
  const { userId, friendId } = req.params;
  
  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Delete both directions of friendship
  await db.query(
    'DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
    [userId, friendId]
  );
  
  res.status(204).send();
});
```

---

### 6. Get All Group Runs

**Endpoint:** `GET /api/group-runs`  
**Authentication:** Required

**Query Parameters:**
- `status` (optional): Filter by status ("upcoming", "in_progress", "completed", "cancelled")
- `my_groups` (optional): If "true", only return groups created by or joined by current user
- `limit` (optional): Max results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response (200 OK):**
```json
{
  "groupRuns": [
    {
      "id": 1,
      "name": "Saturday Morning 10K",
      "description": "Join us for a casual 10K run around the park!",
      "creatorId": "user_123",
      "creatorName": "John Doe",
      "meetingPoint": "Central Park Main Entrance",
      "meetingLat": 40.7829,
      "meetingLng": -73.9654,
      "distance": 10.0,
      "dateTime": "2026-01-29T08:00:00Z",
      "maxParticipants": 15,
      "currentParticipants": 8,
      "isPublic": true,
      "status": "upcoming",
      "isJoined": false,
      "createdAt": "2026-01-20T10:00:00Z"
    }
  ],
  "count": 1,
  "total": 15
}
```

**Implementation Notes:**
```typescript
router.get('/api/group-runs', authMiddleware, async (req, res) => {
  const { status, my_groups, limit = 50, offset = 0 } = req.query;
  const userId = req.user.id;
  
  let query = `
    SELECT 
      gr.id, gr.name, gr.description, gr.creator_id as "creatorId",
      creator.name as "creatorName",
      gr.meeting_point as "meetingPoint",
      gr.meeting_lat as "meetingLat", gr.meeting_lng as "meetingLng",
      gr.distance, gr.date_time as "dateTime", gr.max_participants as "maxParticipants",
      gr.is_public as "isPublic", gr.status,
      gr.created_at as "createdAt",
      COUNT(grp.id) as "currentParticipants",
      CASE 
        WHEN user_grp.id IS NOT NULL THEN true 
        ELSE false 
      END as "isJoined"
    FROM group_runs gr
    JOIN users creator ON gr.creator_id = creator.id
    LEFT JOIN group_run_participants grp ON gr.id = grp.group_run_id AND grp.status = 'joined'
    LEFT JOIN group_run_participants user_grp ON gr.id = user_grp.group_run_id AND user_grp.user_id = $1
    WHERE gr.is_public = true
  `;
  
  const params = [userId];
  let paramIndex = 2;
  
  if (status) {
    query += ` AND gr.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  if (my_groups === 'true') {
    query += ` AND (gr.creator_id = $1 OR user_grp.id IS NOT NULL)`;
  }
  
  query += ` GROUP BY gr.id, creator.name, user_grp.id`;
  query += ` ORDER BY gr.date_time ASC`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(parseInt(limit), parseInt(offset));
  
  const result = await db.query(query, params);
  
  // Get total count
  const countQuery = `SELECT COUNT(*) FROM group_runs WHERE is_public = true`;
  const countResult = await db.query(countQuery);
  
  res.json({
    groupRuns: result.rows,
    count: result.rows.length,
    total: parseInt(countResult.rows[0].count)
  });
});
```

---

### 7. Create a Group Run

**Endpoint:** `POST /api/group-runs`  
**Authentication:** Required

**Request Body:**
```json
{
  "name": "Saturday Morning 10K",
  "description": "Join us for a casual 10K run around the park!",
  "meetingPoint": "Central Park Main Entrance",
  "meetingLat": 40.7829,
  "meetingLng": -73.9654,
  "distance": 10.0,
  "dateTime": "2026-01-29T08:00:00Z",
  "maxParticipants": 15,
  "isPublic": true
}
```

**Validation Rules:**
- `name`: Required, max 255 characters
- `description`: Optional, max 1000 characters
- `meetingPoint`: Required, max 500 characters
- `distance`: Required, > 0
- `dateTime`: Required, must be in the future
- `maxParticipants`: Optional, default 10, range 2-100

**Response (201 Created):**
```json
{
  "id": 1,
  "name": "Saturday Morning 10K",
  "description": "Join us for a casual 10K run around the park!",
  "creatorId": "user_123",
  "creatorName": "John Doe",
  "meetingPoint": "Central Park Main Entrance",
  "meetingLat": 40.7829,
  "meetingLng": -73.9654,
  "distance": 10.0,
  "dateTime": "2026-01-29T08:00:00Z",
  "maxParticipants": 15,
  "currentParticipants": 1,
  "isPublic": true,
  "status": "upcoming",
  "isJoined": true,
  "createdAt": "2026-01-25T15:00:00Z"
}
```

**Implementation Notes:**
```typescript
router.post('/api/group-runs', authMiddleware, async (req, res) => {
  const {
    name, description, meetingPoint, meetingLat, meetingLng,
    distance, dateTime, maxParticipants = 10, isPublic = true
  } = req.body;
  
  const creatorId = req.user.id;
  
  // Validation
  if (!name || !meetingPoint || !distance || !dateTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (new Date(dateTime) <= new Date()) {
    return res.status(400).json({ error: 'Date/time must be in the future' });
  }
  
  if (distance <= 0 || distance > 100) {
    return res.status(400).json({ error: 'Distance must be between 0 and 100 km' });
  }
  
  // Create group run
  const result = await db.query(
    `INSERT INTO group_runs 
     (name, description, creator_id, meeting_point, meeting_lat, meeting_lng, 
      distance, date_time, max_participants, is_public, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'upcoming')
     RETURNING *`,
    [name, description, creatorId, meetingPoint, meetingLat, meetingLng,
     distance, dateTime, maxParticipants, isPublic]
  );
  
  const groupRun = result.rows[0];
  
  // Auto-join creator as participant
  await db.query(
    'INSERT INTO group_run_participants (group_run_id, user_id, status) VALUES ($1, $2, $3)',
    [groupRun.id, creatorId, 'joined']
  );
  
  // Get creator name
  const creator = await db.query('SELECT name FROM users WHERE id = $1', [creatorId]);
  
  res.status(201).json({
    id: groupRun.id,
    name: groupRun.name,
    description: groupRun.description,
    creatorId: groupRun.creator_id,
    creatorName: creator.rows[0].name,
    meetingPoint: groupRun.meeting_point,
    meetingLat: groupRun.meeting_lat,
    meetingLng: groupRun.meeting_lng,
    distance: parseFloat(groupRun.distance),
    dateTime: groupRun.date_time,
    maxParticipants: groupRun.max_participants,
    currentParticipants: 1,
    isPublic: groupRun.is_public,
    status: groupRun.status,
    isJoined: true,
    createdAt: groupRun.created_at
  });
});
```

---

### 8. Join a Group Run

**Endpoint:** `POST /api/group-runs/{groupRunId}/join`  
**Authentication:** Required

**Response (200 OK):**
```json
{
  "message": "Successfully joined group run",
  "groupRunId": 1,
  "userId": "user_456"
}
```

**Error Responses:**
- `404 Not Found`: Group run not found
- `409 Conflict`: Already joined or group is full

**Implementation Notes:**
```typescript
router.post('/api/group-runs/:groupRunId/join', authMiddleware, async (req, res) => {
  const { groupRunId } = req.params;
  const userId = req.user.id;
  
  // Check if group run exists
  const groupRun = await db.query('SELECT * FROM group_runs WHERE id = $1', [groupRunId]);
  if (groupRun.rows.length === 0) {
    return res.status(404).json({ error: 'Group run not found' });
  }
  
  // Check if already joined
  const existing = await db.query(
    'SELECT * FROM group_run_participants WHERE group_run_id = $1 AND user_id = $2',
    [groupRunId, userId]
  );
  
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Already joined this group run' });
  }
  
  // Check if group is full
  const participantCount = await db.query(
    'SELECT COUNT(*) FROM group_run_participants WHERE group_run_id = $1 AND status = $2',
    [groupRunId, 'joined']
  );
  
  if (parseInt(participantCount.rows[0].count) >= groupRun.rows[0].max_participants) {
    return res.status(409).json({ error: 'Group run is full' });
  }
  
  // Join group
  await db.query(
    'INSERT INTO group_run_participants (group_run_id, user_id, status) VALUES ($1, $2, $3)',
    [groupRunId, userId, 'joined']
  );
  
  res.json({
    message: 'Successfully joined group run',
    groupRunId: parseInt(groupRunId),
    userId
  });
});
```

---

### 9. Leave a Group Run

**Endpoint:** `DELETE /api/group-runs/{groupRunId}/leave`  
**Authentication:** Required

**Response (204 No Content)**

**Implementation Notes:**
```typescript
router.delete('/api/group-runs/:groupRunId/leave', authMiddleware, async (req, res) => {
  const { groupRunId } = req.params;
  const userId = req.user.id;
  
  // Check if user is the creator (creators can't leave, must delete instead)
  const groupRun = await db.query('SELECT creator_id FROM group_runs WHERE id = $1', [groupRunId]);
  if (groupRun.rows[0]?.creator_id === userId) {
    return res.status(400).json({ error: 'Creators cannot leave their own group run. Delete it instead.' });
  }
  
  // Remove participant
  await db.query(
    'DELETE FROM group_run_participants WHERE group_run_id = $1 AND user_id = $2',
    [groupRunId, userId]
  );
  
  res.status(204).send();
});
```

---

## 🧪 Testing Checklist

### Profile & Coach Settings
- [ ] Update coach settings (name, gender, accent, tone)
- [ ] Verify settings persist across sessions
- [ ] Test validation for invalid accent/tone values
- [ ] Ensure user can only update their own settings

### Friends
- [ ] Get friends list (should be empty initially)
- [ ] Search for users by name
- [ ] Search for users by email
- [ ] Add a friend
- [ ] Verify friendship appears in both users' friend lists
- [ ] Try to add same friend twice (should fail)
- [ ] Remove a friend
- [ ] Test friend list pagination

### Group Runs
- [ ] Create a group run
- [ ] Verify creator is auto-joined
- [ ] Get all public group runs
- [ ] Filter group runs by status
- [ ] Join a group run
- [ ] Try to join when full (should fail)
- [ ] Leave a group run
- [ ] Try to leave as creator (should fail)
- [ ] Test pagination

---

## 📦 Data Migration Script

Run this after deploying the schema updates:

```sql
-- Set default coach settings for existing users
UPDATE users
SET 
  coach_name = 'Coach Carter',
  coach_gender = 'male',
  coach_accent = 'American',
  coach_tone = 'motivational',
  subscription_tier = 'free'
WHERE coach_name IS NULL;

-- Verify migration
SELECT 
  COUNT(*) as total_users,
  COUNT(coach_name) as users_with_coach_settings
FROM users;
```

---

## 🚀 Deployment Notes

1. **Database Migration:**
   - Run schema updates on Neon.com database
   - Run data migration script
   - Verify indexes are created

2. **Backend Deployment:**
   - Implement all 9 API endpoints
   - Add authentication middleware to all endpoints
   - Test each endpoint with Postman/curl

3. **Android Testing:**
   - Verify all screens load with backend data
   - Test full user flows (add friend → view friends → create group run → join)
   - Test error states (network failures, validation errors)

---

## 📝 Notes

**Android App Status:**
- ✅ All UI screens built and styled
- ✅ ViewModels created with state management
- ✅ Navigation wired up
- ⏳ Currently using mock data (awaiting backend)

**Priority:**
These endpoints are **required** for the following Android screens to be functional:
1. ProfileScreen - Displays user coach settings
2. CoachSettingsScreen - Updates coach settings
3. FriendsScreen - Lists friends
4. FindFriendsScreen - Searches for users
5. GroupRunsScreen - Lists group runs
6. CreateGroupRunScreen - Creates new group run

**Estimated Backend Development Time:**
- Database schema updates: 30 minutes
- API endpoints implementation: 4-6 hours
- Testing: 2 hours
- **Total: ~1 day**

---

**End of Backend Implementation Guide**
