/**
 * Route Recognition Service — Route Memory Engine
 *
 * Detects when a user is starting a run on a known recurring route and returns
 * a Route Intelligence Packet to supercharge AI coaching with:
 *   - Historical split comparisons (vs last week, vs N-run average)
 *   - Elevation profile and notable segment warnings
 *   - Personal bests and trend data
 *
 * Architecture:
 *   1. `recognizeRoute()` — called at run start; multi-signal confidence score
 *   2. `updateKnownRoutes()` — called after run completes; builds/updates fingerprint
 *   3. Helper fns — Haversine, elevation profile, split averages
 *
 * Privacy: Only processes the calling user's own run data. No cross-user data.
 */

import { db } from "./db";
import { knownRoutes, runs } from "../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GPSPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp?: number;
}

export interface ElevationPoint {
  pct: number;    // 0.0–1.0 position along route
  altM: number;   // altitude in metres
}

export interface NotableSegment {
  name: string;
  startPct: number;
  endPct: number;
  gradient: number;       // average % gradient (positive = uphill)
  severity: "easy" | "moderate" | "hard" | "brutal";
  coachingNote: string;   // TTS-ready warning for the AI coach
}

export interface SplitProfile {
  km: number;
  avgSecPerKm: number;
  bestSecPerKm: number;
  worstSecPerKm: number;
  runCount: number;
}

export interface KmSplitData {
  km: number;
  time: number;   // seconds for that km
  pace: string;   // "mm:ss"
}

export interface ConfidenceBreakdown {
  gpsProximity:  { score: number; max: number; note: string };
  distanceMatch: { score: number; max: number; note: string };
  dayOfWeek:     { score: number; max: number; note: string };
  timeOfDay:     { score: number; max: number; note: string };
  runFrequency:  { score: number; max: number; note: string };
  total: number;
}

export interface SplitComparison {
  km: number;
  currentSecPerKm?: number;       // filled in during the run, null at start
  lastRunSecPerKm?: number;
  avgSecPerKm?: number;
  deltaVsLastRunSec?: number;     // positive = runner is faster
  deltaVsAvgSec?: number;
}

export interface RouteIntelligence {
  personalBest?: { timeMs: number; formatted: string; date: string };
  lastRunStats?: {
    timeMs: number;
    formatted: string;
    date: string;
    kmSplits: KmSplitData[];
  };
  averageSplits: SplitComparison[];
  splitCount: number;
  preRunBrief: string;   // AI-ready natural language summary
}

export interface RouteRecognitionResult {
  matched: boolean;
  confidence: number;          // 0.0–1.0
  confidenceLabel: "none" | "tentative" | "confident" | "certain";
  knownRoute: {
    id: string;
    name: string;
    runCount: number;
    typicalDistanceKm: number;
    terrainType: string;
    elevationProfile: ElevationPoint[];
    notableSegments: NotableSegment[];
  } | null;
  routeIntelligence: RouteIntelligence | null;
  confidenceBreakdown: ConfidenceBreakdown | null;
}

// ─── Haversine Distance ───────────────────────────────────────────────────────

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Confidence Scoring ───────────────────────────────────────────────────────

/**
 * Compute a 0–100 confidence score against a candidate known route.
 *
 * Weights:
 *   GPS proximity   40 pts  — within match radius = full score, linear decay
 *   Distance match  20 pts  — within ±10% of typical distance
 *   Day of week     15 pts  — same day(s) as historical pattern
 *   Time of day     10 pts  — within ±20 minutes of typical start
 *   Run frequency   10 pts  — ≥3 runs = full score, linear from 2
 *   Recency          5 pts  — ran this route in the last 6 weeks
 */
