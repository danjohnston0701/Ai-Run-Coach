import cron from 'node-cron';
import { storage, ConnectedDevice } from './storage';
import { getGarminComprehensiveWellness } from './garmin-service';
import { processWebhookFailureQueue } from './webhook-processor';
import { sendCoachingPlanReminder } from './notification-service';
import { db } from './db';
import { trainingPlans, plannedWorkouts, users } from '@shared/schema';
import { eq, and, gte, lt } from 'drizzle-orm';

const SYNC_INTERVAL_MINUTES = 60;

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
 * Runs once per day at 8:00 AM UTC (adjusts per user timezone later if needed).
 */
async function sendCoachingPlanReminders(): Promise<void> {
  console.log(`[Scheduler] Sending coaching plan reminders at ${new Date().toISOString()}`);
  
  try {
    // Get all active users
    const allUsers = await db.select({ id: users.id }).from(users);
    
    if (allUsers.length === 0) {
      console.log('[Scheduler] No users found');
      return;
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const user of allUsers) {
      try {
        // Get today's date (UTC)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Find any active training plans for this user
        const activePlans = await db
          .select({ id: trainingPlans.id })
          .from(trainingPlans)
          .where(
            and(
              eq(trainingPlans.userId, user.id),
              eq(trainingPlans.status, 'active')
            )
          );

        if (activePlans.length === 0) {
          continue;
        }

        // For each active plan, check if there's a workout scheduled for today
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
                gte(plannedWorkouts.scheduledDate, today),
                lt(plannedWorkouts.scheduledDate, tomorrow),
                eq(plannedWorkouts.isCompleted, false)
              )
            )
            .limit(1);

          if (todaysWorkouts.length > 0) {
            const workout = todaysWorkouts[0];
            const workoutName = workout.description || 'Workout';

            // Send reminder notification
            await sendCoachingPlanReminder(
              user.id,
              workoutName,
              workout.distance || undefined,
              workout.intensity || undefined
            );

            sentCount++;
            console.log(`[Scheduler] Coaching plan reminder sent to user ${user.id}: "${workoutName}"`);
          } else {
            skippedCount++;
          }
        }
      } catch (userError: any) {
        console.error(`[Scheduler] Error sending reminder for user ${user.id}:`, userError.message);
      }
    }

    console.log(`[Scheduler] Coaching plan reminders completed: ${sentCount} sent, ${skippedCount} skipped`);
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
  
  // Coaching plan reminders (every day at 8:00 AM UTC)
  cron.schedule('0 8 * * *', () => {
    console.log('[Scheduler] Running coaching plan reminders...');
    sendCoachingPlanReminders().catch(error => {
      console.error('[Scheduler] Coaching plan reminder error:', error);
    });
  });
  console.log('[Scheduler] Coaching plan reminders scheduled (daily at 8:00 AM UTC)');
  
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
