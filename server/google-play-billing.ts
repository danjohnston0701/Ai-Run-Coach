/**
 * Google Play subscription lifecycle — the Android counterpart of
 * `apple-server-notifications.ts`.
 *
 * Before this module existed a Play subscriber kept `lite`/`standard` forever after
 * cancelling: `POST /api/subscriptions/verify-purchase` trusted the client-supplied
 * productId, guessed `entitlement_expires_at = now + 1 period`, stored no purchase-token
 * → user mapping, and nothing ever enforced the guessed date.
 *
 * Three pieces close that gap:
 *
 *  1. **Server-side verification** — `verifyAndApplyPurchase()` calls the Play Developer
 *     API (`purchases.subscriptionsv2.get`) with a service account and applies the *real*
 *     state + expiry. Falls back to the old trust-the-client behaviour (with a warning)
 *     when `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` is not configured, but still records the
 *     purchase token so the reconcile below can catch up once it is.
 *  2. **RTDN (Real-time Developer Notifications)** — `handleRtdnMessage()` decodes the
 *     Pub/Sub push body and re-fetches the subscription from the API (the notification is
 *     only a hint — the API response is the source of truth).
 *  3. **Hourly reconcile** — `reconcileGooglePlaySubscriptions()` (scheduler.ts) re-checks
 *     every recorded token whose expiry has passed, and every user still marked active on a
 *     `google_play_*` entitlement past its `entitlement_expires_at`. This is the safety net
 *     for missed/undelivered RTDNs and for the pre-existing guessed expiry dates.
 *
 * Token → user mapping lives in `google_play_transactions` (raw `pool` queries, same as
 * `apple_transactions`; created by auto-migrate.ts and `migrations/20260918_google_play_transactions.sql`).
 *
 * Service-account auth needs no new npm deps: `jsonwebtoken` signs the RS256 assertion.
 * Setup (Daniel): GCP service account → Play Console → Users & permissions → grant
 * "View financial data" + "Manage orders and subscriptions" for the app → JSON key into the
 * Replit secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (the whole file as one string).
 */

import jwt from "jsonwebtoken";
import { pool } from "./db";

export const GOOGLE_PLAY_PACKAGE_NAME = "live.airuncoach.airuncoach";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";

/**
 * How long a user with a `google_play_*` entitlement, an already-passed
 * `entitlement_expires_at` and **no recorded purchase token** (a pre-deploy subscriber
 * who hasn't opened the app since) is left alone before the reconcile clears the tier.
 * The date was a `now + 1 period` guess written on their last app open, so the grace
 * absorbs ordinary renewal-date drift. If it turns out they're still subscribed, the next
 * app open re-runs verify-purchase and restores the tier with the real expiry.
 */
const UNVERIFIABLE_EXPIRY_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

// ── Play Developer API types (subset of SubscriptionPurchaseV2) ───────────────────────────

export type SubscriptionState =
  | "SUBSCRIPTION_STATE_UNSPECIFIED"
  | "SUBSCRIPTION_STATE_PENDING"
  | "SUBSCRIPTION_STATE_ACTIVE"
  | "SUBSCRIPTION_STATE_PAUSED"
  | "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
  | "SUBSCRIPTION_STATE_ON_HOLD"
  | "SUBSCRIPTION_STATE_CANCELED"
  | "SUBSCRIPTION_STATE_EXPIRED"
  | "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED";

export interface SubscriptionPurchaseV2 {
  kind?: string;
  regionCode?: string;
  latestOrderId?: string;
  startTime?: string;
  subscriptionState?: SubscriptionState;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, never>;
  externalAccountIdentifiers?: {
    externalAccountId?: string;
    obfuscatedExternalAccountId?: string;
    obfuscatedExternalProfileId?: string;
  };
  lineItems?: Array<{
    productId: string;
    expiryTime?: string; // RFC 3339
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    prepaidPlan?: { allowExtendAfterTime?: string };
    offerDetails?: { basePlanId?: string; offerId?: string; offerTags?: string[] };
  }>;
}