function scoreCandidate(
  candidate: any,
  lat: number,
  lng: number,
  timestamp: Date,
  intendedDistanceKm?: number
): ConfidenceBreakdown {
  // ── 1. GPS Proximity (40 pts) ──────────────────────────────────────────────
  const distM = haversineMetres(lat, lng, candidate.startLat, candidate.startLng);
  const radius = candidate.startRadiusM ?? 75;
  let gpsScore: number;
  if (distM <= radius) {
    gpsScore = 40;
  } else if (distM <= radius * 4) {
    // Linear decay from full radius to 4× radius
    gpsScore = Math.round(40 * (1 - (distM - radius) / (radius * 3)));
  } else {
    gpsScore = 0;
  }

  // ── 2. Distance Match (20 pts) ─────────────────────────────────────────────
  let distScore = 0;
  const typicalKm = candidate.typicalDistanceKm;
  if (intendedDistanceKm && typicalKm && typicalKm > 0) {
    const pctDiff = Math.abs(intendedDistanceKm - typicalKm) / typicalKm;
    if (pctDiff <= 0.05) distScore = 20;
    else if (pctDiff <= 0.10) distScore = 15;
    else if (pctDiff <= 0.20) distScore = 8;
    else distScore = 0;
  } else if (!intendedDistanceKm) {
    // No target distance provided — give partial credit (not penalise)
    distScore = 10;
  }

  // ── 3. Day of Week (15 pts) ───────────────────────────────────────────────
  const currentDay = timestamp.getDay(); // 0=Sun, 6=Sat
  const typicalDays: number[] = (candidate.typicalDaysOfWeek as number[]) ?? [];
  let dayScore = 0;
  if (typicalDays.length === 0) {
    dayScore = 7; // No pattern yet — partial credit
  } else if (typicalDays.includes(currentDay)) {
    dayScore = 15;
  } else {
    dayScore = 0;
  }

  // ── 4. Time of Day (10 pts) ───────────────────────────────────────────────
  const currentHour = timestamp.getHours();
  const currentMin = timestamp.getMinutes();
  const currentTotalMin = currentHour * 60 + currentMin;
  const typicalTotalMin =
    (candidate.typicalStartHour ?? 0) * 60 + (candidate.typicalStartMinute ?? 0);
  let timeScore = 0;
  if (candidate.typicalStartHour === null || candidate.typicalStartHour === undefined) {
    timeScore = 5; // No pattern yet — partial
  } else {
    const timeDiffMin = Math.abs(currentTotalMin - typicalTotalMin);
    if (timeDiffMin <= 10) timeScore = 10;
    else if (timeDiffMin <= 20) timeScore = 7;
    else if (timeDiffMin <= 45) timeScore = 3;
    else timeScore = 0;
  }

  // ── 5. Run Frequency (10 pts) ─────────────────────────────────────────────
  const runCount: number = candidate.runCount ?? 0;
  let freqScore: number;
  if (runCount >= 4) freqScore = 10;
  else if (runCount === 3) freqScore = 8;
  else if (runCount === 2) freqScore = 5;
  else freqScore = 0;

  // ── 6. Recency (5 pts) ────────────────────────────────────────────────────
  let recencyScore = 0;
  if (candidate.lastRunAt) {
    const daysSinceLastRun =
      (Date.now() - new Date(candidate.lastRunAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastRun <= 14) recencyScore = 5;
    else if (daysSinceLastRun <= 42) recencyScore = 3;
    else recencyScore = 1;
  }

  const total = gpsScore + distScore + dayScore + timeScore + freqScore + recencyScore;

  return {
    gpsProximity:  { score: gpsScore,  max: 40, note: `${Math.round(distM)}m from usual start` },
    distanceMatch: { score: distScore, max: 20, note: intendedDistanceKm ? `${intendedDistanceKm}km intended, typical ${typicalKm?.toFixed(1)}km` : "No target distance" },
    dayOfWeek:     { score: dayScore,  max: 15, note: typicalDays.length ? `Day ${currentDay}, typical days: [${typicalDays.join(",")}]` : "No day pattern yet" },
    timeOfDay:     { score: timeScore, max: 10, note: `${currentHour}:${String(currentMin).padStart(2,"0")}, typical ${candidate.typicalStartHour ?? "?"}:${String(candidate.typicalStartMinute ?? 0).padStart(2,"0")}` },
    runFrequency:  { score: freqScore, max: 10, note: `${runCount} previous runs on this route` },
    total: Math.min(100, total),
  };
}

function confidenceLabel(score: number): "none" | "tentative" | "confident" | "certain" {
  if (score >= 80) return "certain";
  if (score >= 60) return "confident";
  if (score >= 40) return "tentative";
  return "none";
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${m}:${String(s).padStart(2,"0")}`;
}

function formatSecPerKm(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2,"0")}`;
}

function friendlyDate(d: Date | string): string {
  const date = new Date(d);
  const diffDays = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "last week";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── Build split comparisons from profiles + last run ─────────────────────────

function buildSplitComparisons(
  splitProfiles: SplitProfile[],
  lastRunSplits: KmSplitData[]
): SplitComparison[] {
  return splitProfiles.map((profile) => {
    const lastRunKm = lastRunSplits.find((s) => s.km === profile.km);
    return {
      km: profile.km,
      avgSecPerKm: profile.avgSecPerKm,
      lastRunSecPerKm: lastRunKm ? lastRunKm.time : undefined,
    };
  });
}

// ─── Build natural language pre-run brief ─────────────────────────────────────

function buildPreRunBrief(
  route: any,
  intelligence: Omit<RouteIntelligence, "preRunBrief">,
  confidence: number
): string {
  const lines: string[] = [];
  const name = route.displayName || route.name || "this route";
  const runs = route.runCount;

  // Opening
  if (confidence >= 80) {
    lines.push(`${name} recognised — ${runs} previous ${runs === 1 ? "run" : "runs"} loaded.`);
  } else {
    lines.push(`This looks like ${name} — loading ${runs} previous ${runs === 1 ? "run" : "runs"}.`);
  }

  // PB + last run
  if (intelligence.personalBest) {
    lines.push(`Your PB here is ${intelligence.personalBest.formatted} (${intelligence.personalBest.date}).`);
  }
  if (intelligence.lastRunStats) {
    lines.push(`Last time: ${intelligence.lastRunStats.formatted} (${intelligence.lastRunStats.date}).`);
  }

  // Notable terrain
  const notableSegs: NotableSegment[] = (route.notableSegments as NotableSegment[]) ?? [];
  const hardSegs = notableSegs.filter((s) => s.severity === "hard" || s.severity === "brutal");
  if (hardSegs.length > 0) {
    const seg = hardSegs[0];
    const pctPos = Math.round(seg.startPct * 100);
    lines.push(`Watch out for the ${seg.name} at ${pctPos}% — ${seg.coachingNote}`);
  }

  return lines.join(" ");
}

// ─── Main: recognizeRoute ─────────────────────────────────────────────────────

/**
 * Called at run start (first stable GPS fix).
 * Looks up the user's known routes, scores each against current signals,
 * and returns the best match if confidence ≥ 40%.
 */
export async function recognizeRoute(
  userId: string,
  lat: number,
  lng: number,
  timestamp: Date,
  intendedDistanceKm?: number
): Promise<RouteRecognitionResult> {
  // 1. Fetch all known routes for this user
  const candidates = await db
    .select()
    .from(knownRoutes)
    .where(eq(knownRoutes.userId, userId));

  if (candidates.length === 0) {
    return { matched: false, confidence: 0, confidenceLabel: "none", knownRoute: null, routeIntelligence: null, confidenceBreakdown: null };
  }

  // 2. Score every candidate and pick the best
  let bestCandidate: any = null;
  let bestBreakdown: ConfidenceBreakdown | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const breakdown = scoreCandidate(candidate, lat, lng, timestamp, intendedDistanceKm);
    if (breakdown.total > bestScore) {
      bestScore = breakdown.total;
      bestCandidate = candidate;
      bestBreakdown = breakdown;
    }
  }

  const score01 = bestScore / 100;
  const label = confidenceLabel(bestScore);

  if (bestScore < 40 || !bestCandidate) {
    return { matched: false, confidence: score01, confidenceLabel: label, knownRoute: null, routeIntelligence: null, confidenceBreakdown: bestBreakdown };
  }

  // 3. Build Route Intelligence Packet from constituent runs
  const constituentIds: string[] = (bestCandidate.constituentRunIds as string[]) ?? [];
  const intelligence = await buildRouteIntelligence(bestCandidate, constituentIds);

  return {
    matched: true,
    confidence: Math.round(score01 * 100) / 100,
    confidenceLabel: label,
    knownRoute: {
      id: bestCandidate.id,
      name: bestCandidate.displayName || bestCandidate.name || "Known Route",
      runCount: bestCandidate.runCount ?? 0,
      typicalDistanceKm: bestCandidate.typicalDistanceKm ?? 0,
      terrainType: bestCandidate.terrainType ?? "road",
      elevationProfile: (bestCandidate.elevationProfile as ElevationPoint[]) ?? [],
      notableSegments: (bestCandidate.notableSegments as NotableSegment[]) ?? [],
    },
    routeIntelligence: intelligence,
    confidenceBreakdown: bestBreakdown,
  };
}

// ─── Build Route Intelligence from run history ────────────────────────────────

async function buildRouteIntelligence(
  route: any,
  runIds: string[]
): Promise<RouteIntelligence> {
  if (runIds.length === 0) {
    return { averageSplits: [], splitCount: 0, preRunBrief: "" };
  }

  // Fetch constituent runs ordered by date (newest first)
  const historicalRuns = await db
    .select({
      id: runs.id,
      duration: runs.duration,
      completedAt: runs.completedAt,
      kmSplits: runs.kmSplits,
      distance: runs.distance,
    })
    .from(runs)
    .where(and(eq(runs.userId, route.userId)))
    .orderBy(desc(runs.completedAt));

  // Filter to just the constituent run IDs
  const filtered = historicalRuns.filter((r) => runIds.includes(r.id));

  if (filtered.length === 0) {
    return { averageSplits: [], splitCount: 0, preRunBrief: "" };
  }

  // Personal best (shortest duration)
  const pbRun = filtered.reduce((best, r) => (!best || r.duration < best.duration ? r : best));
  const personalBest = {
    timeMs: pbRun.duration * 1000,
    formatted: formatMs(pbRun.duration * 1000),
    date: friendlyDate(pbRun.completedAt!),
  };

  // Last run
  const lastRun = filtered[0]; // already sorted desc
  const lastKmSplits: KmSplitData[] = parseKmSplits(lastRun.kmSplits);
  const lastRunStats = {
    timeMs: lastRun.duration * 1000,
    formatted: formatMs(lastRun.duration * 1000),
    date: friendlyDate(lastRun.completedAt!),
    kmSplits: lastKmSplits,
  };

  // Build split profiles — average across all runs that have km split data
  const splitProfiles = route.splitProfiles as SplitProfile[] | null;
  const averageSplits: SplitComparison[] = splitProfiles
    ? buildSplitComparisons(splitProfiles, lastKmSplits)
    : [];

  const intelligence: Omit<RouteIntelligence, "preRunBrief"> = {
    personalBest,
    lastRunStats,
    averageSplits,
    splitCount: filtered.length,
  };

  const preRunBrief = buildPreRunBrief(route, intelligence, 80); // assume confident for brief generation

  return { ...intelligence, preRunBrief };
}

// ─── Parse km splits from stored JSONB ───────────────────────────────────────

function parseKmSplits(raw: unknown): KmSplitData[] {
  if (!raw || !Array.isArray(raw)) return [];
  return (raw as any[]).map((s) => ({
    km: s.km ?? s.split ?? 0,
    time: s.time ?? s.seconds ?? s.paceSeconds ?? 0,
    pace: s.pace ?? formatSecPerKm(s.time ?? s.paceSeconds ?? 0),
  }));
}

// ─── updateKnownRoutes — called on run completion ─────────────────────────────

/**
 * Called after a run is saved. Builds or updates the known_routes fingerprint
 * for this user based on the completed run's GPS data.
 *
 * Logic:
 *  - Look for an existing known_route where start is within 100m
 *  - If found: update averages, add run to constituent set, recalculate split profiles
 *  - If not found AND user has a prior run within 100m: create new known_route
 *  - If only first run from this location: do nothing (need ≥2 runs)
 */
export async function updateKnownRoutes(
  userId: string,
  completedRun: {
    id: string;
    startLat: number | null;
    startLng: number | null;
    distance: number;
    duration: number;
    completedAt: Date;
    kmSplits: unknown;
    gpsTrack: unknown;
    terrainType: string | null;
  }
): Promise<void> {
  if (!completedRun.startLat || !completedRun.startLng) return;

  const lat = completedRun.startLat;
  const lng = completedRun.startLng;
  const distKm = completedRun.distance;

  // 1. Check for existing known_route within 100m
  const existingRoutes = await db
    .select()
    .from(knownRoutes)
    .where(eq(knownRoutes.userId, userId));

  const matchingRoute = existingRoutes.find((r) => {
    const d = haversineMetres(lat, lng, r.startLat, r.startLng);
    return d <= 100 && Math.abs((r.typicalDistanceKm ?? 0) - distKm) / distKm <= 0.15;
  });

  const kmSplits = parseKmSplits(completedRun.kmSplits);
  const runAt = completedRun.completedAt;
  const dayOfWeek = runAt.getDay();
  const hour = runAt.getHours();
  const minute = runAt.getMinutes();

  if (matchingRoute) {
    // ── Update existing fingerprint ──────────────────────────────────────────
    const currentIds: string[] = (matchingRoute.constituentRunIds as string[]) ?? [];
    if (currentIds.includes(completedRun.id)) return; // Already processed

    const newIds = [...currentIds, completedRun.id];
    const newRunCount = (matchingRoute.runCount ?? 0) + 1;

    // Update centroid (running average of start points)
    const newLat = (matchingRoute.startLat * (newRunCount - 1) + lat) / newRunCount;
    const newLng = (matchingRoute.startLng * (newRunCount - 1) + lng) / newRunCount;

    // Update typical distance (running average)
    const newTypicalKm = ((matchingRoute.typicalDistanceKm ?? distKm) * (newRunCount - 1) + distKm) / newRunCount;

    // Update typical day-of-week
    const currentDays: number[] = (matchingRoute.typicalDaysOfWeek as number[]) ?? [];
    if (!currentDays.includes(dayOfWeek)) currentDays.push(dayOfWeek);

    // Update typical start time (running average)
    const prevTotalMin = (matchingRoute.typicalStartHour ?? hour) * 60 + (matchingRoute.typicalStartMinute ?? minute);
    const newTotalMin = Math.round((prevTotalMin * (newRunCount - 1) + (hour * 60 + minute)) / newRunCount);
    const newStartHour = Math.floor(newTotalMin / 60);
    const newStartMinute = newTotalMin % 60;

    // Update PB
    const durationMs = completedRun.duration * 1000;
    const currentBestMs = matchingRoute.bestTimeMs ?? durationMs;
    const newBestMs = Math.min(currentBestMs, durationMs);

    // Update average time
    const currentAvgMs = matchingRoute.avgTimeMs ?? durationMs;
    const newAvgMs = Math.round((currentAvgMs * (newRunCount - 1) + durationMs) / newRunCount);

    // Update avg pace sec/km
    const paceSec = distKm > 0 ? completedRun.duration / distKm : 0;
    const currentAvgPace = matchingRoute.avgPaceSecPerKm ?? paceSec;
    const newAvgPace = (currentAvgPace * (newRunCount - 1) + paceSec) / newRunCount;

    // Update split profiles
    const updatedSplitProfiles = updateSplitProfiles(
      (matchingRoute.splitProfiles as SplitProfile[]) ?? [],
      kmSplits,
      newRunCount
    );

    // Update elevation profile and notable segments from GPS track if available
    const elevationProfile = completedRun.gpsTrack
      ? buildElevationProfile(completedRun.gpsTrack as GPSPoint[], distKm)
      : (matchingRoute.elevationProfile as ElevationPoint[]);
    const notableSegments = elevationProfile
      ? detectNotableSegments(elevationProfile, distKm)
      : (matchingRoute.notableSegments as NotableSegment[]);

    // Generate a friendly name if none exists
    const routeName = matchingRoute.name ?? generateRouteName(dayOfWeek, hour, newTypicalKm);

    await db
      .update(knownRoutes)
      .set({
        startLat: newLat,
        startLng: newLng,
        typicalDistanceKm: newTypicalKm,
        typicalDaysOfWeek: currentDays as any,
        typicalStartHour: newStartHour,
        typicalStartMinute: newStartMinute,
        runCount: newRunCount,
        lastRunAt: runAt,
        constituentRunIds: newIds as any,
        bestTimeMs: newBestMs,
        avgTimeMs: newAvgMs,
        avgPaceSecPerKm: newAvgPace,
        splitProfiles: updatedSplitProfiles as any,
        elevationProfile: elevationProfile as any,
        notableSegments: notableSegments as any,
        terrainType: completedRun.terrainType || matchingRoute.terrainType,
        name: routeName,
        updatedAt: new Date(),
      })
      .where(eq(knownRoutes.id, matchingRoute.id));

    console.log(`[RouteMemory] Updated known_route ${matchingRoute.id} (${routeName}) — run #${newRunCount}`);

  } else {
    // ── Check if user has any prior run from within 100m (potential new route) ──
    const priorRuns = await db
      .select({
        id: runs.id,
        startLat: runs.startLat,
        startLng: runs.startLng,
        distance: runs.distance,
        duration: runs.duration,
        completedAt: runs.completedAt,
        kmSplits: runs.kmSplits,
        gpsTrack: runs.gpsTrack,
        terrainType: runs.terrainType,
      })
      .from(runs)
      .where(and(eq(runs.userId, userId)))
      .orderBy(desc(runs.completedAt));

    const nearbyPrior = priorRuns.find((r) => {
      if (!r.startLat || !r.startLng || r.id === completedRun.id) return false;
      const d = haversineMetres(lat, lng, r.startLat, r.startLng);
      const distMatch = Math.abs((r.distance ?? 0) - distKm) / distKm <= 0.15;
      return d <= 100 && distMatch;
    });

    if (!nearbyPrior) return; // Only first run from this location — wait for a pattern

    // ── Create new known_route from the two matching runs ────────────────────
    const allIds = [nearbyPrior.id, completedRun.id];
    const avgLat = (nearbyPrior.startLat! + lat) / 2;
    const avgLng = (nearbyPrior.startLng! + lng) / 2;
    const avgKm = ((nearbyPrior.distance ?? distKm) + distKm) / 2;

    const priorAt = nearbyPrior.completedAt!;
    const priorDay = priorAt.getDay();
    const typicalDays = Array.from(new Set([priorDay, dayOfWeek]));
    const priorTotalMin = priorAt.getHours() * 60 + priorAt.getMinutes();
    const avgTotalMin = Math.round((priorTotalMin + (hour * 60 + minute)) / 2);
    const startHour = Math.floor(avgTotalMin / 60);
    const startMinute = avgTotalMin % 60;

    const dur1Ms = (nearbyPrior.duration ?? completedRun.duration) * 1000;
    const dur2Ms = completedRun.duration * 1000;
    const bestMs = Math.min(dur1Ms, dur2Ms);
    const avgMs = Math.round((dur1Ms + dur2Ms) / 2);

    const pace1 = avgKm > 0 ? (nearbyPrior.duration ?? completedRun.duration) / avgKm : 0;
    const pace2 = distKm > 0 ? completedRun.duration / distKm : 0;
    const avgPace = (pace1 + pace2) / 2;

    const priorSplits = parseKmSplits(nearbyPrior.kmSplits);
    const splitProfiles = buildInitialSplitProfiles(priorSplits, kmSplits);

    const elevationProfile = completedRun.gpsTrack
      ? buildElevationProfile(completedRun.gpsTrack as GPSPoint[], distKm)
      : undefined;
    const notableSegments = elevationProfile ? detectNotableSegments(elevationProfile, distKm) : [];

    const routeName = generateRouteName(dayOfWeek, hour, avgKm);

    await db.insert(knownRoutes).values({
      userId,
      name: routeName,
      startLat: avgLat,
      startLng: avgLng,
      startRadiusM: 75,
      typicalDistanceKm: avgKm,
      elevationProfile: elevationProfile as any,
      notableSegments: notableSegments as any,
      terrainType: completedRun.terrainType || nearbyPrior.terrainType,
      typicalDaysOfWeek: typicalDays as any,
      typicalStartHour: startHour,
      typicalStartMinute: startMinute,
      runCount: 2,
      firstRunAt: priorAt,
      lastRunAt: runAt,
      constituentRunIds: allIds as any,
      bestTimeMs: bestMs,
      avgTimeMs: avgMs,
      avgPaceSecPerKm: avgPace,
      splitProfiles: splitProfiles as any,
    });

    console.log(`[RouteMemory] Created new known_route (${routeName}) for user ${userId}`);
  }
}

// ─── Elevation Profile Builders ───────────────────────────────────────────────

/**
 * Build a normalised elevation profile from a GPS track.
 * Returns ~20 sample points (0%–100% of route) with altitude in metres.
 */
export function buildElevationProfile(
  gpsTrack: GPSPoint[],
  distanceKm: number
): ElevationPoint[] | undefined {
  if (!gpsTrack || gpsTrack.length < 10) return undefined;

  // Filter points that have altitude
  const withAlt = gpsTrack.filter((p) => p.altitude !== undefined && p.altitude !== null);
  if (withAlt.length < 5) return undefined;

  // Sample ~20 evenly-spaced points
  const samples = 20;
  const result: ElevationPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const pct = i / (samples - 1);
    const idx = Math.min(Math.floor(pct * (withAlt.length - 1)), withAlt.length - 1);
    result.push({ pct, altM: Math.round(withAlt[idx].altitude!) });
  }
  return result;
}

