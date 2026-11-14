/*
 * Response shapes of the REST endpoints the apps use (Android network/ApiService.kt is the
 * contract). Note the run endpoints are serialised for Android: `distance` is METRES and
 * `duration` MILLISECONDS here, unlike the runs table (km / seconds).
 */

export type User = {
  id: string;
  email: string;
  name: string;
  dob?: string | null;
  gender?: string | null;
  height?: string | number | null;
  weight?: string | number | null;
  fitnessLevel?: string | null;
  desiredFitnessLevel?: string | null;
  profilePic?: string | null;
  createdAt?: string;
  isAdmin?: boolean;
  coachName?: string | null;
  coachGender?: string | null;
  coachAccent?: string | null;
  coachTone?: string | null;
  nicknameStyle?: string | null;
  subscriptionTier?: string | null;
  subscriptionStatus?: string | null;
  entitlementType?: string | null;
  entitlementExpiresAt?: string | null;
  trialExpiresAt?: string | null;
  aiPlansEnabled?: boolean;
  userCode?: string | null;
  timezone?: string | null;
  country?: string | null;
  defaultSessionType?: string | null;
  distanceMinKm?: number | null;
  distanceMaxKm?: number | null;
  coachPaceEnabled?: boolean;
  coachNavigationEnabled?: boolean;
  coachElevationEnabled?: boolean;
  coachHeartRateEnabled?: boolean;
  coachCadenceStrideEnabled?: boolean;
  coachKmSplitsEnabled?: boolean;
  coachStruggleEnabled?: boolean;
  coachMotivationalEnabled?: boolean;
  coachHalfKmCheckInEnabled?: boolean;
  coachKmSplitIntervalKm?: number | null;
  hasGarminWatchApp?: boolean;
  [k: string]: any;
};

export type RoutePoint = {
  latitude: number;
  longitude: number;
  timestamp?: number | null;
  speed?: number | null;
  altitude?: number | null;
  heartRate?: number | null;
  cadence?: number | null;
};

export type KmSplit = { km: number; time: number; pace: string };

export type Weather = {
  temperature?: number | null;
  humidity?: number | null;
  windSpeed?: number | null;
  windDirection?: number | null;
  description?: string | null;
  feelsLike?: number | null;
  condition?: string | null;
};

export type StrugglePoint = {
  id: string;
  timestamp?: number;
  distanceMeters?: number;
  paceAtStruggle?: string;
  baselinePace?: string;
  paceDropPercent?: number;
  currentGrade?: number | null;
  heartRate?: number | null;
  userComment?: string | null;
  isRelevant?: boolean;
};

export type Run = {
  id: string;
  startTime: number;
  endTime?: number | null;
  duration: number; // ms
  distance: number; // metres
  averageSpeed?: number;
  maxSpeed?: number;
  averagePace?: string | null;
  calories?: number;
  cadence?: number;
  maxCadence?: number | null;
  heartRate?: number;
  minHeartRate?: number | null;
  routePoints?: RoutePoint[];
  kmSplits?: KmSplit[];
  heartRateData?: number[] | null;
  paceData?: number[] | null;
  cadenceData?: number[] | null;
  altitudeData?: number[] | null;
  strugglePoints?: StrugglePoint[];
  aiCoachingNotes?: { time: number; message: string }[];
  userComments?: string | null;
  name?: string | null;
  difficulty?: string | null;
  weatherAtStart?: Weather | null;
  weatherAtEnd?: Weather | null;
  totalElevationGain?: number;
  totalElevationLoss?: number;
  terrainType?: string | null;
  routeName?: string | null;
  externalSource?: string | null;
  sessionType?: string | null;
  targetDistance?: number | null; // km
  targetTime?: number | null; // ms
  wasTargetAchieved?: boolean | null;
  linkedWorkoutId?: string | null;
  linkedPlanId?: string | null;
  groupRunId?: string | null;
  planProgressWeek?: number | null;
  planProgressWeeks?: number | null;
  workoutType?: string | null;
  workoutIntensity?: string | null;
  workoutDescription?: string | null;
  movingTime?: number | null; // s
  elapsedTime?: number | null; // s
  minElevation?: number | null;
  maxElevation?: number | null;
  steepestIncline?: number | null;
  steepestDecline?: number | null;
  totalSteps?: number | null;
  activeCalories?: number | null;
  estSweatLoss?: number | null;
  hasGarminData?: boolean;
  garminDeviceName?: string | null;
  avgStrideLength?: number | null;
  avgGroundContactTime?: number | null;
  avgGroundContactBalance?: number | null;
  avgVerticalOscillation?: number | null;
  avgVerticalRatio?: number | null;
  aerobicTrainingEffect?: number | null;
  anaerobicTrainingEffect?: number | null;
  trainingEffectLabel?: string | null;
  recoveryTimeMinutes?: number | null;
  vo2MaxEstimate?: number | null;
  avgRunningPower?: number | null;
  maxRunningPower?: number | null;
  avgRespirationRate?: number | null;
  avgHeartRateZone?: number | null;
  timeInZone1?: number | null;
  timeInZone2?: number | null;
  timeInZone3?: number | null;
  timeInZone4?: number | null;
  timeInZone5?: number | null;
  groundContactTimeData?: number[] | null;
  verticalOscillationData?: number[] | null;
  strideLengthData?: number[] | null;
  runningPowerData?: number[] | null;
  [k: string]: any;
};

