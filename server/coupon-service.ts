/**
 * Coupon/Promo Code Service
 * 
 * Handles redemption of promotional codes that grant unlimited access
 * to specific features (training plans, routes, analyses, etc.)
 */

import { sql, eq, and, gt } from "drizzle-orm";
import { db } from "./db";
import { couponCodes, userCoupons } from "@shared/schema";

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
    // Trim the code (don't uppercase - database stores original case)
    const normalizedCode = code.trim();

    // Fetch the coupon using Drizzle ORM (case-insensitive using ILIKE or exact match)
    const couponRecords = await db
      .select()
      .from(couponCodes)
      .where(
        and(
          sql`LOWER(${couponCodes.code}) = LOWER(${normalizedCode})`,
          eq(couponCodes.isActive, true)
        )
      )
      .limit(1);

    if (couponRecords.length === 0) {
      return {
        success: false,
        message: "Invalid or expired promo code. Please check and try again.",
      };
    }

    const couponRecord = couponRecords[0];

    // Check if expired
    if (couponRecord.expiresAt && new Date(couponRecord.expiresAt) < new Date()) {
      return {
        success: false,
        message: "This promo code has expired.",
      };
    }

    // Check max uses
    if (
      couponRecord.maxUses &&
      couponRecord.currentUses >= couponRecord.maxUses
    ) {
      return {
        success: false,
        message: "This promo code has reached its usage limit.",
      };
    }

    // Check if user already redeemed this coupon
    const existingUses = await db
      .select()
      .from(userCoupons)
      .where(
        and(
          eq(userCoupons.userId, userId),
          eq(userCoupons.couponId, couponRecord.id)
        )
      )
      .limit(1);

    if (existingUses.length > 0) {
      return {
        success: false,
        message: "You have already redeemed this promo code.",
      };
    }

    // Calculate expiration date (default: 30 days from now, or override from coupon)
    const durationDays = couponRecord.durationDays || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    // Create user coupon record using Drizzle ORM
    await db
      .insert(userCoupons)
      .values({
        userId,
        couponId: couponRecord.id,
        expiresAt,
      });

    // Increment coupon usage using Drizzle ORM
    await db
      .update(couponCodes)
      .set({ currentUses: sql`${couponCodes.currentUses} + 1` })
      .where(eq(couponCodes.id, couponRecord.id));

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

    // Check if user has an active coupon that grants this feature
    const activeCoupons = await db
      .select({ id: userCoupons.id })
      .from(userCoupons)
      .innerJoin(couponCodes, eq(userCoupons.couponId, couponCodes.id))
      .where(
        and(
          eq(userCoupons.userId, userId),
          gt(userCoupons.expiresAt, new Date()),
          eq(couponCodes.isActive, true),
          sql`${couponCodes.type} IN (${sql.join(allowedTypes, sql`, `)})`
        )
      )
      .limit(1);

    return activeCoupons.length > 0;
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
    const grants = await db
      .select({
        code: couponCodes.code,
        expiresAt: userCoupons.expiresAt,
        type: couponCodes.type,
      })
      .from(userCoupons)
      .innerJoin(couponCodes, eq(userCoupons.couponId, couponCodes.id))
      .where(
        and(
          eq(userCoupons.userId, userId),
          gt(userCoupons.expiresAt, new Date())
        )
      );

    return grants.map((grant) => ({
      code: grant.code,
      expiresAt: grant.expiresAt?.toISOString() ?? "",
      features:
        grant.type === "unlimited_all"
          ? ["training plans", "routes", "analyses"]
          : grant.type === "unlimited_plans"
            ? ["training plans"]
            : grant.type === "unlimited_routes"
              ? ["routes"]
              : ["analyses"],
    }));
  } catch (err) {
    console.error("[CouponService] Error fetching user grants:", err);
    return [];
  }
}
