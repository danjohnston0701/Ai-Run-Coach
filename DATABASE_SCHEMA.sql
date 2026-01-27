-- =====================================================
-- AI RUN COACH - COMPLETE DATABASE SCHEMA
-- Database: Neon.com (PostgreSQL)
-- =====================================================

-- =====================================================
-- 1. FITNESS & FRESHNESS TABLES
-- =====================================================

-- Daily fitness metrics (CTL, ATL, TSB)
CREATE TABLE IF NOT EXISTS daily_fitness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    ctl FLOAT NOT NULL,                    -- Chronic Training Load (Fitness)
    atl FLOAT NOT NULL,                    -- Acute Training Load (Fatigue)
    tsb FLOAT NOT NULL,                    -- Training Stress Balance (Form)
    training_load INT DEFAULT 0,           -- TSS for this day
    ramp_rate FLOAT DEFAULT 0,             -- Training load increase rate
    training_status VARCHAR(50),           -- OVERTRAINED, STRAINED, OPTIMAL, FRESH, DETRAINING
    injury_risk VARCHAR(50),               -- LOW, MODERATE, HIGH, CRITICAL
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_daily_fitness_user_date ON daily_fitness(user_id, date DESC);
CREATE INDEX idx_daily_fitness_date ON daily_fitness(date);

-- Pre-computed fitness summaries for performance
CREATE TABLE IF NOT EXISTS fitness_summary (
    user_id VARCHAR(255) PRIMARY KEY,
    current_ctl FLOAT DEFAULT 0,
    current_atl FLOAT DEFAULT 0,
    current_tsb FLOAT DEFAULT 0,
    current_status VARCHAR(50),
    injury_risk VARCHAR(50),
    last_calculated TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- 2. SEGMENTS & LEADERBOARDS
-- =====================================================

-- Segment definitions (route sections for competition)
CREATE TABLE IF NOT EXISTS segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    distance FLOAT NOT NULL,               -- meters
    elevation_gain FLOAT DEFAULT 0,        -- meters
    elevation_loss FLOAT DEFAULT 0,        -- meters
    average_grade FLOAT DEFAULT 0,         -- percentage
    max_grade FLOAT DEFAULT 0,             -- percentage
    category VARCHAR(50),                  -- CLIMB, SPRINT, FLAT, DESCENT, MIXED
    
    -- Geographic bounds
    start_lat DOUBLE PRECISION NOT NULL,
    start_lng DOUBLE PRECISION NOT NULL,
    end_lat DOUBLE PRECISION NOT NULL,
    end_lng DOUBLE PRECISION NOT NULL,
    
    -- Full route as JSON array of coordinates
    route_points JSONB NOT NULL,
    
    -- Metadata
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    total_attempts INT DEFAULT 0,
    is_public BOOLEAN DEFAULT true,
    is_hazardous BOOLEAN DEFAULT false,
    hazards TEXT[],                        -- ["Traffic lights", "Intersection"]
    
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Geolocation indexes (using standard PostgreSQL, no PostGIS required)
CREATE INDEX idx_segments_start_lat ON segments(start_lat);
CREATE INDEX idx_segments_start_lng ON segments(start_lng);
CREATE INDEX idx_segments_bounds ON segments(start_lat, start_lng, end_lat, end_lng);
CREATE INDEX idx_segments_category ON segments(category);
CREATE INDEX idx_segments_created ON segments(created_at DESC);

-- Segment efforts (user attempts)
CREATE TABLE IF NOT EXISTS segment_efforts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    run_id UUID NOT NULL,
    
    -- Performance metrics
    elapsed_time BIGINT NOT NULL,          -- milliseconds
    moving_time BIGINT NOT NULL,           -- milliseconds (excluding stops)
    average_hr INT,
    max_hr INT,
    average_cadence INT,
    average_power INT,                     -- Watts (if power meter available)
    calories INT,
    
    -- Rankings
    is_pr BOOLEAN DEFAULT false,           -- Personal Record
    is_kom BOOLEAN DEFAULT false,          -- King/Queen of Mountain
    leaderboard_rank INT,
    percentile_rank FLOAT,                 -- 0.0 to 100.0
    
    -- Timestamp
    start_time TIMESTAMP NOT NULL,
    completed_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_segment_efforts_segment ON segment_efforts(segment_id, elapsed_time);
CREATE INDEX idx_segment_efforts_user ON segment_efforts(user_id, segment_id);
CREATE INDEX idx_segment_efforts_run ON segment_efforts(run_id);
CREATE INDEX idx_segment_efforts_leaderboard ON segment_efforts(segment_id, leaderboard_rank);

-- Segment stars/favorites
CREATE TABLE IF NOT EXISTS segment_stars (
    user_id VARCHAR(255) NOT NULL,
    segment_id UUID NOT NULL,
    starred_at TIMESTAMP DEFAULT NOW(),
    
    PRIMARY KEY (user_id, segment_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE
);

-- =====================================================
-- 3. TRAINING PLANS & WORKOUTS
-- =====================================================

-- Training plan templates
CREATE TABLE IF NOT EXISTS training_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    goal_type VARCHAR(50) NOT NULL,        -- DISTANCE_5K, DISTANCE_10K, etc.
    difficulty VARCHAR(50) NOT NULL,       -- BEGINNER, INTERMEDIATE, ADVANCED, ELITE
    duration_weeks INT NOT NULL,
    workouts_per_week INT DEFAULT 4,
    peak_week INT,                         -- Which week has highest volume
    taper_weeks INT DEFAULT 2,
    
    -- Target metrics
    target_distance FLOAT,                 -- meters
    target_time BIGINT,                    -- milliseconds
    target_pace VARCHAR(20),               -- "5:00" format
    
    -- Metadata
    created_by VARCHAR(255),               -- "AI" or user_id if custom
    is_template BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_training_plans_goal ON training_plans(goal_type, difficulty);

-- User plan enrollments
CREATE TABLE IF NOT EXISTS plan_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    plan_id UUID NOT NULL,
    
    -- Dates
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    race_date DATE,
    
    -- Progress
    completed_workouts INT DEFAULT 0,
    total_workouts INT NOT NULL,
    completion_rate FLOAT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    
    enrolled_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES training_plans(id) ON DELETE CASCADE
);

CREATE INDEX idx_plan_enrollments_user ON plan_enrollments(user_id, is_active);

-- Weekly plan structure
CREATE TABLE IF NOT EXISTS weekly_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL,
    week_number INT NOT NULL,
    theme VARCHAR(255),                    -- "Base Building", "Speed Work", "Taper"
    total_distance FLOAT DEFAULT 0,
    total_duration BIGINT DEFAULT 0,
    is_recovery_week BOOLEAN DEFAULT false,
    
    FOREIGN KEY (plan_id) REFERENCES training_plans(id) ON DELETE CASCADE,
    UNIQUE(plan_id, week_number)
);

