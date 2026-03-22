/**
 * Garmin Activity Processor
 * 
 * Handles detailed processing of Garmin activities including:
 * - Fetching activity details with splits, HR zones, GPS data
 * - Converting Garmin data formats to AI Run Coach format
 * - Storing comprehensive session data for AI analysis
 */

import { db } from './db';
import { runs } from '@shared/schema';
import garminService from './garmin-service';

/**
 * Detailed activity metrics from Garmin API
 */
export interface GarminActivityDetail {
  activityId: string;
  activityName?: string;
  activityType?: string;
  startTimeInSeconds?: number;
  durationInSeconds?: number;
  distanceInMeters?: number;
  
  // Heart rate data
  averageHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  minHeartRateInBeatsPerMinute?: number;
  heartRateZones?: {
    zone1?: number;
    zone2?: number;
    zone3?: number;
    zone4?: number;
    zone5?: number;
  };
  
  // Pace/speed data
  averageSpeedInMetersPerSecond?: number;
  maxSpeedInMetersPerSecond?: number;
  minSpeedInMetersPerSecond?: number;
  
  // Elevation data
  elevationGainInMeters?: number;
  elevationLossInMeters?: number;
  totalElevationGainInMeters?: number;
  minElevationInMeters?: number;
  maxElevationInMeters?: number;
  
  // Cadence & running dynamics
  averageRunCadenceInStepsPerMinute?: number;
  maxRunCadenceInStepsPerMinute?: number;
  avgVerticalOscillation?: number;
  avgGroundContactTime?: number;
  avgGroundContactBalance?: number;
  avgStrideLength?: number;
  avgVerticalRatio?: number;
  
  // Energy/training
  activeKilocalories?: number;
  calories?: number;
  trainingEffectLabel?: string;
  vO2Max?: string;
  recoveryTimeInMinutes?: number;
  
  // GPS & route data
  polyline?: string;
  gpsAccuracy?: number;
  
  // Splits/laps data
  splits?: Array<{
    displayOrder?: number;
    durationInSeconds?: number;
    distanceInMeters?: number;
    averageHeartRateInBeatsPerMinute?: number;
    maxHeartRateInBeatsPerMinute?: number;
    averageSpeedInMetersPerSecond?: number;
    maxSpeedInMetersPerSecond?: number;
    elevationGainInMeters?: number;
    elevationLossInMeters?: number;
  }>;
  
  // Heart rate samples throughout the run
  samples?: Array<{
    timestamp: number;
    heartRate?: number;
    pace?: number;
    cadence?: number;
    altitude?: number;
    latitude?: number;
    longitude?: number;
  }>;
}

/**
 * Process and save detailed Garmin activity to database
 * Saves to garminActivities table with full metrics, then creates runs record
 */
