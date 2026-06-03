-- ============================================================================
-- CREATE coaching_session_events TABLE
-- AI Run Coach: Session Coaching Events Tracking
-- ============================================================================
-- This table tracks every coaching cue delivered during a run session,
-- enabling analysis of coaching effectiveness and session replay.
-- ============================================================================

CREATE TABLE IF NOT EXISTS coaching_session_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  run_id varchar NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  planned_workout_id varchar REFERENCES planned_workouts(id),

  event_type text NOT NULL, -- "interval_start", "pace_coaching", "recovery_guidance", etc
  event_phase text, -- "warmup", "interval_2_of_6", "recovery", etc
  coaching_message text,
  coaching_audio_url text,

  user_metrics jsonb, -- Current pace, HR, distance, etc at time of coaching
  tone_used text, -- Actual tone delivered
  user_engagement text, -- "positive", "neutral", "struggled"

  triggered_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now()
);

-- Create index for fast lookups by run_id
CREATE INDEX IF NOT EXISTS idx_coaching_session_events_run_id 
  ON coaching_session_events(run_id);

-- Create index for fast lookups by planned_workout_id
CREATE INDEX IF NOT EXISTS idx_coaching_session_events_workout_id 
  ON coaching_session_events(planned_workout_id);

-- Create index for time-based queries
CREATE INDEX IF NOT EXISTS idx_coaching_session_events_triggered_at 
  ON coaching_session_events(triggered_at);
