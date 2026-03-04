package live.airuncoach.airuncoach.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
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
import com.google.maps.android.PolyUtil
import com.google.maps.android.SphericalUtil
import retrofit2.HttpException
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
    private var stepCounterSensor: Sensor? = null
    private var heartRateSensor: Sensor? = null
    private var wakeLock: PowerManager.WakeLock? = null
    
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    
    // AI Coaching
    private lateinit var coachingFeaturePrefs: live.airuncoach.airuncoach.data.CoachingFeaturePreferences
    private lateinit var apiService: ApiService
    private lateinit var sessionManager: SessionManager
    private lateinit var textToSpeechHelper: TextToSpeechHelper
    private lateinit var audioPlayerHelper: AudioPlayerHelper
    private var currentUser: User? = null
    private var lastPhase: CoachingPhase? = null
    private var last500mMilestone = 0
    private val coachingHistory = mutableListOf<AiCoachingNote>() // Track what coaching has been given with timestamps
    private var isMuted = false // User can mute coach
    private var lastCoachingTime: Long = 0 // Cooldown between coaching events
    private val COACHING_COOLDOWN_MS = 30_000L // 30 second minimum gap between coaching
    private var hasCoachingFiredThisTick = false // Only one coaching trigger per location update
    
    // Run data
    private var targetDistance: Double? = null // For mapped runs
    private var targetTime: Long? = null     // For time-based goals (milliseconds)
    private var hasRoute: Boolean = false
    private val routePoints = mutableListOf<LocationPoint>()
    private val kmSplits = mutableListOf<KmSplit>()
    private var lastKmSplit = 0
    private var startTime: Long = 0
    private var lastSplitTime: Long = 0
    private var totalDistance: Double = 0.0
    private var maxSpeed: Float = 0f
    private var currentPace: String = "0:00" // Real-time/instant pace based on recent GPS
    private var isTracking = false
    private var currentCadence: Int = 0
    private var currentHeartRate: Int = 0
    private var initialStepCount: Int = -1
    private var lastStepTimestamp: Long = 0
    
    // Cadence tracking for average/max (mirrors HR tracking)
    private var cadenceSum: Long = 0
    private var cadenceCount: Int = 0
    private var maxCadenceValue: Int = 0
    
    // Struggle detection - baseline is session average pace, updated every 500m
    private var baselinePace: Float = 0f
    private var lastBaselineUpdateDistance: Double = 0.0
    private var lastStruggleTriggerTime: Long = 0
    private var isStruggling = false
    private val strugglePointsList = mutableListOf<StrugglePoint>()

    // Elevation coaching
    private var lastElevationCoachingTime: Long = 0
    private var lastHillTopAckTime: Long = 0
    private var slopeDirection: Int = 0 // 1 = uphill, -1 = downhill, 0 = flat/unknown
    private var slopeDistanceMeters: Double = 0.0
    private var slopeElevationGain: Double = 0.0 // Total metres gained in current uphill segment
    private var slopeElevationLoss: Double = 0.0 // Total metres lost in current downhill segment
    private var downhillFinishTriggered: Boolean = false
    // Altitude smoothing - rolling window to filter GPS noise
    private val recentAltitudes = ArrayList<Double>() // Rolling window of recent altitudes
    private var smoothedAltitude: Double? = null // Smoothed altitude from rolling average

    // Heart rate coaching
    private var hrSum: Long = 0
    private var hrCount: Int = 0
    private var maxHr: Int = 0
    private var lastHrCoachingTime: Long = 0
    private var lastHrCoachingMinute: Int = -1

    // Cadence/stride coaching
    private var lastCadenceCoachingTime: Long = 0
    private var hasCadenceCoachingFired = false
    private var lastStrideZone: String = "OPTIMAL"
    private var baselineCadence: Int = 0
    private var cadenceSamplesForBaseline: Int = 0
    private val recentStrideLengths = mutableListOf<Double>()

    // Elite coaching triggers — technique, milestones, reinforcement, ETA, trends, elevation
    private var lastEliteCoachingTime: Long = 0
    private val ELITE_COACHING_COOLDOWN_MS = 45_000L // 45 second gap between elite coaching
    private var lastTechniqueCoachingTime: Long = 0
    private val TECHNIQUE_INTERVAL_MS = 180_000L // Technique coaching every ~3 minutes
    private var lastMilestonePercent: Int = 0 // Track which milestones have been triggered (25, 50, 75)
    private var lastTargetEtaKm: Int = 0 // Track last km an ETA was given
    private var lastPaceTrendCheckKm: Int = 0 // Track last km a pace trend was analysed
    private var lastPositiveReinforcementKm: Int = 0 // Track last km positive reinforcement was given
    private var lastElevationInsightTime: Long = 0
    private val ELEVATION_INSIGHT_COOLDOWN_MS = 120_000L // 2 min between elevation insights
    private var hasFinal500mFired = false
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
    private val NAV_CHECK_INTERVAL_MS = 3_000L       // Check navigation every 3 seconds
    private val NAV_WAYPOINT_REACHED_RADIUS_M = 35.0  // Within 35m = reached waypoint
    private val NAV_WARNING_RADIUS_M = 80.0            // Within 80m = announce upcoming turn
    private val NAV_MISSED_WAYPOINT_RADIUS_M = 120.0   // Beyond 120m past waypoint = missed it
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
        private const val LOCATION_UPDATE_INTERVAL = 2000L
        private const val LOCATION_FASTEST_INTERVAL = 1000L
        private const val STRUGGLE_COOLDOWN_MS = 120_000 // 2 minutes
        private const val ELEVATION_COOLDOWN_MS = 120_000 // 2 minutes
        private const val HILL_TOP_COOLDOWN_MS = 180_000 // 3 minutes
        private const val HR_COOLDOWN_MS = 180_000 // 3 minutes

        private const val UPHILL_GRADE_THRESHOLD = 3.0      // Min grade to count as "uphill" for slope tracking
        private const val STEEP_UPHILL_GRADE_THRESHOLD = 5.0 // Smoothed grade needed to trigger uphill coaching
        private const val DOWNHILL_GRADE_THRESHOLD = -3.0    // Min grade to count as "downhill" for slope tracking
        private const val STEEP_DOWNHILL_GRADE_THRESHOLD = -5.0 // Smoothed grade needed to trigger downhill coaching
        private const val HILL_TOP_MIN_DISTANCE_M = 200.0    // Min uphill distance before hill-top ack fires
        private const val UPHILL_MIN_DISTANCE_M = 200.0      // Min sustained uphill distance to trigger coaching
        private const val DOWNHILL_MIN_DISTANCE_M = 250.0    // Min sustained downhill distance to trigger coaching
        private const val DOWNHILL_FINISH_DISTANCE_KM = 1.0  // Within this distance of finish for downhill_finish
        private const val MIN_ELEVATION_GAIN_M = 15.0        // Min metres climbed in segment to trigger uphill coaching
        private const val MIN_ELEVATION_LOSS_M = 15.0        // Min metres descended in segment to trigger downhill coaching
        private const val HILL_TOP_MIN_GAIN_M = 12.0         // Min metres gained before hill-top ack
        private const val ALTITUDE_SMOOTHING_WINDOW = 5      // Number of altitude readings to average for smoothing
        
        const val ACTION_START_TRACKING = "ACTION_START_TRACKING"
        const val ACTION_STOP_TRACKING = "ACTION_STOP_TRACKING"
        const val ACTION_PAUSE_TRACKING = "ACTION_PAUSE_TRACKING"
        const val ACTION_RESUME_TRACKING = "ACTION_RESUME_TRACKING"
        const val ACTION_START_SIMULATION = "ACTION_START_SIMULATION"
        const val ACTION_START_NAV_SIMULATION = "ACTION_START_NAV_SIMULATION"
        const val EXTRA_TARGET_DISTANCE = "EXTRA_TARGET_DISTANCE"
        const val EXTRA_TARGET_TIME = "EXTRA_TARGET_TIME"
        const val EXTRA_HAS_ROUTE = "EXTRA_HAS_ROUTE"
        const val EXTRA_ACTIVE_RUN = "extra_active_run"
        
        private val _currentRunSession = MutableStateFlow<RunSession?>(null)
        val currentRunSession: StateFlow<RunSession?> = _currentRunSession
        
        private val _isServiceRunning = MutableStateFlow(false)
        val isServiceRunning: StateFlow<Boolean> = _isServiceRunning
        
        private val _uploadComplete = MutableStateFlow<String?>(null) // Backend run ID when upload completes
        val uploadComplete: StateFlow<String?> = _uploadComplete

        // Coaching text broadcast to UI (set when coaching plays, cleared when audio finishes)
        private val _latestCoachingText = MutableStateFlow<String?>(null)
        val latestCoachingText: StateFlow<String?> = _latestCoachingText
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        weatherRepository = WeatherRepository(this)
        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        heartRateSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE)
        
        // Initialize session manager and coaching feature preferences
        sessionManager = SessionManager(this)
        coachingFeaturePrefs = live.airuncoach.airuncoach.data.CoachingFeaturePreferences(this)
        
        // Initialize API service
        apiService = RetrofitClient.apiService
        
        // Initialize Text-to-Speech for AI coaching (fallback)
        textToSpeechHelper = TextToSpeechHelper(this)
        
        // Initialize Audio Player for OpenAI TTS
        audioPlayerHelper = AudioPlayerHelper(this)

        // Initialize the shared audio queue (handles both OpenAI TTS and device TTS fallback)
        CoachingAudioQueue.init(this)
        
        // Load user profile for coach settings
        serviceScope.launch {
            try {
                val userId = sessionManager.getUserId()
                if (userId != null) {
                    currentUser = apiService.getUser(userId)
                    Log.d("RunTrackingService", "Loaded user profile: ${currentUser?.coachName}")
                }
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to load user profile", e)
            }
        }
        
        createNotificationChannel()
        acquireWakeLock()
        setupLocationCallback()
    }

    // Polyline passed via intent for nav simulation
    private var navSimulationPolyline: String? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        targetDistance = intent?.getDoubleExtra(EXTRA_TARGET_DISTANCE, 0.0)?.takeIf { it > 0 }
        targetTime = intent?.getLongExtra(EXTRA_TARGET_TIME, 0)?.takeIf { it > 0 }
        hasRoute = intent?.getBooleanExtra(EXTRA_HAS_ROUTE, false) == true
        navSimulationPolyline = intent?.getStringExtra("EXTRA_ROUTE_POLYLINE")

        when (intent?.action) {
            ACTION_START_TRACKING -> startTracking()
            ACTION_STOP_TRACKING -> stopTracking()
            ACTION_PAUSE_TRACKING -> pauseTracking()
            ACTION_RESUME_TRACKING -> resumeTracking()
            ACTION_START_SIMULATION -> startSimulation()
            ACTION_START_NAV_SIMULATION -> startNavigationSimulation()
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

    private fun startTracking() {
        if (isTracking) {
            Log.w("RunTrackingService", "Already tracking, ignoring start request")
            return
        }

        Log.d("RunTrackingService", "Starting tracking... targetDistance=$targetDistance, targetTime=$targetTime, hasRoute=$hasRoute")
        
        // CRITICAL: Call startForeground IMMEDIATELY to avoid ANR
        try {
            startForeground(NOTIFICATION_ID, createNotification("Starting run...", "Initializing GPS"))
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
        startTime = System.currentTimeMillis()
        lastSplitTime = startTime
        routePoints.clear()
        kmSplits.clear()
        lastKmSplit = 0
        last500mMilestone = 0  // Reset for new run
        lastPhase = null        // Reset for new run - allow first phase change to trigger
        lastCoachingTime = 0   // Reset cooldown for new run
        totalDistance = 0.0
        maxSpeed = 0f
        totalElevationGain = 0.0
        totalElevationLoss = 0.0
        weatherAtStart = null
        weatherAtEnd = null
        currentCadence = 0
        cadenceSum = 0
        cadenceCount = 0
        maxCadenceValue = 0
        currentHeartRate = 0
        initialStepCount = -1
        lastStepTimestamp = 0
        baselinePace = 0f
        lastBaselineUpdateDistance = 0.0
        hasCadenceCoachingFired = false
        lastCadenceCoachingTime = 0
        lastStrideZone = "OPTIMAL"
        baselineCadence = 0
        cadenceSamplesForBaseline = 0
        recentStrideLengths.clear()
        lastEliteCoachingTime = 0
        lastTechniqueCoachingTime = 0
        lastMilestonePercent = 0
        lastTargetEtaKm = 0
        lastPaceTrendCheckKm = 0
        lastPositiveReinforcementKm = 0
        lastElevationInsightTime = 0
        hasFinal500mFired = false
        hasFinal100mFired = false
        lastFlatTerrainCoachingKm = 0
        hasCoachingFiredThisTick = false
        lastStruggleTriggerTime = 0
        isStruggling = false
        strugglePointsList.clear()
        lastElevationCoachingTime = 0
        lastHillTopAckTime = 0
        slopeDirection = 0
        slopeDistanceMeters = 0.0
        slopeElevationGain = 0.0
        slopeElevationLoss = 0.0
        downhillFinishTriggered = false
        recentAltitudes.clear()
        smoothedAltitude = null
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
        targetDistance = 3.0
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
        val closerToNextInstruction = if (navCurrentInstructionIndex + 1 < navTurnInstructions.size) {
            val nextNext = navTurnInstructions[navCurrentInstructionIndex + 1]
            val nextNextPos = com.google.android.gms.maps.model.LatLng(nextNext.latitude, nextNext.longitude)
            val distToNext = SphericalUtil.computeDistanceBetween(currentPos, nextNextPos)
            distToNext < distanceToWaypoint
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
        
        // Show text in UI immediately while we wait for audio
        _latestCoachingText.value = navigationText
        
        coachingHistory.add(AiCoachingNote(
            time = System.currentTimeMillis() - startTime,
            message = "Nav: $navigationText"
        ))
        
        serviceScope.launch {
            try {
                val update = PhaseCoachingUpdate(
                    phase = _currentRunSession.value?.phase?.name ?: "STEADY",
                    distance = totalDistance / 1000.0,
                    targetDistance = targetDistance,
                    elapsedTime = System.currentTimeMillis() - startTime,
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
                    activityType = "run",
                    hasRoute = true,
                    triggerType = "navigation_turn",
                    navigationInstruction = navigationText,
                    navigationDistance = distanceMeters
                )
                
                val response = apiService.getPhaseCoaching(update)
                Log.d("Navigation", "LLM navigation response: ${response.message}")
                
                coachingHistory.add(AiCoachingNote(
                    time = System.currentTimeMillis() - startTime,
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
            targetPaceSecondsPerKm = targetTimeSeconds / targetDistKm
            paceCoachingEnabled = true
            paceTargetAbandoned = false
            paceTargetAbandonedNotified = false
            consecutiveOverPaceChecks = 0
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
        
        // Calculate current average pace for the whole run so far
        val elapsedMs = now - startTime
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
        serviceScope.launch {
            try {
                val tDist = targetDistance ?: return@launch
                val tTime = targetTime ?: return@launch
                
                // Build the coaching update with pace-specific data
                val update = PhaseCoachingUpdate(
                    phase = _currentRunSession.value?.phase?.name ?: "STEADY",
                    distance = totalDistance / 1000.0, // km
                    targetDistance = tDist,
                    elapsedTime = System.currentTimeMillis() - startTime,
                    currentPace = currentPace,
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
                    activityType = "run",
                    hasRoute = hasRoute,
                    targetTime = (tTime / 1000).toInt(),
                    targetPace = formatPace(targetPaceSecondsPerKm),
                    triggerType = if (isAbandoning) "pace_abandon" else "pace_coaching",
                    // Pace-specific fields
                    paceDeviationPercent = paceDeviation * 100,
                    rollingPaceDeviationPercent = rollingPaceDeviation * 100,
                    projectedFinishSeconds = projectedFinishSeconds,
                    currentAvgPaceSecondsPerKm = currentAvgPace,
                    rollingPaceSecondsPerKm = rollingPace,
                    progressPercent = progressFraction * 100
                )
                
                Log.d("PaceCoaching", "Requesting LLM pace coaching: triggerType=${update.triggerType}, " +
                        "deviation=${String.format("%.1f", paceDeviation * 100)}%, " +
                        "abandoning=$isAbandoning")
                
                val response = apiService.getPhaseCoaching(update)
                Log.d("PaceCoaching", "LLM response: ${response.message.take(80)}...")
                
                // Play via the standard coaching audio pipeline
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
        if (secondsPerKm <= 0 || secondsPerKm > 3600) return "0:00"
        val minutes = (secondsPerKm / 60).toInt()
        val seconds = (secondsPerKm % 60).toInt()
        return String.format("%d:%02d", minutes, seconds)
    }
    
    // ==================== STRIDE ANALYSIS (shared by all coaching triggers) ====================

    data class StrideSnapshot(
        val cadence: Int,
        val strideLength: Double, // metres
        val strideZone: String, // "OPTIMAL", "OVERSTRIDING", "UNDERSTRIDING"
        val optimalMin: Double,
        val optimalMax: Double,
        val terrainContext: String, // "flat", "uphill", "downhill"
        val isFatigued: Boolean
    )

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

        val strideLength = currentSpeed / (currentCadence / 60.0)
        recentStrideLengths.add(strideLength)
        if (recentStrideLengths.size > 30) recentStrideLengths.removeAt(0)

        // Height-based optimal stride range (or use default 1.70m)
        val heightM = (currentUser?.height?.toDouble() ?: 170.0) / 100.0
        val optimalMin = heightM * 0.35
        val optimalMax = heightM * 0.45

        // Terrain context
        val grade = calculateAverageGradient().toDouble()
        val terrain = when {
            grade > UPHILL_GRADE_THRESHOLD -> "uphill"
            grade < DOWNHILL_GRADE_THRESHOLD -> "downhill"
            else -> "flat"
        }

        // Stride zone with terrain adjustment
        val zone = when {
            terrain == "uphill" -> "OPTIMAL" // Shorter strides uphill are natural
            strideLength > heightM * 0.50 -> "OVERSTRIDING"
            strideLength > optimalMax -> "OVERSTRIDING"
            currentCadence < 155 && terrain == "flat" -> "UNDERSTRIDING"
            currentCadence < 160 && terrain == "flat" && currentSpeed > 2.78 -> "UNDERSTRIDING" // faster than 6:00/km
            else -> "OPTIMAL"
        }

        // Fatigue detection: cadence drops > 8 spm from baseline on flat terrain
        val isFatigued = baselineCadence > 0 && terrain == "flat" && (baselineCadence - currentCadence) > 8

        // Build baseline from first 2km
        if (totalDistance < 2000 && currentCadence > 0) {
            baselineCadence = if (cadenceSamplesForBaseline == 0) currentCadence
            else ((baselineCadence.toLong() * cadenceSamplesForBaseline + currentCadence) / (cadenceSamplesForBaseline + 1)).toInt()
            cadenceSamplesForBaseline++
        }

        return StrideSnapshot(currentCadence, strideLength, zone, optimalMin, optimalMax, terrain, isFatigued)
    }

    private fun requestLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.e("RunTrackingService", "Location permission not granted - stopping service")
            stopSelf()
            return
        }
        try {
            val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_UPDATE_INTERVAL).apply { setMinUpdateIntervalMillis(LOCATION_FASTEST_INTERVAL); setWaitForAccurateLocation(true) }.build()
            fusedLocationClient.requestLocationUpdates(req, locationCallback, Looper.getMainLooper())
            Log.d("RunTrackingService", "Location updates requested successfully")
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

        val newPoint = LocationPoint(
            latitude = location.latitude,
            longitude = location.longitude,
            timestamp = location.time,
            speed = location.speed.takeIf { it > 0 }, // Store speed if positive (works for both real GPS and simulation)
            altitude = location.altitude.takeIf { location.hasAltitude() },
            heartRate = null,
            bearing = location.bearing.takeIf { location.hasBearing() },
            cadence = currentCadence.takeIf { it > 0 }
        )

        if (routePoints.isNotEmpty()) {
            val prevPoint = routePoints.last()
            val distanceIncrement = calculateDistance(prevPoint, newPoint)

            // Log location info for debugging
            Log.d("RunTrackingService", "Location update - accuracy: ${location.accuracy}m, speed: ${location.speed}m/s, distance: ${distanceIncrement}m")

            // Accept location if accuracy is reasonable OR if we're still in the first few locations (to get started)
            // Only count distance increments >= 5m to filter GPS drift
            val isFirstLocations = routePoints.size < 5
            if ((location.accuracy < 20f || isFirstLocations) && distanceIncrement >= 5.0) {
                // Calculate pace from our own distance/time (more reliable than GPS speed which can be noisy/wrong)
                val timeSinceLastPoint = (newPoint.timestamp - prevPoint.timestamp) / 1000.0 // seconds
                val currentPaceSeconds = if (timeSinceLastPoint > 0 && distanceIncrement > 0) {
                    (1000.0 * timeSinceLastPoint / distanceIncrement).toFloat() // seconds per km
                } else 0f
                
                // Update current real-time pace (convert from seconds/km to pace string)
                currentPace = if (currentPaceSeconds > 0 && currentPaceSeconds < 3600) { // sanity check: < 60 min/km
                    val minutes = (currentPaceSeconds / 60).toInt()
                    val seconds = (currentPaceSeconds % 60).toInt()
                    String.format("%d:%02d", minutes, seconds)
                } else {
                    "0:00"
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
                    val elevChange = newPoint.altitude - prevPoint.altitude
                    if (elevChange > 0) totalElevationGain += elevChange else totalElevationLoss += abs(elevChange)
                    
                    // Smooth altitude for elevation coaching (reduces GPS noise)
                    recentAltitudes.add(newPoint.altitude)
                    if (recentAltitudes.size > ALTITUDE_SMOOTHING_WINDOW) recentAltitudes.removeAt(0)
                    val prevSmoothed = smoothedAltitude
                    smoothedAltitude = recentAltitudes.average()
                    
                    // Use smoothed altitude difference for elevation coaching (only when running a route)
                    if (hasRoute && prevSmoothed != null && recentAltitudes.size >= ALTITUDE_SMOOTHING_WINDOW) {
                        val smoothedElevChange = smoothedAltitude!! - prevSmoothed
                        val smoothedGradePercent = (smoothedElevChange / distanceIncrement) * 100
                        updateElevationCoaching(distanceIncrement, smoothedGradePercent, smoothedElevChange)
                    }
                }
                routePoints.add(newPoint)
                if (location.speed > maxSpeed) maxSpeed = location.speed
                
                updatePaceAndStruggle(currentPaceSeconds)
                checkForKmSplit()
                // Check navigation progress (turn instructions, missed waypoints)
                if (hasRoute) {
                    checkNavigationProgress(location.latitude, location.longitude)
                }
                // Pace coaching — smart interval checks against target pace
                checkPaceCoaching()
                updateRunSession()
                updateNotification()
            }
        } else {
            routePoints.add(newPoint)
        }
    }
    
    private fun updatePaceAndStruggle(currentPaceSeconds: Float) {
        // Update baseline (session average pace) every 500m after the first 1km
        if (totalDistance >= 1000 && (totalDistance - lastBaselineUpdateDistance) >= 500) {
            val elapsedSeconds = (System.currentTimeMillis() - startTime) / 1000.0
            if (elapsedSeconds > 0 && totalDistance > 0) {
                baselinePace = (elapsedSeconds / (totalDistance / 1000.0)).toFloat() // seconds per km
                lastBaselineUpdateDistance = totalDistance
            }
        }
        
        if (baselinePace > 0f) {
            val paceDropPercent = (currentPaceSeconds - baselinePace) / baselinePace * 100
            val now = System.currentTimeMillis()
            if (paceDropPercent > 20 && (now - lastStruggleTriggerTime) > STRUGGLE_COOLDOWN_MS) {
                isStruggling = true
                lastStruggleTriggerTime = now
                triggerStruggleCoaching(currentPaceSeconds, paceDropPercent) // Trigger AI coaching for struggle
            } else {
                isStruggling = false
            }
        }
    }

    private fun checkForKmSplit() {
        val currentKm = (totalDistance / 1000).toInt()
        if (currentKm > lastKmSplit) {
            val now = System.currentTimeMillis()
            val splitTime = now - lastSplitTime
            val splitSpeedKmh = (1000f / (splitTime / 1000f)) * 3.6f // m/s → km/h
            val split = KmSplit(km = currentKm, time = splitTime, pace = calculatePace(splitSpeedKmh))
            kmSplits.add(split)
            lastKmSplit = currentKm
            lastSplitTime = now
            Log.d("RunTrackingService", "Reached ${currentKm}km split")
            
            // Only trigger AI coaching at the user's chosen interval (1km, 2km, 3km, 5km, 10km)
            val interval = coachingFeaturePrefs.kmSplitIntervalKm
            if (currentKm % interval == 0) {
                Log.d("RunTrackingService", "Triggering split coaching at ${currentKm}km (interval: every ${interval}km)")
                hasCoachingFiredThisTick = true
                triggerKmSplitCoaching(split)
            }
        }
    }

    private fun calculateDistance(p1: LocationPoint, p2: LocationPoint): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(p2.latitude - p1.latitude)
        val dLon = Math.toRadians(p2.longitude - p1.longitude)
        val a = sin(dLat / 2) * sin(dLat / 2) + cos(Math.toRadians(p1.latitude)) * cos(Math.toRadians(p2.latitude)) * sin(dLon / 2) * sin(dLon / 2)
        return r * (2 * atan2(sqrt(a), sqrt(1 - a)))
    }

    private fun updateRunSession() {
        val duration = System.currentTimeMillis() - startTime
        
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
        
        val phase = determinePhase(displayDistance / 1000.0, targetDistance)
        
        // Reset per-tick flag - only one coaching trigger fires per location update
        hasCoachingFiredThisTick = false

        // Check for phase changes and trigger coaching (includes 500m check-in)
        checkPhaseChange(phase)

        // Check for 500m milestones (skipped if phase change just fired)
        if (!hasCoachingFiredThisTick) {
            check500mMilestones()
        }

        // Check for heart rate coaching
        if (!hasCoachingFiredThisTick) {
            maybeTriggerHeartRateCoaching()
        }

        // Check for cadence/stride coaching
        if (!hasCoachingFiredThisTick) {
            maybeTriggerCadenceCoaching()
        }

        // Elite coaching triggers — technique, milestones, reinforcement, ETA, trends, elevation
        if (!hasCoachingFiredThisTick) {
            maybeFireEliteCoaching(displayDistance, duration, avgSpeed, phase)
        }
        
        _currentRunSession.value = RunSession(
            id = UUID.randomUUID().toString(),
            startTime = startTime,
            endTime = null,
            duration = duration,
            distance = displayDistance,
            averageSpeed = avgSpeed,
            maxSpeed = if (hasMovedEnough) maxSpeed else 0f,
            averagePace = calculatePace(avgSpeed),
            currentPace = currentPace,
            calories = calculateCalories(displayDistance, duration),
            cadence = if (cadenceCount > 0) (cadenceSum / cadenceCount).toInt() else currentCadence,
            heartRate = currentHeartRate,
            routePoints = routePoints.toList(),
            kmSplits = kmSplits.toList(),
            isStruggling = isStruggling,
            phase = phase,
            weatherAtStart = weatherAtStart,
            weatherAtEnd = null,
            totalElevationGain = if (hasMovedEnough) totalElevationGain else 0.0,
            totalElevationLoss = if (hasMovedEnough) totalElevationLoss else 0.0,
            averageGradient = if (hasMovedEnough) calculateAverageGradient() else 0f,
            maxGradient = if (hasMovedEnough) calculateMaxGradient() else 0f,
            terrainType = if (hasMovedEnough) determineTerrainType(calculateAverageGradient()) else TerrainType.FLAT,
            routeHash = generateRouteHash(),
            routeName = null,
            externalSource = null, // Not synced from external source
            externalId = null,
            isActive = true,
            aiCoachingNotes = coachingHistory.toList(),
            strugglePoints = strugglePointsList.toList(),
            targetDistance = targetDistance,
            targetTime = targetTime,
            wasTargetAchieved = calculateWasTargetAchieved(),
            maxCadence = maxCadenceValue.takeIf { it > 0 }
        )
    }
    
    private fun calculateAverageGradient(): Float = if (totalDistance == 0.0) 0f else ((totalElevationGain - totalElevationLoss) / totalDistance * 100).toFloat()
    
    private fun calculateMaxGradient(): Float = (1 until routePoints.size).mapNotNull { i-> val p1=routePoints[i-1]; val p2=routePoints[i]; if(p1.altitude!=null&&p2.altitude!=null) { val d=calculateDistance(p1,p2); if(d>0) ((p2.altitude-p1.altitude)/d * 100).toFloat() else null } else null }.maxOrNull() ?: 0f
    
    private fun determineTerrainType(avgGradient: Float): TerrainType = when { abs(avgGradient) < 2f -> TerrainType.FLAT; abs(avgGradient) < 5f -> TerrainType.ROLLING; abs(avgGradient) < 10f -> TerrainType.HILLY; else -> TerrainType.MOUNTAINOUS }
    
    private fun generateRouteHash(): String = MessageDigest.getInstance("MD5").digest(routePoints.joinToString(",") { "${String.format("%.4f", it.latitude)},${String.format("%.4f", it.longitude)}" }.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun calculatePace(speedKmh: Float): String = if (speedKmh <= 0) "0:00" else {
        val paceMinPerKm = 60.0 / speedKmh
        val minutes = paceMinPerKm.toInt()
        val seconds = ((paceMinPerKm - minutes) * 60).toInt()
        "${minutes}:${String.format("%02d", seconds)}"
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

    private fun updateNotification() { val s = _currentRunSession.value; notificationManager.notify(NOTIFICATION_ID, createNotification("Run in progress", String.format("D: %.2f km | P: %s/km | T: %s", s?.getDistanceInKm()?:0.0, s?.averagePace?:"0:00", s?.getFormattedDuration()?:"00:00"))) }

    private fun calculateWasTargetAchieved(): Boolean? {
        if (targetDistance == null && targetTime == null) return null
        
        val achievedDistance = (targetDistance != null && totalDistance / 1000.0 >= targetDistance!! - 0.1) // Allow 10% margin
        val achievedTime = (targetTime != null && (System.currentTimeMillis() - startTime) <= targetTime!!)
        
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
        stopTimer()  // Stop timer when paused
        fusedLocationClient.removeLocationUpdates(locationCallback)
        sensorManager.unregisterListener(this)
        updateNotification()
    }

    private fun resumeTracking() { 
        isTracking = true
        startTimer()  // Restart timer when resuming
        requestLocationUpdates()
        startSensorTracking()
    }

    private fun stopTracking() {
        isTracking = false
        isSimulating = false
        _isServiceRunning.value = false
        
        // Stop GPS, sensors, and timer
        fusedLocationClient.removeLocationUpdates(locationCallback)
        sensorManager.unregisterListener(this)
        stopTimer()
        
        Log.d("RunTrackingService", "Stopped all tracking")
        
        // Create a separate coroutine scope that won't be cancelled immediately
        val uploadScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        
        uploadScope.launch {
            coroutineScope {
                try {
                    // Get end weather and finalize run
                    weatherAtEnd = weatherRepository.getCurrentWeather()
                    _currentRunSession.value?.let { session ->
                        val finalSession = session.copy(
                            endTime = System.currentTimeMillis(),
                            weatherAtEnd = weatherAtEnd,
                            isActive = false
                        )
                        _currentRunSession.value = finalSession
                        
                        // Upload run to backend (this will set _uploadComplete when done)
                        uploadRunToBackend(finalSession)
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
    
    private suspend fun uploadRunToBackend(runSession: RunSession) {
        val uploadRequest = UploadRunRequest(
            routeId = null, // TODO: Add if user selected a saved route
            startTime = runSession.startTime,
            distance = runSession.distance,
            duration = runSession.duration,
            avgPace = runSession.averagePace ?: "0:00",
            avgHeartRate = if (runSession.heartRate > 0) runSession.heartRate else null,
            maxHeartRate = null, // TODO: Track max HR
            minHeartRate = null, // TODO: Track min HR
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
            terrainType = runSession.terrainType.name.lowercase(),
            userComments = null,
            // Run goals - target tracking
            targetDistance = targetDistance,
            targetTime = targetTime,
            wasTargetAchieved = calculateWasTargetAchieved(),
            // Struggle points detected during the run
            strugglePoints = runSession.strugglePoints,
            // AI coaching notes from the run
            aiCoachingNotes = runSession.aiCoachingNotes.ifEmpty { null }
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

        // All retries exhausted - fall back to local ID
        Log.e("RunTrackingService", "Upload failed after $maxRetries retries, using local ID", lastException)
        _uploadComplete.value = runSession.id
    }

    /**
     * Auto-upload run to Garmin Connect if user has auto-sync enabled
     * Silent background operation - doesn't interrupt user if it fails
     */
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
            
            // Upload to Garmin in background
            Log.d("GarminSync", "Auto-uploading run $runId to Garmin Connect...")
            val response = apiService.uploadRunToGarmin(
                GarminUploadRequest(runId)
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
        return NotificationCompat.Builder(this, CHANNEL_ID).setContentTitle(title).setContentText(content).setSmallIcon(R.drawable.icon_running).setContentIntent(pIntent).setOngoing(true).setCategory(NotificationCompat.CATEGORY_WORKOUT).setPriority(NotificationCompat.PRIORITY_LOW).build()
    }

    private fun releaseWakeLock() { wakeLock?.takeIf{it.isHeld}?.release(); wakeLock=null }

    override fun onDestroy() {
        super.onDestroy()
        releaseWakeLock()
        stopTimer()  // Stop the periodic timer
        fusedLocationClient.removeLocationUpdates(locationCallback)
        sensorManager.unregisterListener(this)
        textToSpeechHelper.destroy() // Clean up Android TTS
        audioPlayerHelper.destroy() // Clean up OpenAI TTS audio player
        CoachingAudioQueue.stopAll() // Stop any queued coaching audio
        _latestCoachingText.value = null
        serviceScope.cancel()
        Log.d("RunTrackingService", "Service destroyed")
    }
    
    /**
     * Play coaching audio using OpenAI TTS if available, otherwise fall back to Android TTS
     */
    private fun playCoachingAudio(base64Audio: String?, format: String?, fallbackText: String) {
        // Broadcast text to UI
        _latestCoachingText.value = fallbackText

        // Enqueue via shared audio queue (prevents overlap with other coaching)
        CoachingAudioQueue.enqueue(
            context = this,
            base64Audio = base64Audio,
            format = format,
            fallbackText = fallbackText,
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
    
    private fun check500mMilestones() {
        if (!coachingFeaturePrefs.halfKmCheckInEnabled) return
        val current500m = (totalDistance / 500).toInt()
        // Only trigger the 500m summary once, at the first 0.5km mark.
        // Also check cooldown to prevent duplicate coaching events
        val now = System.currentTimeMillis()
        if (last500mMilestone == 0 && current500m >= 1 && (now - lastCoachingTime) > COACHING_COOLDOWN_MS) {
            last500mMilestone = 1
            lastCoachingTime = now
            Log.d("RunTrackingService", "Reached 500m - triggering initial coaching (targetTime=$targetTime, targetDistance=$targetDistance)")
            serviceScope.launch {
                try {
                    // Calculate target pace from target time and distance if available
                    val targetPaceStr = if (targetTime != null && targetDistance != null && targetDistance!! > 0) {
                        val totalSeconds = targetTime!! / 1000
                        val paceSecondsPerKm = totalSeconds / targetDistance!!
                        val paceMin = (paceSecondsPerKm / 60).toInt()
                        val paceSec = (paceSecondsPerKm % 60).toInt()
                        "$paceMin:${paceSec.toString().padStart(2, '0')}"
                    } else null

                    val update = PhaseCoachingUpdate(
                        phase = _currentRunSession.value?.phase?.name ?: "STEADY",
                        distance = totalDistance / 1000.0,
                        targetDistance = targetDistance,
                        elapsedTime = System.currentTimeMillis() - startTime,
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
                        runnerAge = currentUser?.age,
                    runnerWeight = currentUser?.weight,
                    runnerHeight = currentUser?.height,
                        activityType = "run",
                        hasRoute = hasRoute,
                        targetTime = targetTime?.let { (it / 1000).toInt() },
                        targetPace = targetPaceStr,
                        triggerType = "500m_checkin"
                    )
                    val response = apiService.getPhaseCoaching(update)
                    coachingHistory.add(AiCoachingNote(
                        time = System.currentTimeMillis() - startTime,
                        message = "500m: ${response.message}"
                    ))
                    Log.d("RunTrackingService", "500m coaching response: ${response.message}")

                    // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
                } catch (e: Exception) {
                    Log.e("RunTrackingService", "Failed to get 500m coaching", e)
                }
            }
        }
    }
    
    private fun checkPhaseChange(newPhase: CoachingPhase) {
        if (!coachingFeaturePrefs.motivationalCoachingEnabled) return
        val now = System.currentTimeMillis()
        // Allow trigger when:
        // 1. Phase changed AND (first phase OR cooldown passed)
        // This ensures first phase change (null -> EARLY) triggers coaching
        if (newPhase != lastPhase && (lastPhase == null || (now - lastCoachingTime) > COACHING_COOLDOWN_MS)) {
            lastPhase = newPhase
            lastCoachingTime = now
            Log.d("RunTrackingService", "Phase changed to $newPhase at ${totalDistance/1000.0}km - triggering coaching")
            serviceScope.launch {
                try {
                    // Calculate target pace from target time and distance if available
                    val phaseTargetPaceStr = if (targetTime != null && targetDistance != null && targetDistance!! > 0) {
                        val totalSeconds = targetTime!! / 1000
                        val paceSecondsPerKm = totalSeconds / targetDistance!!
                        val paceMin = (paceSecondsPerKm / 60).toInt()
                        val paceSec = (paceSecondsPerKm % 60).toInt()
                        "$paceMin:${paceSec.toString().padStart(2, '0')}"
                    } else null

                    val update = PhaseCoachingUpdate(
                        phase = newPhase.name,
                        distance = totalDistance / 1000.0,
                        targetDistance = targetDistance,
                        elapsedTime = System.currentTimeMillis() - startTime,
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
                        runnerAge = currentUser?.age,
                    runnerWeight = currentUser?.weight,
                    runnerHeight = currentUser?.height,
                        activityType = "run",
                        hasRoute = hasRoute,
                        targetTime = targetTime?.let { (it / 1000).toInt() },
                        targetPace = phaseTargetPaceStr,
                        triggerType = "phase_change"
                    )
                    val response = apiService.getPhaseCoaching(update)
                    coachingHistory.add(AiCoachingNote(
                        time = System.currentTimeMillis() - startTime,
                        message = "Phase change: ${response.message}"
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
            timestamp = System.currentTimeMillis() - startTime,
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
                    elapsedTime = System.currentTimeMillis() - startTime,
                    currentPace = currentPaceFormatted,
                    baselinePace = baselinePaceFormatted,
                    paceDropPercent = paceDropPercent.toDouble(),
                    currentGrade = calculateAverageGradient().toDouble(),
                    totalElevationGain = totalElevationGain,
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    hasRoute = hasRoute
                )
                val response = apiService.getStruggleCoaching(update)
                // Note: Struggle point already added above before launching coroutine
                coachingHistory.add(AiCoachingNote(
                    time = System.currentTimeMillis() - startTime,
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
                val update = PaceUpdate(
                    distance = totalDistance / 1000.0,
                    targetDistance = targetDistance,
                    currentPace = split.pace,
                    elapsedTime = System.currentTimeMillis() - startTime,
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    isSplit = true,
                    splitKm = split.km,
                    splitPace = split.pace,
                    currentGrade = calculateAverageGradient().toDouble(),
                    totalElevationGain = totalElevationGain,
                    isOnHill = abs(calculateAverageGradient()) > 3f,
                    kmSplits = kmSplits.toList(),
                    hasRoute = hasRoute
                )
                val response = apiService.getPaceUpdate(update)
                coachingHistory.add(AiCoachingNote(
                    time = System.currentTimeMillis() - startTime,
                    message = "Km ${split.km}: ${response.message}"
                ))
                Log.d("RunTrackingService", "Km ${split.km} split coaching: ${response.message}")

                // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                if (!isMuted) {
                    playCoachingAudio(response.audio, response.format, response.message)
                }
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to get km split coaching", e)
            }
        }
    }

    private fun maybeTriggerHeartRateCoaching() {
        if (!coachingFeaturePrefs.heartRateCoachingEnabled) return
        if (currentHeartRate <= 0) return
        val now = System.currentTimeMillis()
        val elapsedMinutes = ((now - startTime) / 60000).toInt()
        if (elapsedMinutes <= 0) return
        if (elapsedMinutes % 3 != 0) return
        if (elapsedMinutes == lastHrCoachingMinute) return
        if (now - lastHrCoachingTime < HR_COOLDOWN_MS) return

        val avgHr = if (hrCount > 0) (hrSum / hrCount).toInt() else currentHeartRate
        val maxHrValue = maxHr.takeIf { it > 0 } ?: currentHeartRate

        lastHrCoachingTime = now
        lastHrCoachingMinute = elapsedMinutes

        serviceScope.launch {
            try {
                val request = HeartRateCoachingRequest(
                    currentHR = currentHeartRate,
                    avgHR = avgHr,
                    maxHR = maxHrValue,
                    targetZone = 0, // Unknown; backend should avoid assumptions
                    elapsedMinutes = elapsedMinutes,
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone
                )
                val response = apiService.getHeartRateCoaching(request)
                coachingHistory.add(AiCoachingNote(
                    time = System.currentTimeMillis() - startTime,
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
        if (currentCadence <= 0) return
        if (totalDistance < 1000) return // Need at least 1km of data

        val stride = getCurrentStrideAnalysis() ?: return
        val now = System.currentTimeMillis()
        val CADENCE_COOLDOWN_MS = 120_000L // 2 minutes

        // Determine if we should fire cadence coaching - ONLY ONCE per run (first time non-optimal stride detected)
        val shouldFire = !hasCadenceCoachingFired && stride.strideZone != "OPTIMAL"

        if (!shouldFire) return
        if ((now - lastCadenceCoachingTime) < CADENCE_COOLDOWN_MS) return
        if ((now - lastCoachingTime) < COACHING_COOLDOWN_MS) return

        hasCadenceCoachingFired = true
        lastCadenceCoachingTime = now
        lastCoachingTime = now
        lastStrideZone = stride.strideZone
        hasCoachingFiredThisTick = true

        serviceScope.launch {
            try {
                val request = CadenceCoachingRequest(
                    cadence = stride.cadence,
                    strideLength = stride.strideLength,
                    strideZone = stride.strideZone,
                    currentPace = currentPace,
                    speed = if (routePoints.size >= 2) {
                        val last = routePoints.last()
                        val prev = routePoints[routePoints.size - 2]
                        val dt = (last.timestamp - prev.timestamp) / 1000.0
                        if (dt > 0) calculateDistance(prev, last) / dt else 0.0
                    } else 0.0,
                    distance = totalDistance / 1000.0,
                    elapsedTime = System.currentTimeMillis() - startTime,
                    heartRate = if (currentHeartRate > 0) currentHeartRate else null,
                    userHeight = currentUser?.height?.let { it / 100.0 },
                    userWeight = currentUser?.weight?.toDouble(),
                    userAge = currentUser?.age,
                    optimalCadenceMin = 160,
                    optimalCadenceMax = 180,
                    optimalStrideLengthMin = stride.optimalMin,
                    optimalStrideLengthMax = stride.optimalMax,
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent
                )
                val response = apiService.getCadenceCoaching(request)
                coachingHistory.add(AiCoachingNote(
                    time = System.currentTimeMillis() - startTime,
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

    private fun maybeFireEliteCoaching(displayDistance: Double, duration: Long, avgSpeed: Float, phase: CoachingPhase) {
        if (!coachingFeaturePrefs.motivationalCoachingEnabled) return
        if (totalDistance < 1000) return // Need at least 1km of data
        val now = System.currentTimeMillis()

        val distKm = displayDistance / 1000.0
        val currentKm = distKm.toInt()
        val td = targetDistance
        val remainingMeters = if (td != null && td > 0) (td * 1000 - displayDistance) else null

        // FINAL 100m — highest priority, bypasses cooldowns (fires once)
        if (!hasFinal100mFired && remainingMeters != null && remainingMeters in 0.0..120.0) {
            hasFinal100mFired = true
            fireFinalCoaching("final_100m", distKm, duration, avgSpeed, remainingMeters)
            return
        }

        // FINAL 500m — very high priority, bypasses elite cooldown (fires once)
        if (!hasFinal500mFired && remainingMeters != null && remainingMeters in 0.0..550.0) {
            if ((now - lastCoachingTime) < 10_000L) return // minimal 10s gap only
            hasFinal500mFired = true
            fireFinalCoaching("final_500m", distKm, duration, avgSpeed, remainingMeters)
            return
        }

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
        if ((now - lastElevationInsightTime) < ELEVATION_INSIGHT_COOLDOWN_MS) return false
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

    private fun buildBaseEliteRequest(type: String, distKm: Double, duration: Long, avgSpeed: Float): EliteCoachingRequest {
        val elapsedSec = duration / 1000
        return EliteCoachingRequest(
            coachingType = type,
            distance = distKm,
            targetDistance = targetDistance,
            currentPace = currentPace,
            averagePace = calculatePace(avgSpeed),
            elapsedTime = elapsedSec,
            coachName = currentUser?.coachName,
            coachTone = currentUser?.coachTone,
            coachGender = currentUser?.coachGender,
            coachAccent = currentUser?.coachAccent,
            hasRoute = hasRoute,
            heartRate = if (currentHeartRate > 0) currentHeartRate else null,
            cadence = if (currentCadence > 0) currentCadence else null,
            currentGrade = calculateAverageGradient().toDouble(),
            totalElevationGain = totalElevationGain,
            totalElevationLoss = totalElevationLoss,
            targetTime = targetTime?.let { it / 1000 },
            targetPace = null, // TODO: pass if user has set one
            kmSplits = kmSplits.map { KmSplitBrief(it.km, it.pace) }
        )
    }

    private fun fireEliteCoaching(request: EliteCoachingRequest, label: String) {
        val now = System.currentTimeMillis()
        lastEliteCoachingTime = now
        lastCoachingTime = now
        hasCoachingFiredThisTick = true

        serviceScope.launch {
            try {
                val response = apiService.getEliteCoaching(request)
                if (response.message.isNotBlank()) {
                    coachingHistory.add(AiCoachingNote(
                        time = System.currentTimeMillis() - startTime,
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
        val td = targetDistance ?: 0.0
        val elapsedSec = duration / 1000.0
        val projectedFinishSec = if (distKm > 0) (elapsedSec / distKm * td).toLong() else null
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
        fireEliteCoaching(request, if (type == "final_100m") "Final 100m" else "Final 500m")
    }

    private fun fireMilestoneCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
        val td = targetDistance ?: return
        val pct = (distKm / td * 100).toInt()
        val milestone = when {
            pct >= 75 && lastMilestonePercent < 75 -> 75
            pct >= 50 && lastMilestonePercent < 50 -> 50
            pct >= 25 && lastMilestonePercent < 25 -> 25
            else -> return
        }
        lastMilestonePercent = milestone

        val request = buildBaseEliteRequest("milestone", distKm, duration, avgSpeed).copy(
            milestonePercent = milestone,
            projectedFinishTime = if (distKm > 0) ((duration / 1000.0) / distKm * td).toLong() else null
        )
        fireEliteCoaching(request, "${milestone}% Milestone")
    }

    private fun fireTargetEtaCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
        lastTargetEtaKm = distKm.toInt()
        val td = targetDistance ?: return
        val projectedSec = if (distKm > 0) ((duration / 1000.0) / distKm * td).toLong() else null

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

    @Suppress("UNUSED_PARAMETER")
    private fun fireTechniqueCoaching(distKm: Double, duration: Long, avgSpeed: Float, phase: CoachingPhase) {
        lastTechniqueCoachingTime = System.currentTimeMillis()
        val request = buildBaseEliteRequest("technique_form", distKm, duration, avgSpeed)
        fireEliteCoaching(request, "Technique")
    }

    private fun fireElevationInsightCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
        lastElevationInsightTime = System.currentTimeMillis()
        val request = buildBaseEliteRequest("elevation_insight", distKm, duration, avgSpeed)
        fireEliteCoaching(request, "Elevation")
    }

    private fun updateElevationCoaching(distanceIncrement: Double, gradePercent: Double, elevationChange: Double) {
        if (!coachingFeaturePrefs.elevationCoachingEnabled) return
        val now = System.currentTimeMillis()
        val direction = when {
            gradePercent >= UPHILL_GRADE_THRESHOLD -> 1
            gradePercent <= DOWNHILL_GRADE_THRESHOLD -> -1
            else -> 0
        }

        if (direction == slopeDirection) {
            slopeDistanceMeters += distanceIncrement
            // Track actual elevation gained/lost in this slope segment
            if (elevationChange > 0) slopeElevationGain += elevationChange
            if (elevationChange < 0) slopeElevationLoss += abs(elevationChange)
        } else {
            // Hill-top acknowledgement when leaving a sustained uphill
            // Only fires if the runner actually climbed a meaningful amount
            if (slopeDirection == 1 &&
                slopeDistanceMeters >= HILL_TOP_MIN_DISTANCE_M &&
                slopeElevationGain >= HILL_TOP_MIN_GAIN_M &&
                now - lastHillTopAckTime > HILL_TOP_COOLDOWN_MS
            ) {
                Log.d("ElevationCoaching", "Hill top: climbed ${slopeElevationGain.toInt()}m over ${slopeDistanceMeters.toInt()}m")
                triggerElevationCoaching("hill_top", gradePercent, slopeDistanceMeters)
                lastHillTopAckTime = now
            }
            // Reset slope tracking for new direction
            slopeDirection = direction
            slopeDistanceMeters = distanceIncrement
            slopeElevationGain = if (elevationChange > 0) elevationChange else 0.0
            slopeElevationLoss = if (elevationChange < 0) abs(elevationChange) else 0.0
        }

        // Cooldown check
        if (now - lastElevationCoachingTime < ELEVATION_COOLDOWN_MS) return

        // UPHILL coaching: sustained steep climb with meaningful elevation gain
        if (direction == 1 &&
            gradePercent >= STEEP_UPHILL_GRADE_THRESHOLD &&
            slopeDistanceMeters >= UPHILL_MIN_DISTANCE_M &&
            slopeElevationGain >= MIN_ELEVATION_GAIN_M
        ) {
            Log.d("ElevationCoaching", "Uphill trigger: ${gradePercent.toInt()}% grade, ${slopeElevationGain.toInt()}m gained over ${slopeDistanceMeters.toInt()}m")
            lastElevationCoachingTime = now
            triggerElevationCoaching("uphill", gradePercent, slopeDistanceMeters)
        }
        // DOWNHILL coaching: sustained steep descent with meaningful elevation loss
        else if (direction == -1 &&
            gradePercent <= STEEP_DOWNHILL_GRADE_THRESHOLD &&
            slopeDistanceMeters >= DOWNHILL_MIN_DISTANCE_M &&
            slopeElevationLoss >= MIN_ELEVATION_LOSS_M
        ) {
            val remainingDistanceKm = targetDistance?.let { it - (totalDistance / 1000.0) }
            if (!downhillFinishTriggered &&
                hasRoute &&
                remainingDistanceKm != null &&
                remainingDistanceKm <= DOWNHILL_FINISH_DISTANCE_KM
            ) {
                downhillFinishTriggered = true
                lastElevationCoachingTime = now
                Log.d("ElevationCoaching", "Downhill finish trigger: ${slopeElevationLoss.toInt()}m lost, ${remainingDistanceKm}km to go")
                triggerElevationCoaching("downhill_finish", gradePercent, slopeDistanceMeters)
                return
            }
            Log.d("ElevationCoaching", "Downhill trigger: ${gradePercent.toInt()}% grade, ${slopeElevationLoss.toInt()}m lost over ${slopeDistanceMeters.toInt()}m")
            lastElevationCoachingTime = now
            triggerElevationCoaching("downhill", gradePercent, slopeDistanceMeters)
        }

        // FLAT TERRAIN coaching: on flat/undulating routes, give terrain-aware insights
        // every 2km after the first 2km (when there's enough data to analyze)
        val currentKm = (totalDistance / 1000).toInt()
        if (direction == 0 && currentKm >= 2 && currentKm - lastFlatTerrainCoachingKm >= 2
            && now - lastElevationCoachingTime >= ELEVATION_COOLDOWN_MS
        ) {
            val distKm = totalDistance / 1000.0
            val elevPerKm = if (distKm > 0.5) totalElevationGain / distKm else 0.0
            // Only fire for genuinely flat/undulating routes (< 15m gain/km)
            if (elevPerKm < 15) {
                lastFlatTerrainCoachingKm = currentKm
                lastElevationCoachingTime = now
                Log.d("ElevationCoaching", "Flat terrain insight at ${currentKm}km: ${elevPerKm.toInt()}m/km elevation")
                triggerElevationCoaching("flat_terrain", gradePercent, totalDistance)
            }
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

                val avgSpeed = if (totalDistance > 0 && (System.currentTimeMillis() - startTime) > 0) {
                    (totalDistance / ((System.currentTimeMillis() - startTime) / 1000.0)).toFloat()
                } else 0f

                val request = ElevationCoachingRequest(
                    eventType = eventType,
                    distance = distKm,
                    elapsedTime = System.currentTimeMillis() - startTime,
                    currentGrade = gradePercent,
                    segmentDistanceMeters = segmentDistanceMeters,
                    totalElevationGain = totalElevationGain,
                    totalElevationLoss = totalElevationLoss,
                    hasRoute = hasRoute,
                    coachName = currentUser?.coachName,
                    coachTone = currentUser?.coachTone,
                    coachGender = currentUser?.coachGender,
                    coachAccent = currentUser?.coachAccent,
                    activityType = "run",
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
                    isNegativeSplitting = isNegSplit
                )
                val response = apiService.getElevationCoaching(request)
                coachingHistory.add(AiCoachingNote(
                    time = System.currentTimeMillis() - startTime,
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
            Sensor.TYPE_HEART_RATE -> {
                val hr = event.values[0].toInt()
                if (hr > 0) {
                    currentHeartRate = hr
                    hrSum += hr
                    hrCount += 1
                    if (hr > maxHr) maxHr = hr
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