export async function saveDetailedGarminActivity(
  userId: string,
  activityDetail: GarminActivityDetail
): Promise<{ id: string; message: string }> {
  console.log(`💾 Saving detailed Garmin activity ${activityDetail.activityId} for user ${userId}`);

  try {
    const { garminActivities } = await import('@shared/schema');
    
    // Parse the activity data into our format
    const activity = parseDetailedGarminActivity(activityDetail);

    // Prepare heart rate zones
    const heartRateZones = activityDetail.heartRateZones ? {
      zone1: activityDetail.heartRateZones.zone1 || 0,
      zone2: activityDetail.heartRateZones.zone2 || 0,
      zone3: activityDetail.heartRateZones.zone3 || 0,
      zone4: activityDetail.heartRateZones.zone4 || 0,
      zone5: activityDetail.heartRateZones.zone5 || 0,
    } : undefined;

    // Get start time
    const startTime = activityDetail.startTimeInSeconds
      ? new Date(activityDetail.startTimeInSeconds * 1000)
      : new Date();

    // Save to garminActivities table first with ALL detailed data
    const [garminActivityRecord] = await db
      .insert(garminActivities)
      .values({
        userId,
        garminActivityId: activityDetail.activityId,
        
        // Basic activity info
        activityName: activityDetail.activityName || 'Garmin Run',
        activityType: activityDetail.activityType || 'RUNNING',
        startTimeInSeconds: activityDetail.startTimeInSeconds,
        durationInSeconds: activityDetail.durationInSeconds,
        distanceInMeters: activityDetail.distanceInMeters,
        
        // Heart rate data - FULL DETAIL
        averageHeartRateInBeatsPerMinute: activityDetail.averageHeartRateInBeatsPerMinute,
        maxHeartRateInBeatsPerMinute: activityDetail.maxHeartRateInBeatsPerMinute,
        heartRateZones: heartRateZones as any,
        
        // Pace/speed data
        averageSpeedInMetersPerSecond: activityDetail.averageSpeedInMetersPerSecond,
        maxSpeedInMetersPerSecond: activityDetail.maxSpeedInMetersPerSecond,
        averagePaceInMinutesPerKilometer: activity.avgPace,
        
        // Running dynamics
        averageRunCadenceInStepsPerMinute: activityDetail.averageRunCadenceInStepsPerMinute,
        maxRunCadenceInStepsPerMinute: activityDetail.maxRunCadenceInStepsPerMinute,
        averageStrideLength: activityDetail.avgStrideLength,
        groundContactTime: activityDetail.avgGroundContactTime,
        groundContactBalance: activityDetail.avgGroundContactBalance,
        verticalOscillation: activityDetail.avgVerticalOscillation,
        verticalRatio: activityDetail.avgVerticalRatio,
        
        // Elevation data
        startLatitude: activityDetail.samples?.[0]?.latitude,
        startLongitude: activityDetail.samples?.[0]?.longitude,
        totalElevationGainInMeters: activityDetail.elevationGainInMeters || activityDetail.totalElevationGainInMeters,
        totalElevationLossInMeters: activityDetail.elevationLossInMeters,
        minElevationInMeters: activityDetail.minElevationInMeters,
        maxElevationInMeters: activityDetail.maxElevationInMeters,
        
        // Energy
        activeKilocalories: activityDetail.activeKilocalories,
        
        // Training effect
        trainingEffectLabel: activityDetail.trainingEffectLabel,
        vo2Max: activityDetail.vO2Max ? parseFloat(activityDetail.vO2Max) : undefined,
        recoveryTimeInMinutes: activityDetail.recoveryTimeInMinutes,
        
        // Detailed splits and samples
        splits: parseKmSplits(activityDetail) as any,
        samples: activityDetail.samples as any,
        
        // Raw data preservation
        rawData: activityDetail as any,
        
        // Mark as processed
        isProcessed: true,
        webhookReceivedAt: new Date(),
      })
      .returning({ id: garminActivities.id });

    console.log(`✅ Saved detailed Garmin activity record ${garminActivityRecord.id}`);

    // Now create or link runs record
    const runsRecord = await createOrLinkRunFromGarminActivity(
      userId,
      activityDetail,
      garminActivityRecord.id
    );

    return {
      id: runsRecord.id,
      message: `Imported run with comprehensive metrics: ${(activityDetail.distanceInMeters || 0) / 1000}km in ${Math.floor((activityDetail.durationInSeconds || 0) / 60)}min with detailed HR zones, GPS track, and pace analysis`,
    };

  } catch (error) {
    console.error(`❌ Error saving Garmin activity ${activityDetail.activityId}:`, error);
    throw error;
  }
}

/**
 * Create a new runs record or link to existing one with Garmin data
 */
