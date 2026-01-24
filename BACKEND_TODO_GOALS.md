# Backend TODO: Goals Feature Implementation

## Overview
The Android app has been fully updated to support the Goals feature. The mobile team is ready to test as soon as the backend API endpoints are implemented.

## What's Already Done (Mobile App)
✅ Complete UI for creating goals with 4 different goal types  
✅ GoalsViewModel for managing state and API calls  
✅ API service interfaces defined  
✅ Goals display screen with real-time updates  
✅ Full error handling and loading states  

## What Backend Needs to Do

### Step 1: Database Setup
Run the migration script on your Neon.com PostgreSQL database.

**Location:** See `GOALS_DATABASE_SCHEMA.md` - Section "Migration Script"

**Quick commands:**
```sql
-- 1. Create the table
CREATE TABLE IF NOT EXISTS goals (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    notes TEXT,
    target_date DATE,
    event_name VARCHAR(255),
    event_location VARCHAR(255),
    distance_target VARCHAR(100),
    time_target_seconds INTEGER,
    health_target VARCHAR(255),
    weekly_run_target INTEGER,
    current_progress FLOAT DEFAULT 0.0,
    is_active BOOLEAN DEFAULT TRUE,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_is_active ON goals(is_active);
CREATE INDEX IF NOT EXISTS idx_goals_created_at ON goals(created_at DESC);

-- 3. Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Step 2: Implement API Endpoints

#### 1. GET /api/goals/{userId}
**Status:** May already exist, needs verification/update

**Response Format:**
```json
[
  {
    "id": 1,
    "userId": "user123",
    "type": "EVENT",
    "title": "Run my first marathon",
    "description": "Training for the London Marathon",
    "notes": "Focus on endurance building",
    "targetDate": "2026-04-26",
    "eventName": "London Marathon 2026",
    "eventLocation": "London, UK",
    "distanceTarget": "Marathon",
    "timeTargetSeconds": 14400,
    "healthTarget": null,
    "weeklyRunTarget": null,
    "currentProgress": 25.5,
    "isActive": true,
    "isCompleted": false,
    "createdAt": "2026-01-24T10:30:00Z",
    "updatedAt": "2026-01-24T10:30:00Z",
    "completedAt": null
  }
]
```

**Notes:**
- Return empty array `[]` if user has no goals
- Filter by `user_id` (get from authenticated session, NOT from request params)
- Use camelCase in JSON (snake_case in database is fine, just map it)

#### 2. POST /api/goals
**Status:** NEW - Needs implementation

**Request Body:**
```json
{
  "userId": "user123",
  "type": "EVENT",
  "title": "Run my first marathon",
  "description": "Training for the London Marathon",
  "notes": "Focus on endurance building",
  "targetDate": "2026-04-26",
  "eventName": "London Marathon 2026",
  "eventLocation": "London, UK",
  "distanceTarget": "Marathon",
  "timeTargetSeconds": 14400,
  "healthTarget": null,
  "weeklyRunTarget": null
}
```

**Response:** Created goal object (same format as GET)

**Validation Required:**
- `type` must be one of: EVENT, DISTANCE_TIME, HEALTH_WELLBEING, CONSISTENCY
- `title` is required (max 255 chars)
- `userId` must match authenticated user
- Validate type-specific fields (see GOALS_DATABASE_SCHEMA.md)

**HTTP Status Codes:**
- 201 Created - Success
- 400 Bad Request - Validation error
- 401 Unauthorized - User not authenticated
- 500 Internal Server Error - Database error

#### 3. PUT /api/goals/{goalId}
**Status:** NEW - Needs implementation

**Request Body:** Same as POST

**Response:** Updated goal object

**Validation:**
- Ensure goal belongs to authenticated user
- Same validation as POST

**HTTP Status Codes:**
- 200 OK - Success
- 400 Bad Request - Validation error
- 401 Unauthorized - User not authenticated
- 404 Not Found - Goal doesn't exist or doesn't belong to user
- 500 Internal Server Error - Database error

#### 4. DELETE /api/goals/{goalId}
**Status:** NEW - Needs implementation

**Response:** 204 No Content (empty response)

**Validation:**
- Ensure goal belongs to authenticated user

**HTTP Status Codes:**
- 204 No Content - Success
- 401 Unauthorized - User not authenticated
- 404 Not Found - Goal doesn't exist or doesn't belong to user
- 500 Internal Server Error - Database error

### Step 3: Security Checklist
- [ ] Always get `user_id` from authenticated session, never trust client
- [ ] Validate that users can only access/modify their own goals
- [ ] Use prepared statements to prevent SQL injection
- [ ] Sanitize all text inputs
- [ ] Implement rate limiting (recommended: max 10 goals per user)
- [ ] Add CORS headers for API endpoints

### Step 4: Testing

**Test with curl/Postman:**

```bash
# Get goals
curl -X GET https://airuncoach.live/api/goals/user123 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create goal
curl -X POST https://airuncoach.live/api/goals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "userId": "user123",
    "type": "CONSISTENCY",
    "title": "Run 3x per week",
    "weeklyRunTarget": 3
  }'

# Update goal
curl -X PUT https://airuncoach.live/api/goals/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "userId": "user123",
    "type": "CONSISTENCY",
    "title": "Run 4x per week",
    "weeklyRunTarget": 4
  }'

# Delete goal
curl -X DELETE https://airuncoach.live/api/goals/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 5: Notify Mobile Team
Once all endpoints are implemented and tested:
1. Confirm endpoints are live on `https://airuncoach.live`
2. Provide test user credentials (if needed)
3. Share any API behavior differences from the spec
4. Mobile team will test end-to-end with the Android app

## Expected Timeline
- Database setup: 30 minutes
- API implementation: 2-4 hours
- Testing: 1 hour
- **Total: ~4-5 hours**

## Questions?
Refer to `GOALS_DATABASE_SCHEMA.md` for complete technical specifications.

## Sample Data for Testing
```sql
-- Insert test goals
INSERT INTO goals (user_id, type, title, description, distance_target, time_target_seconds, target_date)
VALUES 
('test_user_1', 'EVENT', 'London Marathon 2026', 'First marathon attempt', 'Marathon', 14400, '2026-04-26'),
('test_user_1', 'CONSISTENCY', 'Run 3x per week', 'Build consistent running habit', NULL, NULL, NULL),
('test_user_1', 'HEALTH_WELLBEING', 'Improve fitness', 'Get healthier overall', NULL, NULL, '2026-06-01');

-- Verify
SELECT * FROM goals WHERE user_id = 'test_user_1';
```

## Common Pitfalls to Avoid
1. ❌ Don't trust `userId` from request body - always use authenticated session
2. ❌ Don't return 500 errors for validation issues - use 400
3. ❌ Don't allow cross-user goal access - always filter by authenticated user
4. ❌ Don't forget to handle null values for optional fields
5. ❌ Don't use snake_case in JSON responses - use camelCase
6. ✅ DO validate goal type matches the provided fields
7. ✅ DO return meaningful error messages in responses
8. ✅ DO use transactions when appropriate
9. ✅ DO test with multiple users to ensure data isolation

## Mobile App is Ready! 📱
The mobile app is 100% ready to use these endpoints. Once you deploy:
- Users can create goals from the app
- Goals are saved to Neon.com database
- Goals persist across sessions and devices
- Users can view all their goals in a beautiful list
- Full error handling is implemented
