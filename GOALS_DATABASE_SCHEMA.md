# Goals Database Schema for Neon.com

This document defines the database schema for the Goals feature in the AI Run Coach app.

## Table: `goals`

### Schema

```sql
CREATE TABLE goals (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- EVENT, DISTANCE_TIME, HEALTH_WELLBEING, CONSISTENCY
    title VARCHAR(255) NOT NULL,
    description TEXT,
    notes TEXT,
    target_date DATE,
    
    -- Event-specific fields
    event_name VARCHAR(255),
    event_location VARCHAR(255),
    
    -- Distance/Time fields
    distance_target VARCHAR(100), -- e.g., "5K", "10K", "Half Marathon", "Marathon", "Ultra Marathon", or custom like "15.5 km"
    time_target_seconds INTEGER, -- Total seconds for time target
    
    -- Health & Wellbeing fields
    health_target VARCHAR(255), -- e.g., "Improve fitness", "Improve endurance", "Lose weight", etc.
    
    -- Consistency fields
    weekly_run_target INTEGER, -- Number of runs per week
    
    -- Progress tracking
    current_progress FLOAT DEFAULT 0.0,
    is_active BOOLEAN DEFAULT TRUE,
    is_completed BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Indexes
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_is_active ON goals(is_active);
CREATE INDEX idx_goals_created_at ON goals(created_at DESC);
```

### Column Descriptions

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | BIGSERIAL | No | Auto-incrementing primary key |
| `user_id` | VARCHAR(255) | No | Foreign key to users table |
| `type` | VARCHAR(50) | No | Goal type: EVENT, DISTANCE_TIME, HEALTH_WELLBEING, or CONSISTENCY |
| `title` | VARCHAR(255) | No | User-defined goal title |
| `description` | TEXT | Yes | Optional goal description |
| `notes` | TEXT | Yes | Optional training notes, motivation, etc. |
| `target_date` | DATE | Yes | Optional target completion date |
| `event_name` | VARCHAR(255) | Yes | Event name (EVENT type only) |
| `event_location` | VARCHAR(255) | Yes | Event location (EVENT type only) |
| `distance_target` | VARCHAR(100) | Yes | Distance target (EVENT and DISTANCE_TIME types) |
| `time_target_seconds` | INTEGER | Yes | Time target in total seconds (EVENT and DISTANCE_TIME types) |
| `health_target` | VARCHAR(255) | Yes | Health/wellbeing target (HEALTH_WELLBEING type only) |
| `weekly_run_target` | INTEGER | Yes | Number of runs per week (CONSISTENCY type only) |
| `current_progress` | FLOAT | No | Current progress (0.0 to 100.0) |
| `is_active` | BOOLEAN | No | Whether the goal is currently active |
| `is_completed` | BOOLEAN | No | Whether the goal has been completed |
| `created_at` | TIMESTAMP | No | Timestamp when goal was created |
| `updated_at` | TIMESTAMP | No | Timestamp when goal was last updated |
| `completed_at` | TIMESTAMP | Yes | Timestamp when goal was completed |

## API Endpoints

### 1. Get User Goals
**Endpoint:** `GET /api/goals/{userId}`

**Response:**
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

### 2. Create Goal
**Endpoint:** `POST /api/goals`

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

**Response:** Same as single goal object from GET endpoint

### 3. Update Goal
**Endpoint:** `PUT /api/goals/{goalId}`

**Request Body:** Same as Create Goal

**Response:** Updated goal object

### 4. Delete Goal
**Endpoint:** `DELETE /api/goals/{goalId}`

**Response:** 204 No Content

## Goal Type Validation

### EVENT
Required fields:
- `title`
- `type` = "EVENT"

Optional fields:
- `eventName`
- `eventLocation`
- `distanceTarget`
- `timeTargetSeconds`
- `targetDate`
- `description`
- `notes`

