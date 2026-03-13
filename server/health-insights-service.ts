/**
 * Health Insights Service
 * 
 * Provides comprehensive health metrics aggregation, analysis, and AI-powered insights
 * for the Health Insights tab in the mobile app.
 */

import { db } from './db';
import { garminWellnessMetrics, runs } from '../shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';

export interface HealthSnapshot {
  date: string;
  // All fields are optional since not all Garmin accounts provide every metric
  avgHeartRate?: number | null;
  sleepScore?: number | null;
  sleepDuration?: number | null; // seconds
  avgStressLevel?: number | null;
  bodyBatteryLevel?: number | null;
  avgBreathingRate?: number | null;
  skinTemperature?: number | null;
  vo2Max?: number | null;
  fitnessAge?: number | null;
  // Availability flags
  availableMetrics: string[]; // List of metrics with actual data
}

export interface SleepDetails {
  date: string;
  available: boolean; // Whether sleep data exists for this date
  totalDuration?: number | null; // seconds
  score?: number | null;
  deepSleep?: number | null; // seconds
  lightSleep?: number | null; // seconds
  remSleep?: number | null; // seconds
  awakeTime?: number | null; // seconds
  deepPercentage?: number | null;
  lightPercentage?: number | null;
  remPercentage?: number | null;
  napCount?: number | null;
  totalNapDuration?: number | null; // seconds
  qualityRatings?: {
    duration?: number | null;
    deepPercentage?: number | null;
    lightPercentage?: number | null;
    remPercentage?: number | null;
    restlessness?: number | null;
    awakeCount?: number | null;
    stress?: number | null;
  };
  message?: string; // e.g., "No sleep data available" or "Sleep data unavailable for this device"
}

export interface RecoveryStatus {
  hrv?: {
    lastNight?: number | null;
    status?: 'BALANCED' | 'UNBALANCED' | 'LOW' | null;
    trend?: 'improving' | 'declining' | 'stable' | null;
    available?: boolean;
  };
  bodyBattery?: {
    current?: number | null;
    status?: 'HIGH' | 'GOOD' | 'LOW' | 'VERY_LOW' | null;
    trend?: 'charging' | 'draining' | 'stable' | null;
    recommendation?: string;
    available?: boolean;
  };
  availableMetrics: string[]; // List of available recovery metrics
}

export interface DailyWellness {
  date: string;
  steps: number;
  stepsGoal: number;
  distance: number;
  activeTime: number;
  calories: {
    active: number;
    bmr: number;
    total: number;
  };
  intensityBreakdown: {
    sedentary: number;
    active: number;
    highlyActive: number;
  };
  wheelchairMetrics?: {
    pushes: number;
    pushDistance: number;
  };
}

export interface HeartRateProfile {
  date: string;
  average: number;
  min: number;
  max: number;
  resting: number;
  zones: {
    z1: number; // 50-60
    z2: number; // 60-70
    z3: number; // 70-85
    z4: number; // 85-100
    z5: number; // 100+
  };
}

export interface StressProfile {
  date: string;
  averageStress: number;
  status: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  breakdown: {
    rest: number;
    activity: number;
    lowStress: number;
    mediumStress: number;
    highStress: number;
  };
}

export interface HealthMetrics {
  vo2Max?: {
    value?: number | null;
    category?: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'BELOW_AVERAGE' | null;
    trend?: 'improving' | 'declining' | 'stable' | null;
    available?: boolean;
  };
  fitnessAge?: {
    value?: number | null;
    category?: 'EXCELLENT' | 'GOOD' | 'NORMAL' | 'BELOW_AVERAGE' | null;
    available?: boolean;
  };
  bloodPressure?: {
    systolic?: number | null;
    diastolic?: number | null;
    pulse?: number | null;
    classification?: string | null;
    available?: boolean;
  };
  spO2?: {
    value?: number | null;
    status?: 'EXCELLENT' | 'NORMAL' | 'LOW' | null;
    available?: boolean;
  };
  skinTemperature?: {
    value?: number | null;
    trend?: 'WARMING' | 'STABLE' | 'COOLING' | null;
    available?: boolean;
  };
  breathingRate?: {
    average?: number | null;
    min?: number | null;
    max?: number | null;
    status?: 'NORMAL' | 'ELEVATED' | null;
    available?: boolean;
  };
  availableMetrics: string[]; // List of available health metrics
}

