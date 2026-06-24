-- ============================================================================
-- PROMO CODE SYSTEM SETUP
-- Complete SQL to set up FOUNDER_1YR promo code for admin/founder access
-- ============================================================================

-- Step 1: Create the FOUNDER_1YR promo code (unlimited all features for 1 year)
INSERT INTO coupon_codes (
    code, 
    type, 
    duration_days, 
    max_uses, 
    is_active, 
    created_at,
    expires_at
) VALUES (
    'FOUNDER_1YR',
    'unlimited_all',      -- Grants unlimited: trainingPlans, routes, analyses, coaching
    365,                  -- Valid for 365 days
    100,                  -- Allow up to 100 redemptions
    true,                 -- Active immediately
    NOW(),
    DATE_ADD(NOW(), INTERVAL 1 YEAR)
);

-- Verify the code was created (get the ID)
SELECT id, code, type, is_active, expires_at FROM coupon_codes WHERE code = 'FOUNDER_1YR';

-- Step 2: OPTIONAL - Give your own user the promo code automatically
-- (Replace YOUR_USER_ID with your actual user ID from the database)
-- This immediately grants you unlimited access without needing to redeem
-- 
-- SELECT id FROM users WHERE email = 'your.email@example.com';  -- Find your user ID first
--
-- INSERT INTO user_coupons (
--     user_id,
--     coupon_id,
--     claimed_at,
--     expires_at
-- ) 
-- SELECT 'YOUR_USER_ID', id, NOW(), DATE_ADD(NOW(), INTERVAL 365 DAY)
-- FROM coupon_codes 
-- WHERE code = 'FOUNDER_1YR'
-- LIMIT 1;

-- Step 3: Verify the setup
-- This should show all active coupons and their redemption status
SELECT 
    cc.code,
    cc.type,
    cc.duration_days,
    cc.max_uses,
    cc.is_active,
    cc.expires_at,
    COUNT(uc.id) as redemptions_used,
    (cc.max_uses - COUNT(uc.id)) as remaining_uses
FROM coupon_codes cc
LEFT JOIN user_coupons uc ON cc.id = uc.coupon_id
WHERE cc.is_active = true
GROUP BY cc.id
ORDER BY cc.created_at DESC;

-- ============================================================================
-- If you want to manually grant yourself the code without redeeming:
-- ============================================================================

-- Find your user ID:
SELECT id, email, subscription_tier FROM users WHERE email = 'your.email@example.com';

-- Grant yourself unlimited access for 1 year:
-- INSERT INTO user_coupons (user_id, coupon_id, claimed_at, expires_at)
-- SELECT YOUR_USER_ID, cc.id, NOW(), DATE_ADD(NOW(), INTERVAL 365 DAY)
-- FROM coupon_codes cc
-- WHERE cc.code = 'FOUNDER_1YR' AND NOT EXISTS (
--   SELECT 1 FROM user_coupons WHERE user_id = YOUR_USER_ID AND coupon_id = cc.id
-- );

-- ============================================================================
-- TESTING: Verify a user has unlimited access
-- ============================================================================

-- Check if a specific user has active unlimited grants:
-- SELECT 
--     u.email,
--     cc.code,
--     cc.type,
--     uc.expires_at
-- FROM users u
-- JOIN user_coupons uc ON u.id = uc.user_id
-- JOIN coupon_codes cc ON uc.coupon_id = cc.id
-- WHERE u.email = 'your.email@example.com'
-- AND uc.expires_at > NOW()
-- ORDER BY uc.expires_at DESC;

-- ============================================================================
-- CLEANUP (if needed)
-- ============================================================================

-- Deactivate a promo code:
-- UPDATE coupon_codes SET is_active = false WHERE code = 'FOUNDER_1YR';

-- Remove a user's claimed coupon:
-- DELETE FROM user_coupons WHERE user_id = YOUR_USER_ID AND coupon_id = (
--   SELECT id FROM coupon_codes WHERE code = 'FOUNDER_1YR'
-- );
