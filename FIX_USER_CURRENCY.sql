-- Fix user currency based on timezone mapping
-- Run this in Neon to correct existing users' inferred currencies

-- For your user (Auckland -> NZD)
UPDATE users
SET currency = 'NZD'
WHERE id = '8d898742-dd4e-4b3b-b612-6f34e11778a8'
  AND currency != 'NZD';

-- Bulk fix: All Pacific/Auckland timezones should be NZD
UPDATE users u
SET currency = 'NZD'
FROM notification_preferences np
WHERE u.id = np.user_id
  AND np.coaching_plan_reminder_timezone LIKE 'Pacific/Auckland'
  AND u.currency != 'NZD';

-- Verify the fix
SELECT 
  u.id,
  u.email,
  u.currency,
  np.coaching_plan_reminder_timezone
FROM users u
LEFT JOIN notification_preferences np ON u.id = np.user_id
WHERE np.coaching_plan_reminder_timezone LIKE 'Pacific/%'
  OR np.coaching_plan_reminder_timezone LIKE 'Australia/%';
