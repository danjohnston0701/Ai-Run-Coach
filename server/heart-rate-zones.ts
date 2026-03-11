/**
 * Heart Rate Zone Utilities
 * Calculates HR zones based on age and provides zone-specific guidance
 */

export class HeartRateZones {
  /**
   * Calculate max heart rate using standard formula: 220 - age
   */
  static getMaxHeartRate(age: number): number {
    return 220 - age;
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
