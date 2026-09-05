-- Cross-instance shared state for the in-run coaching cooldown manager
-- (server/coaching-cooldown.ts). Replaces the old in-memory Map, which broke
-- silently under Replit's autoscale deployment (multiple server instances,
-- each with its own separate memory) — confirmed 2026-09-05: coaching cues
-- fired as close as 18-23s apart despite the intended 90s/45s cooldown rule.

CREATE TABLE IF NOT EXISTS coaching_cooldown_state (
  user_id VARCHAR PRIMARY KEY REFERENCES users(id),
  last_non_milestone_at TIMESTAMP,
  last_milestone_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