/** States in which the subscriber still has access (CANCELED keeps access until expiryTime). */
const ENTITLED_STATES: ReadonlySet<string> = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED",
]);

export interface AppliedSubscriptionState {
  entitled: boolean;
  tier: string | null;
  billingPeriod: string | null;
  aiPlansEnabled: boolean;
  subscriptionStatus: string;
  subscriptionState: string;
  expiresAt: Date | null;
  /** True when the user row was left untouched (pending purchase, or another active token). */
  userUnchanged: boolean;
}

// ── Product ID → tier ────────────────────────────────────────────────────────────────────

/**
 * Same convention `verify-purchase` has always used:
 *   lite_monthly, lite_annual, standard_monthly, standard_annual,
 *   lite_noaiplan_monthly, lite_noaiplan_annual, standard_noaiplan_monthly, standard_noaiplan_annual
 */
export function mapPlayProductIdToTier(productId: string): {
  tier: string;
  billingPeriod: string;
  aiPlansEnabled: boolean;
} | null {
  let tier: string;
  if (productId.startsWith("lite")) {
    tier = "lite";
  } else if (productId.startsWith("standard")) {
    tier = "standard";
  } else {
    return null;
  }
  const billingPeriod = productId.endsWith("annual") ? "annual" : "monthly";
  const aiPlansEnabled = !productId.includes("noai");
  return { tier, billingPeriod, aiPlansEnabled };
}

// ── Service-account auth ─────────────────────────────────────────────────────────────────

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

let cachedServiceAccount: ServiceAccountKey | null | undefined;
let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

function loadServiceAccount(): ServiceAccountKey | null {
  if (cachedServiceAccount !== undefined) return cachedServiceAccount;
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    cachedServiceAccount = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("missing client_email / private_key");
    }
    cachedServiceAccount = {
      client_email: parsed.client_email,
      // Replit secrets sometimes flatten the PEM's newlines into literal "\n"
      private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
    };
  } catch (err: any) {
    console.error(`[Google Play] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not a valid service-account key: ${err.message}`);
    cachedServiceAccount = null;
  }
  return cachedServiceAccount;
}

/** True when server-side verification / RTDN / reconcile can actually call the Play API. */
export function isGooglePlayApiConfigured(): boolean {
  return loadServiceAccount() !== null;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs - 60_000 > now) {
    return cachedAccessToken.token;
  }

  const sa = loadServiceAccount();
  if (!sa) throw new Error("Google Play service account not configured");

  const iat = Math.floor(now / 1000);
  const assertion = jwt.sign(
    {
      iss: sa.client_email,
      scope: ANDROID_PUBLISHER_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat,
      exp: iat + 3600,
    },
    sa.private_key,
    { algorithm: "RS256" }
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth token exchange failed (${response.status}): ${text}`);
  }
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: json.access_token,
    expiresAtMs: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedAccessToken.token;
}

/** Thrown for transient API/network failures so callers (RTDN) can ask Pub/Sub to retry. */
export class GooglePlayApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "GooglePlayApiError";
  }
}

/** verify-purchase only: Google returned "no such token" for a purchase the device presented. */
export class PurchaseNotFoundError extends Error {
  constructor(purchaseToken: string) {
    super(`Google Play does not recognise purchase token ${purchaseToken.substring(0, 20)}...`);
    this.name = "PurchaseNotFoundError";
  }
}

/**
 * `purchases.subscriptionsv2.get`. Returns `null` when Google doesn't know the token
 * (404 / 410, or the 400 "purchase token was not found" family) — i.e. it's bogus or so old
 * it has been purged — which callers treat as "not entitled".
 */
export async function fetchSubscriptionV2(
  purchaseToken: string,
  packageName: string = GOOGLE_PLAY_PACKAGE_NAME
): Promise<SubscriptionPurchaseV2 | null> {
  const accessToken = await getAccessToken();
  const url =
    `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}` +
    `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (response.ok) {
    return (await response.json()) as SubscriptionPurchaseV2;
  }

  const text = await response.text();
  if (response.status === 404 || response.status === 410) {
    console.warn(`[Google Play] Token not found (${response.status}): ${purchaseToken.substring(0, 20)}...`);
    return null;
  }
  if (response.status === 400 && /not found|invalid.*token|purchaseTokenNotFound/i.test(text)) {
    console.warn(`[Google Play] Token rejected (400): ${text.substring(0, 200)}`);
    return null;
  }
  throw new GooglePlayApiError(
    `Play Developer API ${response.status} for token ${purchaseToken.substring(0, 20)}...: ${text.substring(0, 300)}`,
    response.status
  );
}

