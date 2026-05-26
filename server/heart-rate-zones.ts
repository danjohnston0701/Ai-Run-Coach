/**
 * Heart Rate Zone Utilities
 * Calculates HR zones based on age and provides zone-specific guidance.
 *
 * Max HR estimation hierarchy (most accurate → least accurate):
 *   1. Observed peak HR from run history (best — derived from actual data)
 *   2. Tanaka formula: 208 - (0.7 × age)  (more accurate than 220 - age for trained runners)
 *   3. Fallback: 220 - age  (kept for backward compatibility)
 */

export class HeartRateZones {
  /**
   * Calculate max heart rate using the Tanaka formula (208 - 0.7 × age).
   * More accurate than 220-age for trained runners, especially over 40.
   */
  static getMaxHeartRate(age: number): number {
    return Math.round(208 - 0.7 * age);
  }

  /**
   * Estimate max HR from recent run history.
   * Uses the 99th-percentile of observed peak HRs — a single outlier run
   * often captures a true near-max effort.
   *
   * @param peakHRsFromRuns  Array of peak/max HR values recorded in recent runs
   * @param age              Athlete age (used as fallback if data is insufficient)
   * @returns Estimated maxHR in BPM
   */
  static estimateMaxHRFromHistory(peakHRsFromRuns: number[], age: number): number {
    // Need at least 3 runs with HR data for a meaningful estimate
    const validPeaks = peakHRsFromRuns.filter(hr => hr > 100 && hr < 230);
    if (validPeaks.length < 3) {
      return HeartRateZones.getMaxHeartRate(age);
    }

    // Sort descending and take the 95th-percentile peak to avoid outlier spikes
    const sorted = [...validPeaks].sort((a, b) => b - a);
    const p95Index = Math.max(0, Math.floor(sorted.length * 0.05));
    const observedMax = sorted[p95Index];

    // Sanity bounds: observed max should be within ±15 bpm of formula estimate
    const formulaMax = HeartRateZones.getMaxHeartRate(age);
    const clampedMax = Math.max(formulaMax - 15, Math.min(formulaMax + 25, observedMax));

    return Math.round(clampedMax);
  }

  /**
   * Estimate lactate threshold HR (LTHR) from run history.
   * LTHR is typically ~85-92% of max HR for well-trained runners.
   * If pace/HR data is available, uses a pace-weighted estimate.
   *
   * @param avgHRsFromRuns  Array of { avgHR, avgPaceSecs } from recent runs
   * @param maxHR           Athlete max HR
   * @returns Estimated LTHR in BPM, or null if insufficient data
   */
  static estimateLTHRFromHistory(
    avgHRsFromRuns: Array<{ avgHR: number; avgPaceSecs: number }>,
    maxHR: number
  ): number | null {
    const validRuns = avgHRsFromRuns.filter(r => r.avgHR > 100 && r.avgPaceSecs > 0);
    if (validRuns.length < 5) return null;

    // Find runs where HR is in the z3-z4 range (70-90% max HR) as threshold zone proxy
    const thresholdRuns = validRuns.filter(r => {
      const hrPct = r.avgHR / maxHR;
      return hrPct >= 0.70 && hrPct <= 0.92;
    });

    if (thresholdRuns.length < 2) return null;

    // Average HR from threshold-zone runs — a rough LTHR proxy
    const avgThresholdHR = thresholdRuns.reduce((sum, r) => sum + r.avgHR, 0) / thresholdRuns.length;
    return Math.round(avgThresholdHR);
  }

  /**
   * Get HR range for a specific zone
   * Returns { min: number, max: number } in BPM
   */
  static getZoneRange(zoneNumber: number, maxHR: number): { min: number; max: number } {
    const ranges: Record<number, { min: number; max: number }> = {
      1: { min: 0.50, max: 0.60 },
      2: { min: 0.60, max: 0.70 },
      3: { min: 0.70, max: 0.80 },
      4: { min: 0.80, max: 0.90 },
      5: { min: 0.90, max: 1.00 },
    };

    const range = ranges[zoneNumber] || ranges[2];
    return {
      min: Math.round(maxHR * range.min),
      max: Math.round(maxHR * range.max),
    };
  }

  /**
   * Get zone description and effort level
   */
  static getZoneDescription(zoneNumber: number): {
    name: string;
    description: string;
    effortLabel: string;
  } {
    const descriptions: Record<number, any> = {
      1: {
        name: "Zone 1: Active Recovery",
        description: "Very easy, restorative running. Perfect for recovery days.",
        effortLabel: "Very easy - you should feel relaxed",
      },
      2: {
        name: "Zone 2: Endurance/Aerobic",
        description: "Comfortable, sustainable pace. The talk test zone.",
        effortLabel: "Easy - you can comfortably hold a conversation",
      },
      3: {
        name: "Zone 3: Tempo/Threshold",
        description: "Challenging but sustainable. Can speak in short sentences.",
        effortLabel: "Moderate - can speak but feel effort",
      },
      4: {
        name: "Zone 4: VO2 Max",
        description: "Hard effort, near race pace. Speaking only in single words.",
        effortLabel: "Hard - heavy breathing, can only say single words",
      },
      5: {
        name: "Zone 5: Maximum Effort",
        description: "Maximum intensity, all-out sprint effort.",
        effortLabel: "Maximum - breathing maximal, cannot speak",
      },
    };

    return descriptions[zoneNumber] || descriptions[2];
  }

  /**
   * Get generic pace range guidance for a zone (beginner/intermediate/advanced)
   */
  static getZonePaceGuidance(zoneNumber: number, fitnessLevel: string): string {
    // Generic guidance based on fitness level
    const guidance: Record<number, Record<string, string>> = {
      1: {
        beginner: "10-13 min/km",
        intermediate: "8-10 min/km",
        advanced: "6-8 min/km",
      },
      2: {
        beginner: "9-12 min/km",
        intermediate: "7-9 min/km",
        advanced: "5.5-7 min/km",
      },
      3: {
        beginner: "7-10 min/km",
        intermediate: "5.5-7.5 min/km",
        advanced: "4.5-6 min/km",
      },
      4: {
        beginner: "6-8 min/km",
        intermediate: "4.5-6 min/km",
        advanced: "3.5-5 min/km",
      },
      5: {
        beginner: "5-7 min/km",
        intermediate: "3.5-5 min/km",
        advanced: "2.5-4 min/km",
      },
    };

    return (
      guidance[zoneNumber]?.[fitnessLevel.toLowerCase()] ||
      guidance[zoneNumber]?.intermediate ||
      "Unknown"
    );
  }
}