export interface HealthInsight {
  id: string;
  priority: number;
  title: string;
  description: string;
  category: 'recovery' | 'breathing' | 'cardiovascular' | 'pregnancy' | 'general';
  actionable: boolean;
  action?: string;
}

export interface TrendData {
  dates: string[];
  sleepDuration: number[];
  avgStress: number[];
  vo2Max: number[];
  bodyBattery: number[];
}

/**
 * Get today's health snapshot
 */
export async function getTodaySnapshot(userId: string): Promise<HealthSnapshot> {
  const today = new Date().toISOString().split('T')[0];
  
  const metrics = await db
    .select()
    .from(garminWellnessMetrics)
    .where(
      and(
        eq(garminWellnessMetrics.userId, userId),
        eq(garminWellnessMetrics.date, today)
      )
    )
    .limit(1);

  if (!metrics.length) {
    return getEmptySnapshot(today);
  }

  const metric = metrics[0];
  const availableMetrics: string[] = [];

  // Only add metrics that have actual data
  if (metric.avgHeartRateInBeatsPerMinute) availableMetrics.push('heartRate');
  if (metric.sleepScore) availableMetrics.push('sleep');
  if (metric.avgStressLevel) availableMetrics.push('stress');
  if (metric.bodyBatteryLevel) availableMetrics.push('battery');
  if (metric.avgBreathingRate) availableMetrics.push('breathing');
  if (metric.skinTemperature) availableMetrics.push('temperature');
  if (metric.vo2Max) availableMetrics.push('vo2Max');
  if (metric.fitnessAge) availableMetrics.push('fitnessAge');
  
  return {
    date: today,
    avgHeartRate: metric.avgHeartRateInBeatsPerMinute || null,
    sleepScore: metric.sleepScore || null,
    sleepDuration: metric.sleepDurationInSeconds || null,
    avgStressLevel: metric.avgStressLevel || null,
    bodyBatteryLevel: metric.bodyBatteryLevel || null,
    avgBreathingRate: metric.avgBreathingRate || null,
    skinTemperature: metric.skinTemperature || null,
    vo2Max: metric.vo2Max || null,
    fitnessAge: metric.fitnessAge || null,
    availableMetrics,
  };
}

/**
 * Get sleep details for a specific date
 * Handles missing sleep data gracefully
 */
export async function getSleepDetails(userId: string, date: string): Promise<SleepDetails> {
  const metrics = await db
    .select()
    .from(garminWellnessMetrics)
    .where(
      and(
        eq(garminWellnessMetrics.userId, userId),
        eq(garminWellnessMetrics.date, date)
      )
    )
    .limit(1);

  // Return placeholder if no data
  if (!metrics.length) {
    return {
      date,
      available: false,
      message: 'No sleep data available for this date',
    };
  }

  const metric = metrics[0];
  
  // Check if we have any sleep data
  const hasSleepData = metric.sleepDurationInSeconds || metric.sleepScore;
  
  if (!hasSleepData) {
    return {
      date,
      available: false,
      message: 'Sleep tracking not available on this device',
    };
  }

  const totalDuration = metric.sleepDurationInSeconds || 0;
  const deepSleep = metric.sleepDeepInSeconds || 0;
  const lightSleep = metric.sleepLightInSeconds || 0;
  const remSleep = metric.sleepRemInSeconds || 0;
  const awakeTime = totalDuration - deepSleep - lightSleep - remSleep;

  return {
    date,
    available: true,
    totalDuration: totalDuration || null,
    score: metric.sleepScore || null,
    deepSleep: deepSleep || null,
    lightSleep: lightSleep || null,
    remSleep: remSleep || null,
    awakeTime: Math.max(0, awakeTime) || null,
    deepPercentage: totalDuration > 0 ? (deepSleep / totalDuration) * 100 : null,
    lightPercentage: totalDuration > 0 ? (lightSleep / totalDuration) * 100 : null,
    remPercentage: totalDuration > 0 ? (remSleep / totalDuration) * 100 : null,
    napCount: metric.napCount || null,
    totalNapDuration: metric.totalNapDurationSeconds || null,
    qualityRatings: {
      duration: metric.sleepTotalDurationRating || null,
      deepPercentage: metric.sleepDeepPercentageRating || null,
      lightPercentage: metric.sleepLightPercentageRating || null,
      remPercentage: metric.sleepRemPercentageRating || null,
      restlessness: metric.sleepRestlessnessRating || null,
      awakeCount: metric.sleepAwakeCountRating || null,
      stress: metric.sleepStressRating || null,
    },
  };
}

