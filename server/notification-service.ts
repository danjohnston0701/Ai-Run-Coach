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

// ── Garmin Watch App Update Broadcast ────────────────────────────────────────

/**
 * Broadcast a "new Garmin companion app version available" push notification to
 * every user who has authenticated from the Garmin IQ watch app.
 *
 * @param version    - New version string (e.g. "2.4.0")
 * @param releaseNote - Short plain-English description of what's new
 * @param storeUrl   - Full Connect IQ store URL for the app listing
 * @returns Summary of sent/failed counts and the list of targeted user IDs
 */
export async function broadcastGarminWatchAppUpdate(
  version: string,
  releaseNote: string,
  storeUrl: string
): Promise<{ targeted: number; pushSent: number; pushFailed: number; inAppSent: number; userIds: string[] }> {
  const results = { targeted: 0, pushSent: 0, pushFailed: 0, inAppSent: 0, userIds: [] as string[] };

  // Fetch all users who have the Garmin watch app installed
  const watchAppUsers = await db
    .select({ id: users.id, fcmToken: users.fcmToken })
    .from(users)
    .where(eq(users.hasGarminWatchApp as any, true));

  results.targeted = watchAppUsers.length;
  results.userIds = watchAppUsers.map((u) => u.id);

  if (watchAppUsers.length === 0) {
    console.log("[GarminWatchBroadcast] No users with Garmin watch app found — nothing to send");
    return results;
  }

  const title = `⌚ Garmin Watch App v${version} Available`;
  const body = releaseNote || `A new version of the AI Run Coach watch app is ready. Tap to update on your Garmin.`;
  const notificationData: Record<string, string> = {
    type: "garmin_watch_update",
    version,
    releaseNote: body,  // Pass the full release note/body to the app
    storeUrl,
    action: "open_connect_iq_store",
    timestamp: new Date().toISOString(),
  };

  console.log(`[GarminWatchBroadcast] Broadcasting v${version} update to ${watchAppUsers.length} users...`);

  for (const user of watchAppUsers) {
    try {
      // In-app notification (always, even without FCM token)
      await storage.createNotification({
        userId: user.id,
        title,
        message: body,
        type: "garmin_watch_update",
        data: notificationData,
        read: false,
      });
      results.inAppSent++;

      // Firebase push (only if FCM token is present)
      if (user.fcmToken) {
        const app = await getFirebaseApp();
        if (app) {
          try {
            // DATA-ONLY message — no `notification` field.
            // This forces Firebase to always call onMessageReceived() on Android
            // regardless of whether the app is in foreground, background, or killed.
            // Our onMessageReceived() builds the notification with a PendingIntent
            // that opens the Connect IQ store URL on tap.
            // If we included a `notification` field, Firebase would show the notification
            // automatically when the app is backgrounded/killed and tapping it would
            // just open MainActivity instead of the store URL.
            const message: any = {
              token: user.fcmToken,
              data: {
                ...notificationData,
                title,   // read by onMessageReceived via message.data["title"]
                body,    // read by onMessageReceived via message.data["body"]
              },
              android: {
                priority: "high",
                // Channel used by onMessageReceived when building the notification
                notification: {
                  channelId: "garmin_watch_updates",
                },
              },
            };
            const messaging = adminSDK.messaging ? adminSDK.messaging(app) : adminSDK.default?.messaging(app);
            await messaging.send(message);
            results.pushSent++;
          } catch (pushErr: any) {
            if (pushErr?.code === "messaging/registration-token-not-registered") {
              console.warn(`[GarminWatchBroadcast] Stale token for user ${user.id} — clearing`);
              await db.update(users).set({ fcmToken: null }).where(eq(users.id, user.id));
            }
            results.pushFailed++;
          }
        }
      }
    } catch (err) {
      console.error(`[GarminWatchBroadcast] Failed for user ${user.id}:`, err);
      results.pushFailed++;
    }
  }

  console.log(
    `[GarminWatchBroadcast] Done — in-app: ${results.inAppSent}, push sent: ${results.pushSent}, push failed: ${results.pushFailed}`
  );
  return results;
}

/**
 * Broadcast an update notification to all Android app users.
 * Similar to the Garmin watch app broadcast, but targets all users with FCM tokens.
 */
