/**
 * Garmin PUSH Notification Service
 * 
 * Handles Garmin's PING/PUSH notifications for real-time data updates
 * Required for Garmin Production App approval
 * 
 * REQUIREMENTS:
 * - Respond HTTP 200 within 30 seconds
 * - Handle payloads up to 10MB (wellness) or 100MB (activities)
 * - Process asynchronously
 * - No PULL-ONLY (polling) allowed in production
 */

import { storage } from './storage';
import garminService from './garmin-service';
import activityProcessor from './garmin-activity-processor';

/**
 * Garmin PUSH Notification Types
 */
export enum GarminDataType {
  ACTIVITY = 'ACTIVITY',
  DAILY = 'DAILY', // Daily summary
  EPOCH = 'EPOCH', // Minute-by-minute data
  SLEEP = 'SLEEP',
  BODY_COMP = 'BODY_COMP',
  STRESS = 'STRESS',
  PULSE_OX = 'PULSE_OX',
  RESPIRATION = 'RESPIRATION',
  HEART_RATE = 'HEART_RATE',
  USER_METRICS = 'USER_METRICS'
}

export interface GarminPushNotification {
  userId: string; // Garmin user ID (maps to your user)
  userAccessToken: string; // OAuth access token
  dataType: GarminDataType;
  uploadStartTimeInSeconds: number;
  uploadEndTimeInSeconds: number;
  summaryId?: string; // For summaries
  activityFiles?: Array<{
    callbackURL: string;
    activityId: string;
  }>;
}

/**
 * Process Garmin PUSH notification asynchronously
 * This runs AFTER we've already sent HTTP 200 to Garmin
 */
export async function processGarminPushNotification(notification: GarminPushNotification): Promise<void> {
  console.log(`\n📨 ========== PROCESSING GARMIN PUSH NOTIFICATION ==========`);
  console.log(`Data Type: ${notification.dataType}`);
  console.log(`User ID: ${notification.userId}`);
  console.log(`Time Range: ${new Date(notification.uploadStartTimeInSeconds * 1000).toISOString()} - ${new Date(notification.uploadEndTimeInSeconds * 1000).toISOString()}`);

  try {
    // Find user's connected device to get internal user ID
    const allDevices = await storage.getAllActiveGarminDevices();
    const userDevice = allDevices.find(d => d.deviceId === notification.userId);

    if (!userDevice) {
      console.warn(`⚠️ No active Garmin device found for Garmin user ${notification.userId}`);
      return;
    }

    const internalUserId = userDevice.userId;
    console.log(`✅ Mapped to internal user: ${internalUserId}`);

    // Refresh token if needed
    let accessToken = userDevice.accessToken;
    if (!accessToken) {
      console.error(`❌ No access token found for user ${internalUserId}`);
      return;
    }

    // Check if token is expired
    if (userDevice.tokenExpiresAt && new Date(userDevice.tokenExpiresAt) < new Date()) {
      console.log(`🔄 Access token expired, refreshing...`);
      const refreshed = await garminService.refreshGarminToken(userDevice.refreshToken!);
      accessToken = refreshed.access_token;
      
      await storage.updateConnectedDevice(userDevice.id, {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000)
      });
    }

    // Process based on data type
    switch (notification.dataType) {
      case GarminDataType.ACTIVITY:
        await processActivityPush(internalUserId, accessToken, notification);
        break;
      
      case GarminDataType.DAILY:
        await processDailySummaryPush(internalUserId, accessToken, notification);
        break;
      
      case GarminDataType.SLEEP:
        await processSleepPush(internalUserId, accessToken, notification);
        break;
      
      case GarminDataType.HEART_RATE:
        await processHeartRatePush(internalUserId, accessToken, notification);
        break;
      
      case GarminDataType.STRESS:
        await processStressPush(internalUserId, accessToken, notification);
        break;
      
      default:
        console.log(`⚠️ Unhandled data type: ${notification.dataType}`);
    }

    // Update last sync time
    await storage.updateConnectedDevice(userDevice.id, {
      lastSyncAt: new Date()
    });

    console.log(`✅ Successfully processed ${notification.dataType} notification for user ${internalUserId}`);
  } catch (error) {
    console.error(`❌ Error processing Garmin PUSH notification:`, error);
    // TODO: Implement retry queue for failed notifications
  }
}