### DISTANCE_TIME
Required fields:
- `title`
- `type` = "DISTANCE_TIME"

Optional fields:
- `distanceTarget`
- `timeTargetSeconds`
- `targetDate`
- `description`
- `notes`

### HEALTH_WELLBEING
Required fields:
- `title`
- `type` = "HEALTH_WELLBEING"

Optional fields:
- `healthTarget`
- `targetDate`
- `description`
- `notes`

### CONSISTENCY
Required fields:
- `title`
- `type` = "CONSISTENCY"

Optional fields:
- `weeklyRunTarget`
- `targetDate`
- `description`
- `notes`

## Business Logic

### Goal Progress Calculation
The `current_progress` field should be updated based on the goal type:

1. **EVENT/DISTANCE_TIME Goals:**
   - Track completed training runs
   - Calculate progress based on total distance covered or time achieved
   - Example: If target is marathon (42.2km) and user has run 200km in training, progress could be calculated as a percentage

2. **HEALTH_WELLBEING Goals:**
   - Progress is subjective, can be manually updated by user
   - Could integrate with fitness metrics (weight, VO2 max, etc.)

3. **CONSISTENCY Goals:**
   - Calculate weekly run completion percentage
   - Example: If target is 4 runs/week and user completes 3, progress = 75%

### Auto-completion
Goals should be marked as completed (`is_completed = true`, `completed_at = NOW()`) when:
- User manually marks as complete
- Target date is reached and progress >= 100%
- Consistency goal is maintained for target duration

## Migration Script

```sql
-- Run this migration on Neon.com database

-- Step 1: Create the goals table
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

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_is_active ON goals(is_active);
CREATE INDEX IF NOT EXISTS idx_goals_created_at ON goals(created_at DESC);

-- Step 3: Add foreign key constraint (if users table exists)
-- ALTER TABLE goals ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Step 4: Create updated_at trigger (PostgreSQL)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 5: Verify table creation
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'goals'
ORDER BY ordinal_position;
```

## Testing Data

```sql
-- Insert test goals for development
INSERT INTO goals (user_id, type, title, description, distance_target, time_target_seconds, target_date)
VALUES 
('test_user_1', 'EVENT', 'London Marathon 2026', 'First marathon attempt', 'Marathon', 14400, '2026-04-26'),
('test_user_1', 'CONSISTENCY', 'Run 3x per week', 'Build consistent running habit', NULL, NULL, NULL),
('test_user_1', 'HEALTH_WELLBEING', 'Improve fitness', 'Get healthier overall', NULL, NULL, '2026-06-01');

-- Verify insertion
SELECT * FROM goals WHERE user_id = 'test_user_1';
```

## Notes for Backend Team

1. **Date Format:** All dates should be in ISO 8601 format (YYYY-MM-DD) in API responses
2. **Timestamps:** Use UTC timestamps in ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)
3. **Null Handling:** Type-specific fields that don't apply to a goal type should be null
4. **Validation:** Validate that required fields for each goal type are present
5. **User Authentication:** Ensure users can only access/modify their own goals
6. **Error Handling:** Return appropriate HTTP status codes:
   - 200: Success
   - 201: Created
   - 204: No Content (delete)
   - 400: Bad Request (validation error)
   - 401: Unauthorized
   - 404: Not Found
   - 500: Server Error

## Security Considerations

1. Always validate `user_id` from authenticated session, never trust client-provided `user_id`
2. Implement rate limiting on goal creation (max 10 goals per user recommended)
3. Sanitize all text inputs to prevent SQL injection
4. Use prepared statements for all database queries
5. Implement proper CORS headers for API endpoints

## Performance Recommendations

1. Index on `user_id` for fast user goal lookups
2. Index on `is_active` for filtering active goals
3. Consider archiving completed goals older than 1 year to separate table
4. Implement pagination for users with many goals (limit 20 per page)
5. Cache frequently accessed goals in Redis/memory cache
