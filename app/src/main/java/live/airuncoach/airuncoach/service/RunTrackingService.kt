package live.airuncoach.airuncoach.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import live.airuncoach.airuncoach.MainActivity
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.WeatherRepository
import live.airuncoach.airuncoach.data.SyncQueue
import live.airuncoach.airuncoach.data.workers.SyncWorker
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.*
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.data.UserPreferences
import live.airuncoach.airuncoach.utils.CoachingAudioQueue
import live.airuncoach.airuncoach.utils.RouteFollowingSimulator
import live.airuncoach.airuncoach.utils.RunSimulator
import live.airuncoach.airuncoach.utils.TextToSpeechHelper
import live.airuncoach.airuncoach.utils.AudioPlayerHelper
import live.airuncoach.airuncoach.domain.model.TurnInstruction
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.domain.model.StrugglePoint
import live.airuncoach.airuncoach.util.NavigationRouteHolder
import live.airuncoach.airuncoach.di.GarminWatchManagerEntryPoint
import com.google.maps.android.PolyUtil
import com.google.maps.android.SphericalUtil
import dagger.hilt.android.EntryPointAccessors
import retrofit2.HttpException
import android.util.Base64
import java.io.File
import java.security.MessageDigest
import java.util.*
import kotlin.collections.ArrayList
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.abs

class RunTrackingService : Service(), SensorEventListener {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var notificationManager: NotificationManager
    private lateinit var weatherRepository: WeatherRepository
    private lateinit var sensorManager: SensorManager
    private lateinit var syncQueue: SyncQueue  // For offline run persistence
    private var stepCounterSensor: Sensor? = null
    private var stepDetectorSensor: Sensor? = null  // Fallback: fires per step
    private var heartRateSensor: Sensor? = null
    private var usingStepDetector = false  // Track which sensor is active
    private var wakeLock: PowerManager.WakeLock? = null
    
    // ── Power Saver Mode Detection ──────────────────────────────────────────��──────
    // When the phone's power saver/low power mode is enabled, Android throttles GPS
    // updates and sensor reads, which directly impacts tracking accuracy.
    // We track this state and adjust location request priority accordingly.
    private var isPhonePowerSaverActive = false
    private var powerSaverModeDetected = false  // Flag indicating power saver was active during this run
    private var powerSaverStatusBroadcastReceiver: BroadcastReceiver? = null
    
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    // ── Garmin watch bridge (Scenario 2 — Phone + Watch) ──────────────────────
    // Sends live run state to the watch and receives start/pause/resume/stop commands.
    // Gracefully no-ops if the ConnectIQ SDK is not present or no watch is paired.
    private var garminWatchManager: GarminWatchManager? = null

    // Timestamp of the last watch GPS injection (ms).  While watch GPS is flowing
    // (within 15 s) phone GPS updates are skipped to prevent double-counting distance.
    private var lastWatchGpsMs: Long = 0L
    // Throttle for live-session metric sync (don't hammer the server every GPS tick)
    private var lastLiveSessionSyncMs: Long = 0L

    // True when this run was initiated by a watch "start" command.
    // Used to: (a) pre-block phone GPS at run start and (b) skip sending redundant
    // runUpdate messages back to the watch (watch has its own authoritative data).
    private var wasRunStartedByWatch: Boolean = false
    private var hasGarminData: Boolean = false   // true once any biometric frame is received
    private var garminDeviceName: String? = null // e.g. "Vívoactive 4", "Forerunner 965"

    // AI Coaching
    private lateinit var coachingFeaturePrefs: live.airuncoach.airuncoach.data.CoachingFeaturePreferences
    private lateinit var apiService: ApiService
    private lateinit var sessionManager: SessionManager
    private lateinit var textToSpeechHelper: TextToSpeechHelper
    private lateinit var audioPlayerHelper: AudioPlayerHelper
    private var currentUser: User? = null
    /**
     * Activity type derived from the user's defaultSessionType profile setting.
     * "run" (default) or "walk" — sent to every OpenAI coaching request so the AI
     * uses correct vocabulary and terminology for the session (e.g. "walking pace"
     * vs "running pace", "step rate" vs "cadence cues", etc.).
     * Updated whenever currentUser is loaded from the API.
     */
    private var currentActivityType: String = "run"
    // True once currentActivityType has been set from an explicit session-start intent
    // (EXTRA_SESSION_TYPE). Guards against the async user-profile load in onCreate()
    // resolving AFTER onStartCommand() and silently overwriting the real session type
    // with the user's default preference (see currentActivityType usages below).
    private var activityTypeSetFromSessionIntent = false
    private var runHistoryStats: live.airuncoach.airuncoach.network.model.RunHistoryStats? = null
    private var activeGoals: List<ActiveGoalInfo> = emptyList()  // Goals for AI coaching context
    private var lastPhase: CoachingPhase? = null
    private var last500mMilestone = 0
    // One-time guard so the target-reached congratulatory cue (fireTargetReachedCoaching)
    // fires exactly once per run, at the tick the target distance is first crossed.
    private var hasFiredTargetReachedCoaching = false
    // For walk sessions: tracks the last 500m boundary at which a split coaching cue fired.
    // Walk sessions get a coaching update every 500m (vs every 1km for runs) because walkers
    // move slower and need more frequent check-ins to stay engaged and on pace.
    private var lastWalk500mSplit = 0
    private val coachingHistory = mutableListOf<AiCoachingNote>() // Track what coaching has been given with timestamps
    private var preRunBriefingText: String? = null // Pre-run briefing text to record in coaching history
    private var isMuted = false // User can mute coach
    private var lastCoachingTime: Long = 0 // Cooldown between coaching events
    private val COACHING_COOLDOWN_MS = 30_000L // 30 second minimum gap between coaching
    private var hasCoachingFiredThisTick = false // Only one coaching trigger per location update
    /** 2% buffer applied to HR upper-bound trigger conditions ("hr > X") to prevent brief spikes from
     *  firing zone-high alerts. E.g. a 131 bpm ceiling won't alert until ~134 bpm (131 × 1.02). */
    private val HR_ZONE_BUFFER_MULTIPLIER = 1.02
    /** Set to true when the session_complete trigger fires — stops all further coaching plan triggers */
    private var sessionCoachingPlanComplete = false

    // ── Global coaching coordinator ──
    // Prevents back-to-back audio from different coaching types (pace, splits, nav, HR, etc.)
    // Each coaching type records when it fires; all types check the global timestamp before triggering.
    private var lastGlobalCoachingTime: Long = 0          // Timestamp of last coaching audio from ANY source
    private var lastGlobalCoachingDistance: Double = 0.0   // Distance at which last coaching fired
    private val GLOBAL_COACHING_MIN_GAP_MS = 15_000L      // Minimum 15 seconds between ANY coaching audio
    private val GLOBAL_COACHING_MIN_GAP_M = 150.0         // Minimum 150m between ANY coaching audio
    private val NAV_COACHING_MIN_GAP_MS = 8_000L          // Navigation gets shorter gap (safety-critical) but still prevents overlap
    private val KM_SPLIT_EXCLUSION_ZONE_M = 200.0         // Suppress pace coaching within 200m of a km boundary
    
    // Run data
    private var targetDistance: Double? = null // ALWAYS in metres (normalized on receipt)
    private var targetTime: Long? = null     // For time-based goals (milliseconds)
    private val FINAL_STRETCH_METERS = 500.0 // Last 500m: only motivation coaching allowed
    // Smart target inference — when no explicit targetDistance is set (e.g. watch-initiated free
    // runs), we detect the most likely target from common race distances so final-stretch coaching
    // (500m / 250m / 100m to go) can still fire.
    private val COMMON_RACE_DISTANCES_M = listOf(1000.0, 2000.0, 3000.0, 5000.0, 10000.0, 15000.0, 21097.5, 42195.0)
    private var inferredTargetDistance: Double? = null
    private var hasRoute: Boolean = false
    private val routePoints = mutableListOf<LocationPoint>()
    private val kmSplits = mutableListOf<KmSplit>()
    private var lastKmSplit = 0
    // Pending km split that was skipped because the global cooldown was active exactly at the
    // km crossing.  Retried on subsequent location updates until the cooldown clears.
    private var pendingKmSplitCoaching: KmSplit? = null
    private var startTime: Long = 0
    private var lastSplitTime: Long = 0
    // Watch timer at the last km boundary. For companion-initiated sessions,
    // this keeps our computed splits on Garmin's paused-session clock instead
    // of the phone wall clock.
    private var lastSplitWatchElapsedSeconds: Int = 0
    private var totalDistance: Double = 0.0
    private var maxSpeed: Float = 0f
    private var currentPace: String = "0:00" // Real-time/instant pace based on recent GPS
    private var isTracking = false
    private var aiCoachEnabledForSession = true
    // Watch speed smoothing — exponential moving average applied to raw Garmin GPS speed
    // before converting to pace, to suppress brief GPS jitter spikes (which would otherwise
    // appear as unrealistically fast pace e.g. "2:04" when the user is actually stationary).
    private var smoothedWatchSpeedMs: Float = 0f
    // How many watch GPS updates have arrived in this session.  GPS lock isn't stable in
    // the first ~8 seconds so we show "–" until the signal settles.
    private var watchGpsUpdateCount: Int = 0
    // Authoritative elapsed time (seconds) from the watch firmware (Activity.Info.timerTime).
    // Used as session duration when wasRunStartedByWatch so the phone clock divergence is eliminated.
    private var watchElapsedSeconds: Int = 0
    // Last accepted Garmin distance. Kept separately from totalDistance because a
    // transient phone-GPS update must not prevent a later valid Garmin total from
    // correcting it.
    private var watchDistanceM: Float = 0f
    // Pause tracking — ensures paused time is excluded from all duration/pace calculations
    private var totalPausedMs: Long = 0          // Accumulated paused milliseconds
    private var pauseStartTime: Long = 0         // When the current pause started (0 = not paused)
    private var splitPausedMs: Long = 0          // Paused time within the current km split
    private var currentCadence: Int = 0
    private var currentHeartRate: Int = 0
    private var maxHeartRate: Int = 0         // Peak HR seen during this run
    private var minHeartRate: Int = 0         // Lowest confident HR seen during this run
    private var heartRateSum: Long = 0        // Running sum for true average calculation
    private var heartRateSampleCount: Int = 0 // Number of HR samples taken

    // ── HR sensor confidence filter ────────────────────────────────────────────
    // Circular buffer of the last HR_CONFIDENCE_WINDOW timestamped readings.
    // Used to detect wrist-sensor contact-loss (a sudden drop of >30 bpm in
    // under 10 seconds is almost certainly noise, not a real physiological event).
    // A reading is only "confident" once the buffer has enough samples AND the
    // candidate reading is within HR_MAX_SUDDEN_CHANGE_BPM of the rolling average.
    private val recentHrReadings: ArrayDeque<Pair<Long, Int>> = ArrayDeque() // (timestamp ms, bpm)
    private var lastConfidentHr: Int = 0   // Last validated HR reading (used as reference)

    // ── HR trend tracking (for smart coaching: "are they already responding?") ──
    // A ring buffer of the last HR_TREND_WINDOW confident readings (no timestamps needed here;
    // we update this only when validateAndUpdateHRBuffer accepts the reading).
    // Used before firing hr_zone_high triggers to detect whether the athlete's HR is
    // already falling — in which case the AI should acknowledge, not direct.
    private val hrTrendBuffer: ArrayDeque<Int> = ArrayDeque()   // bpm values (max HR_TREND_WINDOW)

    // ── HR recovery acknowledgement state ──────────────────────────────────────
    // When an HR-zone-high trigger fires, we note the zone max it fired against.
    // When HR subsequently returns INTO zone AND is trending downward, we fire a
    // single recovery acknowledgement ("Good — heart rate settling back down").
    // hrZoneExceededMax stores the phaseHRMax that caused the zone-high trigger.
    // Reset to 0 after the acknowledgement fires or at run start.
    private var hrZoneExceededMax: Int = 0
    private var lastHrRecoveryAcknowledgedAtKm: Double = -5.0  // Distance when last ack fired

    // ── Rolling pace buffer (for trend detection) ──────────────────────────────
    // The last PACE_TREND_WINDOW pace readings (sec/km) from GPS updates.
    // Used to detect whether the athlete is already slowing when HR zone high fires.
    private val recentPaceSecPerKm: ArrayDeque<Double> = ArrayDeque()   // sec/km (max PACE_TREND_WINDOW)
    private var initialStepCount: Int = -1
    private var lastStepTimestamp: Long = 0
    // Step detector cadence tracking (fallback)
    private var stepDetectorSteps: Int = 0
    private var stepDetectorWindowStart: Long = 0
    private var stepCountFromDetector: Int = 0 // Step counter from TYPE_STEP_DETECTOR
    private var lastDetectorCadenceCalcTime: Long = 0 // Last time cadence was calculated from detector
    private var totalStepsDuringRun: Int = 0 // Accumulated steps in this run (from step counter)
    
    // Cadence tracking for average/max (mirrors HR tracking)
    private var cadenceSum: Long = 0
    private var cadenceCount: Int = 0
    private var maxCadenceValue: Int = 0
    private var minCadenceValue: Int = 0
    private val watchZoneSeconds = IntArray(6)
    private var watchZoneSampleCount: Int = 0
    private var watchZoneSum: Int = 0

    // ── Watch Running Dynamics accumulators (reset at run start) ──────────────
    // Accumulated each 2-second frame from the watch; averaged at run end.
    private var watchGctSum: Float = 0f;    private var watchGctCount: Int = 0     // Ground Contact Time (ms)
    private var watchGcbSum: Float = 0f;    private var watchGcbCount: Int = 0     // Ground Contact Balance (%)
    private var watchVoSum:  Float = 0f;    private var watchVoCount:  Int = 0     // Vertical Oscillation (cm)
    private var watchMaxVo:  Float = 0f                                            // Peak VO during run
    private var watchVrSum:  Float = 0f;    private var watchVrCount:  Int = 0     // Vertical Ratio (%)
    private var watchSlSum:  Float = 0f;    private var watchSlCount:  Int = 0     // Stride Length (m)
    private var watchMinSl:  Float = 0f;    private var watchMaxSl:  Float = 0f   // Min / max stride
    // Latest single-value watch metrics (no averaging — keep most recent non-zero)
    private var watchLatestAte:          Float = 0f   // Aerobic Training Effect
    private var watchLatestAnAte:        Float = 0f   // Anaerobic Training Effect
    private var watchLatestRecoveryMins: Int   = 0    // Recovery time (minutes)
    private var watchLatestVo2Max:       Float = 0f   // VO2 Max estimate
    private var watchLatestPressure:     Float = 0f   // Ambient pressure (Pa)
    private var watchLatestBearing:      Float = 0f   // GPS bearing (degrees)
    // Running Power (watts — device-dependent, 0 if unsupported)
    private var watchPwrSum:   Float = 0f;  private var watchPwrCount:  Int = 0;  private var watchMaxPwr:  Int = 0
    // Respiration Rate (breaths/min — Fenix 7+ only)
    private var watchRespSum:  Float = 0f;  private var watchRespCount: Int = 0

    // ── Time-series lists (one sample per watch frame ~2s, for graph upload) ──
    // Sampled at ~2-second intervals from the watch. A 60-min run ≈ 1800 samples each.
    private val watchHrSeries       = mutableListOf<Int>()      // bpm
    private val watchCadenceSeries  = mutableListOf<Int>()      // steps/min
    private val watchAltSeries      = mutableListOf<Float>()    // metres (barometric)
    private val watchPaceSeries     = mutableListOf<Double>()   // sec/km (derived from speedMs)
    private val watchGctSeries      = mutableListOf<Float>()    // ms
    private val watchGcbSeries      = mutableListOf<Float>()    // %
    private val watchVoSeries       = mutableListOf<Float>()    // cm
    private val watchVrSeries       = mutableListOf<Float>()    // %
    private val watchSlSeries       = mutableListOf<Float>()    // m
    private val watchPwrSeries      = mutableListOf<Int>()      // watts
    private val watchRespSeries     = mutableListOf<Float>()    // br/min
    private val watchBearingSeries  = mutableListOf<Float>()    // degrees
    private val watchStepsSeries    = mutableListOf<Int>()      // estimated steps per frame

    // GPS accuracy tracking (from Garmin Pos.Quality — 0=poor, 4=best; converted to approx metres CEP)
    private var watchGpsAccuracySum:   Float = 0f
    private var watchGpsAccuracyCount: Int   = 0
    private var watchGpsAccuracyWorst: Float = 0f   // highest metres CEP seen (worst)
    // Pace extremes (sec/km) — min = fastest, max = slowest
    private var watchMinPace: Double = 0.0
    private var watchMaxPace: Double = 0.0

    // Struggle detection - baseline is session average pace, updated every 500m
    private var baselinePace: Float = 0f
    private var lastBaselineUpdateDistance: Double = 0.0
    private var lastStruggleTriggerTime: Long = 0
    private var isStruggling = false
    private val strugglePointsList = mutableListOf<StrugglePoint>()
    // Rolling window for pace smoothing — prevents GPS jitter from creating false struggle/coaching readings
    // Stores recent (distance, time) pairs; smoothed pace = sum(time) / sum(distance) * 1000
    private val recentPaceDistances = mutableListOf<Double>()  // metres
    private val recentPaceTimes = mutableListOf<Double>()       // seconds
    private val PACE_WINDOW_SIZE = 8  // ~8 GPS points ≈ 8-16 seconds of data

    // Elevation coaching
    private var lastElevationCoachingTime: Long = 0

    // ── Terrain state machine ────────────────────────────────────────────────
    // Current classified terrain state (what the runner is on RIGHT NOW).
    // Values: "flat" | "gradual_climb" | "steep_climb" | "gradual_descent" | "steep_descent" | "rolling"
    private var currentTerrainState: String = "flat"

    // The grade direction has been sustained for this distance (m) — used to avoid
    // changing state on momentary GPS spikes.
    private var pendingTerrainDirection: Int = 0  // 1 = up, -1 = down, 0 = flat
    private var pendingTerrainDistanceM: Double = 0.0

    // Per-segment accumulators (reset when terrain state changes)
    private var slopeDirection: Int = 0 // kept for rolling-window compat
    private var slopeDistanceMeters: Double = 0.0
    private var slopeElevationGain: Double = 0.0
    private var slopeElevationLoss: Double = 0.0

    private var downhillFinishTriggered: Boolean = false

    // Rolling terrain detection — 1 km sliding window
    private var rollingWindowGainM: Double = 0.0
    private var rollingWindowLossM: Double = 0.0
    private var rollingWindowDirectionChanges: Int = 0
    private var rollingWindowStartKm: Double = 0.0
    private var lastRollingTerrainCoachKm: Int = -2
    private var rollingTerrainDetected: Boolean = false
    // Altitude smoothing - rolling window to filter GPS noise
    private val recentAltitudes = ArrayList<Double>() // Rolling window of recent altitudes
    private var smoothedAltitude: Double? = null // Smoothed altitude from rolling average
    // Phone GPS elevation tracking — 60-second windowed means (see PHONE_ELEV_WINDOW constant)
    private val phoneElevBuffer = ArrayList<Double>() // Accumulates raw altitudes for 60-second window
    private var prevPhoneElevWindowMean: Double? = null // Mean from the previous completed 60-second window
    // Garmin GPS elevation tracking — 10-sample windowed means (~20 seconds at 0.5 Hz update rate).
    // The per-sample 2.0m threshold approach was too aggressive: at 5:30/km on a 5% grade each
    // 2-second Garmin sample only rises ~0.15m — far below 2.0m — so ALL climbing was discarded.
    // Window approach: 10 samples × 2s = 20-second window; mean noise ±0.10m; a 5% grade gives
    // ~1.5m per window (well above the 0.5m commit threshold). False-positive on flat: rare.
    private val garminElevBuffer = ArrayList<Double>() // Accumulates raw Garmin altitudes for 20-second window
    private var prevGarminElevWindowMean: Double? = null // Mean from the previous completed window
    // Real-time grade: current slope % from smoothed altitude (NOT the whole-run average)
    // Used for isOnHill and hill coaching triggers — updated every GPS point
    private var currentSmoothedGrade: Double = 0.0
    // True once GPS altitude data has been received — lets coaching payloads signal terrain awareness
    private var hasGpsElevation: Boolean = false

    // Heart rate coaching
    private var hrSum: Long = 0
    private var hrCount: Int = 0
    private var maxHr: Int = 0
    private var lastHrCoachingTime: Long = 0
    private var lastHrCoachingMinute: Int = -1

    // Cadence/stride coaching
    private var lastCadenceCoachingTime: Long = 0       // Wall-clock time of last cadence cue (kept for logging)
    private var lastCadenceCoachingDistance: Double = 0.0  // totalDistance when last cadence cue fired
    private var cadenceCoachingCountInWindow: Int = 0      // Cues fired in the current 10 km window
    private var cadenceCoachingWindowStartDistance: Double = 0.0  // Distance at which current window started
    private var hasCadenceCoachingFired = false
    private var lastStrideZone: String = "OPTIMAL"
    private var baselineCadence: Int = 0
    private var cadenceSamplesForBaseline: Int = 0

    // Speed (m/s) at the time of the last cadence coaching cue.
    // Used to detect significant pace shifts (>0.5 m/s ≈ ~30 sec/km) that warrant a
    // fresh cadence cue — a runner who accelerates from 5:30 to 4:00/km or decelerates
    // should receive updated advice because their optimal cadence has changed materially.
    private var lastCadenceCoachingSpeedMs: Double = 0.0

    // Elite coaching triggers — technique, milestones, reinforcement, ETA, trends, elevation
    private var lastEliteCoachingTime: Long = 0
    private val ELITE_COACHING_COOLDOWN_MS = 45_000L // 45 second gap between elite coaching
    private var lastTechniqueCoachingTime: Long = 0
    private val TECHNIQUE_INTERVAL_MS = 300_000L // Technique coaching every ~5 minutes (reduced repetition)

    // Technique coaching category rotation — ensures variety across 30+ technique areas
    // Each category is tracked so we never repeat the same one consecutively
    private val techniqueCategories = listOf(
        // POSTURE & ALIGNMENT
        "posture_head_neck",         // Head position, look ahead, chin level
        "posture_shoulders",         // Shoulders relaxed and low, not hunched
        "posture_torso_lean",        // Slight forward lean from ankles, tall spine
        "posture_core_engagement",   // Core bracing, pelvis neutral, avoid slouching

        // ARM TECHNIQUE
        "arms_swing_direction",      // Arms swing forward-backward, not across body
        "arms_elbow_angle",          // 90-degree elbow bend, compact arms
        "arms_hand_relaxation",      // Loose fists, imagine holding crisps/eggs
        "arms_drive_power",          // Use arm drive to power up hills

        // HIP & PELVIS
        "hips_extension",            // Full hip extension behind you on push-off
        "hips_alignment",            // Hips level and square, no dropping
        "hips_forward_drive",        // Drive knees forward, hips over feet

        // KNEE & LEG MECHANICS
        "knees_lift",                // Appropriate knee lift for pace
        "knees_alignment",           // Knees tracking over toes, not collapsing in
        "knees_soft_landing",        // Soft bent knee on landing, absorb impact

        // FOOT PLACEMENT & STRIKE
        "feet_cadence",              // Quick light steps, aim for 170-180 spm
        "feet_strike_pattern",       // Midfoot/forefoot strike, land under hips
        "feet_push_off",             // Strong push-off through toes, ankle extension
        "feet_ground_contact",       // Minimise ground contact time, quick turnover

        // HILL-SPECIFIC TECHNIQUE
        "hill_uphill_technique",     // Shorten stride, lean into hill, pump arms
        "hill_downhill_technique",   // Controlled descent, slight lean forward, quick feet
        "hill_crest_transition",     // Don't ease off at the top, maintain through the crest

        // BREATHING
        "breathing_rhythm",          // Match breathing to stride (2:2 or 3:2 pattern)
        "breathing_deep_belly",      // Breathe from diaphragm, not chest
        "breathing_exhale_power",    // Strong exhale, let inhale happen naturally

        // MENTAL & EMOTIONAL
        "mental_smile",              // Smile — it actually reduces perceived effort
        "mental_mantras",            // Use a power word or mantra (strong, smooth, fast)
        "mental_chunking",           // Break remaining distance into small chunks
        "mental_focus_reset",        // Quick body scan, reset focus from head to feet
        "mental_visualisation",      // Visualise the finish line, imagine floating

        // ACTIVE RECOVERY / SHAKE-OUT
        "recovery_arm_shakeout",     // Drop arms and shake them out for 10 seconds
        "recovery_shoulder_roll",    // Roll shoulders backward 5 times to release tension
        "recovery_hand_flex",        // Open and close fists, wiggle fingers to release tension
        
        // PACING & EFFORT MANAGEMENT
        "pacing_negative_split",     // Run second half faster than first half
        "pacing_even_distribution",  // Maintain steady effort throughout, avoid front-loading
        "pacing_surge_control",      // Control surges, hold back 5-10% energy for the end
        "pacing_heart_rate",         // Keep HR consistent, avoid spiking above threshold
        "pacing_perceived_effort",   // Rate effort 1-10, aim for 7-8 not maxing out early
        
        // HYDRATION & FUELING
        "hydration_early_sipping",   // Sip water early and often, don't wait until thirsty
        "hydration_swallow_frequency", // Swallow small amounts every 5-10 minutes
        "hydration_mouth_rinse",     // Rinse mouth to simulate fluid intake, reduces dry mouth feeling
        "fueling_energy_timing",     // Take energy gels/carbs at 45-60 minute mark
        "fueling_stomach_settling",  // Slow pace for 3-5 minutes after fueling to aid digestion
        
        // STRIDE & EFFICIENCY
        "stride_length_control",     // Don't overstride, maintain natural stride length
        "stride_frequency_consistency", // Keep cadence steady, avoid erratic step patterns
        "stride_push_off_power",      // Push hard off ground, don't shuffle or shuffle
        
        // HEART RATE & INTENSITY ZONES
        "hr_zone_awareness",         // Monitor which zone you're in, adjust intensity
        "hr_recovery_focus",         // Deliberately slow down to recover between efforts
        "hr_threshold_push",         // Build lactate threshold by running at zone 4 intensity
        
        // TERRAIN ADAPTABILITY
        "terrain_road_impact",       // Road running: lighter foot strike, more bounce
        "terrain_trail_focus",       // Trail running: short steps, look 3-5 feet ahead
        "terrain_grass_power",       // Grass: use more power in push-off, less impact
        
        // WEATHER ADAPTATION
        "weather_heat_management",   // Hot day: ease pace, focus on hydration and cooling
        "weather_cold_preparation",  // Cold: warm up longer, protect extremities
        "weather_wind_strategy",     // Run into wind first, use tailwind for finishing
        
        // BODY AWARENESS & SIGNALS
        "body_scan_check",           // Quick scan: any niggles, tight areas, asymmetries
        "body_injury_prevention",    // Feel pain signals early, adjust technique or slow down
        "body_feedback_integration"  // What worked today? Remember successful strategies
    )
    private var techniqueRotationIndex = 0
    private val usedTechniqueCategories = mutableSetOf<String>()
    private var lastMilestonePercent: Int = 0 // Track which milestones have been triggered (25, 50, 75)
    private var lastTargetEtaKm: Int = 0 // Track last km an ETA was given
    private var lastPaceTrendCheckKm: Int = 0 // Track last km a pace trend was analysed
    private var lastPositiveReinforcementKm: Int = 0 // Track last km positive reinforcement was given
    private var lastElevationInsightTime: Long = 0
    private val ELEVATION_INSIGHT_COOLDOWN_MS = 120_000L // 2 min between elevation insights
    private var hasFinal500mFired = false
    private var hasFinal250mFired = false
    private var hasFinal100mFired = false
    private var lastFlatTerrainCoachingKm: Int = 0 // tracks last km at which flat terrain coaching fired

    // ==================== PACE COACHING ENGINE ====================
    // Smart pace coaching when runner has a target time + distance.
    // Helps runners maintain steady pace, avoid going out too fast, and
    // gracefully abandons pace targets when they become unrealistic.
    
    private var paceCoachingEnabled = false       // Only active when target time + distance set
    private var targetPaceSecondsPerKm: Double = 0.0  // Target avg pace in seconds/km
    private var lastPaceCoachingDistance: Double = 0.0 // Distance at last pace coaching trigger
    private var lastPaceCoachingTime: Long = 0         // Timestamp of last pace coaching trigger
    private var paceTargetAbandoned = false             // True when target is unrealistic — stop nagging
    private var paceTargetAbandonedNotified = false     // True after we've told the runner once
    private var consecutiveOverPaceChecks = 0           // How many checks in a row they've been slow
    private var lastPaceDeviationPercent: Double = 0.0  // Track trend
    // Plateau detection: count how many consecutive cues have been "behind target" without improvement
    private var consecutiveBehindTargetCues = 0        // Resets when runner improves pace
    
    // Pace coaching intervals (distance-based, varies by run phase)
    private val PACE_FIRST_CHECK_M = 100.0            // First pace check at 100m
    private val PACE_EARLY_INTERVAL_M = 300.0         // Every 300m for first km (catch fast starts)
    private val PACE_MID_INTERVAL_M = 750.0           // Every 750m during middle of run
    private val PACE_LATE_INTERVAL_M = 500.0          // Every 500m in final 20%
    private val PACE_COOLDOWN_MS = 45_000L            // Minimum 45s between pace coaching
    private val PACE_ABANDON_THRESHOLD = 0.25         // 25% slower than target → abandon
    private val PACE_ABANDON_MIN_DISTANCE_M = 1500.0  // Don't abandon until at least 1.5km in
    private val PACE_OVERFAST_THRESHOLD = 0.10         // 10% faster → warn to slow down
    private val PACE_WAY_OVERFAST_THRESHOLD = 0.15     // 15% faster → strong slow down message

    // Simulation mode
    private var isSimulating = false
    
    // Speed-based average (for simulation where wall-clock time is compressed)
    private var speedReadingSum: Double = 0.0
    private var speedReadingCount: Int = 0

    // ==================== NAVIGATION ENGINE ====================
    // Turn-by-turn navigation state for route-guided runs
    private var navTurnInstructions: List<TurnInstruction> = emptyList()
    private var navPolylinePoints: List<com.google.android.gms.maps.model.LatLng> = emptyList()
    private var navCurrentInstructionIndex: Int = 0  // Index of the NEXT instruction to deliver
    private var navLastAnnouncedIndex: Int = -1      // Prevents double-announcing same instruction
    private var navLastWarningIndex: Int = -1         // Prevents double-warning same instruction
    private var navMissedWaypointCount: Int = 0
    private var navLastCheckTime: Long = 0
    private val NAV_CHECK_INTERVAL_MS = 2_000L       // Check navigation every 2 seconds (was 3s)
    private val NAV_WAYPOINT_REACHED_RADIUS_M = 45.0  // Within 45m = reached waypoint (was 35m — phone GPS is less precise than Garmin)
    private val NAV_WARNING_RADIUS_M = 100.0           // Within 100m = announce upcoming turn (was 80m — earlier warning gives runner more time)
    private val NAV_MISSED_WAYPOINT_RADIUS_M = 150.0   // Beyond 150m past waypoint = missed it (was 120m — more forgiving)
    @Suppress("unused")
    private val NAV_SKIP_DISTANCE_BEHIND_M = 60.0      // If user is 60m+ past the waypoint along the route, skip it
    
    // Weather and terrain
    private var weatherAtStart: WeatherData? = null
    private var weatherAtEnd: WeatherData? = null
    private var totalElevationGain: Double = 0.0
    private var totalElevationLoss: Double = 0.0
    
    companion object {
        private const val CHANNEL_ID = "run_tracking_channel"
        private const val NOTIFICATION_ID = 1001
        private const val NOTIF_ID_WATCH_SESSION_READY = 1002
        private const val NOTIF_ID_WATCH_RUN_STARTED = 1003
        private const val LOCATION_UPDATE_INTERVAL = 1000L  // Request GPS every 1 second (matches Garmin frequency)
        private const val LOCATION_FASTEST_INTERVAL = 500L   // Accept updates as fast as 500ms
        private const val STRUGGLE_COOLDOWN_MS = 120_000 // 2 minutes
        private const val ELEVATION_COOLDOWN_MS = 180_000 // 3 minutes (was 2 min — terrain state changes more slowly)
        // HILL_TOP_COOLDOWN_MS removed — summit detection replaced by state-based terrain awareness
        private const val HR_COOLDOWN_MS = 180_000 // 3 minutes
        // ── Cadence coaching rate limits ────────────────────────────────────────
        // 1 km minimum distance between any two cadence cues — prevents back-to-
        // back prompts for runners with a persistent sub-target cadence (e.g. due
        // to injury), which was the source of overwhelming repetition.
        private const val CADENCE_MIN_DISTANCE_M = 1_000.0
        // Re-coach if the runner is STILL non-optimal after 2 km since last cue,
        // without requiring a pace shift — replaces the old 8-minute time interval.
        private const val CADENCE_REPEAT_DISTANCE_M = 2_000.0
        // Hard cap: no more than 3 cadence cues in any 10 km window.
        private const val CADENCE_MAX_PER_10KM = 3
        private const val CADENCE_WINDOW_DISTANCE_M = 10_000.0
        // Re-coach cadence if pace shifts by more than this threshold (m/s) since last cue.
        // 0.5 m/s ≈ 30 sec/km difference — e.g. 5:30→4:50/km is a meaningful effort change that
        // shifts the optimal cadence by ~5-8 spm, warranting fresh advice.
        private const val CADENCE_REFIRE_SPEED_DELTA_MS = 0.5

        // ── HR sensor confidence filter constants ──────────────────────────────
        // Minimum number of readings needed before we trust the rolling average.
        private const val HR_CONFIDENCE_WINDOW = 5
        // Maximum bpm change allowed between two consecutive readings (2-second gap)
        // without flagging the reading as a suspected sensor dropout.
        // Physiologically, HR can change ~1-2 bpm/second during normal running.
        // A 30 bpm drop in 2 seconds = ~15 bpm/s — only possible with sensor loss.
        private const val HR_MAX_SUDDEN_CHANGE_BPM = 30
        // Maximum time window we keep in the rolling buffer (60 seconds).
        // Readings older than this are expired, ensuring the average reflects recent effort.
        private const val HR_ROLLING_WINDOW_MS = 60_000L

        // ── HR & pace trend detection constants ───────────────────────────────
        // Number of readings kept in the trend buffers.
        // At ~5-second GPS intervals → 8 readings = ~40 seconds of trend data.
        private const val HR_TREND_WINDOW = 8
        private const val PACE_TREND_WINDOW = 8
        // Minimum bpm delta to declare a trend (avoids declaring noise as "falling/rising")
        private const val HR_TREND_MIN_DELTA_BPM = 3
        // Minimum sec/km delta to declare a pace trend (5 sec/km = about 30s difference at 5min/km)
        private const val PACE_TREND_MIN_DELTA_SEC = 5.0
        // Minimum km between HR recovery acknowledgement cues (avoid spamming)
        private const val HR_RECOVERY_ACK_MIN_KM = 0.5

        // ELEVATION NOISE FILTER — two thresholds because the GPS sources have very different
        // update rates and accuracy profiles:
        //
        //   Phone GPS  — updates every ~1 s, altitude accuracy ±5–10 m.  Need a 1.5 m gate to
        //                stop random zig-zag noise from inflating the gain total.
        //
        //   Garmin watch GPS — updates sent to phone every ~2 s (8 × 250 ms ticks), but the
        //                watch barometric/GPS fusion altitude is far more accurate (±1 m).
        //                At 5 min/km on a 15% hill, the altitude change per 2-second window is
        //                only ~1.0 m — below the 1.5 m gate, so EVERYTHING gets discarded.
        //                A 270 m ascent would show as ≈0–6 m in the database (exactly the
        //                symptom: "6 m elevation on hilly terrain").  Use a 0.4 m gate instead.
        private const val ELEVATION_NOISE_THRESHOLD        = 1.5 // Phone GPS  (±5-10 m, 1 Hz) — legacy, not used for gain

        // Phone GPS elevation gain — windowed mean approach.
        // Problem: at 1 Hz and ±10 m GPS noise, per-sample altitude changes on a real 10% hill are
        // only ~0.33 m/s — far below the 1.5 m per-sample threshold, so EVERY climb gets discarded.
        // Solution: average 60 consecutive readings (1-minute window). The mean has noise ±1.3 m
        // (10/√60). A 3% grade at 5 min/km yields +6 m per window — comfortably above the 1.5 m
        // commit threshold.  False-positive rate on flat ground: ~5% per window ≈ 1 commit/hour.
        private const val PHONE_ELEV_WINDOW            = 60  // Number of 1 Hz readings per window
        private const val PHONE_ELEV_COMMIT_THRESHOLD  = 1.5 // Min net change (m) per 60-s window to count

        // Garmin GPS elevation gain — 10-sample windowed mean approach (same principle as phone, tuned for Garmin).
        // Previous approach (per-sample 2.0m threshold) was catastrophically wrong:
        //   At 5:30/km on a 5% grade, each 2-second Garmin sample only rises 0.15m.
        //   A 2.0m threshold requires a ~66% gradient — impossible running incline — so ALL climbing was discarded.
        // Fix: 10-sample window (~20 s at 0.5 Hz). Mean noise = ±0.3m/√10 ≈ ±0.10m.
        //   5% grade at 5:30/km → 20s × 1.52 m/s × 0.05 = 1.52m per window → well above 0.5m threshold. ✓
        //   Flat ground noise → window mean change ±0.10m → almost never triggers 0.5m. ✓
        private const val GARMIN_ELEV_WINDOW           = 10  // ~20 seconds at 0.5 Hz
        private const val GARMIN_ELEV_COMMIT_THRESHOLD = 0.5 // Min net change (m) per window to commit to gain/loss
        
        // ── TERRAIN STATE CLASSIFICATION ────────────────────────────────────────
        // Grade thresholds — raised from 2% to 3% because GPS altitude error over 150m
        // produces ~3% apparent grade on genuinely flat terrain.
        private const val UPHILL_GRADE_THRESHOLD = 3.0
        private const val DOWNHILL_GRADE_THRESHOLD = -3.0
        private const val STEEP_UPHILL_GRADE_THRESHOLD = 5.0
        private const val STEEP_DOWNHILL_GRADE_THRESHOLD = -5.0

        // A terrain state must be sustained for at least this distance before the classifier
        // accepts it as the new state (avoids flipping on brief GPS noise spikes).
        private const val TERRAIN_STATE_MIN_DISTANCE_M = 150.0

        // Terrain states: flat | gradual_climb | steep_climb | gradual_descent | steep_descent | rolling
        // Rolling terrain detection — 1 km sliding window
        private const val ROLLING_TERRAIN_MIN_GAIN_M = 8.0
        private const val ROLLING_TERRAIN_MIN_LOSS_M = 5.0
        private const val ROLLING_TERRAIN_MIN_DIRECTION_CHANGES = 2
        private const val ROLLING_TERRAIN_WINDOW_KM = 1.0
        private const val ROLLING_TERRAIN_COACH_INTERVAL_KM = 2

        // Standalone terrain coaching only fires after enough elevation in the new state —
        // prevents coaching 10 m into a hill when the runner has just barely left a flat.
        private const val STANDALONE_UPHILL_MIN_GAIN_M = 10.0
        private const val STANDALONE_DOWNHILL_MIN_LOSS_M = 10.0

        // DOWNHILL FINISH — within this distance of the target, a descent gets a "finish" frame
        private const val DOWNHILL_FINISH_DISTANCE_KM = 1.0

        // Legacy alias kept for any remaining references in downhill-finish logic
        private const val DOWNHILL_MIN_DISTANCE_M = 150.0
        private const val ALTITUDE_SMOOTHING_WINDOW = 5      // Number of altitude readings to average for smoothing
        
        // How often (ms) the service pushes GPS/metrics to the live session on the server.
        // 5 seconds keeps observers up-to-date without hammering the API.
        private const val LIVE_SESSION_SYNC_INTERVAL_MS = 5_000L

        const val ACTION_START_TRACKING = "ACTION_START_TRACKING"
        const val ACTION_STOP_TRACKING = "ACTION_STOP_TRACKING"
        const val ACTION_PAUSE_TRACKING = "ACTION_PAUSE_TRACKING"
        const val ACTION_RESUME_TRACKING = "ACTION_RESUME_TRACKING"
        const val ACTION_START_SIMULATION = "ACTION_START_SIMULATION"
        const val ACTION_START_NAV_SIMULATION = "ACTION_START_NAV_SIMULATION"
        /**
         * Pre-start the service while the phone app is in the foreground (i.e. while the user is
         * on the "Prepare Run" screen tapping "Send to Watch").  The service enters a lightweight
         * standby state: it shows a foreground notification and registers the watch-command handler
         * on the shared GarminWatchManager singleton so that, when the user later presses START on
         * their watch (phone in pocket / screen off), the service can call startTracking() directly
         * without needing to call startForegroundService() from the background — which is blocked
         * on Android 12+ (targetSdk ≥ 31) and causes a silent ForegroundServiceStartNotAllowedException.
         */
        const val ACTION_PREPARE_FOR_WATCH = "ACTION_PREPARE_FOR_WATCH"
        /**
         * Cancel a pending [ACTION_PREPARE_FOR_WATCH] standby.  The service stops itself if
         * it has not yet started active tracking (i.e. the user tapped Cancel before pressing
         * START on the watch).  Ignored if the run is already in progress.
         */
        const val ACTION_CANCEL_PREPARE_FOR_WATCH = "ACTION_CANCEL_PREPARE_FOR_WATCH"
        /**
         * Start tracking immediately for a run that was started directly on the Garmin watch
         * without any prior phone-side preparation (i.e. user did NOT tap "Prepare Run on Watch").
         *
         * Sent by [GarminWatchManager] when it receives a watch "start" command and no
         * ViewModel or service is currently listening (onWatchCommand == null).  Calling this
         * while the phone app is in the foreground starts the foreground service so it can
         * track the run and receive the eventual watch "stop" command to save the session.
         */
        const val ACTION_START_TRACKING_FROM_WATCH = "ACTION_START_TRACKING_FROM_WATCH"
        /**
         * Recovery signal sent by [GarminWatchManager] when it receives a "watchReady" message
         * with hasPendingSync=true.  This means the watch finished a run but its "stop" BT
         * message was silently dropped (ConnectIQ is fire-and-forget with no delivery guarantee).
         * If tracking is active AND it was watch-initiated, this action stops tracking so the
         * phone session is saved and the offline batch sync can proceed.
         */
        const val ACTION_WATCH_RUN_FINISHED = "ACTION_WATCH_RUN_FINISHED"
        const val EXTRA_TARGET_DISTANCE = "EXTRA_TARGET_DISTANCE"
        const val EXTRA_TARGET_TIME = "EXTRA_TARGET_TIME"
        const val EXTRA_HAS_ROUTE = "EXTRA_HAS_ROUTE"
        const val EXTRA_SESSION_TYPE = "EXTRA_SESSION_TYPE"
        const val EXTRA_AI_COACH_ENABLED = "EXTRA_AI_COACH_ENABLED"
        const val EXTRA_ACTIVE_RUN = "extra_active_run"
        // Coaching programme context
        const val EXTRA_TRAINING_PLAN_ID = "EXTRA_TRAINING_PLAN_ID"
        const val EXTRA_WORKOUT_ID = "EXTRA_WORKOUT_ID"
        const val EXTRA_WORKOUT_TYPE = "EXTRA_WORKOUT_TYPE"
        const val EXTRA_WORKOUT_INTENSITY = "EXTRA_WORKOUT_INTENSITY"
        const val EXTRA_WORKOUT_DESCRIPTION = "EXTRA_WORKOUT_DESCRIPTION"
        const val EXTRA_PLAN_GOAL_TYPE = "EXTRA_PLAN_GOAL_TYPE"
        const val EXTRA_PLAN_WEEK_NUMBER = "EXTRA_PLAN_WEEK_NUMBER"
        const val EXTRA_PLAN_TOTAL_WEEKS = "EXTRA_PLAN_TOTAL_WEEKS"
        // Group run context
        const val EXTRA_GROUP_RUN_ID = "EXTRA_GROUP_RUN_ID"
        // Session coaching: full AI-generated instructions passed as JSON string
        const val EXTRA_SESSION_INSTRUCTIONS_JSON = "EXTRA_SESSION_INSTRUCTIONS_JSON"
        // Dynamic coaching plan (rich model from prepare-coaching) — primary coaching source during coached runs
        const val EXTRA_DYNAMIC_COACHING_PLAN_JSON = "EXTRA_DYNAMIC_COACHING_PLAN_JSON"
        // Pre-run briefing text to record in coaching history
        const val EXTRA_PRE_RUN_BRIEFING = "EXTRA_PRE_RUN_BRIEFING"
        
        private val _currentRunSession = MutableStateFlow<RunSession?>(null)
        val currentRunSession: StateFlow<RunSession?> = _currentRunSession
        
        private val _isServiceRunning = MutableStateFlow(false)
        val isServiceRunning: StateFlow<Boolean> = _isServiceRunning
        
        private val _uploadComplete = MutableStateFlow<String?>(null) // Backend run ID when upload completes
        val uploadComplete: StateFlow<String?> = _uploadComplete

        // ── Local → Server run ID registry ──────────────────────────────────────
        // Populated whenever a run is successfully uploaded (either inline or via SyncWorker).
        // Key  = phone-side local UUID (what was stored as currentRunId before upload)
        // Value = server-assigned UUID (what actually exists in the database)
        // RunSummaryViewModel uses this to resolve a 404 caused by upload failure / retry.
        private val _localToServerRunIds = MutableStateFlow<Map<String, String>>(emptyMap())
        val localToServerRunIds: StateFlow<Map<String, String>> = _localToServerRunIds

        /**
         * Set by [RunSessionViewModel] once a live tracking session has been created and the
         * runner has tapped Start.  The service uses this ID to push GPS/metrics updates to the
         * server so that observers see real-time data.  Cleared when the run ends.
         */
        @Volatile
        var activeLiveSessionId: String? = null

        /** Call after any successful upload so the registry is always current. */
        fun recordRunIdMapping(localId: String, serverId: String) {
            if (localId == serverId) return // same UUID — no mapping needed
            _localToServerRunIds.value = _localToServerRunIds.value + (localId to serverId)
            android.util.Log.d("RunTrackingService", "🗺 Run ID mapped: $localId → $serverId")
        }

        // Coaching text broadcast to UI (set when coaching plays, cleared when audio finishes)
        private val _latestCoachingText = MutableStateFlow<String?>(null)
        val latestCoachingText: StateFlow<String?> = _latestCoachingText

        // Talk-to-Coach trigger — set to true when watch taps to request coach conversation.
        // Observed by RunSessionViewModel; reset to false after handled.
        private val _watchTalkToCoachRequest = MutableStateFlow(false)
        val watchTalkToCoachRequest: StateFlow<Boolean> = _watchTalkToCoachRequest

        fun triggerWatchTalkToCoach() {
            _watchTalkToCoachRequest.value = true
        }

        fun clearWatchTalkToCoachRequest() {
            _watchTalkToCoachRequest.value = false
        }

        // Route Memory Engine — emits (lat, lng) on the first GPS fix once a run is active.
        // Observed by RunSessionViewModel to trigger route recognition asynchronously.
        // Reset to null at the start of each new run.
        private val _firstGpsPoint = MutableStateFlow<Pair<Double, Double>?>(null)
        val firstGpsPoint: StateFlow<Pair<Double, Double>?> = _firstGpsPoint

        // Power saver mode — observed by RunSessionViewModel to surface a warning banner in the UI.
        // Updated from the instance-level broadcast receiver so the companion value stays in sync.
        private val _isPowerSaverActive = MutableStateFlow(false)
        val isPowerSaverActive: StateFlow<Boolean> = _isPowerSaverActive

        /**
         * Route intelligence context injected by [RunSessionViewModel] after a known route is matched.
         * Picked up by the Service when building PaceUpdate requests for km-split coaching.
         * Nullable — when null, standard coaching applies without route context.
         */
        @Volatile
        var routeIntelligenceContext: live.airuncoach.airuncoach.network.model.RouteIntelligenceContext? = null

        /** Session types where sustained consistent effort makes free-run prompts (km splits,
         *  struggle coaching) useful and relevant. Add new continuous-effort types here.
         *  Everything NOT in this list is treated as Tier 1 (fully managed by the coaching plan).
         *
         *  NOTE: "easy" and "recovery" are intentionally excluded.  Those session types are
         *  HR-led — the coaching plan's milestone triggers own the check-ins and the runner
         *  needs effort-based guidance, not pace-split interruptions.  Km-split cues on an
         *  easy run distract from the real goal (heart-rate control) and often reference pace
         *  numbers that are irrelevant when effort is the primary target. */
        val TIER_2_SESSION_TYPES = setOf(
            "tempo", "long_run", "threshold", "race_pace"
        )
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        weatherRepository = WeatherRepository(this)
        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        stepDetectorSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
        heartRateSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE)
        Log.d("RunTrackingService", "Sensors available - StepCounter: ${stepCounterSensor != null}, StepDetector: ${stepDetectorSensor != null}, HeartRate: ${heartRateSensor != null}")
        
        // Initialize session manager and coaching feature preferences
        sessionManager = SessionManager(this)
        coachingFeaturePrefs = live.airuncoach.airuncoach.data.CoachingFeaturePreferences(this)
        
        // Initialize API service — RetrofitClient may not be initialized if the service was
        // started directly from a push notification (no MainActivity was launched first).
        apiService = try {
            RetrofitClient.apiService
        } catch (e: IllegalStateException) {
            android.util.Log.w("RunTrackingService", "RetrofitClient not initialized — initializing now from service context")
            RetrofitClient.initialize(applicationContext, sessionManager)
        }
        
        // Initialize Text-to-Speech for AI coaching (fallback)
        textToSpeechHelper = TextToSpeechHelper(this)
        
        // Initialize Audio Player for OpenAI TTS
        audioPlayerHelper = AudioPlayerHelper(this)

        // Initialize the shared audio queue (handles both OpenAI TTS and device TTS fallback)
        CoachingAudioQueue.init(this)
        
        // Initialize offline sync queue for run persistence
        syncQueue = SyncQueue(this)
        
        // Start periodic background sync work
        SyncWorker.schedulePeriodicSync(this)
        Log.d("RunTrackingService", "✅ Initialized offline sync queue and scheduled periodic sync")
        
        // Register broadcast receiver for power saver mode changes
        registerPowerSaverModeReceiver()
        
        // Load user profile and run history for coach personalisation
        serviceScope.launch {
            try {
                val userId = sessionManager.getUserId()
                if (userId != null) {
                    currentUser = apiService.getUser(userId)
                    // The session's activity type is authoritative from the run-setup screen
                    // (EXTRA_SESSION_TYPE, applied in onStartCommand) — it drives every
                    // session feature (UI, Garmin watch, post-run summary, in-session coaching
                    // prompts/triggers) and must NEVER be overridden by the user's profile
                    // default once a session has actually been started. Only seed from the
                    // profile default if this async load resolves BEFORE onStartCommand has
                    // set the real session type.
                    if (!activityTypeSetFromSessionIntent) {
                        currentActivityType = when (currentUser?.defaultSessionType?.lowercase()) {
                            "walk" -> "walk"
                            else  -> "run"
                        }
                    }
                    Log.d("RunTrackingService", "Loaded user profile: ${currentUser?.coachName}, activityType=$currentActivityType")
                    // Load run history stats (will be refreshed at run-start with the target distance)
                    try {
                        runHistoryStats = apiService.getRunHistoryStats(userId)
                        Log.d("RunTrackingService", "Loaded run history: ${runHistoryStats?.runsAnalysed} runs, avg pace ${runHistoryStats?.avgPaceFormatted}")
                    } catch (e: Exception) {
                        Log.w("RunTrackingService", "Could not load run history stats (non-fatal)", e)
                    }
                }
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to load user profile", e)
            }
        }
        
        createNotificationChannel()
        acquireWakeLock()
        setupLocationCallback()

        // Attach to the application-scoped GarminWatchManager singleton (provided by Hilt).
        // IMPORTANT: Do NOT create a new GarminWatchManager here and do NOT call initialize().
        // MainActivity already called initialize() once at startup.  Creating a second instance
        // would call ConnectIQ.initialize() a second time, which resets the SDK and invalidates
        // the existing registerForAppEvents() subscription — causing the watch to show an IQ/alert
        // error icon and dropping any in-flight ConnectIQ messages (including the "start" command).
        try {
            val hiltEntry = EntryPointAccessors.fromApplication(
                applicationContext,
                GarminWatchManagerEntryPoint::class.java
            )
            garminWatchManager = hiltEntry.garminWatchManager()
            garminWatchManager?.let { manager ->
                manager.onWatchCommand = { action ->
                    Log.d("RunTrackingService", "⌚ Watch command received: $action")
                    when (action) {
                        "start"      -> {
                            // Mark this as a watch-initiated run BEFORE startTracking() so that:
                            // (a) lastWatchGpsMs blocks early phone-GPS contamination from the
                            //     very first moment, and
                            // (b) we skip sending runUpdate back to the watch (it has its own
                            //     authoritative Activity.Info data).
                            wasRunStartedByWatch = true
                            lastWatchGpsMs = System.currentTimeMillis()
                            Log.d("RunTrackingService", "⌚ Watch START → wasRunStartedByWatch=true, phone GPS blocked")
                            startTracking()
                        }
                        "pause"      -> pauseTracking()
                        "resume"     -> resumeTracking()
                        "stop"       -> stopTracking()
                        "watchReady" -> {
                            // Push auth + current run state to watch now that it's ready
                            serviceScope.launch {
                                val token = sessionManager.getAuthToken()
                                val name  = currentUser?.name ?: ""
                                val age   = currentUser?.age
                                if (token != null) garminWatchManager?.sendAuth(token, name, age)
                            }
                        }
                        "sessionReady" -> {
                            // Watch has authenticated + GPS locked — ready for user to press START
                            // Fire a local push notification so the user knows their session is ready
                            Log.d("RunTrackingService", "⌚ Watch session ready — posting notification")
                            postWatchSessionReadyNotification()
                        }
                        "talkToCoach" -> {
                            // User tapped the watch screen during a run — trigger phone talk-to-coach
                            Log.d("RunTrackingService", "⌚ Watch tap → talk to coach request")
                            triggerWatchTalkToCoach()
                        }
                    }
                }
                
                // Watch GPS stream — inject Garmin coordinates into the tracking pipeline.
                // The watch enables its own GPS during phone-controlled runs and streams
                // fixes every ~2 s.  These are preferred over phone GPS (3 m vs 10–25 m).
                manager.onWatchGpsUpdate = { lat, lng, altM, speedMs ->
                    injectWatchLocation(lat, lng, altM, speedMs)
                }

                // Full biometric frame from watch — 23+ metrics every ~2 s
                manager.onWatchSensorData = { frame ->
                    updateWatchSensorData(frame)
                }

                // Watch app resolved & ready — proactively push auth token so the
                // watch authenticates immediately without waiting for "watchReady"
                manager.onWatchAppReady = {
                    Log.d("RunTrackingService", "Watch app ready — pushing auth token proactively")
                    serviceScope.launch {
                        val token = sessionManager.getAuthToken()
                        val name  = currentUser?.name ?: ""
                        val age   = currentUser?.age
                        if (token != null) {
                            Log.d("RunTrackingService", "Sending auth to watch for user: $name (age=$age)")
                            garminWatchManager?.sendAuth(token, name, age)
                        } else {
                            Log.w("RunTrackingService", "Watch ready but no auth token available — user may not be logged in")
                        }
                    }
                }

                // DO NOT call manager.initialize() here — the SDK was already initialized by
                // MainActivity.initGarminWatchBridge() at app startup.  Calling it again would
                // reset the SDK and break the existing ConnectIQ event subscription.
                Log.d("RunTrackingService", "✅ Attached to shared GarminWatchManager singleton (no re-init)")
            }
        } catch (e: Exception) {
            Log.w("RunTrackingService", "GarminWatchManager attach failed (non-fatal): ${e.message}")
            garminWatchManager = null
        }
    }

    // Polyline passed via intent for nav simulation
    private var navSimulationPolyline: String? = null

    // Coaching programme context (null when not a plan workout)
    private var planTrainingPlanId: String? = null
    private var planWorkoutId: String? = null
    private var planWorkoutType: String? = null
    private var planWorkoutIntensity: String? = null
    private var planWorkoutDescription: String? = null
    private var planGoalType: String? = null
    private var planWeekNumber: Int? = null
    private var planTotalWeeks: Int? = null
    
    // Group run context (if this run is part of a group run)
    private var groupRunId: String? = null
    
    // ========== Session Coaching Context ==========
    // AI-generated session plan: phases, coaching triggers, tone — passed from ViewModel
    private var sessionInstructions: SessionInstructionsResponse? = null
    private var sessionCoachingTone: String? = null
    private var sessionCoachingIntensity: String? = null

    // ─── Dynamic Coaching Plan (rich model from prepare-coaching) ───────────
    // This is the PRIMARY coaching source for coached runs — supersedes sessionInstructions
    // for reactive/condition triggers. Contains HR targets, pace targets, and condition triggers.
    private var dynamicCoachingPlan: live.airuncoach.airuncoach.network.model.DynamicSessionCoachingPlan? = null

    // Per-trigger state tracking for the dynamic plan evaluator
    // triggerLastFiredMs: when each trigger last fired (keyed by trigger.id)
    // triggerFiredOnce: set of trigger IDs that have already fired (for frequency == "once")
    // triggerAltMessageIndex: rotation index for alternativeMessages per trigger
    private val triggerLastFiredMs: MutableMap<String, Long> = mutableMapOf()
    private val triggerFiredOnce: MutableSet<String> = mutableSetOf()
    private val triggerAltMessageIndex: MutableMap<String, Int> = mutableMapOf()

    // ── Session memory — coaching continuity ───────────────────────────────────────────
    // Tracks what topics have been covered during this session so the AI can naturally
    // vary its coaching focus rather than repeating the same theme every cue.
    private val sessionTopicsDiscussed: MutableSet<String> = mutableSetOf()
    private var sessionCueCount: Int = 0
    private var lastCueTriggerType: String? = null
    private var lastCueFiredAtMs: Long = 0L

    // ── Coaching budget ────────────────────────────────────────────────────────────────
    // Limits non-critical cues (form tips, breathing, cadence check-ins) so the
    // athlete isn't overwhelmed. Safety/progress triggers always bypass the budget.
    // Critical triggers: km_split, session_complete, milestone, hr_zone alerts
    // Non-critical: periodic form cues, breathing cues, cadence check-ins, motivation
    private val SESSION_MAX_NON_CRITICAL_CUES = 12   // max non-critical cues per session
    private val NON_CRITICAL_MIN_GAP_MS = 90_000L    // min 90s between non-critical cues
    private var nonCriticalCueCount: Int = 0
    private var lastNonCriticalCueMs: Long = 0L

    // All possible coaching topics — used to report what's not yet been covered
    private val ALL_COACHING_TOPICS = listOf(
        "heart_rate", "pace", "cadence", "breathing", "form", "motivation", "progress"
    )

    // ── Physiological response tracking ───────────────────────────────────────
    // Records the athlete's HR and pace AT THE MOMENT each cue fires.
    // On the next cue, we compute the delta so the AI knows whether the runner
    // responded to the previous coaching (e.g. HR fell after a "slow down" cue).
    private var lastCueHrAtFire: Int = 0          // HR bpm when last cue fired
    private var lastCuePaceAtFire: Double = 0.0   // pace sec/km when last cue fired
    // Computed delta (filled when next cue fires, passed to AI)
    private var lastCueHrDelta: Int? = null        // bpm change since last cue: negative = fell (good for HR-high cues)
    private var lastCuePaceDelta: Int? = null      // sec/km change since last cue: negative = faster
    private var athleteRespondedToLastCue: Boolean? = null  // did the runner act on the previous cue?

    // ── Last-known GPS accuracy ────────────────────────────────────────────────
    // Stored on every accepted location update so we can report GPS confidence to AI
    private var lastGpsAccuracyM: Float = 0f

    // Current active phase from the dynamic plan (updated by evaluateDynamicPhase())
    private var dynamicCurrentPhaseIndex: Int = 0
    private var dynamicCurrentPhaseName: String? = null
    private var dynamicPhaseDistanceStartKm: Double = 0.0
    private var dynamicPhaseTimeStartMin: Double = 0.0  // elapsed minutes when current phase began
    private var dynamicPhaseIsWorkInterval: Boolean = true  // false for recovery/walk phases
    private var dynamicPhaseDurationMin: Double = 0.0  // planned duration of current phase (0 = distance-based)

    // Interval midpoint tracking — fires a live AI midpoint cue once per work rep
    private var lastRepMidpointFiredAtRep: Int = -1

    // Whether there is an active coaching plan (either system) — used to suppress generic prompts
    private val isCoachingPlanActive: Boolean
        get() = dynamicCoachingPlan != null || sessionInstructions != null

    // ══════════════════════════════════════════════════════════════════════════════════
    // AI RUN COACH — COACHING ENGINE DESIGN CONTRACT
    //
    // This engine creates COACHING OPPORTUNITIES, not coaching messages.
    // OpenAI decides what to say based on: athlete context, workout context,
    // live run context, and the purpose of the coaching opportunity.
    //
    // READ THIS BEFORE MAKING ANY CHANGE TO COACHING LOGIC.
    // Every change should be validated against the regression checklist at the bottom.
    //
    // ──────────────────────────────────────────────────────────────────────────────────
    // CONTINUOUS COACHING  (free runs, walks, and Tier 2 coaching plan sessions)
    // ──────────────────────────────────────────────────────────────────────────────────
    //
    // GUARANTEED MILESTONES — non-negotiable, always fire:
    //   ✓ Run briefing (pre-run summary with weather + target)
    //   ✓ Run start motivation
    //   ✓ 500m settling check-in (one-time, first 500m of any run)
    //   ✓ Every 1km progress summary (runs) / every 500m summary (walks)
    //   ✓ Final 500m — push to finish
    //   ✓ Final 250m — last effort
    //   ✓ Final 100m — sprint cue
    //   ✓ Post-run analysis
    //
    // DYNAMIC COACHING OPPORTUNITIES — fire between milestones, priority-ordered:
    //   ✓ Pace trends (speeding up / slowing down / consistent)
    //   ✓ Heart rate trends (zone awareness, aerobic drift)
    //   ✓ Cadence (personalised to height, pace, and age — not a generic target)
    //   ✓ Form coaching (posture, arm swing, foot strike, stride)
    //   ✓ Breathing rhythm and technique
    //   ✓ Elevation awareness (hill strategy, descent recovery)
    //   ✓ Environment (weather, temperature, wind)
    //   ✓ Motivation and encouragement
    //   ✓ Historical comparisons (faster/slower than previous similar runs)
    //   ✓ Struggle point awareness (historically difficult km zones for this runner)
    //   ✓ Similar runs (prior efforts at this distance/route/weather)
    //   ✓ Coach memory (what has been said this session — avoid repetition)
    //   ✓ Athlete profile (fitness level, age, BMI — calibrates directness)
    //   ✓ Personal strengths (what this runner does well)
    //   ✓ Personal weaknesses (what this runner needs to work on)
    //   ✓ Recovery quality and fatigue signals
    //   ✓ Positive reinforcement (negative splitting, consistency streaks)
    //   ✓ Target ETA (projected finish vs goal time)
    //
    // DYNAMIC COACHING MUST:
    //   • Avoid repeating the same topic consecutively — rotate across categories
    //   • Respect cooldowns — no coaching within 15 seconds or 150m of the last cue
    //   • Prefer new insights over repeated advice that hasn't been acted on
    //   • Celebrate improvement when advice is followed (athlete responds to last cue)
    //   • Stop repeating ineffective advice — shift topic or let it cool down
    //   • Never allow one category to dominate a session (cadence every 2 min = bad)
    //
    // PRIORITY ORDER within each GPS tick (only ONE coaching event fires per tick):
    //   Phase change → 500m milestone / walk-500m split → HR timer →
    //   cadence → elite coaching (milestone → ETA → pace trend → reinforcement
    //   → technique/form → elevation)
    //
    // ──────────────────────────────────────────────────────────────────────────────────
    // INTERVAL COACHING  (Tier 1 coaching plan sessions: VO₂, track, hills, fartlek)
    // ───────���──────────────────────────────────────────────────────────────────────────
    //
    // AI SESSION PLANNER CREATES:
    //   ✓ Warm-up briefing
    //   ✓ Rep starts (work interval begin)
    //   ✓ Mid-rep check-ins
    //   ✓ Recovery phase start
    //   ✓ Recovery complete / next rep alert
    //   ✓ Phase transitions (warmup → intervals → cooldown)
    //   ✓ Final rep motivation
    //   ✓ Session complete
    //
    // DYNAMIC COACHING REMAINS AVAILABLE when relevant (cadence, elevation, breathing,
    // recovery quality, HR zone, running form). These must not conflict with the rep
    // sequence — they supplement it, they don't replace it.
    //
    // km SPLITS are SUPPRESSED — irrelevant and contradictory mid-rep.
    // Workout philosophy informs coaching. It never dictates wording.
    //
    // ──────────────────────────────────────────────────────────────────────────────────
    // NON-NEGOTIABLES — breaking any of these is a regression, not a refactor
    // ──────────────────────────────────────────────────────────────────────────────────
    //   ✗ Never remove guaranteed milestones
    //   ✗ Never remove coaching diversity / topic rotation
    //   ✗ Never allow one coaching category to monopolise a session
    //   ✗ Never remove athlete context from OpenAI prompts
    //   ✗ Never remove historical run context from OpenAI prompts
    //   ✗ Never remove personalised coaching (cadence targets, HR zones, fitness level)
    //   ✗ OpenAI must always receive enough context to decide the most valuable message
    //
    // ────────────────���─────────────────────────────────────────────────────────────────
    // REGRESSION CHECKLIST — verify ALL of these after any coaching engine change
    // ──────────────────────────────────────────────────────────────────────────────────
    //   □ Free run produces a 500m settling check-in
    //   □ Free run produces km-by-km split coaching
    //   □ Walk session produces 500m split coaching (not 1km)
    //   □ Cadence coaching cannot monopolise a run (topic diversity enforced)
    //   □ Dynamic topic rotation occurs (not the same category back-to-back)
    //   □ Cooldowns prevent coaching within 15s / 150m of the previous cue
    //   □ Struggle point insights still reach OpenAI when available
    //   □ Historical run comparisons still reach OpenAI when available
    //   □ Athlete profile (age, BMI, fitness level) still influences coaching tone
    //   □ Workout philosophy only applies to coaching plan sessions
    //   □ Interval sessions do NOT receive km split coaching
    //   □ Continuous plan sessions (tempo, long_run) DO receive km split coaching
    //   □ Final 500m / 250m / 100m cues fire for ALL session types
    //   □ Sensor confidence gates (HR, GPS, cadence) still suppress low-confidence cues
    //   □ TypeScript: no server-side function referenced without being defined (compile check)
    //   □ Cadence template routing: low cadence → overstriding cues; high cadence → spinning/understriding;
    //     on-target → celebrate + pivot. No `if (true)` or hardcoded branch overrides.
    //
    // ══════════════════════════════════════════════════════════════════════════════════

    // ── Coaching plan session tiers ──────────────────────────────────────────────────────────
    //
    // Tier 2 — "Augmented sessions" (ALLOWLIST — explicit continuous-effort types):
    //   The dynamic coaching plan handles session structure and phase transitions.
    //   Free-run prompts (km splits, struggle coaching, elevation, cadence) remain ACTIVE because
    //   these sessions are about sustained consistent effort where per-km feedback is valuable.
    //   Pace coaching (race-goal deviation) stays suppressed — the session plan manages effort.
    //
    // Tier 1 — "Managed sessions" (EVERYTHING ELSE — default for unknown/new session types):
    //   The dynamic coaching plan is the SOLE source of all coaching cues — it fires rep-start,
    //   rep-end, speed-up, slow-down, and recovery instructions based on distance/time triggers.
    //   ALL free-run prompts (km splits, struggle coaching, pace coaching) are suppressed because
    //   they are irrelevant and would conflict with the structured rep sequence.
    //   Any new session type not in the Tier 2 allowlist is treated as Tier 1 by default, which
    //   is the safer choice — suppressing is always recoverable, accidental conflicts are not.
    //
    /** True when this is a plan session that is NOT a continuous-effort type.
     *  All free-run prompts (km splits, struggle) are suppressed for these sessions. */
    private val isIntervalTypeSession: Boolean
        get() = isCoachingPlanActive && planWorkoutType != null &&
                planWorkoutType !in TIER_2_SESSION_TYPES

    // Phase engine state — tracks position within the AI-designed session structure
    private var currentPhaseIndex: Int = 0      // Index into sessionInstructions.phases
    private var currentPhaseName: String? = null // e.g. "warmup", "interval_1_of_6"
    private var phaseDistanceStartKm: Double = 0.0  // Total distance when current phase began
    private var currentRepNumber: Int = 0           // For interval sessions: which rep (1-indexed)
    private var currentRepIsWorkPhase: Boolean = true // true = work interval, false = recovery
    private var repDistanceStartKm: Double = 0.0    // Distance at start of current rep/recovery
    private var lastPhaseTriggerFiredForPhase: String? = null  // Prevents duplicate at_start triggers
    private var lastRepTriggerFiredAtRep: Int = 0   // Prevents duplicate rep_start/end triggers
    private val gson = com.google.gson.Gson()

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Run-config extras (targetDistance, planWorkoutId, etc.) are ONLY parsed for start-type
        // actions.  Stop / pause / resume / finish intents carry no extras, so parsing them
        // unconditionally would silently wipe planWorkoutId (and other plan context) right before
        // stopTracking() uploads the run — causing linked_workout_id to be null in the database.
        val isStartAction = intent?.action in setOf(
            ACTION_START_TRACKING,
            ACTION_PREPARE_FOR_WATCH,
            ACTION_START_TRACKING_FROM_WATCH,
            ACTION_START_SIMULATION,
            ACTION_START_NAV_SIMULATION
        )

        if (isStartAction) {
            // targetDistance comes from RunSetupConfig.targetDistance which is in KILOMETERS.
            // Normalize to METRES here so all internal calculations use metres consistently.
            val rawTargetDist = intent?.getDoubleExtra(EXTRA_TARGET_DISTANCE, 0.0)?.takeIf { it > 0 }
            targetDistance = rawTargetDist?.let {
                // If value <= 100, it's in km (e.g., 5.0, 10.0, 42.195). Convert to metres.
                // If value > 100, it's already in metres (e.g., 5000, 10000). Keep as-is.
                if (it <= 100.0) it * 1000.0 else it
            }
            targetTime = intent?.getLongExtra(EXTRA_TARGET_TIME, 0)?.takeIf { it > 0 }
            hasRoute = intent?.getBooleanExtra(EXTRA_HAS_ROUTE, false) == true
            intent?.getStringExtra(EXTRA_SESSION_TYPE)?.let { requestedType ->
                currentActivityType = if (requestedType.equals("walk", ignoreCase = true)) "walk" else "run"
                activityTypeSetFromSessionIntent = true
            }
            aiCoachEnabledForSession = intent?.getBooleanExtra(EXTRA_AI_COACH_ENABLED, true) ?: true
            navSimulationPolyline = intent?.getStringExtra("EXTRA_ROUTE_POLYLINE")
            // Coaching programme context — only overwrite if the intent carries plan extras.
            // ACTION_START_TRACKING_FROM_WATCH and ACTION_START_TRACKING (from ViewModel's
            // startRun()) may arrive AFTER ACTION_PREPARE_FOR_WATCH already set plan context.
            // If the new intent has empty extras, unconditionally assigning would silently
            // wipe planWorkoutId → linked_workout_id becomes null in the uploaded run.
            val incomingPlanId = intent?.getStringExtra(EXTRA_TRAINING_PLAN_ID)
            val incomingWorkoutId = intent?.getStringExtra(EXTRA_WORKOUT_ID)
            if (incomingPlanId != null || incomingWorkoutId != null) {
                planTrainingPlanId = incomingPlanId ?: planTrainingPlanId
                planWorkoutId = incomingWorkoutId ?: planWorkoutId
                planWorkoutType = intent?.getStringExtra(EXTRA_WORKOUT_TYPE) ?: planWorkoutType
                planWorkoutIntensity = intent?.getStringExtra(EXTRA_WORKOUT_INTENSITY) ?: planWorkoutIntensity
                planWorkoutDescription = intent?.getStringExtra(EXTRA_WORKOUT_DESCRIPTION) ?: planWorkoutDescription
                planGoalType = intent?.getStringExtra(EXTRA_PLAN_GOAL_TYPE) ?: planGoalType
                planWeekNumber = intent?.getIntExtra(EXTRA_PLAN_WEEK_NUMBER, 0)?.takeIf { it > 0 } ?: planWeekNumber
                planTotalWeeks = intent?.getIntExtra(EXTRA_PLAN_TOTAL_WEEKS, 0)?.takeIf { it > 0 } ?: planTotalWeeks
            }
            // Group run context
            groupRunId = intent?.getStringExtra(EXTRA_GROUP_RUN_ID) ?: groupRunId
            // Deserialize AI-generated session instructions from JSON if present (legacy plan)
            val sessionJson = intent?.getStringExtra(EXTRA_SESSION_INSTRUCTIONS_JSON)
            if (sessionJson != null) {
                try {
                    sessionInstructions = gson.fromJson(sessionJson, SessionInstructionsResponse::class.java)
                    sessionCoachingTone = sessionInstructions?.aiDeterminedTone
                    sessionCoachingIntensity = sessionInstructions?.aiDeterminedIntensity
                    Log.d("RunTrackingService", "✅ Session instructions loaded: tone=${sessionCoachingTone}, phases=${sessionInstructions?.sessionStructure?.phases?.size}")
                } catch (e: Exception) {
                    Log.w("RunTrackingService", "Failed to deserialize session instructions: ${e.message}")
                    sessionInstructions = null
                }
            }
            // Deserialize rich dynamic coaching plan (prepare-coaching) — primary reactive trigger source
            val dynamicPlanJson = intent?.getStringExtra(EXTRA_DYNAMIC_COACHING_PLAN_JSON)
            if (dynamicPlanJson != null) {
                try {
                    dynamicCoachingPlan = gson.fromJson(dynamicPlanJson, live.airuncoach.airuncoach.network.model.DynamicSessionCoachingPlan::class.java)
                    sessionCoachingPlanComplete = false // Reset so new plan can fire all triggers
                    // Reset session memory for fresh run
                    sessionTopicsDiscussed.clear()
                    sessionCueCount = 0
                    nonCriticalCueCount = 0
                    lastCueTriggerType = null
                    lastCueFiredAtMs = 0L
                    lastNonCriticalCueMs = 0L
                    triggerFiredOnce.clear()
                    triggerLastFiredMs.clear()
                    // Reset physiological response tracking
                    lastCueHrAtFire = 0
                    lastCuePaceAtFire = 0.0
                    lastCueHrDelta = null
                    lastCuePaceDelta = null
                    athleteRespondedToLastCue = null
                    Log.d("RunTrackingService", "✅ Dynamic coaching plan loaded: strategy=${dynamicCoachingPlan?.cueingStrategy}, phases=${dynamicCoachingPlan?.phases?.size}, triggers=${dynamicCoachingPlan?.triggers?.size}")
                } catch (e: Exception) {
                    Log.w("RunTrackingService", "Failed to deserialize dynamic coaching plan: ${e.message}")
                    dynamicCoachingPlan = null
                }
            }
            // Extract pre-run briefing text if provided (to record in coaching history)
            preRunBriefingText = intent?.getStringExtra(EXTRA_PRE_RUN_BRIEFING)
            if (preRunBriefingText != null) {
                Log.d("RunTrackingService", "✅ Pre-run briefing captured for coaching history: ${preRunBriefingText?.take(80)}...")
            }
        }

        when (intent?.action) {
            ACTION_START_TRACKING -> startTracking()
            ACTION_STOP_TRACKING -> stopTracking()
            ACTION_PAUSE_TRACKING -> pauseTracking()
            ACTION_RESUME_TRACKING -> resumeTracking()
            ACTION_START_SIMULATION -> startSimulation()
            ACTION_START_NAV_SIMULATION -> startNavigationSimulation()
            ACTION_PREPARE_FOR_WATCH -> prepareForWatch()
            ACTION_START_TRACKING_FROM_WATCH -> {
                // Watch started a run directly without any phone-side preparation.
                // Mark as watch-initiated and begin tracking immediately so the session
                // is captured and the watch "stop" command (which arrives later) can
                // finalize and upload the run.
                wasRunStartedByWatch = true
                lastWatchGpsMs = System.currentTimeMillis()
                Log.d("RunTrackingService", "⌚ ACTION_START_TRACKING_FROM_WATCH — watch-only run, starting tracking immediately")
                startTracking()
            }
            ACTION_WATCH_RUN_FINISHED -> {
                // Recovery: GarminWatchManager detected that the watch finished a run
                // (watchReady + hasPendingSync=true) but the "stop" BT message was dropped.
                // Only stop tracking if this service was itself started for a watch-initiated run.
                // This avoids accidentally aborting a phone-initiated run that happens to be active
                // while an old offline batch is waiting to sync on the watch.
                if (wasRunStartedByWatch && isTracking) {
                    Log.d("RunTrackingService", "⌚ ACTION_WATCH_RUN_FINISHED — watch run ended (stop was dropped), stopping tracking now")
                    stopTracking()
                } else {
                    // Service wasn't tracking a watch-initiated run — nothing to do.
                    // Call stopSelf() to clean up in case we were started fresh by this intent.
                    if (!isTracking) {
                        Log.d("RunTrackingService", "⌚ ACTION_WATCH_RUN_FINISHED — not tracking, nothing to stop")
                        stopSelf()
                    }
                }
            }
            ACTION_CANCEL_PREPARE_FOR_WATCH -> {
                // Only honour the cancel if tracking has not yet started (standby state).
                // If the user already pressed START on the watch we must not interrupt the run.
                if (!isTracking) {
                    Log.d("RunTrackingService", "⌚ Watch prepare cancelled — leaving standby")
                    stopSelf()
                } else {
                    Log.d("RunTrackingService", "⌚ Cancel-prepare ignored — run already in progress")
                }
            }
        }
        return START_STICKY
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AiRunCoach::RunTrackingWakeLock").apply { acquire(10 * 60 * 60 * 1000L) }
    }

    private fun setupLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) { locationResult.lastLocation?.let { onNewLocation(it) } }
        }
    }

    /**
     * Enter a lightweight standby state: start a foreground notification (so Android does not
     * kill the service when the phone screen turns off) and wait for the watch to send "start".
     *
     * This is called from [ACTION_PREPARE_FOR_WATCH] while the phone app is still in the
     * foreground (the user just tapped "Send to Watch").  Because the service is already running
     * as a foreground service by the time the user presses START on the watch, the subsequent
     * call to startTracking() from the watch-command handler happens inside the already-running
     * foreground service — no new startForegroundService() call is needed from the background.
     *
     * All run-config extras (target distance, workout type, etc.) are already parsed from the
     * ACTION_PREPARE_FOR_WATCH intent in onStartCommand() so they are available when tracking
     * actually begins.
     */
    private fun prepareForWatch() {
        if (isTracking) {
            Log.d("RunTrackingService", "prepareForWatch: tracking already active, ignoring")
            return
        }
        try {
            startForeground(
                NOTIFICATION_ID,
                createNotification("Watch Ready", "Press START on your watch to begin")
            )
            Log.d("RunTrackingService", "⌚ Service in standby — foreground started, waiting for watch START")
        } catch (e: Exception) {
            Log.e("RunTrackingService", "prepareForWatch: startForeground failed: $e")
            stopSelf()
        }
    }

    private fun startTracking() {
        if (isTracking) {
            Log.w("RunTrackingService", "Already tracking, ignoring start request")
            return
        }

        Log.d("RunTrackingService", "Starting tracking... targetDistance=$targetDistance, targetTime=$targetTime, hasRoute=$hasRoute")
        
        // CRITICAL: Call startForeground IMMEDIATELY to avoid ANR
        try {
            val startingLabel = if (currentActivityType == "walk") "Starting walk..." else "Starting run..."
            startForeground(NOTIFICATION_ID, createNotification(startingLabel, "Initializing GPS"))
            Log.d("RunTrackingService", "Foreground service started successfully")
        } catch (e: Exception) {
            Log.e("RunTrackingService", "Failed to start foreground service", e)
            stopSelf()
            return
        }
        
        // Now safely initialize everything else
        isTracking = true
        _currentRunSession.value = null  // Clear stale data from previous run
        _uploadComplete.value = null
        _isServiceRunning.value = true
        _firstGpsPoint.value = null      // Reset route recognition for new run
        // wasRunStartedByWatch is intentionally NOT reset here — it is set BEFORE
        // startTracking() is called (in the watch "start" command handler).
        // Resetting it here would erase the flag before we can use it.
        startTime = System.currentTimeMillis()
        lastSplitTime = startTime
        lastSplitWatchElapsedSeconds = 0
        totalPausedMs = 0      // Reset pause tracking for new run
        pauseStartTime = 0
        splitPausedMs = 0
        routePoints.clear()
        kmSplits.clear()
        lastKmSplit = 0
        pendingKmSplitCoaching = null  // Clear any deferred split from previous run
        last500mMilestone = 0  // Reset for new run
        lastWalk500mSplit = 0  // Reset for new walk session
        hasFiredTargetReachedCoaching = false  // Reset for new run
        hasGarminData = false       // Will be set true once first watch biometric frame arrives
        garminDeviceName = null     // Re-captured on first frame new run
        lastPhase = null        // Reset for new run - allow first phase change to trigger
        lastCoachingTime = 0   // Reset cooldown for new run
        totalDistance = 0.0
        // Only reset the watch-GPS suppression window for phone-only runs.
        // For watch-initiated runs, wasRunStartedByWatch is set TRUE before startTracking() is called,
        // and lastWatchGpsMs was stamped at that moment.  Resetting it here would reopen the phone-GPS
        // contamination window for the first 15 s, allowing early phone GPS fixes to inflate totalDistance
        // before the first watch frame arrives — the root cause of the 600m+ discrepancy.
        if (!wasRunStartedByWatch) {
            lastWatchGpsMs = 0L
        }
        maxSpeed = 0f
        smoothedWatchSpeedMs = 0f    // Reset EMA smoother for clean pace display on new run
        watchGpsUpdateCount = 0      // Reset warm-up counter
        watchElapsedSeconds = 0      // Reset authoritative watch timer
        watchDistanceM = 0f          // Reset authoritative Garmin distance
        totalElevationGain = 0.0
        hasGpsElevation = false
        currentSmoothedGrade = 0.0
        totalElevationLoss = 0.0
        garminElevBuffer.clear()
        prevGarminElevWindowMean = null
        weatherAtStart = null
        weatherAtEnd = null
        currentCadence = 0
        cadenceSum = 0
        cadenceCount = 0
        maxCadenceValue = 0
        minCadenceValue = 0
        currentHeartRate = 0
        maxHeartRate = 0
        minHeartRate = 0
        recentHrReadings.clear()
        lastConfidentHr = 0
        heartRateSum = 0L
        heartRateSampleCount = 0
        hrTrendBuffer.clear()
        hrZoneExceededMax = 0
        lastHrRecoveryAcknowledgedAtKm = -5.0
        recentPaceSecPerKm.clear()
        // Reset watch dynamics accumulators
        watchGctSum = 0f;    watchGctCount = 0
        watchGcbSum = 0f;    watchGcbCount = 0
        watchVoSum  = 0f;    watchVoCount  = 0;  watchMaxVo  = 0f
        watchVrSum  = 0f;    watchVrCount  = 0
        watchSlSum  = 0f;    watchSlCount  = 0;  watchMinSl  = 0f;  watchMaxSl = 0f
        watchLatestAte = 0f; watchLatestAnAte = 0f; watchLatestRecoveryMins = 0
        watchLatestVo2Max = 0f; watchLatestPressure = 0f; watchLatestBearing = 0f
        watchPwrSum  = 0f;   watchPwrCount  = 0;   watchMaxPwr  = 0
        watchRespSum = 0f;   watchRespCount = 0
        watchZoneSeconds.fill(0); watchZoneSampleCount = 0; watchZoneSum = 0
        // Reset time-series lists
        watchHrSeries.clear();      watchCadenceSeries.clear()
        watchPaceSeries.clear();    watchAltSeries.clear();     watchGctSeries.clear()
        watchGcbSeries.clear();     watchVoSeries.clear()
        watchVrSeries.clear();      watchSlSeries.clear()
        watchPwrSeries.clear();     watchRespSeries.clear()
        watchBearingSeries.clear(); watchStepsSeries.clear()
        watchGpsAccuracySum = 0f; watchGpsAccuracyCount = 0; watchGpsAccuracyWorst = 0f
        watchMinPace = 0.0; watchMaxPace = 0.0
        initialStepCount = -1
        lastStepTimestamp = 0
        stepDetectorSteps = 0
        stepCountFromDetector = 0
        lastDetectorCadenceCalcTime = 0
        totalStepsDuringRun = 0
        stepDetectorWindowStart = 0
        usingStepDetector = false
        baselinePace = 0f
        lastBaselineUpdateDistance = 0.0
        hasCadenceCoachingFired = false
        lastCadenceCoachingTime = 0
        lastCadenceCoachingDistance = 0.0
        cadenceCoachingCountInWindow = 0
        cadenceCoachingWindowStartDistance = 0.0
        lastCadenceCoachingSpeedMs = 0.0
        lastStrideZone = "OPTIMAL"
        baselineCadence = 0
        cadenceSamplesForBaseline = 0

        lastEliteCoachingTime = 0
        lastTechniqueCoachingTime = 0
        lastGlobalCoachingTime = 0
        lastGlobalCoachingDistance = 0.0
        lastMilestonePercent = 0
        lastTargetEtaKm = 0
        lastPaceTrendCheckKm = 0
        lastPositiveReinforcementKm = 0
        lastElevationInsightTime = 0
        hasFinal500mFired = false
        hasFinal250mFired = false
        hasFinal100mFired = false
        inferredTargetDistance = null
        lastFlatTerrainCoachingKm = 0
        techniqueRotationIndex = 0
        // Load cross-run technique memory before clearing so we can seed usedTechniqueCategories
        // with the last 5 categories from previous runs — prevents repeating the same cues run to run.
        val crossRunCategories = loadCrossRunTechniqueCategories()
        usedTechniqueCategories.clear()
        usedTechniqueCategories.addAll(crossRunCategories)
        hasCoachingFiredThisTick = false
        lastStruggleTriggerTime = 0
        isStruggling = false
        strugglePointsList.clear()
        recentPaceDistances.clear()
        recentPaceTimes.clear()
        lastElevationCoachingTime = 0
        // Reset phase engine for new run
        currentPhaseIndex = 0
        currentPhaseName = null
        phaseDistanceStartKm = 0.0
        currentRepNumber = 1
        currentRepIsWorkPhase = true
        repDistanceStartKm = 0.0
        lastPhaseTriggerFiredForPhase = null
        lastRepTriggerFiredAtRep = 0
        currentTerrainState = "flat"
        pendingTerrainDirection = 0
        pendingTerrainDistanceM = 0.0
        slopeDirection = 0
        slopeDistanceMeters = 0.0
        slopeElevationGain = 0.0
        slopeElevationLoss = 0.0
        downhillFinishTriggered = false
        rollingWindowGainM = 0.0
        rollingWindowLossM = 0.0
        rollingWindowDirectionChanges = 0
        rollingWindowStartKm = 0.0
        lastRollingTerrainCoachKm = -2
        rollingTerrainDetected = false
        recentAltitudes.clear()
        smoothedAltitude = null
        phoneElevBuffer.clear()
        prevPhoneElevWindowMean = null
        hrSum = 0
        hrCount = 0
        maxHr = 0
        lastHrCoachingTime = 0
        lastHrCoachingMinute = -1
        speedReadingSum = 0.0
        speedReadingCount = 0
        
        // Load navigation route data (turn instructions + polyline) from static holder
        loadNavigationData()
        
        // Initialize pace coaching (only active when target time + distance are set)
        initPaceCoaching()

        // Start location and sensors (skip real GPS/sensors during simulation — simulator feeds locations directly)
        try {
            if (!isSimulating) {
                requestLocationUpdates()
                startSensorTracking()
            }
            startTimer()  // Start independent timer
            Log.d("RunTrackingService", "Tracking: ${if (isSimulating) "simulation mode (no real GPS)" else "GPS, sensors,"} and timer started")

            // If the run was initiated from the watch while the phone was in the user's pocket,
            // post a heads-up notification so the user is aware the run is recording.
            if (wasRunStartedByWatch) {
                postWatchRunStartedNotification()
            }
        } catch (e: Exception) {
            Log.e("RunTrackingService", "Failed to start sensors", e)
        }
        
        // Fetch weather in background (non-blocking)
        serviceScope.launch { 
            try {
                weatherAtStart = weatherRepository.getCurrentWeather()
                Log.d("RunTrackingService", "Weather fetched: $weatherAtStart")
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to fetch weather", e)
            }
        }

        // Refresh run history stats with target distance for better similarity matching
        serviceScope.launch {
            try {
                val userId = sessionManager.getUserId()
                if (userId != null) {
                    val targetKm = targetDistance?.let { it / 1000.0 }
                    runHistoryStats = apiService.getRunHistoryStats(userId, targetKm)
                    Log.d("RunTrackingService", "Run history refreshed: ${runHistoryStats?.runsAnalysed} similar runs, trend=${runHistoryStats?.consistencyTrend}")
                }
            } catch (e: Exception) {
                Log.w("RunTrackingService", "Could not refresh run history stats (non-fatal)", e)
            }
        }

        // Record pre-run briefing in coaching history if provided
        preRunBriefingText?.takeIf { it.isNotBlank() }?.let { briefingText ->
            coachingHistory.add(AiCoachingNote(
                time = 0,  // Pre-run briefing is before the run starts
                message = briefingText
            ))
            Log.d("RunTrackingService", "Pre-run briefing recorded in coaching history: ${briefingText.take(80)}...")
        }
        
        // Fire start coaching — short motivational prompt to confirm AI is active
        fireStartCoaching()
    }

    // ==================== SIMULATION MODE ====================

    private fun startSimulation() {
        if (isTracking || isSimulating) return
        isSimulating = true

        // Start like a normal run
        startTracking()

        // Feed simulated locations
        val simulator = RunSimulator()
        serviceScope.launch {
            while (isSimulating && isTracking) {
                val point = simulator.nextPoint()
                if (point == null) {
                    // Simulation complete
                    Log.d("RunTrackingService", "Simulation complete, stopping")
                    withContext(Dispatchers.Main) { stopTracking() }
                    break
                }
                currentHeartRate = point.heartRate
                currentCadence = point.cadence
                withContext(Dispatchers.Main) { onNewLocation(point.location) }
                delay(simulator.tickIntervalMs)
            }
        }
    }

    /**
     * Start a simulated run that follows a route with turn instructions.
     *
     * If the ViewModel passed an actual route polyline (from Map My Run), uses that.
     * Otherwise falls back to the hardcoded Belfast test route.
     *
     * The simulator walks along the decoded polyline points, producing realistic
     * location updates that drive the map, navigation engine, and coaching triggers.
     */
    private fun startNavigationSimulation() {
        if (isTracking || isSimulating) return
        isSimulating = true
        hasRoute = true

        // Decode the actual route polyline if provided by the ViewModel
        val polyline = navSimulationPolyline
        val routeSimulator: RouteFollowingSimulator
        
        if (polyline != null && polyline.isNotEmpty()) {
            // Use the ACTUAL generated route
            val decodedPoints = try {
                PolyUtil.decode(polyline)
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to decode route polyline for simulation", e)
                emptyList()
            }
            
            if (decodedPoints.size >= 2) {
                // NavigationRouteHolder was already set by the ViewModel with turn instructions
                routeSimulator = RouteFollowingSimulator(
                    polylinePoints = decodedPoints,
                    turnInstructions = emptyList(), // Not needed by simulator, only by nav engine
                    tickIntervalMs = 2000L,
                    missWaypointIndex = -1  // Don't deliberately miss any on real routes
                )
                Log.d("RunTrackingService", "Nav simulation using ACTUAL route: ${decodedPoints.size} polyline points, ${targetDistance ?: "?"}km")
            } else {
                // Fallback to Belfast test route
                Log.w("RunTrackingService", "Route polyline too short (${decodedPoints.size} points), falling back to Belfast test")
                routeSimulator = createBelfastFallbackSimulator()
            }
        } else {
            // No route provided — use Belfast test route with hardcoded instructions
            Log.d("RunTrackingService", "No route polyline, using Belfast test route")
            routeSimulator = createBelfastFallbackSimulator()
        }

        // Start tracking (this will consume the NavigationRouteHolder data)
        startTracking()

        // Feed simulated route-following locations
        serviceScope.launch {
            while (isSimulating && isTracking) {
                val point = routeSimulator.nextPoint()
                if (point == null) {
                    Log.d("RunTrackingService", "Navigation simulation complete, stopping")
                    withContext(Dispatchers.Main) { stopTracking() }
                    break
                }
                currentHeartRate = point.heartRate
                currentCadence = point.cadence
                withContext(Dispatchers.Main) { onNewLocation(point.location) }
                delay(routeSimulator.tickIntervalMs)
            }
        }
    }
    
    /** Create the Belfast test route simulator as fallback */
    private fun createBelfastFallbackSimulator(): RouteFollowingSimulator {
        val testInstructions = listOf(
            TurnInstruction("Head east on Chichester Street", 54.5964, -5.9280, 0.15),
            TurnInstruction("Turn right onto Victoria Street", 54.5955, -5.9238, 0.35),
            TurnInstruction("Continue straight onto East Bridge Street", 54.5940, -5.9234, 0.55),
            TurnInstruction("Turn right onto May Street", 54.5938, -5.9220, 0.70),
            TurnInstruction("Turn left onto Dublin Road", 54.5934, -5.9185, 0.90),
            TurnInstruction("Turn right onto University Road", 54.5895, -5.9175, 1.35),
            TurnInstruction("Turn right onto Bradbury Place", 54.5889, -5.9235, 1.75),
            TurnInstruction("Continue north towards Shaftesbury Square", 54.5915, -5.9268, 2.10),
            TurnInstruction("Continue straight back to City Hall", 54.5945, -5.9288, 2.55),
            TurnInstruction("Arrive at finish near Belfast City Hall", 54.5964, -5.9301, 2.95)
        )
        NavigationRouteHolder.set(null, testInstructions)
        targetDistance = 3000.0 // 3km in metres
        return RouteFollowingSimulator.createBelfastTestRoute()
    }

    // ==================== NAVIGATION ENGINE ====================

    /**
     * Load route navigation data from the static holder.
     * Called once when tracking starts. If a route is available, sets up the
     * turn instruction list and decodes the polyline for proximity calculations.
     */
    private fun loadNavigationData() {
        val navData = NavigationRouteHolder.consume()
        if (navData != null) {
            val (polyline, instructions) = navData
            navTurnInstructions = instructions
            navPolylinePoints = if (polyline != null) {
                try { PolyUtil.decode(polyline) } catch (e: Exception) {
                    Log.e("Navigation", "Failed to decode polyline", e)
                    emptyList()
                }
            } else emptyList()
            navCurrentInstructionIndex = 0
            navLastAnnouncedIndex = -1
            navLastWarningIndex = -1
            navMissedWaypointCount = 0
            Log.d("Navigation", "Loaded ${navTurnInstructions.size} turn instructions, ${navPolylinePoints.size} polyline points")
            navTurnInstructions.forEachIndexed { i, inst ->
                Log.d("Navigation", "  [$i] ${inst.instruction} @ (${inst.latitude}, ${inst.longitude}) dist=${inst.distance}km")
            }
        } else {
            Log.d("Navigation", "No navigation data available")
        }
    }

    /**
     * Core navigation check — called on every location update.
     * Handles:
     *  1. Upcoming turn warnings (80m ahead)
     *  2. Waypoint reached confirmation (35m)
     *  3. Missed waypoint detection & auto-skip
     */
    private fun checkNavigationProgress(currentLat: Double, currentLng: Double) {
        if (!coachingFeaturePrefs.routeNavigationEnabled) return
        if (navTurnInstructions.isEmpty()) return
        if (navCurrentInstructionIndex >= navTurnInstructions.size) return

        val now = System.currentTimeMillis()
        if (now - navLastCheckTime < NAV_CHECK_INTERVAL_MS) return
        navLastCheckTime = now

        val currentPos = com.google.android.gms.maps.model.LatLng(currentLat, currentLng)
        val nextInstruction = navTurnInstructions[navCurrentInstructionIndex]
        val waypointPos = com.google.android.gms.maps.model.LatLng(nextInstruction.latitude, nextInstruction.longitude)
        val distanceToWaypoint = SphericalUtil.computeDistanceBetween(currentPos, waypointPos)

        Log.d("Navigation", "Check: idx=$navCurrentInstructionIndex, dist=${distanceToWaypoint.toInt()}m to '${nextInstruction.instruction}'")

        when {
            // CASE 1: Reached the waypoint
            distanceToWaypoint <= NAV_WAYPOINT_REACHED_RADIUS_M -> {
                if (navLastAnnouncedIndex != navCurrentInstructionIndex) {
                    announceNavigation(nextInstruction, isReached = true)
                    navLastAnnouncedIndex = navCurrentInstructionIndex
                }
                advanceToNextInstruction("reached")
            }

            // CASE 2: Approaching the waypoint — give advance warning
            distanceToWaypoint <= NAV_WARNING_RADIUS_M -> {
                if (navLastWarningIndex != navCurrentInstructionIndex) {
                    navLastWarningIndex = navCurrentInstructionIndex
                    val distInt = distanceToWaypoint.toInt()
                    val warningText = "In ${distInt} metres, ${nextInstruction.instruction}"
                    Log.d("Navigation", "WARNING: $warningText")
                    announceNavigationText(warningText)
                }
            }

            // CASE 3: Missed the waypoint — user has gone past it
            else -> {
                checkForMissedWaypoint(currentPos, waypointPos, distanceToWaypoint)
            }
        }
    }

    /**
     * Detect if the runner has passed a waypoint without reaching it.
     * Uses two heuristics:
     *  A) Runner is past the waypoint along the polyline direction
     *  B) Runner is getting farther from the waypoint after having been closer
     */
    private var navPreviousDistanceToWaypoint: Double = Double.MAX_VALUE

    @Suppress("UNUSED_PARAMETER")
    private fun checkForMissedWaypoint(
        currentPos: com.google.android.gms.maps.model.LatLng,
        waypointPos: com.google.android.gms.maps.model.LatLng,
        distanceToWaypoint: Double
    ) {
        // Heuristic: if we had a closer reading previously and now we're moving away AND beyond skip distance
        val wasCloser = navPreviousDistanceToWaypoint < distanceToWaypoint
        val isMovingAway = wasCloser && (distanceToWaypoint - navPreviousDistanceToWaypoint) > 5.0 // 5m hysteresis
        val isBeyondSkipDistance = distanceToWaypoint > NAV_MISSED_WAYPOINT_RADIUS_M

        // Also check: if there's a NEXT instruction, are we closer to that one?
        // BUT only skip if we're already well past the current waypoint (beyond warning radius)
        // to prevent cascade-skipping closely spaced waypoints
        val closerToNextInstruction = if (navCurrentInstructionIndex + 1 < navTurnInstructions.size
            && distanceToWaypoint > NAV_WARNING_RADIUS_M) { // Only consider skip if we're beyond the 80m warning zone
            val nextNext = navTurnInstructions[navCurrentInstructionIndex + 1]
            val nextNextPos = com.google.android.gms.maps.model.LatLng(nextNext.latitude, nextNext.longitude)
            val distToNext = SphericalUtil.computeDistanceBetween(currentPos, nextNextPos)
            distToNext < distanceToWaypoint * 0.5 // Must be significantly closer (50%), not just marginally
        } else false

        navPreviousDistanceToWaypoint = distanceToWaypoint

        if ((isMovingAway && isBeyondSkipDistance) || closerToNextInstruction) {
            Log.d("Navigation", "MISSED waypoint $navCurrentInstructionIndex (dist=${distanceToWaypoint.toInt()}m, " +
                    "movingAway=$isMovingAway, closerToNext=$closerToNextInstruction)")
            navMissedWaypointCount++
            
            // Skip to next instruction
            advanceToNextInstruction("missed")
            
            // Tell the runner about the next instruction instead
            if (navCurrentInstructionIndex < navTurnInstructions.size) {
                val nextInst = navTurnInstructions[navCurrentInstructionIndex]
                val skipText = "Recalculating. Next: ${nextInst.instruction}"
                Log.d("Navigation", "SKIP ANNOUNCE: $skipText")
                announceNavigationText(skipText)
            } else {
                announceNavigationText("Route complete. Keep going to the finish!")
            }
        }
    }

    /**
     * Advance to the next turn instruction.
     */
    private fun advanceToNextInstruction(reason: String) {
        val prev = navCurrentInstructionIndex
        navCurrentInstructionIndex++
        navPreviousDistanceToWaypoint = Double.MAX_VALUE // Reset for new waypoint
        
        if (navCurrentInstructionIndex < navTurnInstructions.size) {
            Log.d("Navigation", "Advanced: $prev -> $navCurrentInstructionIndex ($reason). " +
                    "Next: '${navTurnInstructions[navCurrentInstructionIndex].instruction}'")
        } else {
            Log.d("Navigation", "All ${navTurnInstructions.size} instructions completed ($reason)")
            announceNavigationText("You've completed all the turns. Head to the finish!")
        }
    }

    /**
     * Announce a navigation instruction via the AI coach (LLM-generated voice).
     * Falls back to device TTS if the LLM request fails or times out.
     */
    @Suppress("SameParameterValue")
    private fun announceNavigation(instruction: TurnInstruction, isReached: Boolean) {
        val text = if (isReached) {
            instruction.instruction
        } else {
            "Upcoming: ${instruction.instruction}"
        }
        Log.d("Navigation", "ANNOUNCE via LLM: $text")
        
        // Calculate distance to turn for context
        val distanceToTurn = if (!isReached) {
            val currentPos = com.google.android.gms.maps.model.LatLng(
                routePoints.lastOrNull()?.latitude ?: 0.0,
                routePoints.lastOrNull()?.longitude ?: 0.0
            )
            val turnPos = com.google.android.gms.maps.model.LatLng(instruction.latitude, instruction.longitude)
            SphericalUtil.computeDistanceBetween(currentPos, turnPos).toInt()
        } else null
        
        requestNavigationCoachingFromLLM(text, distanceToTurn)
    }

    /**
     * Announce navigation text (for skips, recalculations, completions) via LLM coach voice.
     */
    private fun announceNavigationText(text: String) {
        Log.d("Navigation", "ANNOUNCE text via LLM: $text")
        requestNavigationCoachingFromLLM(text, null)
    }

    /**
     * Request navigation coaching from the LLM backend.
     * Sends the navigation instruction as context and gets back AI-generated audio
     * in the user's chosen coach voice. Falls back to device TTS on failure.
     */
    private fun requestNavigationCoachingFromLLM(navigationText: String, distanceMeters: Int?) {
        if (isMuted) {
            Log.d("Navigation", "Muted — skipping: $navigationText")
            return
        }
        if (!canFireCoaching(isNavigation = true)) {
            Log.d("Navigation", "Suppressed (too soon after other coaching): $navigationText")
            return
        }
        recordCoachingFired()
        
        // Show text in UI immediately while we wait for audio
        _latestCoachingText.value = navigationText
        
        coachingHistory.add(AiCoachingNote(
            time = getActiveRunDuration(),
            message = "Nav: $navigationText"
        ))
        
        serviceScope.launch {
            try {
                val update = PhaseCoachingUpdate(
                    phase = _currentRunSession.value?.phase?.name ?: "STEADY",
                    distance = totalDistance / 1000.0,
                    targetDistance = targetDistance?.let { it / 1000.0 },  // Convert metres to km
                    elapsedTime = getActiveRunDuration() / 1000,  // Convert ms to seconds
                    currentPace = _currentRunSession.value?.averagePace ?: "0:00",
                    currentGrade = calculateAverageGradient().toDouble(),
                    totalElevationGain = totalElevationGain,
                    heartRate = currentHeartRate.takeIf { it > 0 },
                    cadence = currentCadence.takeIf { it > 0 },
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    fitnessLevel = currentUser?.fitnessLevel,
                    runnerName = currentUser?.name,
                    activityType = currentActivityType,
                    hasRoute = true,
                    triggerType = "navigation_turn",
                    navigationInstruction = navigationText,
                    navigationDistance = distanceMeters,
                    // ========== NEW: Session Coaching Context ==========
                    linkedWorkoutId = planWorkoutId,
                    sessionStructure = sessionInstructions?.sessionStructure,
                    userId = currentUser?.id
                )
                
                val response = apiService.getPhaseCoaching(update)
                Log.d("Navigation", "LLM navigation response: ${response.message}")
                
                coachingHistory.add(AiCoachingNote(
                    time = getActiveRunDuration(),
                    message = "Nav LLM: ${response.message}"
                ))
                
                // Update UI with LLM's natural phrasing
                _latestCoachingText.value = response.message
                
                // Play via PRIORITY queue — interrupts any coaching audio
                CoachingAudioQueue.enqueueNavigation(
                    context = this@RunTrackingService,
                    base64Audio = response.audio,
                    format = response.format,
                    fallbackText = response.message,
                    accent = currentUser?.coachAccent,
                    gender = currentUser?.coachGender,
                    onComplete = {
                        _latestCoachingText.value = null
                    }
                )
                
            } catch (e: Exception) {
                Log.w("Navigation", "LLM navigation request failed, falling back to device TTS: ${e.message}")
                // Fallback: use device TTS via PRIORITY queue
                CoachingAudioQueue.enqueueNavigation(
                    context = this@RunTrackingService,
                    base64Audio = null,
                    format = null,
                    fallbackText = navigationText,
                    accent = currentUser?.coachAccent,
                    gender = currentUser?.coachGender,
                    onComplete = {
                        _latestCoachingText.value = null
                    }
                )
            }
        }
    }

    // ==================== PACE COACHING ENGINE ====================
    
    /**
     * Initialize pace coaching if the run has both a target distance and target time.
     * Called from startTracking().
     */
    private fun initPaceCoaching() {
        val tDist = targetDistance
        val tTime = targetTime
        if (tDist != null && tDist > 0 && tTime != null && tTime > 0) {
            val targetDistKm = tDist / 1000.0
            val targetTimeSeconds = tTime / 1000.0
            // Use the session's main effort pace if a coaching plan is loaded — this avoids the
            // race goal pace (e.g. 5:07/km) being used as the reference during an aerobic session
            // (target 5:30/km). If no plan pace is available, fall back to race goal pace.
            val planMainEffortPace = dynamicCoachingPlan?.targetMetrics?.mainEffortPaceMin
                ?: dynamicCoachingPlan?.targetMetrics?.mainEffortPaceMax
            targetPaceSecondsPerKm = if (planMainEffortPace != null && planMainEffortPace > 0) {
                planMainEffortPace.toDouble()
            } else {
                targetTimeSeconds / targetDistKm
            }
            paceCoachingEnabled = true
            paceTargetAbandoned = false
            paceTargetAbandonedNotified = false
            consecutiveOverPaceChecks = 0
            consecutiveBehindTargetCues = 0
            lastPaceCoachingDistance = 0.0
            lastPaceCoachingTime = 0
            lastPaceDeviationPercent = 0.0
            
            val paceMin = (targetPaceSecondsPerKm / 60).toInt()
            val paceSec = (targetPaceSecondsPerKm % 60).toInt()
            Log.d("PaceCoaching", "Initialized: target pace ${paceMin}:${String.format("%02d", paceSec)}/km, " +
                    "target distance ${targetDistKm}km, target time ${targetTimeSeconds}s")
        } else {
            paceCoachingEnabled = false
            Log.d("PaceCoaching", "Not enabled — no target time/distance (dist=$tDist, time=$tTime)")
        }
    }
    
    /**
     * Check if pace coaching should fire based on current distance and time.
     * Uses smart intervals: frequent early (catch fast starts), moderate mid-run, frequent late.
     * Called from onNewLocation() after distance is updated.
     */
    private fun checkPaceCoaching() {
        if (!paceCoachingEnabled) return
        if (!coachingFeaturePrefs.paceCoachingEnabled) return
        if (hasCoachingFiredThisTick) return
        if (totalDistance < PACE_FIRST_CHECK_M) return // Don't start until 100m
        if (!canFireCoaching()) return // Global coaching gate — prevents back-to-back with splits/nav/HR
        if (isNearKmBoundary()) return // Suppress within 200m of km marks — split coaching will fire there
        // When a coached session plan is active (dynamic or legacy), it manages its own pace-deviation
        // triggers using the session's actual target pace — not the user's race goal pace. Suppress the
        // generic pace engine to prevent conflicting cues (e.g. "run faster to 5:10" during an aerobic
        // 5:30/km session because the race goal pace is 5:10).
        if (isCoachingPlanActive) return
        
        val now = System.currentTimeMillis()
        val tDist = targetDistance ?: return
        
        // Cooldown check
        if (now - lastPaceCoachingTime < PACE_COOLDOWN_MS && lastPaceCoachingTime > 0) return
        
        // Determine the interval based on run phase
        val progressFraction = totalDistance / tDist // 0.0 to 1.0
        val remainingDistance = tDist - totalDistance
        val intervalForPhase = when {
            totalDistance < 1000.0 -> PACE_EARLY_INTERVAL_M   // First km: every 300m
            progressFraction > 0.80 -> PACE_LATE_INTERVAL_M   // Last 20%: every 500m
            else -> PACE_MID_INTERVAL_M                        // Middle: every 750m
        }
        
        // Check if we've covered enough distance since last coaching
        val distanceSinceLastCoaching = totalDistance - lastPaceCoachingDistance
        if (distanceSinceLastCoaching < intervalForPhase && lastPaceCoachingDistance > 0) return
        
        // Skip if we're in the last 100m (final sprint, no nagging)
        if (remainingDistance < 100.0) return
        
        // Calculate current average pace for the whole run so far (excluding paused time)
        val elapsedMs = getActiveRunDuration()
        val elapsedSeconds = elapsedMs / 1000.0
        val distKm = totalDistance / 1000.0
        if (distKm <= 0 || elapsedSeconds <= 0) return
        
        val currentAvgPaceSecondsPerKm = elapsedSeconds / distKm
        val paceDeviation = (currentAvgPaceSecondsPerKm - targetPaceSecondsPerKm) / targetPaceSecondsPerKm
        // Positive deviation = slower than target, Negative = faster than target
        
        // Project finish time based on current average pace
        val totalDistKm = tDist / 1000.0
        val projectedFinishSeconds = currentAvgPaceSecondsPerKm * totalDistKm
        val targetTimeSeconds = (targetTime ?: return) / 1000.0
        val projectedVsTarget = (projectedFinishSeconds - targetTimeSeconds) / targetTimeSeconds
        
        // Get current rolling pace (last ~500m if available, for trend detection)
        val rollingPace = calculateRollingPace(500.0)
        val rollingPaceDeviation = if (rollingPace > 0) {
            (rollingPace - targetPaceSecondsPerKm) / targetPaceSecondsPerKm
        } else paceDeviation
        
        // Get current gradient for context
        val currentGradient = if (smoothedAltitude != null && recentAltitudes.size >= ALTITUDE_SMOOTHING_WINDOW) {
            val lastTwo = recentAltitudes.takeLast(2)
            if (lastTwo.size == 2) ((lastTwo[1] - lastTwo[0]) / 10.0 * 100).coerceIn(-15.0, 15.0) else 0.0
        } else 0.0
        
        // SAFEGUARD: Check if target has become unrealistic
        if (!paceTargetAbandoned && totalDistance >= PACE_ABANDON_MIN_DISTANCE_M) {
            if (projectedVsTarget > PACE_ABANDON_THRESHOLD) {
                consecutiveOverPaceChecks++
                if (consecutiveOverPaceChecks >= 3) {
                    // Target is truly unreachable — abandon pace coaching
                    paceTargetAbandoned = true
                    Log.d("PaceCoaching", "Target abandoned: projected ${projectedFinishSeconds}s vs target ${targetTimeSeconds}s " +
                            "(${String.format("%.1f", projectedVsTarget * 100)}% over)")
                    
                    if (!paceTargetAbandonedNotified) {
                        paceTargetAbandonedNotified = true
                        triggerPaceCoaching(
                            paceDeviation = paceDeviation,
                            rollingPaceDeviation = rollingPaceDeviation,
                            projectedFinishSeconds = projectedFinishSeconds,
                            currentAvgPace = currentAvgPaceSecondsPerKm,
                            rollingPace = rollingPace,
                            currentGradient = currentGradient,
                            progressFraction = progressFraction,
                            isAbandoning = true
                        )
                        lastPaceCoachingDistance = totalDistance
                        lastPaceCoachingTime = now
                        hasCoachingFiredThisTick = true
                        recordCoachingFired()
                    }
                    return
                }
            } else {
                consecutiveOverPaceChecks = 0 // Reset if they're back on track
            }
        }
        
        if (paceTargetAbandoned) return // Don't nag after abandoning
        
        // Determine pace zone
        val paceZone = when {
            paceDeviation < -PACE_WAY_OVERFAST_THRESHOLD -> "way_too_fast"    // >15% faster
            paceDeviation < -PACE_OVERFAST_THRESHOLD -> "too_fast"            // 10-15% faster
            paceDeviation < PACE_OVERFAST_THRESHOLD -> "on_pace"              // within 10%
            paceDeviation < PACE_ABANDON_THRESHOLD -> "too_slow"              // 10-25% slower
            else -> "way_too_slow"
        }
        
        Log.d("PaceCoaching", "Check at ${String.format("%.0f", totalDistance)}m: zone=$paceZone, " +
                "avgPace=${String.format("%.0f", currentAvgPaceSecondsPerKm)}s/km, " +
                "rollingPace=${String.format("%.0f", rollingPace)}s/km, " +
                "target=${String.format("%.0f", targetPaceSecondsPerKm)}s/km, " +
                "deviation=${String.format("%.1f", paceDeviation * 100)}%, " +
                "gradient=${String.format("%.1f", currentGradient)}%")
        
        // Don't trigger for "on_pace" every time — only every other check (avoid over-coaching)
        if (paceZone == "on_pace" && totalDistance < tDist * 0.80) {
            // On pace in mid-run: only trigger every 1.5km to be encouraging without nagging
            if (distanceSinceLastCoaching < 1500.0 && lastPaceCoachingDistance > 0) return
        }
        
        // Trigger the pace coaching API call
        triggerPaceCoaching(
            paceDeviation = paceDeviation,
            rollingPaceDeviation = rollingPaceDeviation,
            projectedFinishSeconds = projectedFinishSeconds,
            currentAvgPace = currentAvgPaceSecondsPerKm,
            rollingPace = rollingPace,
            currentGradient = currentGradient,
            progressFraction = progressFraction,
            isAbandoning = false
        )
        lastPaceCoachingDistance = totalDistance
        lastPaceCoachingTime = now
        lastPaceDeviationPercent = paceDeviation * 100
        hasCoachingFiredThisTick = true
        recordCoachingFired()
    }
    
    /**
     * Calculate rolling average pace over the last N metres of the run.
     * More responsive than overall average for detecting recent pace changes.
     */
    private fun calculateRollingPace(windowMeters: Double): Double {
        if (routePoints.size < 3) return 0.0
        
        var distAccum = 0.0
        var idx = routePoints.size - 1
        
        // Walk backwards through route points until we've accumulated the window distance
        while (idx > 0 && distAccum < windowMeters) {
            val p1 = routePoints[idx]
            val p2 = routePoints[idx - 1]
            distAccum += calculateDistance(p2, p1)
            idx--
        }
        
        if (distAccum < 50.0) return 0.0 // Need at least 50m of data
        
        val startPoint = routePoints[idx]
        val endPoint = routePoints.last()
        val timeSeconds = (endPoint.timestamp - startPoint.timestamp) / 1000.0
        if (timeSeconds <= 0) return 0.0
        
        return (timeSeconds / (distAccum / 1000.0)) // seconds per km
    }
    
    /**
     * Trigger pace coaching via the AI backend.
     * Sends pace context data so the LLM can generate smart, context-aware pace advice.
     */
    private fun triggerPaceCoaching(
        paceDeviation: Double,
        rollingPaceDeviation: Double,
        projectedFinishSeconds: Double,
        currentAvgPace: Double,
        rollingPace: Double,
        currentGradient: Double,
        progressFraction: Double,
        isAbandoning: Boolean
    ) {
        // Update plateau counter: if behind target (+ve deviation > 10%), increment; else reset
        if (!isAbandoning) {
            if (paceDeviation > 0.10) {
                consecutiveBehindTargetCues++
            } else {
                consecutiveBehindTargetCues = 0  // Runner improved — reset plateau
            }
        }

        serviceScope.launch {
            try {
                val tDist = targetDistance ?: return@launch
                val tTime = targetTime ?: return@launch
                
                // Build the coaching update with pace-specific data
                val update = PhaseCoachingUpdate(
                    phase = _currentRunSession.value?.phase?.name ?: "STEADY",
                    distance = totalDistance / 1000.0, // km
                    targetDistance = tDist / 1000.0,  // Convert metres to km
                    elapsedTime = getActiveRunDuration() / 1000,  // Convert ms to seconds
                    currentPace = formatPace(currentAvgPace),  // Use actual avg pace, not GPS instant pace
                    currentGrade = currentGradient,
                    totalElevationGain = totalElevationGain,
                    heartRate = currentHeartRate.takeIf { it > 0 },
                    cadence = currentCadence.takeIf { it > 0 },
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    fitnessLevel = currentUser?.fitnessLevel,
                    runnerName = currentUser?.name,
                    runnerAge = currentUser?.age,
                    runnerWeight = currentUser?.weight,
                    runnerHeight = currentUser?.height,
                    activityType = currentActivityType,
                    hasRoute = hasGpsElevation || hasRoute,  // True when GPS altitude available, not just when planned route loaded
                    targetTime = (tTime / 1000).toInt(),
                    targetPace = formatPace(targetPaceSecondsPerKm),
                    triggerType = if (isAbandoning) "pace_abandon" else "pace_coaching",
                    // Pace-specific fields
                    paceDeviationPercent = paceDeviation * 100,
                    rollingPaceDeviationPercent = rollingPaceDeviation * 100,
                    projectedFinishSeconds = projectedFinishSeconds,
                    currentAvgPaceSecondsPerKm = currentAvgPace,
                    rollingPaceSecondsPerKm = rollingPace,
                    progressPercent = progressFraction * 100,
                    // Plateau detection
                    consecutiveBehindCues = consecutiveBehindTargetCues,
                    userId = currentUser?.id
                )
                
                Log.d("PaceCoaching", "Requesting LLM pace coaching: triggerType=${update.triggerType}, " +
                        "deviation=${String.format("%.1f", paceDeviation * 100)}%, " +
                        "abandoning=$isAbandoning")
                
                val response = apiService.getPhaseCoaching(update)
                Log.d("PaceCoaching", "LLM response: ${response.message.take(80)}...")
                
                // Play via the standard coaching audio pipeline (handles all text normalizations)
                playCoachingAudio(response.audio, response.format, response.message)
            } catch (e: Exception) {
                Log.e("PaceCoaching", "Failed to get pace coaching from LLM", e)
            }
        }
    }
    
    /**
     * Format pace in seconds per km to a "M:SS" string.
     */
    private fun formatPace(secondsPerKm: Double): String {
        if (secondsPerKm <= 0 || secondsPerKm > 900) return "0:00"
        val minutes = (secondsPerKm / 60).toInt()
        val seconds = (secondsPerKm % 60).toInt()
        return String.format("%d:%02d", minutes, seconds)
    }
    
    // ==================== FINAL STRETCH GATE ====================
    
    /**
     * Returns true if the runner is in the last 500m of their target distance.
     * When true, only motivation/finishing coaching should fire — no analysis, summaries, 
     * HR coaching, cadence coaching, pace analysis, or split breakdowns.
     */
    private fun isInFinalStretch(): Boolean {
        val td = targetDistance ?: inferredTargetDistance ?: return false // Always in metres (normalized on receipt)
        if (td <= 0) return false
        val remaining = td - totalDistance
        return remaining in 0.0..FINAL_STRETCH_METERS
    }
    
    // ==================== EXPERIENCE LEVEL HELPER ====================

    /**
     * Returns true for runners who are new or low-experience: fitness level is null/newcomer/
     * beginner/casual AND they have fewer than 30 runs on record. By ~30 sessions a beginner
     * has built real frequency and is ready for more technical coaching (elevation, struggle, etc.).
     */
    private fun isLowExperienceRunner(): Boolean {
        val runs = runHistoryStats?.totalRunsAllTime ?: 0
        if (runs >= 30) return false
        val level = currentUser?.fitnessLevel?.lowercase()
        return level == null || level in setOf("newcomer", "beginner", "casual")
    }

    // ==================== CADENCE ANALYSIS (shared by all coaching triggers) ====================

    data class StrideSnapshot(
        val cadence: Int,
        val cadenceProximityTier: String, // "ON_TARGET" | "CLOSE" | "NEEDS_WORK"
        val cadenceDeviationPercent: Double, // signed: negative = below target
        val terrainContext: String, // "flat", "uphill", "downhill"
        val isFatigued: Boolean,
        val optimalCadenceMin: Int,   // personalised lower-bound spm (pace + height + age)
        val optimalCadenceTarget: Int, // personalised target spm
        val optimalCadenceMax: Int    // personalised upper-bound spm
    )

    /**
     * Biomechanics-based personalised cadence calculator.
     *
     * Optimal cadence is NOT a fixed universal value — it depends on:
     *   - Speed/pace: faster running requires higher cadence
     *   - Height: taller runners have longer natural step length → slightly lower optimal cadence
     *   - Age: runners over 50 have reduced lower-limb reactivity → relax target by ~1 spm per 5 years
     *   - Terrain gradient: uphill forces shorter quicker steps; downhill allows slightly longer strides
     *
     * Formula:
     *   stepLengthRatio = 0.58 + (speed_ms - 2.78) × 0.16   (calibrated against research norms)
     *   stepLength = stepLengthRatio × heightM
     *   optimalCadence = (speed_ms / stepLength) × 60
     *
     * Research calibration points (175cm runner at 0% grade):
     *   6:00/km (2.78 m/s) → ~163 spm
     *   5:00/km (3.33 m/s) → ~168 spm
     *   4:30/km (3.70 m/s) → ~173 spm
     *   4:00/km (4.17 m/s) → ~177 spm
     *
     * Terrain adjustments (approximate research consensus):
     *   +3–5% grade (uphill):    +2 spm  (shorter, quicker steps reduce ground-contact time)
     *   +5–8% grade (steep up):  +4 spm
     *   −3–5% grade (downhill):  −2 spm  (slightly longer strides are natural, reduce braking)
     *   −5–8% grade (steep dn):  −3 spm  (more lenient but overstriding still penalised elsewhere)
     *
     * @param speedMs      Current speed in metres/second
     * @param heightCm     Runner height in cm (default 170)
     * @param age          Runner age in years (optional, adjusts for over-50s)
     * @param gradePercent Real-time slope % (positive = uphill, negative = downhill; default 0.0)
     * @return Triple(optimalCadenceMin, optimalCadenceTarget, optimalCadenceMax)
     */
    private fun calculatePersonalisedCadenceRange(
        speedMs: Double,
        heightCm: Double = 170.0,
        age: Int? = null,
        gradePercent: Double = 0.0
    ): Triple<Int, Int, Int> {
        val heightM = heightCm.coerceIn(140.0, 220.0) / 100.0
        val speed   = speedMs.coerceIn(1.5, 6.0)         // ~2:45/km to walking pace

        val BASE_SPEED = 2.78    // m/s at 6:00/km
        val BASE_RATIO = 0.58    // step length as fraction of height at base speed
        val RATIO_PER_MS = 0.16  // ratio increase per m/s of speed increase

        val stepLengthRatio = (BASE_RATIO + (speed - BASE_SPEED) * RATIO_PER_MS).coerceIn(0.45, 0.95)
        val stepLength = stepLengthRatio * heightM
        var optimal = ((speed / stepLength) * 60).toInt()

        // Age-based adjustment: reduce target by ~1 spm per 5 years over age 50 (max –6 spm)
        if (age != null && age > 50) {
            val adjustment = ((age - 50) / 5).coerceAtMost(6)
            optimal = (optimal - adjustment).coerceAtLeast(148)
        }

        // Terrain gradient adjustment: uphill demands shorter/quicker steps; downhill allows longer strides.
        // Adjustments are additive on top of the speed-based target so the cadence advice always reflects
        // both the runner's actual pace AND the terrain they are currently on.
        val gradeAdjustment = when {
            gradePercent >= 8.0  ->  5   // Very steep uphill — maximum cadence increase
            gradePercent >= 5.0  ->  4   // Steep uphill
            gradePercent >= 3.0  ->  2   // Moderate uphill
            gradePercent <= -8.0 -> -3   // Very steep downhill — allow longer strides
            gradePercent <= -5.0 -> -3   // Steep downhill
            gradePercent <= -3.0 -> -2   // Moderate downhill
            else                 ->  0   // Flat (±3%)
        }
        optimal = (optimal + gradeAdjustment).coerceAtLeast(148)

        // Cadence tolerance buffer: ±5-8 spm is normal variation during a run
        // Too strict = false positives that frustrate runners (e.g. "3 spm off is not a problem")
        // Too loose = coaching that could miss real form issues
        // 5-8 spm represents ~3-5% variation, which is imperceptible to the runner
        val low  = (optimal * 0.97).toInt()   // ~3% below optimal (tolerance for form variation)
        val high = (optimal * 1.04).toInt()   // ~4% above optimal (excellent efficiency)

        return Triple(low, optimal, high)
    }

    private fun getCurrentStrideAnalysis(): StrideSnapshot? {
        if (currentCadence <= 0) return null

        // Prefer GPS-reported speed (more accurate, uses doppler shift) over distance/time calculation
        val currentSpeed = if (routePoints.isNotEmpty() && routePoints.last().speed != null && routePoints.last().speed!! > 0.5f) {
            routePoints.last().speed!!.toDouble()
        } else if (routePoints.size >= 2) {
            val last = routePoints.last()
            val prev = routePoints[routePoints.size - 2]
            val timeDelta = (last.timestamp - prev.timestamp) / 1000.0
            if (timeDelta > 0) {
                val dist = calculateDistance(prev, last)
                dist / timeDelta
            } else 0.0
        } else 0.0

        if (currentSpeed <= 0.5) return null // Too slow to calculate

        val heightCm = currentUser?.height?.toDouble() ?: 170.0

        // Terrain context — use real-time smoothed grade, not the whole-run average gradient
        val grade = currentSmoothedGrade
        val terrain = when {
            grade > UPHILL_GRADE_THRESHOLD -> "uphill"
            grade < DOWNHILL_GRADE_THRESHOLD -> "downhill"
            else -> "flat"
        }

        // Personalised cadence range using biomechanics model — includes terrain gradient so the
        // target shifts upward on hills (shorter quicker steps) and slightly downward on descents.
        val (cadenceLow, cadenceTarget, cadenceHigh) = calculatePersonalisedCadenceRange(
            speedMs = currentSpeed,
            heightCm = heightCm,
            age = currentUser?.age,
            gradePercent = grade
        )

        // Cadence-only proximity tiers:
        //   ON_TARGET  — within ±5% of target (a guide, not an absolute)
        //   CLOSE      — 5–10% below target: gentle encouragement
        //   NEEDS_WORK — >10% below target: specific coaching
        // Above-target cadence is always ON_TARGET (higher turnover is fine).
        val cadenceDeviationPercent = if (cadenceTarget > 0) {
            (currentCadence - cadenceTarget).toDouble() / cadenceTarget * 100.0
        } else 0.0

        val cadenceProximityTier = when {
            cadenceDeviationPercent >= -5.0 -> "ON_TARGET"   // within 5% or above
            cadenceDeviationPercent >= -10.0 -> "CLOSE"       // 5–10% below
            else -> "NEEDS_WORK"                               // >10% below
        }

        // Fatigue detection: cadence drops > 5% from baseline indicates form breakdown from fatigue
        val fatigueDropPercent = 0.05  // 5% = ~8-9 spm for typical 170 spm baseline
        val isFatigued = baselineCadence > 0 && terrain == "flat" && (baselineCadence - currentCadence) > (baselineCadence * fatigueDropPercent).toInt()

        // Build baseline from first 2km
        if (totalDistance < 2000 && currentCadence > 0) {
            baselineCadence = if (cadenceSamplesForBaseline == 0) currentCadence
            else ((baselineCadence.toLong() * cadenceSamplesForBaseline + currentCadence) / (cadenceSamplesForBaseline + 1)).toInt()
            cadenceSamplesForBaseline++
        }

        return StrideSnapshot(
            cadence = currentCadence,
            cadenceProximityTier = cadenceProximityTier,
            cadenceDeviationPercent = cadenceDeviationPercent,
            terrainContext = terrain,
            isFatigued = isFatigued,
            optimalCadenceMin = cadenceLow,
            optimalCadenceTarget = cadenceTarget,
            optimalCadenceMax = cadenceHigh
        )
    }

    /**
     * Inject a GPS fix received from the Garmin watch into the normal location pipeline.
     *
     * Creates a synthetic [Location] tagged with provider "garmin" and accuracy 3 m
     * (Garmin multi-band GPS typical accuracy) then routes it through [onNewLocation]
     * exactly as a phone GPS update would be — all distance calculation, elevation
     * accumulation, coaching triggers and route tracking work unchanged.
     *
     * Called by [GarminWatchManager.onWatchGpsUpdate] during phone-controlled runs.
     */
    fun injectWatchLocation(lat: Double, lng: Double, altM: Double?, speedMs: Float?) {
        // Guard: only process if tracking is active
        if (!isTracking) {
            Log.d("RunTrackingService", "Ignoring watch GPS injection: isTracking=false")
            return
        }
        // NOTE: We intentionally do NOT check _currentRunSession.value here.
        // When the run is started from the watch, the phone's own GPS may not
        // have delivered a fix yet — so _currentRunSession is still null.
        // onNewLocation() creates the RunSession on the first GPS fix, regardless
        // of whether it comes from the phone or the watch.
        val loc = android.location.Location("garmin").apply {
            latitude  = lat
            longitude = lng
            altM?.let  { altitude = it }
            speedMs?.let { speed = it }
            accuracy  = 3.0f          // Garmin multi-band GPS ≈ 3 m CEP
            time      = System.currentTimeMillis()
        }
        lastWatchGpsMs = System.currentTimeMillis()

        // Immediately update pace from Garmin's own speed (more accurate & instant than
        // waiting for two consecutive GPS fixes and computing distance/time).
        //
        // Two-layer noise rejection:
        //   1. EMA smoothing (α=0.3) — dampens brief GPS jitter spikes that occur when
        //      near-stationary or during GPS multipath (e.g., a 1-second 8 m/s blip when
        //      standing still no longer shows as "2:04 min/km").
        //   2. 8-update warm-up gate — GPS lock is unstable in the first ~8 seconds so
        //      we display "–" until the satellite fix has stabilised.
        if (speedMs != null) {
            watchGpsUpdateCount++
            // EMA: weight 70% previous / 30% new reading.  A single bad spike takes
            // several seconds to wash out, which is imperceptible during a real run.
            smoothedWatchSpeedMs = 0.7f * smoothedWatchSpeedMs + 0.3f * speedMs

            currentPace = when {
                watchGpsUpdateCount < 8 -> {
                    // GPS warming up — don't display erratic pace yet
                    "–"
                }
                smoothedWatchSpeedMs > 0.5f -> {
                    // 0.5 m/s ≈ 1.8 km/h — below this we treat the user as stationary.
                    // (Old threshold was 0.2 m/s which let noisy near-zero readings through.)
                    val paceSecPerKm = 1000.0 / smoothedWatchSpeedMs.toDouble()
                    val minutes = (paceSecPerKm / 60).toInt()
                    val seconds = (paceSecPerKm % 60).toInt()
                    String.format("%d:%02d", minutes, seconds)
                }
                else -> "0:00"  // stationary — show zero pace, not stale phone-GPS pace
            }
        }

        Log.d("RunTrackingService", "Watch GPS injected: lat=$lat lng=$lng alt=$altM speed=$speedMs pace=$currentPace")
        onNewLocation(loc)
    }

    /**
     * Update heart rate and cadence from watch sensor data stream during the run.
     * Called every ~2 seconds when watch is connected and streaming sensor data.
     * These real-time values are used immediately for live coaching and AI insights.
     */
    /**
     * Processes a full biometric frame streamed from the Garmin companion watch every ~2 s.
     * Updates all live metrics (HR, cadence, running dynamics, training effect, etc.)
     * and queues a [WatchBiometricFrame] sample for storage in watch_biometric_samples.
     */
    private fun updateWatchSensorData(frame: WatchBiometricFrame) {
        // Guard: only process if tracking is active
        if (!isTracking) {
            Log.d("RunTrackingService", "Ignoring watch sensor data: isTracking=false")
            return
        }
        // Mark that Garmin sensor data was received (drives hasGarminData flag on upload)
        if (!hasGarminData) {
            hasGarminData = true
            // Capture device name once — requires manager to be available
            if (garminDeviceName == null) {
                garminDeviceName = garminWatchManager?.getConnectedDeviceName()
            }
        }
        // NOTE: We still accumulate HR/cadence/dynamics data even if _currentRunSession
        // is null (awaiting first GPS fix from phone or watch).  The running dynamics
        // accumulators (watchGctSum, watchHR, etc.) are independent of the RunSession.
        // The RunSession will pick them up once the first GPS fix creates it.

        Log.d("RunTrackingService",
            "Watch frame: hr=${frame.heartRate} cad=${frame.cadence} " +
            "gct=${frame.groundContactTime}ms vo=${frame.verticalOscillation}cm " +
            "stride=${frame.strideLength}m te=${frame.aerobicTrainingEffect}")

        // ── Heart Rate ────────────────────────────────────────────────────────
        if (frame.heartRate > 20) {
            val prevHr = currentHeartRate
            val validatedHr = validateAndUpdateHRBuffer(frame.heartRate)
            if (validatedHr != null) {
                currentHeartRate = validatedHr
                heartRateSum += validatedHr
                heartRateSampleCount++
                maxHeartRate = maxOf(maxHeartRate, validatedHr)
                minHeartRate = if (minHeartRate == 0) validatedHr else minOf(minHeartRate, validatedHr)
                if (kotlin.math.abs(validatedHr - prevHr) > 10) {
                    Log.d("RunTrackingService", "HR change: $prevHr → $validatedHr bpm")
                }
            }
            // If validatedHr is null, the reading was a suspected dropout — currentHeartRate
            // retains its last confident value so the UI doesn't flash to 0.
        }

        // ── Cadence ───────────────────────────────────────────────────────────
        if (frame.cadence > 0) {
            currentCadence = frame.cadence
            cadenceSum += frame.cadence
            cadenceCount++
            maxCadenceValue = maxOf(maxCadenceValue, frame.cadence)
            minCadenceValue = if (minCadenceValue == 0) frame.cadence else minOf(minCadenceValue, frame.cadence)
        }
        if (frame.heartRateZone in 1..5) {
            watchZoneSeconds[frame.heartRateZone] += 2
            watchZoneSampleCount++
            watchZoneSum += frame.heartRateZone
        }

        // ── Running Dynamics (accumulate for averages at run end) ─────────────
        if (frame.groundContactTime > 0f) {
            watchGctSum += frame.groundContactTime
            watchGctCount++
        }
        if (frame.groundContactBalance in 30f..70f) {
            watchGcbSum += frame.groundContactBalance
            watchGcbCount++
        }
        if (frame.verticalOscillation > 0f) {
            watchVoSum += frame.verticalOscillation
            watchVoCount++
            watchMaxVo = maxOf(watchMaxVo, frame.verticalOscillation)
        }
        if (frame.verticalRatio > 0f) {
            watchVrSum += frame.verticalRatio
            watchVrCount++
        }
        if (frame.strideLength > 0.1f) {
            watchSlSum += frame.strideLength
            watchSlCount++
            watchMinSl = if (watchMinSl == 0f) frame.strideLength else minOf(watchMinSl, frame.strideLength)
            watchMaxSl = maxOf(watchMaxSl, frame.strideLength)
        }

        // ── Training Effect & Recovery (keep latest non-zero values) ──────────
        if (frame.aerobicTrainingEffect > 0f) watchLatestAte = frame.aerobicTrainingEffect
        if (frame.anaerobicTrainingEffect > 0f) watchLatestAnAte = frame.anaerobicTrainingEffect
        if (frame.recoveryTimeMinutes > 0) watchLatestRecoveryMins = frame.recoveryTimeMinutes
        if (frame.vo2MaxEstimate > 0f) watchLatestVo2Max = frame.vo2MaxEstimate

        // ── Running Power (watts, device-dependent) ───────────────────────────
        if (frame.runningPower > 0) {
            watchPwrSum += frame.runningPower; watchPwrCount++
            if (frame.runningPower > watchMaxPwr) watchMaxPwr = frame.runningPower
        }
        // ── Respiration Rate (breaths/min, Fenix 7+ only) ─────────────────────
        if (frame.respirationRate > 0f) { watchRespSum += frame.respirationRate; watchRespCount++ }

        // ── Environmental ─────────────────────────────────────────────────────
        if (frame.ambientPressure > 0f) watchLatestPressure = frame.ambientPressure
        if (frame.bearingDeg != null && frame.bearingDeg >= 0f) watchLatestBearing = frame.bearingDeg

        // ── Append to time-series (every frame ~2s — graphs need this data) ────
        if (frame.heartRate > 0)            watchHrSeries.add(frame.heartRate)
        if (frame.cadence > 0)              watchCadenceSeries.add(frame.cadence)
        // Prefer barometric altitude; fall back to GPS alt from the watch position fix
        val altSample = when {
            frame.baroAltitude > 0f             -> frame.baroAltitude
            (frame.altMetres ?: 0.0) > 0.0      -> frame.altMetres!!.toFloat()
            else                                 -> null
        }
        if (altSample != null)             watchAltSeries.add(altSample)
        // Derive pace (sec/km) from watch speed (m/s). Clamped 3:00–15:00/km to exclude
        // GPS noise spikes (e.g. standing still returning 0.01 m/s = 27h/km pace).
        val speedSample = frame.speedMs
        if (speedSample != null && speedSample > 0f) {
            val paceSecPerKm = (1000.0 / speedSample.toDouble()).coerceIn(180.0, 900.0)
            watchPaceSeries.add(paceSecPerKm)
            // Track pace extremes: min = fastest (lowest sec/km), max = slowest
            if (watchMinPace == 0.0 || paceSecPerKm < watchMinPace) watchMinPace = paceSecPerKm
            if (paceSecPerKm > watchMaxPace) watchMaxPace = paceSecPerKm
        }
        if (frame.groundContactTime > 0f)  watchGctSeries.add(frame.groundContactTime)
        if (frame.groundContactBalance in 30f..70f) watchGcbSeries.add(frame.groundContactBalance)
        if (frame.verticalOscillation > 0f) watchVoSeries.add(frame.verticalOscillation)
        if (frame.verticalRatio > 0f)      watchVrSeries.add(frame.verticalRatio)
        if (frame.strideLength > 0.1f)     watchSlSeries.add(frame.strideLength)
        if (frame.runningPower > 0)        watchPwrSeries.add(frame.runningPower)
        if (frame.respirationRate > 0f)    watchRespSeries.add(frame.respirationRate)
        frame.bearingDeg?.takeIf { it >= 0f }?.let { watchBearingSeries.add(it) }
        if (frame.cadence > 0) watchStepsSeries.add((frame.cadence / 30f).toInt())
        // GPS accuracy: Garmin quality 0-4 → approx metres CEP (4=~3m, 3=~8m, 2=~15m, 1=~50m, 0=~200m)
        val acc = frame.gpsAccuracy
        if (acc != null && acc >= 0f) {
            val metreCep = when {
                acc >= 4f -> 3f
                acc >= 3f -> 8f
                acc >= 2f -> 15f
                acc >= 1f -> 50f
                else      -> 200f
            }
            watchGpsAccuracySum += metreCep; watchGpsAccuracyCount++
            if (metreCep > watchGpsAccuracyWorst) watchGpsAccuracyWorst = metreCep
        }

        // ── Update live RunSession ─────────────────────────────────────────────
        _currentRunSession.value = _currentRunSession.value?.copy(
            heartRate           = frame.heartRate.takeIf { it > 0 } ?: (_currentRunSession.value?.heartRate ?: 0),
            cadence             = frame.cadence.takeIf { it > 0 } ?: (_currentRunSession.value?.cadence ?: 0),
            avgGroundContactTime    = if (watchGctCount > 0) watchGctSum / watchGctCount else null,
            avgGroundContactBalance = if (watchGcbCount > 0) watchGcbSum / watchGcbCount else null,
            avgVerticalOscillation  = if (watchVoCount > 0) watchVoSum / watchVoCount else null,
            maxVerticalOscillation  = if (watchMaxVo > 0f) watchMaxVo else null,
            avgVerticalRatio        = if (watchVrCount > 0) watchVrSum / watchVrCount else null,
            avgStrideLength         = if (watchSlCount > 0) watchSlSum / watchSlCount else (_currentRunSession.value?.avgStrideLength),
            aerobicTrainingEffect   = if (watchLatestAte > 0f) watchLatestAte else null,
            anaerobicTrainingEffect = if (watchLatestAnAte > 0f) watchLatestAnAte else null,
            recoveryTimeMinutes     = if (watchLatestRecoveryMins > 0) watchLatestRecoveryMins else null,
            vo2MaxEstimate          = if (watchLatestVo2Max > 0f) watchLatestVo2Max else null,
            avgRunningPower         = if (watchPwrCount > 0) (watchPwrSum / watchPwrCount).toInt() else null,
            maxRunningPower         = if (watchMaxPwr > 0) watchMaxPwr else null,
            avgRespirationRate      = if (watchRespCount > 0) watchRespSum / watchRespCount else null,
        )

        // ── Authoritative watch metrics (watch-initiated sessions only) ────────────────
        // The Garmin firmware's Kalman-filtered GPS accumulation is significantly more
        // accurate than independent phone-GPS accumulation.  Using it as the source of
        // truth eliminates the 600m+ distance divergence observed in testing.
        //
        // Distance: override phone's totalDistance with the watch's actInfo.elapsedDistance.
        //   - Only applied when the watch has confirmed at least 5m (noise floor) to avoid
        //     a premature override from a 0-value frame at session start.
        //
        // Timer: override with watch's actInfo.timerTime (pauses automatically with the session).
        //   - Eliminates clock-start divergence caused by BT latency between watch-press and
        //     the phone's startTime being stamped (observed as ~70s offset in Nino's session).
        if (wasRunStartedByWatch) {
            frame.cumulativeDistanceM
                ?.takeIf { it.isFinite() && it > 5f }
                ?.let { watchDistanceM ->
                    // Connect IQ may deliver queued Bluetooth frames out of order.
                    // Garmin distance must never make the persisted session move backwards.
                    if (watchDistanceM >= this.watchDistanceM) {
                        Log.d(
                            "RunTrackingService",
                            "⌚ Authoritative distance: ${totalDistance.toInt()}m → ${watchDistanceM.toInt()}m"
                        )
                        this.watchDistanceM = watchDistanceM
                        totalDistance = watchDistanceM.toDouble()
                    } else {
                        Log.d(
                            "RunTrackingService",
                            "Ignoring stale Garmin distance ${watchDistanceM.toInt()}m; accepted=${this.watchDistanceM.toInt()}m"
                        )
                    }
                }

            // Same monotonic rule for the paused Garmin activity timer: an older
            // queued frame must not make duration or average pace regress.
            if (frame.elapsedSeconds > watchElapsedSeconds) {
                watchElapsedSeconds = frame.elapsedSeconds
            }
        }
    }

    private fun requestLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.e("RunTrackingService", "Location permission not granted - stopping service")
            stopSelf()
            return
        }
        try {
            // Determine if power saver mode is active and log it
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            val isPowerSaveMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                powerManager.isPowerSaveMode
            } else {
                false
            }
            
            // Sync both instance flag and companion StateFlow so the UI is immediately aware
            isPhonePowerSaverActive = isPowerSaveMode
            _isPowerSaverActive.value = isPowerSaveMode
            if (isPowerSaveMode) {
                Log.w("RunTrackingService", "⚠️ POWER SAVER MODE DETECTED at run start - GPS tracking may be throttled")
                powerSaverModeDetected = true
            } else {
                Log.d("RunTrackingService", "Power saver mode: NOT active")
            }
            
            // Always use PRIORITY_HIGH_ACCURACY to override power saver constraints
            // setWaitForAccurateLocation(false) ensures we don't wait indefinitely for GPS lock
            val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_UPDATE_INTERVAL).apply { 
                setMinUpdateIntervalMillis(LOCATION_FASTEST_INTERVAL)
                setWaitForAccurateLocation(false)
                // Note: numUpdates(Integer.MAX_VALUE) not used as we control lifecycle via service start/stop
            }.build()
            fusedLocationClient.requestLocationUpdates(req, locationCallback, Looper.getMainLooper())
            Log.d("RunTrackingService", "Location updates requested successfully (Power saver active: $isPowerSaveMode)")
        } catch (e: Exception) {
            Log.e("RunTrackingService", "Failed to request location updates", e)
            stopSelf()
        }
    }

    private fun startSensorTracking() {
        // Check ACTIVITY_RECOGNITION permission for step counter (Android 10+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED) {
                stepCounterSensor?.let {
                    try {
                        sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
                        Log.d("RunTrackingService", "Step counter sensor registered")
                    } catch (e: Exception) {
                        Log.e("RunTrackingService", "Failed to register step counter", e)
                    }
                }
            } else {
                Log.w("RunTrackingService", "ACTIVITY_RECOGNITION permission not granted - skipping step counter")
            }
        }

        // Check BODY_SENSORS permission for heart rate (Android 6+)
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) {
            heartRateSensor?.let {
                try {
                    sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
                    Log.d("RunTrackingService", "Heart rate sensor registered")
                } catch (e: Exception) {
                    Log.e("RunTrackingService", "Failed to register heart rate sensor", e)
                }
            }
        } else {
            Log.w("RunTrackingService", "BODY_SENSORS permission not granted - skipping heart rate sensor")
        }
    }

    private fun onNewLocation(location: Location) {
        if (!isTracking) return

        // If the watch is actively streaming GPS (within the last 15 s), skip phone GPS
        // updates entirely to prevent double-counting distance.  The watch's Garmin
        // multi-band antenna is significantly more accurate than the phone GPS.
        // 15 s window (was 5 s) gives headroom for BT latency spikes and brief gaps
        // between watch GPS packets without phone GPS sneaking in.
        if (location.provider != "garmin" && (System.currentTimeMillis() - lastWatchGpsMs) < 15_000L) {
            Log.d("RunTrackingService", "Skipping phone GPS — watch GPS is active (${System.currentTimeMillis() - lastWatchGpsMs}ms ago)")
            return
        }

        // Calculate incline percentage from elevation change
        // Note: We calculate degrees first, then convert to percentage grade (not degrees)
        // Percentage grade = tan(angle_in_radians) × 100
        // This is more useful for coaching than degrees
        var inclineDegrees: Float? = null
        if (location.hasAltitude()) {
            if (routePoints.isNotEmpty()) {
                val prevAlt = routePoints.last().altitude
                if (prevAlt != null) {
                    val altChange = location.altitude - prevAlt
                    val distToNextPoint = calculateDistance(routePoints.last(), 
                        LocationPoint(location.latitude, location.longitude, location.time, 
                            null, null, null, null, null, null))
                    if (distToNextPoint > 0) {
                        // Calculate angle in radians first
                        val angleRadians = kotlin.math.atan(altChange / distToNextPoint)
                        // Convert to percentage grade (not degrees!)
                        // This represents the grade percentage which is more intuitive for coaching
                        inclineDegrees = (kotlin.math.tan(angleRadians) * 100).toFloat()
                    }
                }
            }
        }

        val newPoint = LocationPoint(
            latitude = location.latitude,
            longitude = location.longitude,
            timestamp = location.time,
            speed = location.speed.takeIf { it > 0 }, // Store speed if positive (works for both real GPS and simulation)
            altitude = location.altitude.takeIf { location.hasAltitude() },
            heartRate = currentHeartRate.takeIf { it > 0 },
            bearing = location.bearing.takeIf { location.hasBearing() },
            cadence = currentCadence.takeIf { it > 0 },
            inclineDegrees = inclineDegrees
        )

        if (routePoints.isNotEmpty()) {
            val prevPoint = routePoints.last()
            val distanceIncrement = calculateDistance(prevPoint, newPoint)

            // Log location info for debugging
            Log.d("RunTrackingService", "Location update - accuracy: ${location.accuracy}m, speed: ${location.speed}m/s, distance: ${distanceIncrement}m, points: ${routePoints.size}")

            // Tiered accuracy filter: accept more points to avoid "cutting corners" which under-counts distance
            // Phone GPS typically: 3-10m (open sky), 10-25m (urban), 25-50m (dense urban/trees)
            // Garmin watches: 2-5m consistently (dedicated multi-band GPS antenna)
            val isFirstLocations = routePoints.size < 5
            val timeSinceLastPoint = (newPoint.timestamp - prevPoint.timestamp) / 1000.0 // seconds
            val maxAcceptableAccuracy = when {
                isFirstLocations -> 50f                        // Be lenient at start to get initial fix
                timeSinceLastPoint > 10 -> 40f                 // If it's been >10s, accept wider accuracy to avoid big gaps
                else -> 30f                                    // Normal running: accept up to 30m accuracy
            }
            // Distance sanity: min 2m (GPS drift), max 100m between points (teleport/spike)
            val isDistanceReasonable = distanceIncrement >= 2.0 && distanceIncrement <= 100.0
            // Speed sanity: reject points implying >40 km/h (impossible running speed)
            val impliedSpeedKmh = if (timeSinceLastPoint > 0) (distanceIncrement / timeSinceLastPoint) * 3.6 else 0.0
            val isSpeedReasonable = impliedSpeedKmh < 40.0 || isFirstLocations

            if (location.accuracy <= maxAcceptableAccuracy && isDistanceReasonable && isSpeedReasonable) {
                lastGpsAccuracyM = location.accuracy  // Track latest accepted GPS accuracy for sensor confidence reporting
                // Calculate instantaneous pace from consecutive GPS points (for UI display)
                val currentPaceSeconds = if (timeSinceLastPoint > 0 && distanceIncrement > 0) {
                    (1000.0 * timeSinceLastPoint / distanceIncrement).toFloat() // seconds per km
                } else 0f
                
                // Feed rolling window for smoothed pace (used by struggle detection & coaching)
                if (timeSinceLastPoint > 0 && distanceIncrement > 0) {
                    recentPaceDistances.add(distanceIncrement)
                    recentPaceTimes.add(timeSinceLastPoint)
                    while (recentPaceDistances.size > PACE_WINDOW_SIZE) {
                        recentPaceDistances.removeAt(0)
                        recentPaceTimes.removeAt(0)
                    }
                }
                // Smoothed pace: average over the last ~8 GPS points (~8-16 seconds)
                // This prevents a single GPS jitter from triggering false struggles or wrong coaching
                val smoothedPaceSeconds = if (recentPaceDistances.size >= 3) {
                    val totalDist = recentPaceDistances.sum()
                    val totalTime = recentPaceTimes.sum()
                    if (totalDist > 0) (1000.0 * totalTime / totalDist).toFloat() else currentPaceSeconds
                } else {
                    currentPaceSeconds // Not enough data yet, use raw value
                }
                
                // Update current real-time pace display (use smoothed for better UX)
                // Cap at 900 sec/km (15 min/km) — below this speed, GPS drift from a
                // stationary phone produces absurd values. A real runner is never slower.
                currentPace = if (smoothedPaceSeconds > 0 && smoothedPaceSeconds < 900) {
                    val minutes = (smoothedPaceSeconds / 60).toInt()
                    val seconds = (smoothedPaceSeconds % 60).toInt()
                    String.format("%d:%02d", minutes, seconds)
                } else {
                    "0:00"
                }
                // Feed the pace trend buffer whenever we have a valid smoothed pace
                if (smoothedPaceSeconds > 0 && smoothedPaceSeconds < 900) {
                    updatePaceTrendBuffer(smoothedPaceSeconds.toDouble())
                }
                totalDistance += distanceIncrement
                // Accumulate speed readings for speed-based avg pace (essential for simulation where wall-clock time is compressed)
                // Use speed from Location if available, otherwise try LocationPoint speed as fallback
                val speedToRecord = if (location.hasSpeed() && location.speed > 0.5f) {
                    location.speed
                } else if (newPoint.speed != null && newPoint.speed!! > 0.5f) {
                    newPoint.speed!!.toFloat()
                } else null

                if (speedToRecord != null) {
                    speedReadingSum += speedToRecord
                    speedReadingCount++
                }
                if (newPoint.altitude != null && prevPoint.altitude != null) {
                    hasGpsElevation = true   // GPS altitude is available for this run

                    if (location.provider == "garmin") {
                        // Garmin barometric-GPS fusion altitude: accurate to ±0.3-0.5m but updates
                        // only every ~2 seconds. Per-sample gain accumulation fails because at normal
                        // running pace a 5% grade only produces ~0.15m per sample — impossible to
                        // separate from noise with a threshold approach.
                        //
                        // Instead: buffer 10 samples (≈20 s), compare successive window means.
                        // Window noise: ±0.3m/√10 ≈ ±0.10m. Real 5% grade at 5:30/km yields
                        // ~1.5m per window — comfortably above the 0.5m commit threshold.
                        garminElevBuffer.add(newPoint.altitude)
                        if (garminElevBuffer.size >= GARMIN_ELEV_WINDOW) {
                            val windowMean = garminElevBuffer.average()
                            val prevMean = prevGarminElevWindowMean
                            if (prevMean != null) {
                                val change = windowMean - prevMean
                                if (change > GARMIN_ELEV_COMMIT_THRESHOLD) {
                                    totalElevationGain += change
                                } else if (change < -GARMIN_ELEV_COMMIT_THRESHOLD) {
                                    totalElevationLoss += abs(change)
                                }
                            }
                            prevGarminElevWindowMean = windowMean
                            garminElevBuffer.clear() // Start next window fresh
                        }
                    } else {
                        // Phone GPS: altitude accuracy ±5–10 m at 1 Hz.  Per-sample threshold
                        // (1.5 m) discards virtually all real hill changes (a 10% hill at 5 min/km
                        // only produces 0.33 m/s — never crosses the threshold).
                        //
                        // Instead: collect 60 consecutive readings (one per second), take their
                        // mean, and compare to the previous 60-second mean.  Each mean has noise
                        // ±1.3 m (10/√60), so a sustained 3% grade yields ~6 m per window —
                        // easily detectable with a 1.5 m commit threshold.
                        phoneElevBuffer.add(newPoint.altitude)
                        if (phoneElevBuffer.size >= PHONE_ELEV_WINDOW) {
                            val windowMean = phoneElevBuffer.average()
                            val prevMean = prevPhoneElevWindowMean
                            if (prevMean != null) {
                                val change = windowMean - prevMean
                                if (change > PHONE_ELEV_COMMIT_THRESHOLD) {
                                    totalElevationGain += change
                                } else if (change < -PHONE_ELEV_COMMIT_THRESHOLD) {
                                    totalElevationLoss += abs(change)
                                }
                            }
                            prevPhoneElevWindowMean = windowMean
                            phoneElevBuffer.clear() // Start next 60-second window fresh
                        }
                    }
                    
                    // Smooth altitude for elevation coaching (reduces GPS noise)
                    recentAltitudes.add(newPoint.altitude)
                    if (recentAltitudes.size > ALTITUDE_SMOOTHING_WINDOW) recentAltitudes.removeAt(0)
                    val prevSmoothed = smoothedAltitude
                    smoothedAltitude = recentAltitudes.average()
                    
                    // Use smoothed altitude difference for elevation coaching.
                    // Fires regardless of hasRoute — GPS altitude is always available outdoors
                    // and runners deserve hill coaching on free runs, parkruns, etc.
                    if (prevSmoothed != null && recentAltitudes.size >= ALTITUDE_SMOOTHING_WINDOW) {
                        val smoothedElevChange = smoothedAltitude!! - prevSmoothed
                        val smoothedGradePercent = (smoothedElevChange / distanceIncrement) * 100
                        // Track current real-time grade for isOnHill (not the whole-run average)
                        currentSmoothedGrade = smoothedGradePercent
                        updateElevationCoaching(distanceIncrement, smoothedGradePercent, smoothedElevChange)
                    }
                }
                routePoints.add(newPoint)
                if (location.speed > maxSpeed) maxSpeed = location.speed

                // Route Memory Engine — emit first GPS fix so ViewModel can call recognize-route
                if (routePoints.size == 1 && _firstGpsPoint.value == null) {
                    _firstGpsPoint.value = Pair(newPoint.latitude, newPoint.longitude)
                }

                updatePaceAndStruggle(smoothedPaceSeconds)
                checkForKmSplit()
                // Pace coaching — smart interval checks against target pace
                // Suppressed in final 500m (only motivation coaching allowed)
                if (!isInFinalStretch()) {
                    checkPaceCoaching()
                }
                updateRunSession()
                updateNotification()
            } else {
                // Log rejected point for debugging distance discrepancies
                val reason = when {
                    location.accuracy > maxAcceptableAccuracy -> "accuracy ${location.accuracy}m > ${maxAcceptableAccuracy}m"
                    !isDistanceReasonable -> "distance ${distanceIncrement}m out of range [2-100m]"
                    !isSpeedReasonable -> "implied speed ${impliedSpeedKmh.toInt()} km/h > 40 km/h"
                    else -> "unknown"
                }
                Log.d("RunTrackingService", "GPS point REJECTED: $reason")
            }

            // ALWAYS check navigation on every GPS update, even if the point was rejected for distance tracking.
            // Navigation only needs lat/lng to check proximity to waypoints — it doesn't depend on
            // distance accuracy. Previously this was inside the acceptance block, so rejected points
            // caused navigation to silently stop mid-run.
            if (hasRoute) {
                checkNavigationProgress(location.latitude, location.longitude)
            }
        } else {
            routePoints.add(newPoint)
        }
    }
    
    /**
     * Detect struggles using SMOOTHED pace (not single-point GPS).
     * The input `smoothedPaceSeconds` is averaged over ~8 GPS points (8-16 seconds),
     * so a single GPS jitter can't trigger a false 8:00/km reading.
     */
    private fun updatePaceAndStruggle(smoothedPaceSeconds: Float) {
        // Update baseline (session average pace) every 500m after the first 1km
        if (totalDistance >= 1000 && (totalDistance - lastBaselineUpdateDistance) >= 500) {
            val elapsedSeconds = (getActiveRunDuration()) / 1000.0
            if (elapsedSeconds > 0 && totalDistance > 0) {
                baselinePace = (elapsedSeconds / (totalDistance / 1000.0)).toFloat() // seconds per km
                lastBaselineUpdateDistance = totalDistance
            }
        }

        // All coaching plan sessions: suppress struggle detection entirely.
        //
        // Tier 1 (intervals, hill repeats): recovery jogs cause intentional pace drops that
        // the struggle engine would misread as "you're struggling".
        //
        // Tier 2 (easy, recovery, long_run): the session coaching plan now fires HR zone alerts,
        // pace alerts, and periodic check-ins that provide all the effort guidance the runner
        // needs. A generic struggle prompt ("you seem to be slowing down") conflicts with and
        // duplicates the plan's reactive triggers and gives the runner a confusing second voice.
        if (isCoachingPlanActive) {
            isStruggling = false
            return
        }

        // Suppress struggle coaching for low-experience runners (newcomers/beginners with ≤3 runs).
        // Two "Struggle" messages on a first run is discouraging — they need reassurance and
        // positive reinforcement, not repeated reminders that they're slowing down.
        if (isLowExperienceRunner()) {
            isStruggling = false
            return
        }
        
        if (baselinePace > 0f) {
            val paceDropPercent = (smoothedPaceSeconds - baselinePace) / baselinePace * 100
            val now = System.currentTimeMillis()
            // Personalised struggle threshold — lower for advanced runners (their pace is more consistent),
            // higher for beginners (more natural variation). Also relaxed on uphills to avoid false positives.
            val fitnessThreshold = when (currentUser?.fitnessLevel?.lowercase()) {
                "advanced", "elite" -> 18.0   // Tight — advanced runners maintain pace well
                "intermediate" -> 25.0         // Standard
                "beginner" -> 35.0             // Relaxed — beginners have more natural variation
                else -> 25.0
            }
            // On a steep hill, add 10% tolerance (uphill naturally slows pace)
            val hillTolerance = if (currentSmoothedGrade > STEEP_UPHILL_GRADE_THRESHOLD) 10.0 else 0.0
            val effectiveThreshold = fitnessThreshold + hillTolerance
            if (paceDropPercent > effectiveThreshold && (now - lastStruggleTriggerTime) > STRUGGLE_COOLDOWN_MS) {
                isStruggling = true
                lastStruggleTriggerTime = now
                // Suppress struggle coaching in the final 500m — only motivation allowed
                if (!isInFinalStretch()) {
                    triggerStruggleCoaching(smoothedPaceSeconds, paceDropPercent)
                }
            } else {
                isStruggling = false
            }
        }
    }

    private fun checkForKmSplit() {
        val currentKm = (totalDistance / 1000).toInt()

        // ── Walk session: 500m splits ───────────────────────────────────────────────────────────
        // Walkers move at ~8–15 min/km — a 1km split interval means 8–15 minutes of silence.
        // Every 500m gives walkers regular coaching check-ins to keep them engaged and on target.
        // This fires for all walk sessions (free walks and continuous coaching plan walks).
        // Suppressed in the final 500m — final stretch cues handle the finish.
        // The initial 500m is already handled by check500mMilestones() as a one-time event,
        // so walk 500m splits start from the 1000m mark (same as km 1 split, then 1500m, 2000m, etc.)
        if (currentActivityType == "walk" && !isCoachingPlanActive) {
            val current500mBlock = (totalDistance / 500).toInt()
            // Skip the very first block (0-500m) — handled by check500mMilestones() as the initial check-in
            // Skip if in the final stretch — final 500m coaching takes over
            if (current500mBlock > lastWalk500mSplit && current500mBlock >= 2 && !isInFinalStretch()) {
                lastWalk500mSplit = current500mBlock
                val hasReachedTarget = targetDistance != null && totalDistance >= (targetDistance!! * 0.99)
                if (!hasReachedTarget && !hasCoachingFiredThisTick && canFireCoaching()) {
                    Log.d("RunTrackingService", "Walk 500m split at ${String.format("%.1f", totalDistance / 1000)}km — triggering coaching")
                    hasCoachingFiredThisTick = true
                    recordCoachingFired()
                    // Build a synthetic split using distance since last 500m boundary
                    val now = System.currentTimeMillis()
                    val splitTime = (now - lastSplitTime) - splitPausedMs
                    val distSinceLastSplit = 500.0 // Always 500m blocks for walk sessions
                    val splitSpeedKmh = if (splitTime > 0) (distSinceLastSplit / (splitTime / 1000.0) * 3.6).toFloat() else 0f
                    val walkSplit = KmSplit(
                        km = current500mBlock, // Use 500m block count as the "km" index for the API
                        time = splitTime,
                        pace = calculatePace(splitSpeedKmh)
                    )
                    lastSplitTime = now
                    splitPausedMs = 0
                    triggerKmSplitCoaching(walkSplit)
                }
            }
        }

        // ── Retry any pending split from a previous tick where cooldown blocked it ──
        val pending = pendingKmSplitCoaching
        if (pending != null && !hasCoachingFiredThisTick && canFireCoaching() && !isInFinalStretch()) {
            Log.d("RunTrackingService", "Retrying pending km split coaching at ${pending.km}km")
            pendingKmSplitCoaching = null
            hasCoachingFiredThisTick = true
            recordCoachingFired()
            triggerKmSplitCoaching(pending)
            return
        }

        if (currentKm > lastKmSplit) {
            val now = System.currentTimeMillis()
            val splitTime = if (wasRunStartedByWatch && watchElapsedSeconds > 0) {
                ((watchElapsedSeconds - lastSplitWatchElapsedSeconds).coerceAtLeast(0) * 1000L)
            } else {
                (now - lastSplitTime) - splitPausedMs  // Exclude paused time from this split
            }
            val splitSpeedKmh = if (splitTime > 0) (1000f / (splitTime / 1000f)) * 3.6f else 0f // m/s → km/h
            val split = KmSplit(km = currentKm, time = splitTime, pace = calculatePace(splitSpeedKmh))
            kmSplits.add(split)
            lastKmSplit = currentKm
            lastSplitTime = now
            lastSplitWatchElapsedSeconds = watchElapsedSeconds
            splitPausedMs = 0  // Reset pause accumulator for next split
            Log.d("RunTrackingService", "Reached ${currentKm}km split")

            // Coaching plan session gate for km splits:
            //
            // ── Interval sessions (Tier 1) ───────────────────────────────────────────
            // All km split coaching is suppressed. The AI-generated session trigger plan owns
            // every cue — rep starts, rep ends, recovery transitions, and HR/pace alerts.
            // A km split firing mid-rep is context-ignorant and directly contradicts what the
            // plan may have just said ("ease off — HR is high" vs "great pace, keep it up!").
            //
            // ── Continuous coaching plan sessions (Tier 2: tempo, long_run, threshold, race_pace) ──
            // Km splits ARE allowed because sustained continuous effort benefits from per-km
            // progress feedback. The AI prompt receives workoutType so splits are framed around
            // the session objective (e.g. "5 seconds/km ahead of your tempo target — ease slightly
            // to stay in the prescribed effort zone") rather than the long-term race goal.
            // The AI-generated triggers still fire alongside splits for HR, form, and motivation.
            if (isCoachingPlanActive && isIntervalTypeSession) {
                Log.d("RunTrackingService", "Skipping km split coaching for interval coached session at ${currentKm}km")
                return
            }

            // Only trigger AI coaching at the user's chosen interval (1km, 2km, 3km, 5km, 10km)
            // Suppress split coaching in the final 500m — only motivation allowed
            // CRITICAL: Suppress split coaching if run target has been reached — run is complete
            val interval = coachingFeaturePrefs.kmSplitIntervalKm
            val hasReachedTarget = targetDistance != null && totalDistance >= (targetDistance!! * 0.99) // 1% tolerance for GPS precision
            if (currentKm % interval == 0 && !isInFinalStretch() && !hasReachedTarget) {
                if (!hasCoachingFiredThisTick && canFireCoaching()) {
                    Log.d("RunTrackingService", "Triggering split coaching at ${currentKm}km (interval: every ${interval}km)")
                    hasCoachingFiredThisTick = true
                    recordCoachingFired()
                    triggerKmSplitCoaching(split)
                } else {
                    // Cooldown active at the exact km crossing — store and retry next tick
                    Log.d("RunTrackingService", "Km split at ${currentKm}km deferred (cooldown active) — will retry")
                    pendingKmSplitCoaching = split
                }
            } else if (hasReachedTarget) {
                Log.d("RunTrackingService", "Target distance reached at ${currentKm}km (target was ${(targetDistance!! / 1000.0).toInt()}km) — suppressing km split coaching")
                fireTargetReachedCoaching()
            }
        }
    }

    /**
     * One-time congratulatory message fired the moment a standalone run/walk crosses its
     * target distance (e.g. "You crushed that 5K!"). Previously this moment went completely
     * silent — checkForKmSplit()'s hasReachedTarget branch only logged and suppressed further
     * split coaching, with no completion cue ever firing on the current live coaching
     * endpoints. Mirrors fireFinalCoaching's final_100m precedent: a one-time guard
     * (hasFiredTargetReachedCoaching) rather than the normal cooldown gate, since this is a
     * singular guaranteed moment, not a recurring check-in.
     */
    private fun fireTargetReachedCoaching() {
        if (hasFiredTargetReachedCoaching) return
        hasFiredTargetReachedCoaching = true
        hasCoachingFiredThisTick = true
        recordCoachingFired()
        lastCoachingTime = System.currentTimeMillis()
        Log.d("RunTrackingService", "Firing target-reached completion coaching")
        serviceScope.launch {
            try {
                val elapsedMs = getActiveRunDuration()
                val elapsedSec = elapsedMs / 1000.0
                val distKm = totalDistance / 1000.0
                val currentAvgPaceStr = if (distKm > 0 && elapsedSec > 0) {
                    formatPace(elapsedSec / distKm)
                } else "0:00"

                val request = TargetReachedRequest(
                    distance = distKm,
                    targetDistance = targetDistance?.let { it / 1000.0 },
                    elapsedTime = elapsedSec.toLong(),
                    targetTime = targetTime?.let { (it / 1000).toInt() },
                    currentPace = currentAvgPaceStr,
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    runnerName = currentUser?.name,
                    activityType = currentActivityType,
                    userId = currentUser?.id
                )
                val response = apiService.getTargetReachedCoaching(request)
                coachingHistory.add(AiCoachingNote(
                    time = getActiveRunDuration(),
                    message = "Target reached: ${response.message}"
                ))
                Log.d("RunTrackingService", "Target-reached coaching response: ${response.message}")
                if (!isMuted) {
                    playCoachingAudio(response.audio, response.format, response.message)
                }
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to get target-reached coaching", e)
            }
        }
    }
    
    /**
     * Add the final partial km split if it's within 100m of a full km.
     * For runs like 4.95km or 9.92km, we want to show the final partial km.
     */
    private fun addPartialKmSplitIfNeeded(): List<KmSplit> {
        val splits = kmSplits.toMutableList()
        
        if (splits.isEmpty() || totalDistance < 1000) return splits
        
        val lastSplit = splits.last()
        val distanceOfLastFullKm = lastSplit.km * 1000.0 // meters
        val distanceCoveredInLastKm = totalDistance - distanceOfLastFullKm // meters since last full km
        
        // If the partial km is within 100m of a full km, include it
        if (distanceCoveredInLastKm >= 900) { // 900m or more (within 100m of 1km)
            val now = System.currentTimeMillis()
            val splitTime = (now - lastSplitTime) - splitPausedMs
            val splitSpeedKmh: Float = if (splitTime > 0) (distanceCoveredInLastKm / (splitTime / 1000f) * 3.6f).toFloat() else 0f
            val partialSplit = KmSplit(km = lastSplit.km + 1, time = splitTime, pace = calculatePace(speedKmh = splitSpeedKmh))
            splits.add(partialSplit)
            Log.d("RunTrackingService", "Added partial km split: ${lastSplit.km + 1}km (${String.format("%.0f", distanceCoveredInLastKm)}m)")
        }
        
        return splits
    }

    private fun calculateDistance(p1: LocationPoint, p2: LocationPoint): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(p2.latitude - p1.latitude)
        val dLon = Math.toRadians(p2.longitude - p1.longitude)
        val a = sin(dLat / 2) * sin(dLat / 2) + cos(Math.toRadians(p1.latitude)) * cos(Math.toRadians(p2.latitude)) * sin(dLon / 2) * sin(dLon / 2)
        return r * (2 * atan2(sqrt(a), sqrt(1 - a)))
    }

    private fun updateRunSession() {
        // Use the watch's actInfo.timerTime when this is a watch-initiated session.
        // The watch timer starts exactly when the user presses START on the watch, pauses
        // automatically when the session is paused, and is never affected by BT latency.
        // The phone's own clock (getActiveRunDuration) stamps startTime when the "start"
        // BT command arrives — which can be 30–90s later due to screen-lock / BT delivery
        // delay, causing the visible timer gap Nino reported (01:01:17 vs 1:00:06).
        val duration = if (wasRunStartedByWatch && watchElapsedSeconds > 0) {
            watchElapsedSeconds * 1000L
        } else {
            getActiveRunDuration()
        }
        
        // Only show distance/pace after user has moved at least 5 meters (filters GPS drift)
        val minDistanceMeters = 5.0
        val hasMovedEnough = totalDistance >= minDistanceMeters
        
        // Clamp distance to 0 if under threshold (filters GPS drift when stationary)
        val displayDistance = if (hasMovedEnough) totalDistance else 0.0
        // avgSpeed in km/h for pace calculation
        val displayDistanceKm = displayDistance / 1000.0
        val durationHours = duration / 3600000.0
        // During simulation, wall-clock time is compressed (~8 min for a 5km run), so distance/time
        // gives unrealistically fast avg speed. Use the average of simulated speed readings instead.
        val avgSpeed = if (isSimulating && speedReadingCount > 0) {
            ((speedReadingSum / speedReadingCount) * 3.6).toFloat() // m/s → km/h
        } else if (duration > 0 && hasMovedEnough && durationHours > 0) {
            (displayDistanceKm / durationHours).toFloat()
        } else 0f
        
        val phase = determinePhase(displayDistance / 1000.0, targetDistance?.let { it / 1000.0 })

        // Infer likely target distance for watch-initiated free runs that have no explicit target.
        // Must run before any final-stretch checks so the inferred value is available.
        maybeInferTargetDistance()
        
        // Reset per-tick flag - only one coaching trigger fires per location update
        hasCoachingFiredThisTick = false

        // ── DYNAMIC COACHING PLAN ENGINE (PRIMARY — rich reactive triggers) ──
        // Evaluates live HR/pace conditions against the AI-generated coaching plan.
        // Fires immediately when conditions are met — not on a timer.
        // Takes priority over all other coaching paths during coached sessions.
        if (dynamicCoachingPlan != null && !hasCoachingFiredThisTick) {
            // If targetDistance wasn't set via intent (e.g. watch-initiated run), fall back to
            // the distance declared in the coaching plan so that "remaining_m" conditions work.
            if (targetDistance == null) {
                val planDist = dynamicCoachingPlan?.targetMetrics?.totalDistanceKm
                if (planDist != null && planDist > 0) {
                    targetDistance = planDist * 1000.0
                    Log.d("RunTrackingService", "📏 targetDistance inferred from coaching plan: ${planDist}km")
                }
            }
            evaluateSessionConditionTriggers(displayDistanceKm)
        }

        // ── SESSION PHASE ENGINE (LEGACY — fires at_start / rep_start / rep_end) ──
        // Check if runner has entered a new session phase and fire coaching triggers.
        // Only runs when no dynamic plan is loaded (graceful fallback).
        if (sessionInstructions != null && dynamicCoachingPlan == null && !hasCoachingFiredThisTick) {
            checkSessionPhaseTransitions(displayDistanceKm)
        }

        // ── FINAL STRETCH GATE ──
        // In the last 500m, ONLY elite coaching fires (handles final_500m / final_100m motivation).
        // All analysis, summaries, HR, cadence, pace coaching, km splits are suppressed.
        val inFinalStretch = isInFinalStretch()
        
        if (!inFinalStretch) {
            // ── GENERIC PROMPTS GATE ──
            // Interval sessions (Tier 1): suppress all generic free-run prompts. The AI session
            // trigger plan owns all cueing — phase changes and HR timer would conflict with
            // structured rep/recovery coaching.
            //
            // Continuous coaching plan sessions (Tier 2) + Free runs: all generic prompts active.
            // 500m check-in, phase changes, and HR timer add value on sustained effort sessions.
            // Continuous plan sessions use reactive hr_zone triggers from the plan for HR-critical
            // cues, but the HR timer provides supplemental aerobic zone awareness.
            val allowGenericPrompts = !isCoachingPlanActive || !isIntervalTypeSession
            if (allowGenericPrompts) {
                checkPhaseChange(phase)

                if (!hasCoachingFiredThisTick) {
                    val now = System.currentTimeMillis()
                    val isInitial500m = last500mMilestone == 0
                    val timeSinceLastCoaching = now - lastGlobalCoachingTime
                    val hasTimeElapsed = timeSinceLastCoaching >= GLOBAL_COACHING_MIN_GAP_MS
                    if ((isInitial500m && hasTimeElapsed) || (!isInitial500m && canFireCoaching())) {
                        check500mMilestones()
                    }
                }

                // HR coaching timer — free runs and continuous plan sessions
                // (Interval sessions use reactive hr_zone triggers from the plan instead)
                if (!hasCoachingFiredThisTick && canFireCoaching()) {
                    maybeTriggerHeartRateCoaching()
                }
            }

            // Cadence/stride coaching — fires in free-run sessions only.
            // Suppressed for coaching plan sessions (handled inside maybeTriggerCadenceCoaching).
            if (!hasCoachingFiredThisTick && canFireCoaching()) {
                maybeTriggerCadenceCoaching()
            }
        }

        // Standard coaching triggers (elite coaching, final stretch motivation).
        //
        // Interval sessions (Tier 1): FULLY SUPPRESSED — the AI-generated session trigger plan
        // owns all cueing. Pace trend, technique, and ETA triggers are irrelevant mid-rep and
        // clash with the session's structured rep sequence.
        //
        // Continuous coaching plan sessions (Tier 2: tempo, long_run, threshold, race_pace):
        // Elite coaching fires alongside the session plan. Pace trend, positive reinforcement,
        // technique, elevation, and final stretch cues all add value on continuous efforts and
        // are non-conflicting with the session's milestone triggers.
        //
        // Free runs: Fully active — all elite coaching categories fire.
        if (!hasCoachingFiredThisTick && canFireCoaching() && (!isCoachingPlanActive || !isIntervalTypeSession)) {
            maybeFireEliteCoaching(displayDistance, duration, avgSpeed, phase)
        }
        
        _currentRunSession.value = RunSession(
            id = UUID.randomUUID().toString(),
            startTime = startTime,
            endTime = null,
            duration = duration,
            distance = displayDistance,
            averageSpeed = avgSpeed / 3.6f, // Convert km/h → m/s for consistent storage
            maxSpeed = if (hasMovedEnough) maxSpeed else 0f, // Already m/s from Location.speed
            averagePace = calculatePace(avgSpeed),
            currentPace = currentPace,
            calories = calculateCalories(displayDistance, duration),
            cadence = if (cadenceCount > 0) (cadenceSum / cadenceCount).toInt() else currentCadence,
            heartRate = currentHeartRate,
            routePoints = routePoints.toList(),
            kmSplits = addPartialKmSplitIfNeeded(),
            isStruggling = isStruggling,
            phase = phase,
            weatherAtStart = weatherAtStart,
            weatherAtEnd = null,
            totalElevationGain = if (hasMovedEnough) totalElevationGain else 0.0,
            totalElevationLoss = if (hasMovedEnough) totalElevationLoss else 0.0,
            averageGradient = if (hasMovedEnough) calculateAverageGradient() else 0f,
            maxGradient = if (hasMovedEnough) calculateMaxGradient() else 0f,
            terrainType = if (hasMovedEnough) determineTerrainType() else TerrainType.FLAT,
            routeHash = generateRouteHash(),
            routeName = null,
            externalSource = null, // Not synced from external source
            externalId = null,
            sessionType = currentActivityType,
            isActive = true,
            aiCoachingNotes = coachingHistory.toList(),
            strugglePoints = strugglePointsList.toList(),
            targetDistance = targetDistance?.let { it / 1000.0 }, // Convert metres → km for RunSession storage
            targetTime = targetTime,
            wasTargetAchieved = calculateWasTargetAchieved(),
            maxCadence = maxCadenceValue.takeIf { it > 0 },
            steepestIncline = if (hasMovedEnough) calculateSteepestIncline() else null,
            steepestDecline = if (hasMovedEnough) calculateSteepestDecline() else null,
            minElevation = if (hasMovedEnough) calculateMinElevation() else null,
            maxElevation = if (hasMovedEnough) calculateMaxElevation() else null,
            totalSteps = totalStepsDuringRun.takeIf { it > 0 },
            // Training plan coaching context (preserved from session start)
            linkedWorkoutId = planWorkoutId,
            linkedPlanId = planTrainingPlanId,
            planProgressWeek = planWeekNumber,
            planProgressWeeks = planTotalWeeks,
            workoutType = planWorkoutType,
            workoutIntensity = planWorkoutIntensity,
            workoutDescription = planWorkoutDescription,
            // ── Garmin watch device info ───────────────────────────────────────
            hasGarminData = hasGarminData,
            garminDeviceName = garminDeviceName,
            // ── Running Dynamics scalars (averaged / min / max over the run) ───
            avgGroundContactTime       = if (watchGctCount > 0) watchGctSum / watchGctCount else null,
            minGroundContactTime       = null,  // not separately tracked; use series min if needed
            maxGroundContactTime       = null,  // not separately tracked; use series max if needed
            avgGroundContactBalance    = if (watchGcbCount > 0) watchGcbSum / watchGcbCount else null,
            avgVerticalOscillation     = if (watchVoCount > 0) watchVoSum / watchVoCount else null,
            maxVerticalOscillation     = if (watchMaxVo > 0f) watchMaxVo else null,
            avgVerticalRatio           = if (watchVrCount > 0) watchVrSum / watchVrCount else null,
            minStrideLength            = if (watchMinSl > 0f) watchMinSl else null,
            maxStrideLength            = if (watchMaxSl > 0f) watchMaxSl else null,
            // ── Training Effect & Recovery ────────────────────────────────────
            aerobicTrainingEffect      = if (watchLatestAte > 0f) watchLatestAte else null,
            anaerobicTrainingEffect    = if (watchLatestAnAte > 0f) watchLatestAnAte else null,
            trainingEffectLabel        = null,  // derived server-side from TE value
            recoveryTimeMinutes        = if (watchLatestRecoveryMins > 0) watchLatestRecoveryMins else null,
            vo2MaxEstimate             = if (watchLatestVo2Max > 0f) watchLatestVo2Max else null,
            // ── Power & Respiration ───────────────────────────────────────────
            avgRunningPower            = if (watchPwrCount > 0) (watchPwrSum / watchPwrCount).toInt() else null,
            maxRunningPower            = if (watchMaxPwr > 0) watchMaxPwr else null,
            avgRespirationRate         = if (watchRespCount > 0) watchRespSum / watchRespCount else null,
            // ── Environmental ─────────────────────────────────────────────────
            avgAmbientPressure         = if (watchLatestPressure > 0f) watchLatestPressure else null,
            avgBearing                 = if (watchLatestBearing > 0f) watchLatestBearing else null,
            // ── Time-series arrays (one sample per watch frame, ~2 s interval) ─
            heartRateData              = watchHrSeries.takeIf { it.isNotEmpty() },
            cadenceData                = watchCadenceSeries.takeIf { it.isNotEmpty() },
            altitudeData               = watchAltSeries.takeIf { it.isNotEmpty() },
            paceData                   = watchPaceSeries.takeIf { it.isNotEmpty() },
            groundContactTimeData      = watchGctSeries.toList().takeIf { it.isNotEmpty() },
            groundContactBalanceData   = watchGcbSeries.toList().takeIf { it.isNotEmpty() },
            verticalOscillationData    = watchVoSeries.toList().takeIf { it.isNotEmpty() },
            verticalRatioData          = watchVrSeries.toList().takeIf { it.isNotEmpty() },
            strideLengthData           = watchSlSeries.toList().takeIf { it.isNotEmpty() },
            runningPowerData           = watchPwrSeries.toList().takeIf { it.isNotEmpty() },
            respirationRateData        = watchRespSeries.toList().takeIf { it.isNotEmpty() },
            bearingData                = watchBearingSeries.toList().takeIf { it.isNotEmpty() }
        )

        // ── Broadcast to Garmin watch (Scenario 2) ────────────────────────
        // Sends a lightweight runUpdate so the watch mirrors live metrics.
        // Skip when the run was started BY the watch — the watch already has its own
        // authoritative Activity.Info data (Garmin-filtered GPS, native timer).
        // Sending phone-recalculated metrics back would cause display jitter because
        // the phone's clock and distance differ from the Garmin firmware values.
        // No-ops gracefully if no watch is connected.
        try {
            val session = _currentRunSession.value
            if (session != null && garminWatchManager?.isWatchConnected?.value == true && !wasRunStartedByWatch) {
                val paceSeconds = parsePaceToSeconds(session.currentPace ?: "0:00")
                garminWatchManager?.sendRunUpdate(
                    paceSecPerKm   = paceSeconds,
                    distanceMetres = session.distance, // already in metres
                    heartRate      = session.heartRate ?: 0,
                    elapsedSeconds = (session.duration / 1000L),
                    cadence        = session.cadence ?: 0,
                    isRunning      = isTracking,
                    isPaused       = !isTracking && pauseStartTime > 0
                )
            }
        } catch (e: Exception) {
            // Non-fatal — watch broadcast should never break the run session
            Log.w("RunTrackingService", "Watch broadcast failed: ${e.message}")
        }

        // ── Live Session Sync (for observers) ────────────────────────────────
        // Push GPS position and metrics to the server so observers see real-time data.
        // Throttled to once every 5 seconds to avoid API overload.
        val liveSessionId = activeLiveSessionId
        if (!liveSessionId.isNullOrBlank() && isTracking) {
            val now = System.currentTimeMillis()
            if (now - lastLiveSessionSyncMs >= LIVE_SESSION_SYNC_INTERVAL_MS) {
                lastLiveSessionSyncMs = now
                val lastPoint = routePoints.lastOrNull()
                val distKm = totalDistance / 1000.0
                val elapsedSecs = (getActiveRunDuration() / 1000L).toInt()
                serviceScope.launch {
                    try {
                        apiService.syncLiveSession(
                            live.airuncoach.airuncoach.network.SyncLiveSessionRequest(
                                sessionId = liveSessionId,
                                currentLat = lastPoint?.latitude,
                                currentLng = lastPoint?.longitude,
                                distanceCovered = distKm,
                                elapsedTime = elapsedSecs,
                                currentPace = currentPace,
                                currentHeartRate = currentHeartRate.takeIf { it > 0 }
                            )
                        )
                        Log.d("RunTrackingService", "Live session synced: ${String.format("%.2f", distKm)}km, pace=$currentPace")
                    } catch (e: Exception) {
                        Log.w("RunTrackingService", "Live session sync failed (non-fatal): ${e.message}")
                    }
                }
            }
        }
    }

    /** Converts "M:SS" pace string → seconds/km (e.g. "4:32" → 272.0) */
    private fun parsePaceToSeconds(pace: String): Double {
        return try {
            val parts = pace.split(":")
            if (parts.size == 2) parts[0].toInt() * 60.0 + parts[1].toInt() else 0.0
        } catch (e: Exception) { 0.0 }
    }

    private fun calculateAverageGradient(): Float = if (totalDistance == 0.0) 0f else ((totalElevationGain - totalElevationLoss) / totalDistance * 100).toFloat()
    
    private fun calculateMaxGradient(): Float = (1 until routePoints.size).mapNotNull { i-> val p1=routePoints[i-1]; val p2=routePoints[i]; if(p1.altitude!=null&&p2.altitude!=null) { val d=calculateDistance(p1,p2); if(d>0) ((p2.altitude-p1.altitude)/d * 100).toFloat() else null } else null }.maxOrNull() ?: 0f
    
    /** Steepest uphill gradient (positive %) across all consecutive point pairs */
    private fun calculateSteepestIncline(): Float = (1 until routePoints.size).mapNotNull { i ->
        val p1 = routePoints[i - 1]; val p2 = routePoints[i]
        if (p1.altitude != null && p2.altitude != null) {
            val d = calculateDistance(p1, p2)
            if (d > 2) ((p2.altitude - p1.altitude) / d * 100).toFloat() else null // min 2m to avoid noise
        } else null
    }.filter { it > 0 }.maxOrNull() ?: 0f
    
    /** Steepest downhill gradient (positive % — magnitude of descent) across all consecutive point pairs */
    private fun calculateSteepestDecline(): Float = (1 until routePoints.size).mapNotNull { i ->
        val p1 = routePoints[i - 1]; val p2 = routePoints[i]
        if (p1.altitude != null && p2.altitude != null) {
            val d = calculateDistance(p1, p2)
            if (d > 2) ((p1.altitude - p2.altitude) / d * 100).toFloat() else null // inverted: positive = downhill
        } else null
    }.filter { it > 0 }.maxOrNull() ?: 0f
    
    /** Minimum elevation (lowest point) during the run */
    private fun calculateMinElevation(): Double? {
        return routePoints.mapNotNull { it.altitude }.minOrNull()
    }
    
    /** Maximum elevation (highest point) during the run */
    private fun calculateMaxElevation(): Double? {
        return routePoints.mapNotNull { it.altitude }.maxOrNull()
    }
    
    /**
     * Classify terrain using elevation RANGE per km (max - min across all GPS points).
     *
     * Why NOT avgGradient: on any loop/parkrun course the runner starts and finishes at nearly the
     * same altitude, so the net gradient is ~0% → always "FLAT" even on a 40m rolling course.
     *
     * Elevation range per km reflects undulation regardless of whether the course is a loop or out-and-back:
     *   < 5 m/km  → Flat
     *   5–20 m/km → Rolling   (e.g. parkrun with 40m range over 5km = 8 m/km)
     *   20–50 m/km → Hilly
     *   > 50 m/km → Mountainous
     */
    private fun determineTerrainType(): TerrainType {
        val distanceKm = (totalDistance / 1000.0).coerceAtLeast(0.1)
        val minElev = calculateMinElevation()
        val maxElev = calculateMaxElevation()
        if (minElev == null || maxElev == null || maxElev <= minElev) return TerrainType.FLAT
        val elevRangePerKm = (maxElev - minElev) / distanceKm
        return when {
            elevRangePerKm < 5.0  -> TerrainType.FLAT
            elevRangePerKm < 20.0 -> TerrainType.ROLLING
            elevRangePerKm < 50.0 -> TerrainType.HILLY
            else                  -> TerrainType.MOUNTAINOUS
        }
    }
    
    private fun generateRouteHash(): String = MessageDigest.getInstance("MD5").digest(routePoints.joinToString(",") { "${String.format("%.4f", it.latitude)},${String.format("%.4f", it.longitude)}" }.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun calculatePace(speedKmh: Float): String {
        // Below 2 km/h (~30 min/km) the runner is effectively stationary — GPS drift
        // at typical phone accuracy (5-15m) at any update rate produces speeds in the
        // 0.01-1 km/h range, creating absurd "1433:25 min/km" displays.
        // 2 km/h = 30 min/km cap — slower than a brisk walk, safe upper bound.
        if (speedKmh <= 0 || speedKmh < 2.0f) return "0:00"
        val paceMinPerKm = 60.0 / speedKmh
        val minutes = paceMinPerKm.toInt()
        val seconds = ((paceMinPerKm - minutes) * 60).toInt()
        return "${minutes}:${String.format("%02d", seconds)}"
    }

    private fun calculateCalories(distMeters: Double, durationMillis: Long): Int = (70 * (distMeters / 1000.0)).toInt()

    /**
     * Build per-km elevation summaries by scanning route points.
     * For each km split, computes total gain, loss, and average gradient.
     */
    private fun buildKmSplitElevations(): List<KmSplitElevation> {
        if (routePoints.size < 2 || kmSplits.isEmpty()) return emptyList()
        val results = mutableListOf<KmSplitElevation>()
        var cumulativeDistance = 0.0
        var currentKm = 1
        var kmGain = 0.0
        var kmLoss = 0.0
        var kmDistance = 0.0

        for (i in 1 until routePoints.size) {
            val prev = routePoints[i - 1]
            val curr = routePoints[i]
            val segDist = calculateDistance(prev, curr)
            cumulativeDistance += segDist
            kmDistance += segDist

            if (prev.altitude != null && curr.altitude != null) {
                val elevChange = curr.altitude - prev.altitude
                if (elevChange > 0) kmGain += elevChange
                else kmLoss += abs(elevChange)
            }

            // When we cross into the next km
            if (cumulativeDistance >= currentKm * 1000.0) {
                val split = kmSplits.getOrNull(currentKm - 1)
                if (split != null) {
                    val avgGrade = if (kmDistance > 0) ((kmGain - kmLoss) / kmDistance * 100) else 0.0
                    results.add(KmSplitElevation(
                        km = currentKm,
                        pace = split.pace,
                        elevGain = kmGain.toInt(),
                        elevLoss = kmLoss.toInt(),
                        avgGrade = avgGrade
                    ))
                }
                currentKm++
                kmGain = 0.0
                kmLoss = 0.0
                kmDistance = 0.0
            }
        }
        return results
    }

    private fun updateNotification() {
        val s = _currentRunSession.value
        // Title respects the user's chosen activity type (walk vs run)
        val title = if (currentActivityType == "walk") "Walk in progress" else "Run in progress"
        // Keep current and average pace explicitly separate: current pace can be
        // unavailable while stopped or while GPS is settling, whereas average pace
        // remains valid once the session has distance and elapsed time.
        val livePace = s?.currentPace
        val currentPace = if (!livePace.isNullOrBlank() && livePace != "0:00" && livePace != "–") {
            livePace
        } else {
            "--"
        }
        val averagePace = s?.averagePace?.takeUnless { it == "0:00" } ?: "--"
        notificationManager.notify(
            NOTIFICATION_ID,
            createNotification(
                title,
                String.format("D: %.2f km | P: %s/km | Avg: %s/km | T: %s",
                    s?.getDistanceInKm() ?: 0.0,
                    currentPace,
                    averagePace,
                    s?.getFormattedDuration() ?: "00:00:00"
                )
            )
        )
    }

    private fun calculateWasTargetAchieved(): Boolean? {
        if (targetDistance == null && targetTime == null) return null
        
        val achievedDistance = (targetDistance != null && totalDistance >= targetDistance!! - 100.0) // Allow 100m margin
        val achievedTime = (targetTime != null && (getActiveRunDuration()) <= targetTime!!)
        
        return if (targetDistance != null && targetTime != null) {
            achievedDistance && achievedTime
        } else if (targetDistance != null) {
            achievedDistance
        } else {
            achievedTime
        }
    }

    // Timer handler for updating session every second
    private val timerHandler = Handler(Looper.getMainLooper())
    private var timerRunnable: Runnable? = null
    
    private fun startTimer() {
        timerRunnable = object : Runnable {
            override fun run() {
                if (!isTracking) {
                    Log.d("RunTrackingService", "Timer stopped - not tracking")
                    return
                }
                
                try {
                    // Update the run session every second regardless of location
                    updateRunSession()
                    
                    // Schedule next update in 1 second
                    timerHandler.postDelayed(this, 1000)
                } catch (e: Exception) {
                    Log.e("RunTrackingService", "Timer update failed", e)
                }
            }
        }
        timerHandler.post(timerRunnable!!)
        Log.d("RunTrackingService", "Timer started")
    }
    
    private fun stopTimer() {
        timerRunnable?.let {
            timerHandler.removeCallbacks(it)
        }
        Log.d("RunTrackingService", "Timer stopped")
    }

    private fun pauseTracking() { 
        isTracking = false
        pauseStartTime = System.currentTimeMillis()  // Record when pause started
        stopTimer()  // Stop timer when paused
        fusedLocationClient.removeLocationUpdates(locationCallback)
        sensorManager.unregisterListener(this)
        // Discard the partial phone elevation window — comparing across a pause gap would give
        // a false elevation change equal to the altitude difference at the pause/resume points.
        phoneElevBuffer.clear()
        prevPhoneElevWindowMean = null
        updateNotification()
        Log.d("RunTrackingService", "Paused at ${pauseStartTime}ms, totalPausedMs so far: ${totalPausedMs}")
    }

    private fun resumeTracking() { 
        isTracking = true
        // Accumulate the paused duration
        if (pauseStartTime > 0) {
            val thisPauseDuration = System.currentTimeMillis() - pauseStartTime
            totalPausedMs += thisPauseDuration
            splitPausedMs += thisPauseDuration  // Track pause within current km split
            Log.d("RunTrackingService", "Resumed after ${thisPauseDuration}ms pause, totalPausedMs: ${totalPausedMs}")
            pauseStartTime = 0
        }
        startTimer()  // Restart timer when resuming
        requestLocationUpdates()
        startSensorTracking()
    }

    /**
     * Get the actual active running duration, excluding all paused time.
     * Use this instead of raw (System.currentTimeMillis() - startTime) everywhere.
     */
    private fun getActiveRunDuration(): Long {
        val totalElapsed = System.currentTimeMillis() - startTime
        return totalElapsed - totalPausedMs
    }

    private fun stopTracking() {
        isTracking = false
        isSimulating = false
        // Clear live session ID so no more syncs fire after the run ends
        activeLiveSessionId = null
        lastLiveSessionSyncMs = 0L
        // Snapshot BEFORE resetting — used below to decide whether to skip the phone upload.
        // The watch calls session/end (creating a run record) only when it was disconnected at
        // run end.  If the watch was connected, the phone's upload is the sole record.
        // If the watch was disconnected, the phone may have also been tracking (the "start"
        // command was delivered early), which would produce a duplicate — the snapshot lets us
        // avoid that.
        val watchInitiatedRun = wasRunStartedByWatch
        wasRunStartedByWatch = false   // Reset for next run
        lastWatchGpsMs = 0L            // Reset so phone GPS works normally after session ends
        _isServiceRunning.value = false
        
        // Stop GPS, sensors, and timer
        fusedLocationClient.removeLocationUpdates(locationCallback)
        sensorManager.unregisterListener(this)
        stopTimer()
        
        Log.d("RunTrackingService", "Stopped all tracking")

        // Immediately notify the watch that the session has ended.
        // This MUST happen before the upload coroutine starts so the watch stops
        // sending "pause"/"resume" commands and exits the run screen right away.
        // Without this, in-flight runUpdate(isRunning=true) messages arrive after
        // finishRun() on the watch and trap it in a pause/start loop.
        try {
            if (garminWatchManager?.isWatchConnected?.value == true) {
                Log.d("RunTrackingService", "⌚ Sending sessionEnded to watch immediately on stop")
                garminWatchManager?.sendSessionEnded()
            }
        } catch (e: Exception) {
            Log.w("RunTrackingService", "sessionEnded early notify failed (non-fatal): ${e.message}")
        }

        // Create a separate coroutine scope that won't be cancelled immediately
        val uploadScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        
        uploadScope.launch {
            coroutineScope {
                try {
                    // Get end weather and finalize run. Non-fatal: mirrors the guard already
                    // used around the start-of-run fetch (weatherAtStart, above) — if this call
                    // throws (network hiccup, location unavailable, etc.) the run must still
                    // finalize/upload/navigate. An unguarded throw here previously aborted this
                    // whole block silently: _currentRunSession never flipped to isActive=false,
                    // uploadRunToBackend() never ran, and _uploadComplete never fired — leaving
                    // RunSessionScreen's navigation LaunchedEffect waiting forever. The visible
                    // symptom was the phone's timer freezing (stopTimer() already ran above,
                    // synchronously) while the screen never advanced to the run summary.
                    try {
                        weatherAtEnd = weatherRepository.getCurrentWeather()
                    } catch (e: Exception) {
                        Log.w("RunTrackingService", "Failed to fetch end weather (non-fatal): ${e.message}")
                    }
                    _currentRunSession.value?.let { session ->
                        // If the run was stopped while paused, pauseStartTime is still set but
                        // hasn't been added to totalPausedMs yet (that only happens in resumeTracking).
                        // Account for it now so the final active duration is correct.
                        val finalPausedMs = if (pauseStartTime > 0) {
                            totalPausedMs + (System.currentTimeMillis() - pauseStartTime)
                        } else {
                            totalPausedMs
                        }
                        // Guard: if startTime == 0 this service instance was restarted (e.g. Android
                        // OS killed the old instance mid-pause, and the user pressed Stop on the phone
                        // which delivered ACTION_STOP_TRACKING to a fresh instance).  The companion-
                        // object _currentRunSession may still hold valid GPS data from the old
                        // instance, but the instance variables (startTime, pauseStartTime,
                        // totalPausedMs) have been reset to 0.  Computing (currentTimeMillis - 0)
                        // would produce a duration equal to the Unix epoch timestamp (~496 hours),
                        // which is the bug that caused the incorrect "496:03:33" display.
                        //
                        // Fallback: use the session's last known duration which was correctly computed
                        // by the previous instance's timer (watchElapsedSeconds * 1000 or
                        // getActiveRunDuration()).  This preserves the user's true run time.
                        val finalDurationMs = if (startTime > 0L) {
                            (System.currentTimeMillis() - startTime) - finalPausedMs
                        } else {
                            Log.w("RunTrackingService", "stopTracking: startTime=0 — service was restarted, falling back to session.duration=${session.duration}ms")
                            session.duration.coerceAtLeast(0L)
                        }

                        // Snapshot coachingHistory HERE (after the async weather call) so we catch
                        // any live-trigger coroutines that resolved during the weather fetch.
                        // This is the definitive source of truth — RunSession.aiCoachingNotes is
                        // rebuilt from GPS ticks so may lag by up to one tick (~3-5 s).
                        val finalCoachingNotes = coachingHistory.toList()

                        val finalSession = session.copy(
                            endTime = System.currentTimeMillis(),
                            duration = finalDurationMs.coerceAtLeast(0L),
                            weatherAtEnd = weatherAtEnd,
                            isActive = false,
                            aiCoachingNotes = finalCoachingNotes
                        )
                        _currentRunSession.value = finalSession

                        // Always upload from the phone.  The previous logic skipped the phone
                        // upload when (watchInitiatedRun && watch now disconnected), assuming the
                        // watch had called session/end and owned the record.  This was WRONG when
                        // the watch battery died mid-run — the watch never called session/end, so
                        // the phone's skip left the run with NO record in the database.
                        //
                        // The server's POST /api/runs endpoint now has a deduplication guard that
                        // catches any legitimate duplicate created by the Garmin companion
                        // session/end path: it checks for an existing Garmin-companion run for
                        // this user with a similar distance and returns it rather than inserting
                        // a second record.  The server is therefore the authoritative dedup layer.
                        uploadRunToBackend(finalSession)
                    }
                } catch (e: Exception) {
                    // Safety net: any other unexpected failure while finalizing/uploading must
                    // not leave the phone screen stuck forever waiting for a navigation signal
                    // that will never come. Mark the session inactive and surface a local ID so
                    // RunSessionScreen can still navigate — the sync queue / server dedup guard
                    // reconciles the record later if the upload itself didn't complete.
                    Log.e("RunTrackingService", "stopTracking: unexpected error finalizing/uploading run — navigating with local ID as fallback", e)
                    _currentRunSession.value = _currentRunSession.value?.copy(isActive = false)
                    _uploadComplete.value = _currentRunSession.value?.id
                } finally {
                    // Only stop the service after upload completes or fails
                    releaseWakeLock()
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
        }
    }
    
    private suspend fun uploadRunToBackend(runSession: RunSession) {
        // Compute true average HR from accumulated samples (not just the last reading)
        val computedAvgHR = if (heartRateSampleCount > 0)
            (heartRateSum / heartRateSampleCount).toInt()
        else if (runSession.heartRate > 0) runSession.heartRate  // Fallback to last reading
        else null

        // Detect if run was completed on the Garmin watch (watch was connected)
        // NOTE: Snapshot the state atomically to avoid TOCTOU race condition where watch disconnects between checks
        val isWatchRun = garminWatchManager?.isWatchConnected?.value == true
        val deviceName = if (isWatchRun) {
            try {
                garminWatchManager?.getConnectedDeviceName()
            } catch (e: Exception) {
                Log.w("RunTrackingService", "Failed to get connected device name (watch may have disconnected): ${e.message}")
                null
            }
        } else null

        val uploadRequest = UploadRunRequest(
            routeId = null, // TODO: Add if user selected a saved route
            startTime = runSession.startTime,
            sessionType = currentActivityType,
            distance = runSession.distance / 1000.0, // Convert meters to km
            duration = runSession.duration,
            avgPace = runSession.averagePace ?: "0:00",
            avgHeartRate = computedAvgHR,
            maxHeartRate = if (maxHeartRate > 0) maxHeartRate else null,
            minHeartRate = minHeartRate.takeIf { it > 0 },
            calories = runSession.calories,
            cadence = if (runSession.cadence > 0) runSession.cadence else null,
            maxCadence = runSession.maxCadence,
            elevation = runSession.totalElevationGain,
            difficulty = when {
                runSession.totalElevationGain > 200 -> "hard"
                runSession.totalElevationGain > 100 -> "moderate"
                else -> "easy"
            },
            startLat = runSession.routePoints.firstOrNull()?.latitude ?: 0.0,
            startLng = runSession.routePoints.firstOrNull()?.longitude ?: 0.0,
            gpsTrack = runSession.routePoints,
            completedAt = System.currentTimeMillis(),
            elevationGain = runSession.totalElevationGain,
            elevationLoss = runSession.totalElevationLoss,
            tss = 0, // Backend will calculate
            gap = null, // Backend will calculate
            isPublic = true,
            kmSplits = runSession.kmSplits,
            terrainType = (runSession.terrainType ?: TerrainType.FLAT).name.lowercase(),
            userComments = null,
            // Run goals - target tracking
            targetDistance = targetDistance?.let { it / 1000.0 }, // Convert metres → km for upload
            targetTime = targetTime,
            wasTargetAchieved = calculateWasTargetAchieved(),
            aiCoachEnabled = aiCoachEnabledForSession,
            // Struggle points detected during the run
            strugglePoints = runSession.strugglePoints,
            // AI coaching notes from the run
            aiCoachingNotes = runSession.aiCoachingNotes.ifEmpty { null },
            // Extended elevation metrics
            maxInclinePercent = runSession.steepestIncline,
            maxDeclinePercent = runSession.steepestDecline,
            minElevation = runSession.minElevation,
            maxElevation = runSession.maxElevation,
            // Additional metrics
            totalSteps = runSession.totalSteps
                ?: ((runSession.cadence * (runSession.duration / 60_000.0)).toInt()).takeIf { it > 0 },
            activeCalories = runSession.activeCalories,
            avgSpeed = runSession.averageSpeed.takeIf { it > 0f },
            maxSpeed = runSession.maxSpeed,
            movingTime = runSession.movingTime ?: (runSession.duration / 1000),
            elapsedTime = runSession.elapsedTime ?: (runSession.duration / 1000),
            avgStrideLength = runSession.avgStrideLength,
            // Weather at start — persisted for weather impact analysis
            weatherData = runSession.weatherAtStart,
            // Training plan coaching context — persisted so post-run AI analysis is plan-aware
            linkedWorkoutId = runSession.linkedWorkoutId,
            linkedPlanId = runSession.linkedPlanId,
            planProgressWeek = runSession.planProgressWeek,
            planProgressWeeks = runSession.planProgressWeeks,
            workoutType = runSession.workoutType,
            workoutIntensity = runSession.workoutIntensity,
            workoutDescription = runSession.workoutDescription,
            // Group run context if this run is part of a group
            groupRunId = groupRunId,
            // Mark as Garmin data if run was completed on the watch
            hasGarminData = hasGarminData || isWatchRun,
            garminDeviceName = garminDeviceName ?: deviceName,
            // ── Running Dynamics (averaged over the full run from watch frames) ──
            avgGroundContactTime     = if (watchGctCount > 0) watchGctSum / watchGctCount else null,
            minGroundContactTime     = null, // tracked per-frame; server derives min from time-series
            maxGroundContactTime     = null,
            avgGroundContactBalance  = if (watchGcbCount > 0) watchGcbSum / watchGcbCount else null,
            avgVerticalOscillation   = if (watchVoCount > 0) watchVoSum / watchVoCount else null,
            maxVerticalOscillation   = if (watchMaxVo > 0f) watchMaxVo else null,
            avgVerticalRatio         = if (watchVrCount > 0) watchVrSum / watchVrCount else null,
            minStrideLength          = if (watchMinSl > 0f) watchMinSl else null,
            maxStrideLength          = if (watchMaxSl > 0f) watchMaxSl else null,
            // ── Training Effect & Recovery ─────────────────────────────────────
            aerobicTrainingEffect    = if (watchLatestAte > 0f) watchLatestAte else null,
            anaerobicTrainingEffect  = if (watchLatestAnAte > 0f) watchLatestAnAte else null,
            recoveryTimeMinutes      = if (watchLatestRecoveryMins > 0) watchLatestRecoveryMins else null,
            vo2MaxEstimate           = if (watchLatestVo2Max > 0f) watchLatestVo2Max else null,
            // ── Power & Respiration (device-dependent) ─────────────────────────
            avgRunningPower          = if (watchPwrCount > 0) (watchPwrSum / watchPwrCount).toInt() else null,
            maxRunningPower          = if (watchMaxPwr > 0) watchMaxPwr else null,
            avgRespirationRate       = if (watchRespCount > 0) watchRespSum / watchRespCount else null,
            // ── Environmental ──────────────────────────────────────────────────
            avgAmbientPressure       = if (watchLatestPressure > 0f) watchLatestPressure else null,
            avgBearing               = if (watchLatestBearing > 0f) watchLatestBearing else null,
            // ── Time-series arrays for graphs ────────────────────────────────
            heartRateData            = watchHrSeries.takeIf { it.isNotEmpty() },
            cadenceData              = watchCadenceSeries.takeIf { it.isNotEmpty() },
            altitudeData             = watchAltSeries.takeIf { it.isNotEmpty() },
            paceData                 = watchPaceSeries.takeIf { it.isNotEmpty() },
            groundContactTimeData    = watchGctSeries.takeIf { it.isNotEmpty() },
            groundContactBalanceData = watchGcbSeries.takeIf { it.isNotEmpty() },
            verticalOscillationData  = watchVoSeries.takeIf { it.isNotEmpty() },
            verticalRatioData        = watchVrSeries.takeIf { it.isNotEmpty() },
            strideLengthData         = watchSlSeries.takeIf { it.isNotEmpty() },
            runningPowerData         = watchPwrSeries.takeIf { it.isNotEmpty() },
            respirationRateData      = watchRespSeries.takeIf { it.isNotEmpty() },
            bearingData              = watchBearingSeries.takeIf { it.isNotEmpty() },
            minCadence               = minCadenceValue.takeIf { it > 0 },
            avgHeartRateZone         = if (watchZoneSampleCount > 0) watchZoneSum / watchZoneSampleCount else null,
            timeInZone1              = watchZoneSeconds[1].takeIf { it > 0 },
            timeInZone2              = watchZoneSeconds[2].takeIf { it > 0 },
            timeInZone3              = watchZoneSeconds[3].takeIf { it > 0 },
            timeInZone4              = watchZoneSeconds[4].takeIf { it > 0 },
            timeInZone5              = watchZoneSeconds[5].takeIf { it > 0 },
            stepsData                = watchStepsSeries.takeIf { it.isNotEmpty() },
            minPace                  = watchMinPace.takeIf { it > 0.0 },
            maxPace                  = watchMaxPace.takeIf { it > 0.0 },
            avgGpsAccuracy           = if (watchGpsAccuracyCount > 0) watchGpsAccuracySum / watchGpsAccuracyCount else null,
            worstGpsAccuracy         = watchGpsAccuracyWorst.takeIf { it > 0f },
            // Power saver mode telemetry — if phone's power saver was active during this run
            powerSaverModeDetected   = powerSaverModeDetected,
        )

        // Retry up to 3 times with exponential backoff for server errors
        val maxRetries = 3
        var lastException: Exception? = null

        for (attempt in 1..maxRetries) {
            try {
                val response = apiService.uploadRun(uploadRequest)
                Log.d("RunTrackingService", "Run uploaded successfully (attempt $attempt): ${response.id}")
                
                // Update the run session with the backend ID
                _currentRunSession.value = _currentRunSession.value?.copy(id = response.id)
                _uploadComplete.value = response.id
                // Register local → server ID mapping so RunSummaryViewModel can resolve
                // any 404 that occurred if navigation happened before the upload completed.
                recordRunIdMapping(runSession.id, response.id)
                
                // Update running metrics baselines with this run's data (for personalization)
                // This ensures future coaching uses this runner's actual performance baselines, not generic defaults
                updateRunningMetricsBaselines(runSession)
                
                // Auto-upload to Garmin Connect if enabled
                tryAutoUploadToGarmin(response.id)
                return // Success - exit

            } catch (e: HttpException) {
                lastException = e
                when {
                    e.code() == 401 -> {
                        // Auth error - no point retrying
                        Log.e("RunTrackingService", "❌ 401 Unauthorized - run not uploaded (session expired)")
                        _uploadComplete.value = runSession.id
                        return
                    }
                    e.code() in 400..499 -> {
                        // Client error - no point retrying
                        Log.e("RunTrackingService", "HTTP ${e.code()} client error uploading run: ${e.message()}")
                        _uploadComplete.value = runSession.id
                        return
                    }
                    e.code() >= 500 && attempt < maxRetries -> {
                        // Server error - retry with backoff
                        val delayMs = (attempt * 2000).toLong()
                        Log.w("RunTrackingService", "HTTP ${e.code()} server error (attempt $attempt/$maxRetries), retrying in ${delayMs}ms...")
                        delay(delayMs)
                    }
                    else -> {
                        Log.e("RunTrackingService", "HTTP ${e.code()} error after $maxRetries attempts")
                    }
                }
            } catch (e: Exception) {
                lastException = e
                if (attempt < maxRetries) {
                    val delayMs = (attempt * 2000).toLong()
                    Log.w("RunTrackingService", "Upload failed (attempt $attempt/$maxRetries): ${e.message}, retrying in ${delayMs}ms...")
                    delay(delayMs)
                } else {
                    Log.e("RunTrackingService", "Failed to upload run after $maxRetries attempts", e)
                }
            }
        }

        // All retries exhausted - queue for background retry
        Log.e("RunTrackingService", "Upload failed after $maxRetries retries, queuing for background sync", lastException)
        
        // Add to sync queue for persistent retry
        try {
            syncQueue.addPendingRun(runSession)
            Log.d("RunTrackingService", "✅ Run ${runSession.id} queued for background sync")
            // Trigger immediate sync attempt
            SyncWorker.triggerImmediateSync(this)
        } catch (e: Exception) {
            Log.e("RunTrackingService", "Failed to queue run for sync: ${e.message}")
        }
        
        _uploadComplete.value = runSession.id
    }

    /**
     * Auto-upload run to Garmin Connect if user has auto-sync enabled
     * Silent background operation - doesn't interrupt user if it fails
     */
    /**
     * Update running metrics baselines with data from this run.
     * Ensures all future coaching uses personalized thresholds based on actual user performance.
     * NOT hardcoded defaults.
     *
     * Uses exponential moving average: baseline = 0.8 * old + 0.2 * new
     * This prevents single outlier runs from skewing benchmarks while allowing gradual adaptation.
     */
    private fun updateRunningMetricsBaselines(runSession: RunSession) {
        try {
            val config = live.airuncoach.airuncoach.config.RunningMetricsConfig(this)
            
            // Calculate power-to-pace ratio if we have both metrics
            val powerToPaceRatio = if (runSession.avgRunningPower != null && 
                runSession.avgRunningPower > 0 && 
                runSession.avgSpeed != null && 
                runSession.avgSpeed > 0) {
                (runSession.avgRunningPower / (runSession.avgSpeed * 3.6f)).coerceIn(0f, 1000f)
            } else null
            
            // Update all baselines with this run's data
            config.updateBaselinesFromRun(
                gctAvg = runSession.avgGroundContactTime,
                voAvg = runSession.avgVerticalOscillation,
                vrAvg = runSession.avgVerticalRatio,
                slAvg = runSession.avgStrideLength,
                powerToPaceRatio = powerToPaceRatio
            )
            
            Log.d("RunTrackingService", "✅ Updated running metrics baselines from run")
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Failed to update running metrics baselines: ${e.message}")
            // Non-critical - don't fail the run upload if this fails
        }
    }

    /**
     * Posts a local notification letting the user know their Garmin watch
     * is authenticated, GPS is locked, and the run session is ready to start.
     * Tapping the notification deep-links into the app.
     */
    @android.annotation.SuppressLint("MissingPermission")
    private fun postWatchSessionReadyNotification() {
        try {
            val channelId = "garmin_session_ready"
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

            // Ensure channel exists
            if (nm.getNotificationChannel(channelId) == null) {
                nm.createNotificationChannel(
                    android.app.NotificationChannel(
                        channelId,
                        "Garmin Watch Ready",
                        android.app.NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "Alerts when your Garmin watch is ready to start a run"
                        enableVibration(true)
                    }
                )
            }

            val intent = android.content.Intent(this, live.airuncoach.airuncoach.MainActivity::class.java).apply {
                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("deeplink_destination", "dashboard")
            }
            val pendingIntent = android.app.PendingIntent.getActivity(
                this,
                "session_ready".hashCode(),
                intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            val notification = androidx.core.app.NotificationCompat.Builder(this, channelId)
                .setContentTitle("⌚ Watch Ready")
                .setContentText("Your Garmin watch is connected and GPS is locked. Press START on your watch to begin.")
                .setSmallIcon(R.drawable.notification_icon)
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()

            nm.notify(NOTIF_ID_WATCH_SESSION_READY, notification)
            Log.d("RunTrackingService", "⌚ Session ready notification posted")
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Failed to post session ready notification: ${e.message}")
        }
    }

    /**
     * Posts a heads-up notification confirming that the phone has started recording in response
     * to a watch "start" command.  This lets the user know the phone is actively tracking even
     * when the screen is locked and the AI Run Coach app is not visible.
     */
    private fun postWatchRunStartedNotification() {
        try {
            val channelId = "garmin_run_started"
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            val isWalk = currentActivityType == "walk"

            // Channel name/description are set once at creation and persist in system settings
            // regardless of activity type on any later session, so keep them activity-neutral —
            // only the per-notification title/text below vary per session.
            if (nm.getNotificationChannel(channelId) == null) {
                nm.createNotificationChannel(
                    android.app.NotificationChannel(
                        channelId,
                        "Watch Session Started",
                        android.app.NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "Confirms the phone started recording when your watch started a session"
                        enableVibration(true)
                    }
                )
            }

            val tapIntent = android.content.Intent(this, live.airuncoach.airuncoach.MainActivity::class.java).apply {
                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = android.app.PendingIntent.getActivity(
                this,
                NOTIF_ID_WATCH_RUN_STARTED,
                tapIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            val notification = androidx.core.app.NotificationCompat.Builder(this, channelId)
                .setContentTitle(if (isWalk) "🚶 Walk Started" else "🏃 Run Started")
                .setContentText(if (isWalk) "Your phone is recording. Enjoy your walk!" else "Your phone is recording. Enjoy your run!")
                .setSmallIcon(R.drawable.notification_icon)
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()

            nm.notify(NOTIF_ID_WATCH_RUN_STARTED, notification)
            Log.d("RunTrackingService", "⌚ Session started notification posted")
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Failed to post run started notification: ${e.message}")
        }
    }

    private suspend fun tryAutoUploadToGarmin(runId: String) {
        try {
            // Check if auto-sync is enabled
            val userPreferences = UserPreferences(this)
            val autoSyncEnabled = userPreferences.autoSyncToGarmin.first()
            
            if (!autoSyncEnabled) {
                Log.d("GarminSync", "Auto-sync disabled, skipping upload")
                return
            }
            
            // Check if user has Garmin connected
            val connectedDevices = apiService.getConnectedDevices()
            val hasGarmin = connectedDevices.any { it.deviceType == "garmin" && it.isActive }
            
            if (!hasGarmin) {
                Log.d("GarminSync", "No Garmin device connected, skipping upload")
                return
            }
            
            // Upload to Garmin in background.
            // Pass linkedWorkoutId and linkedPlanId so the backend Garmin webhook handler
            // can preserve the plan link if it creates or updates a run from the official
            // Garmin activity — prevents the webhook from wiping planned_workout_id.
            Log.d("GarminSync", "Auto-uploading run $runId to Garmin Connect (workout=$planWorkoutId)...")
            val response = apiService.uploadRunToGarmin(
                GarminUploadRequest(
                    runId = runId,
                    linkedWorkoutId = planWorkoutId,
                    linkedPlanId = planTrainingPlanId
                )
            )
            
            if (response.success) {
                Log.d("GarminSync", "✅ Run synced to Garmin: ${response.garminActivityId}")
            } else {
                Log.w("GarminSync", "⚠️ Upload response not successful: ${response.message}")
            }
            
        } catch (e: Exception) {
            // Silent failure - log only, don't interrupt user
            Log.e("GarminSync", "Failed to auto-upload to Garmin (silent failure): ${e.message}")
        }
    }

    private fun createNotificationChannel() { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) { val c = NotificationChannel(CHANNEL_ID, "Run Tracking", NotificationManager.IMPORTANCE_LOW).apply { description="Notifications for active run tracking"; setShowBadge(false) }; notificationManager.createNotificationChannel(c) } }

    private fun createNotification(title: String, content: String): Notification {
        // Include extra flag to tell MainActivity this is an active run
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra(EXTRA_ACTIVE_RUN, true)
        }
        val pIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Builder(this, CHANNEL_ID).setContentTitle(title).setContentText(content).setSmallIcon(R.drawable.notification_icon).setContentIntent(pIntent).setOngoing(true).setCategory(NotificationCompat.CATEGORY_WORKOUT).setPriority(NotificationCompat.PRIORITY_LOW).build()
    }

    private fun releaseWakeLock() { wakeLock?.takeIf{it.isHeld}?.release(); wakeLock=null }

    // ────────────────────────────────────────────────────────────────────────────────
    // POWER SAVER MODE DETECTION & HANDLING
    // ────────────────────────────────────────────────────────────────────────────────
    /**
     * Register a broadcast receiver to monitor power saver mode changes during a run.
     * Power saver mode throttles GPS updates and sensors, which directly impacts tracking
     * accuracy. We detect this state, log it for telemetry, and ensure location requests
     * remain HIGH_ACCURACY to override any system throttling.
     */
    private fun registerPowerSaverModeReceiver() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                powerSaverStatusBroadcastReceiver = object : BroadcastReceiver() {
                    override fun onReceive(context: Context?, intent: Intent?) {
                        if (intent?.action == PowerManager.ACTION_POWER_SAVE_MODE_CHANGED) {
                            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                            isPhonePowerSaverActive = powerManager.isPowerSaveMode
                            // Push to companion StateFlow so the UI can observe it live
                            _isPowerSaverActive.value = isPhonePowerSaverActive
                            // Once power saver fires during this run it stays flagged for telemetry
                            // regardless of whether the user later re-disables it.
                            if (isPhonePowerSaverActive) powerSaverModeDetected = true
                            
                            val mode = if (isPhonePowerSaverActive) "ENABLED" else "DISABLED"
                            Log.w("RunTrackingService", "⚠️ POWER SAVER MODE $mode during run - GPS tracking may be throttled")
                            
                            // Re-request location updates immediately so the FusedLocationProvider
                            // re-evaluates the PRIORITY_HIGH_ACCURACY request under the new battery
                            // policy.  Without this the existing subscription keeps whatever
                            // interval the OS last negotiated before power saver was toggled.
                            if (isTracking) {
                                Log.d("RunTrackingService", "Power saver changed mid-run — re-requesting location updates")
                                try {
                                    fusedLocationClient.removeLocationUpdates(locationCallback)
                                } catch (e: Exception) {
                                    Log.w("RunTrackingService", "removeLocationUpdates before re-request failed (non-fatal): ${e.message}")
                                }
                                requestLocationUpdates()
                            }
                        }
                    }
                }
                
                val filter = IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
                // Context.RECEIVER_NOT_EXPORTED is an API-33 constant.  On API 31–32 Android
                // requires the exported flag to be specified but doesn't yet have the named
                // constant, so we pass the raw value (4) directly.  On API < 31 no flag is needed.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    registerReceiver(powerSaverStatusBroadcastReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // API 31–32: flag required but constant not available — pass raw int value 4
                    @Suppress("UnspecifiedRegisterReceiverFlag")
                    registerReceiver(powerSaverStatusBroadcastReceiver, filter, 0x4 /* RECEIVER_NOT_EXPORTED */)
                } else {
                    @Suppress("UnspecifiedRegisterReceiverFlag")
                    registerReceiver(powerSaverStatusBroadcastReceiver, filter)
                }
                Log.d("RunTrackingService", "Power saver mode broadcast receiver registered")
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to register power saver mode receiver (non-fatal): ${e.message}")
            }
        }
    }
    
    /**
     * Unregister the power saver mode broadcast receiver.
     * Called during service shutdown to prevent memory leaks.
     */
    private fun unregisterPowerSaverModeReceiver() {
        try {
            powerSaverStatusBroadcastReceiver?.let {
                unregisterReceiver(it)
                Log.d("RunTrackingService", "Power saver mode broadcast receiver unregistered")
            }
        } catch (e: Exception) {
            Log.e("RunTrackingService", "Failed to unregister power saver receiver (non-fatal): ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        releaseWakeLock()
        stopTimer()  // Stop the periodic timer
        unregisterPowerSaverModeReceiver()  // Clean up power saver broadcast receiver
        fusedLocationClient.removeLocationUpdates(locationCallback)
        sensorManager.unregisterListener(this)
        textToSpeechHelper.destroy() // Clean up Android TTS
        audioPlayerHelper.destroy() // Clean up OpenAI TTS audio player
        CoachingAudioQueue.stopAll() // Stop any queued coaching audio
        _latestCoachingText.value = null
        // Clear the companion-object (static) session state so that a future service
        // instance cannot accidentally process stale GPS data with its reset startTime=0
        // and compute a duration equal to System.currentTimeMillis() (the "496 hour" bug).
        // Only clear if we are NOT currently tracking — if the OS is killing a live session
        // we should leave the state intact for the START_STICKY restart to find it.
        if (!isTracking) {
            _currentRunSession.value = null
            Log.d("RunTrackingService", "onDestroy: cleared companion _currentRunSession (was not tracking)")
        }
        // Notify watch the session has ended, then shut down ConnectIQ bridge
        // NOTE: May race with ongoing upload, but sendSessionEnded() is idempotent
        try {
            if (garminWatchManager?.isWatchConnected?.value == true) {
                Log.d("RunTrackingService", "Notifying watch of session end...")
                garminWatchManager?.sendSessionEnded()
            }
            garminWatchManager?.shutdown()
            Log.d("RunTrackingService", "GarminWatchManager shutdown complete")
        } catch (e: Exception) {
            Log.w("RunTrackingService", "GarminWatchManager shutdown error (non-fatal): ${e.message}")
        }
        serviceScope.cancel()
        Log.d("RunTrackingService", "Service destroyed")
    }
    
    /**
     * Play coaching audio using OpenAI TTS if available, otherwise fall back to Android TTS
     */
    /**
     * Clean coaching message by applying all text normalizations:
     * - Remove redundant "per kilometer" from pace differences
     * - Normalize time values (e.g. 131 seconds → 2 minutes and 11 seconds)
     */
    private fun cleanCoachingMessage(message: String): String {
        var result = message
        // Apply pace-difference cleanup first (e.g. "by 42 seconds per kilometer" → "by 42 seconds")
        result = live.airuncoach.airuncoach.util.AbbreviationExpander.cleanPaceDifference(result)
        // Then normalize time values (e.g. "131 seconds" → "2 minutes and 11 seconds")
        result = live.airuncoach.airuncoach.util.AbbreviationExpander.normalizeTimeValues(result)
        return result
    }

    private fun playCoachingAudio(base64Audio: String?, format: String?, fallbackText: String) {
        // Clean the message (normalize pace differences, format time values)
        val cleanedText = cleanCoachingMessage(fallbackText)
        
        // Broadcast text to UI
        _latestCoachingText.value = cleanedText

        // Enqueue via shared audio queue (prevents overlap with other coaching)
        CoachingAudioQueue.enqueue(
            context = this,
            base64Audio = base64Audio,
            format = format,
            fallbackText = cleanedText,
            accent = currentUser?.coachAccent,
            gender = currentUser?.coachGender,
            onComplete = {
                // Clear coaching text when audio finishes
                _latestCoachingText.value = null
            }
        )
    }

    override fun onBind(intent: Intent?): IBinder? = null
    
    // ==================== AI COACHING TRIGGERS ====================
    
    private fun determinePhase(distanceKm: Double, targetDistance: Double?): CoachingPhase {
        return live.airuncoach.airuncoach.domain.model.determinePhase(distanceKm, targetDistance)
    }

    /**
     * Global coaching gate — checks if enough time AND distance have passed since ANY coaching audio.
     * All coaching triggers should call this before firing. Navigation uses a shorter gap.
     * Returns true if coaching is allowed, false if it should be suppressed.
     */
    private fun canFireCoaching(isNavigation: Boolean = false, bypassDistanceGate: Boolean = false): Boolean {
        val now = System.currentTimeMillis()
        val minGapMs = if (isNavigation) NAV_COACHING_MIN_GAP_MS else GLOBAL_COACHING_MIN_GAP_MS
        val timeSinceLastCoaching = now - lastGlobalCoachingTime
        val distSinceLastCoaching = totalDistance - lastGlobalCoachingDistance

        // Navigation only checks time gap (turns are position-critical, not distance-dependent)
        if (isNavigation) {
            return timeSinceLastCoaching >= minGapMs
        }

        // Structured interval phase transitions bypass the 150m distance gate.
        // Interval phases can be as short as 100-150m (e.g. 1 min jog at 8 km/h = 133m),
        // meaning the standard distance gate would BLOCK every phase transition after the first.
        // Phase transitions are time-critical for the session structure, so only the time gap matters.
        if (bypassDistanceGate) {
            return timeSinceLastCoaching >= minGapMs
        }

        // Non-navigation coaching: both time AND distance must have passed
        return timeSinceLastCoaching >= minGapMs && distSinceLastCoaching >= GLOBAL_COACHING_MIN_GAP_M
    }

    /**
     * Record that coaching audio just fired. Call this from every coaching trigger
     * immediately before launching the coaching coroutine / playing audio.
     */
    private fun recordCoachingFired() {
        lastGlobalCoachingTime = System.currentTimeMillis()
        lastGlobalCoachingDistance = totalDistance
    }

    /**
     * Check if the runner is within the km-split exclusion zone.
     * Pace coaching should be suppressed near km boundaries since a km split
     * will fire there, and back-to-back audio is annoying.
     */
    private fun isNearKmBoundary(): Boolean {
        val distIntoCurrentKm = totalDistance % 1000.0  // 0–999m
        // Within 200m BEFORE a km mark (800–1000m) or 200m AFTER (0–200m, but only after first km)
        return distIntoCurrentKm >= (1000.0 - KM_SPLIT_EXCLUSION_ZONE_M) ||
                (totalDistance >= 1000.0 && distIntoCurrentKm <= KM_SPLIT_EXCLUSION_ZONE_M)
    }

    /**
     * When no explicit [targetDistance] is set (e.g. a watch-initiated free run), infers
     * the most likely finish distance from the list of common race distances.
     * Inference fires once the runner has passed 85% of a standard distance — for example,
     * at 4.25 km the system assumes a 5 km target, enabling 500 m / 250 m / 100 m final-
     * stretch coaching that would otherwise be silently skipped.
     *
     * The inferred value is stored in [inferredTargetDistance] and is reset at the start
     * of every new run. It is never used if [targetDistance] is already set.
     */
    private fun maybeInferTargetDistance() {
        if (targetDistance != null || inferredTargetDistance != null) return
        val inferred = COMMON_RACE_DISTANCES_M.firstOrNull { commonDist ->
            totalDistance >= commonDist * 0.85 && totalDistance <= commonDist
        } ?: return
        inferredTargetDistance = inferred
        Log.d("RunTrackingService", "⚡ Inferred target distance: ${inferred.toInt()}m (runner at ${totalDistance.toInt()}m) — final-stretch coaching now active")
    }

    private fun check500mMilestones() {
        if (!coachingFeaturePrefs.halfKmCheckInEnabled) return
        val current500m = (totalDistance / 500).toInt()
        // Only trigger the 500m check-in once, at the first 0.5km mark.
        // The outer call-site (updateRunSession) already gates on GLOBAL_COACHING_MIN_GAP_MS
        // so we intentionally skip the redundant COACHING_COOLDOWN_MS check here.  Keeping
        // a separate 30 s inner cooldown meant that cadence or phase-change coaching firing
        // shortly before the 500m mark could block this one-time event entirely.
        val now = System.currentTimeMillis()
        if (last500mMilestone == 0 && current500m >= 1) {
            last500mMilestone = 1
            lastCoachingTime = now
            recordCoachingFired()
            hasCoachingFiredThisTick = true
            Log.d("RunTrackingService", "Reached 500m - triggering initial coaching (targetTime=$targetTime, targetDistance=$targetDistance)")
            serviceScope.launch {
                try {
                    // Calculate target pace from target time and distance if available
                    // targetTime is in milliseconds, targetDistance is in metres
                    val targetPaceStr = if (targetTime != null && targetDistance != null && targetDistance!! > 0) {
                        val totalSeconds = targetTime!! / 1000.0
                        val targetDistKm = targetDistance!! / 1000.0
                        val paceSecondsPerKm = totalSeconds / targetDistKm
                        val paceMin = (paceSecondsPerKm / 60).toInt()
                        val paceSec = (paceSecondsPerKm % 60).toInt()
                        "$paceMin:${paceSec.toString().padStart(2, '0')}"
                    } else null

                    // Calculate current average pace from actual distance/time (not stale session)
                    val elapsedMs = getActiveRunDuration()
                    val elapsedSec = elapsedMs / 1000.0
                    val distKm = totalDistance / 1000.0
                    val currentAvgPaceStr = if (distKm > 0 && elapsedSec > 0) {
                        val paceSecPerKm = elapsedSec / distKm
                        formatPace(paceSecPerKm)
                    } else "0:00"

                    val update = PhaseCoachingUpdate(
                        phase = _currentRunSession.value?.phase?.name ?: "STEADY",
                        distance = totalDistance / 1000.0,
                        targetDistance = targetDistance?.let { it / 1000.0 },  // Convert metres to km
                        elapsedTime = getActiveRunDuration() / 1000,  // Convert ms to seconds
                        currentPace = currentAvgPaceStr,
                        currentGrade = currentSmoothedGrade,  // Real-time grade, not whole-run average
                        totalElevationGain = totalElevationGain,
                        heartRate = currentHeartRate.takeIf { it > 0 },
                        cadence = currentCadence.takeIf { it > 0 },
                        coachName = currentUser?.coachName,
                        coachTone = currentUser?.coachTone,
                        coachGender = currentUser?.coachGender,
                        coachAccent = currentUser?.coachAccent,
                        fitnessLevel = currentUser?.fitnessLevel,
                        runnerName = currentUser?.name,
                        runnerAge = currentUser?.age,
                    runnerWeight = currentUser?.weight,
                    runnerHeight = currentUser?.height,
                        activityType = currentActivityType,
                        hasRoute = hasGpsElevation || hasRoute,  // True when GPS altitude available, not just when planned route loaded
                        targetTime = targetTime?.let { (it / 1000).toInt() },
                        targetPace = targetPaceStr,
                        triggerType = "500m_checkin",
                        totalRunsAllTime = runHistoryStats?.totalRunsAllTime,
                        userId = currentUser?.id
                    )
                    val response = apiService.getPhaseCoaching(update)
                    coachingHistory.add(AiCoachingNote(
                        time = getActiveRunDuration(),
                        message = "500m: ${response.message}"
                    ))
                    Log.d("RunTrackingService", "500m coaching response: ${response.message}")

                    // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                    // (playCoachingAudio handles all text normalizations internally)
                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
                } catch (e: Exception) {
                    Log.e("RunTrackingService", "Failed to get 500m coaching", e)
                }
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // SESSION PHASE ENGINE
    // Tracks which AI-designed phase the runner is in and fires trigger coaching
    // messages at phase transitions (warmup→intervals, rep start/end, cooldown, etc.)
    // ─────────────────────────────────────────────────────────────────────────

    private fun checkSessionPhaseTransitions(currentDistanceKm: Double) {
        val instructions = sessionInstructions ?: return
        val phases = instructions.sessionStructure?.phases ?: return
        if (phases.isEmpty()) return

        // Find what phase the runner should be in based on cumulative distance
        var cumulativeKm = 0.0
        var resolvedPhaseIndex = phases.size - 1  // Default to last phase
        var resolvedPhaseName = phases.last().name

        for ((index, phase) in phases.withIndex()) {
            val phaseKm = phase.durationKm ?: 0.5
            val reps = phase.repetitions ?: 1
            val totalPhaseKm = phaseKm * reps

            if (currentDistanceKm < cumulativeKm + totalPhaseKm) {
                resolvedPhaseIndex = index
                // For interval main_set phases, include rep number in phase name
                resolvedPhaseName = if ((phase.repetitions ?: 1) > 1) {
                    val repIndex = ((currentDistanceKm - cumulativeKm) / phaseKm).toInt()
                    "${phase.name}_rep_${repIndex + 1}_of_${phase.repetitions}"
                } else {
                    phase.name
                }
                break
            }
            cumulativeKm += totalPhaseKm
        }

        // Detect phase transitions
        val isNewPhase = resolvedPhaseIndex != currentPhaseIndex || 
                        (currentPhaseName == null && resolvedPhaseName != null)

        if (isNewPhase && resolvedPhaseName != lastPhaseTriggerFiredForPhase) {
            val previousPhaseName = currentPhaseName
            currentPhaseIndex = resolvedPhaseIndex
            currentPhaseName = resolvedPhaseName
            phaseDistanceStartKm = currentDistanceKm
            lastPhaseTriggerFiredForPhase = resolvedPhaseName

            Log.d("RunTrackingService", "🏃 Phase transition: $previousPhaseName → $resolvedPhaseName at ${currentDistanceKm}km")

            // Find the at_start coaching trigger for this phase
            val triggers = instructions.sessionStructure?.coachingTriggers ?: return
            val phaseBase = phases.getOrNull(resolvedPhaseIndex)?.name ?: resolvedPhaseName

            val trigger = triggers.firstOrNull { t ->
                (t.phase == phaseBase || t.phase == resolvedPhaseName) && t.trigger == "at_start"
            }

            if (trigger?.message != null && !hasCoachingFiredThisTick && canFireCoaching()) {
                fireSessionPhaseTrigger(
                    message = trigger.message!!,
                    eventType = "phase_transition",
                    eventPhase = resolvedPhaseName
                )
            }
        }

        // For interval main_set phases, detect rep boundaries and fire rep_start / rep_end
        val phase = phases.getOrNull(currentPhaseIndex) ?: return
        val reps = phase.repetitions ?: 1
        if (reps > 1 && currentDistanceKm >= phaseDistanceStartKm) {
            val repKm = phase.durationKm ?: 0.0
            if (repKm <= 0.0) return

            val positionInMainSet = currentDistanceKm - phaseDistanceStartKm
            val rawRepIndex = (positionInMainSet / repKm).toInt()
            val repNumber = (rawRepIndex + 1).coerceAtMost(reps)
            val positionInRep = positionInMainSet - (rawRepIndex * repKm)
            // Determine if this is a work rep or recovery jog based on phase name
            // Phases named "recovery*", "jog*", "rest*", "float*" are recovery phases
            val phaseNameLower = phase.name.lowercase()
            val isWorkRep = !phaseNameLower.contains("recovery") &&
                            !phaseNameLower.contains("jog") &&
                            !phaseNameLower.contains("rest") &&
                            !phaseNameLower.contains("float")

            // Detect start of a new rep / recovery jog
            if (repNumber != lastRepTriggerFiredAtRep && positionInRep < 0.05 && !hasCoachingFiredThisTick) {
                lastRepTriggerFiredAtRep = repNumber
                currentRepIsWorkPhase = isWorkRep
                val triggerType = if (isWorkRep) "rep_start" else "recovery_start"
                val trigger = instructions.sessionStructure?.coachingTriggers?.firstOrNull { t ->
                    t.phase == phase.name && (t.trigger == triggerType || t.trigger == "rep_start")
                }
                if (trigger?.message != null && canFireCoaching()) {
                    val repMsg = trigger.message!!
                        .replace("{rep}", "$repNumber")
                        .replace("{total}", "$reps")
                    val prefix = if (isWorkRep) "Rep $repNumber of $reps: " else ""
                    fireSessionPhaseTrigger(
                        message = "$prefix$repMsg",
                        eventType = triggerType,
                        eventPhase = "rep_${repNumber}_of_$reps"
                    )
                }
            }

            // Detect end of a rep / recovery jog (within 50m of end of phase distance)
            val repEndKm = rawRepIndex * repKm + repKm
            val distanceToRepEnd = repEndKm - positionInMainSet
            if (distanceToRepEnd in 0.0..0.05 && lastRepTriggerFiredAtRep == repNumber && !hasCoachingFiredThisTick) {
                val triggerType = if (isWorkRep) "rep_end" else "recovery_end"
                val trigger = instructions.sessionStructure?.coachingTriggers?.firstOrNull { t ->
                    t.phase == phase.name && (t.trigger == triggerType || t.trigger == "rep_end")
                }
                if (trigger?.message != null && canFireCoaching()) {
                    fireSessionPhaseTrigger(
                        message = trigger.message!!,
                        eventType = triggerType,
                        eventPhase = "rep_${repNumber}_of_$reps"
                    )
                }
            }
        }
    }

    /**
     * Fire a session-phase coaching trigger message.
     * Uses TTS/audio to deliver the message and marks the coaching tick as fired.
     */
    private fun fireSessionPhaseTrigger(
        message: String,
        eventType: String,
        eventPhase: String
    ) {
        if (!coachingFeaturePrefs.motivationalCoachingEnabled) return
        hasCoachingFiredThisTick = true
        recordCoachingFired()

        Log.d("RunTrackingService", "🎯 Session trigger [$eventType] phase=$eventPhase: $message")
        _latestCoachingText.value = message

        // Record in coaching history so legacy session phase triggers appear in ai_coaching_notes.
        coachingHistory.add(AiCoachingNote(
            time = getActiveRunDuration(),
            message = "[$eventType] $message"
        ))

        serviceScope.launch {
            try {
                if (!isMuted) {
                    // Polly routing: pre-cached → real-time → Android TTS
                    val base64Audio: String? = getPreCachedPollyAudio(message)
                        ?: getRealtimePollyAudio(message)
                    val audioFormat: String? = if (base64Audio != null) "mp3" else null
                    CoachingAudioQueue.enqueue(
                        context = this@RunTrackingService,
                        base64Audio = base64Audio,
                        format = audioFormat,
                        fallbackText = message,
                        accent = currentUser?.coachAccent,
                        gender = currentUser?.coachGender,
                        onComplete = { _latestCoachingText.value = null }
                    )
                }

                // Log coaching event for analytics
                val runId = _currentRunSession.value?.id ?: "unknown"
                apiService.logCoachingEvent(
                    CoachingSessionEvent(
                        runId = runId,
                        plannedWorkoutId = planWorkoutId,
                        eventType = eventType,
                        eventPhase = eventPhase,
                        coachingMessage = message,
                        coachingAudioUrl = null,
                        userMetrics = mapOf(
                            "distance_km" to totalDistance / 1000.0,
                            "pace" to (currentPace),
                            "heart_rate" to currentHeartRate
                        ),
                        toneUsed = sessionCoachingTone,
                        userEngagement = null
                    )
                )
            } catch (e: Exception) {
                Log.w("RunTrackingService", "Session trigger delivery failed (non-fatal): ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DYNAMIC COACHING PLAN EVALUATOR
    // Evaluates reactive triggers from the rich DynamicSessionCoachingPlan every
    // GPS tick. Fires immediately when a condition is met (HR out of zone, pace
    // deviating) rather than waiting for a scheduled timer.
    //
    // Trigger types handled:
    //   hr_zone_high / hr_zone_low  — fired when HR exits target zone for current phase
    //   pace_too_fast / pace_too_slow — fired when pace deviates from phase target
    //   milestone                    — fired at key distance percentages
    //   phase_start / phase_end      — fired at phase transitions (distance-based)
    //   rep_start / rep_end          — fired at interval rep boundaries
    //   recovery_start               — fired at the start of each recovery jog phase
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Extracts a coaching topic category from a trigger type string.
     * Used to build session memory so the AI knows what has been discussed.
     */
    private fun extractTopicFromTriggerType(triggerType: String): String {
        val t = triggerType.lowercase()
        return when {
            t.contains("hr") || t.contains("heart") || t.contains("zone") -> "heart_rate"
            t.contains("pace") || t.contains("speed") || t.contains("km_split") || t.contains("split") -> "pace"
            t.contains("cadence") || t.contains("stride") || t.contains("turnover") -> "cadence"
            t.contains("breath") || t.contains("respir") -> "breathing"
            t.contains("form") || t.contains("posture") || t.contains("shoulder") || t.contains("technique") -> "form"
            t.contains("motivat") || t.contains("encourage") -> "motivation"
            t.contains("milestone") || t.contains("halfway") || t.contains("finish") || t.contains("progress") || t.contains("session_complete") -> "progress"
            else -> "general"
        }
    }

    /**
     * Returns true if this trigger bypasses the coaching budget.
     * Critical = HR safety alerts, progress milestones (once), session transitions.
     * Non-critical = periodic form/breathing cues, cadence check-ins, motivation.
     */
    private fun isCriticalTrigger(triggerType: String, frequency: String): Boolean {
        val t = triggerType.lowercase()
        return frequency == "once" ||  // All progress/milestone triggers are once — always critical
            t.contains("hr_zone") || t.contains("hr_high") || t.contains("hr_low") ||
            t.contains("heart_rate_high") || t.contains("heart_rate_low") ||
            t.contains("session_complete") || t.contains("session_end") ||
            t.contains("phase_start") || t.contains("rep_start") || t.contains("recovery_start")
    }

    /** Minimum gap between reactive trigger re-fires (90 seconds for on_condition triggers) */
    private val REACTIVE_TRIGGER_COOLDOWN_MS = 90_000L

    // Trigger types that are handled exclusively by evaluateDynamicPhase() — skip in condition loops
    private val PHASE_TRANSITION_TRIGGER_TYPES = setOf(
        "phase_start", "phase_end", "rep_start", "rep_end", "recovery_start"
    )

    /**
     * Evaluate all dynamic plan triggers against live metrics each GPS tick.
     * Called in the main location-update loop before generic prompts.
     *
     * ═══════════════════════════════════════════════════════════════════════
     * THREE-PASS PRIORITY SYSTEM
     * ═══════════════════════════════════════════════════════════════════════
     * The old single-loop design had a critical flaw: HR zone triggers (which are
     * reactive / on_condition and fire frequently) blocked all progress triggers
     * (km splits, halfway, final 500m, session_complete) because a single trigger
     * firing would set hasCoachingFiredThisTick=true and exit the loop before those
     * triggers were ever evaluated.
     *
     * The new design separates triggers into three priority passes:
     *
     * PASS 1 — Progress triggers (frequency="once")
     *   km splits, halfway, final 500m, session_complete.
     *   These fire FIRST and are NEVER blocked by reactive triggers.
     *   Max one per tick (audio overlap prevention).
     *
     * PASS 2 — Periodic triggers (frequency="periodic")
     *   Fixed-interval check-ins (e.g. every 90s regardless of metrics).
     *   Only fires if Pass 1 produced nothing.
     *
     * PASS 3 — Reactive triggers (frequency="on_condition")
     *   HR zone alerts, pace drift, cadence cues.
     *   Only fires if Passes 1 and 2 produced nothing.
     *   Max one per tick. 90s per-trigger cooldown.
     */
    private fun evaluateSessionConditionTriggers(currentDistanceKm: Double) {
        val plan = dynamicCoachingPlan ?: return
        if (hasCoachingFiredThisTick) return
        if (!coachingFeaturePrefs.motivationalCoachingEnabled) return
        // Stop all trigger evaluation once the session completion message has fired
        if (sessionCoachingPlanComplete) return

        // First: update which phase we're in (distance-based, same logic as legacy engine)
        evaluateDynamicPhase(currentDistanceKm, plan)

        val now = System.currentTimeMillis()
        val currentPhase = plan.phases.getOrNull(dynamicCurrentPhaseIndex)

        // Resolve per-phase HR / pace targets — fall back to plan-level targets if phase has none
        val phaseHRMax = currentPhase?.targetHRMax ?: plan.targetMetrics.mainEffortHRMax
        val phaseHRMin = currentPhase?.targetHRMin ?: plan.targetMetrics.mainEffortHRMin
        val phasePaceMax = currentPhase?.targetPaceMax ?: plan.targetMetrics.mainEffortPaceMax  // sec/km
        val phasePaceMin = currentPhase?.targetPaceMin ?: plan.targetMetrics.mainEffortPaceMin  // sec/km
        // Base phase name (without rep suffix) — used for "phase == recovery_walk" conditions
        val currentPhaseBaseName = currentPhase?.name

        // ═══════════════════════════════════════════════════════════════════════
        // PASS 1 — PROGRESS TRIGGERS (frequency="once", not yet fired)
        // ═══════════════════════════════════════════════════════════════════════
        // km splits, halfway milestone, final 500m, and session_complete.
        // These represent EARNED progress and must ALWAYS fire when conditions
        // are met — they are NEVER blocked by reactive HR/pace/cadence triggers.
        // If a progress trigger fires on the same GPS tick as an HR alert, the
        // progress trigger wins (it's more valuable context for the athlete).
        for (trigger in plan.triggers) {
            if (hasCoachingFiredThisTick) break  // One audio per tick — stop after first fires
            if (trigger.frequency != "once") continue
            if (triggerFiredOnce.contains(trigger.id)) continue
            if (trigger.type in PHASE_TRANSITION_TRIGGER_TYPES) continue

            val conditionMet = when (trigger.type) {
                "milestone" -> {
                    val td = targetDistance ?: (plan.targetMetrics.totalDistanceKm?.let { it * 1000.0 }) ?: 0.0
                    if (td <= 0) false
                    else evaluateMilestoneCondition(trigger.condition, currentDistanceKm, td / 1000.0)
                }
                else -> {
                    // session_complete: require at least 60s elapsed to avoid instant-completion edge cases
                    if ((trigger.type.contains("session_complete") || trigger.type.contains("session_end")) &&
                        getActiveRunDuration() < 60_000L) false
                    else evaluateConditionExpression(
                        trigger.condition, phaseHRMin, phaseHRMax, phasePaceMin, phasePaceMax, currentDistanceKm, currentPhaseBaseName
                    )
                }
            }

            if (!conditionMet) continue

            triggerLastFiredMs[trigger.id] = now
            triggerFiredOnce.add(trigger.id)

            Log.d("RunTrackingService", "📍 Progress trigger [${trigger.type}] ${trigger.id} — requesting live AI message")
            hasCoachingFiredThisTick = true

            // Detect session completion — stop all further trigger evaluation after this fires
            if (trigger.type.contains("session_complete") || trigger.type.contains("session_end")) {
                sessionCoachingPlanComplete = true
                Log.d("RunTrackingService", "✅ Session coaching plan complete — no further triggers will fire")
            }

            fireLiveTriggerMessage(
                trigger = trigger, phaseName = dynamicCurrentPhaseName ?: "unknown",
                phaseHRMin = phaseHRMin, phaseHRMax = phaseHRMax,
                phasePaceMin = phasePaceMin, phasePaceMax = phasePaceMax,
                currentDistanceKm = currentDistanceKm, plan = plan,
                currentPhase = currentPhase,
            )
        }

        // ═══════════════════════════════════════════════════════════════════════
        // PASS 2 — PERIODIC TRIGGERS (frequency="periodic")
        // ═══════════════════════════════════════════════════════════════════════
        // Fixed-interval check-ins (e.g. every 90s, regardless of live-data conditions).
        // OpenAI uses this for regular effort summaries, cadence check-ins, etc.
        // Only evaluates if no progress trigger fired in Pass 1.
        if (!hasCoachingFiredThisTick) {
            for (trigger in plan.triggers) {
                if (hasCoachingFiredThisTick) break
                if (trigger.frequency != "periodic") continue
                if (trigger.type in PHASE_TRANSITION_TRIGGER_TYPES) continue

                val periodMs = (trigger.frequencySeconds ?: 120) * 1_000L
                // Don't fire periodic triggers in the first 60 seconds (warmup grace period)
                if (getActiveRunDuration() < 60_000L) continue
                val lastFiredMs = triggerLastFiredMs[trigger.id] ?: 0L
                if ((now - lastFiredMs) < periodMs) continue
                // Evaluate optional condition (OpenAI may restrict to certain phases)
                if (trigger.condition.isNotBlank() &&
                    trigger.condition != "always" &&
                    !evaluateConditionExpression(trigger.condition, phaseHRMin, phaseHRMax, phasePaceMin, phasePaceMax, currentDistanceKm, currentPhaseBaseName)) continue
                // Coaching budget gate — non-critical periodic cues respect spacing and count limits
                if (!isCriticalTrigger(trigger.type, trigger.frequency ?: "")) {
                    if (nonCriticalCueCount >= SESSION_MAX_NON_CRITICAL_CUES) continue
                    if ((now - lastNonCriticalCueMs) < NON_CRITICAL_MIN_GAP_MS) continue
                }

                triggerLastFiredMs[trigger.id] = now
                Log.d("RunTrackingService", "⏱️ Periodic trigger [${trigger.type}] ${trigger.id} — requesting live AI message")
                hasCoachingFiredThisTick = true
                fireLiveTriggerMessage(
                    trigger = trigger, phaseName = dynamicCurrentPhaseName ?: "unknown",
                    phaseHRMin = phaseHRMin, phaseHRMax = phaseHRMax,
                    phasePaceMin = phasePaceMin, phasePaceMax = phasePaceMax,
                    currentDistanceKm = currentDistanceKm, plan = plan,
                    currentPhase = currentPhase,
                )
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // PASS 3 — REACTIVE TRIGGERS (frequency="on_condition")
        // ═══════════════════════════════════════════════════════════════════════
        // HR zone alerts, pace drift, cadence cues — fire when live metrics cross
        // defined thresholds. Only one fires per GPS tick; 90s cooldown per trigger.
        // Only evaluates if Passes 1 and 2 produced nothing this tick.
        if (!hasCoachingFiredThisTick) {
            for (trigger in plan.triggers) {
                if (hasCoachingFiredThisTick) break
                // Only reactive / on_condition triggers in this pass
                if (trigger.frequency == "once" || trigger.frequency == "periodic") continue
                if (trigger.type in PHASE_TRANSITION_TRIGGER_TYPES) continue

                val lastFiredMs = triggerLastFiredMs[trigger.id] ?: 0L
                if ((now - lastFiredMs) < REACTIVE_TRIGGER_COOLDOWN_MS) continue
                // Coaching budget — non-critical reactive cues (cadence, form, motivation) respect count/spacing
                if (!isCriticalTrigger(trigger.type, trigger.frequency ?: "")) {
                    if (nonCriticalCueCount >= SESSION_MAX_NON_CRITICAL_CUES) continue
                    if ((now - lastNonCriticalCueMs) < NON_CRITICAL_MIN_GAP_MS) continue
                }

                val conditionMet = when (trigger.type) {
                    // Legacy milestone type — distance-pct condition evaluated separately
                    "milestone" -> {
                        val td = targetDistance ?: (plan.targetMetrics.totalDistanceKm?.let { it * 1000.0 }) ?: 0.0
                        if (td <= 0) false
                        else evaluateMilestoneCondition(trigger.condition, currentDistanceKm, td / 1000.0)
                    }
                    else -> {
                        // Require 2 min elapsed for reactive triggers — prevents premature firing at run start
                        if (getActiveRunDuration() < 120_000L) false
                        // HR confidence guard: when the session policy requires validated HR, suppress
                        // any HR-based trigger until we have a confident, stable reading.
                        // This silences false "HR too high" cues caused by sensor contact-loss dropouts.
                        else if (plan.coachingPolicy?.hrValidationRequired == true &&
                            trigger.condition.contains("hr", ignoreCase = true) &&
                            !isHRReadingConfident()
                        ) {
                            Log.d("RunTrackingService",
                                "HR trigger '${trigger.id}' suppressed — waiting for confident HR reading")
                            false
                        }
                        else evaluateConditionExpression(
                            trigger.condition, phaseHRMin, phaseHRMax, phasePaceMin, phasePaceMax, currentDistanceKm, currentPhaseBaseName
                        )
                    }
                }

                if (!conditionMet) continue

                triggerLastFiredMs[trigger.id] = now

                Log.d("RunTrackingService", "🔔 Reactive trigger [${trigger.type}] ${trigger.id} — requesting live AI message")
                hasCoachingFiredThisTick = true

                // Track whether this is an HR-zone-high trigger so we can fire a recovery
                // acknowledgement later when HR returns to zone.
                if (trigger.type.contains("hr_zone_high") ||
                    trigger.type.contains("hr_high") ||
                    trigger.type.contains("heart_rate_high") ||
                    (trigger.type.contains("hr") && trigger.condition.contains(">") &&
                     trigger.condition.contains("targetHRMax", ignoreCase = true))) {
                    hrZoneExceededMax = phaseHRMax ?: 0
                    Log.d("RunTrackingService", "💓 HR zone exceeded (max=$hrZoneExceededMax) — will fire recovery ack when HR returns")
                }

                fireLiveTriggerMessage(
                    trigger = trigger, phaseName = dynamicCurrentPhaseName ?: "unknown",
                    phaseHRMin = phaseHRMin, phaseHRMax = phaseHRMax,
                    phasePaceMin = phasePaceMin, phasePaceMax = phasePaceMax,
                    currentDistanceKm = currentDistanceKm, plan = plan,
                    currentPhase = currentPhase,
                )
            }
        }

        // ── HR recovery acknowledgement ─────────────────────────────────────────
        // After all condition triggers have been evaluated, check if the athlete's
        // HR has returned to zone after previously exceeding it.  Fire a single
        // positive acknowledgement — but only if:
        //  • A zone-high trigger previously fired (hrZoneExceededMax > 0)
        //  • Current HR is back below (or at) the zone max
        //  • HR trend is "falling" or "stable" (not rising again)
        //  • We haven't already acknowledged this recovery within HR_RECOVERY_ACK_MIN_KM
        //  • No other coaching fired this tick (don't pile on)
        if (!hasCoachingFiredThisTick &&
            hrZoneExceededMax > 0 &&
            currentHeartRate > 0 &&
            currentHeartRate <= hrZoneExceededMax &&
            computeHRTrend() != "rising" &&
            (currentDistanceKm - lastHrRecoveryAcknowledgedAtKm) >= HR_RECOVERY_ACK_MIN_KM &&
            isHRReadingConfident()) {

            val recoveryTrigger = live.airuncoach.airuncoach.network.model.DynamicCoachingTrigger(
                id = "hr_recovery_ack",
                type = "hr_recovery_acknowledgement",
                condition = "hr <= targetHRMax",
                message = "Heart rate back in zone — good response.",
                frequency = "on_condition",
                alternativeMessages = null,
                alertType = null,
                suppressWhenIntensity = null,
            )
            lastHrRecoveryAcknowledgedAtKm = currentDistanceKm
            hrZoneExceededMax = 0   // Reset — will be set again if HR exceeds zone again
            Log.d("RunTrackingService", "💚 HR recovery — firing acknowledgement cue")
            hasCoachingFiredThisTick = true
            fireLiveTriggerMessage(
                trigger = recoveryTrigger, phaseName = dynamicCurrentPhaseName ?: "unknown",
                phaseHRMin = phaseHRMin, phaseHRMax = phaseHRMax,
                phasePaceMin = phasePaceMin, phasePaceMax = phasePaceMax,
                currentDistanceKm = currentDistanceKm, plan = plan,
                currentPhase = currentPhase,
            )
        }
    }

    /**
     * Fires a session coaching trigger by making a LIVE OpenAI call with the athlete's
     * actual metrics at the moment the trigger fires.
     *
     * This replaces the old template-substitution approach ({hr} → 148) with genuine
     * AI analysis — the same quality as normal run coaching (generatePaceUpdate /
     * generateEliteCoaching). OpenAI sees the actual live data and generates a bespoke,
     * contextually correct message, not a pre-written phrase.
     *
     * On API failure or timeout, falls back to the pre-written template message
     * so the athlete always hears something.
     */
    private fun fireLiveTriggerMessage(
        trigger: live.airuncoach.airuncoach.network.model.DynamicCoachingTrigger,
        phaseName: String,
        phaseHRMin: Int?,
        phaseHRMax: Int?,
        phasePaceMin: Int?,
        phasePaceMax: Int?,
        currentDistanceKm: Double,
        plan: live.airuncoach.airuncoach.network.model.DynamicSessionCoachingPlan,
        currentPhase: live.airuncoach.airuncoach.network.model.DynamicCoachingPhase?,
    ) {
        // Snapshot live metrics immediately (don't capture lambdas that reference mutable state)
        val snapshotHR = currentHeartRate
        val snapshotPaceSecPerKm = parsePaceToSeconds(currentPace).let { if (it > 0) it.toInt() else null }
        val snapshotCadence = currentCadence.takeIf { it > 0 }
        val snapshotDistKm = currentDistanceKm
        val snapshotElapsedMin = getActiveRunDuration() / 60_000.0
        val snapshotGrade = currentSmoothedGrade
        val snapshotElevGain = totalElevationGain
        val snapshotTargetDistKm = targetDistance?.let { it / 1000.0 }

        // Snapshot recent coaching context (last 2 messages for coherence)
        val recentMessages = coachingHistory.takeLast(2).map { it.message }

        // Snapshot recent km splits for trend context
        val recentSplits = kmSplits.takeLast(3).map { split ->
            live.airuncoach.airuncoach.network.model.RecentSplit(km = split.km, pace = split.pace)
        }

        // ── Session memory snapshot ────────────────────────────────────────────
        val topicsDiscussedSnapshot = sessionTopicsDiscussed.toList()
        val topicsNotCoveredSnapshot = ALL_COACHING_TOPICS.filter { it !in sessionTopicsDiscussed }
        val minutesSinceLast = if (lastCueFiredAtMs > 0L)
            (System.currentTimeMillis() - lastCueFiredAtMs) / 60_000.0 else null

        // ── Sensor confidence snapshot ─────────────────────────────────────────
        val hrConfSnap  = hrConfidenceLevel()
        val gpsConfSnap = gpsConfidenceLevel()
        val cadConfSnap = cadenceConfidenceLevel()

        // ── Physiological delta (computed in fireDynamicTrigger before snapshot update) ──
        // These are already set by the time we build this request
        val hrDeltaSnap   = lastCueHrDelta
        val paceDeltaSnap = lastCuePaceDelta
        val respondedSnap = athleteRespondedToLastCue

        // ── Trend context — computed from rolling buffers ──────────────────────
        val hrTrend = computeHRTrend()
        val paceTrend = computePaceTrend()
        // True when this is an HR-zone-high trigger AND the athlete is already self-correcting.
        // The AI should ACKNOWLEDGE rather than DIRECT in this case.
        val isAlreadyResponding = (trigger.type.contains("hr_zone_high") ||
            trigger.type.contains("hr_high") ||
            trigger.type.contains("heart_rate_high") ||
            trigger.type == "hr_recovery_acknowledgement") &&
            hrTrend == "falling" && paceTrend == "slowing"

        // Find interval rep context from the current phase name (encoded as "work_rep_3_of_5").
        // Computed BEFORE fallbackMessage below so the fallback can actually say "Rep 3 of 5"
        // instead of silently defaulting to "Rep 1 of 1" via pickTriggerMessage's default params
        // — this used to be computed after fallbackMessage was already built, so the correct
        // values were only ever used in the (often-failing) live AI request, never the fallback.
        val repRegex = Regex("_rep_(\\d+)_of_(\\d+)$")
        val repMatch = repRegex.find(phaseName)
        val currentRepNum = repMatch?.groupValues?.get(1)?.toIntOrNull()
        val totalRepsNum = repMatch?.groupValues?.get(2)?.toIntOrNull()
            ?: plan.phases.mapNotNull { it.repetitions }.maxOrNull()

        // Pre-written fallback — resolved with live data, used if API fails or times out
        val fallbackMessage = pickTriggerMessage(
            trigger, repNum = currentRepNum ?: 1, totalReps = totalRepsNum ?: 1,
            phaseHRMin = phaseHRMin, phaseHRMax = phaseHRMax,
            phasePaceMin = phasePaceMin, phasePaceMax = phasePaceMax
        )

        // Build a compact phases summary so GPT understands the full session structure.
        // e.g. "warmup (5min easy) → tempo_block (20min threshold 4:50-5:05/km) → cooldown (5min easy)"
        val phasesSummary = plan.phases.joinToString(" → ") { ph ->
            val reps = if ((ph.repetitions ?: 1) > 1) "${ph.repetitions}×" else ""
            val duration = ph.durationMinutes?.let { "${it.toInt()}min" }
                ?: ph.distanceKm?.let { "${it}km" }
                ?: ""
            val effort = ph.effort.takeIf { it != "moderate" } ?: ""
            val paceRange = if (ph.targetPaceMin != null && ph.targetPaceMax != null) {
                val minStr = "${ph.targetPaceMin / 60}:${(ph.targetPaceMin % 60).toString().padStart(2, '0')}"
                val maxStr = "${ph.targetPaceMax / 60}:${(ph.targetPaceMax % 60).toString().padStart(2, '0')}"
                " @${minStr}-${maxStr}/km"
            } else ""
            val hrRange = if (ph.targetHRMin != null && ph.targetHRMax != null) " HR:${ph.targetHRMin}-${ph.targetHRMax}" else ""
            "${reps}${ph.name}(${listOfNotNull(duration.takeIf { it.isNotBlank() }, effort.takeIf { it.isNotBlank() }).joinToString(" ")}${paceRange}${hrRange})"
        }

        // Phase time progress — how far into the current phase and how much is left.
        // Only meaningful for time-based phases (durationMin > 0), not distance-based.
        val phaseElapsedMin: Double?
        val phaseRemainingMin: Double?
        if (dynamicPhaseDurationMin > 0) {
            val phaseElapsed = snapshotElapsedMin - dynamicPhaseTimeStartMin
            phaseElapsedMin = phaseElapsed.coerceAtLeast(0.0)
            phaseRemainingMin = (dynamicPhaseDurationMin - phaseElapsed).coerceAtLeast(0.0)
        } else {
            phaseElapsedMin = null
            phaseRemainingMin = null
        }

        serviceScope.launch {
            try {
                val request = live.airuncoach.airuncoach.network.model.SessionTriggerLiveRequest(
                    triggerId = trigger.id,
                    triggerType = trigger.type,
                    triggerCondition = trigger.condition,
                    // Full session context — GPT needs this to understand what the session IS
                    preRunBrief = plan.preRunBrief,
                    whyThisSession = plan.whyThisSession,
                    sessionInstructions = planWorkoutDescription,  // raw training plan workout description
                    cueingStrategy = plan.cueingStrategy,
                    totalSessionDurationMin = plan.targetMetrics.totalDurationMinutes,
                    totalSessionDistanceKm = plan.targetMetrics.totalDistanceKm,
                    currentRepNumber = currentRepNum,
                    totalRepsInSession = totalRepsNum,
                    isWorkPhase = dynamicPhaseIsWorkInterval.takeIf { currentRepNum != null },
                    phaseElapsedMinutes = phaseElapsedMin,
                    phaseRemainingMinutes = phaseRemainingMin,
                    phasesSummary = phasesSummary,
                    sessionType = plan.sessionType ?: "run",
                    sessionGoal = plan.sessionGoal ?: "",
                    sessionPhase = phaseName,
                    phaseInstructions = currentPhase?.phaseInstructions,
                    phaseHRMin = phaseHRMin,
                    phaseHRMax = phaseHRMax,
                    phasePaceMinSecPerKm = phasePaceMin,
                    phasePaceMaxSecPerKm = phasePaceMax,
                    currentHR = snapshotHR,
                    currentPaceSecPerKm = snapshotPaceSecPerKm,
                    currentCadence = snapshotCadence,
                    distanceKm = snapshotDistKm,
                    targetDistanceKm = snapshotTargetDistKm,
                    elapsedMinutes = snapshotElapsedMin,
                    currentGrade = snapshotGrade,
                    elevationGainM = snapshotElevGain,
                    recentCoachingMessages = recentMessages.ifEmpty { null },
                    recentSplits = recentSplits.ifEmpty { null },
                    // Trend context — tells the AI whether the athlete is already self-correcting
                    hrTrendDirection = hrTrend,
                    paceTrendDirection = paceTrend,
                    isAthleteAlreadyResponding = isAlreadyResponding.takeIf { isAlreadyResponding },
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    userId = currentUser?.id,
                    runnerName = currentUser?.name,
                    fitnessLevel = currentUser?.fitnessLevel,
                    // Session memory — coaching continuity
                    topicsDiscussed = topicsDiscussedSnapshot.ifEmpty { null },
                    topicsNotCovered = topicsNotCoveredSnapshot.ifEmpty { null },
                    sessionCueCount = sessionCueCount,
                    minutesSinceLastCue = minutesSinceLast,
                    lastCueTriggerType = lastCueTriggerType,
                    // Sensor confidence
                    hrConfidence = hrConfSnap,
                    gpsConfidence = gpsConfSnap,
                    cadenceConfidence = cadConfSnap,
                    // Physiological response to previous cue
                    lastCueHrDelta = hrDeltaSnap,
                    lastCuePaceDelta = paceDeltaSnap,
                    athleteRespondedToLastCue = respondedSnap,
                    // Activity type — tells GPT to use walk/run vocabulary
                    activityType = currentActivityType,
                )

                val response = withTimeoutOrNull(3_500L) {
                    apiService.getSessionTriggerLive(request)
                }

                if (response != null) {
                    Log.d("RunTrackingService", "🤖 Live trigger AI message [${trigger.type}]: ${response.message}")
                    // Play with AI-generated TTS audio if available, otherwise Android TTS
                    fireDynamicTrigger(
                        message = response.message,
                        triggerType = trigger.type,
                        phaseName = phaseName,
                        overrideAudio = response.audio,
                        overrideAudioFormat = response.format,
                    )
                } else {
                    Log.w("RunTrackingService", "⚠️ Live trigger timed out — using fallback for [${trigger.type}]")
                    fireDynamicTrigger(fallbackMessage, trigger.type, phaseName)
                }
            } catch (e: Exception) {
                Log.w("RunTrackingService", "⚠️ Live trigger API failed (${e.message}) — using fallback for [${trigger.type}]")
                fireDynamicTrigger(fallbackMessage, trigger.type, phaseName)
            }
        }
    }

    /**
     * Flexible condition expression evaluator.
     *
     * OpenAI writes condition strings using our metric vocabulary. The engine resolves metric
     * names to live values and evaluates the expression. This means OpenAI has complete control
     * over WHAT is monitored — we just need to be able to measure it.
     *
     * Supported metrics:
     *   hr            — current heart rate (bpm)
     *   pace          — current pace (sec/km)
     *   cadence       — current cadence (spm)
     *   distance      — total distance (km)
     *   distance_pct  — % of target distance complete (0–100)
     *   elapsed_min   — elapsed run time (minutes)
     *   targetHRMax   — plan-level target HR max (falls back to phase-level)
     *   targetHRMin   — plan-level target HR min
     *   targetPaceMax — plan-level target pace max (sec/km)
     *   targetPaceMin — plan-level target pace min (sec/km)
     *
     * Condition syntax:
     *   Single:   "hr > 150", "cadence < 165", "elapsed_min > 20"
     *   Compound: "hr > 145 AND cadence < 165", "pace < 330 AND elapsed_min > 5"
     *   Shorthand for plan targets: "hr > targetHRMax", "pace > targetPaceMax + 15"
     */
    private fun evaluateConditionExpression(
        condition: String,
        phaseHRMin: Int?,
        phaseHRMax: Int?,
        phasePaceMin: Int?,
        phasePaceMax: Int?,
        currentDistanceKm: Double,
        currentPhaseBaseName: String? = null,
    ): Boolean {
        if (condition.isBlank() || condition == "always") return true

        // Split on AND — all clauses must be true
        val clauses = condition.split(Regex("\\bAND\\b", RegexOption.IGNORE_CASE))
        return clauses.all { clause -> evaluateSingleClause(
            clause.trim(), phaseHRMin, phaseHRMax, phasePaceMin, phasePaceMax, currentDistanceKm, currentPhaseBaseName
        ) }
    }

    /**
     * Evaluate a single comparison clause e.g. "hr > 145" or "cadence < 165".
     * Resolves metric names and target keywords to live or configured values.
     *
     * Special case: "phase == recovery_walk" or "phase != jog" — string equality comparison
     * against the base phase name (without rep suffix). Used to scope reactive triggers to
     * specific phases (e.g. guardrail triggers that should only fire during recovery).
     */
    private fun evaluateSingleClause(
        clause: String,
        phaseHRMin: Int?,
        phaseHRMax: Int?,
        phasePaceMin: Int?,
        phasePaceMax: Int?,
        currentDistanceKm: Double,
        currentPhaseBaseName: String? = null,
    ): Boolean {
        // Tokenize: "metric  op  value"
        // Supports: "hr > 150", "hr > targetHRMax", "pace > targetPaceMax + 15", "cadence < 165"
        val tokenRegex = Regex("""^(\w+)\s*([><=!]+)\s*(.+)$""")
        val match = tokenRegex.find(clause) ?: return false
        val (metricToken, op, valueExpr) = match.destructured

        // ── Special case: phase name string comparison ──────────────────────
        // "phase == recovery_walk" fires only when the current base phase name matches.
        // Supports startsWith matching so "phase == recovery" matches "recovery_walk", "recovery_jog", etc.
        if (metricToken.lowercase() == "phase") {
            val baseName = currentPhaseBaseName ?: return false
            val target = valueExpr.trim()
            return when (op) {
                "==" -> baseName.startsWith(target, ignoreCase = true) || baseName.equals(target, ignoreCase = true)
                "!=" -> !baseName.startsWith(target, ignoreCase = true) && !baseName.equals(target, ignoreCase = true)
                else -> false
            }
        }

        // Resolve left-hand metric to live value (returns null if metric has no data yet)
        val lhsValue: Double = when (metricToken.lowercase()) {
            "hr"             -> if (currentHeartRate > 0) currentHeartRate.toDouble() else return false
            "pace"           -> { val p = parsePaceToSeconds(currentPace); if (p > 0) p.toDouble() else return false }
            "cadence"        -> if (currentCadence > 0) currentCadence.toDouble() else return false
            "distance"       -> currentDistanceKm
            "distance_pct"   -> {
                val td = (targetDistance ?: 0.0) / 1000.0
                if (td > 0) (currentDistanceKm / td * 100.0) else return false
            }
            "elapsed_min"    -> getActiveRunDuration() / 60_000.0
            // Metres remaining to target distance (e.g. "remaining_m < 500" for final 500m cue)
            "remaining_m"    -> {
                val td = targetDistance ?: inferredTargetDistance ?: return false
                val remainingM = td - (currentDistanceKm * 1000.0)
                if (remainingM < 0) return false  // Already past target — don't fire
                remainingM
            }
            // Minutes remaining to target duration (e.g. "remaining_min < 5" for final 5-min cue)
            "remaining_min"  -> {
                val totalDurMs = (dynamicCoachingPlan?.targetMetrics?.totalDurationMinutes ?: return false) * 60_000.0
                val remainingMs = totalDurMs - getActiveRunDuration()
                if (remainingMs < 0) return false  // Already past target duration
                remainingMs / 60_000.0
            }
            // Terrain — grade in % (positive = uphill, negative = downhill)
            "grade"          -> currentSmoothedGrade
            // Cumulative elevation gain in metres this session
            "elevation_gain" -> totalElevationGain
            else             -> return false   // Unknown metric — skip trigger safely
        }

        // Resolve right-hand value expression (may reference plan targets or be a plain number)
        // Examples: "150", "targetHRMax", "targetPaceMax + 15", "165"
        val rhsValue: Double = resolveRhsExpression(
            valueExpr.trim(), phaseHRMin, phaseHRMax, phasePaceMin, phasePaceMax
        ) ?: return false

        // ── HR upper-bound buffer ─────────────────────────────────────────────
        // When evaluating "hr > X" or "hr >= X" (i.e. HR-too-high checks), apply a 2%
        // buffer to the threshold so brief momentary spikes don't instantly trigger a
        // coaching intervention. A runner at 131 bpm target won't hear a zone-high alert
        // until their HR genuinely sustains above ~134 bpm (131 × 1.02 ≈ 133.6).
        //
        // The buffer only applies to HR comparisons in the upward direction (">", ">=").
        // HR low-bound checks ("hr < X", "hr <= X") are NOT buffered.
        val isHrUpwardCheck = metricToken.lowercase() == "hr" && (op == ">" || op == ">=")
        val effectiveRhs = if (isHrUpwardCheck) rhsValue * HR_ZONE_BUFFER_MULTIPLIER else rhsValue

        return when (op) {
            ">"  -> lhsValue > effectiveRhs
            ">=" -> lhsValue >= effectiveRhs
            "<"  -> lhsValue < rhsValue
            "<=" -> lhsValue <= rhsValue
            "==" -> lhsValue == rhsValue
            "!=" -> lhsValue != rhsValue
            else -> false
        }
    }

    /**
     * Resolve a right-hand side value expression to a Double.
     * Handles plan target keywords with optional arithmetic:
     *   "150"              → 150.0
     *   "targetHRMax"      → phaseHRMax (or null if not set)
     *   "targetHRMax - 10" → phaseHRMax - 10
     *   "targetPaceMax + 15" → phasePaceMax + 15
     */
    private fun resolveRhsExpression(
        expr: String,
        phaseHRMin: Int?,
        phaseHRMax: Int?,
        phasePaceMin: Int?,
        phasePaceMax: Int?,
    ): Double? {
        // Try plain number first
        expr.toDoubleOrNull()?.let { return it }

        // Try "keyword [ +/- number ]" pattern
        val arithRegex = Regex("""^(\w+)\s*([+\-])\s*(\d+(?:\.\d+)?)$""")
        val arithMatch = arithRegex.find(expr)
        val keyword = arithMatch?.groupValues?.get(1) ?: expr
        val arithOp  = arithMatch?.groupValues?.get(2)
        val arithVal = arithMatch?.groupValues?.get(3)?.toDoubleOrNull() ?: 0.0

        val base: Double = when (keyword.lowercase()) {
            "targethrmax",   "targetHRMax"   -> phaseHRMax?.toDouble() ?: return null
            "targethrmin",   "targetHRMin"   -> phaseHRMin?.toDouble() ?: return null
            "targetpacemax", "targetPaceMax" -> phasePaceMax?.toDouble() ?: return null
            "targetpacemin", "targetPaceMin" -> phasePaceMin?.toDouble() ?: return null
            else -> return null
        }
        return when (arithOp) {
            "+" -> base + arithVal
            "-" -> base - arithVal
            else -> base
        }
    }

    /**
     * Evaluate which phase the runner is in and fire phase_start / phase_end /
     * rep_start / rep_end / recovery_start triggers when phase boundaries are crossed.
     *
     * Supports BOTH distance-based phases (distanceKm) and time-based phases (durationMinutes),
     * and handles REPEATING interval phases via the `repetitions` field.
     *
     * Repeating interval phases (repetitions > 1):
     * Consecutive phases with repetitions > 1 form an "interval group" that interleaves:
     *   work (reps=10, 1min) + recovery_walk (reps=10, 2min)
     *   → work rep1, recovery rep1, work rep2, recovery rep2, … × 10
     * This allows interval sessions to be described with 2-4 phases instead of 20.
     *
     * Phase-start triggers bypass the 150m distance gate so they always fire at interval
     * transitions even when the athlete has covered less than 150m since the last cue.
     */
    private fun evaluateDynamicPhase(currentDistanceKm: Double, plan: live.airuncoach.airuncoach.network.model.DynamicSessionCoachingPlan) {
        val phases = plan.phases.sortedBy { it.order }
        if (phases.isEmpty()) return

        val elapsedMinutes = getActiveRunDuration() / 60000.0
        val isIntervalPlan = plan.cueingStrategy == "interval"

        // ── Build the expanded flat timeline ─────────────────────────────────
        // For phases with repetitions > 1, expand them into individual rep entries.
        // Consecutive phases with the same repetitions count are "grouped" and interleave.
        data class ExpandedPhase(
            val phase: live.airuncoach.airuncoach.network.model.DynamicCoachingPhase,
            val repNumber: Int,          // 1-indexed rep number (1 for non-repeating phases)
            val totalReps: Int,          // total reps for this phase (1 for non-repeating)
            val cumulativeMinStart: Double,
            val cumulativeKmStart: Double,
            val durationMin: Double,
            val distKm: Double
        )

        val expanded = mutableListOf<ExpandedPhase>()
        var cumMin = 0.0
        var cumKm = 0.0
        var i = 0

        while (i < phases.size) {
            val phase = phases[i]
            val reps = (phase.repetitions ?: 1).coerceAtLeast(1)

            if (reps > 1) {
                // This phase has repetitions — find consecutive sibling phases in the same group
                // (consecutive phases with non-null repetitions that have the same count)
                val groupPhases = mutableListOf(phase)
                var j = i + 1
                while (j < phases.size && (phases[j].repetitions ?: 1) > 1) {
                    groupPhases.add(phases[j])
                    j++
                }

                // Interleave: for each rep, add all group phases in order
                repeat(reps) { repIdx ->
                    for (gp in groupPhases) {
                        val pMin = gp.durationMinutes ?: 0.0
                        val pKm = gp.distanceKm ?: 0.0
                        expanded.add(ExpandedPhase(gp, repIdx + 1, reps, cumMin, cumKm, pMin, pKm))
                        cumMin += pMin
                        cumKm += pKm
                    }
                }
                i = j  // skip all processed group phases
            } else {
                val pMin = phase.durationMinutes ?: 0.0
                val pKm = phase.distanceKm ?: 0.0
                expanded.add(ExpandedPhase(phase, 1, 1, cumMin, cumKm, pMin, pKm))
                cumMin += pMin
                cumKm += pKm
                i++
            }
        }

        if (expanded.isEmpty()) return

        // ── Find which expanded entry we're currently in ──────────────────────
        var resolvedEntryIdx = expanded.size - 1

        for ((idx, entry) in expanded.withIndex()) {
            val stillInPhase = when {
                isIntervalPlan && entry.durationMin > 0 ->
                    elapsedMinutes < entry.cumulativeMinStart + entry.durationMin
                entry.distKm > 0 ->
                    currentDistanceKm < entry.cumulativeKmStart + entry.distKm
                entry.durationMin > 0 ->
                    elapsedMinutes < entry.cumulativeMinStart + entry.durationMin
                else -> false
            }
            if (stillInPhase) {
                resolvedEntryIdx = idx
                break
            }
        }

        val entry = expanded[resolvedEntryIdx]
        val resolvedPhase = entry.phase
        val repNumber = entry.repNumber
        val totalReps = entry.totalReps

        // Resolved phase name includes rep number for repeated phases, e.g. "work_rep_3_of_10"
        val resolvedPhaseName = if (totalReps > 1) "${resolvedPhase.name}_rep_${repNumber}_of_${totalReps}"
                                else resolvedPhase.name
        val isNewPhase = resolvedPhaseName != dynamicCurrentPhaseName

        if (isNewPhase) {
            val previousPhaseName = dynamicCurrentPhaseName
            dynamicCurrentPhaseIndex = resolvedEntryIdx
            dynamicCurrentPhaseName = resolvedPhaseName
            dynamicPhaseDistanceStartKm = currentDistanceKm
            dynamicPhaseTimeStartMin = elapsedMinutes
            dynamicPhaseDurationMin = entry.durationMin

            // "walk", "recovery", "rest", and "float" are rest/recovery phases.
            // NOTE: "jog" is intentionally NOT classified as recovery — in walk-run interval
            // sessions the jog is the WORK phase (even if easy), and misclassifying it as
            // recovery causes the wrong trigger type ("recovery_start" instead of "rep_start")
            // to be matched, which can produce incorrect coaching cues ("lightly jog" instead
            // of "start your easy jog" for the work phase).
            val isRecovery = resolvedPhase.name.lowercase().let {
                it.startsWith("recovery") || it.startsWith("walk") || it.startsWith("rest") || it.startsWith("float")
            }
            dynamicPhaseIsWorkInterval = !isRecovery

            // Reset ALL reactive ("on_condition") trigger cooldowns on every phase transition.
            // Each new interval phase (jog → walk → jog → walk…) deserves fresh HR/pace monitoring.
            // Without this, a 90-second cooldown from the previous phase would block reactive
            // feedback during the next interval even if conditions warrant it immediately.
            // NOTE: We reset ALL on_condition triggers — not just specific type names — because
            // OpenAI can name reactive triggers anything (hr_drift, cadence_alert, effort_check, etc.)
            plan.triggers
                .filter { t -> t.frequency == "on_condition" }
                .forEach { t -> triggerLastFiredMs.remove(t.id) }

            Log.d("RunTrackingService",
                "🏃 Dynamic phase: $previousPhaseName → $resolvedPhaseName " +
                "(${String.format("%.2f", currentDistanceKm)}km / ${String.format("%.1f", elapsedMinutes)}min) — reactive cooldowns reset")

            // ── Phase transition coaching ─────────────────────────────────────
            // For repeating interval phases (totalReps > 1): ALWAYS fire a live AI message
            // via OpenAI so the athlete hears "Rep 3 of 6 — push the effort, 60 seconds"
            // rather than a pre-written template (or silence if no trigger exists in the plan).
            //
            // For non-repeating phases: use the plan's phase_start trigger if present.
            // Bypass the 150m distance gate so transitions always fire for short interval phases.
            val phaseBaseName = resolvedPhase.name
            val triggerTypeToMatch = when {
                totalReps > 1 && isRecovery -> listOf("recovery_start", "rep_start", "phase_start")
                totalReps > 1              -> listOf("rep_start", "phase_start")
                else                       -> listOf("phase_start", "recovery_start")
            }

            // Find matching trigger from the plan (may be null for interval phases if AI didn't generate one)
            val phaseStartTrigger = plan.triggers.firstOrNull { t ->
                t.type in triggerTypeToMatch &&
                (t.condition.contains(phaseBaseName) || t.id.contains(phaseBaseName) ||
                 // Also match generic rep_start/recovery_start triggers (no phase name in id/condition)
                 (totalReps > 1 && t.type in listOf("rep_start", "recovery_start") &&
                  !t.condition.contains("phase ==") &&
                  !t.id.contains("warmup") && !t.id.contains("cooldown"))) &&
                // rep_start / recovery_start must fire on EVERY rep — never block via triggerFiredOnce.
                if (t.frequency == "once" && t.type !in listOf("rep_start", "recovery_start")) {
                    !triggerFiredOnce.contains(t.id)
                } else true
            }

            if (!hasCoachingFiredThisTick && canFireCoaching(bypassDistanceGate = true)) {

                if (totalReps > 1) {
                    // ── Interval rep transition: always use live AI ────────────────
                    // Use the plan's trigger (for its messages/alternativeMessages) or synthesize one.
                    // fireLiveTriggerMessage passes full interval context (rep number, phase duration,
                    // targets, live metrics) so OpenAI says "Rep 3 of 6 — hold this for 60 seconds."
                    val triggerForAI = phaseStartTrigger
                        ?: live.airuncoach.airuncoach.network.model.DynamicCoachingTrigger(
                            id = if (isRecovery) "recovery_start_auto" else "rep_start_auto",
                            type = if (isRecovery) "recovery_start" else "rep_start",
                            condition = "always",
                            message = if (isRecovery)
                                "Good work — ease off, let your heart rate come down."
                            else
                                "Rep {repNum} of {totalReps} — push the effort.",
                            frequency = "on_condition",
                            alternativeMessages = if (isRecovery) listOf(
                                "Nice rep — recover now, back off and breathe.",
                                "Good effort — ease right back, let the heart rate settle.",
                                "Recovery — bring it down and prepare for the next one.",
                            ) else listOf(
                                "Rep {repNum} of {totalReps} — commit to this one.",
                                "Here we go, rep {repNum}. Controlled and strong.",
                                "{repNum} of {totalReps} — stay relaxed and drive.",
                            ),
                            alertType = null,
                            suppressWhenIntensity = null,
                        )

                    // Track firing for plan-defined triggers (not synthetic ones)
                    if (phaseStartTrigger != null) {
                        if (phaseStartTrigger.frequency == "once") triggerFiredOnce.add(phaseStartTrigger.id)
                        triggerLastFiredMs[phaseStartTrigger.id] = System.currentTimeMillis()
                    }
                    // Reset midpoint tracking for the new work rep
                    if (!isRecovery) lastRepMidpointFiredAtRep = -1

                    hasCoachingFiredThisTick = true
                    Log.d("RunTrackingService",
                        "🏃 Interval ${if (isRecovery) "RECOVERY" else "WORK"} rep $repNumber/$totalReps — live AI rep transition")
                    fireLiveTriggerMessage(
                        trigger = triggerForAI,
                        phaseName = resolvedPhaseName,
                        phaseHRMin = resolvedPhase.targetHRMin,
                        phaseHRMax = resolvedPhase.targetHRMax,
                        phasePaceMin = resolvedPhase.targetPaceMin,
                        phasePaceMax = resolvedPhase.targetPaceMax,
                        currentDistanceKm = currentDistanceKm,
                        plan = plan,
                        currentPhase = resolvedPhase,
                    )

                } else if (phaseStartTrigger != null) {
                    // ── Non-interval phase: use plan trigger (existing behaviour) ─
                    val rawMsg = pickTriggerMessage(
                        phaseStartTrigger, repNumber, totalReps,
                        phaseHRMin = resolvedPhase.targetHRMin,
                        phaseHRMax = resolvedPhase.targetHRMax,
                        phasePaceMin = resolvedPhase.targetPaceMin,
                        phasePaceMax = resolvedPhase.targetPaceMax,
                    )
                    val isRepTransitionTrigger = phaseStartTrigger.type in listOf("rep_start", "recovery_start")
                    if (phaseStartTrigger.frequency == "once" && !isRepTransitionTrigger) {
                        triggerFiredOnce.add(phaseStartTrigger.id)
                    }
                    triggerLastFiredMs[phaseStartTrigger.id] = System.currentTimeMillis()
                    fireDynamicTrigger(rawMsg, phaseStartTrigger.type, resolvedPhaseName)
                }
            }
        }

        // ── Rep midpoint coaching (interval work phases only) ────────────────
        // Fires once per work rep at ~50% of its duration — gives the athlete a brief check-in
        // with seconds remaining, current pace, and whether effort is on target.
        // This is an always-on coaching opportunity that doesn't require a plan trigger.
        if (!hasCoachingFiredThisTick && isIntervalPlan &&
            dynamicPhaseIsWorkInterval && entry.totalReps > 1 &&
            entry.durationMin > 0 && lastRepMidpointFiredAtRep != repNumber) {

            val phaseElapsedSec = (elapsedMinutes - dynamicPhaseTimeStartMin) * 60.0
            val phaseTotalSec = entry.durationMin * 60.0
            val phaseFraction = if (phaseTotalSec > 0) phaseElapsedSec / phaseTotalSec else 0.0

            // Fire between 45%–60% through the rep (once only per rep, guarded by lastRepMidpointFiredAtRep)
            if (phaseFraction in 0.45..0.60 && canFireCoaching(bypassDistanceGate = true)) {
                lastRepMidpointFiredAtRep = repNumber
                val secsRemaining = (phaseTotalSec - phaseElapsedSec).coerceAtLeast(0.0).toInt()
                val midpointTrigger = live.airuncoach.airuncoach.network.model.DynamicCoachingTrigger(
                    id = "rep_midpoint_auto",
                    type = "rep_midpoint",
                    condition = "always",
                    message = "Halfway through rep {repNum} — $secsRemaining seconds to go, hold the effort.",
                    frequency = "on_condition",
                    alternativeMessages = listOf(
                        "Halfway — $secsRemaining seconds left on this rep. Stay strong.",
                        "Midpoint — $secsRemaining seconds remaining. Keep the pace.",
                        "$secsRemaining seconds left, rep {repNum} — don't let up now.",
                    ),
                    alertType = null,
                    suppressWhenIntensity = null,
                )
                hasCoachingFiredThisTick = true
                Log.d("RunTrackingService",
                    "⏱️ Rep $repNumber/$totalReps midpoint (${(phaseFraction * 100).toInt()}%) — live AI midpoint cue")
                fireLiveTriggerMessage(
                    trigger = midpointTrigger,
                    phaseName = resolvedPhaseName,
                    phaseHRMin = resolvedPhase.targetHRMin,
                    phaseHRMax = resolvedPhase.targetHRMax,
                    phasePaceMin = resolvedPhase.targetPaceMin,
                    phasePaceMax = resolvedPhase.targetPaceMax,
                    currentDistanceKm = currentDistanceKm,
                    plan = plan,
                    currentPhase = resolvedPhase,
                )
            }
        }

        // ── Phase-end warning ────────────────────────────────────────────────
        if (!hasCoachingFiredThisTick) {
            val nearPhaseEnd = when {
                isIntervalPlan && entry.durationMin > 0 -> {
                    val secsToEnd = (entry.cumulativeMinStart + entry.durationMin - elapsedMinutes) * 60.0
                    secsToEnd in 5.0..12.0
                }
                entry.distKm > 0 -> {
                    val distToEnd = entry.cumulativeKmStart + entry.distKm - currentDistanceKm
                    distToEnd in 0.05..0.10
                }
                entry.durationMin > 0 -> {
                    val secsToEnd = (entry.cumulativeMinStart + entry.durationMin - elapsedMinutes) * 60.0
                    secsToEnd in 5.0..12.0
                }
                else -> false
            }

            if (nearPhaseEnd) {
                val phaseEndTrigger = plan.triggers.firstOrNull { t ->
                    t.type == "phase_end" &&
                    (t.condition.contains(resolvedPhase.name) || t.id.contains(resolvedPhase.name)) &&
                    if (t.frequency == "once") !triggerFiredOnce.contains(t.id) else true
                }
                if (phaseEndTrigger != null && canFireCoaching(bypassDistanceGate = true)) {
                    val msg = pickTriggerMessage(
                        phaseEndTrigger, repNumber, totalReps,
                        phaseHRMin = resolvedPhase.targetHRMin,
                        phaseHRMax = resolvedPhase.targetHRMax,
                        phasePaceMin = resolvedPhase.targetPaceMin,
                        phasePaceMax = resolvedPhase.targetPaceMax,
                    )
                    if (phaseEndTrigger.frequency == "once") triggerFiredOnce.add(phaseEndTrigger.id)
                    fireDynamicTrigger(msg, "phase_end", resolvedPhaseName)
                }
            }
        }
    }

    /**
     * Evaluate a milestone trigger condition (e.g. "distance_pct > 50")
     */
    private fun evaluateMilestoneCondition(condition: String, currentKm: Double, totalKm: Double): Boolean {
        if (totalKm <= 0) return false
        val pct = (currentKm / totalKm * 100).toInt()
        val match = Regex("""distance_pct\s*[>>=]+\s*(\d+)""").find(condition)
        val threshold = match?.groupValues?.get(1)?.toIntOrNull() ?: return false
        return pct >= threshold
    }

    /**
     * Pick the best message for a trigger — rotates through alternativeMessages
     * so the runner doesn't hear the exact same phrase every time.
     *
     * After selecting the message, live-data template variables are resolved so the
     * athlete hears actual numbers (e.g. "Your heart rate is at {hr}" → "Your heart rate is at 148").
     */
    private fun pickTriggerMessage(
        trigger: live.airuncoach.airuncoach.network.model.DynamicCoachingTrigger,
        repNum: Int = 1,
        totalReps: Int = 1,
        phaseHRMin: Int? = null,
        phaseHRMax: Int? = null,
        phasePaceMin: Int? = null,
        phasePaceMax: Int? = null,
    ): String {
        val alts = trigger.alternativeMessages
        val allMessages = if (alts.isNullOrEmpty()) listOf(trigger.message)
                          else listOf(trigger.message) + alts
        val idx = triggerAltMessageIndex.getOrDefault(trigger.id, 0)
        val raw = allMessages[idx % allMessages.size]
        triggerAltMessageIndex[trigger.id] = (idx + 1) % allMessages.size
        return resolveTemplateVariables(raw, repNum, totalReps, phaseHRMin, phaseHRMax, phasePaceMin, phasePaceMax)
    }

    /**
     * Resolve live-data template variables in a coaching message string.
     *
     * Supported tokens:
     *  {hr}            — current heart rate (bpm)
     *  {hrZone}        — current HR zone (1–5)
     *  {pace}          — current pace formatted as "m:ss"
     *  {cadence}       — current cadence (spm)
     *  {repNum}        — current interval rep number (1-indexed)
     *  {totalReps}     — total reps in this interval group
     *  {repsLeft}      — reps remaining (totalReps - repNum)
     *  {elapsedMin}    — elapsed run time in whole minutes
     *  {distKm}        — total distance covered in km (1 d.p.)
     *  {targetHRMax}   — target HR max for the current phase
     *  {targetHRMin}   — target HR min for the current phase
     *  {targetPaceMin} — target pace floor for the current phase as "m:ss"
     *  {targetPaceMax} — target pace ceiling for the current phase as "m:ss"
     *  {grade}         — current slope as e.g. "+5%" (uphill) or "-3%" (downhill) or "flat"
     *  {elevationGain} — total elevation gain this session in metres (e.g. "45m")
     *  {remainingKm}   — distance remaining to target (e.g. "1.8")
     *  {remainingMin}  — time remaining to target duration in whole minutes
     */
    private fun resolveTemplateVariables(
        template: String,
        repNum: Int = 1,
        totalReps: Int = 1,
        phaseHRMin: Int? = null,
        phaseHRMax: Int? = null,
        phasePaceMin: Int? = null,
        phasePaceMax: Int? = null,
    ): String {
        if (!template.contains('{')) return template  // fast path — no templates

        // Age-adjusted HR zones using Tanaka formula: maxHR = 208 - (0.7 × age)
        // This is more accurate than the generic 220-age formula and the previous hardcoded
        // absolute thresholds (which were calibrated to a ~35 year old and wrong for everyone else).
        // Zone boundaries as % of age-adjusted max HR:
        //   Zone 1: <60%   Zone 2: 60–70%   Zone 3: 70–80%   Zone 4: 80–90%   Zone 5: ≥90%
        val userMaxHR = currentUser?.age
            ?.let { age -> (208 - 0.7 * age).toInt().coerceIn(150, 220) }
            ?: 190  // Fallback for unknown age (equivalent to ~25-year-old estimate)
        val hrZone = when {
            currentHeartRate <= 0                          -> "unknown"
            currentHeartRate < (userMaxHR * 0.60).toInt() -> "1"
            currentHeartRate < (userMaxHR * 0.70).toInt() -> "2"
            currentHeartRate < (userMaxHR * 0.80).toInt() -> "3"
            currentHeartRate < (userMaxHR * 0.90).toInt() -> "4"
            else                                           -> "5"
        }
        val elapsedMin  = (getActiveRunDuration() / 60_000L).toInt()
        val currentKm   = totalDistance / 1_000.0
        val distKmStr   = String.format("%.1f", currentKm)
        val paceStr     = currentPace.ifBlank { "—" }

        // Grade — show as "+N%" for uphill, "-N%" for downhill, "flat" for <0.5%
        val gradeStr = when {
            currentSmoothedGrade > 0.5  -> "+${currentSmoothedGrade.toInt()}%"
            currentSmoothedGrade < -0.5 -> "${currentSmoothedGrade.toInt()}%"
            else                        -> "flat"
        }
        val elevGainStr = "${totalElevationGain.toInt()}m"

        // Remaining distance — only meaningful when a target distance is set
        val remainingKmStr = (targetDistance?.let { it / 1000.0 - currentKm })
            ?.coerceAtLeast(0.0)
            ?.let { String.format("%.1f", it) }
            ?: "—"

        // Remaining time — only meaningful when a target time is set
        val remainingMinStr = targetTime
            ?.let { targetMs -> ((targetMs - getActiveRunDuration()) / 60_000L).coerceAtLeast(0L) }
            ?.toString()
            ?: "—"

        return template
            .replace("{hr}",            if (currentHeartRate > 0) "$currentHeartRate" else "—")
            .replace("{hrZone}",        hrZone)
            .replace("{pace}",          paceStr)
            .replace("{cadence}",       if (currentCadence > 0) "$currentCadence" else "—")
            .replace("{repNum}",        "$repNum")
            .replace("{totalReps}",     "$totalReps")
            .replace("{repsLeft}",      "${(totalReps - repNum).coerceAtLeast(0)}")
            .replace("{elapsedMin}",    "$elapsedMin")
            .replace("{distKm}",        distKmStr)
            .replace("{targetHRMax}",   phaseHRMax?.toString() ?: "—")
            .replace("{targetHRMin}",   phaseHRMin?.toString() ?: "—")
            .replace("{targetPaceMin}", phasePaceMin?.let { formatPace(it.toDouble()) } ?: "—")
            .replace("{targetPaceMax}", phasePaceMax?.let { formatPace(it.toDouble()) } ?: "—")
            .replace("{grade}",         gradeStr)
            .replace("{elevationGain}", elevGainStr)
            .replace("{remainingKm}",   remainingKmStr)
            .replace("{remainingMin}",  remainingMinStr)
    }

    // ── Polly audio cache helpers ────────────────────────���─────────────────────

    /**
     * Looks up a pre-generated Polly MP3 file for [text] from the coaching audio cache
     * that the ViewModel wrote at "Prepare Run" time.
     *
     * ONLY call this for messages that had no `{template}` variables at prepare time.
     * Template-containing messages (e.g. "Heart rate at {hr} right now") are resolved to
     * their live values at runtime and therefore cannot be matched to pre-generated files —
     * use [getRealtimePollyAudio] for those.
     *
     * Returns the file's bytes as a Base64 string (ready to pass to [CoachingAudioQueue])
     * or `null` if the file isn't cached (service falls back to Android TTS).
     */
    private fun getPreCachedPollyAudio(text: String): String? {
        val workoutId = planWorkoutId ?: return null
        return try {
            val file = File(applicationContext.cacheDir, "coaching_audio/$workoutId/${textMd5(text)}.mp3")
            if (file.exists()) {
                Base64.encodeToString(file.readBytes(), Base64.DEFAULT)
            } else {
                null
            }
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Could not read cached Polly audio: ${e.message}")
            null
        }
    }

    /**
     * Makes a real-time Polly TTS call for [resolvedText] (a message whose live-data
     * template variables have already been substituted, e.g. "Heart rate at 148 right now").
     *
     * Called from [fireDynamicTrigger] and [fireSessionPhaseTrigger] for messages that
     * contain `{template}` variables — these could not be pre-generated at prepare time
     * because the live values weren't known.
     *
     * The existing `/api/tts/generate` endpoint tries Polly first, then falls back to
     * OpenAI TTS, giving us the user's correct voice for every template-containing message.
     *
     * Expected latency: ~200-500ms (Polly neural) — barely perceptible during a run.
     * Returns null if the call fails; caller falls back to Android TTS.
     */
    private suspend fun getRealtimePollyAudio(resolvedText: String): String? {
        return try {
            val response = apiService.generateTts(
                GenerateTtsRequest(
                    text = resolvedText,
                    coachAccent = currentUser?.coachAccent,
                    coachGender = currentUser?.coachGender
                )
            )
            response.audio
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Real-time Polly call failed (using Android TTS): ${e.message}")
            null
        }
    }

    /**
     * MD5 hex of [text] — must match the identical function in RunSessionViewModel so the
     * ViewModel-written files are found by the service at run time.
     */
    private fun textMd5(text: String): String {
        val md = MessageDigest.getInstance("MD5")
        return md.digest(text.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    private fun fireDynamicTrigger(
        message: String,
        triggerType: String,
        phaseName: String,
        // Pre-fetched audio from live AI response — skips Polly lookup if provided
        overrideAudio: String? = null,
        overrideAudioFormat: String? = null,
    ) {
        if (hasCoachingFiredThisTick) return
        hasCoachingFiredThisTick = true
        recordCoachingFired()

        // ── Physiological delta — compute BEFORE updating the snapshot ────────
        // This gives us: "how did the athlete change since the PREVIOUS cue?"
        computePhysiologicalDelta()

        // ── Update session memory ──────────────────────────────────────────────
        val topic = extractTopicFromTriggerType(triggerType)
        sessionTopicsDiscussed.add(topic)
        sessionCueCount++
        lastCueTriggerType = triggerType
        lastCueFiredAtMs = System.currentTimeMillis()
        // Record current metric snapshot for next delta computation
        lastCueHrAtFire = currentHeartRate
        lastCuePaceAtFire = parsePaceToSeconds(currentPace)
        if (!isCriticalTrigger(triggerType, "on_condition")) {
            nonCriticalCueCount++
            lastNonCriticalCueMs = System.currentTimeMillis()
        }

        // Sanitise AI messages: replace abbreviation "HR" with full "heart rate" so TTS reads
        // naturally. The AI sometimes writes "HR at 143" or "HR still elevated" — we always
        // want "heart rate at 143" in spoken output.
        val sanitisedMessage = message
            .replace(Regex("\\bHR\\b"), "heart rate")
            .replace(Regex("\\bHR's\\b"), "heart rate's")

        Log.d("RunTrackingService", "🎯 Dynamic trigger [$triggerType] phase=$phaseName cue#$sessionCueCount topic=$topic: $sanitisedMessage")
        _latestCoachingText.value = sanitisedMessage

        // Record in coaching history so messages appear in the post-run summary and saved JSON.
        // Without this, dynamic trigger cues (phase transitions, HR/pace alerts) are invisible
        // in ai_coaching_notes even though the runner heard them during the session.
        coachingHistory.add(AiCoachingNote(
            time = getActiveRunDuration(),
            message = "[$triggerType] $sanitisedMessage"
        ))

        serviceScope.launch {
            try {
                if (!isMuted) {
                    // ── Polly audio routing ─────────────────────────────────────────────
                    // Priority 0: audio from live AI response (session-trigger-live endpoint
                    //             returns TTS audio alongside the message — use it directly).
                    // Priority 1: pre-cached Polly file (written at "Prepare Run" time for
                    //             static messages without live-data template variables).
                    // Priority 2: real-time Polly call — covers template-substituted messages
                    //             and any static messages not pre-cached.
                    // Priority 3: Android TTS fallback (Polly unavailable / network failure).
                    val base64Audio: String? = overrideAudio
                        ?.also { Log.d("RunTrackingService", "🎵 Live AI audio: ${sanitisedMessage.take(40)}") }
                        ?: getPreCachedPollyAudio(sanitisedMessage)
                            ?.also { Log.d("RunTrackingService", "🎵 Pre-cached Polly: ${sanitisedMessage.take(40)}") }
                        ?: getRealtimePollyAudio(sanitisedMessage)
                            ?.also { Log.d("RunTrackingService", "🎵 Real-time Polly: ${sanitisedMessage.take(40)}") }
                    val audioFormat: String? = overrideAudioFormat ?: if (base64Audio != null) "mp3" else null
                    CoachingAudioQueue.enqueue(
                        context = this@RunTrackingService,
                        base64Audio = base64Audio,
                        format = audioFormat,
                        fallbackText = sanitisedMessage,
                        accent = currentUser?.coachAccent,
                        gender = currentUser?.coachGender,
                        onComplete = { _latestCoachingText.value = null }
                    )
                }
                val runId = _currentRunSession.value?.id ?: "unknown"
                apiService.logCoachingEvent(
                    CoachingSessionEvent(
                        runId = runId,
                        plannedWorkoutId = planWorkoutId,
                        eventType = triggerType,
                        eventPhase = phaseName,
                        coachingMessage = sanitisedMessage,
                        coachingAudioUrl = null,
                        userMetrics = mapOf(
                            "distance_km" to totalDistance / 1000.0,
                            "pace" to currentPace,
                            "heart_rate" to currentHeartRate,
                            "dynamic_trigger" to true
                        ),
                        toneUsed = dynamicCoachingPlan?.coachingTone ?: sessionCoachingTone,
                        userEngagement = null
                    )
                )
            } catch (e: Exception) {
                Log.w("RunTrackingService", "Dynamic trigger delivery failed (non-fatal): ${e.message}")
            }
        }
    }

    private fun checkPhaseChange(newPhase: CoachingPhase) {
        if (!coachingFeaturePrefs.motivationalCoachingEnabled) return
        val now = System.currentTimeMillis()
        // Skip the null → EARLY transition: this is not a real phase change, it's just the
        // run starting. The run-start prompt and the 500m check-in already cover this window.
        // Firing here as well causes two coaching events within ~15 seconds at the 500m mark.
        // Real phase-change coaching fires on genuine transitions: EARLY→MID, MID→LATE, etc.
        if (newPhase != lastPhase && lastPhase != null && (now - lastCoachingTime) > COACHING_COOLDOWN_MS && canFireCoaching()) {
            lastPhase = newPhase
            lastCoachingTime = now
            hasCoachingFiredThisTick = true
            recordCoachingFired()
            Log.d("RunTrackingService", "Phase changed to $newPhase at ${totalDistance/1000.0}km - triggering coaching")
            serviceScope.launch {
                try {
                    // Calculate target pace from target time and distance if available
                    // targetTime is in milliseconds, targetDistance is in metres
                    val phaseTargetPaceStr = if (targetTime != null && targetDistance != null && targetDistance!! > 0) {
                        val totalSeconds = targetTime!! / 1000.0
                        val targetDistKm = targetDistance!! / 1000.0
                        val paceSecondsPerKm = totalSeconds / targetDistKm
                        val paceMin = (paceSecondsPerKm / 60).toInt()
                        val paceSec = (paceSecondsPerKm % 60).toInt()
                        "$paceMin:${paceSec.toString().padStart(2, '0')}"
                    } else null

                    // Calculate current average pace from actual distance/time
                    val phaseElapsedMs = getActiveRunDuration()
                    val phaseElapsedSec = phaseElapsedMs / 1000.0
                    val phaseDistKm = totalDistance / 1000.0
                    val phaseCurrentPaceStr = if (phaseDistKm > 0 && phaseElapsedSec > 0) {
                        val paceSecPerKm = phaseElapsedSec / phaseDistKm
                        formatPace(paceSecPerKm)
                    } else "0:00"

                    val update = PhaseCoachingUpdate(
                        phase = newPhase.name,
                        distance = totalDistance / 1000.0,
                        targetDistance = targetDistance?.let { it / 1000.0 },  // Convert metres to km
                        elapsedTime = getActiveRunDuration() / 1000,  // Convert ms to seconds
                        currentPace = phaseCurrentPaceStr,
                        currentGrade = currentSmoothedGrade,  // Real-time grade, not whole-run average
                        totalElevationGain = totalElevationGain,
                        heartRate = currentHeartRate.takeIf { it > 0 },
                        cadence = currentCadence.takeIf { it > 0 },
                        coachName = currentUser?.coachName,
                        coachTone = currentUser?.coachTone,
                        coachGender = currentUser?.coachGender,
                        coachAccent = currentUser?.coachAccent,
                        fitnessLevel = currentUser?.fitnessLevel,
                        runnerName = currentUser?.name,
                        runnerAge = currentUser?.age,
                    runnerWeight = currentUser?.weight,
                    runnerHeight = currentUser?.height,
                        activityType = currentActivityType,
                        hasRoute = hasGpsElevation || hasRoute,  // True when GPS altitude available, not just when planned route loaded
                        targetTime = targetTime?.let { (it / 1000).toInt() },
                        targetPace = phaseTargetPaceStr,
                        triggerType = "phase_change",
                        // Explicit target flag — LLM must never mention a target when this is false
                        hasTarget = (targetTime != null || phaseTargetPaceStr != null),
                        totalRunsAllTime = runHistoryStats?.totalRunsAllTime,
                        userId = currentUser?.id
                    )
                    val response = apiService.getPhaseCoaching(update)
                    coachingHistory.add(AiCoachingNote(
                        time = getActiveRunDuration(),
                        message = response.message
                    ))
                    Log.d("RunTrackingService", "Phase coaching response: ${response.message}")

                    // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
                } catch (e: Exception) {
                    Log.e("RunTrackingService", "Failed to get phase coaching", e)
                }
            }
        }
        lastPhase = newPhase
    }
    
    private fun triggerStruggleCoaching(currentPaceSeconds: Float, paceDropPercent: Float) {
        if (!coachingFeaturePrefs.struggleDetectionEnabled) return
        if (!canFireCoaching()) return
        recordCoachingFired()
        // Format baseline pace: baselinePace is in seconds/km, convert to km/h for calculatePace
        val baselinePaceFormatted = if (baselinePace > 0f) calculatePace(3600f / baselinePace) else "0:00"
        // Format current instantaneous pace from seconds/km
        val currentPaceFormatted = if (currentPaceSeconds > 0f && currentPaceSeconds < 3600f) {
            val minutes = (currentPaceSeconds / 60).toInt()
            val seconds = (currentPaceSeconds % 60).toInt()
            String.format("%d:%02d", minutes, seconds)
        } else "0:00"
        
        // Add struggle point to the list for post-run summary
        val strugglePoint = StrugglePoint(
            id = UUID.randomUUID().toString(),
            timestamp = getActiveRunDuration(),
            distanceMeters = totalDistance,
            paceAtStruggle = currentPaceFormatted,
            baselinePace = baselinePaceFormatted,
            paceDropPercent = paceDropPercent.toDouble(),
            currentGrade = calculateAverageGradient().toDouble(),
            heartRate = if (currentHeartRate > 0) currentHeartRate else null,
            location = routePoints.lastOrNull()
        )
        strugglePointsList.add(strugglePoint)
        
        serviceScope.launch {
            try {
                val update = StruggleUpdate(
                    distance = totalDistance / 1000.0,
                    elapsedTime = getActiveRunDuration() / 1000,  // Convert ms to seconds
                    currentPace = currentPaceFormatted,
                    baselinePace = baselinePaceFormatted,
                    paceDropPercent = paceDropPercent.toDouble(),
                    currentGrade = calculateAverageGradient().toDouble(),
                    totalElevationGain = totalElevationGain,
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    hasRoute = hasGpsElevation || hasRoute,  // True when GPS altitude available, not just when planned route loaded
                    // User profile
                    fitnessLevel = currentUser?.fitnessLevel,
                    runnerName = currentUser?.name,
                    runnerAge = currentUser?.age,
                    // Historical run context
                    runHistory = runHistoryStats,
                    // ========== NEW: Session Coaching Context ==========
                    linkedWorkoutId = planWorkoutId,
                    sessionCoachingTone = sessionCoachingTone,
                    sessionCoachingIntensity = sessionCoachingIntensity,
                    sessionStructure = sessionInstructions?.sessionStructure,
                    expectedMetricsFilters = sessionInstructions?.insightFilters,
                    workoutType = planWorkoutType,  // Tells AI this is a training session (not a race)
                    activityType = currentActivityType
                )
                val response = apiService.getStruggleCoaching(update)
                // Note: Struggle point already added above before launching coroutine
                coachingHistory.add(AiCoachingNote(
                    time = getActiveRunDuration(),
                    message = "Struggle: ${response.message}"
                ))
                
                // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                if (!isMuted) {
                    playCoachingAudio(response.audio, response.format, response.message)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
    
    private fun triggerKmSplitCoaching(split: KmSplit) {
        if (!coachingFeaturePrefs.kmSplitsEnabled) return
        serviceScope.launch {
            try {
                // Convert KmSplit times from ms to seconds for the backend
                val splitsForBackend = kmSplits.map { s ->
                    KmSplit(km = s.km, time = s.time / 1000, pace = s.pace)
                }
                
                // Compute overall average pace for context (separate from the split pace)
                val elapsedMs = getActiveRunDuration()
                val elapsedSec = elapsedMs / 1000.0
                val distKm = totalDistance / 1000.0
                val overallAvgPaceStr = if (distKm > 0 && elapsedSec > 0) {
                    formatPace(elapsedSec / distKm)
                } else "0:00"

                // Compute target pace string (from target time + distance) for split comparison
                val targetPaceStr = if (targetTime != null && targetDistance != null && targetDistance!! > 0) {
                    val totalSec = targetTime!! / 1000.0
                    val tDistKm = targetDistance!! / 1000.0
                    formatPace(totalSec / tDistKm)
                } else null

                val update = PaceUpdate(
                    distance = totalDistance / 1000.0,
                    targetDistance = targetDistance?.let { it / 1000.0 },  // Convert metres to km
                    currentPace = overallAvgPaceStr,  // Overall avg pace (for context/trend)
                    elapsedTime = getActiveRunDuration() / 1000,  // Convert ms to seconds
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    isSplit = true,
                    splitKm = split.km,
                    splitPace = split.pace,   // Pace for this specific km split
                    currentGrade = currentSmoothedGrade,   // Real-time grade, not whole-run average
                    totalElevationGain = totalElevationGain,
                    isOnHill = abs(currentSmoothedGrade) > UPHILL_GRADE_THRESHOLD,
                    kmSplits = splitsForBackend,  // Send with seconds, not milliseconds
                    hasRoute = hasGpsElevation,   // True when GPS altitude data is available
                    targetPace = targetPaceStr,   // Target pace so AI can compare split vs target
                    averagePace = overallAvgPaceStr,
                    cadence = currentCadence.takeIf { it > 0 },  // Live cadence for tempo/form coaching
                    heartRate = currentHeartRate.takeIf { it > 0 },  // Live HR for zone-aware split coaching
                    heartRateZoneTarget = dynamicCoachingPlan?.targetMetrics?.let { tm ->
                        if (tm.mainEffortHRMin != null || tm.mainEffortHRMax != null)
                            live.airuncoach.airuncoach.network.model.HRZoneTarget(min = tm.mainEffortHRMin, max = tm.mainEffortHRMax)
                        else null
                    },
                    // User profile
                    fitnessLevel = currentUser?.fitnessLevel,
                    runnerName = currentUser?.name,
                    runnerAge = currentUser?.age,
                    // Historical run context
                    runHistory = runHistoryStats,
                    // ========== NEW: Session Coaching Context ==========
                    linkedWorkoutId = planWorkoutId,
                    sessionCoachingTone = sessionCoachingTone,
                    currentSessionPhase = null,  // Phase detection can be added later if needed
                    workoutType = planWorkoutType,  // Tells AI this is a training session (not a race)
                    // ========== Route Memory Engine ==========
                    routeIntelligence = routeIntelligenceContext,
                    lastKmSplitSeconds = (split.time / 1000).toInt(),
                    // Session target pace — from the coaching plan's targetMetrics.
                    // Lets the AI compare the split against the session's prescribed effort,
                    // not the long-term race goal pace.
                    sessionTargetPaceMin = dynamicCoachingPlan?.targetMetrics?.mainEffortPaceMin,
                    sessionTargetPaceMax = dynamicCoachingPlan?.targetMetrics?.mainEffortPaceMax,
                    activityType = currentActivityType
                )
                val response = apiService.getPaceUpdate(update)
                coachingHistory.add(AiCoachingNote(
                    time = getActiveRunDuration(),
                    message = "Km ${split.km}: ${response.message}"
                ))
                Log.d("RunTrackingService", "Km ${split.km} split coaching: ${response.message}")

                // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                // (playCoachingAudio handles all text normalizations internally)
                if (!isMuted) {
                    playCoachingAudio(response.audio, response.format, response.message)
                }
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to get km split coaching", e)
            }
        }
    }

    /**
     * Updates the rolling HR buffer with a new reading and returns the validated HR
     * value if the reading is physiologically plausible, or null if it looks like
     * sensor contact loss.
     *
     * A reading is suspect when:
     *   1. It drops more than HR_MAX_SUDDEN_CHANGE_BPM bpm below the recent rolling
     *      average in a single update (classic wrist-sensor dropout pattern).
     *   2. It is outside the physiological range 35–220 bpm.
     *
     * If rejected, the current `currentHeartRate` is LEFT UNCHANGED (we keep the last
     * confident value).  The rejected sample is not added to the buffer so that a
     * brief sensor glitch doesn't corrupt the rolling average.
     *
     * @return the validated HR bpm, or null if this reading was rejected.
     */
    private fun validateAndUpdateHRBuffer(rawHr: Int): Int? {
        val now = System.currentTimeMillis()

        // Basic physiological range gate
        if (rawHr < 35 || rawHr > 220) return null

        // Expire readings older than HR_ROLLING_WINDOW_MS
        while (recentHrReadings.isNotEmpty() &&
            (now - recentHrReadings.first().first) > HR_ROLLING_WINDOW_MS) {
            recentHrReadings.removeFirst()
        }

        // Once we have a confident baseline, check for sudden large drops
        if (recentHrReadings.size >= HR_CONFIDENCE_WINDOW) {
            val rollingAvg = recentHrReadings.map { it.second }.average().toInt()
            val drop = rollingAvg - rawHr
            if (drop > HR_MAX_SUDDEN_CHANGE_BPM) {
                // Suspected sensor dropout — reject this reading
                Log.w("RunTrackingService",
                    "HR reading $rawHr rejected as suspected sensor dropout " +
                    "(rolling avg=$rollingAvg, drop=${drop}bpm > ${HR_MAX_SUDDEN_CHANGE_BPM}bpm threshold)")
                return null
            }
        }

        // Reading accepted — add to buffer
        recentHrReadings.addLast(Pair(now, rawHr))
        lastConfidentHr = rawHr

        // Also add to the trend buffer (capped at HR_TREND_WINDOW entries)
        hrTrendBuffer.addLast(rawHr)
        while (hrTrendBuffer.size > HR_TREND_WINDOW) hrTrendBuffer.removeFirst()

        return rawHr
    }

    /**
     * Returns true when we have enough confident HR samples and the current reading
     * is not flagged as a sensor anomaly.  Use this before firing any HR-based coaching
     * cue to avoid reacting to contact-loss artifacts.
     */
    private fun isHRReadingConfident(): Boolean {
        return recentHrReadings.size >= HR_CONFIDENCE_WINDOW && currentHeartRate > 0
    }

    /**
     * Returns a three-level HR confidence string for the AI.
     * High   = rolling window full, stable readings (low variance)
     * Medium = rolling window partial, or variance is notable
     * Low    = very few readings, or current HR is 0/implausible
     */
    private fun hrConfidenceLevel(): String {
        if (currentHeartRate <= 0) return "low"
        if (recentHrReadings.size < HR_CONFIDENCE_WINDOW) return "medium"
        val readings = recentHrReadings.map { it.second }
        val mean = readings.average()
        val variance = readings.map { (it - mean) * (it - mean) }.average()
        return when {
            variance < 25.0 -> "high"    // std dev < 5 bpm — very stable
            variance < 100.0 -> "medium" // std dev < 10 bpm — acceptable
            else -> "low"                // high variance — sensor contact issue
        }
    }

    /**
     * Returns a three-level GPS confidence string for the AI.
     * Based on the most recently accepted location's horizontal accuracy.
     * High   = <= 8m  (open sky or Garmin watch quality)
     * Medium = <= 20m (typical phone GPS)
     * Low    = > 20m  (urban canyon, tree cover, indoors)
     */
    private fun gpsConfidenceLevel(): String {
        if (lastGpsAccuracyM <= 0f) return "medium"
        return when {
            lastGpsAccuracyM <= 8f  -> "high"
            lastGpsAccuracyM <= 20f -> "medium"
            else -> "low"
        }
    }

    /**
     * Returns cadence confidence based on how recently we received a cadence reading
     * and whether the value looks plausible (140–220 spm for running).
     * Returns null if no cadence sensor is connected at all.
     */
    private fun cadenceConfidenceLevel(): String? {
        if (currentCadence <= 0) return null   // No cadence sensor connected
        return when {
            currentCadence in 140..220 -> "high"    // Normal running range
            currentCadence in 100..139 || currentCadence in 221..250 -> "medium"
            else -> "low"
        }
    }

    /**
     * Computes the physiological delta since the last coaching cue and updates
     * [lastCueHrDelta], [lastCuePaceDelta], [athleteRespondedToLastCue].
     * Call this BEFORE recording the current cue's snapshot, so we compute
     * delta = current − previous.
     *
     * "Responded" = HR fell after an HR-high cue, OR pace slowed after a pace-fast cue.
     * We use a simple heuristic: any meaningful delta (>= 3 bpm or >= 5 sec/km)
     * in the expected direction counts as a response.
     */
    private fun computePhysiologicalDelta() {
        if (lastCueHrAtFire <= 0 || sessionCueCount == 0) {
            lastCueHrDelta = null
            lastCuePaceDelta = null
            athleteRespondedToLastCue = null
            return
        }
        val hrDelta = if (currentHeartRate > 0 && lastCueHrAtFire > 0)
            currentHeartRate - lastCueHrAtFire else null   // negative = fell (good for HR alerts)
        val currentPaceSeconds = parsePaceToSeconds(currentPace)
        val paceDelta = if (currentPaceSeconds > 0 && lastCuePaceAtFire > 0)
            (currentPaceSeconds - lastCuePaceAtFire).toInt() else null   // positive = slower, negative = faster

        lastCueHrDelta = hrDelta
        lastCuePaceDelta = paceDelta

        val prevTopic = lastCueTriggerType?.let { extractTopicFromTriggerType(it) }
        athleteRespondedToLastCue = when (prevTopic) {
            "heart_rate" -> hrDelta != null && hrDelta <= -3  // HR came down
            "pace"       -> paceDelta != null && paceDelta >= 5  // slowed down (more sec/km)
            else         -> null  // Can't determine for other topics
        }
    }

    /**
     * Computes the current HR trend direction from [hrTrendBuffer].
     * Returns "rising", "stable", or "falling".
     * Requires at least 5 readings; returns "stable" otherwise.
     *
     * Algorithm: compare the average of the first-half readings vs. the average
     * of the second-half readings.  A delta > HR_TREND_MIN_DELTA_BPM in either
     * direction declares a trend.
     */
    private fun computeHRTrend(): String {
        val readings = hrTrendBuffer.toList()
        if (readings.size < 5) return "stable"
        val half = readings.size / 2
        val firstHalf = readings.take(half).average()
        val secondHalf = readings.takeLast(half).average()
        val delta = secondHalf - firstHalf
        return when {
            delta < -HR_TREND_MIN_DELTA_BPM -> "falling"
            delta > HR_TREND_MIN_DELTA_BPM  -> "rising"
            else                             -> "stable"
        }
    }

    /**
     * Computes the current pace trend direction from [recentPaceSecPerKm].
     * Returns "speeding_up", "stable", or "slowing".
     * Higher sec/km value = slower pace.
     */
    private fun computePaceTrend(): String {
        val readings = recentPaceSecPerKm.toList()
        if (readings.size < 5) return "stable"
        val half = readings.size / 2
        val firstHalf = readings.take(half).average()
        val secondHalf = readings.takeLast(half).average()
        val delta = secondHalf - firstHalf
        return when {
            delta > PACE_TREND_MIN_DELTA_SEC  -> "slowing"        // higher sec/km = slower
            delta < -PACE_TREND_MIN_DELTA_SEC -> "speeding_up"
            else                               -> "stable"
        }
    }

    /**
     * Updates [recentPaceSecPerKm] with a new pace reading.
     * Called on every GPS update where a valid pace is available.
     */
    private fun updatePaceTrendBuffer(paceSecPerKm: Double) {
        if (paceSecPerKm <= 0 || paceSecPerKm > 1200) return  // Ignore invalid/stopped readings
        recentPaceSecPerKm.addLast(paceSecPerKm)
        while (recentPaceSecPerKm.size > PACE_TREND_WINDOW) recentPaceSecPerKm.removeFirst()
    }

    private fun maybeTriggerHeartRateCoaching() {
        if (!coachingFeaturePrefs.heartRateCoachingEnabled) return
        if (currentHeartRate <= 0) return
        if (!isHRReadingConfident()) return  // Don't fire on unvalidated/sparse HR data
        val now = System.currentTimeMillis()
        val elapsedMinutes = (getActiveRunDuration() / 60000).toInt()
        if (elapsedMinutes <= 0) return
        if (elapsedMinutes % 3 != 0) return
        if (elapsedMinutes == lastHrCoachingMinute) return
        if (now - lastHrCoachingTime < HR_COOLDOWN_MS) return

        val avgHr = if (hrCount > 0) (hrSum / hrCount).toInt() else currentHeartRate
        // Calculate expected max HR from age if available; otherwise use highest recorded HR
        // IMPORTANT: Don't fall back to currentHeartRate as it's too low early in run!
        // Tanaka formula: maxHR = 208 - (0.7 × age)
        val userSnapshot = currentUser
        val maxHrValue = if (maxHr > 0) {
            maxHr
        } else if (userSnapshot?.age != null && userSnapshot.age!! > 0) {
            val calculatedMaxHr = (208 - (0.7 * userSnapshot.age!!)).toInt()
            calculatedMaxHr
        } else {
            190 // Generic fallback for unknown age
        }

        lastHrCoachingTime = now
        lastHrCoachingMinute = elapsedMinutes
        recordCoachingFired()
        hasCoachingFiredThisTick = true

        // ── Update session memory + physiological tracking ─────────────────────
        computePhysiologicalDelta()
        sessionTopicsDiscussed.add("heart_rate")
        sessionCueCount++
        lastCueTriggerType = "hr_coaching"
        lastCueFiredAtMs = now
        lastCueHrAtFire = currentHeartRate
        lastCuePaceAtFire = parsePaceToSeconds(currentPace).toDouble()

        serviceScope.launch {
            try {
                // Derive target zone number from plan intensity label (z1=1, z2=2, etc.)
                val derivedTargetZone = planWorkoutIntensity
                    ?.removePrefix("z")?.toIntOrNull() ?: 0
                val request = HeartRateCoachingRequest(
                    currentHR = currentHeartRate,
                    avgHR = avgHr,
                    maxHR = maxHrValue,
                    targetZone = derivedTargetZone,
                    elapsedMinutes = elapsedMinutes,
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    // User profile for age-adjusted HR zones
                    runnerAge = currentUser?.age,
                    fitnessLevel = currentUser?.fitnessLevel,
                    runnerName = currentUser?.name,
                    // Plan context so HR coaching can tell runner if they're in target zone
                    workoutIntensity = planWorkoutIntensity,
                    workoutType = planWorkoutType,
                    // ========== Session Coaching Context ==========
                    sessionCoachingTone = sessionCoachingTone,
                    linkedWorkoutId = planWorkoutId,
                    // Session memory
                    topicsDiscussed = sessionTopicsDiscussed.toList().ifEmpty { null },
                    topicsNotCovered = ALL_COACHING_TOPICS.filter { it !in sessionTopicsDiscussed }.ifEmpty { null },
                    sessionCueCount = sessionCueCount,
                    lastCueTriggerType = lastCueTriggerType,
                    minutesSinceLastCue = if (lastCueFiredAtMs > 0L)
                        (System.currentTimeMillis() - lastCueFiredAtMs) / 60_000.0 else null,
                    recentCoachingMessages = coachingHistory.takeLast(3).map { it.message }.ifEmpty { null },
                    // Sensor confidence
                    hrConfidence = hrConfidenceLevel(),
                    gpsConfidence = gpsConfidenceLevel(),
                    // Physiological response
                    lastCueHrDelta = lastCueHrDelta,
                    lastCuePaceDelta = lastCuePaceDelta,
                    athleteRespondedToLastCue = athleteRespondedToLastCue,
                    // Terrain context — HR coach can contextualise elevated HR against current terrain
                    // (e.g. "HR high because you're on a steep climb" vs "HR high on flat — check effort")
                    terrainContext = currentTerrainState.takeIf { it != "flat" },
                    activityType = currentActivityType
                )
                val response = apiService.getHeartRateCoaching(request)
                coachingHistory.add(AiCoachingNote(
                    time = getActiveRunDuration(),
                    message = "HR: ${response.message}"
                ))

                if (!isMuted) {
                    playCoachingAudio(response.audio, response.format, response.message)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun maybeTriggerCadenceCoaching() {
        if (!coachingFeaturePrefs.cadenceStrideEnabled) return
        // Coaching plan sessions: the plan owns all cadence guidance. It has access to {cadence}
        // in triggers and periodic messages — so if cadence coaching is relevant to THIS session
        // the AI will have designed triggers for it. A separate generic voice firing independently
        // would be context-ignorant and could contradict what the plan just said.
        if (isCoachingPlanActive) return

        // Walk sessions: traditional cadence (steps-per-minute) coaching is not appropriate for
        // walking. Walkers don't benefit from numerical spm targets the way runners do, and the
        // coaching feels clinical and unhelpful. Cadence is still recorded and sent to the AI as
        // context in every coaching request — but standalone "your cadence is X spm" messages are
        // suppressed. Walking rhythm, posture, arm swing, and HR-based coaching are far more
        // valuable and are delivered via the technique/elite coaching paths instead.
        if (currentActivityType == "walk") return

        if (currentCadence <= 0) return
        if (totalDistance < 1000) return // Need at least 1km of data

        val stride = getCurrentStrideAnalysis() ?: return

        // Skip if deviation is trivially small (<3%) — calling the API for 1-2 spm is noise not signal
        if (kotlin.math.abs(stride.cadenceDeviationPercent) < 3.0) return

        // ON_TARGET: within ±5% — still fire a brief positive message for good form awareness
        // but no correction needed. CLOSE / NEEDS_WORK require active coaching.
        // (ON_TARGET messages are intentionally shorter; the backend uses the tier to calibrate tone)

        val now = System.currentTimeMillis()

        // ── Rate-limit gate 1: rotate 10 km window ──────────────────────────────
        // When the runner crosses a 10 km boundary from the window start, reset the
        // per-window counter so the cap applies to each fresh 10 km stretch.
        if (totalDistance - cadenceCoachingWindowStartDistance >= CADENCE_WINDOW_DISTANCE_M) {
            cadenceCoachingWindowStartDistance = totalDistance
            cadenceCoachingCountInWindow = 0
            Log.d("RunTrackingService", "Cadence coaching window reset at ${totalDistance.toInt()}m")
        }

        // ── Rate-limit gate 2: hard 10 km cap ───────────────────────────────────
        // Never deliver more than CADENCE_MAX_PER_10KM cues in a single 10 km window.
        // This is the primary protection against overwhelming a runner with a persistent
        // sub-target cadence (e.g. due to injury).
        if (cadenceCoachingCountInWindow >= CADENCE_MAX_PER_10KM) return

        // ── Rate-limit gate 3: 1 km minimum distance between cues ───────────────
        // Replaces the old 2-minute time cooldown.  Distance-based cooldown adapts
        // naturally to run pace — a fast runner and a slow runner both get at least
        // 1 km of uninterrupted running between prompts.
        if (totalDistance - lastCadenceCoachingDistance < CADENCE_MIN_DISTANCE_M) return

        // Global coaching cooldown (30 s gap between any coaching type)
        if ((now - lastCoachingTime) < COACHING_COOLDOWN_MS) return

        // Current GPS speed (m/s) used to decide whether the pace has shifted enough to
        // warrant fresh coaching even if a cue has already fired this run.
        val currentSpeedMs = if (routePoints.isNotEmpty() && routePoints.last().speed != null && routePoints.last().speed!! > 0.5f) {
            routePoints.last().speed!!.toDouble()
        } else if (routePoints.size >= 2) {
            val last = routePoints.last()
            val prev = routePoints[routePoints.size - 2]
            val dt = (last.timestamp - prev.timestamp) / 1000.0
            if (dt > 0) calculateDistance(prev, last) / dt else 0.0
        } else 0.0

        // Re-fire logic — cadence coaching is NOT limited to once per run.
        // A runner who changes pace substantially or stays non-optimal deserves
        // fresh, relevant advice (subject to the distance and cap limits above).
        //
        // Three conditions that each independently allow the cue to fire:
        //   1. First-time: cue has never fired this run.
        //   2. Pace shift: speed has changed by >0.5 m/s (~30 sec/km) since last cue — the
        //      biomechanics target has shifted enough that the previous cue is now stale.
        //   3. Sustained issue: runner has covered 2+ km since last cue and is still
        //      non-optimal (form drift / fatigue) — replaces old 8-minute time interval.
        val speedDelta = kotlin.math.abs(currentSpeedMs - lastCadenceCoachingSpeedMs)
        val paceBucketChanged = hasCadenceCoachingFired && speedDelta >= CADENCE_REFIRE_SPEED_DELTA_MS
        val sustainedIssue = hasCadenceCoachingFired &&
            (totalDistance - lastCadenceCoachingDistance) >= CADENCE_REPEAT_DISTANCE_M

        val shouldFire = !hasCadenceCoachingFired || paceBucketChanged || sustainedIssue
        if (!shouldFire) return

        hasCadenceCoachingFired = true
        lastCadenceCoachingTime = now
        lastCadenceCoachingDistance = totalDistance
        cadenceCoachingCountInWindow++
        lastCadenceCoachingSpeedMs = currentSpeedMs
        lastCoachingTime = now
        lastStrideZone = stride.cadenceProximityTier
        hasCoachingFiredThisTick = true
        recordCoachingFired()

        // Capture snapshot values for the coroutine (avoid capturing mutable service state)
        val snapshotSpeed = currentSpeedMs
        val snapshotGrade = currentSmoothedGrade
        val snapshotTerrain = stride.terrainContext

        serviceScope.launch {
            try {
                // Derive the target pace string from the stored pace (seconds/km)
                val cadenceTargetPaceStr = if (targetPaceSecondsPerKm > 0) {
                    formatPace(targetPaceSecondsPerKm)
                } else null

                // Collect the last 2 cadence coaching messages for anti-repetition context
                val recentCadenceMsgs = coachingHistory
                    .filter { it.message.startsWith("Cadence:") }
                    .takeLast(2)
                    .map { it.message.removePrefix("Cadence: ") }
                    .ifEmpty { null }

                val request = CadenceCoachingRequest(
                    cadence = stride.cadence,
                    cadenceProximityTier = stride.cadenceProximityTier,
                    cadenceDeviationPercent = stride.cadenceDeviationPercent,
                    currentPace = currentPace,
                    targetPace = cadenceTargetPaceStr,
                    targetTime = targetTime?.let { it / 1000 },  // Convert ms to seconds
                    // optimalCadenceTarget now reflects both pace AND current gradient
                    optimalCadenceTarget = stride.optimalCadenceTarget,
                    optimalCadenceMin = stride.optimalCadenceMin,
                    optimalCadenceMax = stride.optimalCadenceMax,
                    speed = snapshotSpeed,
                    distance = totalDistance / 1000.0,
                    elapsedTime = getActiveRunDuration() / 1000,  // Convert ms to seconds
                    heartRate = if (currentHeartRate > 0) currentHeartRate else null,
                    userHeight = currentUser?.height?.let { it / 100.0 },
                    userWeight = currentUser?.weight?.toDouble(),
                    userAge = currentUser?.age,
                    fitnessLevel = currentUser?.fitnessLevel,
                    totalRunsAllTime = runHistoryStats?.totalRunsAllTime,
                    // Terrain context — lets AI tailor advice for hills vs flat terrain
                    currentGrade = snapshotGrade,
                    terrainContext = snapshotTerrain,
                    isFatigued = stride.isFatigued,
                    recentCadenceMessages = recentCadenceMsgs,
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    activityType = currentActivityType,
                    // Cross-platform fields matching iOS WALKING_COACHING_SPEC
                    exerciseType = if (currentActivityType == "walk") "WALKING" else "RUNNING",
                    cadenceRole = if (currentActivityType == "walk") "context_only" else "primary_metric"
                )
                val response = apiService.getCadenceCoaching(request)
                coachingHistory.add(AiCoachingNote(
                    time = getActiveRunDuration(),
                    message = "Cadence: ${response.message}"
                ))
                if (!isMuted) {
                    playCoachingAudio(response.audio, response.format, response.message)
                }
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to get cadence coaching", e)
            }
        }
    }

    // ================================================================
    // ELITE COACHING — additional real-time coaching triggers
    // ================================================================

    /**
     * Final-stretch-only coaching for coached sessions.
     * During a coaching plan run, all generic milestone/technique/ETA elite cues are
     * suppressed — the dynamic plan handles all in-session motivation.
     * Only the final 500m, 250m, and 100m "push" cues are preserved as they are
     * universal to every session regardless of type.
     */
    private fun maybeFinalStretchCoaching(displayDistance: Double, duration: Long, avgSpeed: Float) {
        if (!coachingFeaturePrefs.motivationalCoachingEnabled) return
        val now = System.currentTimeMillis()
        val td = targetDistance ?: inferredTargetDistance
        val remainingMeters = if (td != null && td > 0) (td - displayDistance) else null

        // FINAL 100m — highest priority, bypasses cooldowns (fires once)
        if (!hasFinal100mFired && remainingMeters != null && remainingMeters in 0.0..120.0) {
            hasFinal100mFired = true
            fireFinalCoaching("final_100m", displayDistance / 1000.0, duration, avgSpeed, remainingMeters)
            return
        }

        // FINAL 250m — fires between 500m and 100m remaining (fires once)
        if (!hasFinal250mFired && remainingMeters != null && remainingMeters in 0.0..275.0) {
            if ((now - lastCoachingTime) < 10_000L) return
            hasFinal250mFired = true
            fireFinalCoaching("final_250m", displayDistance / 1000.0, duration, avgSpeed, remainingMeters)
            return
        }

        // FINAL 500m — very high priority (fires once)
        if (!hasFinal500mFired && remainingMeters != null && remainingMeters in 0.0..550.0) {
            if ((now - lastCoachingTime) < 10_000L) return
            hasFinal500mFired = true
            fireFinalCoaching("final_500m", displayDistance / 1000.0, duration, avgSpeed, remainingMeters)
        }
    }

    private fun maybeFireEliteCoaching(displayDistance: Double, duration: Long, avgSpeed: Float, phase: CoachingPhase) {
        if (!coachingFeaturePrefs.motivationalCoachingEnabled) return
        if (totalDistance < 1000) return // Need at least 1km of data
        val now = System.currentTimeMillis()

        val distKm = displayDistance / 1000.0
        val currentKm = distKm.toInt()
        val td = targetDistance ?: inferredTargetDistance // Use inferred if no explicit target
        val remainingMeters = if (td != null && td > 0) (td - displayDistance) else null

        // FINAL 100m — highest priority, bypasses cooldowns (fires once)
        if (!hasFinal100mFired && remainingMeters != null && remainingMeters in 0.0..120.0) {
            hasFinal100mFired = true
            fireFinalCoaching("final_100m", distKm, duration, avgSpeed, remainingMeters)
            return
        }

        // FINAL 250m — fires between 500m and 100m remaining (fires once)
        if (!hasFinal250mFired && remainingMeters != null && remainingMeters in 0.0..275.0) {
            if ((now - lastCoachingTime) < 10_000L) return // minimal 10s gap only
            hasFinal250mFired = true
            fireFinalCoaching("final_250m", distKm, duration, avgSpeed, remainingMeters)
            return
        }

        // FINAL 500m — very high priority, bypasses elite cooldown (fires once)
        if (!hasFinal500mFired && remainingMeters != null && remainingMeters in 0.0..550.0) {
            if ((now - lastCoachingTime) < 10_000L) return // minimal 10s gap only
            hasFinal500mFired = true
            fireFinalCoaching("final_500m", distKm, duration, avgSpeed, remainingMeters)
            return
        }

        // In the final 500m, don't fire any analysis/summary coaching — only final motivation above
        if (isInFinalStretch()) return
        
        // Standard elite coaching — respect cooldowns
        if ((now - lastEliteCoachingTime) < ELITE_COACHING_COOLDOWN_MS) return
        if ((now - lastCoachingTime) < COACHING_COOLDOWN_MS) return

        // Priority order: milestone > target ETA > pace trend > positive reinforcement > technique > elevation
        when {
            shouldTriggerMilestone(distKm) -> fireMilestoneCoaching(distKm, duration, avgSpeed)
            shouldTriggerTargetEta(currentKm, distKm, duration) -> fireTargetEtaCoaching(distKm, duration, avgSpeed)
            shouldTriggerPaceTrend(currentKm) -> firePaceTrendCoaching(distKm, duration, avgSpeed)
            shouldTriggerPositiveReinforcement(currentKm) -> firePositiveReinforcementCoaching(distKm, duration, avgSpeed)
            shouldTriggerTechnique(now) -> fireTechniqueCoaching(distKm, duration, avgSpeed, phase)
            shouldTriggerElevationInsight(now) -> fireElevationInsightCoaching(distKm, duration, avgSpeed)
        }
    }

    // --- Condition checks ---

    private fun shouldTriggerMilestone(distKm: Double): Boolean {
        val td = targetDistance ?: return false
        if (td <= 0) return false
        val pct = (distKm / td * 100).toInt()
        // Check if any milestone threshold has been crossed
        val hasMilestone = when {
            lastMilestonePercent < 25 && pct >= 25 -> true
            lastMilestonePercent < 50 && pct >= 50 -> true
            lastMilestonePercent < 75 && pct >= 75 -> true
            else -> false
        }
        if (!hasMilestone) return false
        // Don't fire within 200m of a km split to avoid overlap
        val distFromKm = (distKm * 1000) % 1000
        return distFromKm > 200 && distFromKm < 800
    }

    @Suppress("UNUSED_PARAMETER")
    private fun shouldTriggerTargetEta(currentKm: Int, distKm: Double, duration: Long): Boolean {
        if (targetTime == null || targetTime!! <= 0) return false
        if (currentKm <= lastTargetEtaKm) return false
        if (currentKm < 2) return false // Need at least 2km for meaningful projection
        // Fire every 2km
        return currentKm % 2 == 0
    }

    private fun shouldTriggerPaceTrend(currentKm: Int): Boolean {
        if (kmSplits.size < 3) return false
        if (currentKm <= lastPaceTrendCheckKm) return false
        // Check every 2km after 3km
        return currentKm >= 3 && currentKm % 2 == 1
    }

    private fun shouldTriggerPositiveReinforcement(currentKm: Int): Boolean {
        if (kmSplits.size < 3) return false
        if (currentKm <= lastPositiveReinforcementKm) return false
        // Check if runner deserves reinforcement
        return detectPositiveRunning()
    }

    private fun shouldTriggerTechnique(now: Long): Boolean {
        if (totalDistance < 1500) return false // Wait at least 1.5km
        return (now - lastTechniqueCoachingTime) > TECHNIQUE_INTERVAL_MS
    }

    private fun shouldTriggerElevationInsight(now: Long): Boolean {
        if (!hasRoute) return false
        // Require at least 1km before any elevation coaching fires (prevents false positives at run start)
        if (totalDistance < 1000.0) return false
        // Check BOTH cooldowns — elevation insight shares the cooldown with terrain coaching to prevent
        // back-to-back messages from the two separate elevation systems
        if ((now - lastElevationInsightTime) < ELEVATION_INSIGHT_COOLDOWN_MS) return false
        if ((now - lastElevationCoachingTime) < ELEVATION_COOLDOWN_MS) return false
        val grade = calculateAverageGradient()
        return abs(grade) > 3f // Only when on a meaningful incline/decline
    }

    // --- Detection helpers ---

    private fun detectPositiveRunning(): Boolean {
        if (kmSplits.size < 3) return false
        val recentSplits = kmSplits.takeLast(3)
        val paceSecs = recentSplits.map { split ->
            val parts = split.pace.split(":")
            if (parts.size == 2) parts[0].toIntOrNull()?.times(60)?.plus(parts[1].toIntOrNull() ?: 0) ?: 0 else 0
        }
        if (paceSecs.any { it == 0 }) return false

        // Check for consistency (all within 10s of each other)
        val spread = paceSecs.max() - paceSecs.min()
        if (spread <= 10) return true

        // Check for negative splitting (each split faster)
        if (paceSecs.zipWithNext().all { (a, b) -> b <= a }) return true

        return false
    }

    private fun detectPaceTrend(): Triple<String, Int, Boolean> {
        // Returns (direction, avgDeltaPerKm, isNegativeSplitting)
        if (kmSplits.size < 3) return Triple("consistent", 0, false)
        val recentSplits = kmSplits.takeLast(4).takeIf { it.size >= 3 } ?: kmSplits.takeLast(3)
        val paceSecs = recentSplits.map { split ->
            val parts = split.pace.split(":")
            if (parts.size == 2) parts[0].toIntOrNull()?.times(60)?.plus(parts[1].toIntOrNull() ?: 0) ?: 0 else 0
        }
        if (paceSecs.any { it == 0 }) return Triple("consistent", 0, false)

        val deltas = paceSecs.zipWithNext().map { (a, b) -> b - a }
        val avgDelta = deltas.sum() / deltas.size
        val isNegSplit = deltas.all { it <= 0 }

        return when {
            avgDelta > 5 -> Triple("slowing", avgDelta, false)
            avgDelta < -5 -> Triple("speeding_up", abs(avgDelta), isNegSplit)
            else -> Triple("consistent", abs(avgDelta), isNegSplit)
        }
    }

    // --- Fire functions ---

    /**
     * Format distance for AI: 4.0 km → "4 km", 3.48 km → "3.4 km"
     */
    private fun formatDistanceForAI(km: Double): String {
        return if (km == km.toInt().toDouble()) {
            "${km.toInt()} km"
        } else {
            "${String.format("%.1f", km)} km"
        }
    }

    /**
     * Fire the start coaching when a run begins.
     *
     * For coached plan sessions: uses the AI-generated preRunBrief from the dynamic coaching plan
     * to give the athlete a specific, session-aware briefing (e.g. "Today is a 1.5km interval
     * session — 1 minute jog then 2 minute walk for 10 reps. Stay in zone 2…").
     *
     * For free runs: generates a short tone-based motivational prompt.
     */
    private fun fireStartCoaching() {
        if (!coachingFeaturePrefs.motivationalCoachingEnabled) return

        serviceScope.launch {
            try {
                // ── Coached plan session: use the AI-generated preRunBrief ────────────
                // This gives the athlete a session-specific briefing instead of a generic prompt.
                val planPreRunBrief = dynamicCoachingPlan?.preRunBrief?.takeIf { it.isNotBlank() }
                val startPrompt = if (planPreRunBrief != null) {
                    Log.d("RunTrackingService", "Using coaching plan preRunBrief for start message")
                    planPreRunBrief
                } else {
                    // Free run: generate a short tone-appropriate motivational prompt
                    val tone = currentUser?.coachTone ?: "encouraging"
                    generateStartPromptByTone(tone)
                }

                // Log as a coaching note for the run history
                coachingHistory.add(AiCoachingNote(
                    time = 0,
                    message = startPrompt
                ))

                if (!isMuted) {
                    try {
                        // Include user's voice preferences so server-side Polly TTS selects the
                        // closest matching voice to the user's configured coach voice — this keeps
                        // the opening brief consistent with all subsequent coaching audio.
                        val audioRequest = live.airuncoach.airuncoach.network.model.StartRunAudioRequest(
                            motivationalText = startPrompt,
                            coachAccent = currentUser?.coachAccent,
                            coachGender = currentUser?.coachGender,
                            coachName   = currentUser?.coachName,
                            activityType = currentActivityType
                        )
                        
                        val audioResponse = if (currentActivityType == "walk") {
                            apiService.getStartWalkAudio(audioRequest)
                        } else {
                            apiService.getStartRunAudio(audioRequest)
                        }

                        if (audioResponse.audio != null && audioResponse.format != null) {
                            Log.d("RunTrackingService", "Start coaching audio via Polly TTS (plan=${planPreRunBrief != null}, accent=${currentUser?.coachAccent}, gender=${currentUser?.coachGender})")
                            playCoachingAudio(audioResponse.audio, audioResponse.format, startPrompt)
                        } else {
                            // Polly returned no audio — fall back to device TTS with user's voice settings
                            playCoachingAudio(null, null, startPrompt)
                        }
                    } catch (e: Exception) {
                        Log.w("RunTrackingService", "Failed to get Polly TTS audio: ${e.message}, using device TTS fallback")
                        playCoachingAudio(null, null, startPrompt)
                    }
                }

                Log.d("RunTrackingService", "Start coaching (plan=${planPreRunBrief != null}): $startPrompt")
            } catch (e: Exception) {
                Log.w("RunTrackingService", "Start prompt generation failed, using fallback: ${e.message}")
                fireStartCoachingFallback()
            }
        }
    }
    
    /**
     * Generate a start prompt tailored to the user's coaching tone preference.
     * Branches on currentActivityType — this is a local fallback used when the server-side
     * (already activity-aware) generation fails, so it must not default to running language
     * for a walk session. See RunTrackingService.currentActivityType.
     */
    private fun generateStartPromptByTone(tone: String): String {
        val isWalk = currentActivityType == "walk"
        return when (tone.lowercase()) {
            "technical" -> {
                val prompts = if (isWalk) listOf(
                    "Focus on posture, steady rhythm, optimize your stride.",
                    "Maintain steady effort, monitor your pace.",
                    "Execute your walking technique, control your effort.",
                    "Optimize pace, focus on rhythm and efficiency.",
                    "Engage core, maintain form, control your pace."
                ) else listOf(
                    "Focus on form, steady cadence, optimize your stride.",
                    "Maintain steady effort, monitor your pace zones.",
                    "Execute your running technique, control your effort.",
                    "Optimize pace, focus on rhythm and efficiency.",
                    "Engage core, maintain form, control your pace."
                )
                prompts.random()
            }
            "calm" -> {
                val prompts = if (isWalk) listOf(
                    "Breathe easy, enjoy the moment, you've got this.",
                    "Find your rhythm, settle into a comfortable pace.",
                    "Take it easy, trust the process, relax.",
                    "Ease into it, trust your body, breathe.",
                    "Let's flow, stay composed, find your groove."
                ) else listOf(
                    "Breathe easy, enjoy the moment, you've got this.",
                    "Find your rhythm, settle into a comfortable pace.",
                    "Take it easy, trust your training, relax.",
                    "Ease into it, trust your body, breathe.",
                    "Let's flow, stay composed, find your groove."
                )
                prompts.random()
            }
            "motivational" -> {
                val prompts = if (isWalk) listOf(
                    "This is your moment — let's make it count!",
                    "Push yourself, chase greatness, give it your all!",
                    "You're stronger than you think — prove it today!",
                    "Go all in, embrace the challenge, own it!",
                    "This is your time — show what you're made of!"
                ) else listOf(
                    "This is your moment — let's crush it!",
                    "Push hard, chase greatness, leave it all out there!",
                    "You're stronger than you think — prove it today!",
                    "Go all in, embrace the challenge, dominate!",
                    "This is your time — show what you're made of!"
                )
                prompts.random()
            }
            "playful" -> {
                val prompts = if (isWalk) listOf(
                    "Let's have fun out there, one foot after another!",
                    "Time to play, bring your energy, enjoy the walk!",
                    "Make it fun, smile and go, walking is awesome!",
                    "Let's go, have a blast, enjoy every step!",
                    "Have fun, be silly, embrace the joy of walking!"
                ) else listOf(
                    "Let's have fun out there, one foot after another!",
                    "Time to play, bring your energy, enjoy the run!",
                    "Make it fun, smile and go, running is awesome!",
                    "Let's play, have a blast, enjoy every step!",
                    "Have fun, be silly, embrace the joy of running!"
                )
                prompts.random()
            }
            else -> { // "encouraging" or default
                val prompts = if (isWalk) listOf(
                    "Let's go! You've got this.",
                    "You're ready — let's walk.",
                    "Trust the process — let's go.",
                    "Great start — keep it going.",
                    "You've got everything you need."
                ) else listOf(
                    "Let's go! You've got this.",
                    "You're ready — let's run.",
                    "Trust your training — let's go.",
                    "Great start — keep it going.",
                    "You've got everything you need."
                )
                prompts.random()
            }
        }
    }
    
    /**
     * Fallback function: generic start prompts when AI generation fails.
     * Branches on currentActivityType for the same reason generateStartPromptByTone does —
     * this is the last-resort local fallback, so it's the one place a forgotten walk branch
     * is guaranteed to be heard by the user.
     */
    private fun fireStartCoachingFallback() {
        val isWalk = currentActivityType == "walk"
        val prompts = if (isWalk) listOf(
            // Action & Energy
            "Let's go! You've got this.",
            "Time to move — let's walk!",
            "Here we go — let's do this!",
            "Walk strong, walk happy!",
            "Let's make this walk count!",

            // Confidence
            "You've got this — own it.",
            "You're ready — let's walk.",
            "Trust the process — let's go.",
            "This is your moment — make it yours.",
            "You've got everything you need.",

            // Rhythm & Form
            "Find your rhythm — stay smooth.",
            "Relax and settle in — you've got this.",
            "Breathe deep, walk strong.",
            "Focus on posture — the rest will come.",
            "One step at a time — that's all.",

            // Mindset
            "Stay present — walk now.",
            "Clear your mind — just walk.",
            "Think less, walk more.",
            "This is your time — enjoy it.",
            "Let go and walk free.",

            // Encouragement
            "Great start — keep it going.",
            "You're moving — stay with it.",
            "Every step counts — let's go.",
            "Progress, not perfection — let's walk.",
            "You've started strong — finish stronger.",

            // Fun & Joy
            "Smile — walking is awesome!",
            "Walking is the best therapy — enjoy it.",
            "This is your happy place — make it yours.",
            "Feel the joy of walking — let's go!",
            "Walking beats sitting — let's do this!",

            // Challenge
            "Push through — you're stronger than you think.",
            "Embrace the effort — it makes you.",
            "Challenge is where growth happens.",
            "This is what you showed up for.",
            "Give it everything you've got today.",

            // Simplicity
            "Just walk — that's all.",
            "Forward is the only direction.",
            "Walk your own pace, your own way.",
            "Simple: put one foot in front of the other.",
            "Walking doesn't need to be complicated.",

            // Nature & Body
            "Feel your feet hitting the ground.",
            "Match your breath to your steps.",
            "Walk tall — feel alive!",
            "Your body knows how to do this.",
            "Listen to your body — it knows the way.",

            // Memory & Pride
            "Remember why you started — this is it.",
            "Every walk builds who you are.",
            "You showed up — now enjoy it.",
            "Today's walk becomes tomorrow's strength.",
            "This walk is yours — make it count."
        ) else listOf(
            // Action & Energy
            "Let's go! You've got this.",
            "Time to fly — let's run!",
            "Here we go — let's do this!",
            "Run hard, run happy!",
            "Let's crush this run!",

            // Confidence
            "You've trained for this — own it.",
            "You're ready — let's run.",
            "Trust your training — let's go.",
            "This is your moment — run it.",
            "You've got everything you need.",

            // Rhythm & Form
            "Find your rhythm — stay smooth.",
            "Relax and run easy — you've got this.",
            "Breathe deep, run strong.",
            "Focus on form — the speed will come.",
            "One step at a time — that's all.",

            // Mindset
            "Stay present — run now.",
            "Clear your mind — just run.",
            "Think less, run more.",
            "This is your time — enjoy it.",
            "Let go and run free.",

            // Encouragement
            "Great start — keep it going.",
            "You're moving — stay with it.",
            "Every step counts — let's go.",
            "Progress, not perfection — let's run.",
            "You've started strong — finish stronger.",

            // Fun & Joy
            "Smile — running is awesome!",
            "Running is the best therapy — enjoy it.",
            "This is your happy place — run it.",
            "Feel the joy of running — let's go!",
            "Running beats sitting — let's do this!",

            // Challenge
            "Push through — you're stronger than you think.",
            "Embrace the effort — it makes you.",
            "Challenge is where growth happens.",
            "This is what you trained for.",
            "Leave it all out there today.",

            // Simplicity
            "Just run — that's all.",
            "Forward is the only direction.",
            "Run your own pace, your own race.",
            "Simple: put one foot in front of the other.",
            "Running doesn't need to be complicated.",

            // Nature & Body
            "Feel your feet hitting the ground.",
            "Match your breath to your steps.",
            "Run like the wind — feel alive!",
            "Your body knows how to do this.",
            "Listen to your body — it knows the way.",

            // Memory & Pride
            "Remember why you started — this is it.",
            "Every run builds who you are.",
            "You did the work — now enjoy it.",
            "Today's run becomes tomorrow's strength.",
            "This run is yours — make it count."
        )

        val startMessage = prompts.random()
        
        // Log as a coaching note for the run history
        coachingHistory.add(AiCoachingNote(
            time = 0,
            message = startMessage
        ))
        
        // Fire via audio immediately
        if (!isMuted) {
            playCoachingAudio(null, null, startMessage)
        }
        
        Log.d("RunTrackingService", "Fallback start coaching: $startMessage")
    }

    private fun buildBaseEliteRequest(type: String, distKm: Double, duration: Long, avgSpeed: Float): EliteCoachingRequest {
        val elapsedSec = duration / 1000

        // Calculate remaining distance for AI
        val remainingKm = targetDistance?.let { (it - totalDistance) / 1000.0 }?.takeIf { it > 0 }
        val remainingFormatted = remainingKm?.let { formatDistanceForAI(it) }
        val distanceCompletedFormatted = formatDistanceForAI(distKm)
        
        // ── Calculate running efficiency metrics ───────────────────────────────────
        // Power-to-pace efficiency: lower power for target pace = more efficient
        val avgPowerWatts = if (watchPwrCount > 0) watchPwrSum / watchPwrCount else null
        val powerToPaceRatio = if (avgPowerWatts != null && avgPowerWatts > 0 && avgSpeed > 0) {
            (avgPowerWatts / (avgSpeed * 3.6f)).coerceIn(0f, 1000f) // normalize to W per km/h
        } else null
        
        // Classify efficiency based on user's personalized baseline (not hardcoded)
        val metricsConfig = live.airuncoach.airuncoach.config.RunningMetricsConfig(this)
        val runningEfficiency = metricsConfig.classifyRunningEfficiency(powerToPaceRatio)
        
        // ── Calculate HR Zone (personalized to user) ────────────────────────────────
        // Uses user's actual max HR or age-based estimate; not generic hardcoded zones
        val estimatedHrZone = if (currentHeartRate > 0) {
            currentUser?.age?.let { userAge ->
                metricsConfig.calculateHeartRateZone(currentHeartRate, userAge)
            }
        } else null

        return EliteCoachingRequest(
            coachingType = type,
            distance = distKm,
            targetDistance = targetDistance?.let { it / 1000.0 },  // Convert metres to km
            currentPace = currentPace,
            averagePace = calculatePace(avgSpeed),
            elapsedTime = elapsedSec,
            coachName = currentUser?.coachName,
            coachTone = currentUser?.coachTone,
            coachGender = currentUser?.coachGender,
            coachAccent = currentUser?.coachAccent,
            nicknameStyle = "occasional",  // Default: use nicknames sparingly in coaching
            hasRoute = hasGpsElevation || hasRoute,
            heartRate = if (currentHeartRate > 0) currentHeartRate else null,
            cadence = if (currentCadence > 0) currentCadence else null,
            currentGrade = currentSmoothedGrade,
            totalElevationGain = totalElevationGain,
            totalElevationLoss = totalElevationLoss,
            targetTime = targetTime?.let { it / 1000 },
            targetPace = if (targetPaceSecondsPerKm > 0) formatPace(targetPaceSecondsPerKm) else null,
            kmSplits = kmSplits.map { KmSplitBrief(it.km, it.pace) },
            remainingDistanceFormatted = remainingFormatted,
            distanceCompletedFormatted = distanceCompletedFormatted,
            // ── Running Dynamics (current averages from Garmin watch) ────────────────
            groundContactTime = if (watchGctCount > 0) watchGctSum / watchGctCount else null,
            groundContactBalance = if (watchGcbCount > 0) watchGcbSum / watchGcbCount else null,
            verticalOscillation = if (watchVoCount > 0) watchVoSum / watchVoCount else null,
            verticalRatio = if (watchVrCount > 0) watchVrSum / watchVrCount else null,
            strideLength = if (watchSlCount > 0) watchSlSum / watchSlCount else null,
            // ── Power & Respiration (current averages) ────────────────────────────────
            runningPower = avgPowerWatts?.toInt(),
            respirationRate = if (watchRespCount > 0) watchRespSum / watchRespCount else null,
            // ── Training Effect & Recovery (latest from watch) ────────────────────────
            aerobicTrainingEffect = if (watchLatestAte > 0f) watchLatestAte else null,
            anaerobicTrainingEffect = if (watchLatestAnAte > 0f) watchLatestAnAte else null,
            recoveryTimeMinutes = if (watchLatestRecoveryMins > 0) watchLatestRecoveryMins else null,
            vo2MaxEstimate = if (watchLatestVo2Max > 0f) watchLatestVo2Max else null,
            // ── Performance Context ────────────────────────────────────────────────────
            heartRateZone = estimatedHrZone,
            powerToPaceRatio = powerToPaceRatio,
            runningEfficiency = runningEfficiency,
            // Coaching programme context — non-null only when this is a plan workout
            trainingPlanId = planTrainingPlanId,
            workoutId = planWorkoutId,
            workoutType = planWorkoutType,
            workoutDescription = planWorkoutDescription,
            planGoalType = planGoalType,
            planWeekNumber = planWeekNumber,
            planTotalWeeks = planTotalWeeks,
            // ── Session memory — gives the AI a view of the full coaching conversation so far
            topicsDiscussed = sessionTopicsDiscussed.toList().ifEmpty { null },
            topicsNotCovered = ALL_COACHING_TOPICS.filter { it !in sessionTopicsDiscussed }.ifEmpty { null },
            sessionCueCount = sessionCueCount,
            lastCueTriggerType = lastCueTriggerType,
            minutesSinceLastCue = if (lastCueFiredAtMs > 0L)
                (System.currentTimeMillis() - lastCueFiredAtMs) / 60_000.0 else null,
            recentCoachingMessages = coachingHistory.takeLast(3).map { it.message }.ifEmpty { null },
            // ── Sensor confidence — lets AI soften language on noisy data
            hrConfidence = hrConfidenceLevel(),
            gpsConfidence = gpsConfidenceLevel(),
            cadenceConfidence = cadenceConfidenceLevel(),
            // ── Physiological response to previous cue
            lastCueHrDelta = lastCueHrDelta,
            lastCuePaceDelta = lastCuePaceDelta,
            athleteRespondedToLastCue = athleteRespondedToLastCue,
            // ── Live terrain state (used by all coaching types as context enrichment)
            currentTerrainState = currentTerrainState.takeIf { it != "flat" },
            // ── Session type (run vs walk) — controls coaching vocabulary and cadence policy
            activityType = currentActivityType
        )
    }

    private fun fireEliteCoaching(request: EliteCoachingRequest, label: String) {
        val now = System.currentTimeMillis()
        lastEliteCoachingTime = now
        lastCoachingTime = now
        hasCoachingFiredThisTick = true
        recordCoachingFired()

        // ── Update session memory + physiological tracking ─────────────────────
        computePhysiologicalDelta()
        val topic = extractTopicFromTriggerType(request.coachingType)
        sessionTopicsDiscussed.add(topic)
        sessionCueCount++
        lastCueTriggerType = request.coachingType
        lastCueFiredAtMs = now
        lastCueHrAtFire = currentHeartRate
        lastCuePaceAtFire = parsePaceToSeconds(currentPace).toDouble()

        serviceScope.launch {
            try {
                val response = apiService.getEliteCoaching(request)
                if (response.message.isNotBlank()) {
                    coachingHistory.add(AiCoachingNote(
                        time = getActiveRunDuration(),
                        message = "$label: ${response.message}"
                    ))
                    Log.d("RunTrackingService", "Elite coaching ($label): ${response.message}")
                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
                }
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to get elite coaching ($label)", e)
            }
        }
    }

    private fun fireFinalCoaching(type: String, distKm: Double, duration: Long, avgSpeed: Float, remainingMeters: Double) {
        recordCoachingFired()
        hasCoachingFiredThisTick = true
        val td = targetDistance ?: inferredTargetDistance ?: 0.0
        // targetDistance (or inferred) is in metres, convert to km for ETA calculation
        val tdKm = td / 1000.0
        val elapsedSec = duration / 1000.0
        val projectedFinishSec = if (distKm > 0) (elapsedSec / distKm * tdKm).toLong() else null
        val targetTimeSec = targetTime?.let { it / 1000 }

        // Determine target time category using percentage-based thresholds:
        // <=2% over (or under) → on_track (reference target enthusiastically)
        // 2-5% over → strong_effort (positive framing, don't dwell)
        // >5% over → no_mention (pure motivation, skip target)
        var category = "no_mention"
        var overPercent: Double? = null
        if (targetTimeSec != null && targetTimeSec > 0 && projectedFinishSec != null) {
            overPercent = ((projectedFinishSec - targetTimeSec).toDouble() / targetTimeSec) * 100.0
            category = when {
                overPercent <= 2.0 -> "on_track"    // under target or within 2%
                overPercent <= 5.0 -> "strong_effort" // 2-5% over
                else -> "no_mention"                  // >5% over
            }
        }

        val request = buildBaseEliteRequest(type, distKm, duration, avgSpeed).copy(
            projectedFinishTime = projectedFinishSec,
            targetTimeCategory = category,
            etaOverTargetPercent = overPercent,
            remainingMeters = remainingMeters.toInt()
        )
        fireEliteCoaching(request, when (type) {
            "final_100m" -> "Final 100m"
            "final_250m" -> "Final 250m"
            else -> "Final 500m"
        })
    }

    private fun fireMilestoneCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
        val td = targetDistance ?: return
        // targetDistance is in metres, convert to km for calculations
        val tdKm = td / 1000.0
        val pct = (distKm / tdKm * 100).toInt()
        val milestone = when {
            pct >= 75 && lastMilestonePercent < 75 -> 75
            pct >= 50 && lastMilestonePercent < 50 -> 50
            pct >= 25 && lastMilestonePercent < 25 -> 25
            else -> return
        }
        lastMilestonePercent = milestone

        val request = buildBaseEliteRequest("milestone", distKm, duration, avgSpeed).copy(
            milestonePercent = milestone,
            projectedFinishTime = if (distKm > 0) ((duration / 1000.0) / distKm * tdKm).toLong() else null
        )
        fireEliteCoaching(request, "${milestone}% Milestone")
    }

    private fun fireTargetEtaCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
        lastTargetEtaKm = distKm.toInt()
        val td = targetDistance ?: return
        // targetDistance is in metres, convert to km for ETA calculation
        val tdKm = td / 1000.0
        val projectedSec = if (distKm > 0) ((duration / 1000.0) / distKm * tdKm).toLong() else null

        val request = buildBaseEliteRequest("target_eta", distKm, duration, avgSpeed).copy(
            projectedFinishTime = projectedSec
        )
        fireEliteCoaching(request, "Target ETA")
    }

    private fun firePaceTrendCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
        lastPaceTrendCheckKm = distKm.toInt()
        val (direction, delta, isNegSplit) = detectPaceTrend()

        val request = buildBaseEliteRequest("pace_trend", distKm, duration, avgSpeed).copy(
            paceTrendDirection = direction,
            paceTrendDeltaPerKm = delta,
            isNegativeSplitting = isNegSplit
        )
        fireEliteCoaching(request, "Pace Trend")
    }

    private fun firePositiveReinforcementCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
        lastPositiveReinforcementKm = distKm.toInt()
        val (_, _, isNegSplit) = detectPaceTrend()

        // Count consecutive consistent splits
        var consistentCount = 0
        if (kmSplits.size >= 2) {
            val paceSecs = kmSplits.map { split ->
                val parts = split.pace.split(":")
                if (parts.size == 2) parts[0].toIntOrNull()?.times(60)?.plus(parts[1].toIntOrNull() ?: 0) ?: 0 else 0
            }
            for (i in paceSecs.size - 1 downTo 1) {
                if (abs(paceSecs[i] - paceSecs[i - 1]) <= 10) consistentCount++ else break
            }
        }

        // Find fastest split
        val fastestSplit = kmSplits.minByOrNull { split ->
            val parts = split.pace.split(":")
            if (parts.size == 2) parts[0].toIntOrNull()?.times(60)?.plus(parts[1].toIntOrNull() ?: 0) ?: 9999 else 9999
        }

        val request = buildBaseEliteRequest("positive_reinforcement", distKm, duration, avgSpeed).copy(
            consecutiveConsistentSplits = if (consistentCount >= 2) consistentCount + 1 else null,
            isNegativeSplitting = isNegSplit,
            fastestSplitKm = fastestSplit?.km,
            fastestSplitPace = fastestSplit?.pace
        )
        fireEliteCoaching(request, "Positive Reinforcement")
    }

    /**
     * Fire context-aware technique coaching with category rotation.
     * Selects the most relevant technique category based on current conditions:
     * - On a hill? → hill technique
     * - Late in the run / fatigued? → mental/recovery techniques
     * - Early in the run? → posture/breathing fundamentals
     * - Otherwise → rotate through all categories, never repeating in the same run
     */
    private fun fireTechniqueCoaching(distKm: Double, duration: Long, avgSpeed: Float, phase: CoachingPhase) {
        lastTechniqueCoachingTime = System.currentTimeMillis()

        // Determine current context
        val grade = calculateAverageGradient()
        val isOnHill = abs(grade) > 3f
        val isUphill = grade > 3f
        val isDownhill = grade < -3f

        // Estimate fatigue from pace trend (smoothed vs baseline)
        val fatigueLevel = when {
            baselinePace <= 0f -> "FRESH"
            recentPaceDistances.size >= 3 -> {
                val totalDist = recentPaceDistances.sum()
                val totalTime = recentPaceTimes.sum()
                val smoothedPace = if (totalDist > 0) (1000.0 * totalTime / totalDist).toFloat() else baselinePace
                val dropPct = (smoothedPace - baselinePace) / baselinePace * 100
                when {
                    dropPct > 15 -> "FATIGUED"
                    dropPct > 8 -> "MODERATE"
                    else -> "FRESH"
                }
            }
            else -> "FRESH"
        }

        // Select the best technique category based on context
        val category = selectTechniqueCategory(phase, isUphill, isDownhill, fatigueLevel)

        // Build the hint map for this category — tells the AI what specific cue to give
        val hint = techniqueHints[category] ?: "Focus on good running form"

        // Track what we've used this run AND persist for cross-run memory
        usedTechniqueCategories.add(category)
        saveCrossRunTechniqueCategory(category)

        // Build request with rich technique context
        val baseRequest = buildBaseEliteRequest("technique_form", distKm, duration, avgSpeed)
        val request = baseRequest.copy(
            techniqueCategory = category,
            techniqueHint = hint,
            runPhase = phase.name,
            isOnHill = isOnHill,
            isUphill = isUphill,
            fatigueLevel = fatigueLevel,
            // Send the last 3 categories so the AI knows what was already coached
            recentTechniqueCategories = usedTechniqueCategories.toList().takeLast(5)
        )
        fireEliteCoaching(request, "Technique ($category)")
    }

    /**
     * Context-aware technique category selection:
     * 1. If on a hill → pick a hill-specific technique
     * 2. If fatigued → pick a mental/recovery technique
     * 3. If early in run → pick a fundamental technique (posture, breathing)
     * 4. Otherwise → rotate through unused categories
     */
    private fun selectTechniqueCategory(phase: CoachingPhase, isUphill: Boolean, isDownhill: Boolean, fatigueLevel: String): String {
        // Priority 1: Hill-specific technique when on a hill
        if (isUphill) {
            val hillCategories = listOf("hill_uphill_technique", "arms_drive_power", "hips_forward_drive", "breathing_exhale_power")
            val unused = hillCategories.filter { it !in usedTechniqueCategories }
            if (unused.isNotEmpty()) return unused.random()
        }
        if (isDownhill) {
            val downhillCategories = listOf("hill_downhill_technique", "knees_soft_landing", "feet_cadence", "posture_torso_lean")
            val unused = downhillCategories.filter { it !in usedTechniqueCategories }
            if (unused.isNotEmpty()) return unused.random()
        }

        // Priority 2: Recovery/mental techniques when fatigued or in late phase
        if (fatigueLevel == "FATIGUED" || phase == CoachingPhase.FINAL || phase == CoachingPhase.LATE) {
            val fatigueCategories = listOf(
                "mental_smile", "mental_mantras", "mental_chunking", "mental_focus_reset", "mental_visualisation",
                "recovery_arm_shakeout", "recovery_shoulder_roll", "recovery_hand_flex",
                "breathing_rhythm", "breathing_deep_belly"
            )
            val unused = fatigueCategories.filter { it !in usedTechniqueCategories }
            if (unused.isNotEmpty()) return unused.random()
        }

        // Priority 3: Fundamentals early in the run.
        // 14 categories, deliberately balanced — 1 arm (not 3), so arm cues are 7% not 27%.
        if (phase == CoachingPhase.EARLY) {
            val earlyCategories = listOf(
                "posture_head_neck",           // Head/chin position
                "posture_shoulders",           // Drop and relax shoulders
                "posture_torso_lean",          // Forward lean from ankles
                "posture_core_engagement",     // Gentle core brace
                "breathing_rhythm",            // Breathing cadence
                "breathing_deep_belly",        // Diaphragm breathing
                "arms_hand_relaxation",        // ONE arm cue (was 3) — loose fists
                "feet_strike_pattern",         // Midfoot landing
                "feet_cadence",                // Light quick steps
                "hips_forward_drive",          // Drive knees forward
                "knees_lift",                  // Knee lift
                "knees_soft_landing",          // Soft landing
                "stride_length_control",       // Don't overstride
                "mental_smile",                // Smile to reduce effort perception
            )
            val unused = earlyCategories.filter { it !in usedTechniqueCategories }
            if (unused.isNotEmpty()) return unused.random()
        }

        // Priority 4: Rotate through ALL unused categories
        val unused = techniqueCategories.filter { it !in usedTechniqueCategories }
        if (unused.isNotEmpty()) return unused.random()

        // All categories used this run — reset and start fresh
        usedTechniqueCategories.clear()
        return techniqueCategories.random()
    }

    /** Specific coaching cues for each technique category — sent to the AI as context */
    // ─── Cross-run technique memory ────────────────────────────────────────────
    // Persists the last 5 technique categories used across runs so we never
    // immediately repeat the same cue in the next session.

    private fun loadCrossRunTechniqueCategories(): List<String> {
        return try {
            val prefs = getSharedPreferences("coaching_technique_memory", android.content.Context.MODE_PRIVATE)
            val raw = prefs.getString("last_categories", "") ?: ""
            if (raw.isBlank()) emptyList() else raw.split(",").filter { it.isNotBlank() }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun saveCrossRunTechniqueCategory(category: String) {
        try {
            val prefs = getSharedPreferences("coaching_technique_memory", android.content.Context.MODE_PRIVATE)
            val existing = (prefs.getString("last_categories", "") ?: "")
                .split(",")
                .filter { it.isNotBlank() }
                .toMutableList()
            existing.add(category)
            // Keep only the last 5 — enough to prevent repeats without blocking too many options
            val trimmed = if (existing.size > 5) existing.takeLast(5) else existing
            prefs.edit().putString("last_categories", trimmed.joinToString(",")).apply()
        } catch (e: Exception) {
            // Non-fatal — if prefs can't be saved, variety just won't persist between runs
        }
    }

    private val techniqueHints = mapOf(
        // Posture
        "posture_head_neck" to "Look 20-30m ahead, not at feet. Imagine being pulled up by a string from the crown of your head. Keep chin level.",
        "posture_shoulders" to "Drop your shoulders away from your ears. Shake them out if they've crept up. Relaxed shoulders = efficient running.",
        "posture_torso_lean" to "Lean slightly forward from your ankles (not waist). Your body should be a straight line from ankle to head. Think 'tall and tilted'.",
        "posture_core_engagement" to "Gently brace your core — imagine you're about to be lightly tapped on the stomach. Keep your pelvis neutral, avoid arching your back.",

        // Arms
        "arms_swing_direction" to "Swing arms forward and back, not across your body. Your hands should never cross your midline. Think 'hip pocket to chest pocket'.",
        "arms_elbow_angle" to "Keep elbows at about 90 degrees. Compact arms are more efficient. If they're straightening out, you're wasting energy.",
        "arms_hand_relaxation" to "Unclench your fists! Imagine holding a crisp in each hand without crushing it. Loose hands = relaxed arms = relaxed shoulders.",
        "arms_drive_power" to "Drive your elbows back powerfully — the harder you pump your arms, the more your legs respond. Use your arms to power through this section.",

        // Hips
        "hips_extension" to "On each stride, fully extend your hip behind you before your foot leaves the ground. More extension = more power = longer stride.",
        "hips_alignment" to "Keep your hips level — don't let one side drop when the opposite foot lifts. Strong glutes keep you stable.",
        "hips_forward_drive" to "Drive your knee forward and up. Think 'run from the hips' rather than reaching with your feet.",

        // Knees
        "knees_lift" to "Lift your knees to a height that matches your pace. Higher knee drive = faster pace. At easy pace, a gentle lift is fine.",
        "knees_alignment" to "Make sure your knees track directly over your toes. If they collapse inward, focus on 'pushing knees out' slightly.",
        "knees_soft_landing" to "Land with a soft, slightly bent knee. Never lock your knee on impact — that's how injuries happen. Absorb the ground.",

        // Feet
        "feet_cadence" to "Quick light steps! Aim for 170-180 steps per minute. If your feet feel heavy, imagine running on hot coals.",
        "feet_strike_pattern" to "Land with your foot directly under your body, not out in front. Midfoot strike, soft and quiet. If you can hear your feet slapping, you're overstriding.",
        "feet_push_off" to "Push off strongly through your big toe. Feel the ground spring you forward. Active ankle extension adds free speed.",
        "feet_ground_contact" to "Minimise time on the ground — quick turnover, like a wheel rolling. The less time each foot spends on the ground, the faster and more efficient you are.",

        // Hills
        "hill_uphill_technique" to "Shorten your stride, increase cadence, lean into the hill from your ankles. Pump your arms harder. Attack the hill with quick feet, not big strides.",
        "hill_downhill_technique" to "Let gravity help! Lean slightly forward (don't lean back). Quick light steps, slightly wider foot placement. Control your speed with cadence, not braking.",
        "hill_crest_transition" to "Don't ease off at the top of the hill! Many runners lose 5-10 seconds by relaxing at the crest. Push through and over the top, then settle into rhythm.",

        // Breathing
        "breathing_rhythm" to "Match your breathing to your stride. Try a 2:2 pattern — breathe in for 2 steps, out for 2 steps. At easy pace, try 3:3.",
        "breathing_deep_belly" to "Breathe from your belly, not your chest. Put your hand on your stomach — it should push out when you inhale. Belly breathing gets more oxygen to your muscles.",
        "breathing_exhale_power" to "Focus on a strong exhale — blow the air out forcefully. The inhale will happen naturally. A powerful exhale clears CO2 and makes room for fresh oxygen.",

        // Mental
        "mental_smile" to "Smile! Seriously — studies show smiling while running reduces perceived effort by up to 2%. It relaxes your face and tricks your brain into thinking this is easier.",
        "mental_mantras" to "Pick a power word and repeat it with each step. 'Strong. Smooth. Fast.' or 'I. Am. Running.' A mantra drowns out the voice that says to slow down.",
        "mental_chunking" to "Don't think about the whole distance. Just focus on the next 500 metres. Then the next 500. Small chunks are always manageable.",
        "mental_focus_reset" to "Do a quick body scan: head relaxed, shoulders down, arms loose, core engaged, hips forward, feet light. Fix anything that's tensed up.",
        "mental_visualisation" to "Picture yourself crossing the finish line strong. Visualise your best running form — smooth, powerful, effortless. Run like that person in your mind.",

        // Recovery/Shake-out
        "recovery_arm_shakeout" to "Drop your arms to your sides and shake them out for 10 seconds. Let them go completely limp. Then bring them back up refreshed.",
        "recovery_shoulder_roll" to "Roll your shoulders backward 5 times, big circles. Release any tension that's built up. Your upper body should feel loose and free.",
        "recovery_hand_flex" to "Open and close your fists 10 times. Wiggle your fingers. If you've been clenching, this releases tension all the way up your arms to your shoulders."
    )

    private fun fireElevationInsightCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
        val now = System.currentTimeMillis()
        lastElevationInsightTime = now
        // Also update lastElevationCoachingTime so the regular terrain coaching system
        // respects this fire and doesn't produce a second elevation message within the cooldown window
        lastElevationCoachingTime = now
        val request = buildBaseEliteRequest("elevation_insight", distKm, duration, avgSpeed)
        fireEliteCoaching(request, "Elevation")
    }

    /**
     * State-based terrain awareness — replaces the old event-based hill system.
     *
     * Instead of predicting summits or describing what "probably comes next", the coach
     * describes the terrain the runner is CURRENTLY on.  A standalone coaching message fires
     * only when a meaningfully different terrain state has been sustained long enough to be real.
     *
     * Terrain states: flat | gradual_climb | steep_climb | gradual_descent | steep_descent | rolling
     *
     * Two outputs:
     *  1. `currentTerrainState` — always updated, attached as context to pace/HR/cadence prompts
     *  2. Standalone TTS message — fires on entry into a new significant terrain state
     */
    private fun updateElevationCoaching(distanceIncrement: Double, gradePercent: Double, elevationChange: Double) {
        if (!coachingFeaturePrefs.elevationCoachingEnabled) return
        if (isLowExperienceRunner()) return

        val now = System.currentTimeMillis()
        val currentKm = totalDistance / 1000.0

        // ── Raw direction for this GPS tick ─────────────────────────────────
        val rawDirection = when {
            gradePercent >= UPHILL_GRADE_THRESHOLD   ->  1
            gradePercent <= DOWNHILL_GRADE_THRESHOLD -> -1
            else                                     ->  0
        }

        // ── Per-segment accumulators ─────────────────────────────────────────
        if (rawDirection == slopeDirection) {
            slopeDistanceMeters += distanceIncrement
            if (elevationChange > 0) slopeElevationGain += elevationChange
            if (elevationChange < 0) slopeElevationLoss += abs(elevationChange)
        } else {
            // Direction changed — flush closed segment into the rolling window
            if (currentKm - rollingWindowStartKm >= ROLLING_TERRAIN_WINDOW_KM) {
                rollingWindowGainM = 0.0
                rollingWindowLossM = 0.0
                rollingWindowDirectionChanges = 0
                rollingWindowStartKm = currentKm
            }
            rollingWindowGainM += slopeElevationGain
            rollingWindowLossM += slopeElevationLoss
            if (slopeDirection != 0 && rawDirection != 0 && slopeDirection != rawDirection) {
                rollingWindowDirectionChanges++
            }
            // Open new segment
            slopeDirection = rawDirection
            slopeDistanceMeters = distanceIncrement
            slopeElevationGain = if (elevationChange > 0) elevationChange else 0.0
            slopeElevationLoss = if (elevationChange < 0) abs(elevationChange) else 0.0
        }

        // ── Pending-direction filter: suppress GPS spike flips ───────────────
        // A new direction must be sustained for TERRAIN_STATE_MIN_DISTANCE_M before we act on it.
        if (rawDirection == pendingTerrainDirection) {
            pendingTerrainDistanceM += distanceIncrement
        } else {
            pendingTerrainDirection = rawDirection
            pendingTerrainDistanceM = distanceIncrement
        }
        val stateConfirmed = pendingTerrainDistanceM >= TERRAIN_STATE_MIN_DISTANCE_M

        // ── Classify and publish terrain state ───────────────────────────────
        val isRolling = rollingWindowGainM >= ROLLING_TERRAIN_MIN_GAIN_M &&
            rollingWindowLossM >= ROLLING_TERRAIN_MIN_LOSS_M &&
            rollingWindowDirectionChanges >= ROLLING_TERRAIN_MIN_DIRECTION_CHANGES

        currentTerrainState = when {
            isRolling                                                         -> "rolling"
            stateConfirmed && gradePercent >= STEEP_UPHILL_GRADE_THRESHOLD   -> "steep_climb"
            stateConfirmed && gradePercent >= UPHILL_GRADE_THRESHOLD          -> "gradual_climb"
            stateConfirmed && gradePercent <= STEEP_DOWNHILL_GRADE_THRESHOLD  -> "steep_descent"
            stateConfirmed && gradePercent <= DOWNHILL_GRADE_THRESHOLD        -> "gradual_descent"
            else                                                              -> "flat"
        }

        // ── Standalone coaching message gate ─────────────────────────────────
        if (now - lastElevationCoachingTime < ELEVATION_COOLDOWN_MS) return

        val currentKmInt = currentKm.toInt()

        // Rolling terrain standalone cue (at most once per 2 km)
        if (isRolling && currentKmInt >= 1 &&
            currentKmInt - lastRollingTerrainCoachKm >= ROLLING_TERRAIN_COACH_INTERVAL_KM
        ) {
            rollingTerrainDetected = true
            lastRollingTerrainCoachKm = currentKmInt
            lastElevationCoachingTime = now
            Log.d("ElevationCoaching", "Rolling terrain standalone: gain=${rollingWindowGainM.toInt()}m " +
                "loss=${rollingWindowLossM.toInt()}m changes=$rollingWindowDirectionChanges")
            triggerElevationCoaching("rolling_terrain", gradePercent, slopeDistanceMeters)
            return
        }

        // Suppress separate climb/descent cues while in confirmed rolling terrain
        if (isRolling && rollingTerrainDetected) return

        // Climbing standalone cue — only when enough elevation accumulated
        if (rawDirection == 1 && stateConfirmed &&
            slopeElevationGain >= STANDALONE_UPHILL_MIN_GAIN_M
        ) {
            val eventType = if (gradePercent >= STEEP_UPHILL_GRADE_THRESHOLD) "steep_climb" else "gradual_climb"
            Log.d("ElevationCoaching", "Terrain standalone [$eventType]: " +
                "gain=${slopeElevationGain.toInt()}m grade=${gradePercent.toInt()}% dist=${slopeDistanceMeters.toInt()}m")
            lastElevationCoachingTime = now
            triggerElevationCoaching(eventType, gradePercent, slopeDistanceMeters)
            return
        }

        // Descending standalone cue — only when enough elevation lost
        if (rawDirection == -1 && stateConfirmed &&
            slopeElevationLoss >= STANDALONE_DOWNHILL_MIN_LOSS_M
        ) {
            // Downhill finish special-case
            val remainingDistanceKm = targetDistance?.let { (it - totalDistance) / 1000.0 }
            if (!downhillFinishTriggered &&
                (hasGpsElevation || hasRoute) &&
                remainingDistanceKm != null &&
                remainingDistanceKm <= DOWNHILL_FINISH_DISTANCE_KM
            ) {
                downhillFinishTriggered = true
                lastElevationCoachingTime = now
                Log.d("ElevationCoaching", "Downhill finish: loss=${slopeElevationLoss.toInt()}m remaining=${remainingDistanceKm}km")
                triggerElevationCoaching("downhill_finish", gradePercent, slopeDistanceMeters)
                return
            }
            val eventType = if (gradePercent <= STEEP_DOWNHILL_GRADE_THRESHOLD) "steep_descent" else "gradual_descent"
            Log.d("ElevationCoaching", "Terrain standalone [$eventType]: " +
                "loss=${slopeElevationLoss.toInt()}m grade=${gradePercent.toInt()}% dist=${slopeDistanceMeters.toInt()}m")
            lastElevationCoachingTime = now
            triggerElevationCoaching(eventType, gradePercent, slopeDistanceMeters)
        }
    }

    private fun triggerElevationCoaching(eventType: String, gradePercent: Double, segmentDistanceMeters: Double) {
        serviceScope.launch {
            try {
                // Build per-km split elevation summaries from route points
                val splitElevations = buildKmSplitElevations()

                // Calculate terrain profile
                val distKm = totalDistance / 1000.0
                val elevPerKm = if (distKm > 0.5) totalElevationGain / distKm else 0.0
                val terrainProfile = when {
                    elevPerKm < 5 -> "flat"
                    elevPerKm < 15 -> "undulating"
                    elevPerKm < 30 -> "hilly"
                    else -> "mountainous"
                }

                // Pace consistency
                val paceSecs = kmSplits.map { split ->
                    val parts = split.pace.split(":")
                    if (parts.size == 2) parts[0].toIntOrNull()?.times(60)?.plus(parts[1].toIntOrNull() ?: 0) ?: 0 else 0
                }.filter { it > 0 }
                val paceSpread = if (paceSecs.size >= 2) paceSecs.max() - paceSecs.min() else null
                val isNegSplit = if (paceSecs.size >= 3) paceSecs.zipWithNext().all { (a, b) -> b <= a } else null

                val avgSpeed = if (totalDistance > 0 && (getActiveRunDuration()) > 0) {
                    (totalDistance / ((getActiveRunDuration()) / 1000.0)).toFloat()
                } else 0f

                val request = ElevationCoachingRequest(
                    eventType = eventType,
                    distance = distKm,
                    elapsedTime = getActiveRunDuration() / 1000,  // Convert ms to seconds
                    currentGrade = gradePercent,
                    segmentDistanceMeters = segmentDistanceMeters,
                    totalElevationGain = totalElevationGain,
                    totalElevationLoss = totalElevationLoss,
                    hasRoute = hasGpsElevation || hasRoute,  // True when GPS altitude available, not just when planned route loaded
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    activityType = currentActivityType,
                    currentPace = currentPace,
                    averagePace = calculatePace(avgSpeed * 3.6f),
                    heartRate = currentHeartRate.takeIf { it > 0 },
                    cadence = currentCadence.takeIf { it > 0 },
                    avgCadence = if (cadenceCount > 0) (cadenceSum / cadenceCount).toInt() else null,
                    kmSplitSummaries = splitElevations.takeIf { it.isNotEmpty() },
                    terrainProfile = terrainProfile,
                    elevationPerKm = elevPerKm,
                    maxGradientSoFar = calculateMaxGradient().toDouble(),
                    segmentElevationGain = slopeElevationGain.takeIf { it > 0 },
                    segmentElevationLoss = slopeElevationLoss.takeIf { it > 0 },
                    paceSpreadSeconds = paceSpread,
                    isNegativeSplitting = isNegSplit,
                    fitnessLevel = currentUser?.fitnessLevel,
                    totalRunsAllTime = runHistoryStats?.totalRunsAllTime,
                    // ── Cross-platform terrain state contract ──────────────────
                    terrainState = currentTerrainState,
                    distanceInStateM = slopeDistanceMeters.takeIf { it > 0 },
                    hasRouteElevationAhead = false  // Route elevation lookahead not yet implemented
                )
                val response = apiService.getElevationCoaching(request)
                coachingHistory.add(AiCoachingNote(
                    time = getActiveRunDuration(),
                    message = "Elevation: ${response.message}"
                ))

                if (!isMuted) {
                    playCoachingAudio(response.audio, response.format, response.message)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun onSensorChanged(event: SensorEvent?) {
        when (event?.sensor?.type) {
            Sensor.TYPE_STEP_COUNTER -> {
                val steps = event.values[0].toInt()
                if (initialStepCount == -1) initialStepCount = steps
                val sD = steps-initialStepCount; val tD = System.currentTimeMillis()-lastStepTimestamp
                // Track total steps taken during this run
                if (sD > 0) totalStepsDuringRun = sD
                if (tD > 2000) {
                    currentCadence = (sD*60000/tD).toInt()
                    initialStepCount = steps
                    lastStepTimestamp = System.currentTimeMillis()
                    // Accumulate for average/max (only valid readings)
                    if (currentCadence > 0) {
                        cadenceSum += currentCadence
                        cadenceCount += 1
                        if (currentCadence > maxCadenceValue) maxCadenceValue = currentCadence
                    }
                }
            }
            Sensor.TYPE_STEP_DETECTOR -> {
                // Step detector fires once per step - use for cadence calculation
                // Maintain running window of steps and time to calculate live cadence
                val currentTime = System.currentTimeMillis()
                lastStepTimestamp = currentTime
                
                // Increment step counter from detector
                stepCountFromDetector++
                totalStepsDuringRun++
                
                // Calculate cadence from step detector (every 10 steps or every 3 seconds)
                val timeSinceLastCadenceCalc = currentTime - lastDetectorCadenceCalcTime
                if (stepCountFromDetector >= 10 || timeSinceLastCadenceCalc > 3000) {
                    if (timeSinceLastCadenceCalc > 0) {
                        currentCadence = ((stepCountFromDetector * 60000) / timeSinceLastCadenceCalc).toInt()
                        
                        // Accumulate for average/max (only valid readings)
                        if (currentCadence > 0) {
                            cadenceSum += currentCadence
                            cadenceCount += 1
                            if (currentCadence > maxCadenceValue) maxCadenceValue = currentCadence
                        }
                    }
                    
                    // Reset for next window
                    stepCountFromDetector = 0
                    lastDetectorCadenceCalcTime = currentTime
                }
            }
            Sensor.TYPE_HEART_RATE -> {
                val hr = event.values[0].toInt()
                if (hr > 0) {
                    val validatedHr = validateAndUpdateHRBuffer(hr)
                    if (validatedHr != null) {
                        currentHeartRate = validatedHr
                        hrSum += validatedHr
                        hrCount += 1
                        if (validatedHr > maxHr) maxHr = validatedHr
                        // Class-level tracking for run-end summary
                        heartRateSum += validatedHr
                        heartRateSampleCount++
                        if (validatedHr > maxHeartRate) maxHeartRate = validatedHr
                    }
                    // Rejected readings: currentHeartRate keeps its last confident value
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
