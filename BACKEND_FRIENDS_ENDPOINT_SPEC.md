# Backend Friends Endpoint Implementation Guide

**Date:** January 26, 2026  
**Status:** ⚠️ REQUIRED - Currently returning HTTP 500 error  
**Priority:** HIGH

---

## 🚨 Current Issue

The Android app is calling `GET /api/friends/{userId}` but the backend is returning:
```
HTTP 500 Internal Server Error
```

This endpoint needs to be implemented on the backend server.

---

## 📋 Required Endpoint

### **GET /api/friends/{userId}**

**Purpose:** Retrieve the list of friends for a specific user

**Request:**
```http
GET /api/friends/user_123456 HTTP/1.1
Host: your-backend.com
Authorization: Bearer {jwt_token}
```

**Path Parameters:**
- `userId` (string, required): The ID of the user whose friends to retrieve

**Response (Success - 200 OK):**
```json
[
  {
    "id": "friend_user_id_1",
    "name": "John Doe",
    "email": "john@example.com",
    "profilePic": "https://storage.example.com/users/friend_user_id_1/profile.jpg",
    "fitnessLevel": "Intermediate",
    "distanceScale": "Kilometers"
  },
  {
    "id": "friend_user_id_2",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "profilePic": null,
    "fitnessLevel": "Advanced",
    "distanceScale": "Miles"
  }
]
```

**Response (Empty - 200 OK):**
```json
[]
```

**Response (Error - 404 Not Found):**
```json
{
  "error": "User not found",
  "userId": "user_123456"
}
```

**Response (Error - 401 Unauthorized):**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

---

## 💾 Database Query

The backend should:

1. **Validate the user exists**
2. **Query the friendships table**
3. **Join with users table to get friend details**

### SQL Query Example:

```sql
-- Get all friends for a user (bidirectional friendships)
SELECT 
    u.id,
    u.name,
    u.email,
    u.profile_pic AS "profilePic",
    u.fitness_level AS "fitnessLevel",
    u.distance_scale AS "distanceScale"
FROM friendships f
INNER JOIN users u ON u.id = f.friend_id
WHERE f.user_id = $1
  AND f.status = 'accepted'
ORDER BY u.name ASC;
```

**Parameters:**
- `$1` = `userId` from the path parameter

---

## 🔐 Authentication & Authorization

### Required Checks:

1. **Validate JWT Token**
   - Extract token from `Authorization: Bearer {token}` header
   - Verify token signature and expiration
   - Get authenticated user's ID from token

2. **Authorization Logic**
   - Allow users to view their own friends list
   - Optionally: Allow viewing public friend lists of other users
   - Return 401 if token is invalid
   - Return 403 if user tries to access another user's private friends list

### Example Authorization Code (Node.js/Express):

```javascript
// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Friends endpoint
app.get('/api/friends/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Optional: Check if authenticated user can view this user's friends
    // if (req.user.id !== userId) {
    //   return res.status(403).json({ error: 'Forbidden' });
    // }
    
    const friends = await db.query(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.profile_pic AS "profilePic",
        u.fitness_level AS "fitnessLevel",
        u.distance_scale AS "distanceScale"
      FROM friendships f
      INNER JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = $1
        AND f.status = 'accepted'
      ORDER BY u.name ASC
    `, [userId]);
    
    res.json(friends.rows);
    
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});
```

---

## 📊 Database Schema Requirements

Ensure the `friendships` table exists in Neon PostgreSQL:

```sql
-- Friendships table (should already exist from previous setup)
CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, friend_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);
```

---

## 🧪 Testing the Endpoint

### Using cURL:

```bash
# Get friends for a user
curl -X GET "http://localhost:5000/api/friends/user_123456" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### Expected Responses:

**Success (with friends):**
```json
[
  {
    "id": "friend_1",
    "name": "John Doe",
    "email": "john@example.com",
    "profilePic": "https://...",
    "fitnessLevel": "Intermediate",
    "distanceScale": "Kilometers"
  }
]
```

**Success (no friends):**
```json
[]
```

**Error (401):**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

---

## 🔄 Related Endpoints (Also Needed)

These endpoints should also be implemented for full Friends functionality:

### 1. **Add Friend**
```http
POST /api/friends/{userId}/add
Content-Type: application/json

{
  "friendId": "user_to_add_as_friend"
}

Response: 201 Created
{
  "id": "friend_user_id",
  "name": "Friend Name",
  "email": "friend@example.com",
  ...
}
```

### 2. **Remove Friend**
```http
DELETE /api/friends/{userId}/{friendId}

Response: 204 No Content
```

### 3. **Search Users (for finding friends)**
```http
GET /api/users/search?query=john

Response: 200 OK
[
  {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "profilePic": "...",
    ...
  }
]
```

---

## ✅ Checklist for Backend Developer

- [ ] Create `GET /api/friends/{userId}` endpoint
- [ ] Add JWT authentication middleware
- [ ] Query `friendships` table with JOIN to `users` table
- [ ] Return array of Friend objects with correct field names
- [ ] Handle empty friends list (return empty array `[]`)
- [ ] Add proper error handling (404, 401, 500)
- [ ] Test with cURL or Postman
- [ ] Verify with Android app
- [ ] Add logging for debugging
- [ ] Document any additional fields returned

---

## 🐛 Debugging Tips

If the endpoint returns 500 error, check:

1. **Database Connection**
   - Is Neon PostgreSQL connection working?
   - Are connection strings correct in environment variables?

2. **Table Structure**
   - Does the `friendships` table exist?
   - Does the `users` table have all required columns?

3. **SQL Query**
   - Are field names correct (snake_case vs camelCase)?
   - Is the JOIN syntax correct?
   - Are there any NULL values causing issues?

4. **Backend Logs**
   - Check server logs for detailed error messages
   - Look for SQL errors or connection timeouts

5. **Authentication**
   - Is the JWT token being parsed correctly?
   - Is the user ID being extracted from the token?

---

## 📞 Contact

If you encounter issues implementing this endpoint, check:
- `BACKEND_TODO_PROFILE_FRIENDS_GROUPS.md` - Detailed backend requirements
- `CLIENT_SERVER_ARCHITECTURE.md` - Architecture overview

---

**End of Friends Endpoint Specification**
