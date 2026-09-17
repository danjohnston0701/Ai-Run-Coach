-- Google Play subscription lifecycle (2026-09-18)
-- Purchase-token → user mapping for Google Play subscriptions, the Play analogue of
-- apple_transactions. Written by POST /api/subscriptions/verify-purchase, the RTDN
-- endpoint (POST /api/google/play-notifications) and the hourly reconcile in
-- server/google-play-billing.ts.
--
-- Also created idempotently by server/auto-migrate.ts on every server start, so this
-- file is the canonical record rather than a required manual step.

CREATE TABLE IF NOT EXISTS google_play_transactions (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_token        TEXT NOT NULL UNIQUE,
  product_id            VARCHAR NOT NULL,
  package_name          VARCHAR NOT NULL DEFAULT 'live.airuncoach.airuncoach',
  linked_purchase_token TEXT,
  expiry_time           TIMESTAMP,
  auto_renewing         BOOLEAN DEFAULT FALSE,
  subscription_state    VARCHAR,      -- SubscriptionPurchaseV2.subscriptionState, e.g. SUBSCRIPTION_STATE_ACTIVE
  last_checked_at       TIMESTAMP,    -- last time the Play Developer API was consulted for this token
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_play_transactions_user   ON google_play_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_google_play_transactions_expiry ON google_play_transactions(expiry_time);
