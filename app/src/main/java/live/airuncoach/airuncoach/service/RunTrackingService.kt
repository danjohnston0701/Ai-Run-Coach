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
import live.airuncoach.airuncoach.utils.RunSimulator
import live.airuncoach.airuncoach.utils.TextToSpeechHelper
import live.airuncoach.airuncoach.utils.AudioPlayerHelper
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.domain.model.StrugglePoint
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
    
    // Struggle detection
    private var baselinePace: Float = 0f
    private val paceHistory = ArrayList<Float>()
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

    // Simulation mode
    private var isSimulating = false
    
    // Speed-based average (for simulation where wall-clock time is compressed)
    private var speedReadingSum: Double = 0.0
    private var speedReadingCount: Int = 0
    
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
        
        // Initialize session manager
        sessionManager = SessionManager(this)
        
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

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        targetDistance = intent?.getDoubleExtra(EXTRA_TARGET_DISTANCE, 0.0)?.takeIf { it > 0 }
        targetTime = intent?.getLongExtra(EXTRA_TARGET_TIME, 0)?.takeIf { it > 0 }
        hasRoute = intent?.getBooleanExtra(EXTRA_HAS_ROUTE, false) == true

        when (intent?.action) {
            ACTION_START_TRACKING -> startTracking()
            ACTION_STOP_TRACKING -> stopTracking()
            ACTION_PAUSE_TRACKING -> pauseTracking()
            ACTION_RESUME_TRACKING -> resumeTracking()
            ACTION_START_SIMULATION -> startSimulation()
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
        currentHeartRate = 0
        initialStepCount = -1
        lastStepTimestamp = 0
        baselinePace = 0f
        paceHistory.clear()
        hasCadenceCoachingFired = false
        lastCadenceCoachingTime = 0
        lastStrideZone = "OPTIMAL"
        baselineCadence = 0
        cadenceSamplesForBaseline = 0
        recentStrideLengths.clear()
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
            bearing = location.bearing.takeIf { location.hasBearing() }
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
                updateRunSession()
                updateNotification()
            }
        } else {
            routePoints.add(newPoint)
        }
    }
    
    private fun updatePaceAndStruggle(currentPaceSeconds: Float) {
        val currentGrade = routePoints.takeLast(2).let { if (it.size < 2 || it[0].altitude == null || it[1].altitude == null) 0.0 else (it[1].altitude!! - it[0].altitude!!) / calculateDistance(it[0], it[1]) * 100 }

        if (abs(currentGrade) < 2.0) { 
            paceHistory.add(currentPaceSeconds)
            if (paceHistory.size > 30) paceHistory.removeAt(0)
        }
        
        if (baselinePace == 0f && totalDistance > 1000 && totalDistance < 2000 && paceHistory.isNotEmpty()) {
            baselinePace = paceHistory.sorted()[paceHistory.size / 2]
        }
        
        if (baselinePace > 0f) {
            val paceDropPercent = (currentPaceSeconds - baselinePace) / baselinePace * 100
            val now = System.currentTimeMillis()
            if (paceDropPercent > 15 && (now - lastStruggleTriggerTime) > STRUGGLE_COOLDOWN_MS) {
                isStruggling = true
                lastStruggleTriggerTime = now
                triggerStruggleCoaching() // Trigger AI coaching for struggle
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
            Log.d("RunTrackingService", "Reached ${currentKm}km - triggering split coaching")
            // Mark coaching as fired so updateRunSession() won't trigger a duplicate
            // (e.g. phase change or 500m check-in at the same distance)
            hasCoachingFiredThisTick = true
            triggerKmSplitCoaching(split) // Trigger AI coaching for km split
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
            cadence = currentCadence,
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
            wasTargetAchieved = calculateWasTargetAchieved()
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
    
    private fun triggerStruggleCoaching() {
        val paceDropPercent = if (baselinePace > 0f) {
            ((_currentRunSession.value?.averageSpeed ?: 0f) - baselinePace) / baselinePace * 100.0
        } else 0.0
        
        // Add struggle point to the list for post-run summary
        val strugglePoint = StrugglePoint(
            id = UUID.randomUUID().toString(),
            timestamp = System.currentTimeMillis() - startTime,
            distanceMeters = totalDistance,
            paceAtStruggle = _currentRunSession.value?.averagePace ?: "0:00",
            baselinePace = calculatePace(baselinePace),
            paceDropPercent = paceDropPercent,
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
                    currentPace = _currentRunSession.value?.averagePace ?: "0:00",
                    baselinePace = calculatePace(baselinePace),
                    paceDropPercent = if (baselinePace > 0f) {
                        ((_currentRunSession.value?.averageSpeed ?: 0f) - baselinePace) / baselinePace * 100.0
                    } else 0.0,
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

    private fun updateElevationCoaching(distanceIncrement: Double, gradePercent: Double, elevationChange: Double) {
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
    }

    private fun triggerElevationCoaching(eventType: String, gradePercent: Double, segmentDistanceMeters: Double) {
        serviceScope.launch {
            try {
                val request = ElevationCoachingRequest(
                    eventType = eventType,
                    distance = totalDistance / 1000.0,
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
                    activityType = "run"
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
                if (tD > 2000) { currentCadence=(sD*60000/tD).toInt(); initialStepCount=steps; lastStepTimestamp=System.currentTimeMillis() }
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
