import cron from 'node-cron';
import { storage, ConnectedDevice } from './storage';
import { getGarminComprehensiveWellness } from './garmin-service';
import { processWebhookFailureQueue } from './webhook-processor';
import { sendCoachingPlanReminder } from './notification-service';
import { db } from './db';
import { trainingPlans, plannedWorkouts, users, notificationPreferences } from '@shared/schema';
import { eq, and, gte, lt } from 'drizzle-orm';
import { DateTime } from 'luxon';

const SYNC_INTERVAL_MINUTES = 60;

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
 * Respects each user's local timezone. Runs every hour to check if it's 8 AM in any user's timezone.
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
  console.log(`[Scheduler] Starting background scheduler (sync every ${SYNC_INTERVAL_MINUTES} minutes)`);
  
  // Garmin wellness data sync (every 60 minutes)
  cron.schedule(`*/${SYNC_INTERVAL_MINUTES} * * * *`, () => {
    runGarminSync();
  });
  console.log('[Scheduler] Garmin wellness sync scheduled');
  
  // Coaching plan reminders (every hour — checks if it's 8 AM in user's local timezone)
  cron.schedule('0 * * * *', () => {
    sendCoachingPlanReminders().catch(error => {
      console.error('[Scheduler] Coaching plan reminder error:', error);
    });
  });
  console.log('[Scheduler] Coaching plan reminders scheduled (hourly, respects user timezone)');
  
  // Webhook failure queue processor (every 5 minutes)
  cron.schedule('*/5 * * * *', () => {
    console.log('[Scheduler] Running webhook failure queue processor...');
    processWebhookFailureQueue().then(result => {
      if (result.retried > 0 || result.failed > 0) {
        console.log(`[Scheduler] Webhook queue: ${result.retried} retried, ${result.failed} failed`);
      }
    }).catch(error => {
      console.error('[Scheduler] Webhook queue processor error:', error);
    });
  });
  console.log('[Scheduler] Webhook failure queue processor scheduled (every 5 minutes)');
  
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