export type Goal = {
  id: string;
  userId: string;
  type: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  targetDate?: string | null;
  eventName?: string | null;
  eventLocation?: string | null;
  distanceTarget?: string | null;
  timeTargetSeconds?: number | null;
  healthTarget?: string | null;
  weeklyRunTarget?: number | null;
  targetWeightKg?: number | null;
  startingWeightKg?: number | null;
  currentProgress?: number | null;
  isActive?: boolean;
  isCompleted?: boolean;
  createdAt?: string;
  completedAt?: string | null;
};

export type Friend = { id: string; name: string; profilePic?: string | null; userCode?: string | null; email?: string };

export type FriendRequest = {
  id: string;
  requesterId: string;
  addresseeId: string;
  requesterName?: string | null;
  requesterProfilePic?: string | null;
  addresseeName?: string | null;
  addresseeProfilePic?: string | null;
  status: string;
  message?: string | null;
  createdAt: string;
};

export type GroupRunParticipant = {
  userId: string;
  userName: string;
  profilePic?: string | null;
  invitationStatus?: string;
  [k: string]: any;
};

export type GroupRun = {
  id: string;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  creatorId?: string;
  creatorName?: string | null;
  meetingPoint?: string | null;
  meetingLat?: number | null;
  meetingLng?: number | null;
  distance?: number | null;
  dateTime?: string | null;
  plannedStartAt?: string | null;
  maxParticipants?: number | null;
  currentParticipants?: number | null;
  isPublic?: boolean;
  status?: string;
  inviteToken?: string | null;
  isJoined?: boolean;
  isOrganiser?: boolean;
  myInvitationStatus?: string | null;
  participants?: GroupRunParticipant[];
  [k: string]: any;
};

export type PlannedWorkout = {
  id: string;
  dayOfWeek?: number;
  scheduledDate?: string | null;
  workoutType: string;
  distance?: number | null; // km
  duration?: number | null; // s
  targetPace?: string | null;
  intensity?: string | null;
  hrZoneNumber?: number | null;
  hrZoneMinBpm?: number | null;
  hrZoneMaxBpm?: number | null;
  description?: string | null;
  instructions?: string | null;
  intervalCount?: number | null;
  intervalDistanceMeters?: number | null;
  intervalDurationSeconds?: number | null;
  restDistanceMeters?: number | null;
  restDurationSeconds?: number | null;
  intervalTargetPace?: string | null;
  restTargetPace?: string | null;
  isCompleted?: boolean;
  isSkipped?: boolean;
  status?: string | null;
  completedRunId?: string | null;
  sessionGoal?: string | null;
  sessionIntent?: string | null;
  effortLabel?: string | null;
  sessionType?: string | null;
  [k: string]: any;
};

export type PlanWeek = {
  id: string;
  weekNumber: number;
  weekDescription?: string | null;
  totalDistance?: number | null;
  focusArea?: string | null;
  intensityLevel?: string | null;
  workouts: PlannedWorkout[];
};

export type TrainingPlan = {
  id: string;
  goalType: string;
  targetDistance?: number | null;
  targetTime?: number | null;
  targetDate?: string | null;
  currentWeek?: number;
  totalWeeks?: number;
  experienceLevel?: string;
  daysPerWeek?: number;
  status: string;
  createdAt?: string;
  completedAt?: string | null;
  generatedThroughWeek?: number | null;
  totalWorkouts?: number;
  completedWorkouts?: number;
  safetyDisclaimer?: string | null;
  [k: string]: any;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data?: any;
  createdAt: string;
};

export type PersonalBest = {
  category: string;
  pace: string;
  distance: number;
  duration: number; // ms
  date: string;
  runId: string;
};
