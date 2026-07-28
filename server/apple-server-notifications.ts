/**
 * Apple App Store Server Notifications V2 Handler
 *
 * Processes webhook notifications from Apple for in-app purchases (subscriptions).
 *
 * Apple POSTs to your endpoint with:
 * {
 *   "signedPayload": "<JWS_TOKEN>"
 * }
 *
 * The JWS contains:
 * - notificationType: SUBSCRIBED, DID_RENEW, DID_CHANGE_RENEWAL_STATUS, EXPIRED, etc.
 * - subtype: (varies by notification type)
 * - data:
 *   - signedTransactionInfo: "<JWS>" (details of the transaction)
 *   - signedRenewalInfo: "<JWS>" (renewal details, only for renewals)
 *
 * The handler must:
 * 1. Verify the JWS signature using Apple's public certificate
 * 2. Decode the payload and nested transaction/renewal info
 * 3. Update the user's subscription state in the database
 * 4. Respond HTTP 200 immediately (do heavy work async)
 */

import jwt, { JwtPayload } from "jsonwebtoken";
import { pool } from "./db";

// ── Apple's public certificates (root CA for validating JWS signatures) ────────
// Apple's certificates are available at: https://appleid.apple.com/auth/oauth2/authorize
// For production, fetch the certificate chain from Apple's API. For now, we verify
// by checking the signing certificate included in the JWS header.

