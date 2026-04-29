/**
 * Types for Garmin watch data integration with AI analysis
 * Matches the request format sent from Android app
 */

export interface GarminDataSummary {
  hasGarminData: boolean;
  deviceName?: string | null;
  
  // Running Dynamics
  avgGroundContactTime?: number | null;
  minGroundContactTime?: number | null;
  maxGroundContactTime?: number | null;
  avgGroundContactBalance?: number | null;
  avgVerticalOscillation?: number | null;
  maxVerticalOscillation?: number | null;
  avgVerticalRatio?: number | null;
  avgStrideLength?: number | null;
  minStrideLength?: number | null;
  maxStrideLength?: number | null;
  
  // Training
  aerobicTrainingEffect?: number | null;
  anaerobicTrainingEffect?: number | null;
  recoveryTimeMinutes?: number | null;
  vo2MaxEstimate?: number | null;
  
  // Environmental
  avgAmbientPressure?: number | null;
  avgBearing?: number | null;
  
  // Computed
  terrainSummary?: string | null;
  estimatedFatigue?: number | null;
}

export interface UserProfileForAI {
  userId: string;
  whatIKnowAboutYou: string;
  garminInsights?: string | null;
  
  // Baseline metrics (4-week rolling average)
  baselineGCT?: number | null;
  baselineVO?: number | null;
  baselineStride?: number | null;
  baselineCadence?: number | null;
  baselineVO2Max?: number | null;
}

export interface ComprehensiveAnalysisRequest {
  runId: string;
  garminDataSummary?: GarminDataSummary | null;
  userProfile?: UserProfileForAI | null;
}