// ── Persistence ──────────────────────────────────────────────────────────────────────────

interface TransactionRow {
  user_id: string;
  purchase_token: string;
  product_id: string;
  package_name: string;
  subscription_state: string | null;
  expiry_time: Date | null;
}

async function findUserForToken(purchaseToken: string): Promise<string | null> {
  const result = await pool.query(
    "SELECT user_id FROM google_play_transactions WHERE purchase_token = $1 LIMIT 1",
    [purchaseToken]
  );
  return result.rows.length > 0 ? result.rows[0].user_id : null;
}

/** Pick the line item that expires last — that's the one that governs access. */
function primaryLineItem(sub: SubscriptionPurchaseV2) {
  const items = sub.lineItems ?? [];
  if (items.length === 0) return null;
  return items.reduce((best, item) => {
    const a = item.expiryTime ? Date.parse(item.expiryTime) : 0;
    const b = best.expiryTime ? Date.parse(best.expiryTime) : 0;
    return a > b ? item : best;
  });
}

/**
 * Upsert the token row and, when the subscription is/was entitled, update the user.
 *
 * `sub === null` means Google no longer knows the token → treated as expired.
 * `revoked` marks the user `refunded` rather than `expired` when the entitlement ends
 * (RTDN SUBSCRIPTION_REVOKED / voidedPurchaseNotification).
 */