async function createOrLinkRunFromGarminActivity(
  userId: string,
  activityDetail: GarminActivityDetail,
  garminActivityId: string
): Promise<{ id: string }> {
  const activity = parseDetailedGarminActivity(activityDetail);
  const startTime = activityDetail.startTimeInSeconds
    ? new Date(activityDetail.startTimeInSeconds * 1000)
    : new Date();

  // Prepare heart rate data with samples
  const heartRateData = {
    min: activity.minHeartRate,
    max: activity.maxHeartRate,
    avg: activity.avgHeartRate,
    samples: activityDetail.samples
      ?.filter(s => s.heartRate)
      .map(s => ({
        timestamp: s.timestamp,
        hr: s.heartRate,
      })) || [],
  };

  // Prepare pace data with samples
  const paceData = {
    avg: activity.avgPace,
    samples: activityDetail.samples
      ?.filter(s => s.pace)
      .map(s => ({
        timestamp: s.timestamp,
        pace: s.pace,
      })) || [],
  };

  // Prepare GPS track
  const gpsTrack = activityDetail.samples && activityDetail.samples.length > 0
    ? {
        samples: activityDetail.samples
          .filter(s => s.latitude && s.longitude)
          .map(s => ({
            timestamp: s.timestamp,
            lat: s.latitude,
            lng: s.longitude,
            altitude: s.altitude,
            pace: s.pace,
            hr: s.heartRate,
          })),
      }
    : undefined;

  // Create new run record
  const [result] = await db
    .insert(runs)
    .values({
      userId,
      externalId: activityDetail.activityId,
      externalSource: 'garmin',
      distance: (activityDetail.distanceInMeters || 0) / 1000,
      duration: (activityDetail.durationInSeconds || 0) * 1000,
      
      avgHeartRate: activityDetail.averageHeartRateInBeatsPerMinute,
      maxHeartRate: activityDetail.maxHeartRateInBeatsPerMinute,
      minHeartRate: activityDetail.minHeartRateInBeatsPerMinute,
      avgPace: activity.avgPace?.toFixed(2),
      maxSpeed: activityDetail.maxSpeedInMetersPerSecond,
      avgSpeed: activityDetail.averageSpeedInMetersPerSecond,
      
      elevationGain: activityDetail.elevationGainInMeters || activityDetail.totalElevationGainInMeters,
      elevationLoss: activityDetail.elevationLossInMeters,
      minElevation: activityDetail.minElevationInMeters,
      maxElevation: activityDetail.maxElevationInMeters,
      
      cadence: activityDetail.averageRunCadenceInStepsPerMinute,
      maxCadence: activityDetail.maxRunCadenceInStepsPerMinute,
      avgStrideLength: activityDetail.avgStrideLength,
      
      calories: activityDetail.activeKilocalories || activityDetail.calories,
      activeCalories: activityDetail.activeKilocalories,
      
      trainingEffect: activity.trainingEffect,
      vo2Max: activityDetail.vO2Max ? parseFloat(activityDetail.vO2Max) : undefined,
      recoveryTime: activityDetail.recoveryTimeInMinutes,
      
      // Detailed metrics
      heartRateData: heartRateData as any,
      paceData: paceData as any,
      gpsTrack: gpsTrack as any,
      kmSplits: parseKmSplits(activityDetail) as any,
      
      name: activityDetail.activityName || 'Garmin Run',
      completedAt: startTime,
      hasGarminData: true,
      
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: runs.id });

  console.log(`✅ Created runs record ${result.id} linked to Garmin activity ${activityDetail.activityId}`);
  
  return { id: result.id };
}

/**
 * Parse Garmin activity detail into AI Run Coach format
 */
