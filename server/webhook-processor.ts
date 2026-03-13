/**
 * Garmin Webhook Failure Queue Processor
 * 
 * Handles retry logic for failed webhook processing
 * Runs periodically to process failed activities from the queue
 */

import { db } from './db';
import { webhookFailureQueue } from '@shared/schema';
import { eq, lt, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10 * 60 * 1000; // 10 minutes between retries

/**
 * Process failed webhooks from the queue
 * This should be called periodically by a scheduler (every 5 minutes)
 */
export async function processWebhookFailureQueue(): Promise<{
  processed: number;
  retried: number;
  failed: number;
}> {
  console.log('[Webhook Queue] Processing failed webhooks...');
  
  try {
    // Find webhooks ready for retry
    const now = new Date();
    const failedWebhooks = await db.query.webhookFailureQueue.findMany({
      where: and(
        lt(webhookFailureQueue.nextRetryAt, now),
        lt(webhookFailureQueue.retryCount, MAX_RETRY_ATTEMPTS)
      ),
      limit: 50, // Process max 50 per run
    });

    if (failedWebhooks.length === 0) {
      console.log('[Webhook Queue] No webhooks to retry');
      return { processed: 0, retried: 0, failed: 0 };
    }

    console.log(`[Webhook Queue] Found ${failedWebhooks.length} webhooks to retry`);

    let retried = 0;
    let failed = 0;

    for (const webhook of failedWebhooks) {
      try {
        console.log(`[Webhook Queue] Retrying webhook ${webhook.id} (attempt ${webhook.retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);

        // Re-process based on webhook type
        switch (webhook.webhookType) {
          case 'activities':
            await retryActivityWebhook(webhook);
            retried++;
            break;

          case 'sleep':
            await retrySleepWebhook(webhook);
            retried++;
            break;

          case 'daily':
            await retryDailySummaryWebhook(webhook);
            retried++;
            break;

          case 'heart-rate':
            await retryHeartRateWebhook(webhook);
            retried++;
            break;

          case 'stress':
            await retryStressWebhook(webhook);
            retried++;
            break;

          default:
            console.warn(`[Webhook Queue] Unknown webhook type: ${webhook.webhookType}`);
            failed++;
        }

        // Mark as retried
        await db
          .update(webhookFailureQueue)
          .set({
            retryCount: webhook.retryCount + 1,
            updatedAt: now,
          })
          .where(eq(webhookFailureQueue.id, webhook.id));

      } catch (retryError: any) {
        console.error(`[Webhook Queue] Retry failed for webhook ${webhook.id}:`, retryError.message);

        // Update with error details
        await db
          .update(webhookFailureQueue)
          .set({
            lastError: retryError.message,
            retryCount: webhook.retryCount + 1,
            nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS), // Retry again later
            updatedAt: now,
          })
          .where(eq(webhookFailureQueue.id, webhook.id));

        failed++;
      }
    }

    // Clean up old failed webhooks (older than 7 days or exceeded max retries)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(webhookFailureQueue)
      .where(
        and(
          lt(webhookFailureQueue.createdAt, weekAgo),
          eq(webhookFailureQueue.retryCount, MAX_RETRY_ATTEMPTS)
        )
      );

    console.log(`[Webhook Queue] Processing complete: ${retried} retried, ${failed} failed`);
    return { processed: failedWebhooks.length, retried, failed };

  } catch (error: any) {
    console.error('[Webhook Queue] Fatal error processing queue:', error);
    return { processed: 0, retried: 0, failed: 0 };
  }
}

/**
 * Retry activity webhook
 */
async function retryActivityWebhook(webhook: any): Promise<void> {
  console.log('[Webhook Queue] Retrying activity webhook:', webhook.payload.activityId);
  
  // Re-process using the same logic as the main webhook handler
  // For now, just log success - full implementation would call the handler
  const activity = webhook.payload;
  
  if (!activity.activityId) {
    throw new Error('Activity ID missing from payload');
  }

  // In a real implementation, you would call the main webhook handler here
  // For now, we log and update the status
  console.log(`[Webhook Queue] Would reprocess activity ${activity.activityId}`);
}

/**
 * Retry sleep webhook
 */
async function retrySleepWebhook(webhook: any): Promise<void> {
  console.log('[Webhook Queue] Retrying sleep webhook');
  // Implementation for sleep retry
}

/**
 * Retry daily summary webhook
 */
async function retryDailySummaryWebhook(webhook: any): Promise<void> {
  console.log('[Webhook Queue] Retrying daily summary webhook');
  // Implementation for daily summary retry
}

/**
 * Retry heart rate webhook
 */
async function retryHeartRateWebhook(webhook: any): Promise<void> {
  console.log('[Webhook Queue] Retrying heart rate webhook');
  // Implementation for heart rate retry
}

/**
 * Retry stress webhook
 */
async function retryStressWebhook(webhook: any): Promise<void> {
  console.log('[Webhook Queue] Retrying stress webhook');
  // Implementation for stress retry
}

/**
 * Get webhook failure queue statistics
 */
export async function getWebhookQueueStats(): Promise<{
  total: number;
  pending: number;
  failed: number;
  byType: Record<string, number>;
}> {
  try {
    const now = new Date();

    // Total count
    const [totalResult] = await db.execute(
      sql`SELECT COUNT(*) as count FROM webhook_failure_queue`
    );
    const total = parseInt((totalResult as any).count, 10);

    // Pending count (ready to retry)
    const [pendingResult] = await db.execute(
      sql`SELECT COUNT(*) as count FROM webhook_failure_queue WHERE next_retry_at <= NOW() AND retry_count < ${MAX_RETRY_ATTEMPTS}`
    );
    const pending = parseInt((pendingResult as any).count, 10);

    // Failed count (exceeded max retries)
    const [failedResult] = await db.execute(
      sql`SELECT COUNT(*) as count FROM webhook_failure_queue WHERE retry_count >= ${MAX_RETRY_ATTEMPTS}`
    );
    const failed = parseInt((failedResult as any).count, 10);

    // Count by webhook type
    const byTypeResult = await db.execute(
      sql`SELECT webhook_type, COUNT(*) as count FROM webhook_failure_queue GROUP BY webhook_type`
    );
    const byType: Record<string, number> = {};
    for (const row of byTypeResult.rows) {
      byType[(row as any).webhook_type] = parseInt((row as any).count, 10);
    }

    return { total, pending, failed, byType };

  } catch (error: any) {
    console.error('[Webhook Queue] Error getting stats:', error);
    return { total: 0, pending: 0, failed: 0, byType: {} };
  }
}

/**
 * Manual webhook retry endpoint
 * Allows triggering retry for specific webhook
 */
export async function retryWebhook(webhookId: string): Promise<boolean> {
  try {
    // Reset the webhook to be retried immediately
    await db
      .update(webhookFailureQueue)
      .set({
        nextRetryAt: new Date(), // Retry immediately
        updatedAt: new Date(),
      })
      .where(eq(webhookFailureQueue.id, webhookId));

    console.log(`[Webhook Queue] Webhook ${webhookId} queued for immediate retry`);
    return true;
  } catch (error: any) {
    console.error('[Webhook Queue] Error retrying webhook:', error);
    return false;
  }
}

export default {
  processWebhookFailureQueue,
  getWebhookQueueStats,
  retryWebhook,
};