export async function applySubscriptionState(
  userId: string,
  purchaseToken: string,
  packageName: string,
  sub: SubscriptionPurchaseV2 | null,
  opts: { fallbackProductId?: string; revoked?: boolean; source: string } = { source: "unknown" }
): Promise<AppliedSubscriptionState> {
  const lineItem = sub ? primaryLineItem(sub) : null;
  const productId = lineItem?.productId ?? opts.fallbackProductId ?? "unknown";
  const state: string = sub?.subscriptionState ?? "SUBSCRIPTION_STATE_EXPIRED";
  const expiresAt = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
  const autoRenewing = lineItem?.autoRenewingPlan?.autoRenewEnabled ?? false;
  const linkedPurchaseToken = sub?.linkedPurchaseToken ?? null;
  const now = Date.now();

  const entitled =
    ENTITLED_STATES.has(state) && expiresAt !== null && expiresAt.getTime() > now;

  const tierInfo = mapPlayProductIdToTier(productId);

  // ── Record / refresh the token → user mapping ───────────────────────────────────────
  await pool.query(
    `INSERT INTO google_play_transactions
       (user_id, purchase_token, product_id, package_name, linked_purchase_token,
        expiry_time, auto_renewing, subscription_state, last_checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (purchase_token) DO UPDATE SET
       user_id               = EXCLUDED.user_id,
       product_id            = EXCLUDED.product_id,
       linked_purchase_token = COALESCE(EXCLUDED.linked_purchase_token, google_play_transactions.linked_purchase_token),
       expiry_time           = EXCLUDED.expiry_time,
       auto_renewing         = EXCLUDED.auto_renewing,
       subscription_state    = EXCLUDED.subscription_state,
       last_checked_at       = NOW(),
       updated_at            = NOW()`,
    [userId, purchaseToken, productId, packageName, linkedPurchaseToken, expiresAt, autoRenewing, state]
  );

  // An upgrade/downgrade/resubscribe issues a new token and invalidates the linked old one.
  // Mark it so the reconcile doesn't keep re-fetching it and it never counts as "another
  // active token" below.
  if (linkedPurchaseToken) {
    await pool.query(
      `UPDATE google_play_transactions
         SET subscription_state = 'SUBSCRIPTION_STATE_EXPIRED', updated_at = NOW()
       WHERE purchase_token = $1 AND subscription_state <> 'SUBSCRIPTION_STATE_EXPIRED'`,
      [linkedPurchaseToken]
    );
  }

  const base: Omit<AppliedSubscriptionState, "userUnchanged" | "subscriptionStatus"> = {
    entitled,
    tier: tierInfo?.tier ?? null,
    billingPeriod: tierInfo?.billingPeriod ?? null,
    aiPlansEnabled: tierInfo?.aiPlansEnabled ?? true,
    subscriptionState: state,
    expiresAt,
  };

  // ── Entitled → grant/refresh ─────────────────────────────────────────────────────────
  if (entitled) {
    if (!tierInfo) {
      console.warn(`[Google Play] Unknown product ID '${productId}' on entitled token for user ${userId} (${opts.source})`);
      return { ...base, subscriptionStatus: "active", userUnchanged: true };
    }
    await pool.query(
      `UPDATE users SET
         subscription_tier      = $1,
         subscription_status    = 'active',
         entitlement_type       = $2,
         entitlement_expires_at = $3,
         ai_plans_enabled       = $4
       WHERE id = $5`,
      [tierInfo.tier, `google_play_${tierInfo.billingPeriod}`, expiresAt, tierInfo.aiPlansEnabled, userId]
    );
    console.log(
      `[Google Play] ✅ User ${userId} ${tierInfo.tier} (${tierInfo.billingPeriod}, AI Plans ` +
        `${tierInfo.aiPlansEnabled ? "on" : "off"}) — ${state}, expires ${expiresAt!.toISOString()} [${opts.source}]`
    );
    return { ...base, subscriptionStatus: "active", userUnchanged: false };
  }

  // ── Pending purchase (e.g. awaiting cash payment) → nothing to grant or revoke yet ──
  if (state === "SUBSCRIPTION_STATE_PENDING") {
    console.log(`[Google Play] User ${userId} token pending — no entitlement change [${opts.source}]`);
    return { ...base, subscriptionStatus: "pending", userUnchanged: true };
  }

  // ── Not entitled → clear the tier, but only if this token was the user's entitlement ─
  // Don't touch an Apple/coupon/manual entitlement, and don't downgrade a subscriber whose
  // *other* Play token (after an upgrade or resubscribe) is still live.
  const userResult = await pool.query(
    "SELECT entitlement_type, subscription_status FROM users WHERE id = $1",
    [userId]
  );
  const entitlementType: string | null = userResult.rows[0]?.entitlement_type ?? null;
  const isPlayEntitlement = !!entitlementType && entitlementType.startsWith("google_play");

  const otherActive = await pool.query(
    `SELECT 1 FROM google_play_transactions
      WHERE user_id = $1 AND purchase_token <> $2
        AND expiry_time > NOW()
        AND subscription_state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')
      LIMIT 1`,
    [userId, purchaseToken]
  );

  const newStatus = opts.revoked ? "refunded" : "expired";

  if (!isPlayEntitlement || otherActive.rows.length > 0) {
    console.log(
      `[Google Play] User ${userId} token ${state} but ` +
        `${!isPlayEntitlement ? `entitlement is '${entitlementType ?? "none"}'` : "another Play token is active"} — user untouched [${opts.source}]`
    );
    return { ...base, subscriptionStatus: userResult.rows[0]?.subscription_status ?? newStatus, userUnchanged: true };
  }

  await pool.query(
    `UPDATE users SET
       subscription_tier      = NULL,
       subscription_status    = $1,
       entitlement_type       = NULL,
       entitlement_expires_at = NULL
     WHERE id = $2`,
    [newStatus, userId]
  );
  console.log(`[Google Play] ⛔ User ${userId} subscription ${newStatus} (${state}) [${opts.source}]`);
  return { ...base, subscriptionStatus: newStatus, userUnchanged: false };
}

