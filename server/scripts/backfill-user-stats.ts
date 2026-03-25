/**
 * One-time backfill script: populates user_stats for all existing users.
 *
 * Run on Replit after deploying the schema migration:
 *   tsx server/scripts/backfill-user-stats.ts
 *
 * Safe to re-run — uses UPSERT (onConflictDoUpdate).
 * Takes roughly 1-2 seconds per user with many runs.
 */

import { db } from '../db';
import { users } from '@shared/schema';
import { recomputeForUser } from '../user-stats-cache';

async function main() {
  console.log('[Backfill] Starting user_stats backfill...');

  const allUsers = await db.select({ id: users.id }).from(users);
  console.log(`[Backfill] Found ${allUsers.length} users to process`);

  let successCount = 0;
  let errorCount = 0;

  for (const user of allUsers) {
    try {
      await recomputeForUser(user.id);
      successCount++;
      if (successCount % 10 === 0) {
        console.log(`[Backfill] Progress: ${successCount}/${allUsers.length}`);
      }
    } catch (err) {
      errorCount++;
      console.error(`[Backfill] Failed for user ${user.id}:`, err);
    }
  }

  console.log(`[Backfill] Complete. Success: ${successCount}, Errors: ${errorCount}`);
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
