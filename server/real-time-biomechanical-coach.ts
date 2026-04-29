/**
 * Real-Time Biomechanical Coaching Engine
 * 
 * Context-aware AI coaching that analyzes 23+ biometric data points in real-time
 * to provide intelligent, dynamic feedback tailored to terrain, pace, and fatigue state.
 * 
 * NO HARDCODED PROMPTS - All coaching is dynamically generated based on:
 * - Current biomechanical metrics
 * - Terrain context (gradient, altitude)
 * - Historical baselines (runner's normal metrics)
 * - Fatigue progression
 * - External conditions (weather, pressure)
 */

import Anthropic from "@anthropic-ai/sdk";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface BiometricDataPoint {
  // Heart Rate & Cardiovascular
  heartRate: number; // bpm
  heartRateZone: number; // 1-5
  
  // Cadence & Stride
  cadence: number; // spm
  strideLength: number; // meters

  // Running Dynamics
  groundContactTime: number; // milliseconds (200-300 normal)
  groundContactBalance: number; // percent (50% = balanced)
  verticalOscillation: number; // cm (6-8 efficient, >10 inefficient)
  verticalRatio: number; // percent (8-10% efficient)

  // Training Load
  trainingEffect: number; // 0-5
  vo2Max: number; // ml/kg/min
  recoveryTime: number; // minutes

  // GPS & Environmental
  latitude: number;
  longitude: number;
  altitude: number; // meters
  bearing: number; // degrees (0=N, 90=E, 180=S, 270=W)
  gpsAccuracy: number; // meters
  ambientPressure: number; // Pascals
  
  // Derived/Contextual
  pace: number; // min/km
  speed: number; // m/s
  distance: number; // meters so far
  elapsedTime: number; // seconds
  timestamp: number; // unix ms
}

export interface RunnerBaseline {
  userId: string;
  
  // Normal ranges from recent runs (last 4 weeks)
  normalHeartRate: { min: number; max: number; avg: number };
  normalCadence: { min: number; max: number; avg: number };
  normalPace: { min: number; max: number; avg: number };
  normalGroundContactTime: { min: number; max: number; avg: number };
  normalVerticalOscillation: { min: number; max: number; avg: number };
  normalStrideLength: { min: number; max: number; avg: number };
  
  // Running profile
  maxHeartRate: number; // estimated or measured
  restingHeartRate: number;
  lactateThreshold: number; // bpm
  preferredCadence: number; // spm
  
  // Biomechanical characteristics
  typicalStrideLength: number; // height-adjusted
  typicalGroundContactTime: number;
  typicalVerticalOscillation: number;
}

export interface TerrainContext {
  currentGrade: number; // percent (-10 = downhill, +10 = uphill)
  recentGrade: number; // average grade last 500m
  elevationGain: number; // meters gained so far
  elevationLoss: number; // meters lost so far
  courseType: "flat" | "rolling" | "hilly" | "mountainous"; // overall
}

export interface CoachingContext {
  biometrics: BiometricDataPoint;
  baseline: RunnerBaseline;
  terrain: TerrainContext;
  
  // Run state
  distanceRemaining?: number; // meters, if known
  workoutPhase?: string; // "warmup" | "easy" | "tempo" | "threshold" | "cooldown"
  targetPace?: number; // min/km, if this is a planned workout
  
  // Fatigue state (inferred)
  fatigueLevel: number; // 0-100 (0=fresh, 100=exhausted)
  timeInZone: { [zone: number]: number }; // seconds in each HR zone
}

export interface CoachingFeedback {
  // Primary coaching message
  message: string; // Single, actionable coaching cue
  
  // Context for the message
  category: "form" | "pacing" | "effort" | "recovery" | "environment" | "efficiency" | "fatigue";
  confidence: number; // 0-1 how confident in this analysis
  
  // Why this feedback
  reasoning: string; // Explanation of what the coach detected
  
  // Actionable guidance
  action: string; // Specific thing to do/change
  targetMetric?: string; // What metric to aim for
  targetValue?: number;
  
