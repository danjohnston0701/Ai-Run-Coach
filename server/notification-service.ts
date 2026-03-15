import { storage } from "./storage";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import { garminActivities, runs, notifications } from "@shared/schema";

/**
 * Send activity notification to user (push + in-app)
 * 
 * @param userId - User to notify
 * @param activity - Garmin activity data
 * @param type - Type of notification: 'new_activity' | 'run_enriched'
 * @param runId - Optional run ID (for enriched runs)
 * @param matchScore - Optional match score (for enriched runs)
 */
export async function sendActivityNotification(
  userId: string,
  activity: any,
  type: 'new_activity' | 'run_enriched',
  runId?: string,
  matchScore?: number
): Promise<{ inAppSent: boolean; pushSent: boolean }> {
  const results = { inAppSent: false, pushSent: false };
  
  try {
    // Format distance
    const distanceKm = (activity.distanceInMeters || 0) / 1000;
    const distanceStr = distanceKm > 0 ? `${distanceKm.toFixed(1)}km` : '';
    
    // Format duration
    const durationMin = Math.round((activity.durationInSeconds || 0) / 60);
    const durationStr = durationMin > 0 ? `${durationMin}min` : '';
    
    // Format pace if available
    let paceStr = '';
    if (activity.averagePaceInMinutesPerKilometer) {
      const pace = activity.averagePaceInMinutesPerKilometer;
      const mins = Math.floor(pace);
      const secs = Math.round((pace % 1) * 60);
      paceStr = `${mins}:${secs.toString().padStart(2, '0')}/km`;
    }
    
    // Build notification message
    let title: string;
    let body: string;
    let notificationData: any = {
      type,
      activityId: String(activity.activityId),
      runId,
      distanceKm,
      durationMin,
      timestamp: new Date().toISOString(),
    };
    
    if (type === 'new_activity') {
      const activityName = activity.activityName || 'Activity';
      title = '🏃 Activity Recorded!';
      
      if (distanceStr && durationStr) {
        body = `Your ${activityName} on Garmin was recorded! ${distanceStr} in ${durationStr}`;
        if (paceStr) body += ` (${paceStr})`;
      } else if (durationStr) {
        body = `Your ${activityName} on Garmin was recorded! Duration: ${durationStr}`;
      } else {
        body = `Your ${activityName} on Garmin was recorded!`;
      }
    } else if (type === 'run_enriched') {
      title = '✨ Run Enriched with Garmin Data';
      
      const enrichedFields: string[] = [];
      if (activity.averageHeartRateInBeatsPerMinute) enrichedFields.push('HR');
      if (activity.averageRunCadenceInStepsPerMinute) enrichedFields.push('cadence');
      if (activity.totalElevationGainInMeters) enrichedFields.push('elevation');
      
      if (enrichedFields.length > 0) {
        body = `Your run was updated with Garmin data: ${enrichedFields.join(', ')}`;
        if (matchScore) body += ` (match: ${Math.round(matchScore)}%)`;
      } else {
        body = 'Your run was enriched with additional Garmin metrics';
      }
      
      notificationData.matchScore = matchScore;
    } else {
      title = 'Garmin Activity';
      body = 'New activity from your Garmin device';
    }
    
    // 1. Create in-app notification
    const inAppNotification = await storage.createNotification({
      userId,
      title,
      body,
      type: 'garmin_activity',
      data: notificationData,
      read: false,
    });
    
    results.inAppSent = true;
    console.log(`[Notification] In-app notification created: ${inAppNotification.id} for user ${userId}`);
    
    // 2. Try to send push notification via Firebase
    try {
      const pushSent = await sendFirebasePushNotification(userId, title, body, notificationData);
      results.pushSent = pushSent;
    } catch (pushError) {
      console.warn(`[Notification] Push notification failed (using in-app only):`, pushError);
      // In-app notification already created, so this is not a failure
    }
    
    return results;
  } catch (error) {
    console.error('[Notification] Failed to send activity notification:', error);
    return results;
  }
}

/**
 * Send Firebase Cloud Messaging push notification
 * 
 * Note: This is a placeholder implementation. In production, integrate with:
 * - Firebase Admin SDK
 * - OneSignal
 * - AWS SNS
 * - Or your preferred push service
 */
async function sendFirebasePushNotification(
  userId: string,
  title: string,
  body: string,
  data?: any
): Promise<boolean> {
  try {
    // TODO: Implement Firebase integration
    // 1. Get user's FCM token from database
    // 2. Send push via Firebase Admin SDK
    // 3. Handle token refresh/expiration
    
    // For now, check if user has push subscriptions
    const subscriptions = await db.select().from({
      // Push subscriptions would be in a separate table
      // This is a placeholder query
    } as any).where(eq({ userId } as any, userId));
    
    // Placeholder: Log what would be sent
    console.log(`[Push Notification] Would send to user ${userId}:`, {
      title,
      body,
      data,
    });
    
    // Return false to indicate push not actually sent (using in-app fallback)
    return false;
  } catch (error) {
    console.error('[Push Notification] Error:', error);
    return false;
  }
}

/**
 * Send bulk notifications (for admin or batch operations)
 */
export async function sendBulkNotifications(
  userIds: string[],
  title: string,
  body: string,
  data?: any
): Promise<{ sent: number; failed: number }> {
  const results = { sent: 0, failed: 0 };
  
  for (const userId of userIds) {
    try {
      await storage.createNotification({
        userId,
        title,
        body,
        type: 'system',
        data,
        read: false,
      });
      results.sent++;
    } catch (error) {
      console.error(`[Notification] Failed to send to ${userId}:`, error);
      results.failed++;
    }
  }
  
  return results;
}

/**
 * Mark notifications as read
 */
export async function markNotificationsRead(
  userId: string,
  notificationIds?: string[]
): Promise<number> {
  if (notificationIds && notificationIds.length > 0) {
    // Mark specific notifications as read
    let updated = 0;
    for (const id of notificationIds) {
      try {
        await storage.markNotificationRead(id);
        updated++;
      } catch (error) {
        console.error(`[Notification] Failed to mark ${id} as read:`, error);
      }
    }
    return updated;
  } else {
    // Mark all as read
    await storage.markAllNotificationsRead(userId);
    return -1; // Indicates all were marked
  }
}

/**
 * Get unread notification count for user
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const userNotifications = await storage.getUserNotifications(userId);
  return userNotifications.filter(n => !n.read).length;
}