/**
 * Detect segments with notable gradient changes (hills, steep descents).
 * A "notable" segment is ≥200m long with average gradient ≥4%.
 */
export function detectNotableSegments(
  elevationProfile: ElevationPoint[],
  distanceKm: number
): NotableSegment[] {
  if (!elevationProfile || elevationProfile.length < 4 || distanceKm <= 0) return [];

  const segments: NotableSegment[] = [];
  const distanceM = distanceKm * 1000;

  // Scan profile for sustained gradient sections
  for (let i = 0; i < elevationProfile.length - 2; i++) {
    const p1 = elevationProfile[i];
    const p2 = elevationProfile[i + 2]; // look 2 samples ahead for smoothing
    const hDiff = p2.altM - p1.altM;
    const hDistM = (p2.pct - p1.pct) * distanceM;
    if (hDistM <= 0) continue;
    const gradient = (hDiff / hDistM) * 100;

    if (Math.abs(gradient) >= 4 && hDistM >= 150) {
      const isUphill = gradient > 0;
      const absGrad = Math.abs(gradient);
      const severity: NotableSegment["severity"] =
        absGrad >= 10 ? "brutal" : absGrad >= 7 ? "hard" : absGrad >= 5 ? "moderate" : "easy";

      const segName = isUphill
        ? `${severity === "brutal" ? "Brutal" : severity === "hard" ? "Tough" : ""} Hill`.trim()
        : "Descent";

      const coachingNote = isUphill
        ? `${Math.round(hDistM)}m climb at ${absGrad.toFixed(1)}% — shorten stride, stay tall.`
        : `${Math.round(hDistM)}m descent — control your pace, stay light on your feet.`;

      // Avoid duplicate adjacent segments
      const lastSeg = segments[segments.length - 1];
      if (lastSeg && Math.abs(lastSeg.startPct - p1.pct) < 0.05) continue;

      segments.push({
        name: segName || (isUphill ? "Hill" : "Descent"),
        startPct: p1.pct,
        endPct: p2.pct,
        gradient,
        severity,
        coachingNote,
      });
    }
  }

  // Return top 3 most significant segments
  return segments
    .sort((a, b) => Math.abs(b.gradient) - Math.abs(a.gradient))
    .slice(0, 3);
}

