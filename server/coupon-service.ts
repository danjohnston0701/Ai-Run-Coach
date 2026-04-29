/**
 * Coupon/Promo Code Service
 * 
 * Handles redemption of promotional codes that grant unlimited access
 * to specific features (training plans, routes, analyses, etc.)
 */

import { sql } from "drizzle-orm";
import { db } from "./db";

export interface PromoCodeRedemption {
  success: boolean;
  message: string;
  grantedUntil?: string; // ISO timestamp
  features?: string[]; // Which features are now unlimited
}

/**
 * Redeem a promo code for unlimited access to features
 */
export async function redeemPromoCode(
  userId: string,
  code: string
): Promise<PromoCodeRedemption> {
  try {
    // Trim and uppercase the code
    const normalizedCode = code.trim().toUpperCase();

    // Fetch the coupon from database
    const couponResult = await db.execute(
      sql`SELECT * FROM coupon_codes WHERE UPPER(code) = ${normalizedCode} AND is_active = true`
    );

    if (!couponResult.length) {
      return {
        success: false,
        message: "Invalid or expired promo code. Please check and try again.",
      };
    }

    const couponRecord = couponResult[0];

    // Check if expired
    if (couponRecord.expires_at && new Date(couponRecord.expires_at) < new Date()) {
      return {
        success: false,
        message: "This promo code has expired.",
      };
    }

    // Check max uses
    if (
      couponRecord.max_uses &&
      couponRecord.current_uses >= couponRecord.max_uses
    ) {
      return {
        success: false,
        message: "This promo code has reached its usage limit.",
      };
    }

    // Check if user already redeemed this coupon
    const existingUse = await db.execute(
      sql`SELECT * FROM user_coupons WHERE user_id = ${userId} AND coupon_id = ${couponRecord.id}`
    );

    if (existingUse.length) {
      return {
        success: false,
        message: "You have already redeemed this promo code.",
      };
    }

    // Calculate expiration date (default: 30 days from now, or override from coupon)
    const durationDays = couponRecord.duration_days || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    // Create user coupon record
    await db.execute(
      sql`INSERT INTO user_coupons (user_id, coupon_id, expires_at) VALUES (${userId}, ${couponRecord.id}, ${expiresAt.toISOString()})`
    );

    // Increment coupon usage
    await db.execute(
      sql`UPDATE coupon_codes SET current_uses = current_uses + 1 WHERE id = ${couponRecord.id}`
    );

    // Determine which features this code grants
    const features = ["trainingPlansGenerated", "routesGenerated", "postRunAnalyses"];
    if (couponRecord.type === "unlimited_all") {
      // All features get unlimited
    } else if (couponRecord.type === "unlimited_plans") {
      features.length = 0;
      features.push("trainingPlansGenerated");
    } else if (couponRecord.type === "unlimited_routes") {
      features.length = 0;
      features.push("routesGenerated");
    }

    return {
      success: true,
      message: `🎉 Promo code applied! You now have unlimited ${features.join(", ")} until ${expiresAt.toLocaleDateString()}.`,
      grantedUntil: expiresAt.toISOString(),
      features,
    };
  } catch (err) {
    console.error("[CouponService] Error redeeming promo code:", err);
    return {
      success: false,
      message: "An error occurred while redeeming the promo code. Please try again.",
    };
  }
}

/**
 * Map from internal feature keys to the coupon types that grant unlimited access to them.
 * "unlimited_all" always grants access to every feature.
 */
const FEATURE_TO_COUPON_TYPES: Record<string, string[]> = {
  aiCoachingKm:            ["unlimited_all", "unlimited_coaching"],
  trainingPlansGenerated:  ["unlimited_all", "unlimited_plans"],
  routesGenerated:         ["unlimited_all", "unlimited_routes"],
  postRunAnalyses:         ["unlimited_all", "unlimited_analyses"],
};

/**
 * Check if a user has an active unlimited grant for a specific feature.
 * Only returns true if the user's active coupon type covers the requested feature.
 */
export async function hasUnlimitedGrant(
  userId: string,
  feature: string
): Promise<boolean> {
  try {
    const allowedTypes = FEATURE_TO_COUPON_TYPES[feature];
    // Unknown feature key — don't grant unlimited access
    if (!allowedTypes || allowedTypes.length === 0) return false;

    // Build a parameterised IN list
    const typeList = allowedTypes.map((t) => `'${t}'`).join(", ");

    const result = await db.execute(
      sql`
      SELECT COUNT(*) as count FROM user_coupons uc
      JOIN coupon_codes cc ON uc.coupon_id = cc.id
      WHERE uc.user_id = ${userId}
        AND uc.expires_at > NOW()
        AND cc.is_active = true
        AND cc.type IN (${sql.raw(typeList)})
      `
    );

    return parseInt(String(result[0]?.count ?? "0")) > 0;
  } catch (err) {
    console.error("[CouponService] Error checking unlimited grant:", err);
    return false;
  }
}

/**
 * Get user's active promo code grants
 */
export async function getUserActiveGrants(
  userId: string
): Promise<
  Array<{
    code: string;
    expiresAt: string;
    features: string[];
  }>
> {
  try {
    const result = await db.execute(
      sql`
      SELECT cc.code, uc.expires_at, cc.type FROM user_coupons uc
      JOIN coupon_codes cc ON uc.coupon_id = cc.id
      WHERE uc.user_id = ${userId} AND uc.expires_at > NOW()
      ORDER BY uc.expires_at DESC
      `
    );

    return result.map((row) => ({
      code: row.code,
      expiresAt: row.expires_at,
      features:
        row.type === "unlimited_all"
          ? ["training plans", "routes", "analyses"]
          : row.type === "unlimited_plans"
            ? ["training plans"]
            : row.type === "unlimited_routes"
              ? ["routes"]
              : ["analyses"],
    }));
  } catch (err) {
    console.error("[CouponService] Error fetching user grants:", err);
    return [];
  }
}
