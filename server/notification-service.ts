import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";

// ── Firebase Admin SDK initialisation ───────────────────────────────────────
// Set FIREBASE_SERVICE_ACCOUNT_JSON as an env var containing the full JSON
// service account key from the Firebase Console (Project Settings > Service Accounts).
let firebaseApp: any = null;
let adminSDK: any = null;
let adminCredential: any = null;

async function getFirebaseApp(): Promise<any> {
  if (firebaseApp) return firebaseApp;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.warn("[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON env var not set — push notifications disabled");
    return null;
  }

  try {
    // Dynamically import firebase-admin to handle bundling issues
    if (!adminSDK) {
      const admin = await import("firebase-admin");
      adminSDK = admin.default || admin;
      adminCredential = adminSDK.credential || admin.credential;
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    console.log(`[Firebase] Initializing with project: ${serviceAccount.project_id || 'unknown'}`);
    firebaseApp = adminSDK.initializeApp({
      credential: adminCredential.cert(serviceAccount),
    });
    console.log("[Firebase] Admin SDK initialised ✅");
    return firebaseApp;
  } catch (err) {
    console.error("[Firebase] Failed to initialise Admin SDK:", err);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Send activity notification to user (push + in-app).
 *
 * @param userId        - User to notify
 * @param activity      - Garmin activity data
 * @param type          - 'new_activity' | 'run_enriched'
 * @param runId         - Optional: linked AiRunCoach run ID
 * @param matchScore    - Optional: fuzzy-match confidence (0-100)
 */
export async function sendActivityNotification(
  userId: string,
  activity: any,
  type: "new_activity" | "run_enriched",
  runId?: string,
  matchScore?: number
): Promise<{ inAppSent: boolean; pushSent: boolean }> {
  const results = { inAppSent: false, pushSent: false };

  try {
    // Build human-readable strings
    const distanceKm = (activity.distanceInMeters || 0) / 1000;
    const distanceStr = distanceKm > 0 ? `${distanceKm.toFixed(1)}km` : "";
    const durationMin = Math.round((activity.durationInSeconds || 0) / 60);
    const durationStr = durationMin > 0 ? `${durationMin}min` : "";

    let paceStr = "";
    if (activity.averagePaceInMinutesPerKilometer) {
      const pace = activity.averagePaceInMinutesPerKilometer;
      const mins = Math.floor(pace);
      const secs = Math.round((pace % 1) * 60);
      paceStr = `${mins}:${secs.toString().padStart(2, "0")}/km`;
    }

    let title: string;
    let body: string;
    const notificationData: Record<string, string> = {
      type,
      activityId: String(activity.activityId || ""),
      runId: runId ?? "",
      distanceKm: String(distanceKm),
      durationMin: String(durationMin),
      timestamp: new Date().toISOString(),
    };

    if (type === "new_activity") {
      const activityName = activity.activityName || "Activity";
      title = "🏃 Activity Recorded!";
      body =
        distanceStr && durationStr
          ? `Your ${activityName} — ${distanceStr} in ${durationStr}${paceStr ? ` (${paceStr})` : ""}`
          : durationStr
          ? `Your ${activityName} on Garmin — Duration: ${durationStr}`
          : `Your ${activityName} on Garmin was recorded!`;
    } else {
      // run_enriched
      title = "✨ Run Enriched with Garmin Data";
      const enriched: string[] = [];
      if (activity.averageHeartRateInBeatsPerMinute) enriched.push("HR");
      if (activity.averageRunCadenceInStepsPerMinute) enriched.push("cadence");
      if (activity.totalElevationGainInMeters) enriched.push("elevation");
      body =
        enriched.length > 0
          ? `Your run was updated with Garmin data: ${enriched.join(", ")}${matchScore ? ` (${Math.round(matchScore)}% match)` : ""}`
          : "Your run was enriched with additional Garmin metrics";
      if (matchScore) notificationData.matchScore = String(matchScore);
    }

    // 1. In-app notification (always)
    await storage.createNotification({
      userId,
      title,
      message: body,   // schema field is 'message', not 'body'
      type: "garmin_activity",
      data: notificationData,
      read: false,
    });
    results.inAppSent = true;
    console.log(`[Notification] In-app notification created for user ${userId}: "${title}"`);

    // 2. Firebase push notification
    const pushSent = await sendFirebasePush(userId, title, body, notificationData);
    results.pushSent = pushSent;

    return results;
  } catch (error) {
    console.error("[Notification] Failed to send activity notification:", error);
    return results;
  }
}

/**
 * Send a Firebase Cloud Messaging push notification to a specific user.
 * Looks up the user's FCM token stored in the users table.
 */
export async function sendFirebasePush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  const app = await getFirebaseApp();
  if (!app) {
    console.warn(`[Firebase Push] Firebase not initialized — cannot send to user ${userId}`);
    return false;
  }

  try {
    // Fetch the user's FCM token
    const [user] = await db
      .select({ fcmToken: users.fcmToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      console.warn(`[Firebase Push] User ${userId} not found in database`);
      return false;
    }

    if (!user.fcmToken) {
      console.log(`[Firebase Push] No FCM token for user ${userId} — skipping push`);
      return false;
    }

    console.log(`[Firebase Push] Sending to user ${userId} with token: ${user.fcmToken.substring(0, 20)}...`);

    const message: any = {
      token: user.fcmToken,
      notification: { title, body },
      data: data ?? {},
      android: {
        priority: "high",
        notification: {
          channelId: "garmin_sync",
          sound: "default",
          clickAction: "OPEN_RUN_SUMMARY",
        },
      },
    };

    const messaging = adminSDK.messaging ? adminSDK.messaging(app) : adminSDK.default?.messaging(app);
    const messageId = await messaging.send(message);
    console.log(`[Firebase Push] ✅ Sent to user ${userId} (messageId: ${messageId}): "${title}"`);
    return true;
  } catch (err: any) {
    if (err?.code === "messaging/registration-token-not-registered") {
      // Token is stale — clear it so we don't keep trying
      console.warn(`[Firebase Push] Stale FCM token for user ${userId} — clearing`);
      await db.update(users).set({ fcmToken: null }).where(eq(users.id, userId));
    } else {
      console.error(`[Firebase Push] Error sending to user ${userId}:`, {
        code: err?.code,
        message: err?.message,
        stack: err?.stack?.split('\n').slice(0, 3).join('\n'),
      });
    }
    return false;
  }
}

// ── Bulk / utility helpers ────────────────────────────────────────────────────

export async function sendBulkNotifications(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ sent: number; failed: number }> {
  const results = { sent: 0, failed: 0 };
  for (const userId of userIds) {
    try {
      await storage.createNotification({
        userId,
        title,
        message: body,  // schema field is 'message'
        type: "system",
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

export async function markNotificationsRead(
  userId: string,
  notificationIds?: string[]
): Promise<number> {
  if (notificationIds && notificationIds.length > 0) {
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
    await storage.markAllNotificationsRead(userId);
    return -1;
  }
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const userNotifications = await storage.getUserNotifications(userId);
  return userNotifications.filter((n) => !n.read).length;
}

/**
 * Send coaching plan session reminder notification at 8am.
 * Called by scheduler for users who have a workout scheduled for today.
 *
 * @param userId        - User ID
 * @param workoutName   - Workout description (e.g., "6x400m Intervals")
 * @param distance      - Workout distance in km
 * @param intensity     - Intensity zone (e.g., "z4")
 */
export async function sendCoachingPlanReminder(
  userId: string,
  workoutName: string,
  distance?: number,
  intensity?: string
): Promise<{ inAppSent: boolean; pushSent: boolean }> {
  const results = { inAppSent: false, pushSent: false };

  try {
    const title = "🏃 Today's Coaching Session";
    const body = `You have a ${workoutName}${distance ? ` (${distance}km)` : ""} scheduled for today. Ready to go?`;

    const notificationData: Record<string, string> = {
      type: "coaching_plan_reminder",
      workoutName,
      distance: distance?.toString() ?? "",
      intensity: intensity ?? "",
      timestamp: new Date().toISOString(),
    };

    // 1. In-app notification
    await storage.createNotification({
      userId,
      title,
      message: body,  // schema field is 'message'
      type: "coaching_plan_reminder",
      data: notificationData,
      read: false,
    });
    results.inAppSent = true;
    console.log(`[Notification] In-app coaching plan reminder created for user ${userId}: "${workoutName}"`);

    // 2. Firebase push notification
    const pushSent = await sendFirebasePush(userId, title, body, notificationData);
    results.pushSent = pushSent;

    return results;
  } catch (error) {
    console.error("[Notification] Failed to send coaching plan reminder:", error);
    return results;
  }
}