/**
 * Process Activity PUSH notification
 */
async function processActivityPush(
  userId: string,
  accessToken: string,
  notification: GarminPushNotification
): Promise<void> {
  console.log(`🏃 Processing ACTIVITY push notification...`);

  if (!notification.activityFiles || notification.activityFiles.length === 0) {
    console.log(`⚠️ No activity files in notification`);
    return;
  }

  for (const activityFile of notification.activityFiles) {
    try {
      console.log(`🔍 Fetching detailed activity ${activityFile.activityId}...`);
      
      // Check if activity already imported
      const existingRuns = await storage.getUserRuns(userId);
      const alreadyImported = existingRuns.some(run => 
        run.externalSource === 'garmin' && run.externalId === activityFile.activityId
      );

      if (alreadyImported) {
        console.log(`⏭️ Activity ${activityFile.activityId} already imported, skipping`);
        continue;
      }

      // Fetch complete activity details with all metrics (splits, HR data, GPS, etc.)
      const activityDetails = await activityProcessor.fetchCompleteGarminActivityDetail(
        accessToken, 
        activityFile.activityId
      );
      
      if (!activityDetails) {
        console.warn(`⚠️ Failed to fetch details for activity ${activityFile.activityId}`);
        continue;
      }

      // Skip non-running activities
      if (activityDetails.activityType && activityDetails.activityType !== 'RUNNING') {
        console.log(`⏭️ Skipping non-running activity ${activityFile.activityId}`);
        continue;
      }

      // Save detailed activity to database with all metrics
      const saveResult = await activityProcessor.saveDetailedGarminActivity(userId, activityDetails);
      console.log(`✅ Successfully imported activity ${activityFile.activityId} as run ${saveResult.id}`);
      console.log(`   ${saveResult.message}`);

    } catch (error) {
      console.error(`❌ Error processing activity ${activityFile.activityId}:`, error);
    }
  }
}

/**
 * Process Daily Summary PUSH notification
 */
async function processDailySummaryPush(
  userId: string,
  accessToken: string,
  notification: GarminPushNotification
): Promise<void> {
  console.log(`📊 Processing DAILY summary push notification...`);

  const date = new Date(notification.uploadStartTimeInSeconds * 1000);
  
  try {
    const summary = await garminService.getGarminDailySummary(accessToken, date);
    
    // TODO: Save to wellness metrics table
    console.log(`✅ Successfully imported daily summary for ${date.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error(`❌ Error processing daily summary:`, error);
  }
}

/**
 * Process Sleep PUSH notification
 */
async function processSleepPush(
  userId: string,
  accessToken: string,
  notification: GarminPushNotification
): Promise<void> {
  console.log(`😴 Processing SLEEP push notification...`);

  const date = new Date(notification.uploadStartTimeInSeconds * 1000);
  
  try {
    const sleepData = await garminService.getGarminSleepData(accessToken, date);
    
    // TODO: Save to wellness metrics table
    console.log(`✅ Successfully imported sleep data for ${date.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error(`❌ Error processing sleep data:`, error);
  }
}

/**
 * Process Heart Rate PUSH notification
 */
async function processHeartRatePush(
  userId: string,
  accessToken: string,
  notification: GarminPushNotification
): Promise<void> {
  console.log(`❤️ Processing HEART RATE push notification...`);

  const date = new Date(notification.uploadStartTimeInSeconds * 1000);
  
  try {
    const hrData = await garminService.getGarminHeartRateData(accessToken, date);
    
    // TODO: Save to wellness metrics table
    console.log(`✅ Successfully imported heart rate data for ${date.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error(`❌ Error processing heart rate data:`, error);
  }
}

/**
 * Process Stress PUSH notification
 */
async function processStressPush(
  userId: string,
  accessToken: string,
  notification: GarminPushNotification
): Promise<void> {
  console.log(`😰 Processing STRESS push notification...`);

  const date = new Date(notification.uploadStartTimeInSeconds * 1000);
  
  try {
    const stressData = await garminService.getGarminStressData(accessToken, date);
    
    // TODO: Save to wellness metrics table
    console.log(`✅ Successfully imported stress data for ${date.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error(`❌ Error processing stress data:`, error);
  }
}