function parseDetailedGarminActivity(activity: GarminActivityDetail) {
  const durationSeconds = activity.durationInSeconds || 0;
  const distanceKm = (activity.distanceInMeters || 0) / 1000;
  
  // Calculate average pace (min/km)
  const avgPace = distanceKm > 0 ? (durationSeconds / 60) / distanceKm : 0;
  
  // Calculate max pace (min/km) - from min speed which gives fastest pace
  const maxPace = activity.minSpeedInMetersPerSecond && activity.minSpeedInMetersPerSecond > 0
    ? (1000 / activity.minSpeedInMetersPerSecond / 60)
    : undefined;
  
  // Parse training effect
  const trainingEffect = activity.trainingEffectLabel
    ? parseFloat(activity.trainingEffectLabel)
    : undefined;

  return {
    activityId: activity.activityId,
    activityType: activity.activityType || 'running',
    startTime: activity.startTimeInSeconds
      ? new Date(activity.startTimeInSeconds * 1000)
      : new Date(),
    duration: durationSeconds,
    distance: distanceKm,
    calories: activity.activeKilocalories || activity.calories || 0,
    avgHeartRate: activity.averageHeartRateInBeatsPerMinute,
    maxHeartRate: activity.maxHeartRateInBeatsPerMinute,
    minHeartRate: activity.minHeartRateInBeatsPerMinute,
    avgPace,
    maxPace,
    avgCadence: activity.averageRunCadenceInStepsPerMinute,
    maxCadence: activity.maxRunCadenceInStepsPerMinute,
    elevationGain: activity.elevationGainInMeters || activity.totalElevationGainInMeters,
    elevationLoss: activity.elevationLossInMeters,
    minElevation: activity.minElevationInMeters,
    maxElevation: activity.maxElevationInMeters,
    trainingEffect,
    recoveryTime: activity.recoveryTimeInMinutes,
    polyline: activity.polyline,
  };
}

/**
 * Convert Garmin splits to kilometer splits
 */
function parseKmSplits(activity: GarminActivityDetail): any[] {
  if (!activity.splits || activity.splits.length === 0) {
    return [];
  }

  return activity.splits.map((split, index) => {
    const distanceKm = (split.distanceInMeters || 0) / 1000;
    const durationSeconds = split.durationInSeconds || 0;
    const paceSplitMinPerKm = distanceKm > 0 ? (durationSeconds / 60) / distanceKm : 0;

    return {
      splitNumber: split.displayOrder || index + 1,
      distance: distanceKm,
      durationSeconds,
      pace: paceSplitMinPerKm.toFixed(2),
      avgHeartRate: split.averageHeartRateInBeatsPerMinute,
      maxHeartRate: split.maxHeartRateInBeatsPerMinute,
      avgSpeed: split.averageSpeedInMetersPerSecond,
      maxSpeed: split.maxSpeedInMetersPerSecond,
      elevationGain: split.elevationGainInMeters,
      elevationLoss: split.elevationLossInMeters,
    };
  });
}

/**
 * Fetch complete activity details from Garmin with all metrics
 */
export async function fetchCompleteGarminActivityDetail(
  accessToken: string,
  activityId: string
): Promise<GarminActivityDetail> {
  console.log(`🔍 Fetching complete activity details for Garmin activity ${activityId}`);

  try {
    // Get basic activity detail
    const activityDetail = await garminService.getGarminActivityDetail(accessToken, activityId);

    if (!activityDetail) {
      throw new Error(`Failed to fetch activity detail for ${activityId}`);
    }

    console.log(`✅ Successfully fetched detailed activity data for ${activityId}`);
    console.log(`   Distance: ${(activityDetail.distanceInMeters || 0) / 1000}km`);
    console.log(`   Duration: ${Math.floor((activityDetail.durationInSeconds || 0) / 60)}min`);
    console.log(`   Avg HR: ${activityDetail.averageHeartRateInBeatsPerMinute} bpm`);
    console.log(`   Splits: ${activityDetail.splits?.length || 0}`);
    console.log(`   GPS Samples: ${activityDetail.samples?.length || 0}`);

    return activityDetail;

  } catch (error) {
    console.error(`❌ Error fetching activity detail:`, error);
    throw error;
  }
}

export default {
  saveDetailedGarminActivity,
  fetchCompleteGarminActivityDetail,
  parseDetailedGarminActivity,
  parseKmSplits,
};