/**
 * Get recovery status (HRV + Body Battery)
 */
export async function getRecoveryStatus(userId: string): Promise<RecoveryStatus> {
  const today = new Date().toISOString().split('T')[0];
  
  const metrics = await db
    .select()
    .from(garminWellnessMetrics)
    .where(
      and(
        eq(garminWellnessMetrics.userId, userId),
        eq(garminWellnessMetrics.date, today)
      )
    )
    .limit(1);

  const availableMetrics: string[] = [];
  let hrvData: RecoveryStatus['hrv'] | undefined;
  let batteryData: RecoveryStatus['bodyBattery'] | undefined;

  if (!metrics.length) {
    return {
      availableMetrics,
    };
  }

  const metric = metrics[0];
  
  // HRV data handling
  if (metric.lastNightHrvAverage) {
    availableMetrics.push('hrv');
    const hrv = metric.lastNightHrvAverage;
    let hrvStatus: 'BALANCED' | 'UNBALANCED' | 'LOW' = 'BALANCED';
    if (hrv < 50) hrvStatus = 'LOW';
    else if (hrv < 70) hrvStatus = 'UNBALANCED';
    
    hrvData = {
      lastNight: hrv,
      status: hrvStatus,
      trend: 'stable',
      available: true,
    };
  }

  // Body battery data handling
  if (metric.bodyBatteryLevel !== null && metric.bodyBatteryLevel !== undefined) {
    availableMetrics.push('battery');
    const battery = metric.bodyBatteryLevel;
    let batteryStatus: 'HIGH' | 'GOOD' | 'LOW' | 'VERY_LOW' = 'GOOD';
    if (battery > 75) batteryStatus = 'HIGH';
    else if (battery < 30) batteryStatus = 'VERY_LOW';
    else if (battery < 50) batteryStatus = 'LOW';

    const recommendation = getBatteryRecommendation(batteryStatus);
    
    batteryData = {
      current: battery,
      status: batteryStatus,
      trend: 'stable',
      recommendation,
      available: true,
    };
  }

  return {
    ...(hrvData && { hrv: hrvData }),
    ...(batteryData && { bodyBattery: batteryData }),
    availableMetrics,
  };
}

/**
 * Get daily wellness metrics
 */
export async function getDailyWellness(userId: string, date: string): Promise<DailyWellness | null> {
  const metrics = await db
    .select()
    .from(garminWellnessMetrics)
    .where(
      and(
        eq(garminWellnessMetrics.userId, userId),
        eq(garminWellnessMetrics.date, date)
      )
    )
    .limit(1);

  if (!metrics.length) {
    return null;
  }

  const metric = metrics[0];
  const sedentary = (metric.sedentaryDurationInSeconds || 0);
  const active = (metric.moderateIntensityDurationInSeconds || 0);
  const highlyActive = (metric.vigorousIntensityDurationInSeconds || 0);

  return {
    date,
    steps: metric.steps || 0,
    stepsGoal: metric.stepsGoal || 7000,
    distance: metric.distanceInMeters || 0,
    activeTime: active + highlyActive,
    calories: {
      active: metric.activeKilocalories || 0,
      bmr: metric.bmrKilocalories || 0,
      total: (metric.activeKilocalories || 0) + (metric.bmrKilocalories || 0),
    },
    intensityBreakdown: {
      sedentary,
      active,
      highlyActive,
    },
    wheelchairMetrics: metric.pushes ? {
      pushes: metric.pushes,
      pushDistance: metric.pushDistanceInMeters || 0,
    } : undefined,
  };
}

/**
 * Get health metrics
 * Only returns metrics that have actual data available
 */
