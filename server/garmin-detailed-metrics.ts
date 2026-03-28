/**
 * Garmin Detailed Metrics Extraction
 * 
 * Helper functions to extract and format detailed run metrics from Garmin API data
 * including pace data, km splits, heart rate data, GPS track, and elevation profiles
 */

/**
 * Extract heart rate data from Garmin samples
 * @param samples - Array of Garmin sample data
 * @returns Heart rate data object with min, max, avg, and samples array
 */
export function extractHeartRateData(samples: any[], avgHeartRate?: number, maxHeartRate?: number, minHeartRate?: number) {
  if (!samples || samples.length === 0) {
    return {
      min: minHeartRate || 0,
      max: maxHeartRate || 0,
      avg: avgHeartRate || 0,
      samples: [],
    };
  }

  const heartRateSamples = samples
    .filter(s => s.heartRate !== undefined && s.heartRate > 0)
    .map(sample => ({
      timestamp: (sample.startTimeInSeconds || 0) * 1000,
      hr: sample.heartRate,
    }));

  return {
    min: minHeartRate || 0,
    max: maxHeartRate || 0,
    avg: avgHeartRate || 0,
    samples: heartRateSamples,
  };
}

/**
 * Extract pace data from Garmin samples with timestamps
 * @param samples - Array of Garmin sample data
 * @returns Object with average pace and samples array
 */
export function extractPaceData(samples: any[], avgPaceMinPerKm?: number) {
  if (!samples || samples.length === 0) {
    return {
      avg: avgPaceMinPerKm || 0,
      samples: [],
    };
  }

  const paceSamples = samples
    .filter(s => s.speedMetersPerSecond !== undefined && s.speedMetersPerSecond > 0)
    .map(sample => ({
      timestamp: (sample.startTimeInSeconds || 0) * 1000,
      pace: sample.speedMetersPerSecond > 0 ? 1000 / sample.speedMetersPerSecond / 60 : 0, // min/km
    }));

  return {
    avg: avgPaceMinPerKm || 0,
    samples: paceSamples,
  };
}

/**
 * Extract km splits from Garmin activity data
 * @param splits - Array of Garmin split data
 * @returns Array of formatted km splits
 */
export function extractKmSplits(splits: any[]) {
  if (!splits || splits.length === 0) {
    return [];
  }

  return splits.map((split, index) => {
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
 * Extract GPS track data from Garmin samples
 * @param samples - Array of Garmin sample data  
 * @returns Object with array of GPS points
 */
export function extractGpsTrack(samples: any[]) {
  if (!samples || samples.length === 0) {
    return undefined;
  }

  const gpsPoints = samples
    .filter(s => s.latitude !== undefined && s.longitude !== undefined)
    .map(sample => ({
      timestamp: (sample.startTimeInSeconds || 0) * 1000,
      lat: sample.latitude,
      lng: sample.longitude,
      altitude: sample.altitude,
      pace: sample.speedMetersPerSecond > 0 ? 1000 / sample.speedMetersPerSecond / 60 : null,
      hr: sample.heartRate,
    }));

  return gpsPoints.length > 0 ? { samples: gpsPoints } : undefined;
}

/**
 * Extract elevation profile from Garmin samples
 * @param samples - Array of Garmin sample data
 * @returns Array of elevation points with timestamps
 */
export function extractElevationProfile(samples: any[]) {
  if (!samples || samples.length === 0) {
    return [];
  }

  return samples
    .filter(s => s.altitude !== undefined)
    .map(sample => ({
      timestamp: (sample.startTimeInSeconds || 0) * 1000,
      elevation: sample.altitude,
      distance: sample.totalDistanceInMeters || 0,
    }));
}

/**
 * Build comprehensive detailed metrics object from Garmin activity data
 * This is the main function to use when processing new Garmin activities
 */
export function buildDetailedMetricsFromGarminActivity(activity: any) {
  return {
    paceData: extractPaceData(activity.samples, activity.averagePaceInMinutesPerKilometer),
    heartRateData: extractHeartRateData(
      activity.samples,
      activity.averageHeartRateInBeatsPerMinute,
      activity.maxHeartRateInBeatsPerMinute
    ),
    kmSplits: extractKmSplits(activity.splits),
    gpsTrack: extractGpsTrack(activity.samples),
    elevationProfile: extractElevationProfile(activity.samples),
  };
}