// ── verify-purchase (called from routes.ts) ──────────────────────────────────────────────

/**
 * Entry point for `POST /api/subscriptions/verify-purchase`. With the service account
 * configured this verifies the token with Google and applies the real state; without it,
 * it keeps the historical trust-the-client behaviour (guessed `now + 1 period` expiry) but
 * still records the token so the reconcile can verify it later.
 */
export async function verifyAndApplyPurchase(
  userId: string,
  purchaseToken: string,
  productId: string,
  packageName: string = GOOGLE_PLAY_PACKAGE_NAME
): Promise<AppliedSubscriptionState> {
  if (isGooglePlayApiConfigured()) {
    const sub = await fetchSubscriptionV2(purchaseToken, packageName);
    if (!sub) {
      // The device says it holds this purchase but Google doesn't recognise the token.
      // Refuse to grant, but don't revoke anything on the strength of a lookup miss —
      // RTDN/reconcile are the paths that treat "unknown token" as expired.
      throw new PurchaseNotFoundError(purchaseToken);
    }
    return applySubscriptionState(userId, purchaseToken, packageName, sub, {
      fallbackProductId: productId,
      source: "verify-purchase",
    });
  }

  // ── Unverified fallback ─────────────────────────────────────────────────────────────
  console.warn(
    `[Google Play] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not set — trusting client productId '${productId}' for user ${userId} (unverified)`
  );
  const tierInfo = mapPlayProductIdToTier(productId);
  if (!tierInfo) {
    throw new Error(`Unknown product ID: ${productId}`);
  }
  const expiresAt = new Date();
  if (tierInfo.billingPeriod === "annual") {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }
  const synthetic: SubscriptionPurchaseV2 = {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    lineItems: [{ productId, expiryTime: expiresAt.toISOString(), autoRenewingPlan: { autoRenewEnabled: true } }],
  };
  return applySubscriptionState(userId, purchaseToken, packageName, synthetic, {
    fallbackProductId: productId,
    source: "verify-purchase (unverified)",
  });
}

// ── RTDN ─────────────────────────────────────────────────────────────────────────────────

/** Pub/Sub push envelope. */
export interface PubSubPushBody {
  message?: {
    data?: string; // base64 JSON DeveloperNotification
    messageId?: string;
    publishTime?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
}

export interface DeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
  oneTimeProductNotification?: { version?: string; notificationType?: number; purchaseToken?: string; sku?: string };
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number; refundType?: number };
  testNotification?: { version?: string };
}

/** https://developer.android.com/google/play/billing/rtdn-reference#sub */
const SUBSCRIPTION_NOTIFICATION_NAMES: Record<number, string> = {
  1: "RECOVERED",
  2: "RENEWED",
  3: "CANCELED",
  4: "PURCHASED",
  5: "ON_HOLD",
  6: "IN_GRACE_PERIOD",
  7: "RESTARTED",
  8: "PRICE_CHANGE_CONFIRMED",
  9: "DEFERRED",
  10: "PAUSED",
  11: "PAUSE_SCHEDULE_CHANGED",
  12: "REVOKED",
  13: "EXPIRED",
  19: "PRICE_CHANGE_UPDATED",
  20: "PENDING_PURCHASE_CANCELED",
};

export function decodeRtdnBody(body: PubSubPushBody): DeveloperNotification | null {
  const data = body?.message?.data;
  if (!data) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64").toString("utf8")) as DeveloperNotification;
  } catch (err: any) {
    console.error(`[Google Play RTDN] Could not decode message data: ${err.message}`);
    return null;
  }
}

/**
 * Resolve the user for a token we've never seen (purchase pre-dates the transactions
 * table, or the verify-purchase call never reached us): the Android app sets
 * `setObfuscatedAccountId(userId)` on the billing flow, which Google echoes back as
 * `externalAccountIdentifiers.obfuscatedExternalAccountId`.
 */