export async function getHealthMetrics(userId: string): Promise<HealthMetrics> {
  const today = new Date().toISOString().split('T')[0];
  
  const metrics = await db
    .select()
    .from(garminWellnessMetrics)
    .where(
      and(
        eq(garminWellnessMetrics.userId, userId),
        eq(garminWellnessMetrics.date, today)
      )
    )
    .limit(1);

  const availableMetrics: string[] = [];
  const result: HealthMetrics = { availableMetrics };

  if (!metrics.length) {
    return result;
  }

  const metric = metrics[0];

  if (metric.vo2Max) {
    availableMetrics.push('vo2Max');
    result.vo2Max = {
      value: metric.vo2Max,
      category: categorizeVO2Max(metric.vo2Max),
      trend: 'stable',
      available: true,
    };
  }

  if (metric.fitnessAge) {
    availableMetrics.push('fitnessAge');
    result.fitnessAge = {
      value: metric.fitnessAge,
      category: categorizeFitnessAge(metric.fitnessAge),
      available: true,
    };
  }

  if (metric.systolicBloodPressure) {
    availableMetrics.push('bloodPressure');
    result.bloodPressure = {
      systolic: metric.systolicBloodPressure,
      diastolic: metric.diastolicBloodPressure || null,
      pulse: metric.bloodPressurePulse || null,
      classification: classifyBloodPressure(
        metric.systolicBloodPressure,
        metric.diastolicBloodPressure || 0
      ),
      available: true,
    };
  }

  if (metric.avgSpO2) {
    availableMetrics.push('spO2');
    result.spO2 = {
      value: metric.avgSpO2,
      status: metric.avgSpO2 >= 95 ? 'EXCELLENT' : metric.avgSpO2 >= 90 ? 'NORMAL' : 'LOW',
      available: true,
    };
  }

  if (metric.skinTemperature) {
    availableMetrics.push('skinTemperature');
    result.skinTemperature = {
      value: metric.skinTemperature,
      trend: 'STABLE',
      available: true,
    };
  }

  if (metric.avgBreathingRate) {
    availableMetrics.push('breathingRate');
    result.breathingRate = {
      average: metric.avgBreathingRate,
      min: metric.minBreathingRate || null,
      max: metric.maxBreathingRate || null,
      status: metric.avgBreathingRate > 20 ? 'ELEVATED' : 'NORMAL',
      available: true,
    };
  }

  result.availableMetrics = availableMetrics;
  return result;
}

/**
 * Get health insights
 */
export async function getHealthInsights(userId: string): Promise<HealthInsight[]> {
  const insights: HealthInsight[] = [];
  
  const today = new Date().toISOString().split('T')[0];
  const metrics = await db
    .select()
    .from(garminWellnessMetrics)
    .where(
      and(
        eq(garminWellnessMetrics.userId, userId),
        eq(garminWellnessMetrics.date, today)
      )
    )
    .limit(1);

  if (!metrics.length) {
    return insights;
  }

  const metric = metrics[0];

  // Recovery insight
  if (metric.bodyBatteryLevel && metric.bodyBatteryLevel < 50) {
    insights.push({
      id: 'recovery_1',
      priority: 1,
      title: 'Recovery Priority',
      description: `Your body battery is low (${metric.bodyBatteryLevel}/100). Consider taking an easy recovery day.`,
      category: 'recovery',
      actionable: true,
      action: 'Take a recovery day with light activity',
    });
  }

  // HRV insight
  if (metric.lastNightHrvAverage && metric.lastNightHrvAverage > 70) {
    insights.push({
      id: 'recovery_2',
      priority: 2,
      title: 'Great Recovery Status',
      description: `Your HRV is excellent (${metric.lastNightHrvAverage}ms). You're well-recovered and ready for training.`,
      category: 'recovery',
      actionable: true,
      action: 'Good day for hard workouts',
    });
  }

  // VO2 Max insight
  if (metric.vo2Max && metric.vo2Max > 40) {
    insights.push({
      id: 'cardio_1',
      priority: 3,
      title: 'Excellent Aerobic Fitness',
      description: `Your VO2 Max is outstanding (${metric.vo2Max}). Keep up your aerobic training!`,
      category: 'cardiovascular',
      actionable: false,
    });
  }

  // Breathing insight
  if (metric.avgBreathingRate && metric.avgBreathingRate > 16) {
    insights.push({
      id: 'breathing_1',
      priority: 4,
      title: 'Breathing Rate Elevated',
      description: `Your breathing rate is slightly elevated (${metric.avgBreathingRate} bpm). Focus on relaxation techniques.`,
      category: 'breathing',
      actionable: true,
      action: 'Try meditation or deep breathing',
    });
  }

  // Blood pressure insight
  if (metric.systolicBloodPressure && metric.systolicBloodPressure > 140) {
    insights.push({
      id: 'cardio_2',
      priority: 1,
      title: 'Blood Pressure Alert',
      description: `Your blood pressure is elevated (${metric.systolicBloodPressure}/${metric.diastolicBloodPressure}). Consult your doctor.`,
      category: 'cardiovascular',
      actionable: true,
      action: 'Contact your healthcare provider',
    });
  }

  return insights.sort((a, b) => a.priority - b.priority);
}