  // Severity (inform urgency)
  severity: "info" | "warning" | "critical"; // info=nice to know, warning=should address, critical=must fix
  
  // Historical context
  isAnomalous: boolean; // True if this is unusual for this runner
  comparedToBaseline: string; // How it compares to their normal metrics
}

// ============================================================================
// SMART BIOMECHANICAL ANALYSIS
// ============================================================================

export class RealTimeBiomechanicalCoach {
  private client: Anthropic;
  
  constructor() {
    this.client = new Anthropic();
  }

  /**
   * Main entry point: Analyze biomechanics and generate coaching feedback.
   * This is FULLY DYNAMIC - no hardcoded cues.
   */
  async generateCoachingFeedback(
    context: CoachingContext
  ): Promise<CoachingFeedback> {
    // 1. Detect anomalies and issues
    const issues = this.detectBiomechanicalIssues(context);
    
    if (issues.length === 0) {
      // All good - positive reinforcement or form tips
      return this.generatePositiveReinforcement(context);
    }

    // 2. Prioritize most critical issue
    const primaryIssue = issues.sort((a, b) => b.severity - a.severity)[0];

    // 3. Generate contextual coaching via AI
    return this.generateAICoachingFeedback(context, primaryIssue);
  }

  /**
   * Detect biomechanical issues by comparing to baselines and terrain context
   */
  private detectBiomechanicalIssues(context: CoachingContext): {
    type: string;
    metric: string;
    current: number;
    expected: number;
    deviation: number; // percent from baseline
    severity: number; // 0-10
    context: string; // why this is an issue
  }[] {
    const issues = [];
    const { biometrics, baseline, terrain, fatigueLevel } = context;

    // ────────────────────────────────────────────────────────────────────────
    // 1. GROUND CONTACT TIME ANALYSIS
    // ────────────────────────────────────────────────────────────────────────
    // Context: Stride should be SHORTER on uphills, LONGER on downhills
    // Don't flag as overstriding if on a hill!
    
    if (biometrics.groundContactTime > 0) {
      const expectedGCT = this.getExpectedGroundContactTime(
        baseline,
        terrain.currentGrade,
        biometrics.pace,
        fatigueLevel
      );

      if (biometrics.groundContactTime > expectedGCT * 1.15) {
        // 15% higher than expected for this terrain
        issues.push({
          type: "ground_contact_time",
          metric: "Ground Contact Time",
          current: biometrics.groundContactTime,
          expected: expectedGCT,
          deviation: ((biometrics.groundContactTime - expectedGCT) / expectedGCT) * 100,
          severity: this.calculateGCTSeverity(biometrics.groundContactTime, expectedGCT, fatigueLevel),
          context: `On ${terrain.currentGrade >= 0 ? "uphill" : "downhill"} terrain`,
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 2. STRIDE LENGTH ANALYSIS
    // ────────────────────────────────────────────────────────────────────────
    // Context: Stride SHOULD shorten on uphills, lengthen on downhills
    // This is NORMAL not a problem!
    
    if (biometrics.strideLength > 0) {
      const expectedStride = this.getExpectedStrideLength(
        baseline,
        terrain.currentGrade,
        biometrics.pace,
        fatigueLevel
      );

      // Only flag if significantly different AND it's on FLAT terrain
      if (terrain.currentGrade === 0) {
        if (biometrics.strideLength < expectedStride * 0.90) {
          // Shortening stride on flat = possible form breakdown or fatigue
          issues.push({
            type: "stride_shortening",
            metric: "Stride Length",
            current: biometrics.strideLength,
            expected: expectedStride,
            deviation: ((biometrics.strideLength - expectedStride) / expectedStride) * 100,
            severity: this.calculateStrideSeverity(biometrics.strideLength, expectedStride, fatigueLevel),
            context: "On flat terrain - stride is shortening",
          });
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 3. VERTICAL OSCILLATION (RUNNING EFFICIENCY)
    // ────────────────────────────────────────────────────────────────────────
    // Higher VO = less efficient. But VO increases with fatigue - context matters!
    
    if (biometrics.verticalOscillation > 0) {
      const expectedVO = this.getExpectedVerticalOscillation(
        baseline,
        biometrics.pace,
        terrain.currentGrade,
        fatigueLevel
      );

      if (biometrics.verticalOscillation > expectedVO * 1.20) {
        // 20% more bounce than expected
        issues.push({
          type: "vertical_oscillation",
          metric: "Vertical Oscillation",
          current: biometrics.verticalOscillation,
          expected: expectedVO,
          deviation: ((biometrics.verticalOscillation - expectedVO) / expectedVO) * 100,
          severity: this.calculateVOSeverity(biometrics.verticalOscillation, expectedVO, fatigueLevel),
          context: `Elevated bounce - possible poor posture or fatigue (${fatigueLevel}% fatigued)`,
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 4. GROUND CONTACT BALANCE (SYMMETRY / ASYMMETRY)
    // ────────────────────────────────────────────────────────────────────────
    // 50% = perfect balance. >52% or <48% = imbalance
    
    if (biometrics.groundContactBalance > 0) {
      const imbalance = Math.abs(biometrics.groundContactBalance - 50);
      
      if (imbalance > 4) {
        // More than 4% imbalance is significant
        issues.push({
          type: "gct_imbalance",
          metric: "Ground Contact Balance",
          current: biometrics.groundContactBalance,
          expected: 50,
          deviation: imbalance,
          severity: this.calculateImbalanceSeverity(imbalance),
          context: `${biometrics.groundContactBalance > 50 ? "Left-biased" : "Right-biased"} - possible asymmetrical form or strain`,
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 5. CADENCE ANALYSIS
    // ────────────────────────────────────────────────────────────────────────
    // Too low (<160) can indicate overstriding. Too high (>190) can be wasted effort.
    // But context: uphills naturally increase cadence, downhills decrease it!
    
    if (biometrics.cadence > 0) {
      const expectedCadence = this.getExpectedCadence(
        baseline,
        terrain.currentGrade,
        biometrics.pace
      );

      if (biometrics.cadence < expectedCadence * 0.93) {
        // More than 7% lower than expected for this terrain
        issues.push({
          type: "low_cadence",
          metric: "Cadence",
          current: biometrics.cadence,
          expected: expectedCadence,
          deviation: ((biometrics.cadence - expectedCadence) / expectedCadence) * 100,
          severity: this.calculateCadenceSeverity(biometrics.cadence, expectedCadence),
          context: `Low cadence on ${terrain.currentGrade > 0 ? "uphill" : "this"} terrain`,
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 6. HEART RATE CONTEXT
    // ────────────────────────────────────────────────────────────────────────
    
    if (biometrics.heartRate > 0) {
      // HR too high for the effort level?
      if (biometrics.heartRateZone === 5 && biometrics.pace > baseline.normalPace.avg * 1.05) {
        // In max zone (Z5) but pace doesn't justify it - possible fatigue
        issues.push({
          type: "hr_effort_mismatch",
          metric: "Heart Rate",
          current: biometrics.heartRate,
          expected: this.getExpectedHRForPace(baseline, biometrics.pace),
          deviation: ((biometrics.heartRate - this.getExpectedHRForPace(baseline, biometrics.pace)) / this.getExpectedHRForPace(baseline, biometrics.pace)) * 100,
          severity: 7,
          context: "Max zone HR but pace is manageable - you're fatiguing",
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 7. ENVIRONMENTAL CONTEXT
    // ────────────────────────────────────────────────────────────────────────
    
    if (biometrics.ambientPressure > 0) {
      // Detect pressure drops (weather changes)
      const expectedPressure = 101325; // Standard at sea level, adjust for altitude
      if (biometrics.ambientPressure < expectedPressure * 0.98) {
        issues.push({
          type: "pressure_drop",
          metric: "Ambient Pressure",
          current: biometrics.ambientPressure,
          expected: expectedPressure,
          deviation: ((biometrics.ambientPressure - expectedPressure) / expectedPressure) * 100,
          severity: 3, // Low severity, informational
          context: "Pressure dropping - storm system approaching",
        });
      }
    }

    return issues;
  }

  /**
   * Get expected ground contact time for runner at this pace/terrain/fatigue
   */
  private getExpectedGroundContactTime(
    baseline: RunnerBaseline,
    grade: number,
    pace: number,
    fatigueLevel: number
  ): number {
    // Base GCT from runner's baseline
    let expected = baseline.normalGroundContactTime.avg;

    // Uphill = shorter contact time (quick turnover)
    if (grade > 3) {
      expected *= 0.95; // Slightly shorter on steep uphills
    }

    // Downhill = longer contact time (eccentric loading)
    if (grade < -3) {
      expected *= 1.05;
    }

    // Faster pace = shorter contact time
    if (pace < baseline.normalPace.avg) {
      expected *= 0.98;
    }

    // Fatigue = longer contact time (slower movement)
    if (fatigueLevel > 70) {
      expected *= 1.08; // 8% increase when fatigued
    }

    return expected;
  }

  /**
   * Get expected stride length considering terrain, pace, and runner characteristics
   */
  private getExpectedStrideLength(
    baseline: RunnerBaseline,
    grade: number,
    pace: number,
    fatigueLevel: number
  ): number {
    let expected = baseline.normalStrideLength.avg;

    // Uphill = shorter stride (climbing)
    if (grade > 3) {
      expected *= 0.92; // ~8% shorter on steep climbs
    }

    // Downhill = longer stride (momentum)
    if (grade < -3) {
      expected *= 1.05;
    }

    // Faster pace = longer stride
    if (pace < baseline.normalPace.avg) {
      expected *= 1.03;
    }

    // Fatigue = shorter stride (inability to propel forward)
    if (fatigueLevel > 70) {
      expected *= 0.95;
    }

    return expected;
  }

  /**
   * Get expected vertical oscillation (bounce)
   */
  private getExpectedVerticalOscillation(
    baseline: RunnerBaseline,
    pace: number,
    grade: number,
    fatigueLevel: number
  ): number {
    let expected = baseline.normalVerticalOscillation.avg;

    // Faster pace = more efficient = less bounce
    if (pace < baseline.normalPace.avg) {
      expected *= 0.95;
    }

    // Uphill = more bounce (fighting gravity)
    if (grade > 5) {
      expected *= 1.08;
    }

    // Fatigue = more bounce (form breaks down)
    if (fatigueLevel > 60) {
      expected *= 1.10;
    }

    return expected;
  }

  /**
   * Get expected cadence for this terrain and pace
   */
  private getExpectedCadence(
    baseline: RunnerBaseline,
    grade: number,
    pace: number
  ): number {
    let expected = baseline.preferredCadence || 175; // typical is 170-180

    // Uphill = higher cadence (shorter, quicker steps)
    if (grade > 3) {
      expected *= 1.03; // 3% increase uphill
    }

    // Downhill = lower cadence (longer strides, controlled)
    if (grade < -3) {
      expected *= 0.97;
    }

    // Faster pace = slightly higher cadence
    if (pace < baseline.normalPace.avg) {
      expected *= 1.02;
    }

    return expected;
  }

  /**
   * Get expected heart rate for this pace in this runner
   */
  private getExpectedHRForPace(baseline: RunnerBaseline, pace: number): number {
    // Rough linear interpolation
    const paceRatio = baseline.normalPace.avg / pace;
    const hrRange = baseline.normalHeartRate.max - baseline.normalHeartRate.min;
    return baseline.normalHeartRate.avg + hrRange * (paceRatio - 1) * 0.5;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SEVERITY CALCULATIONS
  // ──────────────────────────────────────────────────────────────────────────

  private calculateGCTSeverity(
    current: number,
    expected: number,
    fatigueLevel: number
  ): number {
    const deviation = ((current - expected) / expected) * 100;
    
    if (deviation > 30) return 9; // Critical form issue
    if (deviation > 20) return 7; // Significant issue
    if (deviation > 15) return 5; // Moderate
    if (fatigueLevel < 60) return 3; // Low priority if not fatigued
    return 4;
  }

  private calculateStrideSeverity(
    current: number,
    expected: number,
    fatigueLevel: number
  ): number {
    const deviation = Math.abs(((current - expected) / expected) * 100);
    
    // More severe if high fatigue (indicates form breakdown)
    if (fatigueLevel > 80) return 8;
    if (fatigueLevel > 70) return 6;
    if (deviation > 15) return 5;
    return 3;
  }

  private calculateVOSeverity(
    current: number,
    expected: number,
    fatigueLevel: number
  ): number {
    const deviation = ((current - expected) / expected) * 100;
    
    if (deviation > 30 && fatigueLevel > 75) return 9; // Very bad
    if (deviation > 20) return 7;
    if (deviation > 15) return 5;
    return 3;
  }

  private calculateImbalanceSeverity(imbalance: number): number {
    if (imbalance > 10) return 8; // Severe asymmetry - possible injury
    if (imbalance > 7) return 6; // Significant
    if (imbalance > 5) return 4; // Moderate
    return 2;
  }

  private calculateCadenceSeverity(current: number, expected: number): number {
    const deviation = Math.abs(((current - expected) / expected) * 100);
    
    if (deviation > 15) return 7;
    if (deviation > 10) return 5;
    return 3;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POSITIVE REINFORCEMENT
  // ──────────────────────────────────────────────────────────────────────────

  private async generatePositiveReinforcement(
    context: CoachingContext
  ): Promise<CoachingFeedback> {
    const { biometrics, baseline, terrain } = context;

    const prompt = `
You are an elite running coach analyzing real-time biometric data.
The runner is performing WELL with no detected issues.

Runner Profile:
- Normal cadence: ${baseline.preferredCadence} spm
- Normal pace: ${baseline.normalPace.avg.toFixed(2)} min/km
- Normal GCT: ${baseline.normalGroundContactTime.avg.toFixed(0)}ms
- Typical stride: ${baseline.normalStrideLength.avg.toFixed(2)}m

Current Performance (All Excellent):
- Cadence: ${biometrics.cadence} spm (${Math.round(((biometrics.cadence - baseline.preferredCadence) / baseline.preferredCadence) * 100)}% of normal)
- Pace: ${biometrics.pace.toFixed(2)} min/km
- GCT: ${biometrics.groundContactTime}ms
- Stride: ${biometrics.strideLength.toFixed(2)}m
- Vertical Oscillation: ${biometrics.verticalOscillation.toFixed(1)}cm (efficient)
- HR Zone: ${biometrics.heartRateZone}
- Fatigue: ${context.fatigueLevel}%
- Terrain: ${terrain.courseType} (${terrain.currentGrade.toFixed(1)}% grade)

Generate ONE positive, encouraging coaching message that:
1. Acknowledges what they're doing RIGHT
2. Provides ONE specific thing to maintain or slightly improve
3. Is energizing and motivating
4. Is 1-2 sentences MAX

Format as JSON:
{
  "message": "...",
  "action": "...",
  "reasoning": "..."
}
`;

    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const result = JSON.parse(content.text);

    return {
      message: result.message,
      action: result.action,
      reasoning: result.reasoning,
      category: "efficiency",
      confidence: 0.9,
      severity: "info",
      isAnomalous: false,
      comparedToBaseline: "Running at personal best form",
      targetMetric: "Maintain",
      targetValue: biometrics.pace,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // AI-POWERED COACHING GENERATION
  // ──────────────────────────────────────────────────────────────────────────

  private async generateAICoachingFeedback(
    context: CoachingContext,
    primaryIssue: any
  ): Promise<CoachingFeedback> {
    const { biometrics, baseline, terrain, fatigueLevel } = context;

    const prompt = `
You are an elite running coach analyzing real-time biometric data during a run.

RUNNER PROFILE (Baseline from recent runs):
- Max HR: ${baseline.maxHeartRate} bpm
- Resting HR: ${baseline.restingHeartRate} bpm
- Preferred Cadence: ${baseline.preferredCadence} spm
- Typical Pace: ${baseline.normalPace.avg.toFixed(2)} ± ${(baseline.normalPace.max - baseline.normalPace.avg).toFixed(2)} min/km
- Normal GCT: ${baseline.normalGroundContactTime.avg.toFixed(0)}ms
- Normal Vertical Oscillation: ${baseline.normalVerticalOscillation.avg.toFixed(1)}cm
- Typical Stride: ${baseline.normalStrideLength.avg.toFixed(2)}m

CURRENT SITUATION:
- Pace: ${biometrics.pace.toFixed(2)} min/km
- HR: ${biometrics.heartRate} bpm (Zone ${biometrics.heartRateZone})
- Cadence: ${biometrics.cadence} spm
- GCT: ${biometrics.groundContactTime}ms
- Vertical Oscillation: ${biometrics.verticalOscillation.toFixed(1)}cm
- Stride: ${biometrics.strideLength.toFixed(2)}m
- GCT Balance: ${biometrics.groundContactBalance.toFixed(1)}% (50% = perfect)
- Fatigue Level: ${fatigueLevel}%
- Distance: ${(biometrics.distance / 1000).toFixed(2)}km
- Elapsed: ${Math.floor(biometrics.elapsedTime / 60)}min

TERRAIN CONTEXT:
- Course Type: ${terrain.courseType}
- Current Grade: ${terrain.currentGrade.toFixed(1)}%
- Recent Grade: ${terrain.recentGrade.toFixed(1)}%
- Elevation Gain So Far: ${terrain.elevationGain}m
- Elevation Loss So Far: ${terrain.elevationLoss}m

PRIMARY ISSUE DETECTED:
- Type: ${primaryIssue.type}
- Metric: ${primaryIssue.metric}
- Current: ${primaryIssue.current.toFixed(primaryIssue.current > 100 ? 0 : 2)}
- Expected: ${primaryIssue.expected.toFixed(primaryIssue.expected > 100 ? 0 : 2)}
- Deviation: ${primaryIssue.deviation.toFixed(1)}%
- Context: ${primaryIssue.context}

INSTRUCTIONS:
Generate a SPECIFIC, ACTIONABLE coaching message that:

1. IS INTELLIGENT: Consider the terrain context. Don't fault shorter strides uphill or longer strides downhill.
   Don't confuse fatigue-induced form loss with normal terrain adaptation.

2. ADDRESSES THE ROOT CAUSE: Identify WHY this is happening:
   - Terrain effect (uphill/downhill changes are normal)
   - Fatigue accumulation (after km ${(biometrics.distance / 1000).toFixed(1)})
   - Effort level mismatch
   - Possible form breakdown
   - Environmental factor

3. PROVIDES ACTIONABLE GUIDANCE: Tell them exactly what to do:
   - "Shorten stride on this hill" (not just "stride is short")
   - "Pick cadence up to 176" (specific target)
   - "Relax shoulders, focus on gravity pull" (form cue)
   - "Dial pace back to 5:50/km to recover" (specific number)

4. IS ENCOURAGING: Even if negative feedback, frame as fixable guidance not criticism.

5. IS BRIEF: 1-2 sentences maximum.

Generate JSON response:
{
  "message": "Your primary coaching cue (1-2 sentences, specific and actionable)",
  "category": "form|pacing|effort|fatigue|efficiency|recovery|environment",
  "action": "Specific thing to do right now",
  "targetMetric": "HR|pace|cadence|GCT|stride|etc",
  "targetValue": 123,
  "reasoning": "Why this issue is happening and why this advice fixes it",
  "severity": "info|warning|critical"
}
`;

    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const result = JSON.parse(content.text);

    return {
      message: result.message,
      category: result.category,
      action: result.action,
      reasoning: result.reasoning,
      targetMetric: result.targetMetric,
      targetValue: result.targetValue,
      confidence: 0.85,
      severity: result.severity,
      isAnomalous: primaryIssue.deviation > 20,
      comparedToBaseline: `${primaryIssue.deviation > 0 ? "+" : ""}${primaryIssue.deviation.toFixed(1)}% from baseline`,
    };
  }
}

export default new RealTimeBiomechanicalCoach();
