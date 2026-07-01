-- Migration: Add observer invitations table for non-registered user invites
-- Date: July 1, 2026
-- Purpose: Support email-based invitations to observe live run sessions

-- Create observer_invitations table
CREATE TABLE observer_invitations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(36) NOT NULL REFERENCES live_run_sessions(id) ON DELETE CASCADE,
  runner_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  status TEXT DEFAULT 'sent',  -- 'sent', 'viewed', 'expired'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  viewed_at TIMESTAMP,
  clicked_at TIMESTAMP
);

-- Create indexes for fast lookups
CREATE INDEX idx_observer_invitations_token ON observer_invitations(token);
CREATE INDEX idx_observer_invitations_email ON observer_invitations(email);
CREATE INDEX idx_observer_invitations_session ON observer_invitations(session_id);
CREATE INDEX idx_observer_invitations_runner ON observer_invitations(runner_id);
CREATE INDEX idx_observer_invitations_expires ON observer_invitations(expires_at);

-- Comment on table
COMMENT ON TABLE observer_invitations IS 'Tracks email-based observer invitations for non-registered users to watch live run sessions';
COMMENT ON COLUMN observer_invitations.token IS 'Unique random token for creating shareable observer links';
COMMENT ON COLUMN observer_invitations.expires_at IS 'Link expires 7 days after creation';
COMMENT ON COLUMN observer_invitations.viewed_at IS 'Timestamp when observer first accessed the link';
COMMENT ON COLUMN observer_invitations.clicked_at IS 'Timestamp when observer clicked "Watch Live Run"';