export async function broadcastAndroidAppUpdate(
  version: string,
  releaseNote: string
): Promise<{ targeted: number; pushSent: number; pushFailed: number; inAppSent: number; userIds: string[] }> {
  const results = { targeted: 0, pushSent: 0, pushFailed: 0, inAppSent: 0, userIds: [] as string[] };

  // Fetch all users with FCM tokens (all Android users)
  const allUsers = await db
    .select({ id: users.id, fcmToken: users.fcmToken })
    .from(users)
    .where(users.fcmToken as any);  // Only users with FCM tokens

  results.targeted = allUsers.length;
  results.userIds = allUsers.map((u) => u.id);

  if (allUsers.length === 0) {
    console.log("[AndroidAppBroadcast] No users with FCM tokens found — nothing to send");
    return results;
  }

  const title = `🚀 AI Run Coach v${version} Available`;
  const body = releaseNote || `A new version is available. Update now for the latest features!`;
  const notificationData: Record<string, string> = {
    type: "android_app_update",
    version,
    releaseNote: body,
    action: "open_play_store",
    timestamp: new Date().toISOString(),
  };

  console.log(`[AndroidAppBroadcast] Broadcasting v${version} update to ${allUsers.length} users...`);

  for (const user of allUsers) {
    try {
      // In-app notification (always, even without FCM token)
      await storage.createNotification({
        userId: user.id,
        title,
        message: body,
        type: "android_app_update",
        data: notificationData,
        read: false,
      });
      results.inAppSent++;

      // Firebase push (only if FCM token is present)
      if (user.fcmToken) {
        const app = await getFirebaseApp();
        if (app) {
          try {
            // DATA-ONLY message — forces onMessageReceived() to always fire
            const message: any = {
              token: user.fcmToken,
              data: {
                ...notificationData,
                title,
                body,
              },
              android: {
                priority: "high",
                notification: {
                  channelId: "app_updates",
                },
              },
            };
            const messaging = adminSDK.messaging ? adminSDK.messaging(app) : adminSDK.default?.messaging(app);
            await messaging.send(message);
            results.pushSent++;
          } catch (pushErr: any) {
            if (pushErr?.code === "messaging/registration-token-not-registered") {
              console.warn(`[AndroidAppBroadcast] Stale token for user ${user.id} — clearing`);
              await db.update(users).set({ fcmToken: null }).where(eq(users.id, user.id));
            }
            results.pushFailed++;
          }
        }
      }
    } catch (err) {
      console.error(`[AndroidAppBroadcast] Failed for user ${user.id}:`, err);
      results.pushFailed++;
    }
  }

  console.log(
    `[AndroidAppBroadcast] Done — in-app: ${results.inAppSent}, push sent: ${results.pushSent}, push failed: ${results.pushFailed}`
  );
  return results;
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

// ── Android App Update Broadcast ─────────────────────────────────────────────

/**
 * Broadcast an Android app update notification to all users.
 * Uses Firebase Cloud Messaging to deliver the notification.
 *
 * @param version       - New version string (e.g. "1.4.3")
 * @param title         - Notification title (e.g. "Critical Update")
 * @param releaseNote   - Short description of what's new or why they should update
 * @returns Summary of sent/failed counts
 */
export async function broadcastAndroidAppUpdate(
  version: string,
  title: string,
  releaseNote: string
): Promise<{ targeted: number; inAppSent: number; pushSent: number; pushFailed: number }> {
  const results = { targeted: 0, inAppSent: 0, pushSent: 0, pushFailed: 0 };

  // Fetch all users
  const allUsers = await db
    .select({ id: users.id, fcmToken: users.fcmToken })
    .from(users);

  results.targeted = allUsers.length;

  if (allUsers.length === 0) {
    console.log("[AndroidAppUpdate] No users found — nothing to send");
    return results;
  }

  const notificationTitle = `📱 AI Run Coach v${version}`;
  const notificationBody = releaseNote;
  const notificationData: Record<string, string> = {
    type: "app_update",
    version,
    releaseNote,
    action: "open_play_store",
    timestamp: new Date().toISOString(),
  };

  console.log(`[AndroidAppUpdate] Broadcasting v${version} update to ${allUsers.length} users...`);

  for (const user of allUsers) {
    try {
      // In-app notification (always)
      await storage.createNotification({
        userId: user.id,
        title: notificationTitle,
        message: notificationBody,
        type: "app_update",
        data: notificationData,
        read: false,
      });
      results.inAppSent++;

      // Firebase push (only if FCM token exists)
      if (user.fcmToken) {
        const app = await getFirebaseApp();
        if (app) {
          try {
            const message: any = {
              token: user.fcmToken,
              data: {
                ...notificationData,
                title: notificationTitle,
                body: notificationBody,
              },
              android: {
                priority: "high",
                notification: {
                  channelId: "app_updates",
                  sound: "default",
                  clickAction: "OPEN_PLAY_STORE",
                },
              },
            };
            const messaging = adminSDK.messaging ? adminSDK.messaging(app) : adminSDK.default?.messaging(app);
            await messaging.send(message);
            results.pushSent++;
          } catch (pushErr: any) {
            if (pushErr?.code === "messaging/registration-token-not-registered") {
              console.warn(`[AndroidAppUpdate] Stale token for user ${user.id} — clearing`);
              await db.update(users).set({ fcmToken: null }).where(eq(users.id, user.id));
            }
            results.pushFailed++;
          }
        }
      }
    } catch (err) {
      console.error(`[AndroidAppUpdate] Failed for user ${user.id}:`, err);
      results.pushFailed++;
    }
  }

  console.log(
    `[AndroidAppUpdate] Done — in-app: ${results.inAppSent}, push sent: ${results.pushSent}, push failed: ${results.pushFailed}`
  );
  return results;
}