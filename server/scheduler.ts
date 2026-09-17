import cron from 'node-cron';
import { storage, ConnectedDevice } from './storage';
import { getGarminComprehensiveWellness } from './garmin-service';
import { processWebhookFailureQueue } from './webhook-processor';
import { sendCoachingPlanReminder } from './notification-service';
import { db } from './db';
import { trainingPlans, plannedWorkouts, users, notificationPreferences } from '@shared/schema';
import { eq, and, gte, lt } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { reconcileGooglePlaySubscriptions } from './google-play-billing';
import { findPlansNeedingEnrichment, enrichWorkoutBlock, getWorkoutIdsForPlanWeeks, markPlanEnrichedThroughWeek, correctImplausibleHRZoneBPMs } from './session-enrichment-service';

// Track which users have already received a reminder today (user_id -> timestamp of last send)
// Stores the reminder send timestamp so we don't send twice in the same calendar day for a user
const coachingPlanRemindersSent = new Map<string, Date>();

interface SyncResult {
  userId: string;
  deviceId: string;
  success: boolean;
  error?: string;
  dataPoints?: number;
}

async function syncGarminForUser(device: ConnectedDevice): Promise<SyncResult> {
  const result: SyncResult = {
    userId: device.userId,
    deviceId: device.id,
    success: false,
  };

  try {
    if (!device.accessToken) {
      result.error = 'No access token';
      return result;
    }

    const today = new Date();
    let dataPoints = 0;

    const wellness = await getGarminComprehensiveWellness(device.accessToken, today);
    
    if (wellness) {
      const wellnessData: Record<string, any> = {
        userId: device.userId,
        date: wellness.date,
        totalSleepSeconds: wellness.sleep?.totalSleepSeconds || null,
        sleepScore: wellness.sleep?.sleepScore || null,
        deepSleepSeconds: wellness.sleep?.deepSleepSeconds || null,
        lightSleepSeconds: wellness.sleep?.lightSleepSeconds || null,
        remSleepSeconds: wellness.sleep?.remSleepSeconds || null,
        awakeSleepSeconds: wellness.sleep?.awakeSleepSeconds || null,
        sleepQuality: wellness.sleep?.sleepQuality || null,
        restingHeartRate: wellness.heartRate?.restingHeartRate || null,
        maxHeartRate: wellness.heartRate?.maxHeartRate || null,
        minHeartRate: wellness.heartRate?.minHeartRate || null,
        averageHeartRate: wellness.heartRate?.averageHeartRate || null,
        averageStressLevel: wellness.stress?.averageStressLevel || null,
        maxStressLevel: wellness.stress?.maxStressLevel || null,
        stressDuration: wellness.stress?.stressDuration || null,
        restDuration: wellness.stress?.restDuration || null,
        stressQualifier: wellness.stress?.stressQualifier || null,
        bodyBatteryCharged: wellness.bodyBattery?.chargedValue || null,
        bodyBatteryDrained: wellness.bodyBattery?.drainedValue || null,
        bodyBatteryHigh: wellness.bodyBattery?.highestValue || null,
        bodyBatteryLow: wellness.bodyBattery?.lowestValue || null,
        bodyBatteryCurrent: wellness.bodyBattery?.currentValue || null,
        hrvStatus: wellness.hrv?.hrvStatus || null,
        hrvWeeklyAvg: wellness.hrv?.weeklyAvg || null,
        hrvLastNightAvg: wellness.hrv?.lastNightAvg || null,
        hrvFeedback: wellness.hrv?.feedbackPhrase || null,
        readinessScore: wellness.readiness?.score || null,
        readinessRecommendation: wellness.readiness?.recommendation || null,
        syncedAt: new Date(),
      };

      const existingWellness = await storage.getGarminWellnessByDate(device.userId, today);
      
      if (existingWellness) {
        await storage.updateGarminWellness(existingWellness.id, wellnessData);
      } else {
        await storage.createGarminWellness(wellnessData);
      }
      
      dataPoints++;
    }

    await storage.updateConnectedDevice(device.id, { lastSyncAt: new Date() });
    
    result.success = true;
    result.dataPoints = dataPoints;
    
    console.log(`[Scheduler] Synced Garmin data for user ${device.userId}`);
  } catch (error: any) {
    result.error = error.message;
    console.error(`[Scheduler] Failed to sync Garmin for user ${device.userId}:`, error.message);
  }

  return result;
}

