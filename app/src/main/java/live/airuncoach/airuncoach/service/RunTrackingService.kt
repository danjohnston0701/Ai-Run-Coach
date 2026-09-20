package live.airuncoach.airuncoach.service

import live.airuncoach.airuncoach.util.AppAnalytics
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
import live.airuncoach.airuncoach.data.RunCrashRecoveryStore
import live.airuncoach.airuncoach.data.workers.SyncWorker
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.GarminCompanionSession
import live.airuncoach.airuncoach.network.GarminRealtimeDataPoint
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
import live.airuncoach.airuncoach.util.RunConfigHolder
import live.airuncoach.airuncoach.di.GarminWatchManagerEntryPoint
import live.airuncoach.airuncoach.di.SamsungWatchManagerEntryPoint
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
import kotlin.math.roundToInt

class RunTrackingService : Service(), SensorEventListener {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var notificationManager: NotificationManager
    private lateinit var weatherRepository: WeatherRepository
    private lateinit var sensorManager: SensorManager
    private lateinit var syncQueue: SyncQueue  // For offline run persistence
    private lateinit var runCrashRecoveryStore: RunCrashRecoveryStore  // Crash/freeze-survival snapshot
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

    // ── Samsung/Wear OS watch bridge — same role as garminWatchManager above, via the
    // Wear OS Data Layer API instead of ConnectIQ. Both can be attached simultaneously;
    // each independently no-ops if its brand of watch isn't paired.
    private var samsungWatchManager: SamsungWatchManager? = null

    // Timestamp of the last watch GPS injection (ms).  While watch GPS is flowing
    // (within 15 s) phone GPS updates are skipped to prevent double-counting distance.
    private var lastWatchGpsMs: Long = 0L
    // Throttle for live-session metric sync (don't hammer the server every GPS tick)
    private var lastLiveSessionSyncMs: Long = 0L
    /** Km whose mid-point elite slot has already been used (or attempted) — see maybeFireMidKmEliteCoaching(). */
    private var lastMidKmEliteKm: Int = -1

    /**
     * Elite-coaching variety guarantee for distance-only free runs (no target time, so
     * checkPaceCoaching()'s on-pace substitution never runs). Fires in the MIDDLE of a km
     * (350–650 m past the boundary) once ELITE_COACHING_SUBSTITUTION_INTERVAL_MS has passed
     * without an elite cue — a slot the km split never uses, so this can't cost a split callout
     * (previously it swapped the split's spoken callout, which broke the "splits always
     * announced" rule). Once per km; goes through the same tick/global gates as everything else.
     */
    private fun maybeFireMidKmEliteCoaching() {
        if (paceCoachingEnabled) return                       // time-goal runs use the on-pace slot
        if (isCoachingPlanActive || isInFinalStretch()) return
        if (hasCoachingFiredThisTick || !canFireCoaching()) return
        val now = System.currentTimeMillis()
        if ((now - lastEliteCoachingTime) < ELITE_COACHING_SUBSTITUTION_INTERVAL_MS) return
        val distFromKm = totalDistance % 1000.0
        if (distFromKm < 350.0 || distFromKm > 650.0) return
        val km = (totalDistance / 1000.0).toInt()
        if (km == lastMidKmEliteKm) return
        lastMidKmEliteKm = km
        val distKm = totalDistance / 1000.0
        val elapsedMs = getActiveRunDuration()
        val elapsedSec = elapsedMs / 1000.0
        val avgSpeedKmh = if (elapsedSec > 0) (distKm / (elapsedSec / 3600.0)).toFloat() else 0f
        val effectiveTargetKm = (targetDistance ?: inferredTargetDistance)?.let { it / 1000.0 }
        maybeFireEliteCoaching(totalDistance, elapsedMs, avgSpeedKmh, determinePhase(distKm, effectiveTargetKm), forceBypassCooldown = true)
    }

    /** The live session a just-stopped run belonged to — see linkLiveSessionToResultRun(). */
    private var endedLiveSessionId: String? = null
    // Throttle for the local crash-recovery snapshot (see RunCrashRecoveryStore)
    private var lastCrashSnapshotSaveMs: Long = 0L

    // True when this run was initiated by a watch "start" command.
    // Used to: (a) pre-block phone GPS at run start and (b) skip sending redundant
    // runUpdate messages back to the watch (watch has its own authoritative data).
    private var wasRunStartedByWatch: Boolean = false

    // True once phone GPS + sensors have actually been requested for the current run.
    // For a watch-initiated run this starts false — the watch is the authoritative GPS/HR/
    // cadence source and running the phone's own GPS chip (high-accuracy, up to 2 Hz) and
    // BODY_SENSORS listeners in parallel the whole session is pure waste: every phone fix
    // was being computed and then thrown away downstream anyway (see the lastWatchGpsMs
    // check in onNewLocation). That redundant radio/CPU load, stacked on top of the
    // already-continuous ConnectIQ Bluetooth traffic, is a real contributor to watch
    // sessions getting killed by aggressive OEM battery managers (e.g. ColorOS) in a way
    // phone-only sessions never trigger. Phone GPS/sensors now only spin up reactively, as
    // a fallback, if watch GPS actually goes stale (checkPhoneGpsFallback(), driven off the
    // same 1 Hz timer tick that already drives updateRunSession()) — and once started, are
    // left running for the rest of the session rather than flapping on/off.
    private var phoneGpsFallbackActive: Boolean = false
    // Timestamp of the last phone-fix sample appended to the watch pace/altitude series while
    // the fallback is active (see onNewLocation()).
    private var lastFallbackSeriesSampleMs: Long = 0L
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
    // Active run duration captured at the moment the target distance was first crossed (i.e. when
    // fireTargetReachedCoaching fires). Used by calculateWasTargetAchieved() instead of the final
    // stop-time duration — otherwise a runner who kept going a little past their target distance
    // before tapping stop would show as having missed their target time, even though they hit it
    // exactly when the coach congratulated them for it.
    private var targetReachedAtDurationMs: Long? = null
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
    private val NAV_COACHING_MIN_GAP_MS = 3_000L          // Nav interrupts coaching audio and defers if blocked, so this only needs to prevent overlapping speech
    private val KM_SPLIT_EXCLUSION_ZONE_M = 200.0         // Suppress pace coaching within 200m of a km boundary
    
    // Run data
    private var targetDistance: Double? = null // ALWAYS in metres (normalized on receipt)
    private var targetTime: Long? = null     // For time-based goals (milliseconds)
    private val FINAL_STRETCH_METERS = 500.0 // Last 500m: only motivation coaching allowed
    // Smart target inference — when no explicit targetDistance is set (e.g. watch-initiated free
    // runs), we detect the most likely target from common race distances so final-stretch coaching
    // (500m / 250m / 100m to go) can still fire.
    // 1/2/3 km deliberately excluded: with them, every target-less run "inferred" 1000 m at
    // 850 m and locked there for good (see maybeInferTargetDistance), and re-inferring 2000 /
    // 3000 on the way past would fire false "final 500m!" cues at 1.5 km and 2.5 km of a 5K.
    private val COMMON_RACE_DISTANCES_M = listOf(5000.0, 10000.0, 15000.0, 21097.5, 42195.0)
    private var inferredTargetDistance: Double? = null
    private var hasRoute: Boolean = false
    private val routePoints = mutableListOf<LocationPoint>()
    private val kmSplits = mutableListOf<KmSplit>()
    private var lastKmSplit = 0
    // Queue of km splits skipped because the global cooldown was active exactly at the km
    // crossing. Retried, oldest first, on subsequent location updates until the cooldown
    // clears. A queue (not a single nullable slot) so that if the cooldown stays blocked
    // across more than one km crossing — a fast pace combined with a short split interval,
    // or another trigger repeatedly re-arming the shared cooldown — an earlier deferred split
    // is retried in turn rather than being silently overwritten and permanently lost. Capped
    // defensively; see MAX_PENDING_KM_SPLITS.
    private val pendingKmSplitCoachingQueue = mutableListOf<PendingKmSplit>()
    private val MAX_PENDING_KM_SPLITS = 5
    /**
     * A km split waiting for a free coaching slot, with when and where it was deferred so it
     * can be expired. Recording the queue position rather than deriving it from [KmSplit.km]
     * keeps this correct for the walk 500 m checkpoints, which reuse `km` as a block index.
     */
    private data class PendingKmSplit(val split: KmSplit, val queuedAtMs: Long, val queuedAtDistanceM: Double)
    // A deferred split describes a boundary the runner has already crossed. Announced late
    // enough, it is worse than silence — during a race it is actively misleading. A real
    // session (2026-09-14) announced "Km 3" 2m28s after the 3 km mark, by which point the
    // runner was 570 m into km 4; the same run's "Km 4" was 2m04s late and "Km 5" never fired
    // at all. Past either of these, drop it and let the next boundary speak for itself.
    private val PENDING_SPLIT_MAX_AGE_MS = 60_000L
    private val PENDING_SPLIT_MAX_DISTANCE_M = 250.0
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
    // Guards stopTracking() against reentry — see that function for why isTracking itself
    // can't be used for this (a legitimate stop can arrive while genuinely paused, i.e. while
    // isTracking is already false).
    private var isFinalizingStop = false
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
    // Phone-side anchors taken at the moment watchElapsedSeconds last advanced: wall-clock
    // time (for staleness) and the phone's own active-run clock (for extrapolation). If the
    // watch stops sending frames mid-run (battery died, BLE gone for good) the watch timer
    // above simply freezes — and because every duration consumer trusted it unconditionally,
    // the live timer, ETA/projection maths, the km-split clock and the SAVED duration all
    // froze with it. Confirmed 2026-09-20 (Daniel, half marathon): the vívoactive died at
    // 20.6 km, phone GPS fallback kept distance going, but the run saved as 1:49:13 against
    // a real 1:54:09, the km-21 split came out as a bogus 4:15, and the "Final 250m" cue
    // projected a finish time earlier than the moment it was spoken. currentWatchClockMs()
    // below carries the watch clock forward on the phone clock once frames go stale.
    private var watchElapsedAnchorWallMs: Long = 0L
    private var watchElapsedAnchorPhoneActiveMs: Long = -1L
    // Last accepted Garmin distance. Kept separately from totalDistance because a
    // transient phone-GPS update must not prevent a later valid Garmin total from
    // correcting it.
    private var watchDistanceM: Float = 0f
    // Watch's own elapsed-seconds reference (Activity.Info.timerTime, via frame.elapsedSeconds)
    // at the moment watchDistanceM was last accepted — deliberately NOT phone wall-clock time,
    // so a burst of queued BLE frames processed back-to-back (wall-clock gap near zero even
    // though the watch's own clock advanced normally between the readings) can't produce a
    // false "impossible speed" rejection below. -1 = nothing accepted yet this run.
    private var lastWatchDistanceAcceptedAtSec: Int = -1
    // Pause tracking — ensures paused time is excluded from all duration/pace calculations
    private var totalPausedMs: Long = 0          // Accumulated paused milliseconds
    private var pauseStartTime: Long = 0         // When the current pause started (0 = not paused)
    private var splitPausedMs: Long = 0          // Paused time within the current km split
    // Start-line idle credit — some runners press Start before they actually begin moving
    // (e.g. waiting for a race to begin, walking to the trailhead). Whatever time elapsed
    // since startTime up to the moment sustained genuine movement is confirmed (that isn't
    // already an explicit manual pause) is folded into totalPausedMs/splitPausedMs exactly
    // like a manual pause would be — so final duration, avg pace, and the km-1 split all
    // exclude the pre-movement wait, matching how Strava reports "moving time" vs
    // button-press-to-button-press elapsed time.
    //
    // Confirmation is based on SUSTAINED pace over START_IDLE_CONFIRM_SAMPLES consecutive
    // accepted GPS points, not raw cumulative distance (2026-09 — Daniel: a fixed distance
    // floor is too easy for GPS drift/multipath to cross while genuinely stationary — exactly
    // the case at a crowded race-start corral near buildings — since one isolated reflection
    // "jump" of a few metres can look fast for that ONE instant. Requiring several consecutive
    // samples to all show a pace faster than START_IDLE_MAX_PACE_SEC_PER_KM filters that out:
    // drift can produce an occasional fast-looking blip, but can't sustain one, while real
    // movement can). The confirmation window is short — a handful of seconds, not minutes —
    // specifically so it locks in at the true onset of movement almost immediately: a runner
    // who moves for ~1 minute and then genuinely stops was already locked in well before that
    // stop, and this mechanism (being one-shot, see hasCreditedStartIdle) never revisits an
    // already-credited/already-running session.
    //
    // The credit itself is anchored to the EARLIEST sample in the confirming window (not the
    // moment confirmation completes), and capped — not rejected outright — at
    // START_IDLE_MAX_CREDIT_MS: a runner in a corral/wave-start for longer than that still gets
    // credited up to the cap, rather than the previous all-or-nothing cliff that gave a longer
    // wait ZERO adjustment at all.
    private var hasCreditedStartIdle = false
    private val startIdleDistances = mutableListOf<Double>()   // metres, parallel arrays —
    private val startIdleTimes = mutableListOf<Double>()       // seconds since previous point —
    private val startIdleTimestamps = mutableListOf<Long>()    // point.timestamp (ms) — for anchoring
    // Stationary-drift gate — see the `looksStationary` check in onNewLocation().
    // A phone standing still with 10-30 m accuracy produces 2-8 m positional hops every
    // second. Every one of them clears the old filter (>= 2 m, <= 100 m, under 35 km/h), and
    // because distance accumulates as an absolute value, directionless drift only ever ADDS.
    // A beta tester standing still on a balcony for ~1 minute recorded 0.08 km at 12:06/km
    // while Garmin Connect, same moment, recorded 0.00 km — Garmin gates on real movement and
    // we did not. 0.5 m/s (1.8 km/h) is well under any walking pace and is the same threshold
    // this file already uses for speed-reading collection further down onNewLocation().
    private val MOVEMENT_MIN_SPEED_MS = 0.5f
    /** Diagnostic only — how many drift points this session's gate has discarded. */
    private var stationaryPointsRejected = 0
    // Only treat a near-zero speed reading as "stationary" for hops small enough to actually
    // BE drift. A genuine 15 m displacement alongside a ~0 m/s reading is self-contradictory —
    // more likely a stale speed field than a stationary phone — so that still accumulates.
    private val STATIONARY_MAX_DRIFT_M = 10.0

    private val START_IDLE_CONFIRM_SAMPLES = 3
    private val START_IDLE_MAX_PACE_SEC_PER_KM = 18.0 * 60.0   // 18 min/km — clearly moving, not drift
    private val START_IDLE_MIN_DISTANCE_M = 5.0                // defensive floor only; the sustained-
                                                                // pace check above is the real gate
    private val START_IDLE_MAX_CREDIT_MS = 10 * 60 * 1000L
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
    // Wall-clock time of the last ACCEPTED HR sample from any source — see checkHeartRateStaleness().
    private var lastHrAcceptedWallMs: Long = 0L

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
    // TYPE_STEP_COUNTER reports steps since device boot, so both of these are baselines
    // subtracted from it — they are NOT step counts themselves.
    //
    // There used to be only one, re-anchored every cadence window, and the run total was read
    // off it: `totalStepsDuringRun = steps - initialStepCount` immediately before
    // `initialStepCount = steps`. That made the saved "total steps" the count from the LAST
    // ~2-second window — single digits — rather than the run's steps. Two baselines now: the
    // window one moves (cadence is a rate, it needs a short window), the run one never does.
    private var runStartStepCount: Int = -1
    private var windowStartStepCount: Int = -1
    private var lastStepTimestamp: Long = 0
    // Below any real walking cadence (a slow walk is ~90 spm, running 150-180). A phone
    // standing still still registers the occasional step from sway or a hand movement, and
    // one step in a 2-second window computes to 30 spm — which is what a beta tester saw
    // reported while standing completely still. Readings under this are shown as 0 and kept
    // out of the run's average/max entirely.
    private val MIN_VALID_CADENCE_SPM = 50
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
    private var phoneGpsAccuracySum:   Float = 0f
    private var phoneGpsAccuracyCount: Int   = 0
    private var phoneGpsAccuracyWorst: Float = 0f
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
    // Min/max of the windowed elevation means (garminElevBuffer/phoneElevBuffer below) — used
    // by determineTerrainType() instead of raw per-point altitude. Raw phone GPS altitude noise
    // (±5-10m even standing still) can make a genuinely flat route show 20-50m of fake "range",
    // enough to misclassify it as Rolling/Hilly. These track the same noise-filtered window
    // means that already drive totalElevationGain/totalElevationLoss, so a flat route correctly
    // stays near-zero range regardless of GPS noise.
    private var smoothedMinElevation: Double? = null
    private var smoothedMaxElevation: Double? = null
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
    // Elite coaching sits last in per-tick priority and shares its slot/cooldown with phase-change,
    // 500m-milestone, HR, and cadence coaching — on sessions where those fire often it can be
    // crowded out for the whole run (confirmed: a real 32-min free run got zero elite coaching).
    // Rather than adding more coaching messages on top, checkPaceCoaching() periodically SWAPS one
    // of its own routine pace-status updates for an elite-coaching moment once this much time has
    // passed without one — same total message count, more variety.
    private val ELITE_COACHING_SUBSTITUTION_INTERVAL_MS = 360_000L // At least one elite swap every 6 minutes

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
    // Turn-by-turn navigation state for route-guided runs — see the engine section below.
    private var navTurnInstructions: List<TurnInstruction> = emptyList()
    private var navPolylinePoints: List<com.google.android.gms.maps.model.LatLng> = emptyList()
    private var navCumulativeMeters: DoubleArray = DoubleArray(0)      // metres along route at each polyline vertex
    private var navInstructionRouteMeters: DoubleArray = DoubleArray(0) // each instruction's along-route position
    private var navInstructionRouteIndex: IntArray = IntArray(0)
    private var navRouteTotalMeters: Double = 0.0
    private var navCurrentInstructionIndex: Int = 0  // Index of the NEXT instruction to deliver
    private var navLastAnnouncedIndex: Int = -1      // Prevents double "now" cue for the same instruction
    private var navLastWarningIndex: Int = -1        // Prevents double warning for the same instruction
    private var navMissedWaypointCount: Int = 0
    private var navLastCheckTime: Long = 0
    private var navProgressIndex: Int = 0            // polyline segment the runner was last projected onto
    private var navProgressMeters: Double = 0.0      // metres along the route (monotonic)
    private var navOffRoute: Boolean = false
    private var navOffRouteStrikes: Int = 0
    private var navReachedFixes: Int = 0             // consecutive fixes at the turn (needs 2)
    private var navPendingCue: String? = null        // cue deferred by the post-coaching gap
    private var navCompletionAnnounced: Boolean = false
    private val NAV_CHECK_INTERVAL_MS = 2_000L
    private val NAV_WAYPOINT_REACHED_RADIUS_M = 45.0 // radial "at the turn" fallback (phone GPS)
    private val NAV_TURN_NOW_M = 30.0                // along-route distance for the "now" cue
    private val NAV_WARNING_LEAD_SECONDS = 25.0      // warn this many seconds ahead at current pace…
    private val NAV_WARNING_MIN_M = 70.0             // …but never closer than this
    private val NAV_WARNING_MAX_M = 160.0            // …or further than this
    private val NAV_SKIP_DISTANCE_BEHIND_M = 60.0    // instruction is "behind" once the runner is 60 m past it along the route
    private val NAV_OFF_ROUTE_M = 50.0               // cross-track distance that counts as off-route
    private val NAV_REJOIN_M = 30.0                  // …and that counts as back on it (hysteresis)
    private val NAV_OFF_ROUTE_STRIKES = 3            // consecutive off-route checks before announcing (~6 s)
    private val NAV_MAX_ACCURACY_M = 40f             // ignore fixes worse than this for nav
    private val NAV_SEARCH_BACK_SEGMENTS = 5
    private val NAV_SEARCH_AHEAD_SEGMENTS = 60
    private val NAV_COMPLETION_M = 30.0
    
    // Weather and terrain
    private var weatherAtStart: WeatherData? = null
    private var weatherAtEnd: WeatherData? = null
    // Guards the one-shot weather fetch in onNewLocation() so it only fires once per run —
    // on the FIRST accepted GPS fix (phone or watch), rather than racing GPS cold-start with
    // its own separate location request (the old startTracking()-eager approach — see the
    // fetch this replaced). Any accuracy is fine for weather; no need to wait for a good fix.
    private var weatherFetchAttempted = false
    private var totalElevationGain: Double = 0.0
    private var totalElevationLoss: Double = 0.0
    