-- Individual workouts
CREATE TABLE IF NOT EXISTS planned_workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL,
    week_number INT NOT NULL,
    day_of_week INT NOT NULL,              -- 1-7 (Monday-Sunday)
    
    -- Workout details
    type VARCHAR(50) NOT NULL,             -- EASY_RUN, TEMPO_RUN, INTERVALS, etc.
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Targets
    target_distance FLOAT,                 -- meters
    target_duration BIGINT,                -- milliseconds
    target_pace VARCHAR(20),
    intensity VARCHAR(50),                 -- VERY_EASY, EASY, MODERATE, HARD, etc.
    
    -- Intervals (stored as JSON)
    intervals JSONB,
    warmup JSONB,
    cooldown JSONB,
    
    FOREIGN KEY (plan_id) REFERENCES training_plans(id) ON DELETE CASCADE
);

CREATE INDEX idx_planned_workouts_plan ON planned_workouts(plan_id, week_number, day_of_week);

-- Workout completions
CREATE TABLE IF NOT EXISTS workout_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL,
    workout_id UUID NOT NULL,
    run_id UUID,                           -- Actual run that completed this workout
    
    -- Completion analysis
    completed_at TIMESTAMP DEFAULT NOW(),
    execution_score FLOAT,                 -- 0-100
    pace_accuracy FLOAT,
    duration_accuracy FLOAT,
    notes TEXT,
    
    FOREIGN KEY (enrollment_id) REFERENCES plan_enrollments(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_id) REFERENCES planned_workouts(id),
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

-- Plan adaptations (AI adjustments)
CREATE TABLE IF NOT EXISTS plan_adaptations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL,
    workout_id UUID,
    
    date DATE NOT NULL,
    reason TEXT NOT NULL,
    change_description TEXT NOT NULL,
    applied BOOLEAN DEFAULT false,
    applied_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (enrollment_id) REFERENCES plan_enrollments(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_id) REFERENCES planned_workouts(id)
);

-- =====================================================
-- 4. SOCIAL FEED & ACTIVITIES
-- =====================================================

-- Feed activities
CREATE TABLE IF NOT EXISTS feed_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    activity_type VARCHAR(50) NOT NULL,    -- COMPLETED_RUN, ACHIEVED_PR, etc.
    
    -- References
    run_id UUID,
    achievement_id UUID,
    segment_id UUID,
    
    -- Content
    comment TEXT,
    media_urls TEXT[],
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    is_public BOOLEAN DEFAULT true,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_feed_activities_created ON feed_activities(created_at DESC);
CREATE INDEX idx_feed_activities_user ON feed_activities(user_id, created_at DESC);