/**
 * Get trend data for charts
 */
export async function getTrendData(userId: string, days: number = 7): Promise<TrendData> {
  const trendData: TrendData = {
    dates: [],
    sleepDuration: [],
    avgStress: [],
    vo2Max: [],
    bodyBattery: [],
  };

  const metricsData = await db
    .select()
    .from(garminWellnessMetrics)
    .where(eq(garminWellnessMetrics.userId, userId))
    .orderBy(desc(garminWellnessMetrics.date))
    .limit(days);

  metricsData.reverse().forEach((metric) => {
    trendData.dates.push(metric.date);
    
    // Only add data points that have actual values (avoid padding with zeros)
    if (metric.sleepDurationInSeconds) {
      trendData.sleepDuration.push(metric.sleepDurationInSeconds / 3600);
    }
    if (metric.avgStressLevel !== null && metric.avgStressLevel !== undefined) {
      trendData.avgStress.push(metric.avgStressLevel);
    }
    if (metric.vo2Max) {
      trendData.vo2Max.push(metric.vo2Max);
    }
    if (metric.bodyBatteryLevel !== null && metric.bodyBatteryLevel !== undefined) {
      trendData.bodyBattery.push(metric.bodyBatteryLevel);
    }
  });

  return trendData;
}

// Helper functions

function getEmptySnapshot(date: string): HealthSnapshot {
  return {
    date,
    avgHeartRate: 0,
    sleepScore: 0,
    sleepDuration: 0,
    avgStressLevel: 0,
    bodyBatteryLevel: 0,
    avgBreathingRate: 0,
    skinTemperature: 0,
  };
}

function getDefaultRecoveryStatus(): RecoveryStatus {
  return {
    hrv: {
      lastNight: 0,
      status: 'BALANCED',
      trend: 'stable',
    },
    bodyBattery: {
      current: 50,
      status: 'GOOD',
      trend: 'stable',
      recommendation: 'Ready for training',
    },
  };
}

function getBatteryRecommendation(status: 'HIGH' | 'GOOD' | 'LOW' | 'VERY_LOW'): string {
  switch (status) {
    case 'HIGH':
      return 'Excellent energy levels. Perfect for hard workouts.';
    case 'GOOD':
      return 'Good energy. Ready for regular training.';
    case 'LOW':
      return 'Energy depleted. Consider a recovery day.';
    case 'VERY_LOW':
      return 'Critical energy level. Rest and recover today.';
  }
}

function categorizeVO2Max(vo2Max: number): 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'BELOW_AVERAGE' {
  if (vo2Max > 40) return 'EXCELLENT';
  if (vo2Max > 30) return 'GOOD';
  if (vo2Max > 20) return 'AVERAGE';
  return 'BELOW_AVERAGE';
}

function categorizeFitnessAge(age: number): 'EXCELLENT' | 'GOOD' | 'NORMAL' | 'BELOW_AVERAGE' {
  const chronological = 30; // Would come from user profile
  const difference = chronological - age;
  
  if (difference > 10) return 'EXCELLENT';
  if (difference > 5) return 'GOOD';
  if (difference > -5) return 'NORMAL';
  return 'BELOW_AVERAGE';
}

function classifyBloodPressure(systolic: number, diastolic: number): string {
  if (systolic < 120 && diastolic < 80) return 'OPTIMAL';
  if (systolic < 130 && diastolic < 80) return 'NORMAL';
  if (systolic < 140 || diastolic < 90) return 'ELEVATED';
  if (systolic < 160 || diastolic < 100) return 'STAGE 1 HYPERTENSION';
  if (systolic >= 160 || diastolic >= 100) return 'STAGE 2 HYPERTENSION';
  return 'HYPERTENSIVE CRISIS';
}