async function resolveUserId(purchaseToken: string, sub: SubscriptionPurchaseV2 | null): Promise<string | null> {
  const known = await findUserForToken(purchaseToken);
  if (known) return known;

  const obfuscated = sub?.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  if (obfuscated) {
    const result = await pool.query("SELECT id FROM users WHERE LOWER(id) = LOWER($1) LIMIT 1", [obfuscated]);
    if (result.rows.length > 0) return result.rows[0].id;
  }

  // Upgrade/resubscribe: the new token's linkedPurchaseToken is one we may already know.
  if (sub?.linkedPurchaseToken) {
    const viaLinked = await findUserForToken(sub.linkedPurchaseToken);
    if (viaLinked) return viaLinked;
  }
  return null;
}

/**
 * Process one decoded RTDN. Throws `GooglePlayApiError` on transient Play API failures so
 * the route can return 5xx and let Pub/Sub redeliver; every other outcome resolves.
 */
export async function handleRtdnMessage(notification: DeveloperNotification): Promise<void> {
  if (notification.testNotification) {
    console.log("[Google Play RTDN] Test notification received — Pub/Sub wiring OK");
    return;
  }

  const packageName = notification.packageName || GOOGLE_PLAY_PACKAGE_NAME;
  if (packageName !== GOOGLE_PLAY_PACKAGE_NAME) {
    console.warn(`[Google Play RTDN] Ignoring notification for unexpected package ${packageName}`);
    return;
  }

  let purchaseToken: string | undefined;
  let revoked = false;
  let label: string;

  if (notification.subscriptionNotification) {
    const n = notification.subscriptionNotification;
    purchaseToken = n.purchaseToken;
    const type = n.notificationType ?? 0;
    label = `subscription ${SUBSCRIPTION_NOTIFICATION_NAMES[type] ?? type} (${n.subscriptionId ?? "?"})`;
    revoked = type === 12;
  } else if (notification.voidedPurchaseNotification) {
    const n = notification.voidedPurchaseNotification;
    purchaseToken = n.purchaseToken;
    label = `voided purchase (order ${n.orderId ?? "?"}, refundType ${n.refundType ?? "?"})`;
    revoked = true;
  } else if (notification.oneTimeProductNotification) {
    console.log("[Google Play RTDN] One-time product notification — nothing to do (no one-time products)");
    return;
  } else {
    console.warn("[Google Play RTDN] Notification without a recognised payload:", JSON.stringify(notification).substring(0, 300));
    return;
  }

  if (!purchaseToken) {
    console.warn(`[Google Play RTDN] ${label} had no purchaseToken`);
    return;
  }

  console.log(`[Google Play RTDN] ${label} — token ${purchaseToken.substring(0, 20)}...`);

  if (!isGooglePlayApiConfigured()) {
    console.warn("[Google Play RTDN] Service account not configured — cannot verify; ignoring");
    return;
  }

  // The notification is a hint; the API is the source of truth.
  const sub = await fetchSubscriptionV2(purchaseToken, packageName);
  const userId = await resolveUserId(purchaseToken, sub);
  if (!userId) {
    console.warn(`[Google Play RTDN] No user for token ${purchaseToken.substring(0, 20)}... — will be linked on the app's next verify-purchase`);
    return;
  }

  await applySubscriptionState(userId, purchaseToken, packageName, sub, {
    revoked,
    source: `rtdn:${label}`,
  });
}

// ── Hourly reconcile (scheduler.ts) ──────────────────────────────────────────────────────

export interface ReconcileResult {
  skipped: boolean;
  tokensChecked: number;
  usersChecked: number;
  entitlementsCleared: number;
  unverifiableCleared: number;
  errors: number;
}

/**
 * Safety net for missed RTDNs and for pre-existing guessed expiry dates:
 *  1. every recorded token still considered entitled whose `expiry_time` has passed;
 *  2. every user still `active` on a `google_play_*` entitlement past `entitlement_expires_at`
 *     — verified via their latest token, or (no token on file) cleared after a grace period.
 */
