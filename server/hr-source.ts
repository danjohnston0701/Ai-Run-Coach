// Does this runner have anything that measures heart rate?
//
// Plans used to give every session a heart-rate zone with BPM numbers, whether or not the runner
// could measure it. Karen (2026-11-23: no watch, no runs) got "Zone 2, 106–123 bpm" on every
// walk-run, a range a beginner leaves within a minute of jogging. A runner with no heart-rate
// source now gets effort targets only; zones appear once a source shows up (the next enrichment
// after a run with heart rate, or after an app reports a paired watch).
//
// Counted as a source: a run with heart rate, a Garmin watch app that has talked to us, an active
// Garmin/COROS/Samsung/Apple device link (Strava links don't count: Strava carries no live HR), or
// an app saying a heart-rate watch is paired (`hasHeartRateDevice` on plan generation, stored in
// users.heart_rate_device_reported_at).

import { and, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { connectedDevices, runs, users } from "@shared/schema";

const HR_DEVICE_TYPES = ["garmin", "coros", "samsung", "apple"];

/** Records an app's report that a heart-rate watch is paired. */
export async function recordHeartRateDeviceReported(userId: string): Promise<void> {
  try {
    await db.update(users).set({ heartRateDeviceReportedAt: new Date() } as any).where(eq(users.id, userId));
  } catch (err: any) {
    console.warn(`[HRSource] Could not record HR device for ${userId}:`, err?.message ?? err);
  }
}

export async function userHasHeartRateSource(userId: string): Promise<boolean> {
  try {
    const [u] = await db
      .select({ reported: users.heartRateDeviceReportedAt, garminApp: users.hasGarminWatchApp, garminVer: users.garminWatchAppVersion })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (u?.reported || u?.garminApp || u?.garminVer) return true;

    const [device] = await db.select({ id: connectedDevices.id }).from(connectedDevices)
      .where(and(
        eq(connectedDevices.userId, userId),
        eq(connectedDevices.isActive, true),
        inArray(connectedDevices.deviceType, HR_DEVICE_TYPES),
      )).limit(1);
    if (device) return true;

    const [hrRun] = await db.select({ id: runs.id }).from(runs)
      .where(and(eq(runs.userId, userId), isNotNull(runs.avgHeartRate), gt(runs.avgHeartRate, 0)))
      .limit(1);
    return !!hrRun;
  } catch (err: any) {
    // Unknown: keep the old behaviour (zones) rather than strip them on a DB hiccup.
    console.warn(`[HRSource] Check failed for ${userId}:`, err?.message ?? err);
    return true;
  }
}