-- Reactions (kudos, etc.)
CREATE TABLE IF NOT EXISTS reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    reaction_type VARCHAR(50) NOT NULL,    -- KUDOS, FIRE, STRONG, INSPIRING, SUPPORTIVE
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(activity_id, user_id),         -- One reaction per user per activity
    FOREIGN KEY (activity_id) REFERENCES feed_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_reactions_activity ON reactions(activity_id);
CREATE INDEX idx_reactions_user ON reactions(user_id);

-- Comments
CREATE TABLE IF NOT EXISTS activity_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (activity_id) REFERENCES feed_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_activity ON activity_comments(activity_id, created_at);

-- Comment likes
CREATE TABLE IF NOT EXISTS comment_likes (
    comment_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    PRIMARY KEY (comment_id, user_id),
    FOREIGN KEY (comment_id) REFERENCES activity_comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- 5. CLUBS
-- =====================================================

CREATE TABLE IF NOT EXISTS clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cover_photo VARCHAR(500),
    location VARCHAR(255),
    weekly_goal FLOAT,                     -- km
    is_private BOOLEAN DEFAULT false,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_clubs_name ON clubs(name);
CREATE INDEX idx_clubs_location ON clubs(location);

-- Club memberships
CREATE TABLE IF NOT EXISTS club_memberships (
    club_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',     -- admin, moderator, member
    joined_at TIMESTAMP DEFAULT NOW(),
    
    PRIMARY KEY (club_id, user_id),
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_club_memberships_user ON club_memberships(user_id);

-- =====================================================
-- 6. CHALLENGES
-- =====================================================

CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cover_image VARCHAR(500),
    
    -- Dates
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Goal
    goal_type VARCHAR(50) NOT NULL,        -- TOTAL_DISTANCE, TOTAL_ELEVATION, etc.
    goal_target FLOAT NOT NULL,
    goal_unit VARCHAR(20) NOT NULL,        -- km, m, runs
    
    -- Metadata
    prize TEXT,
    is_public BOOLEAN DEFAULT true,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_challenges_dates ON challenges(start_date, end_date);

-- Challenge participants
CREATE TABLE IF NOT EXISTS challenge_participants (
    challenge_id UUID NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    
    -- Progress
    current_progress FLOAT DEFAULT 0,
    rank INT,
    joined_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    
    PRIMARY KEY (challenge_id, user_id),
    FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_challenge_participants_rank ON challenge_participants(challenge_id, rank);

-- =====================================================
-- 7. ACHIEVEMENTS & BADGES
-- =====================================================

CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,             -- FIRST_5K, CENTURY_CLUB, etc.
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    criteria JSONB NOT NULL,               -- Requirements to earn
    rarity VARCHAR(50),                    -- COMMON, UNCOMMON, RARE, EPIC, LEGENDARY
    
    UNIQUE(type)
);

-- User achievements
CREATE TABLE IF NOT EXISTS user_achievements (
    user_id VARCHAR(255) NOT NULL,
    achievement_id UUID NOT NULL,
    earned_at TIMESTAMP DEFAULT NOW(),
    run_id UUID,                           -- Run that earned it (if applicable)
    
    PRIMARY KEY (user_id, achievement_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id),
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE INDEX idx_user_achievements_earned ON user_achievements(earned_at DESC);

-- =====================================================
-- 8. NOTIFICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,             -- NEW_KUDOS, NEW_COMMENT, etc.
    
    -- Content
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url VARCHAR(500),
    
    -- Related user (who triggered notification)
    from_user_id VARCHAR(255),
    
    -- Status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- =====================================================
-- 9. EXISTING TABLES - UPDATES NEEDED
-- =====================================================

-- Update runs table to include TSS and GAP
ALTER TABLE runs ADD COLUMN IF NOT EXISTS tss INT DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS gap VARCHAR(20);  -- Grade Adjusted Pace
ALTER TABLE runs ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS kudos_count INT DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0;

-- Add index for public runs feed
CREATE INDEX IF NOT EXISTS idx_runs_public ON runs(user_id, is_public, start_time DESC);

-- =====================================================
-- 10. HELPER VIEWS FOR COMMON QUERIES
-- =====================================================

-- View: Current fitness for all users
CREATE OR REPLACE VIEW current_fitness_view AS
SELECT 
    df.user_id,
    df.ctl as fitness,
    df.atl as fatigue,
    df.tsb as form,
    df.training_status,
    df.injury_risk,
    df.date
FROM daily_fitness df
INNER JOIN (
    SELECT user_id, MAX(date) as max_date
    FROM daily_fitness
    GROUP BY user_id
) latest ON df.user_id = latest.user_id AND df.date = latest.max_date;

-- View: Segment leaderboards
CREATE OR REPLACE VIEW segment_leaderboard_view AS
SELECT 
    se.segment_id,
    se.user_id,
    u.name as user_name,
    u.profile_pic as user_photo,
    se.elapsed_time,
    se.is_pr,
    se.is_kom,
    se.leaderboard_rank,
    se.completed_at,
    ROW_NUMBER() OVER (PARTITION BY se.segment_id ORDER BY se.elapsed_time) as rank
FROM segment_efforts se
JOIN users u ON se.user_id = u.id
WHERE se.elapsed_time > 0;

-- View: User activity feed
CREATE OR REPLACE VIEW activity_feed_view AS
SELECT 
    fa.id,
    fa.user_id,
    u.name as user_name,
    u.profile_pic as user_photo,
    fa.activity_type,
    fa.run_id,
    fa.comment,
    fa.created_at,
    (SELECT COUNT(*) FROM reactions WHERE activity_id = fa.id) as reaction_count,
    (SELECT COUNT(*) FROM activity_comments WHERE activity_id = fa.id) as comment_count
FROM feed_activities fa
JOIN users u ON fa.user_id = u.id
WHERE fa.is_public = true
ORDER BY fa.created_at DESC;

-- =====================================================
-- 11. FUNCTIONS FOR COMPLEX CALCULATIONS
-- =====================================================

-- Function: Calculate segment rank after new effort
CREATE OR REPLACE FUNCTION update_segment_ranks(p_segment_id UUID)
RETURNS void AS $$
BEGIN
    -- Update ranks for all efforts on this segment
    WITH ranked_efforts AS (
        SELECT 
            id,
            ROW_NUMBER() OVER (ORDER BY elapsed_time) as new_rank,
            PERCENT_RANK() OVER (ORDER BY elapsed_time DESC) * 100 as percentile
        FROM segment_efforts
        WHERE segment_id = p_segment_id
    )
    UPDATE segment_efforts se
    SET 
        leaderboard_rank = re.new_rank,
        percentile_rank = re.percentile,
        is_kom = (re.new_rank = 1)
    FROM ranked_efforts re
    WHERE se.id = re.id;
END;
$$ LANGUAGE plpgsql;

-- Function: Update challenge progress after run
CREATE OR REPLACE FUNCTION update_challenge_progress(p_user_id VARCHAR, p_run_id UUID)
RETURNS void AS $$
BEGIN
    -- Update all active challenges this user is in
    -- (Implementation depends on challenge types)
    -- This is a placeholder - actual logic would be more complex
    NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 12. SAMPLE DATA FOR ACHIEVEMENTS
-- =====================================================

INSERT INTO achievements (type, name, description, icon_url, criteria, rarity) VALUES
('FIRST_5K', 'First 5K', 'Complete your first 5km run', '/icons/first_5k.png', '{"distance": 5000}', 'COMMON'),
('FIRST_10K', 'First 10K', 'Complete your first 10km run', '/icons/first_10k.png', '{"distance": 10000}', 'COMMON'),
('FIRST_HALF_MARATHON', 'First Half Marathon', 'Complete your first 21.1km run', '/icons/first_half.png', '{"distance": 21097}', 'UNCOMMON'),
('FIRST_MARATHON', 'First Marathon', 'Complete your first 42.2km run', '/icons/first_marathon.png', '{"distance": 42195}', 'RARE'),
('CENTURY_CLUB', 'Century Club', 'Run 100km in a single month', '/icons/century.png', '{"monthly_distance": 100000}', 'EPIC'),
('CONSISTENCY_KING', '30 Day Streak', 'Run for 30 consecutive days', '/icons/streak.png', '{"consecutive_days": 30}', 'RARE'),
('SPEED_DEMON', 'Speed Demon', 'Run a sub-4 minute kilometer', '/icons/speed.png', '{"min_pace_seconds": 240}', 'EPIC'),
('HILL_CLIMBER', 'Hill Climber', 'Climb 1000m elevation in one run', '/icons/hill.png', '{"elevation_gain": 1000}', 'EPIC'),
('EARLY_BIRD', 'Early Bird', 'Complete 10 runs before 6am', '/icons/early.png', '{"early_runs": 10}', 'UNCOMMON'),
('NIGHT_OWL', 'Night Owl', 'Complete 10 runs after 9pm', '/icons/night.png', '{"night_runs": 10}', 'UNCOMMON'),
('WEATHER_WARRIOR', 'Weather Warrior', 'Run in rain, snow, or extreme heat', '/icons/weather.png', '{"weather_conditions": ["rain", "snow", "heat"]}', 'RARE'),
('EXPLORER', 'Explorer', 'Run 50 unique routes', '/icons/explorer.png', '{"unique_routes": 50}', 'EPIC')
ON CONFLICT (type) DO NOTHING;

-- =====================================================
-- DONE! Database schema is ready.
-- =====================================================

-- IMPORTANT: Don't forget to update your existing runs table
-- to track TSS and other new metrics going forward!
