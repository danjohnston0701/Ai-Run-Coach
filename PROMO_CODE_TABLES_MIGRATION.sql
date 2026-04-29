-- ============================================================================
-- Promo Code System Migration
-- Creates tables for promotional code redemption and unlimited feature grants
-- ============================================================================

-- 1. Create coupon_codes table
CREATE TABLE IF NOT EXISTS coupon_codes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL, -- 'unlimited_all', 'unlimited_plans', 'unlimited_routes', 'unlimited_analyses'
  value INTEGER,
  duration_days INTEGER DEFAULT 30,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create user_coupons table (tracks which users have redeemed which codes)
CREATE TABLE IF NOT EXISTS user_coupons (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coupon_id VARCHAR NOT NULL REFERENCES coupon_codes(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coupon_codes_code ON coupon_codes(code);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_is_active ON coupon_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user_id ON user_coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user_expires ON user_coupons(user_id, expires_at);

-- 4. Add comments for documentation
COMMENT ON TABLE coupon_codes IS 'Promotional codes that grant unlimited access to features';
COMMENT ON COLUMN coupon_codes.type IS 'Type of unlimited access: unlimited_all, unlimited_plans, unlimited_routes, unlimited_analyses';
COMMENT ON COLUMN coupon_codes.duration_days IS 'How many days of access each redemption grants (default: 30)';
COMMENT ON COLUMN coupon_codes.max_uses IS 'Maximum total uses; NULL = unlimited';
COMMENT ON COLUMN coupon_codes.current_uses IS 'Current redemption count';
COMMENT ON COLUMN coupon_codes.expires_at IS 'When the code itself expires (not the user grants)';

COMMENT ON TABLE user_coupons IS 'Tracks which users have redeemed which promotional codes';
COMMENT ON COLUMN user_coupons.expires_at IS 'When this user''s access grant expires (calculated as redeemed_at + duration_days)';

-- 5. Verification queries
SELECT 'Coupon Codes Table' as verification, COUNT(*) as row_count FROM coupon_codes;
SELECT 'User Coupons Table' as verification, COUNT(*) as row_count FROM user_coupons;
SELECT 'Coupon Code Indexes' as verification, COUNT(*) as index_count FROM pg_indexes WHERE tablename = 'coupon_codes';
SELECT 'User Coupon Indexes' as verification, COUNT(*) as index_count FROM pg_indexes WHERE tablename = 'user_coupons';