async function runGarminSync(): Promise<void> {
  console.log(`[Scheduler] Starting Garmin sync for all users at ${new Date().toISOString()}`);
  
  try {
    const allDevices = await storage.getAllActiveGarminDevices();
    
    if (allDevices.length === 0) {
      console.log('[Scheduler] No active Garmin devices found');
      return;
    }

    console.log(`[Scheduler] Found ${allDevices.length} active Garmin device(s)`);
    
    const results = await Promise.allSettled(
      allDevices.map((device: ConnectedDevice) => syncGarminForUser(device))
    );
    
    const successful = results.filter((r: PromiseSettledResult<SyncResult>) => 
      r.status === 'fulfilled' && r.value.success
    ).length;
    const failed = results.length - successful;
    
    console.log(`[Scheduler] Garmin sync completed: ${successful} successful, ${failed} failed`);
  } catch (error: any) {
    console.error('[Scheduler] Garmin sync job failed:', error.message);
  }
}

/**
 * Send 8am coaching plan reminders for any active training plans with today's workouts.
 * Respects each user's local timezone. Runs once daily (more efficient than hourly checks).
 */
async function sendCoachingPlanReminders(): Promise<void> {
  console.log(`[Scheduler] Checking for coaching plan reminders at ${new Date().toISOString()}`);
  
  try {
    // Get all users with their timezone preferences
    const allUsers = await db
      .select({
        id: users.id,
        timezone: notificationPreferences.coachingPlanReminderTimezone,
        enabled: notificationPreferences.coachingPlanReminder,
      })
      .from(users)
      .leftJoin(notificationPreferences, eq(users.id, notificationPreferences.userId));
    
    if (allUsers.length === 0) {
      console.log('[Scheduler] No users found');
      return;
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const userRow of allUsers) {
      try {
        // Check if reminders are enabled for this user
        if (userRow.enabled === false) {
          continue;
        }

        const timezone = userRow.timezone || 'UTC';
        const userId = userRow.id;

        // Get current time in the user's timezone
        let userTime: DateTime;
        try {
          userTime = DateTime.now().setZone(timezone);
        } catch (tzError) {
          console.warn(`[Scheduler] Invalid timezone "${timezone}" for user ${userId}, falling back to UTC`);
          userTime = DateTime.now().setZone('UTC');
        }

        // Check if it's 8:00 AM in the user's local time (hour = 8, within the hour)
        if (userTime.hour !== 8) {
          continue; // Skip if not 8 AM in their timezone
        }

        // Get today's date in the user's timezone
        const userToday = userTime.startOf('day').toJSDate();
        const userTomorrow = userTime.plus({ days: 1 }).startOf('day').toJSDate();

        // Check if we've already sent a reminder today for this user
        const lastSent = coachingPlanRemindersSent.get(userId);
        if (lastSent && lastSent > userToday) {
          // Already sent today in user's timezone
          skippedCount++;
          continue;
        }

        // Find any active training plans for this user
        const activePlans = await db
          .select({ id: trainingPlans.id })
          .from(trainingPlans)
          .where(
            and(
              eq(trainingPlans.userId, userId),
              eq(trainingPlans.status, 'active')
            )
          );

        if (activePlans.length === 0) {
          continue;
        }

        // For each active plan, check if there's a workout scheduled for today
        let sentForUser = false;
        for (const plan of activePlans) {
          const todaysWorkouts = await db
            .select({
              id: plannedWorkouts.id,
              description: plannedWorkouts.description,
              distance: plannedWorkouts.distance,
              intensity: plannedWorkouts.intensity,
              isCompleted: plannedWorkouts.isCompleted,
            })
            .from(plannedWorkouts)
            .where(
              and(
                eq(plannedWorkouts.trainingPlanId, plan.id),
                gte(plannedWorkouts.scheduledDate, userToday),
                lt(plannedWorkouts.scheduledDate, userTomorrow),
                eq(plannedWorkouts.isCompleted, false)
              )
            )
            .limit(1);

          if (todaysWorkouts.length > 0) {
            const workout = todaysWorkouts[0];
            const workoutName = workout.description || 'Workout';

            // Send reminder notification
            await sendCoachingPlanReminder(
              userId,
              workoutName,
              workout.distance || undefined,
              workout.intensity || undefined
            );

            // Record that we sent a reminder today
            coachingPlanRemindersSent.set(userId, new Date());

            sentCount++;
            sentForUser = true;
            console.log(`[Scheduler] Coaching plan reminder sent to user ${userId} (${timezone}): "${workoutName}"`);
            break; // Send only one reminder per user per day
          }
        }

        if (!sentForUser) {
          skippedCount++;
        }
      } catch (userError: any) {
        console.error(`[Scheduler] Error sending reminder for user ${userRow.id}:`, userError.message);
      }
    }

    if (sentCount > 0 || skippedCount > 0) {
      console.log(`[Scheduler] Coaching plan reminders: ${sentCount} sent, ${skippedCount} skipped`);
    }
  } catch (error: any) {
    console.error('[Scheduler] Coaching plan reminder job failed:', error.message);
  }
}