// ─── Split Profile Helpers ────────────────────────────────────────────────────

function buildInitialSplitProfiles(
  run1Splits: KmSplitData[],
  run2Splits: KmSplitData[]
): SplitProfile[] {
  const allKms = Array.from(new Set([...run1Splits, ...run2Splits].map((s) => s.km))).sort((a, b) => a - b);
  return allKms.map((km) => {
    const s1 = run1Splits.find((s) => s.km === km);
    const s2 = run2Splits.find((s) => s.km === km);
    const times = [s1?.time, s2?.time].filter(Boolean) as number[];
    if (times.length === 0) return null;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return {
      km,
      avgSecPerKm: Math.round(avg),
      bestSecPerKm: Math.min(...times),
      worstSecPerKm: Math.max(...times),
      runCount: times.length,
    };
  }).filter(Boolean) as SplitProfile[];
}

function updateSplitProfiles(
  existing: SplitProfile[],
  newSplits: KmSplitData[],
  totalRunCount: number
): SplitProfile[] {
  const result = [...existing];
  for (const split of newSplits) {
    const existing_idx = result.findIndex((p) => p.km === split.km);
    if (existing_idx >= 0) {
      const p = result[existing_idx];
      const newAvg = Math.round((p.avgSecPerKm * p.runCount + split.time) / (p.runCount + 1));
      result[existing_idx] = {
        ...p,
        avgSecPerKm: newAvg,
        bestSecPerKm: Math.min(p.bestSecPerKm, split.time),
        worstSecPerKm: Math.max(p.worstSecPerKm, split.time),
        runCount: p.runCount + 1,
      };
    } else {
      result.push({
        km: split.km,
        avgSecPerKm: split.time,
        bestSecPerKm: split.time,
        worstSecPerKm: split.time,
        runCount: 1,
      });
    }
  }
  return result.sort((a, b) => a.km - b.km);
}

// ─── Route name generator ─────────────────────────────────────────────────────

function generateRouteName(dayOfWeek: number, hour: number, distKm: number): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = days[dayOfWeek];
  const time = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const dist = distKm < 3 ? "Short" : distKm < 7 ? "" : distKm < 12 ? "Long" : "Ultra";
  return `${day} ${time}${dist ? " " + dist : ""} Run`.replace(/\s+/g, " ").trim();
}

// ─── Export types for use in routes.ts ───────────────────────────────────────

export type { SplitProfile, KmSplitData, ElevationPoint, NotableSegment, RouteIntelligence, RouteRecognitionResult, ConfidenceBreakdown };