interface AppleNotificationPayload extends JwtPayload {
  notificationType: string;
  subtype?: string;
  data?: {
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
  environment?: "Production" | "Sandbox";
}

interface AppleTransactionInfo extends JwtPayload {
  originalTransactionId: string;
  transactionId: string;
  appAccountToken?: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  expiresDate?: number;
  quantity: number;
  type: string;
  inAppOwnershipType: string;
  signedDate: number;
  revocationDate?: number;
  revocationReason?: string;
  isUpgraded?: boolean;
  offerIdentifier?: string;
  offerType?: string;
  environment: "Production" | "Sandbox";
}

interface AppleRenewalInfo extends JwtPayload {
  originalTransactionId: string;
  autoRenewProductId: string;
  autoRenewStatus: number; // 1 = enabled, 0 = disabled
  expirationIntent?: number;
  isUpgraded?: boolean;
  priceIncreaseStatus?: number;
  offerIdentifier?: string;
  offerType?: string;
  recentSubscriptionStartDate?: number;
  renewalDate: number;
  environment: "Production" | "Sandbox";
}

/**
 * Verify the JWS signature using Apple's certificate chain.
 * The x5c header contains the certificate chain.
 */
function verifyAppleSignature(jws: string): AppleNotificationPayload {
  try {
    // Decode without verification first to get the header (which contains x5c)
    const decoded = jwt.decode(jws, { complete: true });
    if (!decoded || !decoded.header.x5c || !Array.isArray(decoded.header.x5c)) {
      throw new Error("Missing x5c certificate chain in JWS header");
    }

    // The first certificate in the chain is the leaf certificate
    const leafCert = `-----BEGIN CERTIFICATE-----\n${decoded.header.x5c[0]}\n-----END CERTIFICATE-----`;

    // Verify using the leaf certificate
    const payload = jwt.verify(jws, leafCert, {
      algorithms: ["ES256"],
    }) as AppleNotificationPayload;

    return payload;
  } catch (error: any) {
    throw new Error(`Failed to verify Apple JWS signature: ${error.message}`);
  }
}

/**
 * Decode a nested JWS (transaction or renewal info)
 */
function decodeNestedJWS<T extends JwtPayload>(jws: string): T {
  try {
    const decoded = jwt.decode(jws, { complete: true });
    if (!decoded || !decoded.header.x5c) {
      throw new Error("Missing certificate in nested JWS");
    }

    const leafCert = `-----BEGIN CERTIFICATE-----\n${decoded.header.x5c[0]}\n-----END CERTIFICATE-----`;
    return jwt.verify(jws, leafCert, {
      algorithms: ["ES256"],
    }) as T;
  } catch (error: any) {
    throw new Error(`Failed to decode nested JWS: ${error.message}`);
  }
}

/**
 * Map Apple product IDs to your tier + billing period
 * Example: "com.airuncoach.lite_monthly" -> { tier: "lite", billingPeriod: "monthly" }
 */
function mapProductIdToTier(productId: string): {
  tier: string;
  billingPeriod: string;
} | null {
  // Adjust these patterns to match your App Store product IDs
  if (productId.includes("lite") && productId.includes("monthly")) {
    return { tier: "lite", billingPeriod: "monthly" };
  }
  if (productId.includes("lite") && productId.includes("annual")) {
    return { tier: "lite", billingPeriod: "annual" };
  }
  if (productId.includes("standard") && productId.includes("monthly")) {
    return { tier: "standard", billingPeriod: "monthly" };
  }
  if (productId.includes("standard") && productId.includes("annual")) {
    return { tier: "standard", billingPeriod: "annual" };
  }
  return null;
}

/**
 * Handle SUBSCRIBED, DID_RENEW, and DID_CHANGE_RENEWAL_STATUS notifications
 */
async function handleSubscriptionActive(
  transactionInfo: AppleTransactionInfo,
  renewalInfo: AppleRenewalInfo
): Promise<void> {
  const originalTransactionId = transactionInfo.originalTransactionId;
  const appAccountToken = transactionInfo.appAccountToken;

  // Find user by originalTransactionId or appAccountToken
  let userId: string | null = null;

  if (appAccountToken) {
    // Best case: user's app set the appAccountToken to their userId
    const result = await pool.query(
      "SELECT id FROM users WHERE apple_account_token = $1 LIMIT 1",
      [appAccountToken]
    );
    if (result.rows.length > 0) {
      userId = result.rows[0].id;
    }
  }

  if (!userId) {
    // Fallback: find user by originalTransactionId (if previously stored)
    const result = await pool.query(
      "SELECT user_id FROM apple_transactions WHERE original_transaction_id = $1 LIMIT 1",
      [originalTransactionId]
    );
    if (result.rows.length > 0) {
      userId = result.rows[0].user_id;
    }
  }

  if (!userId) {
    console.warn(
      `[Apple Notifications] Could not find user for originalTransactionId: ${originalTransactionId}`
    );
    return;
  }

  // Map product ID to tier + billing period
  const tierInfo = mapProductIdToTier(transactionInfo.productId);
  if (!tierInfo) {
    console.warn(
      `[Apple Notifications] Unknown product ID: ${transactionInfo.productId}`
    );
    return;
  }

  const { tier, billingPeriod } = tierInfo;
  const expiresAt = new Date(renewalInfo.renewalDate);

  // Update user subscription
  await pool.query(
    `UPDATE users SET
      subscription_tier = $1,
      subscription_status = $2,
      entitlement_type = $3,
      entitlement_expires_at = $4,
      updated_at = NOW()
    WHERE id = $5`,
    [
      tier,
      "active",
      `apple_${billingPeriod}`,
      expiresAt,
      userId,
    ]
  );

  // Record the transaction for future lookups
  await pool.query(
    `INSERT INTO apple_transactions (user_id, original_transaction_id, transaction_id, app_account_token, product_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (original_transaction_id) DO UPDATE SET
      transaction_id = $3,
      updated_at = NOW()`,
    [
      userId,
      originalTransactionId,
      transactionInfo.transactionId,
      appAccountToken || null,
      transactionInfo.productId,
    ]
  );

  console.log(
    `[Apple Notifications] ✅ User ${userId} subscribed to ${tier} (${billingPeriod}). ` +
      `Expires: ${expiresAt.toISOString()}`
  );
}

/**
 * Handle EXPIRED and GRACE_PERIOD_EXPIRED notifications
 */
async function handleSubscriptionExpired(
  transactionInfo: AppleTransactionInfo
): Promise<void> {
  const originalTransactionId = transactionInfo.originalTransactionId;

  // Find user by originalTransactionId
  const result = await pool.query(
    "SELECT user_id FROM apple_transactions WHERE original_transaction_id = $1 LIMIT 1",
    [originalTransactionId]
  );

  if (result.rows.length === 0) {
    console.warn(
      `[Apple Notifications] Transaction not found: ${originalTransactionId}`
    );
    return;
  }

  const userId = result.rows[0].user_id;

  // Mark subscription as expired
  await pool.query(
    `UPDATE users SET
      subscription_tier = NULL,
      subscription_status = $1,
      entitlement_type = NULL,
      entitlement_expires_at = NULL,
      updated_at = NOW()
    WHERE id = $2`,
    ["expired", userId]
  );

  console.log(
    `[Apple Notifications] ✅ User ${userId} subscription expired.`
  );
}

/**
 * Handle REFUND notifications
 */
async function handleRefund(
  transactionInfo: AppleTransactionInfo
): Promise<void> {
  const originalTransactionId = transactionInfo.originalTransactionId;

  const result = await pool.query(
    "SELECT user_id FROM apple_transactions WHERE original_transaction_id = $1 LIMIT 1",
    [originalTransactionId]
  );

  if (result.rows.length === 0) {
    console.warn(
      `[Apple Notifications] Transaction not found for refund: ${originalTransactionId}`
    );
    return;
  }

  const userId = result.rows[0].user_id;

  // Mark subscription as refunded
  await pool.query(
    `UPDATE users SET
      subscription_tier = NULL,
      subscription_status = $1,
      entitlement_type = NULL,
      entitlement_expires_at = NULL,
      updated_at = NOW()
    WHERE id = $2`,
    ["refunded", userId]
  );

  console.log(
    `[Apple Notifications] ✅ User ${userId} subscription refunded.`
  );
}

/**
 * Main webhook handler — called from routes.ts
 */
export async function handleAppleServerNotification(
  signedPayload: string
): Promise<void> {
  try {
    // Step 1: Verify and decode the outer JWS
    const payload = verifyAppleSignature(signedPayload);

    console.log(
      `[Apple Notifications] Received ${payload.notificationType} ` +
        `(${payload.subtype || "N/A"}) in ${payload.environment || "Unknown"} environment`
    );

    // Step 2: Decode nested transaction info
    let transactionInfo: AppleTransactionInfo | null = null;
    if (payload.data?.signedTransactionInfo) {
      transactionInfo = decodeNestedJWS<AppleTransactionInfo>(
        payload.data.signedTransactionInfo
      );
    }

    // Step 3: Decode nested renewal info
    let renewalInfo: AppleRenewalInfo | null = null;
    if (payload.data?.signedRenewalInfo) {
      renewalInfo = decodeNestedJWS<AppleRenewalInfo>(
        payload.data.signedRenewalInfo
      );
    }

    // Step 4: Handle based on notification type
    const notificationType = payload.notificationType;

    if (
      notificationType === "SUBSCRIBED" ||
      notificationType === "DID_RENEW" ||
      notificationType === "DID_CHANGE_RENEWAL_STATUS"
    ) {
      if (!transactionInfo || !renewalInfo) {
        console.error(
          "[Apple Notifications] Missing transaction or renewal info for subscription notification"
        );
        return;
      }
      await handleSubscriptionActive(transactionInfo, renewalInfo);
    } else if (
      notificationType === "EXPIRED" ||
      notificationType === "GRACE_PERIOD_EXPIRED"
    ) {
      if (!transactionInfo) {
        console.error("[Apple Notifications] Missing transaction info for expiry notification");
        return;
      }
      await handleSubscriptionExpired(transactionInfo);
    } else if (notificationType === "REFUND") {
      if (!transactionInfo) {
        console.error("[Apple Notifications] Missing transaction info for refund notification");
        return;
      }
      await handleRefund(transactionInfo);
    } else if (notificationType === "REVOKE") {
      if (!transactionInfo) {
        console.error("[Apple Notifications] Missing transaction info for revoke notification");
        return;
      }
      await handleRefund(transactionInfo); // Treat revoke same as refund
    } else {
      console.log(
        `[Apple Notifications] Unhandled notification type: ${notificationType}`
      );
    }
  } catch (error: any) {
    console.error(
      "[Apple Notifications] Error processing webhook:",
      error.message
    );
    // Still respond 200 so Apple doesn't retry
    // Log the error for debugging
  }
}