export function startScheduler(): void {
  console.log('[Scheduler] Starting background scheduler (Garmin sync every 6 hours)');
  
  // Garmin wellness data sync — DISABLED (Garmin API no longer available)
  // Previously ran every 6 hours, but the Garmin Connect API is now disabled
  // cron.schedule('0 */6 * * *', () => {
  //   runGarminSync();
  // });
  console.log('[Scheduler] Garmin wellness sync DISABLED (Garmin API unavailable)');
  
  // Coaching plan reminders (⚡ Optimized: hourly → once daily at 8 AM UTC, respects user timezone)
  cron.schedule('0 8 * * *', () => {
    sendCoachingPlanReminders().catch(error => {
      console.error('[Scheduler] Coaching plan reminder error:', error);
    });
  });
  console.log('[Scheduler] Coaching plan reminders scheduled (once daily at 8 AM UTC, respects user timezone)');

  // Session enrichment — rolling 2-week block enrichment.
  // Runs daily at 6 AM UTC. Finds all active plans where the calendar has passed
  // the end of the last enriched block and enriches the next 2 weeks.
  // This ensures users always see complete, accurate sessions for the next 2 weeks ahead.
  cron.schedule('0 6 * * *', async () => {
    try {
      const plansToEnrich = await findPlansNeedingEnrichment();
      if (plansToEnrich.length === 0) return;

      console.log(`[Scheduler] Enrichment: ${plansToEnrich.length} plan(s) need next block enriched`);

      for (const { planId, userId, nextWeeksToEnrich } of plansToEnrich) {
        try {
          const workoutIds = await getWorkoutIdsForPlanWeeks(planId, nextWeeksToEnrich);
          if (workoutIds.length === 0) continue;

          // regenerateCoaching=true: this is the only enrichment call site that can hit an
          // already-cached, now-stale coaching plan (the user may have opened a workout days
          // before its rolling-window re-enrichment tightened the targets), so it's worth the
          // extra OpenAI call here to keep that cache correct.
          const { enriched, failed } = await enrichWorkoutBlock(userId, workoutIds, true);
          const throughWeek = Math.max(...nextWeeksToEnrich);
          await markPlanEnrichedThroughWeek(planId, throughWeek);

          console.log(
            `[Scheduler] Enrichment: plan ${planId} — weeks ${nextWeeksToEnrich.join(",")} ` +
            `enriched (${enriched} sessions done, ${failed} failed)`
          );
        } catch (planErr) {
          console.error(`[Scheduler] Enrichment failed for plan ${planId}:`, planErr);
          // Continue to next plan — don't let one failure block others
        }
      }
    } catch (err) {
      console.error('[Scheduler] Enrichment job error:', err);
    }
  });
  console.log('[Scheduler] Session enrichment scheduled (daily at 6 AM UTC)');

  // BPM self-healing — corrects physiologically implausible HR zone BPMs on existing plans.
  // Runs daily at 6:10 AM UTC (10 min after enrichment, giving it time to finish).
  // Fixes sessions where GPT estimated wrong BPMs before the Tanaka enforcement was in place.
  cron.schedule('10 6 * * *', async () => {
    try {
      const result = await correctImplausibleHRZoneBPMs();
      if (result.corrected > 0) {
        console.log(`[Scheduler] BPM self-heal: corrected ${result.corrected} workout(s)`);
      }
    } catch (err) {
      console.error('[Scheduler] BPM self-heal error:', err);
    }
  });
  console.log('[Scheduler] BPM self-healing scheduled (daily at 6:10 AM UTC)');

  // Google Play subscription reconcile — safety net for missed RTDNs and for the
  // pre-RTDN guessed expiry dates. Re-checks lapsed purchase tokens against the Play
  // Developer API and clears tiers that Google says have expired. No-ops (skipped=true)
  // until GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is configured.
  cron.schedule('15 * * * *', async () => {
    try {
      const r = await reconcileGooglePlaySubscriptions();
      if (r.skipped) return;
      if (r.tokensChecked + r.usersChecked > 0 || r.errors > 0) {
        console.log(
          `[Scheduler] Google Play reconcile: ${r.tokensChecked} token(s), ${r.usersChecked} user(s) checked — ` +
          `${r.entitlementsCleared} expired, ${r.unverifiableCleared} cleared unverifiable, ${r.errors} error(s)`
        );
      }
    } catch (err) {
      console.error('[Scheduler] Google Play reconcile error:', err);
    }
  });
  console.log('[Scheduler] Google Play subscription reconcile scheduled (hourly at :15)');

  // Run BPM self-heal once on startup to fix any existing wrong values immediately
  setImmediate(async () => {
    try {
      const result = await correctImplausibleHRZoneBPMs();
      if (result.corrected > 0) {
        console.log(`[Scheduler] BPM self-heal on startup: corrected ${result.corrected} workout(s)`);
      }
    } catch (err) {
      console.warn('[Scheduler] BPM self-heal startup error (non-blocking):', err);
    }
  });

  // Webhook failure queue processor (⚡ Optimized: 5m → 30m, still robust for retries)
  cron.schedule('*/30 * * * *', () => {
    console.log('[Scheduler] Running webhook failure queue processor...');
    processWebhookFailureQueue().then(result => {
      if (result.retried > 0 || result.failed > 0) {
        console.log(`[Scheduler] Webhook queue: ${result.retried} retried, ${result.failed} failed`);
      }
    }).catch(error => {
      console.error('[Scheduler] Webhook queue processor error:', error);
    });
  });
  console.log('[Scheduler] Webhook failure queue processor scheduled (every 30 minutes)');
  
  // Run initial syncs after delay
  setTimeout(() => {
    console.log('[Scheduler] Running initial Garmin sync in 30 seconds...');
    runGarminSync();
  }, 30000);
  
  setTimeout(() => {
    console.log('[Scheduler] Running initial webhook queue check in 60 seconds...');
    processWebhookFailureQueue().catch(error => {
      console.error('[Scheduler] Initial webhook queue check failed:', error);
    });
  }, 60000);
}

export async function triggerManualSync(userId: string): Promise<SyncResult | null> {
  try {
    const devices = await storage.getConnectedDevices(userId);
    const garminDevice = devices.find((d: ConnectedDevice) => d.deviceType === 'garmin' && d.isActive);
    
    if (!garminDevice) {
      return null;
    }
    
    return await syncGarminForUser(garminDevice);
  } catch (error: any) {
    console.error('[Scheduler] Manual sync failed:', error.message);
    return null;
  }
}