export async function reconcileGooglePlaySubscriptions(): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    skipped: false,
    tokensChecked: 0,
    usersChecked: 0,
    entitlementsCleared: 0,
    unverifiableCleared: 0,
    errors: 0,
  };

  if (!isGooglePlayApiConfigured()) {
    result.skipped = true;
    return result;
  }

  // ── 1. Lapsed tokens ────────────────────────────────────────────────────────────────
  const lapsed = await pool.query<TransactionRow>(
    `SELECT user_id, purchase_token, product_id, package_name, subscription_state, expiry_time
       FROM google_play_transactions
      WHERE expiry_time <= NOW()
        AND subscription_state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')
      ORDER BY expiry_time ASC
      LIMIT 500`
  );

  for (const row of lapsed.rows) {
    result.tokensChecked++;
    try {
      const sub = await fetchSubscriptionV2(row.purchase_token, row.package_name || GOOGLE_PLAY_PACKAGE_NAME);
      const applied = await applySubscriptionState(row.user_id, row.purchase_token, row.package_name || GOOGLE_PLAY_PACKAGE_NAME, sub, {
        fallbackProductId: row.product_id,
        source: "reconcile:lapsed-token",
      });
      if (!applied.entitled && !applied.userUnchanged) result.entitlementsCleared++;
    } catch (err: any) {
      result.errors++;
      console.error(`[Google Play reconcile] Token ${row.purchase_token.substring(0, 20)}... failed: ${err.message}`);
    }
  }

  // ── 2. Users past their entitlement date ────────────────────────────────────────────
  const staleUsers = await pool.query<{ id: string; entitlement_expires_at: Date; purchase_token: string | null; product_id: string | null; package_name: string | null }>(
    `SELECT u.id, u.entitlement_expires_at, t.purchase_token, t.product_id, t.package_name
       FROM users u
       LEFT JOIN LATERAL (
         SELECT purchase_token, product_id, package_name
           FROM google_play_transactions
          WHERE user_id = u.id
          ORDER BY (subscription_state <> 'SUBSCRIPTION_STATE_EXPIRED') DESC, expiry_time DESC NULLS LAST
          LIMIT 1
       ) t ON TRUE
      WHERE u.entitlement_type LIKE 'google_play_%'
        AND u.subscription_status = 'active'
        AND u.entitlement_expires_at IS NOT NULL
        AND u.entitlement_expires_at < NOW()
      LIMIT 500`
  );

  for (const row of staleUsers.rows) {
    result.usersChecked++;
    try {
      if (row.purchase_token) {
        const pkg = row.package_name || GOOGLE_PLAY_PACKAGE_NAME;
        const sub = await fetchSubscriptionV2(row.purchase_token, pkg);
        const applied = await applySubscriptionState(row.id, row.purchase_token, pkg, sub, {
          fallbackProductId: row.product_id ?? undefined,
          source: "reconcile:stale-user",
        });
        if (!applied.entitled && !applied.userUnchanged) result.entitlementsCleared++;
        continue;
      }

      // No token on file → pre-deploy subscriber. Give the guessed date a grace period,
      // then clear; the next app open re-verifies and restores if still subscribed.
      const overdueMs = Date.now() - new Date(row.entitlement_expires_at).getTime();
      if (overdueMs < UNVERIFIABLE_EXPIRY_GRACE_MS) continue;

      await pool.query(
        `UPDATE users SET
           subscription_tier      = NULL,
           subscription_status    = 'expired',
           entitlement_type       = NULL,
           entitlement_expires_at = NULL
         WHERE id = $1 AND entitlement_type LIKE 'google_play_%'`,
        [row.id]
      );
      result.unverifiableCleared++;
      console.log(
        `[Google Play reconcile] ⛔ User ${row.id} cleared — google_play entitlement ` +
          `${Math.round(overdueMs / 86_400_000)}d past guessed expiry with no purchase token on file`
      );
    } catch (err: any) {
      result.errors++;
      console.error(`[Google Play reconcile] User ${row.id} failed: ${err.message}`);
    }
  }

  return result;
}