    companion object {
        private const val CHANNEL_ID = "run_tracking_channel"
        private const val NOTIFICATION_ID = 1001
        private const val NOTIF_ID_WATCH_SESSION_READY = 1002
        private const val NOTIF_ID_WATCH_RUN_STARTED = 1003
        private const val NOTIF_ID_SESSION_INTERRUPTED = 1004
        private const val NOTIF_ID_START_FAILED = 1005
        private const val NOTIF_ID_RUN_ALREADY_SAVED = 1006
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
        // How long watch frames must be absent before the watch's session clock and its last
        // heart-rate reading are treated as stale — matches checkPhoneGpsFallback()'s window so
        // clock, HR and distance all switch to their fallbacks together.
        private const val WATCH_CLOCK_STALE_MS = 15_000L
        // Wider than the clock window: optical HR legitimately drops out for 10–20 s on a
        // loose strap, and the buffer already tolerates that. 30 s without any sample means
        // the source is gone, not flaky.
        private const val HR_STALE_MS = 30_000L

        private const val UPHILL_GRADE_THRESHOLD = 3.0
        private const val DOWNHILL_GRADE_THRESHOLD = -3.0
        // "Steep" is reserved for a sustained ≥10% grade now that the grade itself is measured
        // over 100 m (see trailingWindowGradePercent()). It was 5% when the per-tick grade was
        // so noisy that a 5% reading meant nothing; on a real 100 m measurement 5% is an
        // ordinary road hill and 3–6% a gentle rise — neither warrants "steep" language. The
        // band between (6–10%) is announced by its number ("a 7% climb") on the server side.
        private const val STEEP_UPHILL_GRADE_THRESHOLD = 10.0
        private const val STRUGGLE_HILL_TOLERANCE_GRADE = 6.0
        // Deliberately steeper in magnitude than the uphill threshold — gravity assists a
        // descent, so the same grade feels meaningfully easier going down than up. Was
        // symmetric at -5.0, which a real user report confirmed was miscalibrated: an -8%
        // descent they described as "super gently, nearly unnoticeable" was correctly
        // classified as steep_descent per the old threshold and coached with that template's
        // emphatic "gravity is helping significantly" framing — the classification was
        // working exactly as configured, the configured value was just too aggressive. -9.0
        // puts that real -8% descent (and, per the same logic, most everyday gentle downhill
        // stretches) into gradual_descent instead, reserving steep_descent's language for
        // grades that are actually steep. Now symmetric with the uphill value again at -10.0 —
        // with the 100 m window grade, -10% sustained IS a steep descent.
        private const val STEEP_DOWNHILL_GRADE_THRESHOLD = -10.0

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
        // Distance over which live grade is measured — see trailingWindowGradePercent().
        private const val GRADE_WINDOW_M = 100.0
        
        // How often (ms) the service pushes GPS/metrics to the live session on the server.
        // 5 seconds keeps observers up-to-date without hammering the API.
        private const val LIVE_SESSION_SYNC_INTERVAL_MS = 5_000L

        // How often (ms) the in-progress run state is snapshotted to local disk so a
        // frozen/killed process loses at most this much data instead of the whole run.
        private const val CRASH_SNAPSHOT_INTERVAL_MS = 20_000L

        const val ACTION_START_TRACKING = "ACTION_START_TRACKING"
        const val ACTION_STOP_TRACKING = "ACTION_STOP_TRACKING"
        /**
         * Optional String extra on [ACTION_STOP_TRACKING] carrying the run ID the server already
         * created for this session — sent by the FCM "watchSessionEnded" fallback (AiRunCoachMessagingService),
         * which itself comes from the Garmin companion session/end response's `runId`. When present,
         * stopTracking() uses it as the fallback save target instead of orphaning the local session:
         * see the companionRunId handling in stopTracking()/uploadRunToBackend() below.
         */
        const val EXTRA_COMPANION_RUN_ID = "companionRunId"
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

        /** Navigation state shared with the run screen's map HUD, so screen and voice agree on
         *  where the runner is along the route and which turn is next. */
        data class NavUiState(
            val hasRoute: Boolean = false,
            val nextInstructionIndex: Int = 0,
            val nextInstruction: String? = null,
            val distanceToNextTurnM: Double? = null,
            val routeProgressIndex: Int = 0,
            val routeProgressMeters: Double = 0.0,
            val isOffRoute: Boolean = false
        )
        private val _navUiState = MutableStateFlow(NavUiState())
        val navUiState: StateFlow<NavUiState> = _navUiState

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

        // Every upload path (phone, watch-merged, companion) ends by setting uploadComplete, so
        // this single collector is where the finished live session gets linked to its run.
        serviceScope.launch {
            _uploadComplete.collect { runId ->
                if (!runId.isNullOrBlank()) linkLiveSessionToResultRun(runId)
            }
        }

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

        // Initialize crash-recovery snapshot store, and surface (in logcat) any snapshot
        // left over from a previous run that never ended normally — see RunCrashRecoveryStore.
        runCrashRecoveryStore = RunCrashRecoveryStore(this)
        runCrashRecoveryStore.logAndPruneStaleSnapshots()

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

        // Attach to the application-scoped SamsungWatchManager singleton (Wear OS Data Layer
        // bridge) — same pattern as the Garmin block above, so a phone-controlled run can be
        // mirrored to either watch brand without the service needing to know which is paired.
        // injectWatchLocation()/updateWatchSensorData() are already brand-neutral; both managers
        // can safely call them.
        try {
            val samsungHiltEntry = EntryPointAccessors.fromApplication(
                applicationContext,
                SamsungWatchManagerEntryPoint::class.java
            )
            samsungWatchManager = samsungHiltEntry.samsungWatchManager()
            samsungWatchManager?.let { manager ->
                manager.onWatchCommand = { action ->
                    Log.d("RunTrackingService", "⌚ Wear watch command received: $action")
                    when (action) {
                        "start"      -> {
                            wasRunStartedByWatch = true
                            lastWatchGpsMs = System.currentTimeMillis()
                            Log.d("RunTrackingService", "⌚ Wear watch START → wasRunStartedByWatch=true, phone GPS blocked")
                            startTracking()
                        }
                        "pause"      -> pauseTracking()
                        "resume"     -> resumeTracking()
                        "stop"       -> stopTracking()
                        "watchReady" -> {
                            serviceScope.launch {
                                val token = sessionManager.getAuthToken()
                                val name  = currentUser?.name ?: ""
                                val age   = currentUser?.age
                                if (token != null) samsungWatchManager?.sendAuth(token, name, age)
                            }
                        }
                        "sessionReady" -> {
                            Log.d("RunTrackingService", "⌚ Wear watch session ready — posting notification")
                            postWatchSessionReadyNotification()
                        }
                        "talkToCoach" -> {
                            Log.d("RunTrackingService", "⌚ Wear watch tap → talk to coach request")
                            triggerWatchTalkToCoach()
                        }
                    }
                }

                manager.onWatchGpsUpdate = { lat, lng, altM, speedMs ->
                    injectWatchLocation(lat, lng, altM, speedMs)
                }

                manager.onWatchSensorData = { frame ->
                    updateWatchSensorData(frame)
                }

                manager.onWatchAppReady = {
                    Log.d("RunTrackingService", "Wear watch app ready — pushing auth token proactively")
                    serviceScope.launch {
                        val token = sessionManager.getAuthToken()
                        val name  = currentUser?.name ?: ""
                        val age   = currentUser?.age
                        if (token != null) {
                            samsungWatchManager?.sendAuth(token, name, age)
                        } else {
                            Log.w("RunTrackingService", "Wear watch ready but no auth token available — user may not be logged in")
                        }
                    }
                }

                Log.d("RunTrackingService", "✅ Attached to shared SamsungWatchManager singleton (no re-init)")
            }
        } catch (e: Exception) {
            Log.w("RunTrackingService", "SamsungWatchManager attach failed (non-fatal): ${e.message}")
            samsungWatchManager = null
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
        // A null Intent is never delivered by anything in this app — every real call site
        // (ViewModel, watch command handler, etc.) always passes an explicit action. Android only
        // ever redelivers a null Intent when it killed this service and START_STICKY is
        // restarting it (e.g. aggressive OEM battery management while the screen was locked).
        //
        // On the fresh Service instance, every per-run instance accumulator (startTime, HR sums,
        // cadence baselines, routePoints, isTracking itself, etc.) has reset to its default —
        // only the companion-object `_currentRunSession` (process-wide, not instance-scoped)
        // survives, and only because onDestroy() deliberately left it intact when it saw
        // isTracking==true at the moment of the kill (see onDestroy below).
        //
        // Previously nothing handled this: the service came back as a silent zombie — still
        // foregrounded, still showing "running" in the UI (isRunning lives in the ViewModel and
        // is never re-synced), but with no timer, no GPS updates, and no watch-frame processing
        // ever restarting. The user would see the display frozen (sometimes at 00:00 if the kill
        // happened almost immediately) for the rest of the session, with no indication anything
        // was wrong. (Reported 2026-08 — Nino, walk session, Garmin Forerunner 55: phone froze
        // while the watch kept tracking correctly the whole time.)
        //
        // stopTracking() already has its own fallback for exactly this "instance vars reset but
        // companion-object session preserved" case (see its startTime==0 guard) since it primarily
        // finalizes from _currentRunSession rather than live instance state — so the safe recovery
        // here is to reuse that same, already-hardened path: finalize and upload whatever data
        // survived, and tell the user, rather than resume tracking with all internal accumulators
        // silently reset to zero (which would produce a run with a real first half and a bogus,
        // zeroed-out second half baked into its averages).
        if (intent == null) {
            // The actual recovery decision needs a network round-trip (asking the server whether
            // the watch is still tracking independently — see handleNullIntentRespawn), so it
            // can't be made synchronously here. Safe to return immediately either way: there is
            // no other work this call needs to do, and the coroutine below owns finishing the
            // service's lifecycle (stopSelf()/stopForeground()) once it resolves.
            serviceScope.launch(Dispatchers.IO) {
                handleNullIntentRespawn()
            }
            return START_NOT_STICKY
        }

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
            // Same rule as the plan-context block below: a follow-up start-type intent that
            // carries no target (ACTION_START_TRACKING_FROM_WATCH, a bare ACTION_START_TRACKING
            // after ACTION_PREPARE_FOR_WATCH already delivered the config) must not wipe a target
            // the session already has. Losing the target silently disables the final-500/250/100m
            // cues, the "target reached" cue AND the final-stretch gate that mutes everything else.
            targetDistance = rawTargetDist?.let {
                // If value <= 100, it's in km (e.g., 5.0, 10.0, 42.195). Convert to metres.
                // If value > 100, it's already in metres (e.g., 5000, 10000). Keep as-is.
                if (it <= 100.0) it * 1000.0 else it
            } ?: targetDistance
            targetTime = intent?.getLongExtra(EXTRA_TARGET_TIME, 0)?.takeIf { it > 0 } ?: targetTime

            // ── Last-resort target recovery from the process-level config holder ──────────
            // The target reaches this service ONLY as an intent extra, which means it exists
            // nowhere but this instance's memory. Every re-entry path that isn't the original
            // configured intent therefore arrives with no target at all:
            //   • GarminWatchManager's no-listener bootstrap sends a bare
            //     ACTION_START_TRACKING_FROM_WATCH with no extras whatsoever (same
            //     onWatchCommand == null condition that used to swallow pause/resume);
            //   • a service restart between "Prepare" and the watch's "start" resets these
            //     fields, and the watch's start carries nothing to restore them from.
            // Losing it is silent and expensive: no target-pace coaching, no final
            // 500/250/100 m cues, no "target reached", and targetDistance/targetTime land NULL
            // on the saved run. Confirmed on two real runs (2026-09-14) — one configured for
            // 10 km / 50 min, one for 5 km / 25 min — both saved with both fields null.
            //
            // RunConfigHolder already holds the RunSetupConfig the user actually configured and
            // is what RunSessionScreen reads, so it is the same source of truth, just one that
            // outlives a single intent. Only consulted when we'd otherwise have nothing, so it
            // can never override a target the intent or an earlier Prepare already supplied.
            if (targetDistance == null || targetTime == null) {
                RunConfigHolder.getConfig()?.let { cfg ->
                    if (targetDistance == null) {
                        cfg.targetDistance?.toDouble()?.takeIf { it > 0 }?.let { km ->
                            targetDistance = km * 1000.0
                            Log.d("RunTrackingService", "🎯 targetDistance recovered from RunConfigHolder: ${km}km (intent carried none)")
                        }
                    }
                    if (targetTime == null && cfg.hasTargetTime) {
                        val ms = (cfg.targetHours * 3600000L) + (cfg.targetMinutes * 60000L) + (cfg.targetSeconds * 1000L)
                        if (ms > 0) {
                            targetTime = ms
                            Log.d("RunTrackingService", "🎯 targetTime recovered from RunConfigHolder: ${ms / 1000}s (intent carried none)")
                        }
                    }
                }
            }
            Log.d("RunTrackingService", "🎯 Session target after ${intent?.action}: " +
                "distance=${targetDistance?.let { "${it / 1000.0}km" } ?: "none"}, " +
                "time=${targetTime?.let { "${it / 1000}s" } ?: "none"}")
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
            ACTION_STOP_TRACKING -> stopTracking(intent?.getStringExtra(EXTRA_COMPANION_RUN_ID))
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
                    // wasRunStartedByWatch/isTracking are FALSE here in two very different
                    // situations that look identical from this fresh instance's point of view:
                    //   1. Genuinely nothing to do — an old/stale offline-batch pending-sync
                    //      ping arrived with no run actually in flight.
                    //   2. This service (and wasRunStartedByWatch/isTracking with it) was killed
                    //      by the OS mid-run and just got recreated by this very Intent — the
                    //      watch's session may have already completed and saved server-side, but
                    //      this fresh instance has no memory of ever having tracked it, so it
                    //      would previously just self-destruct here, leaving the user's still-open
                    //      run screen silently stuck forever with nothing to resolve it.
                    // Ask the server (the same recoverable-session lookup stopTracking()'s
                    // fresh-instance fallback and handleNullIntentRespawn() both use) before
                    // giving up, so case 2 gets a real resolution instead of silence.
                    if (!isTracking) {
                        Log.d("RunTrackingService", "⌚ ACTION_WATCH_RUN_FINISHED — not tracking, checking for an already-saved companion run before giving up")
                        serviceScope.launch {
                            val recoveredRunId = resolveCompanionRunIdFallback()
                            if (recoveredRunId != null) {
                                handOffToAlreadySavedRun(recoveredRunId)
                            } else {
                                Log.d("RunTrackingService", "⌚ ACTION_WATCH_RUN_FINISHED — nothing recoverable, stopping self")
                                stopSelf()
                            }
                        }
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
        // Guard against a STALE "start" command, not just a concurrent one. The watch retries
        // its "start" send up to 3x over 5s if unacknowledged (RunView.mc START_RETRY_*), and
        // that retry can be queued/delayed well beyond that window when the phone screen is
        // locked (see the 30-90s BT delivery delay noted in updateRunSession() below) — so a
        // late-arriving retry can land after the session already began and has since been
        // PAUSED. isTracking alone is false during a pause, so it let a stray retry sail through
        // into a full re-init (totalDistance/routePoints/kmSplits all wiped to zero,
        // startTime reset) on top of a run still genuinely in progress — silently discarding
        // everything recorded before the pause. pauseStartTime > 0 is the paused-but-still-live
        // signal (set in pauseTracking(), cleared in resumeTracking()/here), so check it too.
        if (isTracking || pauseStartTime > 0) {
            Log.w("RunTrackingService", "Already tracking or paused, ignoring stale start request")
            return
        }

        // Watch-started runs (and any other start with no explicit target) fall back to the
        // target the user has configured on the Dashboard — the same "user_prefs" values
        // DashboardViewModel/MapMyRunSetupScreen persist and would have used had this been
        // prepared on the phone. Without a target there are no final-500/250/100m cues, no
        // "target reached" cue and no final-stretch quiet zone, and the race-distance inference
        // below is a poor substitute (see maybeInferTargetDistance).
        if (targetDistance == null) {
            try {
                val prefs = getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
                val dashKm = prefs.getFloat("target_distance_km", 0f)
                if (dashKm > 0f) {
                    targetDistance = dashKm.toDouble() * 1000.0
                    if (targetTime == null && prefs.getBoolean("target_time_enabled", false)) {
                        val h = prefs.getString("target_hours", "0")?.toIntOrNull() ?: 0
                        val m = prefs.getString("target_minutes", "0")?.toIntOrNull() ?: 0
                        val sec = prefs.getString("target_seconds", "0")?.toIntOrNull() ?: 0
                        val ms = (h * 3600L + m * 60L + sec) * 1000L
                        if (ms > 0) targetTime = ms
                    }
                    Log.d("RunTrackingService", "No target on this start — using Dashboard target ${dashKm}km" +
                        (targetTime?.let { " / ${it / 1000}s" } ?: ""))
                }
            } catch (e: Exception) {
                Log.w("RunTrackingService", "Could not read Dashboard target fallback: ${e.message}")
            }
        }

        Log.d("RunTrackingService", "Starting tracking... targetDistance=$targetDistance, targetTime=$targetTime, hasRoute=$hasRoute")
        
        // CRITICAL: Call startForeground IMMEDIATELY to avoid ANR
        try {
            val startingLabel = if (currentActivityType == "walk") "Starting walk..." else "Starting run..."
            startForeground(NOTIFICATION_ID, createNotification(startingLabel, "Initializing GPS"))
            Log.d("RunTrackingService", "Foreground service started successfully")
        } catch (e: Exception) {
            // Most common cause: Android 14+ blocks starting a location-type foreground
            // service from the background (no visible activity / no active exemption at
            // this exact moment) — SecurityException "the app must be in the eligible
            // state/exemptions". Hit when the watch starts a run with no phone-side prep
            // (GarminWatchManager's no-listener bootstrap, or its FCM-fallback twin) while
            // the phone app isn't foregrounded. Previously this failed completely silently
            // from the user's perspective — the watch had no way to know the phone never
            // actually started tracking. A plain notification is not itself a foreground-
            // service start, so it's unaffected by this restriction.
            Log.e("RunTrackingService", "Failed to start foreground service", e)
            postTrackingStartFailedNotification()
            stopSelf()
            return
        }

        // Now safely initialize everything else
        isTracking = true
        preCacheSystemAudio()  // Warm the pause/resume audio cache before any pause can happen
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

        // Flip observers from "Waiting for X to start" to the live map. Done here — in the one
        // place every run passes through — rather than only in RunSessionViewModel.startRun(),
        // because a watch-started ("Prepare for Watch") run never calls startRun(): the watch's
        // "start" arrives via onWatchCommand → here. Idempotent, so the VM's own hasStarted
        // sync on the phone-start path doubling up is harmless.
        activeLiveSessionId?.takeIf { it.isNotBlank() }?.let { liveId ->
            serviceScope.launch {
                try {
                    apiService.syncLiveSession(
                        live.airuncoach.airuncoach.network.SyncLiveSessionRequest(sessionId = liveId, hasStarted = true)
                    )
                    Log.d("RunTrackingService", "Live session $liveId marked started for observers")
                } catch (e: Exception) {
                    Log.w("RunTrackingService", "Failed to mark live session started (non-fatal): ${e.message}")
                }
            }
        }
        totalPausedMs = 0      // Reset pause tracking for new run
        pauseStartTime = 0
        isFinalizingStop = false  // Re-arm stopTracking() for this new run
        splitPausedMs = 0
        hasCreditedStartIdle = false  // Re-arm start-line idle detection for new run
        startIdleDistances.clear()
        startIdleTimes.clear()
        startIdleTimestamps.clear()
        routePoints.clear()
        kmSplits.clear()
        lastKmSplit = 0
        pendingKmSplitCoachingQueue.clear()  // Clear any deferred splits from previous run
        last500mMilestone = 0  // Reset for new run
        hasFiredTargetReachedCoaching = false  // Reset for new run
        targetReachedAtDurationMs = null  // Reset for new run
        hasGarminData = false       // Will be set true once first watch biometric frame arrives
        garminDeviceName = null     // Re-captured on first frame new run
        phoneGpsFallbackActive = false  // Reset for new run — re-evaluated below / by checkPhoneGpsFallback()
        lastFallbackSeriesSampleMs = 0L
        lastPhase = null        // Reset for new run - allow first phase change to trigger
        lastCoachingTime = 0   // Reset cooldown for new run
        totalDistance = 0.0
        stationaryPointsRejected = 0
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
        watchElapsedAnchorWallMs = 0L
        watchElapsedAnchorPhoneActiveMs = -1L
        watchDistanceM = 0f          // Reset authoritative Garmin distance
        lastWatchDistanceAcceptedAtSec = -1  // Re-arm the distance-jump sanity check for new run
        totalElevationGain = 0.0
        hasGpsElevation = false
        currentSmoothedGrade = 0.0
        steepestWindowInclinePct = 0f
        steepestWindowDeclinePct = 0f
        totalElevationLoss = 0.0
        garminElevBuffer.clear()
        prevGarminElevWindowMean = null
        weatherAtStart = null
        weatherAtEnd = null
        weatherFetchAttempted = false  // Reset for new run — see onNewLocation()'s first-fix weather fetch
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
        lastHrAcceptedWallMs = 0L
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
        phoneGpsAccuracySum = 0f; phoneGpsAccuracyCount = 0; phoneGpsAccuracyWorst = 0f
        watchMinPace = 0.0; watchMaxPace = 0.0
        runStartStepCount = -1
        windowStartStepCount = -1
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

        // Seeded with the start time, not 0: the DIVERSIFY substitution fires once
        // ELITE_COACHING_SUBSTITUTION_INTERVAL_MS has passed since the last elite cue, so with 0
        // here the very first km split / on-pace update of EVERY run was swapped for a technique
        // cue instead of the runner hearing their first split.
        lastEliteCoachingTime = System.currentTimeMillis()
        lastMidKmEliteKm = -1
        lastTechniqueCoachingTime = 0
        lastGlobalCoachingTime = 0
        lastGlobalCoachingDistance = 0.0
        lastEliteCoachingDistance = -9999.0
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
        smoothedMinElevation = null
        smoothedMaxElevation = null
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

        // Start location and sensors (skip real GPS/sensors during simulation — simulator feeds locations directly).
        // For a watch-initiated run, skip the initial request entirely — the watch is the
        // authoritative GPS/HR/cadence source and checkPhoneGpsFallback() (driven off the
        // per-second timer tick) will start these reactively only if watch data actually
        // goes stale. See phoneGpsFallbackActive's declaration for the full rationale.
        try {
            if (!isSimulating && !wasRunStartedByWatch) {
                requestLocationUpdates()
                startSensorTracking()
                phoneGpsFallbackActive = true
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
            com.google.firebase.crashlytics.FirebaseCrashlytics.getInstance().recordException(e)
        }

        // Weather is no longer fetched here. Firing a separate one-shot GPS location request
        // (WeatherRepository.getCurrentWeather()'s own getCurrentLocation() call) at the exact
        // moment tracking starts competes with the run's own GPS for a cold lock, and silently
        // swallowed exceptions meant it could fail with zero record of why — confirmed against a
        // real run where weather_data ended up null despite the run itself having a clean GPS
        // track throughout (the very first fix was 17m accuracy, consistent with a cold-start
        // race). It now fires from onNewLocation() using that first real fix's own coordinates
        // instead — see weatherFetchAttempted.

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
    //
    // Progress is measured ALONG THE ROUTE, not by radial distance to the next waypoint.
    // Every check projects the runner onto the nearest polyline segment (cross-track distance +
    // metres along the route) and:
    //   • advances past any instruction whose route position is behind the runner — so cutting
    //     a corner or running the far pavement can never leave the coach stuck on a turn behind
    //     you (the previous engine only skipped a turn once you were >150 m past it AND moving
    //     away, or 2× closer to the next one — on a suburban grid that rarely triggered);
    //   • warns at a pace-scaled distance (a 4:00/km runner covers 100 m in ~24 s, most of
    //     which the LLM round-trip used to eat), then gives a short device-TTS "now" cue at the
    //     turn with no network round-trip;
    //   • detects off-route by cross-track distance to the nearest SEGMENT (not vertex), announces
    //     it once, mutes turn cues while off, and re-syncs on rejoin;
    //   • defers cues blocked by the post-coaching gap instead of dropping them;
    //   • ignores fixes worse than NAV_MAX_ACCURACY_M rather than letting a 40 m jump fake a turn.
    // The map HUD reads the same state (navUiState) so screen and voice agree.

    /**
     * Load route navigation data from the static holder.
     * Called once when tracking starts. If a route is available, sets up the
     * turn instruction list, decodes the polyline and precomputes each instruction's
     * along-route position.
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
            navProgressIndex = 0
            navProgressMeters = 0.0
            navOffRoute = false
            navOffRouteStrikes = 0
            navReachedFixes = 0
            navPendingCue = null
            navCompletionAnnounced = false
            buildNavRouteGeometry()
            Log.d("Navigation", "Loaded ${navTurnInstructions.size} turn instructions, ${navPolylinePoints.size} polyline points, route ${navRouteTotalMeters.toInt()}m")
            navTurnInstructions.forEachIndexed { i, inst ->
                Log.d("Navigation", "  [$i] ${inst.instruction} @ (${inst.latitude}, ${inst.longitude}) route=${navInstructionRouteMeters.getOrNull(i)?.toInt()}m")
            }
            publishNavUiState()
        } else {
            Log.d("Navigation", "No navigation data available")
        }
    }

    /** Cumulative metres at each polyline vertex + each instruction's along-route position. */
    private fun buildNavRouteGeometry() {
        val pts = navPolylinePoints
        navCumulativeMeters = DoubleArray(pts.size)
        for (i in 1 until pts.size) {
            navCumulativeMeters[i] = navCumulativeMeters[i - 1] + SphericalUtil.computeDistanceBetween(pts[i - 1], pts[i])
        }
        navRouteTotalMeters = navCumulativeMeters.lastOrNull() ?: 0.0
        navInstructionRouteMeters = DoubleArray(navTurnInstructions.size)
        navInstructionRouteIndex = IntArray(navTurnInstructions.size)
        if (pts.isEmpty()) {
            // No polyline: fall back to the instruction's own cumulative km field.
            navTurnInstructions.forEachIndexed { i, inst -> navInstructionRouteMeters[i] = inst.distance * 1000.0 }
            return
        }
        // Instructions come from polyline vertices server-side, so the nearest vertex is exact;
        // search forward from the previous instruction so a loop that revisits a street resolves
        // to the correct (later) pass.
        var searchFrom = 0
        navTurnInstructions.forEachIndexed { i, inst ->
            val p = com.google.android.gms.maps.model.LatLng(inst.latitude, inst.longitude)
            var bestIdx = searchFrom
            var bestDist = Double.MAX_VALUE
            for (j in searchFrom until pts.size) {
                val d = SphericalUtil.computeDistanceBetween(p, pts[j])
                if (d < bestDist) { bestDist = d; bestIdx = j }
            }
            navInstructionRouteIndex[i] = bestIdx
            navInstructionRouteMeters[i] = navCumulativeMeters[bestIdx]
            searchFrom = bestIdx
        }
    }

    /** Result of projecting the runner onto the route polyline. */
    private data class NavProjection(val segmentIndex: Int, val crossTrackM: Double, val routeMeters: Double)

    /**
     * Nearest-segment projection. Searches a window ahead of the current progress first (so a
     * loop that passes the same spot twice resolves to the pass the runner is actually on), and
     * only falls back to a whole-route search when the windowed result is clearly off-route.
     */
    private fun projectOntoRoute(pos: com.google.android.gms.maps.model.LatLng): NavProjection? {
        val pts = navPolylinePoints
        if (pts.size < 2) return null
        fun search(from: Int, to: Int): NavProjection {
            var best = NavProjection(from, Double.MAX_VALUE, 0.0)
            for (i in from until minOf(to, pts.size - 1)) {
                val a = pts[i]; val b = pts[i + 1]
                val d = PolyUtil.distanceToLine(pos, a, b)
                if (d < best.crossTrackM) {
                    // Fraction along the segment via an equirectangular projection (segments are short).
                    val latRad = Math.toRadians(a.latitude)
                    val ax = 0.0; val ay = 0.0
                    val bx = Math.toRadians(b.longitude - a.longitude) * Math.cos(latRad)
                    val by = Math.toRadians(b.latitude - a.latitude)
                    val px = Math.toRadians(pos.longitude - a.longitude) * Math.cos(latRad)
                    val py = Math.toRadians(pos.latitude - a.latitude)
                    val segLen2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay)
                    val t = if (segLen2 > 0) (((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / segLen2).coerceIn(0.0, 1.0) else 0.0
                    val segMeters = navCumulativeMeters[i + 1] - navCumulativeMeters[i]
                    best = NavProjection(i, d, navCumulativeMeters[i] + t * segMeters)
                }
            }
            return best
        }
        val windowed = search(maxOf(0, navProgressIndex - NAV_SEARCH_BACK_SEGMENTS), navProgressIndex + NAV_SEARCH_AHEAD_SEGMENTS)
        if (windowed.crossTrackM <= NAV_OFF_ROUTE_M) return windowed
        // Clearly off the expected stretch — maybe a shortcut that rejoined further along, or a
        // genuine wander. Only accept a global match that is AHEAD of current progress (never
        // rewind the runner onto an earlier lap) and genuinely on the line.
        val global = search(0, pts.size - 1)
        return if (global.crossTrackM <= NAV_REJOIN_M && global.routeMeters >= navProgressMeters - NAV_SKIP_DISTANCE_BEHIND_M) global else windowed
    }

    private fun currentSpeedMpsForNav(): Double {
        val s = routePoints.lastOrNull()?.speed
        if (s != null && s > 0.5f) return s.toDouble()
        val paceSec = parsePaceToSeconds(_currentRunSession.value?.averagePace ?: "")
        return if (paceSec > 0) 1000.0 / paceSec else 2.8 // ~6:00/km default
    }

    /**
     * Core navigation check — called on every location update (including ones rejected for
     * distance tracking). Runs at most every NAV_CHECK_INTERVAL_MS.
     */
    private fun checkNavigationProgress(currentLat: Double, currentLng: Double, accuracyM: Float) {
        if (!coachingFeaturePrefs.routeNavigationEnabled) return
        if (navTurnInstructions.isEmpty()) return

        val now = System.currentTimeMillis()
        if (now - navLastCheckTime < NAV_CHECK_INTERVAL_MS) return
        navLastCheckTime = now

        // A pending cue that was blocked by the post-coaching gap last time — say it now if we can.
        navPendingCue?.let { cue ->
            if (!isMuted && canFireCoaching(isNavigation = true)) {
                navPendingCue = null
                announceNavigationNow(cue)
            }
        }

        // Noisy fix: don't let a 40 m jump fake a turn or an off-route. Skip, don't stop.
        if (accuracyM > NAV_MAX_ACCURACY_M) {
            Log.d("Navigation", "Skipping nav check — accuracy ${accuracyM.toInt()}m")
            return
        }

        val currentPos = com.google.android.gms.maps.model.LatLng(currentLat, currentLng)
        val projection = projectOntoRoute(currentPos)

        if (projection != null) {
            handleOffRouteState(projection)
            if (!navOffRoute) {
                navProgressIndex = projection.segmentIndex
                navProgressMeters = maxOf(navProgressMeters, projection.routeMeters)
            }
        }

        if (navCurrentInstructionIndex >= navTurnInstructions.size) {
            checkRouteCompletion()
            publishNavUiState()
            return
        }
        if (navOffRoute) { publishNavUiState(); return }

        // ── Advance past anything the runner is already beyond (along the route) ──
        var skipped = 0
        while (navCurrentInstructionIndex < navTurnInstructions.size &&
               navInstructionRouteMeters[navCurrentInstructionIndex] < navProgressMeters - NAV_SKIP_DISTANCE_BEHIND_M) {
            if (navLastAnnouncedIndex != navCurrentInstructionIndex) { navMissedWaypointCount++; skipped++ }
            advanceToNextInstruction(if (navLastAnnouncedIndex == navCurrentInstructionIndex) "passed" else "missed")
        }
        if (navCurrentInstructionIndex >= navTurnInstructions.size) { publishNavUiState(); return }
        val nextInstruction = navTurnInstructions[navCurrentInstructionIndex]
        if (skipped > 0) {
            // Re-orient the runner on the instruction that now applies.
            val ahead = (navInstructionRouteMeters[navCurrentInstructionIndex] - navProgressMeters).toInt().coerceAtLeast(0)
            announceNavigationNow("Next: in about $ahead metres, ${nextInstruction.instruction}")
            navLastWarningIndex = navCurrentInstructionIndex
            publishNavUiState()
            return
        }

        val alongToTurn = navInstructionRouteMeters[navCurrentInstructionIndex] - navProgressMeters
        val waypointPos = com.google.android.gms.maps.model.LatLng(nextInstruction.latitude, nextInstruction.longitude)
        val radialToTurn = SphericalUtil.computeDistanceBetween(currentPos, waypointPos)
        val distanceToTurn = if (projection != null) alongToTurn else radialToTurn
        val speed = currentSpeedMpsForNav()
        val warnDistance = (speed * NAV_WARNING_LEAD_SECONDS).coerceIn(NAV_WARNING_MIN_M, NAV_WARNING_MAX_M)

        Log.d("Navigation", "Check: idx=$navCurrentInstructionIndex along=${alongToTurn.toInt()}m radial=${radialToTurn.toInt()}m xtrack=${projection?.crossTrackM?.toInt()}m warnAt=${warnDistance.toInt()}m '${nextInstruction.instruction}'")

        // ── "Now" cue: at the turn. Two consecutive in-radius fixes so one jump can't trigger it. ──
        val atTurn = distanceToTurn <= NAV_TURN_NOW_M || radialToTurn <= NAV_WAYPOINT_REACHED_RADIUS_M
        if (atTurn) navReachedFixes++ else navReachedFixes = 0
        if (navReachedFixes >= 2 || (atTurn && projection != null && alongToTurn <= 0.0)) {
            if (navLastAnnouncedIndex != navCurrentInstructionIndex) {
                navLastAnnouncedIndex = navCurrentInstructionIndex
                announceNavigationNow(nextInstruction.instruction)
            }
            navReachedFixes = 0
            advanceToNextInstruction("reached")
            publishNavUiState()
            return
        }

        // ── Advance warning: pace-scaled lead, coach-voiced via the LLM (it has time here). ──
        if (distanceToTurn <= warnDistance && navLastWarningIndex != navCurrentInstructionIndex) {
            navLastWarningIndex = navCurrentInstructionIndex
            val rounded = ((distanceToTurn / 10.0).toInt() * 10).coerceAtLeast(10)
            val warningText = "In $rounded metres, ${nextInstruction.instruction}"
            Log.d("Navigation", "WARNING: $warningText")
            announceNavigationText(warningText)
        }
        publishNavUiState()
    }

    /** Cross-track → off-route state machine. 3 consecutive bad fixes to trip, hysteresis to clear. */
    private fun handleOffRouteState(projection: NavProjection) {
        if (!navOffRoute) {
            if (projection.crossTrackM > NAV_OFF_ROUTE_M) {
                navOffRouteStrikes++
                if (navOffRouteStrikes >= NAV_OFF_ROUTE_STRIKES) {
                    navOffRoute = true
                    navOffRouteStrikes = 0
                    Log.d("Navigation", "OFF ROUTE (${projection.crossTrackM.toInt()}m from route)")
                    announceNavigationNow("You're off the route. Head back towards it and I'll pick up the directions.")
                }
            } else {
                navOffRouteStrikes = 0
            }
        } else if (projection.crossTrackM <= NAV_REJOIN_M) {
            navOffRoute = false
            navOffRouteStrikes = 0
            navProgressIndex = projection.segmentIndex
            navProgressMeters = maxOf(navProgressMeters, projection.routeMeters)
            // Skip anything the detour bypassed, then re-orient.
            while (navCurrentInstructionIndex < navTurnInstructions.size &&
                   navInstructionRouteMeters[navCurrentInstructionIndex] < navProgressMeters - NAV_SKIP_DISTANCE_BEHIND_M) {
                advanceToNextInstruction("bypassed while off route")
            }
            val next = navTurnInstructions.getOrNull(navCurrentInstructionIndex)
            val text = if (next != null) {
                val ahead = (navInstructionRouteMeters[navCurrentInstructionIndex] - navProgressMeters).toInt().coerceAtLeast(0)
                navLastWarningIndex = navCurrentInstructionIndex
                "Back on route. Next: in about $ahead metres, ${next.instruction}"
            } else "Back on route."
            Log.d("Navigation", "REJOINED route at ${navProgressMeters.toInt()}m")
            announceNavigationNow(text)
        }
    }

    private fun checkRouteCompletion() {
        if (navCompletionAnnounced) return
        if (navRouteTotalMeters > 0 && navProgressMeters >= navRouteTotalMeters - NAV_COMPLETION_M) {
            navCompletionAnnounced = true
            announceNavigationNow("That's the whole route. Keep going to the finish!")
        }
    }

    /**
     * Advance to the next turn instruction.
     */
    private fun advanceToNextInstruction(reason: String) {
        val prev = navCurrentInstructionIndex
        navCurrentInstructionIndex++
        navReachedFixes = 0
        if (navCurrentInstructionIndex < navTurnInstructions.size) {
            Log.d("Navigation", "Advanced: $prev -> $navCurrentInstructionIndex ($reason). " +
                    "Next: '${navTurnInstructions[navCurrentInstructionIndex].instruction}'")
        } else {
            Log.d("Navigation", "All ${navTurnInstructions.size} instructions completed ($reason)")
            if (!navCompletionAnnounced) {
                navCompletionAnnounced = true
                announceNavigationNow("You've completed all the turns. Head to the finish!")
            }
        }
    }

    /**
     * Time-critical cue (at the turn, off-route, rejoin): device TTS through the PRIORITY queue,
     * no LLM round-trip. Deferred — not dropped — if the post-coaching gap blocks it.
     */
    private fun announceNavigationNow(text: String) {
        if (isMuted) { Log.d("Navigation", "Muted — skipping: $text"); return }
        if (!canFireCoaching(isNavigation = true)) {
            Log.d("Navigation", "Deferred (too soon after other coaching): $text")
            navPendingCue = text
            return
        }
        recordCoachingFired()
        _latestCoachingText.value = text
        coachingHistory.add(AiCoachingNote(time = getActiveRunDuration(), message = "Nav: $text"))
        CoachingAudioQueue.enqueueNavigation(
            context = this@RunTrackingService,
            base64Audio = null,
            format = null,
            fallbackText = text,
            accent = currentUser?.coachAccent,
            gender = currentUser?.coachGender,
            onComplete = { _latestCoachingText.value = null }
        )
    }

    /**
     * Announce navigation text (advance warnings) via LLM coach voice. Deferred if gated.
     */
    private fun announceNavigationText(text: String) {
        Log.d("Navigation", "ANNOUNCE text via LLM: $text")
        requestNavigationCoachingFromLLM(text, null)
    }

    private fun publishNavUiState() {
        val idx = navCurrentInstructionIndex
        val next = navTurnInstructions.getOrNull(idx)
        _navUiState.value = NavUiState(
            hasRoute = navTurnInstructions.isNotEmpty(),
            nextInstructionIndex = idx,
            nextInstruction = next?.instruction,
            distanceToNextTurnM = next?.let { (navInstructionRouteMeters.getOrElse(idx) { 0.0 } - navProgressMeters).coerceAtLeast(0.0) },
            routeProgressIndex = navProgressIndex,
            routeProgressMeters = navProgressMeters,
            isOffRoute = navOffRoute
        )
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
            // Deferred, not dropped — a km split a few seconds before a turn used to silently
            // kill the turn call. The next nav check replays it (device TTS, no LLM).
            Log.d("Navigation", "Deferred (too soon after other coaching): $navigationText")
            navPendingCue = navigationText
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
                    userId = currentUser?.id,
                    garminCompanionSessionId = garminWatchManager?.activeCompanionSessionId
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
     * Called from startTracking() — before any distance has accumulated, so
     * inferredTargetDistance (set once the runner passes 85% of a common race distance,
     * see maybeInferTargetDistance()) is necessarily still null at that first call. Also
     * re-called from maybeInferTargetDistance() itself once inference succeeds, so a user who
     * set a target TIME but no explicit target DISTANCE (e.g. "finish in 23 minutes" for an
     * obviously-5K parkrun) still gets this engine turned on retroactively mid-run instead of
     * it staying permanently disabled for the whole session — that gate check only ever ran
     * once, at the one moment inference couldn't possibly have fired yet.
     */
    private fun initPaceCoaching() {
        val tDist = targetDistance ?: inferredTargetDistance
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
        val tDist = targetDistance ?: inferredTargetDistance ?: return

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

        // ── DIVERSIFY: swap this routine pace-status update for elite coaching ──
        // Generic "you're X seconds ahead/behind target pace, projected finish Y" updates are the
        // most repetitive content in a free run (confirmed on a real session: 8 of 17 messages
        // followed this exact template, zero technique/breathing/mental variety like "smile for
        // the next 2 minutes"). Only substitute when on pace — the least urgent, most repetitive
        // case; genuine "too fast/slow" pace feedback still fires as normal. This consumes the
        // SAME slot as a routine pace update (same total message count) instead of adding a new one.
        if (paceZone == "on_pace" && (now - lastEliteCoachingTime) >= ELITE_COACHING_SUBSTITUTION_INTERVAL_MS) {
            val avgSpeedKmh = if (elapsedSeconds > 0) (distKm / (elapsedSeconds / 3600.0)).toFloat() else 0f
            val swapped = maybeFireEliteCoaching(
                totalDistance,
                elapsedMs,
                avgSpeedKmh,
                determinePhase(distKm, tDist / 1000.0),
                forceBypassCooldown = true
            )
            // Only give up this pace-update slot if the swap actually fired; otherwise (elite
            // coaching disabled, final stretch, etc.) fall through to the normal pace update.
            if (swapped) {
                lastPaceCoachingDistance = totalDistance
                lastPaceCoachingTime = now
                return
            }
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
                    userId = currentUser?.id,
                    garminCompanionSessionId = garminWatchManager?.activeCompanionSessionId
                )
                
                Log.d("PaceCoaching", "Requesting LLM pace coaching: triggerType=${update.triggerType}, " +
                        "deviation=${String.format("%.1f", paceDeviation * 100)}%, " +
                        "abandoning=$isAbandoning")
                
                val response = apiService.getPhaseCoaching(update)
                // Server returns skipped=true with no message when the shared cooldown rejects
                // this call — skip logging/playback in that case rather than relying on an NPE.
                if (!response.skipped && response.message.isNotBlank()) {
                    Log.d("PaceCoaching", "LLM response: ${response.message.take(80)}...")

                    // Play via the standard coaching audio pipeline (handles all text normalizations)
                    playCoachingAudio(response.audio, response.format, response.message)
                }
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
        // <= rather than a 0..N range: once the runner is PAST the target, remaining goes
        // negative and this must still read as "final stretch / done", not "mid-run". With the
        // old range check, struggle detection re-armed the moment the target was crossed and
        // fired when the runner slowed to stop (2026-09-20: a "Struggle" cue 90 s after
        // "Target reached" on a half marathon, coaching the cool-down as a fade).
        return remaining <= FINAL_STRETCH_METERS
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

        // Use the same smoothed distance/time speed that drives the displayed pace
        // (recentPaceDistances/recentPaceTimes, ~8 points / 8-16s window) rather than a
        // single point's raw reported speed (phone Doppler or watch-streamed speedMs).
        // A single bad reading from either source (BLE glitch, GPS multipath, etc.) can
        // spike that raw value toward the formula's clamp ceiling and produce a wildly
        // wrong personalised cadence target that disagrees with the pace quoted in the
        // same coaching message — smoothing over several points absorbs a one-off spike.
        val currentSpeed = if (recentPaceDistances.size >= 3) {
            val totalDist = recentPaceDistances.sum()
            val totalTime = recentPaceTimes.sum()
            if (totalTime > 0) totalDist / totalTime else 0.0
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
            // Capture device name once — requires manager to be available. This callback is
            // shared by both watch managers (onWatchSensorData), so try whichever is actually
            // connected rather than assuming Garmin.
            if (garminDeviceName == null) {
                garminDeviceName = garminWatchManager?.getConnectedDeviceName()
                    ?: samsungWatchManager?.getConnectedDeviceName()
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
                        // Sanity check: reject an implausibly fast increase, even though it
                        // technically passed the monotonic check above. Without this, a single
                        // corrupted/glitched frame (garbled BLE payload, or a genuine watch
                        // GPS/firmware spike) reporting a wildly-too-large distance gets accepted
                        // once, and every subsequent CORRECT (lower) frame is then silently
                        // rejected as "stale" by the check above for the rest of the run —
                        // permanently freezing distance at the wrong number with no way to
                        // recover. Confirmed in real session data (2026-09-01, Nino): the coaching
                        // log announced "Km 10" during a walk that only ever covered ~5km.
                        // No baseline yet this run (first accepted frame, or fresh after a
                        // reattach) always passes — nothing to sanity-check against, and a
                        // legitimate first value should never be rejected. A genuine catch-up
                        // jump after a long gap (BLE drop, reattach) also passes: dividing by the
                        // watch's own elapsed time means a big jump over a long gap implies a
                        // normal speed, while the same jump over a couple of seconds does not.
                        val prevAcceptedSec = lastWatchDistanceAcceptedAtSec
                        val elapsedSec = if (prevAcceptedSec >= 0) (frame.elapsedSeconds - prevAcceptedSec) else null
                        val jumpM = watchDistanceM - this.watchDistanceM
                        val impliedSpeedKmh = if (elapsedSec != null && elapsedSec > 0) (jumpM / elapsedSec) * 3.6 else 0.0
                        val maxReasonableSpeedKmh = if (currentActivityType == "walk") 15.0 else 35.0
                        // Generous 2x headroom over the strict per-GPS-point filter elsewhere —
                        // this is a coarse guard meant to catch genuinely corrupted/glitched
                        // spikes, not fine-tune normal pace variation.
                        val isPlausible = elapsedSec == null || elapsedSec <= 0 ||
                            impliedSpeedKmh <= maxReasonableSpeedKmh * 2.0
                        if (isPlausible) {
                            Log.d(
                                "RunTrackingService",
                                "⌚ Authoritative distance: ${totalDistance.toInt()}m → ${watchDistanceM.toInt()}m"
                            )
                            this.watchDistanceM = watchDistanceM
                            totalDistance = watchDistanceM.toDouble()
                            lastWatchDistanceAcceptedAtSec = frame.elapsedSeconds
                        } else {
                            Log.w(
                                "RunTrackingService",
                                "⚠️ Rejecting implausible Garmin distance jump: ${this.watchDistanceM.toInt()}m → " +
                                    "${watchDistanceM.toInt()}m over ${elapsedSec}s of watch time " +
                                    "(implied ${impliedSpeedKmh.toInt()}km/h) — treating as a corrupted/glitched " +
                                    "frame rather than accepting it and getting permanently stuck on it"
                            )
                        }
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
                watchElapsedAnchorWallMs = System.currentTimeMillis()
                watchElapsedAnchorPhoneActiveMs = if (startTime > 0L) getActiveRunDuration() else -1L
            }
        }
    }

    /**
     * The session clock every duration consumer should use, in ms.
     *
     * Watch-initiated run: the watch's own timer (Activity.Info.timerTime) is authoritative
     * while frames are arriving — it starts exactly on the watch START press, auto-pauses with
     * the watch session and is immune to BT delivery lag. But it only advances when a frame
     * arrives, so once frames have been stale for longer than [WATCH_CLOCK_STALE_MS] (the same
     * window that flips phone GPS on as the distance fallback — see checkPhoneGpsFallback())
     * the last watch value is carried forward on the phone's active-run clock, which excludes
     * any phone-side pauses. As soon as the watch is back its value wins again, so a normal
     * BLE hiccup never shows a phone-derived number. Phone-only run: the phone clock as before.
     */
    private fun currentWatchClockMs(): Long {
        if (!wasRunStartedByWatch || watchElapsedSeconds <= 0) return getActiveRunDuration()
        val watchMs = watchElapsedSeconds * 1000L
        val staleMs = System.currentTimeMillis() - watchElapsedAnchorWallMs
        if (staleMs < WATCH_CLOCK_STALE_MS || watchElapsedAnchorPhoneActiveMs < 0L || startTime <= 0L) return watchMs
        val phoneSinceAnchor = (getActiveRunDuration() - watchElapsedAnchorPhoneActiveMs).coerceAtLeast(0L)
        return watchMs + phoneSinceAnchor
    }

    /** Whole-second form of [currentWatchClockMs] for the km-split clock. */
    private fun currentWatchClockSeconds(): Int = (currentWatchClockMs() / 1000L).toInt()

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

        // Fetch weather from the first real fix this run sees (phone or watch — either one
        // reaches here). Deliberately fire-and-forget and non-blocking: weather is a nice-to-
        // have for the run record, never something worth delaying tracking for. Any accuracy is
        // fine here — unlike distance-relevant fixes below, weather doesn't need precision.
        if (!weatherFetchAttempted) {
            weatherFetchAttempted = true
            val weatherLat = location.latitude
            val weatherLng = location.longitude
            serviceScope.launch {
                try {
                    weatherAtStart = weatherRepository.getCurrentWeather(weatherLat, weatherLng)
                    Log.d("RunTrackingService", "Weather fetched using first GPS fix (${location.provider}): $weatherAtStart")
                } catch (e: Exception) {
                    Log.e("RunTrackingService", "Failed to fetch weather", e)
                }
            }
        }

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
            inclineDegrees = inclineDegrees,
            accuracy = location.accuracy.takeIf { location.hasAccuracy() && it > 0f }
        )
        // Phone GPS accuracy — the same avg/worst the watch path already reports, so uploads
        // and the Raw Data tab no longer show N/A for phone-only runs.
        newPoint.accuracy?.let { acc ->
            phoneGpsAccuracySum += acc; phoneGpsAccuracyCount++
            if (acc > phoneGpsAccuracyWorst) phoneGpsAccuracyWorst = acc
        }

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
            // Speed sanity: reject points implying an impossible speed for the activity.
            // Walks: cap at 15 km/h (well above brisk race-walk pace ~7-8 km/h) — a generic
            // 40 km/h cap (tuned for running) let real-world artifacts through undetected on a
            // walk: signal-reacquisition "teleport" jumps of 20-95m over 3-9s imply 32-40 km/h,
            // which is impossible for a walker but passed the running-tuned cap cleanly. Found via
            // GPS-track analysis of a reported ~1.1km distance over-count on a phone-only walk
            // test (30 such jumps totaling ~1.5km of an 5.46km reported distance).
            // Runs: capped at 35 km/h — above elite marathon pace (~20 km/h) and elite 5K/10K
            // (~24 km/h) with headroom for GPS jitter on downhills, but tighter than the old 40
            // km/h ceiling which was closer to sprinting speed than any distance-running pace.
            val impliedSpeedKmh = if (timeSinceLastPoint > 0) (distanceIncrement / timeSinceLastPoint) * 3.6 else 0.0
            val maxReasonableSpeedKmh = if (currentActivityType == "walk") 15.0 else 35.0
            val isSpeedReasonable = impliedSpeedKmh < maxReasonableSpeedKmh || isFirstLocations

            if (location.accuracy <= maxAcceptableAccuracy && isDistanceReasonable && isSpeedReasonable) {
                lastGpsAccuracyM = location.accuracy  // Track latest accepted GPS accuracy for sensor confidence reporting

                // ── Stationary-drift gate ────────────────────────────────────────────
                // The distance/speed filters above reject implausible JUMPS; nothing until
                // now asked the prior question of whether the user is moving at all.
                // location.speed is Doppler-derived on the fused provider rather than
                // computed from position deltas, so it stays near zero while a stationary
                // phone's reported POSITION wanders — which is exactly what separates drift
                // from movement, and what the summed-increment approach cannot see.
                //
                // Deliberately conservative: this only fires when the fix carries positive
                // evidence of standing still. If hasSpeed() is false (some devices/fixes omit
                // it) behaviour is unchanged rather than guessing, so this can never make the
                // app under-count a real run — the cost is that the drift hole stays open on
                // fixes with no speed field.
                val looksStationary = location.hasSpeed() &&
                    location.speed < MOVEMENT_MIN_SPEED_MS &&
                    distanceIncrement < STATIONARY_MAX_DRIFT_M
                if (looksStationary) {
                    stationaryPointsRejected++
                    Log.d("RunTrackingService", "Stationary drift ignored: ${String.format("%.1f", distanceIncrement)}m " +
                        "at ${String.format("%.2f", location.speed)}m/s (accuracy ${location.accuracy}m) — " +
                        "$stationaryPointsRejected rejected so far this session")
                }
                // Calculate instantaneous pace from consecutive GPS points (for UI display)
                val currentPaceSeconds = if (timeSinceLastPoint > 0 && distanceIncrement > 0) {
                    (1000.0 * timeSinceLastPoint / distanceIncrement).toFloat() // seconds per km
                } else 0f
                
                // Feed rolling window for smoothed pace (used by struggle detection & coaching)
                if (!looksStationary && timeSinceLastPoint > 0 && distanceIncrement > 0) {
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
                // The 900 s/km cap below was meant to catch stationary drift, but drift is
                // bursty rather than slow: 2-5 m hops read as 700-800 s/km and sail under it.
                // That is how a phone standing still reported a plausible 12:06/km. The
                // stationary gate is the real answer; the cap stays as a backstop.
                //
                // Watch-driven run: leave currentPace alone. injectWatchLocation() has just set it
                // from the watch firmware's own Doppler speed (EMA-smoothed) — the same number the
                // watch face is showing the runner — and this synthetic "garmin" Location is that
                // same frame. Overwriting it here with a position-derived pace made the coach quote
                // paces the runner could not see anywhere: on a 2026-09-20 half marathon the
                // position-derived figure ran ~4-5% faster than the watch's speed field over the
                // first 4 km ("flying at 4:24/km" while the wrist read ~4:45), and the runner
                // reasonably concluded the coaching was wrong. Phone-native fixes (fallback after
                // watch GPS goes stale, or a phone-only run) still compute pace here as before.
                val isWatchSpeedPace = location.provider == "garmin" && wasRunStartedByWatch
                if (!isWatchSpeedPace) {
                    currentPace = if (!looksStationary && smoothedPaceSeconds > 0 && smoothedPaceSeconds < 900) {
                        val minutes = (smoothedPaceSeconds / 60).toInt()
                        val seconds = (smoothedPaceSeconds % 60).toInt()
                        String.format("%d:%02d", minutes, seconds)
                    } else {
                        "0:00"
                    }
                }
                // Feed the pace trend buffer whenever we have a valid smoothed pace
                if (!looksStationary && smoothedPaceSeconds > 0 && smoothedPaceSeconds < 900) {
                    updatePaceTrendBuffer(smoothedPaceSeconds.toDouble())
                }
                // Product decision (2026-09 — Daniel): on a watch-driven run, the watch's own
                // reported distance is the sole source of truth — see updateWatchSensorData(),
                // which sets totalDistance directly from the watch firmware's
                // Activity.Info.elapsedDistance on every incoming frame. This synthetic
                // "garmin"-provider Location is built from that SAME incoming frame (see
                // injectWatchLocation()), so also summing it via Haversine here would be a
                // redundant second computation of the same movement from the same data —
                // not a fallback, since updateWatchSensorData() already covers this frame.
                // Real phone-native GPS fixes (location.provider != "garmin") still accumulate
                // here as before — that's the genuine fallback for when watch GPS has actually
                // gone stale (see checkPhoneGpsFallback()) and there is no watch frame to trust.
                // NOTE: this removes a redundant distance computation; it has not been verified
                // against Nino's specific reported numbers, which remain unconfirmed pending
                // his raw session data/logs.
                val isAuthoritativeWatchDistance = location.provider == "garmin" && wasRunStartedByWatch
                if (!isAuthoritativeWatchDistance && !looksStationary) {
                    totalDistance += distanceIncrement
                }

                // Start-line idle credit — see hasCreditedStartIdle's declaration for the full
                // design. Confirm SUSTAINED movement over a short window of consecutive accepted
                // points (not raw cumulative distance), then credit everything since startTime
                // up to the earliest sample in that window as if it were a manual pause.
                if (!hasCreditedStartIdle) {
                    if (impliedSpeedKmh < maxReasonableSpeedKmh) {
                        startIdleDistances.add(distanceIncrement)
                        startIdleTimes.add(timeSinceLastPoint)
                        startIdleTimestamps.add(newPoint.timestamp)
                        while (startIdleDistances.size > START_IDLE_CONFIRM_SAMPLES) {
                            startIdleDistances.removeAt(0)
                            startIdleTimes.removeAt(0)
                            startIdleTimestamps.removeAt(0)
                        }
                    } else {
                        // A single implausible-speed point (a teleport/GPS-reacquisition jump —
                        // can slip through the lenient isFirstLocations accuracy bypass above)
                        // must not be allowed to skew the sustained-pace confirmation window.
                        // Drop it and restart the count from scratch rather than let one bad
                        // sample sit alongside otherwise-genuine ones.
                        startIdleDistances.clear()
                        startIdleTimes.clear()
                        startIdleTimestamps.clear()
                    }

                    if (startIdleDistances.size >= START_IDLE_CONFIRM_SAMPLES &&
                        totalDistance >= START_IDLE_MIN_DISTANCE_M) {
                        val windowDist = startIdleDistances.sum()
                        val windowTime = startIdleTimes.sum()
                        val windowPaceSecPerKm = if (windowDist > 0) (1000.0 * windowTime / windowDist) else Double.MAX_VALUE
                        if (windowPaceSecPerKm < START_IDLE_MAX_PACE_SEC_PER_KM) {
                            hasCreditedStartIdle = true
                            // Anchor to the EARLIEST sample in the confirming window, not "now"
                            // — keeps the credit as tight as possible to when movement actually
                            // began, rather than drifting later by however long confirmation took.
                            val movementStartMs = startIdleTimestamps.first()
                            val elapsedSinceStartMs = movementStartMs - startTime
                            if (elapsedSinceStartMs > 0) {
                                // Taper, not a cliff: cap the CREDITED amount at
                                // START_IDLE_MAX_CREDIT_MS rather than granting zero adjustment
                                // once the real wait runs longer than that (a big corral/wave-
                                // start wait should still get partial credit, not none).
                                val creditableMs = elapsedSinceStartMs.coerceAtMost(START_IDLE_MAX_CREDIT_MS)
                                val idleMs = creditableMs - totalPausedMs
                                if (idleMs > 0) {
                                    totalPausedMs += idleMs
                                    splitPausedMs += idleMs
                                    Log.d("RunTrackingService", "Auto-credited ${idleMs}ms of start-line idle time before first movement " +
                                        "(confirmed sustained ${windowPaceSecPerKm.toInt()}s/km over $START_IDLE_CONFIRM_SAMPLES samples)")
                                }
                            }
                            startIdleDistances.clear()
                            startIdleTimes.clear()
                            startIdleTimestamps.clear()
                        }
                    }
                }
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
                            smoothedMinElevation = smoothedMinElevation?.let { minOf(it, windowMean) } ?: windowMean
                            smoothedMaxElevation = smoothedMaxElevation?.let { maxOf(it, windowMean) } ?: windowMean
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
                            smoothedMinElevation = smoothedMinElevation?.let { minOf(it, windowMean) } ?: windowMean
                            smoothedMaxElevation = smoothedMaxElevation?.let { maxOf(it, windowMean) } ?: windowMean
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
                        // Grade is measured as rise over the trailing GRADE_WINDOW_M of route,
                        // NOT (smoothed-altitude delta ÷ this one GPS step). That old formula
                        // divided a sub-metre change in a 5-sample mean by a single ~6 m step,
                        // which amplified ordinary altitude jitter into a ±8% (p5–p95) signal on
                        // ground whose true grade sat inside ±5%. Replayed against a real
                        // 2026-09-20 half marathon: 421 ticks read ≥5% ("steep") at a median TRUE
                        // grade of 2.6%, the coach announced "steep hill at 5.6%" on a 2.8% rise
                        // and "steep descent" on ground that was actually rising 1.8%, while the
                        // run's one genuine 7–10% climb happened to tick at 3–6% and got called
                        // "gentle". Over 100 m the same jitter is worth about ±1%.
                        val windowGrade = trailingWindowGradePercent(newPoint) ?: 0.0
                        if (windowGrade > steepestWindowInclinePct) steepestWindowInclinePct = windowGrade.toFloat()
                        if (-windowGrade > steepestWindowDeclinePct) steepestWindowDeclinePct = (-windowGrade).toFloat()
                        // Track current real-time grade for isOnHill (not the whole-run average)
                        currentSmoothedGrade = windowGrade
                        updateElevationCoaching(distanceIncrement, windowGrade, smoothedElevChange)
                    }
                }
                routePoints.add(newPoint)
                // Watch run whose watch has gone quiet: keep the pace/altitude sample series
                // going from the phone fix, throttled to the watch's ~2 s frame cadence so the
                // series keep roughly the same sample spacing. The summary's elevation chart
                // prefers altitudeData and spaces it evenly across the whole run, so a series
                // that simply stops at the watch's death gets stretched over the full distance
                // (2026-09-20: series ended at 3276 samples, track ran to 3512). HR has no
                // phone-side source, so it correctly stays absent.
                if (wasRunStartedByWatch && phoneGpsFallbackActive && location.provider != "garmin" &&
                    newPoint.timestamp - lastFallbackSeriesSampleMs >= 1_500L
                ) {
                    lastFallbackSeriesSampleMs = newPoint.timestamp
                    newPoint.altitude?.let { watchAltSeries.add(it.toFloat()) }
                    if (!looksStationary && smoothedPaceSeconds > 0 && smoothedPaceSeconds < 900) {
                        watchPaceSeries.add(smoothedPaceSeconds.toDouble().coerceIn(180.0, 900.0))
                    }
                }
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
                checkNavigationProgress(location.latitude, location.longitude, location.accuracy)
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
            // Uphill naturally slows pace: +10% tolerance from a real 6% climb (the old gate was
            // the 5% "steep" threshold, which has moved to 10% now that grade is measured over
            // 100 m — a slowdown on a 6-9% climb is terrain, not a struggle).
            val hillTolerance = if (currentSmoothedGrade > STRUGGLE_HILL_TOLERANCE_GRADE) 10.0 else 0.0
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

        // Walks get the same split cadence as runs: the user's km-split interval, nothing in
        // between. The extra 500 m "walk splits" that used to fire here (1.5, 2.5 km …) were
        // removed 2026-09-18 — with the elite/technique channel they gave a walker a message
        // every ~200 m. The one-time first-500 m check-in (check500mMilestones) is unchanged.

        // ── Retry the oldest pending split from a previous tick where cooldown blocked it ──
        // Drop anything that has gone stale first, so a slot is never spent announcing a
        // boundary the runner left behind minutes ago.
        val nowForPending = System.currentTimeMillis()
        pendingKmSplitCoachingQueue.removeAll { queued ->
            val ageMs = nowForPending - queued.queuedAtMs
            val movedM = totalDistance - queued.queuedAtDistanceM
            val stale = ageMs > PENDING_SPLIT_MAX_AGE_MS || movedM > PENDING_SPLIT_MAX_DISTANCE_M
            if (stale) {
                Log.w("RunTrackingService", "Dropping stale pending km split ${queued.split.km}km — " +
                    "${ageMs / 1000}s and ${movedM.toInt()}m past the boundary, too late to be useful")
            }
            stale
        }

        // Pending splits are retried BEFORE elite coaching gets a look at the slot. The other
        // way round, maybeFireMidKmEliteCoaching() took the slot first on every tick and
        // re-armed the shared cooldown, starving the split that was already waiting — which
        // contradicts the "km splits are non-negotiable" rule stated at the defer site below,
        // and is how a real session ended up hearing km 3 announced while approaching km 4.
        val pending = pendingKmSplitCoachingQueue.firstOrNull()
        if (pending != null && !hasCoachingFiredThisTick && canFireCoaching() && !isInFinalStretch()) {
            Log.d("RunTrackingService", "Retrying pending km split coaching at ${pending.split.km}km (${pendingKmSplitCoachingQueue.size - 1} more queued)")
            pendingKmSplitCoachingQueue.removeAt(0)
            hasCoachingFiredThisTick = true
            recordCoachingFired()
            triggerKmSplitCoaching(pending.split)
            return
        }

        maybeFireMidKmEliteCoaching()

        if (currentKm > lastKmSplit) {
            val now = System.currentTimeMillis()
            // currentWatchClockSeconds(), not watchElapsedSeconds directly — see that helper for
            // why (a dead watch otherwise freezes this clock and the next boundary gets a bogus
            // near-zero split time).
            val watchClockNow = currentWatchClockSeconds()
            val totalSplitTime = if (wasRunStartedByWatch && watchElapsedSeconds > 0) {
                ((watchClockNow - lastSplitWatchElapsedSeconds).coerceAtLeast(0) * 1000L)
            } else {
                (now - lastSplitTime) - splitPausedMs  // Exclude paused time from this split
            }
            // A single update can cross more than one km boundary at once — a GPS gap, a watch
            // relay catching up after a BLE stall, or a large accepted distance correction (see
            // the watch-distance sanity check elsewhere in this file). Looping through every
            // boundary crossed, rather than recording only the highest one, avoids two problems:
            // silently dropping the skipped km(s) from the permanent split record/upload, and
            // attributing the ENTIRE multi-km elapsed time to a single km's pace (a wildly
            // wrong, N-times-too-slow-looking split). There's no real per-boundary timestamp
            // available, so elapsed time is divided evenly across however many boundaries were
            // crossed — mirrors the same fix already in place on iOS for this exact class of
            // bug (see iOS_GPS_DISTANCE_FILTER_AND_KM_SPLIT_AUDIT_BRIEF.md).
            val numSplitsCrossed = currentKm - lastKmSplit
            val splitTime = totalSplitTime / numSplitsCrossed
            val splitSpeedKmh = if (splitTime > 0) (1000f / (splitTime / 1000f)) * 3.6f else 0f // m/s → km/h
            val split = KmSplit(km = currentKm, time = splitTime, pace = calculatePace(splitSpeedKmh))
            for (km in (lastKmSplit + 1)..currentKm) {
                val boundarySplit = if (km == currentKm) split else KmSplit(km = km, time = splitTime, pace = calculatePace(splitSpeedKmh))
                kmSplits.add(boundarySplit)
            }
            lastKmSplit = currentKm
            lastSplitTime = now
            lastSplitWatchElapsedSeconds = watchClockNow
            splitPausedMs = 0  // Reset pause accumulator for next split
            Log.d("RunTrackingService", "Reached ${currentKm}km split" + if (numSplitsCrossed > 1) " ($numSplitsCrossed boundaries crossed in one update)" else "")

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
                    // ── DIVERSIFY (distance-only free runs) ──
                    // checkPaceCoaching()'s on-pace substitution only runs once a target TIME is
                    // set (paceCoachingEnabled) — a free run with only a distance goal never
                    // reaches that path, so it would otherwise never get elite coaching (technique/
                    // milestone/positive-reinforcement/elevation — target ETA still correctly
                    // excludes itself when there's no target time). Swap this km split's spoken
                    // coaching for an elite-coaching moment instead once starved, so distance-only
                    // free runs get the same variety guarantee as time-goal runs. The split itself
                    // is still recorded above (kmSplits.add) — only the verbal callout is swapped.
                    // Km splits are non-negotiable: they are ALWAYS announced on the user's
                    // configured interval. The elite-coaching "DIVERSIFY" swap that used to
                    // replace this callout on distance-only runs now lives in
                    // maybeFireMidKmEliteCoaching() (a mid-km slot) so it never costs a split.
                    Log.d("RunTrackingService", "Triggering split coaching at ${currentKm}km (interval: every ${interval}km)")
                    hasCoachingFiredThisTick = true
                    recordCoachingFired()
                    triggerKmSplitCoaching(split)
                } else {
                    // Cooldown active at the exact km crossing — queue and retry on later ticks.
                    // Queued (not overwritten) so a still-unfired earlier split from a previous
                    // km crossing isn't silently dropped by this newer one.
                    if (pendingKmSplitCoachingQueue.size >= MAX_PENDING_KM_SPLITS) {
                        val dropped = pendingKmSplitCoachingQueue.removeAt(0)
                        Log.w("RunTrackingService", "Km split coaching queue full — dropping oldest pending split at ${dropped.split.km}km to queue ${currentKm}km")
                    }
                    Log.d("RunTrackingService", "Km split at ${currentKm}km deferred (cooldown active) — will retry (${pendingKmSplitCoachingQueue.size + 1} now queued)")
                    pendingKmSplitCoachingQueue.add(
                        PendingKmSplit(split, System.currentTimeMillis(), totalDistance)
                    )
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
        // Captured synchronously — not inside the coroutine below — so a Stop tapped in the
        // same tick the target is crossed can't race calculateWasTargetAchieved() into reading
        // this as still-null and falling back to the stale final stop-time duration.
        val elapsedMs = getActiveRunDuration()
        targetReachedAtDurationMs = elapsedMs
        serviceScope.launch {
            try {
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
        // currentWatchClockMs() also carries the watch clock forward on the phone clock if the
        // watch stops sending frames mid-run — see that helper.
        val duration = currentWatchClockMs()
        
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

        // Elite coaching (technique/milestone/pace-trend/positive-reinforcement/ETA/elevation) is
        // eligible on any session that isn't a structured interval session — see checkPaceCoaching()
        // for where routine pace-status updates get periodically swapped for elite content instead
        // of adding extra messages on top.
        val eliteCoachingEligible = !isCoachingPlanActive || !isIntervalTypeSession

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
        if (!hasCoachingFiredThisTick && canFireCoaching() && eliteCoachingEligible) {
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
            // Links this upload to the watch's own companion session for deterministic
            // server-side merge/enrichment (avoids the fuzzy distance-tolerance match).
            garminCompanionSessionId = garminWatchManager?.activeCompanionSessionId
                ?: samsungWatchManager?.activeCompanionSessionId,
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
            val garminReady  = garminWatchManager?.isWatchConnected?.value == true
            val samsungReady = samsungWatchManager?.isWatchConnected?.value == true
            if (session != null && (garminReady || samsungReady) && !wasRunStartedByWatch) {
                val paceSeconds = parsePaceToSeconds(session.currentPace ?: "0:00")
                if (garminReady) {
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
                if (samsungReady) {
                    samsungWatchManager?.sendRunUpdate(
                        paceSecPerKm   = paceSeconds,
                        distanceMetres = session.distance, // already in metres
                        heartRate      = session.heartRate ?: 0,
                        elapsedSeconds = (session.duration / 1000L),
                        cadence        = session.cadence ?: 0,
                        isRunning      = isTracking,
                        isPaused       = !isTracking && pauseStartTime > 0
                    )
                }
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

        // ── Crash-recovery snapshot ────────────────────────────────────────
        // Periodically persist the just-computed run state to local disk so that if the
        // process freezes/dies mid-session (see RunCrashRecoveryStore), at most this
        // interval's worth of data is lost instead of the whole run. Never touches the
        // real upload/pending-sync path — see that class for why.
        if (isTracking && startTime > 0L) {
            val now = System.currentTimeMillis()
            if (now - lastCrashSnapshotSaveMs >= CRASH_SNAPSHOT_INTERVAL_MS) {
                lastCrashSnapshotSaveMs = now
                val snapshotStartTime = startTime
                val snapshot = _currentRunSession.value
                if (snapshot != null) {
                    serviceScope.launch(Dispatchers.IO) {
                        runCrashRecoveryStore.save(snapshotStartTime, snapshot)
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
    
    // Steepest sustained grades, tracked incrementally from the same 100 m window that drives
    // live hill coaching (see trailingWindowGradePercent()). Previously all three of these
    // rescanned every consecutive point pair on every 1 Hz tick and reported the single worst
    // pair — with a 2 m minimum distance, that is pure altitude jitter: a flat-classified
    // 2026-09-20 half marathon (22 m total altitude range, true steepest 100 m ≈ 10%) saved
    // steepestIncline = 50.5% / steepestDecline = 58.9%, which the summary then showed as a
    // 27° "Max Incline".
    private var steepestWindowInclinePct: Float = 0f
    private var steepestWindowDeclinePct: Float = 0f

    /** Steepest uphill grade (%) over any 100 m window so far — see [steepestWindowInclinePct]. */
    private fun calculateMaxGradient(): Float = steepestWindowInclinePct

    /** Steepest uphill grade (positive %) over any 100 m window so far. */
    private fun calculateSteepestIncline(): Float = steepestWindowInclinePct

    /** Steepest downhill grade (positive % — magnitude of descent) over any 100 m window so far. */
    private fun calculateSteepestDecline(): Float = steepestWindowDeclinePct
    
    /** Minimum elevation (lowest point) during the run */
    private fun calculateMinElevation(): Double? {
        return routePoints.mapNotNull { it.altitude }.minOrNull()
    }
    
    /** Maximum elevation (highest point) during the run */
    private fun calculateMaxElevation(): Double? {
        return routePoints.mapNotNull { it.altitude }.maxOrNull()
    }

    /**
     * Grade (%) over the trailing [GRADE_WINDOW_M] of route ending at [latest] (not yet in
     * routePoints), or null until the run has covered that much ground with altitude data.
     * The near end uses the current 5-sample smoothed altitude; the far end averages the three
     * points around the window boundary, so single-sample jitter at either end is damped
     * rather than divided by a short distance. Walks back ~30-60 points per call at 1 Hz.
     */
    private fun trailingWindowGradePercent(latest: LocationPoint): Double? {
        val nearAlt = smoothedAltitude ?: latest.altitude ?: return null
        var dist = 0.0
        var prev = latest
        var i = routePoints.size - 1
        while (i >= 0 && dist < GRADE_WINDOW_M) {
            dist += calculateDistance(routePoints[i], prev)
            prev = routePoints[i]
            i--
        }
        if (dist < GRADE_WINDOW_M) return null
        val farIdx = i + 1
        val farAlts = (maxOf(0, farIdx - 1)..minOf(routePoints.size - 1, farIdx + 1))
            .mapNotNull { routePoints[it].altitude }
        if (farAlts.isEmpty()) return null
        return (nearAlt - farAlts.average()) / dist * 100.0
    }
    
    /**
     * Classify terrain using elevation RANGE per km (max - min of the smoothed, noise-filtered
     * elevation window means — smoothedMinElevation/smoothedMaxElevation — NOT raw per-point
     * altitude).
     *
     * Why NOT avgGradient: on any loop/parkrun course the runner starts and finishes at nearly the
     * same altitude, so the net gradient is ~0% → always "FLAT" even on a 40m rolling course.
     *
     * Why NOT raw calculateMinElevation()/calculateMaxElevation(): phone GPS altitude noise alone
     * (±5-10m, even standing still — see the phoneElevBuffer comment above) can push a genuinely
     * flat route's raw min/max range past the Rolling/Hilly thresholds below with zero real
     * elevation change. Confirmed misclassifying a flat real-world route as "Hilly" (2026-08).
     * smoothedMinElevation/smoothedMaxElevation instead track the min/max of the same 60-sample
     * (phone) / 10-sample (Garmin) windowed means that already drive totalElevationGain/Loss,
     * so noise below the commit threshold can't move them.
     *
     * Elevation range per km reflects undulation regardless of whether the course is a loop or out-and-back:
     *   < 5 m/km  → Flat
     *   5–20 m/km → Rolling   (e.g. parkrun with 40m range over 5km = 8 m/km)
     *   20–50 m/km → Hilly
     *   > 50 m/km → Mountainous
     *
     * Requires at least ROLLING_TERRAIN_WINDOW_KM of real distance before classifying anything
     * beyond Flat — same reasoning as the live rolling-terrain detector's own 1km window below.
     * Below that, per-km normalisation blows up: the old `.coerceAtLeast(0.1)` floor let even a
     * genuinely flat, very short walk (e.g. pacing indoors, ~50-100m total) get divided by a
     * ~100m denominator, turning 1-2m of ordinary smoothed-altitude drift into a 10-20 m/km rate
     * that lands squarely in Rolling — a division-by-tiny-distance artifact, not real terrain.
     * Confirmed 2026-09-05: an indoor test walk reported "Rolling" on a completely flat house.
     */
    private fun determineTerrainType(): TerrainType {
        if (totalDistance < ROLLING_TERRAIN_WINDOW_KM * 1000.0) return TerrainType.FLAT
        val distanceKm = totalDistance / 1000.0
        val minElev = smoothedMinElevation
        val maxElev = smoothedMaxElevation
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
        // Use the duration captured when the target distance was first crossed, not the final
        // stop-time duration — a runner who kept going a bit past their target before stopping
        // shouldn't have that extra time count against whether they hit their target time.
        val durationForTargetCheck = targetReachedAtDurationMs ?: getActiveRunDuration()
        val achievedTime = (targetTime != null && durationForTargetCheck <= targetTime!!)
        
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
        // Defensive idempotency: cancel any previously scheduled runnable before posting a new
        // one. Without this, calling startTimer() twice (e.g. a caller that forgets to guard
        // against reentry) leaves the OLD runnable still posted and self-rescheduling forever —
        // timerRunnable only ever holds a reference to the newest one, so stopTimer() can never
        // reach the orphaned older ones. Each duplicate becomes a permanent extra 1-second tick
        // loop for the rest of the session. resumeTracking() now guards against the specific
        // case that surfaced this (a redundant "resume" command), but this makes the timer
        // itself safe regardless of what calls it.
        timerRunnable?.let { timerHandler.removeCallbacks(it) }
        timerRunnable = object : Runnable {
            override fun run() {
                if (!isTracking) {
                    Log.d("RunTrackingService", "Timer stopped - not tracking")
                    return
                }

                try {
                    // Update the run session every second regardless of location
                    updateRunSession()
                    checkPhoneGpsFallback()
                    checkHeartRateStaleness()
                } catch (e: Exception) {
                    Log.e("RunTrackingService", "Timer update failed", e)
                } finally {
                    // CRITICAL: reschedule unconditionally. The old code only rescheduled
                    // inside the try block, after updateRunSession() — so a single exception
                    // in that call (it's a large function: distance/pace math, coaching
                    // triggers, phase detection, all sensitive to transient bad GPS data)
                    // permanently killed the recurring tick with no recovery. The visible
                    // symptom was the session screen freezing outright, since nothing else
                    // ever restarted the timer. A transient GPS/location glitch (e.g. signal
                    // loss under cover) is exactly the kind of one-off bad input that could
                    // trip this — it must not be allowed to end the session's timer forever.
                    if (isTracking) {
                        timerHandler.postDelayed(this, 1000)
                    }
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

    /**
     * Reactive fallback for a watch-initiated run: phone GPS/sensors are deliberately NOT
     * requested at startTracking() time (see phoneGpsFallbackActive's declaration) since the
     * watch is the authoritative source and running both continuously wastes battery/radio
     * for zero benefit. If watch GPS actually goes stale — the same 15 s staleness window
     * onNewLocation() already uses to decide whether to trust an incoming phone fix — start
     * requesting phone GPS/sensors for real, since at that point they're the only source
     * left, not a redundant standby. Runs off the existing 1 Hz timer tick; once triggered it
     * stays on for the rest of the run rather than flapping with every brief BT hiccup.
     */
    private fun checkPhoneGpsFallback() {
        if (!wasRunStartedByWatch || !isTracking || isSimulating) return
        val staleSinceMs = System.currentTimeMillis() - lastWatchGpsMs
        if (!phoneGpsFallbackActive) {
            if (staleSinceMs >= 15_000L) {
                Log.w("RunTrackingService", "⌚ Watch GPS stale for ${staleSinceMs}ms — starting phone GPS/sensors as fallback")
                phoneGpsFallbackActive = true
                try {
                    requestLocationUpdates()
                    startSensorTracking()
                } catch (e: Exception) {
                    Log.e("RunTrackingService", "Failed to start phone GPS fallback", e)
                    phoneGpsFallbackActive = false
                }
            }
        } else if (staleSinceMs < 5_000L) {
            // Recovery — the watch is sending fresh data again. Previously phoneGpsFallbackActive
            // was one-way: once a single ≥15s BLE gap flipped it on, it never flipped back off for
            // the rest of the run (this function's old first line returned immediately once it was
            // true), so the phone's own GPS and step-counter/step-detector sensors kept running in
            // parallel with the watch for the remainder of the session. Distance had some
            // protection (phone GPS points are only accepted into totalDistance while stale — see
            // lastWatchGpsMs usage there), but the phone's step counter has no such dedup: it feeds
            // cadenceSum/cadenceCount/totalStepsDuringRun unconditionally whenever registered, and
            // a phone bouncing in a pocket reliably over-counts steps. Confirmed against a real
            // ColorOS user's reported step/distance overcounts (2026-09, Nino — AiRunCoach showed
            // 13,166 steps / 9.44km vs Garmin Connect's genuine 8,442 steps / 7.59km for the same
            // walk). Unregistering here — the same two calls pauseTracking()/stopTracking() already
            // use — stops the phone sensors from firing at all once the watch has recovered, so
            // there's nothing left to dedup: no more events, no more contribution to the totals.
            Log.d("RunTrackingService", "⌚ Watch GPS fresh again after fallback — stopping phone GPS/sensors")
            phoneGpsFallbackActive = false
            try {
                fusedLocationClient.removeLocationUpdates(locationCallback)
                sensorManager.unregisterListener(this)
            } catch (e: Exception) {
                Log.w("RunTrackingService", "Failed to stop phone GPS fallback cleanly (non-fatal): ${e.message}")
            }
        }
    }

    private fun pauseTracking() {
        // Guard against a redundant "pause" — the watch retries this command every 5s (up to
        // 6x) if its pauseAck doesn't get back to it, and that ack is itself a fire-and-forget
        // BLE send with no delivery guarantee (same unreliable link the retry exists to work
        // around). Without this guard, each redelivered "pause" re-stamps pauseStartTime to a
        // later timestamp, silently under-counting the true paused duration once resumeTracking()
        // eventually computes (now - pauseStartTime) — and re-fires the "Session paused" audio
        // announcement every time. Mirrors the equivalent guard in resumeTracking() below.
        if (!isTracking) return
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
        announcePauseResumeAudio(paused = true)
        syncLivePausedState(paused = true)
    }

    /** Tells observers the runner paused/resumed. The periodic live sync is gated on
     *  isTracking, so during a pause nothing else is sent — without this flag the observer
     *  screen just froze, indistinguishable from lost signal. */
    private fun syncLivePausedState(paused: Boolean) {
        val liveId = activeLiveSessionId?.takeIf { it.isNotBlank() } ?: return
        serviceScope.launch {
            try {
                apiService.syncLiveSession(
                    live.airuncoach.airuncoach.network.SyncLiveSessionRequest(sessionId = liveId, isPaused = paused)
                )
                Log.d("RunTrackingService", "Live session $liveId paused=$paused synced for observers")
            } catch (e: Exception) {
                Log.w("RunTrackingService", "Live session pause-state sync failed (non-fatal): ${e.message}")
            }
        }
    }

    /** Links the finished live session to the `runs` row it became, so a signed-in observer
     *  can open the full run summary from the finished screen. Called via the uploadComplete
     *  collector in onCreate so every upload path (phone, watch-merged, companion) is covered. */
    private fun linkLiveSessionToResultRun(runId: String) {
        val liveId = endedLiveSessionId?.takeIf { it.isNotBlank() } ?: return
        endedLiveSessionId = null
        serviceScope.launch {
            try {
                apiService.syncLiveSession(
                    live.airuncoach.airuncoach.network.SyncLiveSessionRequest(sessionId = liveId, resultRunId = runId)
                )
                Log.d("RunTrackingService", "Live session $liveId linked to run $runId for observers")
            } catch (e: Exception) {
                Log.w("RunTrackingService", "Live session result-run link failed (non-fatal): ${e.message}")
            }
        }
    }

    private fun resumeTracking() {
        // Guard against a redundant "resume" command. The watch retries "resume" every 5s
        // (up to 6x/30s) whenever its resumeAck doesn't arrive back — and that ack is itself a
        // fire-and-forget BLE send with no delivery guarantee, the same unreliable link the
        // retry mechanism exists to work around. Without this guard, every redelivered
        // "resume" re-ran this whole function, including a fresh startTimer() call.
        // startTimer() is NOT idempotent — it always creates a brand-new Runnable and posts it
        // without cancelling any previous one, and stopTimer() can only ever cancel whichever
        // Runnable the single timerRunnable field currently points to (the most recent one) —
        // so each redundant resumeTracking() call left an orphaned, uncancellable extra 1-second
        // tick loop running for the rest of the session. Three redundant resumes (matching a
        // real report: "Session resumed" announced three times in a row right before a watch
        // crash) means three concurrent tick loops, each calling updateRunSession() — which
        // sends a watch BLE update every tick — every second. That triples the rate of BLE
        // traffic hitting the watch from that moment on, a very plausible trigger for the
        // watch's own Connect IQ crash immediately following. This guard stops the cascade at
        // its source: only the first "resume" while genuinely paused has any effect.
        if (isTracking) return
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
        // Only re-request phone GPS/sensors if they were actually active before the pause
        // (phone-only run, or a watch run where the staleness fallback had already kicked
        // in). For a healthy watch run that never fell back, leave them off — the resumed
        // timer's tick will re-run checkPhoneGpsFallback() and start them reactively if
        // watch GPS genuinely goes stale, same as it would mid-run.
        if (!wasRunStartedByWatch || phoneGpsFallbackActive) {
            requestLocationUpdates()
            startSensorTracking()
        }
        announcePauseResumeAudio(paused = false)
        syncLivePausedState(paused = false)
    }

    /**
     * Get the actual active running duration, excluding all paused time.
     * Use this instead of raw (System.currentTimeMillis() - startTime) everywhere.
     */
    private fun getActiveRunDuration(): Long {
        val totalElapsed = System.currentTimeMillis() - startTime
        return totalElapsed - totalPausedMs
    }

    private fun stopTracking(companionRunId: String? = null) {
        // Guard against a redundant "stop" — same class of bug as resumeTracking()/
        // pauseTracking() above. The watch retries "stop" every 5s (up to 6x/30s) whenever its
        // stopAck doesn't arrive back, and that ack is itself a fire-and-forget BLE send with
        // no delivery guarantee. Without this guard, every redelivered "stop" re-ran this whole
        // function — including launching a BRAND NEW uploadScope coroutine each time. Multiple
        // concurrent coroutines would then race to read the same mutable instance state
        // (weatherAtEnd, coachingHistory, pauseStartTime/totalPausedMs) and each independently
        // POST the run to the backend and call stopSelf() on the service out from under one
        // another — silent data corruption at best, an actual crash at worst. It also re-sent
        // sendSessionEnded() to the watch on every redundant call. Can't reuse isTracking as
        // the guard here (a legitimate stop can arrive while genuinely paused, i.e. while
        // isTracking is already false) — needs its own dedicated flag.
        if (isFinalizingStop) {
            Log.d("RunTrackingService", "stopTracking: already finalizing — ignoring redundant stop")
            return
        }
        isFinalizingStop = true
        isTracking = false
        isSimulating = false
        // Tell observers the run is over BEFORE clearing the ID. Without this the live session
        // stays isActive=true forever and every observer's screen just freezes on the last
        // synced numbers instead of reaching its "Run finished" state (iOS's stopRun already
        // does the equivalent). Final metrics are sent alongside so the observer's last frame
        // is the real finishing distance/time, not the last 5 s-throttled sync.
        val endingLiveSessionId = activeLiveSessionId
        if (!endingLiveSessionId.isNullOrBlank()) {
            // Kept past the ID clear below so the upload-complete collector (onCreate) can link
            // the session to the resulting run once the upload succeeds.
            endedLiveSessionId = endingLiveSessionId
            val finalLastPoint = routePoints.lastOrNull()
            val finalDistKm = totalDistance / 1000.0
            val finalElapsedSecs = (getActiveRunDuration() / 1000L).toInt()
            val finalPace = currentPace
            val finalHr = currentHeartRate.takeIf { it > 0 }
            serviceScope.launch {
                try {
                    apiService.syncLiveSession(
                        live.airuncoach.airuncoach.network.SyncLiveSessionRequest(
                            sessionId = endingLiveSessionId,
                            isActive = false,
                            isPaused = false,
                            currentLat = finalLastPoint?.latitude,
                            currentLng = finalLastPoint?.longitude,
                            distanceCovered = finalDistKm,
                            elapsedTime = finalElapsedSecs,
                            currentPace = finalPace,
                            currentHeartRate = finalHr
                        )
                    )
                    Log.d("RunTrackingService", "Live session $endingLiveSessionId marked ended for observers")
                } catch (e: Exception) {
                    Log.w("RunTrackingService", "Failed to end live session for observers (non-fatal): ${e.message}")
                }
            }
        }
        // Clear live session ID so no more syncs fire after the run ends
        activeLiveSessionId = null
        lastLiveSessionSyncMs = 0L
        lastCrashSnapshotSaveMs = 0L
        // Run is ending normally via the real save/upload path below — the crash-recovery
        // snapshot's only job was to survive a freeze mid-session, so it's no longer needed.
        if (startTime > 0L) {
            val stoppedRunStartTime = startTime
            serviceScope.launch(Dispatchers.IO) {
                runCrashRecoveryStore.clear(stoppedRunStartTime)
            }
        }
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
            if (samsungWatchManager?.isWatchConnected?.value == true) {
                Log.d("RunTrackingService", "⌚ Sending sessionEnded to Wear watch immediately on stop")
                samsungWatchManager?.sendSessionEnded()
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
                        //
                        // For a watch-initiated run, prefer the watch's own authoritative elapsed
                        // clock over the phone wall clock here too — mirroring updateRunSession()'s
                        // duration calc above. startTime is stamped only once the phone actually
                        // processes the "start" BT command, which (per updateRunSession()'s comment)
                        // can lag the watch's real start by 30-90s during a screen-locked start; using
                        // the phone-clock delta here silently re-shortens the SAVED duration by that
                        // same gap even though the live in-session display already accounts for it.
                        //
                        // currentWatchClockMs() rather than watchElapsedSeconds directly: if the
                        // watch died before Stop, the raw watch value is frozen at the moment of
                        // death and would save a duration short by however long the runner kept
                        // going on phone GPS afterwards (see that helper's comment).
                        val finalDurationMs = if (watchInitiatedRun && watchElapsedSeconds > 0) {
                            currentWatchClockMs()
                        } else if (startTime > 0L) {
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

                        // Recompute averagePace/averageSpeed from the FINAL distance+duration rather
                        // than inheriting session.averagePace as-is: that field was last set by
                        // whatever live GPS/watch-data tick happened to run before Stop, using THAT
                        // tick's own (slightly earlier) distance/duration snapshot — not necessarily
                        // the same duration this final save now uses. Left alone, the saved run can
                        // show an averagePace inconsistent with its own saved distance/duration.
                        val finalDurationMsClamped = finalDurationMs.coerceAtLeast(0L)
                        val finalDurationHours = finalDurationMsClamped / 3600000.0
                        val finalAvgSpeedKmh = if (session.distance > 0 && finalDurationHours > 0) {
                            (session.distance / 1000.0 / finalDurationHours).toFloat()
                        } else 0f

                        val finalSession = session.copy(
                            endTime = System.currentTimeMillis(),
                            duration = finalDurationMsClamped,
                            averagePace = if (finalAvgSpeedKmh > 0) calculatePace(finalAvgSpeedKmh) else session.averagePace,
                            averageSpeed = if (finalAvgSpeedKmh > 0) finalAvgSpeedKmh / 3.6f else session.averageSpeed,
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
                        //
                        // BUT that dedup only runs if this device's own distance clears the
                        // server's ">0" validation first. On a genuinely fresh/restarted instance
                        // (startTime==0L, same signal used for the duration fallback above) this
                        // process has no real GPS/watch data of its own to report — session here
                        // is just the companion object's last-known (possibly zeroed) state, not
                        // this run's actual data. Ask the server directly whether the watch's
                        // companion session already finished and has a real run before wasting an
                        // upload attempt that would only 400 on distance and orphan the notes.
                        val effectiveCompanionRunId = companionRunId ?: if (startTime == 0L) {
                            resolveCompanionRunIdFallback()
                        } else null
                        uploadRunToBackend(finalSession, effectiveCompanionRunId)
                    } ?: run {
                        // _currentRunSession.value is null outright — the most blank possible
                        // instance (e.g. the whole app process was killed and restarted fresh by
                        // an explicit stop Intent rather than Android's own null-Intent respawn,
                        // which is the only path that pre-seeds this from a crash-recovery
                        // snapshot). There is no local RunSession to build an upload from at all,
                        // so the ONLY way to avoid silently stranding this stop is the same
                        // server-side companion lookup used above.
                        Log.w("RunTrackingService", "stopTracking: _currentRunSession is null — nothing local to upload, checking for a companion-saved run")
                        val fallbackRunId = companionRunId ?: resolveCompanionRunIdFallback()
                        if (fallbackRunId != null) {
                            attachCoachingNotesToCompanionRun(fallbackRunId, coachingHistory.toList())
                            recordRunIdMapping("", fallbackRunId)
                            _uploadComplete.value = fallbackRunId
                        }
                        // If there's truly nothing recoverable either, there is nothing to upload
                        // and nothing to navigate to — this is a genuine no-op stop.
                    }
                } catch (e: Exception) {
                    // Safety net: any other unexpected failure while finalizing/uploading must
                    // not leave the phone screen stuck forever waiting for a navigation signal
                    // that will never come. Mark the session inactive and surface a local ID so
                    // RunSessionScreen can still navigate — the sync queue / server dedup guard
                    // reconciles the record later if the upload itself didn't complete.
                    Log.e("RunTrackingService", "stopTracking: unexpected error finalizing/uploading run — navigating with local ID as fallback", e)
                    _currentRunSession.value = _currentRunSession.value?.copy(isActive = false)
                    val companionRunId = companionRunId ?: if (startTime == 0L) resolveCompanionRunIdFallback() else null
                    if (companionRunId != null) {
                        // The watch's companion session already created the authoritative run
                        // server-side — attach whatever coaching notes we accumulated locally to
                        // THAT run and navigate there instead of a local ID nothing points to.
                        attachCoachingNotesToCompanionRun(companionRunId, _currentRunSession.value?.aiCoachingNotes ?: emptyList())
                        recordRunIdMapping(_currentRunSession.value?.id ?: "", companionRunId)
                        _uploadComplete.value = companionRunId
                    } else {
                        _uploadComplete.value = _currentRunSession.value?.id
                    }
                } finally {
                    // Only stop the service after upload completes or fails
                    releaseWakeLock()
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
        }
    }
    
    private suspend fun uploadRunToBackend(runSession: RunSession, companionRunId: String? = null) {
        // Compute true average HR from accumulated samples (not just the last reading)
        val computedAvgHR = if (heartRateSampleCount > 0)
            (heartRateSum / heartRateSampleCount).toInt()
        else if (runSession.heartRate > 0) runSession.heartRate  // Fallback to last reading
        else null

        // Detect if run was completed on a companion watch (Garmin or Samsung/Wear OS)
        // NOTE: Snapshot the state atomically to avoid TOCTOU race condition where watch disconnects between checks
        val isGarminWatchRun  = garminWatchManager?.isWatchConnected?.value == true
        val isSamsungWatchRun = samsungWatchManager?.isWatchConnected?.value == true
        val isWatchRun = isGarminWatchRun || isSamsungWatchRun
        val deviceName = if (isWatchRun) {
            try {
                if (isGarminWatchRun) garminWatchManager?.getConnectedDeviceName()
                else samsungWatchManager?.getConnectedDeviceName()
            } catch (e: Exception) {
                Log.w("RunTrackingService", "Failed to get connected device name (watch may have disconnected): ${e.message}")
                null
            }
        } else null

        val uploadRequest = UploadRunRequest(
            routeId = null, // TODO: Add if user selected a saved route
            garminCompanionSessionId = runSession.garminCompanionSessionId,
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
            avgGpsAccuracy           = when {
                watchGpsAccuracyCount > 0 -> watchGpsAccuracySum / watchGpsAccuracyCount
                phoneGpsAccuracyCount > 0 -> phoneGpsAccuracySum / phoneGpsAccuracyCount
                else -> null
            },
            worstGpsAccuracy         = (if (watchGpsAccuracyCount > 0) watchGpsAccuracyWorst else phoneGpsAccuracyWorst).takeIf { it > 0f },
            // Power saver mode telemetry — if phone's power saver was active during this run
            powerSaverModeDetected   = powerSaverModeDetected,
        )

        // Run is final at this point regardless of whether the upload below succeeds now or
        // later via SyncWorker — log once here so offline runs count and retries don't double up.
        run {
            val km = runSession.distance / 1000.0
            AppAnalytics.logEvent(
                this, AppAnalytics.Event.RUN_COMPLETED,
                AppAnalytics.Param.SESSION_TYPE to runSession.sessionType,
                AppAnalytics.Param.DISTANCE_KM to Math.round(km * 100.0) / 100.0,
                AppAnalytics.Param.DISTANCE_BUCKET to AppAnalytics.distanceBucket(km),
                AppAnalytics.Param.DURATION_MIN to (runSession.duration / 60_000L),
            )
        }

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
                        // Client error - no point retrying. Most commonly a 400 "distance must be
                        // > 0" — this phone had no real GPS/watch distance of its own for this run
                        // (e.g. the Garmin watch tracked it standalone over its own HTTP relay).
                        // When the watch's companion session/end already created the authoritative
                        // run server-side, fall back to attaching this device's locally-accumulated
                        // coaching notes to THAT run instead of orphaning a local ID the server has
                        // never heard of (the phone would otherwise get stuck trying to load a run
                        // that was never created — see stopTracking()'s companionRunId handling).
                        Log.e("RunTrackingService", "HTTP ${e.code()} client error uploading run: ${e.message()}")
                        if (companionRunId != null) {
                            Log.d("RunTrackingService", "⌚ Falling back to companion-created run $companionRunId")
                            attachCoachingNotesToCompanionRun(companionRunId, runSession.aiCoachingNotes)
                            recordRunIdMapping(runSession.id, companionRunId)
                            _uploadComplete.value = companionRunId
                        } else {
                            _uploadComplete.value = runSession.id
                        }
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

        // All retries exhausted (server errors / network failures — not client 4xx, handled above)
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

        // Best-effort: still attach coaching notes to the companion-created run now rather than
        // waiting on the queued retry (which uploads a brand new run and relies on server-side
        // dedup to merge them back in) — this device already knows the definitive run ID.
        if (companionRunId != null) {
            attachCoachingNotesToCompanionRun(companionRunId, runSession.aiCoachingNotes)
            recordRunIdMapping(runSession.id, companionRunId)
            _uploadComplete.value = companionRunId
        } else {
            _uploadComplete.value = runSession.id
        }
    }

    /**
     * Asks the server (GET /api/garmin-companion/session/recoverable — the same lookup
     * [handleNullIntentRespawn] uses) whether the watch's companion session already completed
     * and saved a real run, for use as a fallback save target on a fresh/restarted service
     * instance that has no legitimate distance data of its own (startTime==0L).
     *
     * Exists because that null-Intent recovery path only runs when the OS itself auto-respawns
     * this service (START_STICKY) — it never runs when something else (a manual Stop tap in the
     * UI, the FCM watchSessionEnded fallback, or GarminWatchManager's own BT-drop recovery) sends
     * an explicit start*Service() Intent to a service the OS already killed: that just spins up a
     * brand-new instance and hands it straight to onStartCommand's `when (intent?.action)` below,
     * bypassing the recoverable-session check entirely. This call closes that gap generically for
     * every ACTION_STOP_TRACKING caller, not just the FCM one which already carries a runId.
     */
    private suspend fun resolveCompanionRunIdFallback(): String? {
        return try {
            val recoverable = apiService.getRecoverableGarminCompanionSession()
            val session = recoverable.session
            if (session?.status == "completed" && session.runId != null) {
                Log.d("RunTrackingService", "⌚ Resolved fresh-instance stop to already-saved companion run ${session.runId}")
                session.runId
            } else null
        } catch (e: Exception) {
            Log.w("RunTrackingService", "resolveCompanionRunIdFallback lookup failed (non-fatal): ${e.message}")
            null
        }
    }

    /**
     * Attaches this device's locally-accumulated coaching notes to a run the server already
     * created (the Garmin companion session/end path). Used whenever this device's own
     * POST /api/runs upload can't proceed (e.g. no real distance of its own to report) but we
     * know — via the FCM watchSessionEnded runId — which run to patch instead. Best-effort:
     * failure here must never block navigation to the run summary.
     */
    private suspend fun attachCoachingNotesToCompanionRun(runId: String, notes: List<AiCoachingNote>) {
        // Besides the notes, this is the phone's only chance to contribute what the watch's own
        // record can never have: weather captured at the first fix, the session target, the
        // phone's step count. Server fills these in only where the run is missing them.
        if (notes.isEmpty()) return
        try {
            val tdKm = targetDistance?.let { it / 1000.0 }
            apiService.patchCoachingNotes(runId, PatchCoachingNotesRequest(
                aiCoachingNotes = notes,
                weatherData = weatherAtStart,
                targetDistance = tdKm,
                targetTime = targetTime,
                wasTargetAchieved = if (tdKm != null) totalDistance >= (tdKm * 1000.0) else null,
                totalSteps = totalStepsDuringRun.takeIf { it > 0 },
                aiCoachEnabled = aiCoachEnabledForSession,
            ))
            Log.d("RunTrackingService", "✅ Patched ${notes.size} coaching note(s) + phone context onto companion run $runId")
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Failed to patch coaching notes onto companion run $runId: ${e.message}")
        }
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
     * On ColorOS (Oppo/OnePlus/Realme) devices, a confirmed OS kill mid-run is direct proof the
     * device's proprietary Autostart/Battery-management allowlist (a second background-killer
     * layer on top of stock Android — see [live.airuncoach.airuncoach.utils.OemBatteryHelper])
     * either isn't set up or didn't stick. The dashboard's remediation nudge
     * (DashboardViewModel.checkOemBatteryPrompt) was previously fire-once-ever: dismissed (or
     * simply missed) a single time on the very first install and it would never resurface, even
     * after the exact failure it exists to prevent happened again — confirmed via Crashlytics on
     * Nino's Oppo CPH2695, same "no event down from INITIALIZED" navigation crash recurring on a
     * build that had already shipped an earlier, narrower fix for it. Setting this flag here (in
     * the same "user_prefs" file DashboardViewModel reads) re-arms that nudge with harder
     * evidence-based copy on next dashboard load, regardless of whether it was dismissed before.
     */
    private fun flagOemKillDetected() {
        if (!live.airuncoach.airuncoach.utils.OemBatteryHelper.isColorOSDevice()) return
        try {
            getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("oem_kill_detected", true)
                .apply()
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Failed to flag OEM kill detection: ${e.message}")
        }
    }

    /**
     * Entry point for onStartCommand's null-Intent handling (see that comment for the full
     * "OS killed and respawned this service" background). Previously this always finalized
     * whatever partial data survived on the phone as a *finished* run — correct for a phone-only
     * run, but wrong whenever a Garmin watch was driving the session: the watch tracks
     * independently via the Garmin Connect relay and was very likely never actually interrupted,
     * so ending the phone's run truncated a walk that, from the watch's perspective, just kept
     * going — producing a confusing "Session interrupted" notification plus a second, fragmented
     * run record once the watch's own full-length upload landed later.
     *
     * Now asks the server first (GET /api/garmin-companion/session/recoverable, status-agnostic
     * unlike the active-only /session/active used by the normal start flow) whether there's a
     * companion session to recover into:
     *   - active/paused  → [reattachToWatchSession]: reconnect, don't finalize anything.
     *   - completed       → [handOffToAlreadySavedRun]: the watch already saved it, nothing to do.
     *   - none/lookup failed → [finalizeOrphanedOrCrashedSession]: the original truncate-and-save
     *     behavior, now only used when there's genuinely no watch session to recover from (a
     *     phone-only run, or the watch died too).
     */
    private suspend fun handleNullIntentRespawn() {
        // A kill happened regardless of which branch below we end up taking — record it once
        // here rather than per-branch.
        flagOemKillDetected()

        val recoverable = try {
            apiService.getRecoverableGarminCompanionSession()
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Recoverable companion-session lookup failed (non-fatal): ${e.message}")
            null
        }
        val session = recoverable?.session

        when {
            session != null && (session.status == "active" || session.status == "paused") -> {
                reattachToWatchSession(session, recoverable.latest)
            }
            session != null && session.status == "completed" && session.runId != null -> {
                handOffToAlreadySavedRun(session.runId)
            }
            else -> {
                finalizeOrphanedOrCrashedSession()
            }
        }
    }

    /**
     * Reconnects to a Garmin-companion session that's still active or paused after an OS kill and
     * respawn — the watch was never actually interrupted (it streams independently via the Garmin
     * Connect relay). Restores just enough phone-side state to resume relaying/displaying and
     * keep listening for further watch commands normally, WITHOUT finalizing or uploading
     * anything: the watch's own eventual session/end call (or a normal phone-side stop once
     * reattached) remains the single source of truth for when the run actually finishes. This is
     * what turns a mid-walk kill into an invisible reconnect instead of a "Session interrupted"
     * notification plus a fragmented extra run in history.
     *
     * Deliberately does NOT request phone GPS/sensors (mirrors wasRunStartedByWatch's normal
     * behavior elsewhere) — the watch is authoritative and checkPhoneGpsFallback()'s per-second
     * timer tick will start them reactively only if watch data actually goes stale, same as any
     * other watch-driven run.
     */
    private suspend fun reattachToWatchSession(
        session: GarminCompanionSession,
        latest: GarminRealtimeDataPoint?
    ) {
        val isWalk = session.activityType == "walk"
        Log.d("RunTrackingService", "⌚ Reattaching to live companion session ${session.sessionId} (status=${session.status})")

        var startedForeground = true
        withContext(Dispatchers.Main) {
            try {
                val label = if (isWalk) "Reconnecting to your walk…" else "Reconnecting to your run…"
                startForeground(NOTIFICATION_ID, createNotification(label, "Syncing with your Garmin watch"))
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to start foreground service during reattach", e)
                com.google.firebase.crashlytics.FirebaseCrashlytics.getInstance().recordException(e)
                startedForeground = false
            }
        }
        if (!startedForeground) {
            // Same failure mode postTrackingStartFailedNotification exists for elsewhere — no
            // foreground service means no legal way to keep tracking, so fall back to finalizing
            // whatever the phone has rather than silently doing nothing.
            postTrackingStartFailedNotification()
            stopSelf()
            return
        }

        // Restore on both managers — harmless no-op on whichever brand isn't actually connected
        // (only one of Garmin/Samsung is ever paired at a time), and avoids needing the recovered
        // session's device model to disambiguate which manager actually owns this watch.
        garminWatchManager?.restoreActiveCompanionSession(session.sessionId)
        samsungWatchManager?.restoreActiveCompanionSession(session.sessionId)
        currentActivityType = if (isWalk) "walk" else "run"
        activityTypeSetFromSessionIntent = true
        wasRunStartedByWatch = true
        lastWatchGpsMs = System.currentTimeMillis()
        _isServiceRunning.value = true

        val isPaused = latest?.isPaused ?: (session.status == "paused")
        isTracking = !isPaused
        startTime = parseIsoToMillis(session.startedAt) ?: System.currentTimeMillis()
        val elapsedMs = (latest?.elapsedTime?.toLong() ?: 0L) * 1000L
        // The watch's own elapsedTime already excludes its paused time going forward — we don't
        // know the exact historical totalPausedMs, so leave it at 0 rather than guess; the next
        // real GPS/sensor tick rebuilds _currentRunSession from live accumulators anyway (see
        // the RunSession(...) construction further down in this file), making this placeholder
        // self-correcting within a few seconds.
        pauseStartTime = if (isPaused) System.currentTimeMillis() else 0L
        totalPausedMs = 0L
        totalDistance = latest?.cumulativeDistance?.toDouble() ?: 0.0
        currentHeartRate = latest?.heartRate ?: 0
        currentCadence = latest?.cadence ?: 0

        _currentRunSession.value = RunSession(
            id = UUID.randomUUID().toString(),
            startTime = startTime,
            endTime = null,
            duration = elapsedMs,
            distance = totalDistance,
            averageSpeed = 0f,
            maxSpeed = 0f,
            averagePace = null,
            calories = 0,
            cadence = currentCadence,
            heartRate = currentHeartRate,
            routePoints = emptyList(),
            kmSplits = emptyList(),
            weatherAtStart = null,
            weatherAtEnd = null,
            totalElevationGain = 0.0,
            totalElevationLoss = 0.0,
            averageGradient = 0f,
            maxGradient = 0f,
            routeHash = null,
            routeName = null,
            sessionType = currentActivityType,
            isActive = true,
            garminCompanionSessionId = session.sessionId,
            hasGarminData = true,
        )

        if (!isPaused) startTimer()
        updateNotification()

        Log.d("RunTrackingService", "⌚ Reattached — isPaused=$isPaused, distance=${totalDistance}m, elapsed=${elapsedMs}ms")
    }

    /**
     * The Garmin watch already finished and saved this run entirely on its own (session/end
     * already fired, runId already exists) — there is nothing left to finalize or upload.
     *
     * Called from two different situations, both ending up here with real notes possibly still
     * in memory: (1) [handleNullIntentRespawn], where this is a genuinely fresh OS-restarted
     * instance with an empty coachingHistory (patch below is a safe no-op there), and (2) the
     * ACTION_WATCH_RUN_FINISHED "not tracking" branch, which is reached while this SAME
     * long-lived instance is merely paused (isTracking==false by design during a pause) — real
     * coaching notes accumulated during the live run are still sitting in coachingHistory and
     * would otherwise be silently discarded. Patch them onto the authoritative run either way,
     * and set _uploadComplete so a still-open RunSessionScreen (staring at a "paused" run stuck
     * waiting for the dropped watch "stop") navigates to the summary immediately instead of only
     * a system notification the user has to notice and tap.
     */
    private fun handOffToAlreadySavedRun(runId: String) {
        Log.d("RunTrackingService", "⌚ Companion session already completed — run $runId already saved, nothing to upload")
        serviceScope.launch {
            attachCoachingNotesToCompanionRun(runId, coachingHistory.toList())
            recordRunIdMapping(_currentRunSession.value?.id ?: "", runId)
            _currentRunSession.value = _currentRunSession.value?.copy(isActive = false)
            _uploadComplete.value = runId
            postRunAlreadySavedNotification(runId)
            stopSelf()
        }
    }

    /** Parses a server ISO-8601 timestamp (e.g. "2026-08-29T03:14:19.000Z") to epoch millis. */
    private fun parseIsoToMillis(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        return try {
            java.time.Instant.parse(iso).toEpochMilli()
        } catch (e: Exception) {
            null
        }
    }

    /**
     * The original OS-kill recovery behavior: finalize and upload whatever partial data survived
     * on the phone, as a finished run. Now only reached from [handleNullIntentRespawn] when there
     * is genuinely no Garmin companion session to recover into (a phone-only run, or the watch
     * died too) — see that function's doc comment for the full picture.
     */
    private fun finalizeOrphanedOrCrashedSession() {
        val orphanedSession = _currentRunSession.value
        if (orphanedSession?.isActive == true && !isTracking) {
            Log.e("RunTrackingService", "⚠️ onStartCommand: null Intent with an active orphaned session — " +
                "service was killed and restarted by the OS mid-run. Finalizing via stopTracking() instead of continuing as a zombie.")
            // Not a JVM crash (nothing threw), but this null-Intent respawn only ever
            // happens when the OS killed and restarted the service mid-run — recording it
            // as a non-fatal is what lets us see, per device/OEM (see the custom keys set
            // in RunApplication.initCrashlytics()), how often this actually happens instead
            // of only hearing about it when a user notices and emails us.
            com.google.firebase.crashlytics.FirebaseCrashlytics.getInstance().recordException(
                RuntimeException("RunTrackingService soft-killed and respawned by OS mid-run (session survived in memory)")
            )
            postSessionInterruptedNotification(orphanedSession.sessionType)
            stopTracking()
        } else {
            // No in-memory session survived either — this is a HARD kill: the OS destroyed
            // the whole process (onDestroy() never ran, so the _currentRunSession companion
            // object reset along with everything else), not just the soft respawn the branch
            // above handles. The on-disk crash-recovery snapshot (RunCrashRecoveryStore,
            // written every ~20s while tracking) is the only remaining record of that run —
            // without this fallback it's silently lost with nothing shown to the user, which
            // is exactly what was reported (session "instantly disappeared", nothing saved).
            val recovered = runCrashRecoveryStore.loadMostRecent()
            if (recovered != null && recovered.isActive) {
                Log.e("RunTrackingService", "⚠️ onStartCommand: null Intent, no in-memory session, but a crash-recovery " +
                    "snapshot exists (startTime=${recovered.startTime}) — process was hard-killed. Recovering via stopTracking().")
                com.google.firebase.crashlytics.FirebaseCrashlytics.getInstance().recordException(
                    RuntimeException("RunTrackingService HARD-killed by OS mid-run (in-memory session lost, recovered from disk snapshot)")
                )
                _currentRunSession.value = recovered
                // stopTracking() below clears the snapshot keyed on the *instance* startTime
                // (left at 0 here, see comment below) rather than recovered.startTime, so it
                // would never actually delete this file — clear it explicitly now instead.
                serviceScope.launch(Dispatchers.IO) {
                    runCrashRecoveryStore.clear(recovered.startTime)
                }
                // Deliberately leave `startTime` at 0 (this fresh instance's default) rather
                // than seeding it from the snapshot: stopTracking()'s startTime==0 fallback
                // already uses session.duration directly (the last known-good duration as of
                // the snapshot, at most ~20s stale). Setting startTime here would instead
                // make it compute (now - startTime), which counts the entire unknown dead
                // time between the kill and this restart as active run duration — wrong in
                // the opposite direction.
                postSessionInterruptedNotification(recovered.sessionType)
                stopTracking()
            } else {
                Log.d("RunTrackingService", "onStartCommand: null Intent, no active session to recover — stopping self")
                stopSelf()
            }
        }
    }

    /**
     * Posts a notification telling the user their session was interrupted by the OS killing
     * this service mid-run (e.g. aggressive battery management while the screen was locked) and
     * has been saved with whatever data survived up to that point. See onStartCommand's
     * null-Intent handling for why this fires.
     */
    @android.annotation.SuppressLint("MissingPermission")
    private fun postSessionInterruptedNotification(sessionType: String = currentActivityType) {
        try {
            val channelId = "session_interrupted"
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

            if (nm.getNotificationChannel(channelId) == null) {
                nm.createNotificationChannel(
                    android.app.NotificationChannel(
                        channelId,
                        "Session Interrupted",
                        android.app.NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "Alerts when a run/walk session was interrupted by the system"
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
                "session_interrupted".hashCode(),
                intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            val activityWord = if (sessionType == "walk") "walk" else "run"
            val notification = androidx.core.app.NotificationCompat.Builder(this, channelId)
                .setContentTitle("Session interrupted")
                .setContentText("Your phone stopped updating during this $activityWord — we've saved what was recorded. Your watch kept tracking normally.")
                .setSmallIcon(R.drawable.notification_icon)
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()

            nm.notify(NOTIF_ID_SESSION_INTERRUPTED, notification)
            Log.d("RunTrackingService", "⚠️ Session interrupted notification posted")
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Failed to post session interrupted notification: ${e.message}")
        }
    }

    /**
     * Posts a notification for [handOffToAlreadySavedRun] — the OS killed the phone app, but the
     * Garmin watch finished the walk/run entirely on its own and it's already saved server-side.
     * Taps straight into that run's summary via the same deeplink_run_id extra MainActivity
     * already handles for watch-offline-sync notifications.
     */
    @android.annotation.SuppressLint("MissingPermission")
    private fun postRunAlreadySavedNotification(runId: String) {
        try {
            val channelId = "session_interrupted" // Reuse the same high-importance channel/UX
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

            if (nm.getNotificationChannel(channelId) == null) {
                nm.createNotificationChannel(
                    android.app.NotificationChannel(
                        channelId,
                        "Session Interrupted",
                        android.app.NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "Alerts when a run/walk session was interrupted by the system"
                        enableVibration(true)
                    }
                )
            }

            val intent = android.content.Intent(this, live.airuncoach.airuncoach.MainActivity::class.java).apply {
                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("deeplink_run_id", runId)
            }
            val pendingIntent = android.app.PendingIntent.getActivity(
                this,
                "run_already_saved".hashCode(),
                intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            val notification = androidx.core.app.NotificationCompat.Builder(this, channelId)
                .setContentTitle("Your walk was saved")
                .setContentText("Your phone lost connection briefly, but your Garmin watch kept tracking and your run has already been saved. Tap to view it.")
                .setSmallIcon(R.drawable.notification_icon)
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()

            nm.notify(NOTIF_ID_RUN_ALREADY_SAVED, notification)
            Log.d("RunTrackingService", "✅ Run-already-saved notification posted for $runId")
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Failed to post run-already-saved notification: ${e.message}")
        }
    }

    /**
     * Posts a notification telling the user tracking never started on the phone at all —
     * startTracking()'s startForeground() call threw (see that catch block for the usual
     * cause: Android 14+ blocking a background-started location foreground service).
     *
     * When this fires for a watch-initiated run (wasRunStartedByWatch), the watch is still
     * recording the session standalone on its own GPS/HR — it doesn't need to be told to stop,
     * it already has its own offline-buffer/upload-batch fallback for exactly this "phone
     * never joined" case. This notification exists purely so the failure isn't silent to the
     * user, who otherwise has no way to know live coaching/audio won't be available this run.
     */
    @android.annotation.SuppressLint("MissingPermission")
    private fun postTrackingStartFailedNotification() {
        try {
            val channelId = "tracking_start_failed"
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

            if (nm.getNotificationChannel(channelId) == null) {
                nm.createNotificationChannel(
                    android.app.NotificationChannel(
                        channelId,
                        "Tracking Failed to Start",
                        android.app.NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "Alerts when the phone could not start tracking a run/walk session"
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
                "tracking_start_failed".hashCode(),
                intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            val activityWord = if (currentActivityType == "walk") "walk" else "run"
            val contentText = if (wasRunStartedByWatch) {
                "Your phone couldn't join this $activityWord — your watch is still recording it and will sync when you finish. No live coaching this session."
            } else {
                "Your phone couldn't start tracking this $activityWord. Open the app and try starting again."
            }
            val notification = androidx.core.app.NotificationCompat.Builder(this, channelId)
                .setContentTitle("Tracking didn't start")
                .setContentText(contentText)
                .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(contentText))
                .setSmallIcon(R.drawable.notification_icon)
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()

            nm.notify(NOTIF_ID_START_FAILED, notification)
            Log.d("RunTrackingService", "⚠️ Tracking-start-failed notification posted")
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Failed to post tracking-start-failed notification: ${e.message}")
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
                            // Only relevant if phone GPS is actually in use — for a healthy watch-
                            // initiated run (phoneGpsFallbackActive == false) phone GPS was never
                            // requested in the first place, so there's nothing to re-evaluate here.
                            if (isTracking && (!wasRunStartedByWatch || phoneGpsFallbackActive)) {
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
        try {
            if (samsungWatchManager?.isWatchConnected?.value == true) {
                Log.d("RunTrackingService", "Notifying Wear watch of session end...")
                samsungWatchManager?.sendSessionEnded()
            }
            samsungWatchManager?.shutdown()
            Log.d("RunTrackingService", "SamsungWatchManager shutdown complete")
        } catch (e: Exception) {
            Log.w("RunTrackingService", "SamsungWatchManager shutdown error (non-fatal): ${e.message}")
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

        // Navigation only checks time gap (turns are position-critical, not distance-dependent).
        // Deliberately ahead of the busy check below: navigation is allowed to interrupt
        // coaching that is mid-sentence — CoachingAudioQueue.enqueueNavigation() stops the
        // current item and jumps the queue — so "something is speaking" must not block a turn.
        if (isNavigation) {
            return timeSinceLastCoaching >= minGapMs
        }

        // ── Don't start generating the next cue while the last one is still being heard ──
        // lastGlobalCoachingTime is stamped by recordCoachingFired() immediately BEFORE the
        // coaching coroutine launches — so it marks when we started ASKING for a cue, not when
        // the runner finished hearing it. Between those two points sits an OpenAI generation, a
        // Polly TTS fetch and the playback itself, which together run far longer than this
        // 15 s gap. The gate therefore reopened while the previous cue was still talking, cues
        // stacked nose-to-tail, and every announcement drifted further behind the runner's real
        // position: a real 5 km session (2026-09-14) produced 24 cues in 25:44 and was
        // announcing km 3 while the runner was at 5 km, never reaching km 5 at all.
        //
        // Consulting the queue makes the 15 s mean what it was always meant to mean — a gap
        // between the runner HEARING things, not between us requesting them. A stuck queue
        // can't wedge this permanently: CoachingAudioQueue has its own watchdog that force-
        // completes a hung item, and checkStuckState() runs on every enqueue.
        if (live.airuncoach.airuncoach.utils.CoachingAudioQueue.isBusy()) {
            return false
        }

        // Structured interval phase transitions bypass the 150m distance gate.
        // Interval phases can be as short as 100-150m (e.g. 1 min jog at 8 km/h = 133m),
        // meaning the standard distance gate would BLOCK every phase transition after the first.
        // Phase transitions are time-critical for the session structure, so only the time gap matters.
        if (bypassDistanceGate) {
            return timeSinceLastCoaching >= minGapMs
        }

        // ── Opening lockout ──────────────────────────────────────────────────────────
        // Nothing discretionary (pace, HR, cadence, phase-change, struggle, elite/technique)
        // before the first 500 m check-in has been heard — or, when the user has that check-in
        // switched off, before 500 m. The run-start line and the pre-run brief are the only
        // things spoken in the opening half kilometre, for walks and runs alike. Plan-driven
        // phase transitions take the bypassDistanceGate path above and are unaffected.
        // (check500mMilestones() itself doesn't come through here, so this can't deadlock it.)
        if (totalDistance < 500.0) return false
        if (coachingFeaturePrefs.halfKmCheckInEnabled && last500mMilestone == 0) return false
        // Split-proximity lockout: within the last 150 m before a km-split boundary, leave the
        // slot for the split so it is never queued behind a discretionary cue and announced
        // late (iOS heard "you're at 1 kilometre" at 1.10 km on 17 Sep for exactly this reason).
        if (coachingFeaturePrefs.kmSplitsEnabled && !isCoachingPlanActive) {
            val intervalM = coachingFeaturePrefs.kmSplitIntervalKm.coerceAtLeast(1) * 1000.0
            val toNextSplit = intervalM - (totalDistance % intervalM)
            if (toNextSplit <= 150.0) return false
        }

        // Non-navigation coaching: both time AND distance must have passed
        return timeSinceLastCoaching >= minGapMs && distSinceLastCoaching >= GLOBAL_COACHING_MIN_GAP_M
    }

    /**
     * Minimum distance between two elite/technique cues. That channel is paced by a 45 s
     * cooldown tuned for running; at a 12 min/km walk that is ~60 m, which (with the old
     * 500 m walk splits) is how a walker ended up with a message every ~200 m. Same floor as
     * iOS's discretionaryCueMinGapM: 1 km walking, 500 m running.
     */
    private val eliteCueMinGapM: Double
        get() = if (currentActivityType == "walk") 1000.0 else 500.0
    private var lastEliteCoachingDistance: Double = -9999.0

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
        if (targetDistance != null) return
        // Previously the first inference was permanent. With 1000 m in the candidate list that
        // meant every target-less run inferred "1 km" at 850 m, then — once past 1 km —
        // remaining went negative forever: no final cues, no final-stretch quiet zone, and
        // HR/cadence/technique kept firing to the line (2026-09-11 5 km park run). If the runner
        // has run past the inferred distance it was wrong: drop it (and the once-only final
        // flags with it) so the next candidate can be picked up.
        inferredTargetDistance?.let { current ->
            if (totalDistance <= current + 50.0) return
            Log.d("RunTrackingService", "⚡ Runner passed inferred target ${current.toInt()}m — releasing inference")
            inferredTargetDistance = null
            hasFinal500mFired = false
            hasFinal250mFired = false
            hasFinal100mFired = false
        }
        val inferred = COMMON_RACE_DISTANCES_M.firstOrNull { commonDist ->
            totalDistance >= commonDist * 0.85 && totalDistance <= commonDist
        } ?: return
        inferredTargetDistance = inferred
        Log.d("RunTrackingService", "⚡ Inferred target distance: ${inferred.toInt()}m (runner at ${totalDistance.toInt()}m) — final-stretch coaching now active")
        // Retroactively turn on the pace-vs-target-time engine for a runner who set a target
        // TIME but no explicit target distance — initPaceCoaching()'s only other call site
        // (startTracking()) ran before any distance existed, so it had no way to see this.
        if (targetTime != null && !paceCoachingEnabled) {
            initPaceCoaching()
        }
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
                    // Calculate target pace from target time and distance if available.
                    // Falls back to inferredTargetDistance (set once the runner passes 85% of
                    // a common race distance, see maybeInferTargetDistance()) so a user who set
                    // a target TIME but no explicit target DISTANCE (e.g. "finish in 23 minutes"
                    // for an obviously-5K parkrun) still gets a real target pace once the system
                    // has enough data to infer the distance, instead of every target-time-aware
                    // coaching path staying permanently silent for the whole run.
                    // targetTime is in milliseconds, targetDistance is in metres
                    val effectiveTargetDistance = targetDistance ?: inferredTargetDistance
                    val targetPaceStr = if (targetTime != null && effectiveTargetDistance != null && effectiveTargetDistance > 0) {
                        val totalSeconds = targetTime!! / 1000.0
                        val targetDistKm = effectiveTargetDistance / 1000.0
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
                        userId = currentUser?.id,
                        garminCompanionSessionId = garminWatchManager?.activeCompanionSessionId
                    )
                    val response = apiService.getPhaseCoaching(update)
                    // Server returns skipped=true with no message when the shared cooldown rejects
                    // this call — don't log/play "500m: null" in that case.
                    if (!response.skipped && response.message.isNotBlank()) {
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
                    garminCompanionSessionId = garminWatchManager?.activeCompanionSessionId,
                )

                val response = withTimeoutOrNull(3_500L) {
                    apiService.getSessionTriggerLive(request)
                }

                // Server returns skipped=true with no message when the shared cooldown rejects
                // this call — treat that the same as a timeout and use the local fallback message
                // rather than firing a null/blank cue for a trigger the runner is expecting.
                if (response != null && !response.skipped && response.message.isNotBlank()) {
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
                    Log.w("RunTrackingService", "⚠️ Live trigger timed out or skipped — using fallback for [${trigger.type}]")
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
     * Fixed cache dir for voice-only (not per-workout) system phrases like the pause/resume
     * confirmation — these have no `planWorkoutId` to key on (they fire on free/uncoached runs
     * too), only the user's current voice.
     */
    private fun systemAudioCacheDir(): File =
        File(applicationContext.cacheDir, "coaching_audio/system").apply { mkdirs() }

    private fun systemAudioCacheKey(text: String): String =
        textMd5("$text|${currentUser?.coachAccent}|${currentUser?.coachGender}")

    private fun getCachedSystemAudio(text: String): String? {
        return try {
            val file = File(systemAudioCacheDir(), "${systemAudioCacheKey(text)}.mp3")
            if (file.exists()) Base64.encodeToString(file.readBytes(), Base64.DEFAULT) else null
        } catch (e: Exception) {
            Log.w("RunTrackingService", "Could not read cached system audio: ${e.message}")
            null
        }
    }

    /**
     * Pre-fetches and caches Polly audio for the pause/resume confirmation phrases, keyed by
     * the user's current voice. Called once at the top of [startTracking] — i.e. right as a
     * session begins, well before any pause is possible — specifically so that by the time
     * announcePauseResumeAudio() ever fires, it can read a local file instead of making a live
     * network call from inside the exact background-triggered window (a watch-relayed BLE pause
     * command arriving while the phone is screen-locked/backgrounded) that a live Polly call
     * there was previously adding to. See flagOemKillDetected() for why that window matters —
     * that live call, introduced alongside this feature, is the most likely trigger for the
     * ColorOS kill Nino hit pausing from his Garmin watch (2026-08-29, v2.0.22): it's a brand
     * new background network round-trip landing exactly on a BLE-woken callback, which is the
     * kind of background activity burst ColorOS's kill heuristics specifically watch for.
     * Best-effort and non-fatal — announcePauseResumeAudio() still falls back to a live call
     * (getRealtimePollyAudio) on a cache miss, e.g. if this hasn't finished yet.
     */
    private fun preCacheSystemAudio() {
        val accent = currentUser?.coachAccent
        val gender = currentUser?.coachGender
        // Pause/resume confirmation, plus every fixed free-run start prompt for the user's
        // current tone/activity — the only pieces of fireStartCoaching()'s free-run branch that
        // are NOT already covered by preGenerateCoachingAudio()'s per-workout pre-cache (that one
        // only runs for coached plans, keyed on preRunBrief). These never change per-run, so once
        // cached here they stay warm for every future run, not just this one — the very first
        // run on a device still pays one live call per phrase actually picked, same as before.
        val tone = currentUser?.coachTone ?: "encouraging"
        val texts = listOf("Session paused.", "Session resumed.") +
            freeRunStartPromptsForTone(tone, isWalk = currentActivityType == "walk")
        for (text in texts) {
            val file = File(systemAudioCacheDir(), "${systemAudioCacheKey(text)}.mp3")
            if (file.exists()) continue
            serviceScope.launch {
                try {
                    val response = apiService.generateTts(
                        GenerateTtsRequest(text = text, coachAccent = accent, coachGender = gender)
                    )
                    response.audio?.let { b64 -> file.writeBytes(Base64.decode(b64, Base64.DEFAULT)) }
                } catch (e: Exception) {
                    Log.w("RunTrackingService", "System audio pre-cache failed for \"$text\" (non-fatal): ${e.message}")
                }
            }
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
     * Polly TTS confirmation for pause/resume. Called from [pauseTracking]/[resumeTracking],
     * which every trigger funnels through — the phone's pause button, a Garmin bezel command,
     * and a Samsung watch command all end up here, so this single hook covers all of them.
     * Wording is deliberately activity-agnostic (no "run"/"walk") since this fires for either.
     */
    private fun announcePauseResumeAudio(paused: Boolean) {
        if (isMuted) return
        val message = if (paused) "Session paused." else "Session resumed."
        serviceScope.launch {
            val base64Audio = getCachedSystemAudio(message) ?: getRealtimePollyAudio(message)
            val audioFormat = if (base64Audio != null) "mp3" else null
            CoachingAudioQueue.enqueue(
                context = this@RunTrackingService,
                base64Audio = base64Audio,
                format = audioFormat,
                fallbackText = message,
                accent = currentUser?.coachAccent,
                gender = currentUser?.coachGender
            )
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
                    // Calculate target pace from target time and distance if available.
                    // Falls back to inferredTargetDistance — see the matching comment in
                    // check500mMilestones() for why (target TIME set without an explicit target
                    // DISTANCE must not leave every target-time-aware coaching path silent).
                    // targetTime is in milliseconds, targetDistance is in metres
                    val effectiveTargetDistance = targetDistance ?: inferredTargetDistance
                    val phaseTargetPaceStr = if (targetTime != null && effectiveTargetDistance != null && effectiveTargetDistance > 0) {
                        val totalSeconds = targetTime!! / 1000.0
                        val targetDistKm = effectiveTargetDistance / 1000.0
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
                        userId = currentUser?.id,
                        garminCompanionSessionId = garminWatchManager?.activeCompanionSessionId
                    )
                    val response = apiService.getPhaseCoaching(update)
                    // Server returns skipped=true with no message when the shared cooldown rejects
                    // this call — don't log/play a null message in that case.
                    if (!response.skipped && response.message.isNotBlank()) {
                        coachingHistory.add(AiCoachingNote(
                            time = getActiveRunDuration(),
                            message = response.message
                        ))
                        Log.d("RunTrackingService", "Phase coaching response: ${response.message}")

                        // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                        if (!isMuted) {
                            playCoachingAudio(response.audio, response.format, response.message)
                        }
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
                    wind = currentWindContext(),
                    elevationRangeM = currentElevationRangeM(),
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
                    activityType = currentActivityType,
                    garminCompanionSessionId = garminWatchManager?.activeCompanionSessionId
                )
                val response = apiService.getStruggleCoaching(update)
                // Note: Struggle point already added above before launching coroutine
                // Server returns skipped=true with no message when the shared cooldown rejects
                // this call — don't log/play "Struggle: null" in that case.
                if (!response.skipped && response.message.isNotBlank()) {
                    coachingHistory.add(AiCoachingNote(
                        time = getActiveRunDuration(),
                        message = "Struggle: ${response.message}"
                    ))

                    // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    /**
     * @param isWalkCheckpoint True for the walk-session 500m check-in (see checkForKmSplit()'s
     *   "Walk session: 500m splits" block) — that call site builds [split] with `km` set to a
     *   500m-block COUNT (1, 2, 3…), not a real kilometre number, purely so it can reuse the
     *   KmSplit type. Previously that fake km value was sent to the backend as `splitKm` and
     *   used verbatim in "Km ${split.km}: ..." log/history text, which — because it increments
     *   twice as fast as real distance — collided with the real km-boundary split below (both
     *   feed this same function): a 4km walk could log "Km 2, Km 1, Km 3, Km 4, Km 2, Km 5, Km
     *   6…" in that exact out-of-order, repeating sequence, and worse, the backend's
     *   coaching-prompts-walk.ts routes any truthy splitKm into its "The walker just completed
     *   kilometer ${splitKm}" prompt — so the AI coach was literally SAYING the wrong kilometre
     *   out loud every 500m (reported 2026-09 — Nino, walk session, "coaching moments" showing
     *   km markers out of order with impossible "0 min/km" paces). The server already has a
     *   correct, distinct "500m check-in" prompt for exactly this case
     *   (coaching-prompts-walk.ts's paceUpdatePrompt ternary) — it just needs splitKm to be
     *   falsy to route there, which is what omitting it here now does.
     */
    private fun triggerKmSplitCoaching(split: KmSplit, isWalkCheckpoint: Boolean = false) {
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

                // Compute target pace string (from target time + distance) for split comparison.
                // Falls back to inferredTargetDistance — see the matching comment in
                // check500mMilestones() for why (target TIME set without an explicit target
                // DISTANCE must not leave every target-time-aware coaching path silent, which is
                // exactly what made km-split coaching unable to say anything about pace-vs-goal
                // for a user who only set a target time).
                val effectiveTargetDistance = targetDistance ?: inferredTargetDistance
                val targetPaceStr = if (targetTime != null && effectiveTargetDistance != null && effectiveTargetDistance > 0) {
                    val totalSec = targetTime!! / 1000.0
                    val tDistKm = effectiveTargetDistance / 1000.0
                    formatPace(totalSec / tDistKm)
                } else null

                val update = PaceUpdate(
                    distance = totalDistance / 1000.0,
                    targetDistance = effectiveTargetDistance?.let { it / 1000.0 },  // Convert metres to km
                    currentPace = overallAvgPaceStr,  // Overall avg pace (for context/trend)
                    elapsedTime = getActiveRunDuration() / 1000,  // Convert ms to seconds
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    isSplit = true,
                    // null (not split.km) for a walk 500m checkpoint — split.km there is a
                    // 500m-block count, not a real kilometre. A falsy splitKm routes the
                    // backend into its correct "500m check-in" prompt instead of "completed
                    // kilometer N" (see this function's doc comment).
                    splitKm = if (isWalkCheckpoint) null else split.km,
                    splitPace = split.pace,   // Pace for this specific km split
                    currentGrade = currentSmoothedGrade,   // Real-time grade, not whole-run average
                    totalElevationGain = totalElevationGain,
                    wind = currentWindContext(),
                    elevationRangeM = currentElevationRangeM(),
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
                    activityType = currentActivityType,
                    // Lets the backend enrich this prompt with the watch's live running-dynamics
                    // stream when one is actually connected — null (no enrichment, same prompt as
                    // today) for phone-only runs. Whichever watch brand is paired; only one is
                    // ever non-null at a time.
                    garminCompanionSessionId = garminWatchManager?.activeCompanionSessionId
                        ?: samsungWatchManager?.activeCompanionSessionId
                )
                // One retry on a transient failure before giving up. This call has no other
                // resilience — unlike watch start/pause/resume/stop (which retry-until-acked),
                // a single dropped network request here permanently loses that coaching moment
                // with nothing but a Log.e nobody sees. A phone locked in a pocket for a long
                // walk is exactly the kind of session where a brief connectivity blip is likely,
                // so it's worth one retry rather than silently discarding the whole km/checkpoint.
                val response = try {
                    apiService.getPaceUpdate(update)
                } catch (e: Exception) {
                    Log.w("RunTrackingService", "getPaceUpdate failed, retrying once: ${e.message}")
                    delay(2000)
                    apiService.getPaceUpdate(update)
                }
                // Server returns skipped=true with no message when the shared cooldown (or the
                // user's configured km-interval setting) rejects this split — don't log/play
                // "Km X: null" in that case.
                if ((response.skipped || response.message.isBlank()) && !isWalkCheckpoint && response.reason != "split_interval") {
                    // A real km split with nothing usable back from the server (AI failure, or
                    // an unexpected cooldown skip). Km splits are non-negotiable, so announce
                    // the facts locally — distance + split time — rather than staying silent.
                    // This is a data readout, not a canned coaching line.
                    val splitSecs = (split.time / 1000L).toInt()
                    val splitClock = if (splitSecs >= 3600) String.format("%d:%02d:%02d", splitSecs / 3600, (splitSecs % 3600) / 60, splitSecs % 60)
                                     else String.format("%d:%02d", splitSecs / 60, splitSecs % 60)
                    val readout = "${split.km} ${if (split.km == 1) "kilometre" else "kilometres"} done. That kilometre took $splitClock."
                    Log.w("RunTrackingService", "Km ${split.km} split: no server message (skipped=${response.skipped}, reason=${response.reason}) — announcing locally")
                    coachingHistory.add(AiCoachingNote(time = getActiveRunDuration(), message = "Km ${split.km}: $readout"))
                    if (!isMuted) playCoachingAudio(null, null, readout)
                } else if (!response.skipped && response.message.isNotBlank()) {
                    // "Km ${split.km}" only means something for a real km split — split.km on a
                    // walk checkpoint is a 500m-block count, not a kilometre number (see this
                    // function's doc comment). Label those by actual distance instead so the
                    // coaching history never shows a fabricated/colliding km marker.
                    val label = if (isWalkCheckpoint) {
                        "${String.format("%.1f", totalDistance / 1000.0)}km check-in"
                    } else {
                        "Km ${split.km}"
                    }
                    coachingHistory.add(AiCoachingNote(
                        time = getActiveRunDuration(),
                        message = "$label: ${response.message}"
                    ))
                    Log.d("RunTrackingService", "$label split coaching: ${response.message}")

                    // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                    // (playCoachingAudio handles all text normalizations internally)
                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
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
        lastHrAcceptedWallMs = now

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
     * Drops the live heart-rate reading once no source (watch frame or phone sensor) has
     * delivered an accepted sample for [HR_STALE_MS]. Runs off the 1 Hz timer tick.
     *
     * Without this, currentHeartRate held its last value indefinitely: every accepted reading
     * only ever *replaced* it, and the confidence window (recentHrReadings) is only pruned
     * inside validateAndUpdateHRBuffer() — i.e. only when a new reading arrives — so a dead
     * sensor left isHRReadingConfident() permanently true on a frozen number. Confirmed
     * 2026-09-20 (Daniel, half marathon): the watch died at 20.6 km and its final 126 bpm was
     * stamped into all 240 subsequent GPS points and fed to the coaching prompts as live HR.
     * Clearing the window too means HR coaching stays quiet until a real source re-establishes
     * confidence, rather than firing on the first reading after a gap.
     */
    private fun checkHeartRateStaleness() {
        if (currentHeartRate <= 0 || lastHrAcceptedWallMs <= 0L) return
        val staleMs = System.currentTimeMillis() - lastHrAcceptedWallMs
        if (staleMs < HR_STALE_MS) return
        Log.w("RunTrackingService", "❤️ No heart-rate sample for ${staleMs / 1000}s — treating HR as unknown (was $currentHeartRate bpm)")
        currentHeartRate = 0
        recentHrReadings.clear()
        hrTrendBuffer.clear()
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
                // Pace context for the server's effort philosophy (see HeartRateCoachingRequest).
                // Average pace is what's compared against target — instantaneous pace is too noisy
                // to justify a "you're ahead of target" observation on its own.
                val hrActiveMs = getActiveRunDuration()
                val hrAvgPaceSec = if (totalDistance > 0 && hrActiveMs > 0) (hrActiveMs / 1000.0) / (totalDistance / 1000.0) else 0.0
                val hrTargetPaceSec = targetTime?.let { tt ->
                    (targetDistance ?: inferredTargetDistance)?.takeIf { it > 0 }?.let { td -> (tt / 1000.0) / (td / 1000.0) }
                }
                val hrPaceVsTargetPercent = if (hrTargetPaceSec != null && hrTargetPaceSec > 0 && hrAvgPaceSec > 0)
                    (hrTargetPaceSec - hrAvgPaceSec) / hrTargetPaceSec * 100.0 else null
                val request = HeartRateCoachingRequest(
                    currentHR = currentHeartRate,
                    avgHR = avgHr,
                    maxHR = maxHrValue,
                    targetZone = derivedTargetZone,
                    elapsedMinutes = elapsedMinutes,
                    currentPace = currentPace.takeIf { it != "0:00" },
                    avgPace = if (hrAvgPaceSec > 0) formatPace(hrAvgPaceSec) else null,
                    targetPace = hrTargetPaceSec?.let { formatPace(it) },
                    paceVsTargetPercent = hrPaceVsTargetPercent,
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
                    activityType = currentActivityType,
                    garminCompanionSessionId = garminWatchManager?.activeCompanionSessionId,
                    wind = currentWindContext(),
                    elevationRangeM = currentElevationRangeM(),
                    kmSplits = kmSplits.map { KmSplitBrief(it.km, it.pace) }.ifEmpty { null },
                    distance = totalDistance / 1000.0,
                    targetDistance = (targetDistance ?: inferredTargetDistance)?.takeIf { it > 0 }?.let { it / 1000.0 },
                    targetTime = targetTime?.let { it / 1000 }
                )
                val response = apiService.getHeartRateCoaching(request)
                // Server returns skipped=true with no message when the shared per-user coaching
                // cooldown rejects this call — don't log/play "HR: null" in that case.
                if (!response.skipped && response.message.isNotBlank()) {
                    coachingHistory.add(AiCoachingNote(
                        time = getActiveRunDuration(),
                        message = "HR: ${response.message}"
                    ))

                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
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
                // Server returns skipped=true with no message when the shared cooldown rejects
                // this call — don't log/play "Cadence: null" in that case.
                if (!response.skipped && response.message.isNotBlank()) {
                    coachingHistory.add(AiCoachingNote(
                        time = getActiveRunDuration(),
                        message = "Cadence: ${response.message}"
                    ))
                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
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

    /**
     * Returns true only when an elite/final cue was actually dispatched. The checkPaceCoaching()
     * and km-split "DIVERSIFY" substitution call sites depend on this: they give up their own
     * pace/split slot ONLY if the swap really happened. Before this returned Unit, a silent early
     * return here (motivational coaching disabled, <1 km, final stretch) still cost the caller its
     * slot — and since lastEliteCoachingTime never advanced, the substitution condition stayed
     * true and swallowed EVERY subsequent on-pace update and km split for the rest of the run.
     */
    private fun maybeFireEliteCoaching(
        displayDistance: Double,
        duration: Long,
        avgSpeed: Float,
        phase: CoachingPhase,
        forceBypassCooldown: Boolean = false
    ): Boolean {
        if (!coachingFeaturePrefs.motivationalCoachingEnabled) return false
        if (totalDistance < 1000) return false // Need at least 1km of data
        val now = System.currentTimeMillis()

        val distKm = displayDistance / 1000.0
        val currentKm = distKm.toInt()
        val td = targetDistance ?: inferredTargetDistance // Use inferred if no explicit target
        val remainingMeters = if (td != null && td > 0) (td - displayDistance) else null

        // FINAL 100m — highest priority, bypasses cooldowns (fires once)
        if (!hasFinal100mFired && remainingMeters != null && remainingMeters in 0.0..120.0) {
            hasFinal100mFired = true
            fireFinalCoaching("final_100m", distKm, duration, avgSpeed, remainingMeters)
            return true
        }

        // FINAL 250m — fires between 500m and 100m remaining (fires once)
        if (!hasFinal250mFired && remainingMeters != null && remainingMeters in 0.0..275.0) {
            if ((now - lastCoachingTime) < 10_000L) return false // minimal 10s gap only
            hasFinal250mFired = true
            fireFinalCoaching("final_250m", distKm, duration, avgSpeed, remainingMeters)
            return true
        }

        // FINAL 500m — very high priority, bypasses elite cooldown (fires once)
        if (!hasFinal500mFired && remainingMeters != null && remainingMeters in 0.0..550.0) {
            if ((now - lastCoachingTime) < 10_000L) return false // minimal 10s gap only
            hasFinal500mFired = true
            fireFinalCoaching("final_500m", distKm, duration, avgSpeed, remainingMeters)
            return true
        }

        // In the final 500m, don't fire any analysis/summary coaching — only final motivation above
        if (isInFinalStretch()) return false

        // Standard elite coaching — respect cooldowns, unless a checkPaceCoaching() substitution is forcing this fire
        if (!forceBypassCooldown) {
            if ((now - lastEliteCoachingTime) < ELITE_COACHING_COOLDOWN_MS) return false
            if ((now - lastCoachingTime) < COACHING_COOLDOWN_MS) return false
            if (totalDistance - lastEliteCoachingDistance < eliteCueMinGapM) return false
        }

        // Priority order: milestone > target ETA > pace trend > positive reinforcement > technique > elevation
        when {
            shouldTriggerMilestone(distKm) -> fireMilestoneCoaching(distKm, duration, avgSpeed)
            shouldTriggerTargetEta(currentKm, distKm, duration) -> fireTargetEtaCoaching(distKm, duration, avgSpeed)
            shouldTriggerPaceTrend(currentKm) -> firePaceTrendCoaching(distKm, duration, avgSpeed)
            shouldTriggerPositiveReinforcement(currentKm) -> firePositiveReinforcementCoaching(distKm, duration, avgSpeed)
            shouldTriggerTechnique(now) -> fireTechniqueCoaching(distKm, duration, avgSpeed, phase)
            shouldTriggerElevationInsight(now) -> fireElevationInsightCoaching(distKm, duration, avgSpeed)
            // Forced substitution and none of the specific conditions lined up (e.g. no km-boundary
            // window, not enough splits yet) — fall back to technique coaching so the swap always
            // resolves to SOMETHING rather than silently doing nothing. Still respects the technique
            // spacing floor so a forced swap can't land seconds after a scheduled technique cue.
            forceBypassCooldown && shouldTriggerTechnique(now) -> fireTechniqueCoaching(distKm, duration, avgSpeed, phase)
            forceBypassCooldown -> firePositiveReinforcementCoaching(distKm, duration, avgSpeed)
            else -> return false
        }
        return true
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
                    // Check the local cache before ever making a live network call — this is the
                    // single audio cue most likely to fire from directly inside a watch-relayed
                    // BLE "start" callback while the phone is backgrounded/screen-locked (a start
                    // command IS the BLE event here, there's no earlier foreground moment to hook
                    // for this specific cue). A live network round-trip landing in that exact
                    // window is the same class of background-activity burst that most likely
                    // triggered Nino's ColorOS kill on pause — see preCacheSystemAudio(). The plan
                    // case was ALREADY pre-generated by preGenerateCoachingAudio() at "Prepare for
                    // Watch" time but this call site never checked it before now; the free-run
                    // case is warmed by preCacheSystemAudio() (called at the top of startTracking,
                    // covers every future run once any run has completed on this device).
                    val cachedAudio = if (planPreRunBrief != null) {
                        getPreCachedPollyAudio(startPrompt)
                    } else {
                        getCachedSystemAudio(startPrompt)
                    }
                    if (cachedAudio != null) {
                        Log.d("RunTrackingService", "Start coaching audio from local cache (plan=${planPreRunBrief != null}) — no network call")
                        playCoachingAudio(cachedAudio, "mp3", startPrompt)
                    } else {
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
    private fun generateStartPromptByTone(tone: String): String =
        freeRunStartPromptsForTone(tone, isWalk = currentActivityType == "walk").random()

    /**
     * The fixed pool [generateStartPromptByTone] picks randomly from for a given tone/activity —
     * extracted so [preCacheSystemAudio] can pre-warm the Polly cache for all of them (they never
     * change per-run), not just whichever one happens to get picked live.
     */
    private fun freeRunStartPromptsForTone(tone: String, isWalk: Boolean): List<String> {
        return when (tone.lowercase()) {
            "technical" -> if (isWalk) listOf(
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
            "calm" -> if (isWalk) listOf(
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
            "motivational" -> if (isWalk) listOf(
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
            "playful" -> if (isWalk) listOf(
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
            else -> if (isWalk) listOf( // "encouraging" or default
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

    // ── Live environment context for coaching requests ──────────────────────────
    /**
     * Wind from the run-start weather fix, classified against the runner's current heading.
     * Wind direction is meteorological (the direction it blows FROM), so a heading equal to it
     * means running straight into the wind. Null when weather never loaded or it's calm.
     */
    private fun currentWindContext(): live.airuncoach.airuncoach.network.model.WindContext? {
        val weather = weatherAtStart ?: return null
        val speedKmh = weather.windSpeed.roundToInt()
        if (speedKmh <= 0) return null
        val windFrom = weather.windDirection
        val heading: Double? = routePoints.asReversed().take(20).firstOrNull { it.bearing != null }?.bearing?.toDouble()
            ?: watchLatestBearing.takeIf { it > 0f }?.toDouble()
        val relative = if (windFrom != null && heading != null) {
            val diff = abs(((heading - windFrom + 180.0) % 360.0 + 360.0) % 360.0 - 180.0) // 0 = into the wind, 180 = at their back
            when {
                diff <= 45.0  -> "headwind"
                diff >= 135.0 -> "tailwind"
                else          -> "crosswind"
            }
        } else null
        return live.airuncoach.airuncoach.network.model.WindContext(speedKmh, windFrom, relative)
    }

    /** Highest − lowest altitude seen so far (metres), or null before any altitude data. */
    private fun currentElevationRangeM(): Double? {
        val min = calculateMinElevation() ?: return null
        val max = calculateMaxElevation() ?: return null
        return (max - min).coerceAtLeast(0.0)
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
            wind = currentWindContext(),
            elevationRangeM = currentElevationRangeM(),
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
        val previousEliteTime = lastEliteCoachingTime
        lastEliteCoachingTime = now
        lastEliteCoachingDistance = totalDistance
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
                // Server returns skipped=true with no message when the shared cooldown rejects
                // this call. (message.isNotBlank() alone happened to catch this too, since a
                // Gson-nulled non-null String throws on isNotBlank() and gets swallowed by the
                // catch block below — but that's an accident of implementation, not a real check.)
                if (!response.skipped && response.message.isNotBlank()) {
                    coachingHistory.add(AiCoachingNote(
                        time = getActiveRunDuration(),
                        message = "$label: ${response.message}"
                    ))
                    Log.d("RunTrackingService", "Elite coaching ($label): ${response.message}")
                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
                } else {
                    // Server-side cooldown rejected it (or empty). Nothing was spoken, so don't
                    // charge the elite timer for it — otherwise a DIVERSIFY substitution that
                    // got rejected went silent AND blocked the next swap for another 6 minutes,
                    // and the pace/split slot it replaced was already gone.
                    Log.d("RunTrackingService", "Elite coaching ($label) skipped by server — restoring elite timer for an earlier retry")
                    lastEliteCoachingTime = previousEliteTime
                }
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to get elite coaching ($label)", e)
                lastEliteCoachingTime = previousEliteTime
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
    // Running-only technique areas. The server's walk coaching policy says never coach cadence
    // or strike/knee-lift to a walker, but the category prompt says "Coach ONLY the <area>" —
    // so a walk assigned one of these produced a running cue for a walker. Filtered out of every
    // selection path below when the session is a walk.
    private val runOnlyTechniqueCategories = setOf(
        "feet_cadence", "feet_strike_pattern", "knees_lift", "hill_uphill_technique",
        "stride_length_control", "arms_drive_power"
    )

    private fun selectTechniqueCategory(phase: CoachingPhase, isUphill: Boolean, isDownhill: Boolean, fatigueLevel: String): String {
        if (currentActivityType != "walk") return selectTechniqueCategoryUnfiltered(phase, isUphill, isDownhill, fatigueLevel)
        // Walk: keep re-drawing until we get a walk-appropriate area (the unfiltered selector
        // marks nothing as used, so this is side-effect free). Bounded so a pathological
        // usedTechniqueCategories state can't loop forever.
        repeat(8) {
            val candidate = selectTechniqueCategoryUnfiltered(phase, isUphill, isDownhill, fatigueLevel)
            if (candidate !in runOnlyTechniqueCategories) return candidate
            usedTechniqueCategories.add(candidate) // skip it for this walk without ever speaking it
        }
        return "breathing_rhythm"
    }

    private fun selectTechniqueCategoryUnfiltered(phase: CoachingPhase, isUphill: Boolean, isDownhill: Boolean, fatigueLevel: String): String {
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

    // Technique focus areas — deliberately CONCEPT-level (the technical point to coach),
    // not ready-to-speak sentences. These used to be fully-written prose with vivid,
    // reusable imagery ("like a wheel rolling", "'Strong. Smooth. Fast.'", "running on hot
    // coals"), sent to the backend framed as "the exact cue to deliver" and merely
    // reworded by the AI — so the same distinctive phrases got echoed across nearly every
    // user's runs regardless of the "make it natural" instruction (confirmed: this is the
    // root cause of user reports of coaching sounding hardcoded/repetitive, e.g. "moving
    // like a piston engine", "smooth" — those exact-feeling phrases came from entries here
    // and from a similar issue in the server's elevation-coaching prompt, fixed separately).
    // Kept as short factual/technical descriptions; the backend prompt (ai-service.ts,
    // 'technique_form' case) explicitly instructs the AI to generate original wording and
    // metaphor from these, never to echo a stock phrase.
    private val techniqueHints = mapOf(
        // Posture
        "posture_head_neck" to "Eyes forward rather than down at the feet; chin level; head tall.",
        "posture_shoulders" to "Shoulders relaxed and dropped away from the ears — they tend to creep up under fatigue.",
        "posture_torso_lean" to "A slight forward lean from the ankles, not a bend at the waist — a straight line from ankle to head.",
        "posture_core_engagement" to "A gentle core brace with a neutral pelvis, avoiding an arched lower back.",

        // Arms
        "arms_swing_direction" to "Forward-and-back arm swing rather than across the body.",
        "arms_elbow_angle" to "Elbows at roughly 90 degrees — compact arm carriage is more efficient than letting them straighten out.",
        "arms_hand_relaxation" to "Loose, unclenched hands — tension here travels up into the arms and shoulders.",
        "arms_drive_power" to "A more powerful backward elbow drive to help power the legs through this effort.",

        // Hips
        "hips_extension" to "Fully extending the hip behind the body before the foot leaves the ground, for more power per stride.",
        "hips_alignment" to "Level hips rather than dropping on one side as the opposite foot lifts — a stability/glute-strength cue.",
        "hips_forward_drive" to "Driving the knee forward and up from the hip, rather than reaching out with the foot.",

        // Knees
        "knees_lift" to "Knee height scaled to the current pace — more drive for faster efforts, a gentle lift at easy pace.",
        "knees_alignment" to "Knees tracking directly over the toes rather than collapsing inward.",
        "knees_soft_landing" to "A soft, slightly bent knee on landing rather than locking it out, to reduce impact/injury risk.",

        // Feet
        "feet_cadence" to "Quicker, lighter steps, targeting roughly 170-180 steps per minute.",
        "feet_strike_pattern" to "Landing under the body rather than reaching out in front, with a soft midfoot strike — loud footfall signals overstriding.",
        "feet_push_off" to "A strong push through the big toe and active ankle extension for extra forward propulsion.",
        "feet_ground_contact" to "Minimising ground-contact time per foot with a quicker turnover — shorter contact means a more efficient stride.",

        // Hills
        "hill_uphill_technique" to "Shorter stride, higher cadence, a slight forward lean from the ankles, and a more active arm drive uphill.",
        "hill_downhill_technique" to "A slight forward lean (not leaning back), quick light steps, controlling speed through cadence rather than braking.",

        // Breathing
        "breathing_rhythm" to "Matching breath to stride — roughly a 2-step-in/2-step-out pattern at moderate effort, 3:3 at easy pace.",
        "breathing_deep_belly" to "Breathing from the belly/diaphragm rather than the chest, for better oxygen delivery.",
        "breathing_exhale_power" to "A stronger, more deliberate exhale — the inhale takes care of itself — to clear CO2 more effectively.",

        // Mental
        "mental_smile" to "A genuine smile measurably reduces perceived effort by relaxing the face — worth mentioning as a real, studied effect, not just a platitude.",
        "mental_mantras" to "Encourage picking a short personal word or phrase to repeat with each step to quiet the urge to slow down — invent a fresh example each time, never the same stock mantra twice.",
        "mental_chunking" to "Breaking the remaining distance into small, manageable chunks instead of thinking about the whole thing at once.",
        "mental_focus_reset" to "A quick top-to-bottom body scan (head, shoulders, arms, core, hips, feet), releasing anything found tensed up.",
        "mental_visualisation" to "Picturing a strong finish and their own best form, then running toward that mental image.",

        // Recovery/Shake-out
        "recovery_arm_shakeout" to "Dropping the arms and shaking them loose for a few seconds to release tension, then resetting.",
        "recovery_shoulder_roll" to "A few big backward shoulder circles to release built-up upper-body tension.",
        "recovery_hand_flex" to "Opening and closing the fists a few times to release tension that's crept up through the arms and shoulders."
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
                    elevationRangeM = currentElevationRangeM(),
                    wind = currentWindContext(),
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
                // Server returns skipped=true with no message when the shared cooldown rejects
                // this call — don't log/play "Elevation: null" in that case.
                if (!response.skipped && response.message.isNotBlank()) {
                    coachingHistory.add(AiCoachingNote(
                        time = getActiveRunDuration(),
                        message = "Elevation: ${response.message}"
                    ))

                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
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
                val now = System.currentTimeMillis()
                if (runStartStepCount == -1) {
                    runStartStepCount = steps
                    windowStartStepCount = steps
                    lastStepTimestamp = now
                }

                // Run total: measured from the run-start baseline, which never moves.
                val stepsThisRun = steps - runStartStepCount
                if (stepsThisRun > 0) totalStepsDuringRun = stepsThisRun

                // Cadence: a rate, so measured over a short rolling window instead.
                val windowSteps = steps - windowStartStepCount
                val windowMs = now - lastStepTimestamp
                if (windowMs > 2000) {
                    val spm = (windowSteps * 60000 / windowMs).toInt()
                    // Report 0 rather than a drift-level figure, and keep it out of the
                    // average — but do not hold the previous reading, which would show a
                    // stale cadence for someone who has genuinely stopped.
                    currentCadence = if (spm >= MIN_VALID_CADENCE_SPM) spm else 0
                    windowStartStepCount = steps
                    lastStepTimestamp = now
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
