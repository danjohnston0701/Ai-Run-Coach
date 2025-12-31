import webpush from 'web-push';
import { storage } from './storage';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@airuncoach.com';

let isConfigured = false;

export function initializePushNotifications() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('[Push] VAPID keys not configured. Push notifications disabled.');
    console.log('[Push] To enable, generate keys using: npx web-push generate-vapid-keys');
    console.log('[Push] Then set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY as secrets.');
    return false;
  }

  try {
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    isConfigured = true;
    console.log('[Push] Web Push notifications initialized successfully');
    return true;
  } catch (error) {
    console.error('[Push] Failed to initialize:', error);
    return false;
  }
}

export function isPushConfigured() {
  return isConfigured;
}

export function getPublicVapidKey() {
  return VAPID_PUBLIC_KEY || null;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
}

export async function sendPushNotification(
  userId: string,
  payload: NotificationPayload
): Promise<boolean> {
  if (!isConfigured) {
    console.log('[Push] Push notifications not configured, skipping notification');
    return false;
  }

  try {
    const subscription = await storage.getPushSubscription(userId);
    if (!subscription) {
      console.log(`[Push] No subscription found for user ${userId}`);
      return false;
    }

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dhKey,
        auth: subscription.authKey,
      },
    };

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload)
    );

    console.log(`[Push] Notification sent to user ${userId}`);
    return true;
  } catch (error: any) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.log(`[Push] Subscription expired for user ${userId}, removing`);
      await storage.deletePushSubscription(userId);
    } else {
      console.error(`[Push] Failed to send notification to ${userId}:`, error);
    }
    return false;
  }
}

export async function sendFriendRequestNotification(
  addresseeId: string,
  requesterName: string,
  requesterEmail: string
): Promise<boolean> {
  return sendPushNotification(addresseeId, {
    title: 'New Friend Request',
    body: `${requesterName} (${requesterEmail}) wants to be your friend!`,
    icon: '/favicon.ico',
    tag: 'friend-request',
    data: { type: 'friend-request' },
    actions: [
      { action: 'view', title: 'View Request' },
    ],
  });
}

export async function sendFriendAcceptedNotification(
  requesterId: string,
  addresseeName: string
): Promise<boolean> {
  return sendPushNotification(requesterId, {
    title: 'Friend Request Accepted',
    body: `${addresseeName} accepted your friend request!`,
    icon: '/favicon.ico',
    tag: 'friend-accepted',
    data: { type: 'friend-accepted' },
  });
}
