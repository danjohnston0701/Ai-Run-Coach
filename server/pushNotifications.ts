import webpush from 'web-push';
import { storage } from './storage';

let isConfigured = false;
let vapidPublicKey: string | null = null;

export function initializePushNotifications() {
  // Read keys at initialization time, not module load time
  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@airuncoach.com';

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('[Push] VAPID keys not configured. Push notifications disabled.');
    console.log('[Push] To enable, generate keys using: npx web-push generate-vapid-keys');
    console.log('[Push] Then set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY as secrets.');
    return false;
  }

  // Validate key format before attempting to initialize
  const publicKeyClean = VAPID_PUBLIC_KEY.trim();
  const privateKeyClean = VAPID_PRIVATE_KEY.trim();
  
  if (publicKeyClean.length < 80 || privateKeyClean.length < 40) {
    console.log('[Push] VAPID keys appear to be incomplete or truncated.');
    console.log('[Push] Public key length:', publicKeyClean.length, '(expected ~87 chars)');
    console.log('[Push] Private key length:', privateKeyClean.length, '(expected ~43 chars)');
    console.log('[Push] Push notifications disabled. Please regenerate keys with: npx web-push generate-vapid-keys');
    return false;
  }

  try {
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      publicKeyClean,
      privateKeyClean
    );
    isConfigured = true;
    vapidPublicKey = publicKeyClean;
    console.log('[Push] Web Push notifications initialized successfully');
    return true;
  } catch (error: any) {
    console.log('[Push] Failed to initialize:', error.message);
    console.log('[Push] Push notifications disabled. The app will continue to work without push notifications.');
    console.log('[Push] To fix, regenerate VAPID keys and update the secrets.');
    return false;
  }
}

export function isPushConfigured() {
  return isConfigured;
}

export function getPublicVapidKey() {
  return vapidPublicKey;
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
  // Create notification record in database (so it appears in notifications page)
  try {
    await storage.createNotification({
      userId: addresseeId,
      type: 'friend_request',
      title: 'New Friend Request',
      message: `${requesterName} (${requesterEmail}) wants to be your friend!`,
      read: false,
      data: JSON.stringify({ type: 'friend-request', requesterEmail }),
    });
  } catch (error) {
    console.error('[Notification] Failed to create notification record:', error);
  }

  // Also send push notification if configured
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
  addresseeName: string,
  addresseeEmail: string
): Promise<boolean> {
  // Create notification record in database (so it appears in notifications page)
  try {
    await storage.createNotification({
      userId: requesterId,
      type: 'friend_accepted',
      title: 'Friend Request Accepted',
      message: `${addresseeName} (${addresseeEmail}) accepted your friend request!`,
      read: false,
      data: JSON.stringify({ type: 'friend-accepted', addresseeEmail }),
    });
  } catch (error) {
    console.error('[Notification] Failed to create notification record:', error);
  }

  // Also send push notification if configured
  return sendPushNotification(requesterId, {
    title: 'Friend Request Accepted',
    body: `${addresseeName} (${addresseeEmail}) accepted your friend request!`,
    icon: '/favicon.ico',
    tag: 'friend-accepted',
    data: { type: 'friend-accepted' },
  });
}
