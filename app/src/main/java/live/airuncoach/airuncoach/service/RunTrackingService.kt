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
import live.airuncoach.airuncoach.utils.TextToSpeechHelper
import live.airuncoach.airuncoach.utils.AudioPlayerHelper
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.model.StrugglePoint
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
    private val coachingHistory = mutableListOf<String>() // Track what coaching has been given
    private var isMuted = false // User can mute coach
    
    // Run data
    private var targetDistance: Double? = null // For mapped runs
    private var targetTime: Long? = null     // For time-based goals (milliseconds)
    private val routePoints = mutableListOf<LocationPoint>()
    private val kmSplits = mutableListOf<KmSplit>()
    private var lastKmSplit = 0
    private var startTime: Long = 0
    private var lastSplitTime: Long = 0
    private var totalDistance: Double = 0.0
    private var maxSpeed: Float = 0f
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
        
        const val ACTION_START_TRACKING = "ACTION_START_TRACKING"
        const val ACTION_STOP_TRACKING = "ACTION_STOP_TRACKING"
        const val ACTION_PAUSE_TRACKING = "ACTION_PAUSE_TRACKING"
        const val ACTION_RESUME_TRACKING = "ACTION_RESUME_TRACKING"
        const val EXTRA_TARGET_DISTANCE = "EXTRA_TARGET_DISTANCE"
        const val EXTRA_TARGET_TIME = "EXTRA_TARGET_TIME"
        
        private val _currentRunSession = MutableStateFlow<RunSession?>(null)
        val currentRunSession: StateFlow<RunSession?> = _currentRunSession
        
        private val _isServiceRunning = MutableStateFlow(false)
        val isServiceRunning: StateFlow<Boolean> = _isServiceRunning
        
        private val _uploadComplete = MutableStateFlow<String?>(null) // Backend run ID when upload completes
        val uploadComplete: StateFlow<String?> = _uploadComplete
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        weatherRepository = WeatherRepository(this)
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
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

        when (intent?.action) {
            ACTION_START_TRACKING -> startTracking()
            ACTION_STOP_TRACKING -> stopTracking()
            ACTION_PAUSE_TRACKING -> pauseTracking()
            ACTION_RESUME_TRACKING -> resumeTracking()
        }
        return START_STICKY
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AiRunCoach::RunTrackingWakeLock").apply { acquire(10 * 60 * 60 * 1000L) }
    }

    private fun setupLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) { locationResult.lastLocation?.let { onNewLocation(it) } }
        }
    }

    private fun startTracking() {
        if (isTracking) {
            android.util.Log.w("RunTrackingService", "Already tracking, ignoring start request")
            return
        }

        android.util.Log.d("RunTrackingService", "Starting tracking...")
        
        // CRITICAL: Call startForeground IMMEDIATELY to avoid ANR
        try {
            startForeground(NOTIFICATION_ID, createNotification("Starting run...", "Initializing GPS"))
            android.util.Log.d("RunTrackingService", "Foreground service started successfully")
        } catch (e: Exception) {
            android.util.Log.e("RunTrackingService", "Failed to start foreground service", e)
            stopSelf()
            return
        }
        
        // Now safely initialize everything else
        isTracking = true
        _isServiceRunning.value = true
        startTime = System.currentTimeMillis()
        lastSplitTime = startTime
        routePoints.clear()
        kmSplits.clear()
        lastKmSplit = 0
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
        lastStruggleTriggerTime = 0
        isStruggling = false

        // Start location and sensors
        try {
            requestLocationUpdates()
            startSensorTracking()
            startTimer()  // Start independent timer
            android.util.Log.d("RunTrackingService", "Tracking: GPS, sensors, and timer started")
        } catch (e: Exception) {
            android.util.Log.e("RunTrackingService", "Failed to start sensors", e)
        }
        
        // Fetch weather in background (non-blocking)
        serviceScope.launch { 
            try {
                weatherAtStart = weatherRepository.getCurrentWeather()
                android.util.Log.d("RunTrackingService", "Weather fetched: $weatherAtStart")
            } catch (e: Exception) {
                android.util.Log.e("RunTrackingService", "Failed to fetch weather", e)
            }
        }
    }

    private fun requestLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            android.util.Log.e("RunTrackingService", "Location permission not granted - stopping service")
            stopSelf()
            return
        }
        try {
            val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_UPDATE_INTERVAL).apply { setMinUpdateIntervalMillis(LOCATION_FASTEST_INTERVAL); setWaitForAccurateLocation(true) }.build()
            fusedLocationClient.requestLocationUpdates(req, locationCallback, Looper.getMainLooper())
            android.util.Log.d("RunTrackingService", "Location updates requested successfully")
        } catch (e: Exception) {
            android.util.Log.e("RunTrackingService", "Failed to request location updates", e)
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
                        android.util.Log.d("RunTrackingService", "Step counter sensor registered")
                    } catch (e: Exception) {
                        android.util.Log.e("RunTrackingService", "Failed to register step counter", e)
                    }
                }
            } else {
                android.util.Log.w("RunTrackingService", "ACTIVITY_RECOGNITION permission not granted - skipping step counter")
            }
        }

        // Check BODY_SENSORS permission for heart rate (Android 6+)
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) {
            heartRateSensor?.let {
                try {
                    sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
                    android.util.Log.d("RunTrackingService", "Heart rate sensor registered")
                } catch (e: Exception) {
                    android.util.Log.e("RunTrackingService", "Failed to register heart rate sensor", e)
                }
            }
        } else {
            android.util.Log.w("RunTrackingService", "BODY_SENSORS permission not granted - skipping heart rate sensor")
        }
    }

    private fun onNewLocation(location: Location) {
        if (!isTracking) return

        val newPoint = LocationPoint(location.latitude, location.longitude, location.altitude.takeIf { location.hasAltitude() }, location.accuracy, location.speed.takeIf { location.hasSpeed() } ?: 0f, location.time)

        if (routePoints.isNotEmpty()) {
            val prevPoint = routePoints.last()
            val distanceIncrement = calculateDistance(prevPoint, newPoint)

            // Log location info for debugging
            android.util.Log.d("RunTrackingService", "Location update - accuracy: ${location.accuracy}m, speed: ${location.speed}m/s, distance: ${distanceIncrement}m")

            // Accept location if accuracy is reasonable OR if we're still in the first few locations (to get started)
            val isFirstLocations = routePoints.size < 5
            if ((location.accuracy < 20f || isFirstLocations) && distanceIncrement > 2.0) {
                val currentPaceSeconds = if (location.speed > 0) 1000f / location.speed else 0f
                totalDistance += distanceIncrement
                if (newPoint.altitude != null && prevPoint.altitude != null) {
                    val elevChange = newPoint.altitude - prevPoint.altitude
                    if (elevChange > 0) totalElevationGain += elevChange else totalElevationLoss += abs(elevChange)
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
            val split = KmSplit(km = currentKm, time = splitTime, pace = calculatePace(1000f / (splitTime / 1000f)))
            kmSplits.add(split)
            lastKmSplit = currentKm
            lastSplitTime = now
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
        val avgSpeed = if (duration > 0) (totalDistance / (duration / 1000.0)).toFloat() else 0f
        val phase = determinePhase(totalDistance / 1000.0, targetDistance)
        
        // Check for phase changes and trigger coaching
        checkPhaseChange(phase)
        
        // Check for 500m milestones and trigger coaching
        check500mMilestones()
        
        _currentRunSession.value = RunSession(
            id = UUID.randomUUID().toString(),
            startTime = startTime,
            endTime = null,
            duration = duration,
            distance = totalDistance,
            averageSpeed = avgSpeed,
            maxSpeed = maxSpeed,
            averagePace = calculatePace(avgSpeed),
            calories = calculateCalories(totalDistance, duration),
            cadence = currentCadence,
            heartRate = currentHeartRate,
            routePoints = routePoints.toList(),
            kmSplits = kmSplits.toList(),
            isStruggling = isStruggling,
            phase = phase,
            weatherAtStart = weatherAtStart,
            weatherAtEnd = null,
            totalElevationGain = totalElevationGain,
            totalElevationLoss = totalElevationLoss,
            averageGradient = calculateAverageGradient(),
            maxGradient = calculateMaxGradient(),
            terrainType = determineTerrainType(calculateAverageGradient()),
            routeHash = generateRouteHash(),
            routeName = null,
            externalSource = null, // Not synced from external source
            externalId = null,
            isActive = true
        )
    }
    
    private fun calculateAverageGradient(): Float = if (totalDistance == 0.0) 0f else ((totalElevationGain - totalElevationLoss) / totalDistance * 100).toFloat()
    
    private fun calculateMaxGradient(): Float = (1 until routePoints.size).mapNotNull { i-> val p1=routePoints[i-1]; val p2=routePoints[i]; if(p1.altitude!=null&&p2.altitude!=null) { val d=calculateDistance(p1,p2); if(d>0) ((p2.altitude-p1.altitude)/d * 100).toFloat() else null } else null }.maxOrNull() ?: 0f
    
    private fun determineTerrainType(avgGradient: Float): TerrainType = when { abs(avgGradient) < 2f -> TerrainType.FLAT; abs(avgGradient) < 5f -> TerrainType.ROLLING; abs(avgGradient) < 10f -> TerrainType.HILLY; else -> TerrainType.MOUNTAINOUS }
    
    private fun generateRouteHash(): String = MessageDigest.getInstance("MD5").digest(routePoints.joinToString(",") { "${String.format("%.4f", it.latitude)},${String.format("%.4f", it.longitude)}" }.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun calculatePace(speedMps: Float): String = if (speedMps <= 0) "0:00" else "${(1000.0/speedMps/60).toInt()}:${String.format("%02d", (1000.0/speedMps%60).toInt())}"

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
    private val timerHandler = android.os.Handler(Looper.getMainLooper())
    private var timerRunnable: Runnable? = null
    
    private fun startTimer() {
        timerRunnable = object : Runnable {
            override fun run() {
                if (!isTracking) {
                    android.util.Log.d("RunTrackingService", "Timer stopped - not tracking")
                    return
                }
                
                try {
                    // Update the run session every second regardless of location
                    updateRunSession()
                    
                    // Schedule next update in 1 second
                    timerHandler.postDelayed(this, 1000)
                } catch (e: Exception) {
                    android.util.Log.e("RunTrackingService", "Timer update failed", e)
                }
            }
        }
        timerHandler.post(timerRunnable!!)
        android.util.Log.d("RunTrackingService", "Timer started")
    }
    
    private fun stopTimer() {
        timerRunnable?.let {
            timerHandler.removeCallbacks(it)
        }
        android.util.Log.d("RunTrackingService", "Timer stopped")
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
        _isServiceRunning.value = false
        
        // Stop GPS, sensors, and timer
        fusedLocationClient.removeLocationUpdates(locationCallback)
        sensorManager.unregisterListener(this)
        stopTimer()
        
        android.util.Log.d("RunTrackingService", "Stopped all tracking")
        
        serviceScope.launch {
            // Get end weather and finalize run
            weatherAtEnd = weatherRepository.getCurrentWeather()
            _currentRunSession.value?.let { session ->
                val finalSession = session.copy(
                    endTime = System.currentTimeMillis(),
                    weatherAtEnd = weatherAtEnd,
                    isActive = false
                )
                _currentRunSession.value = finalSession
                
                // Upload run to backend
                uploadRunToBackend(finalSession)
            }
        }
        
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }
    
    private suspend fun uploadRunToBackend(runSession: RunSession) {
        try {
            val uploadRequest = UploadRunRequest(
                routeId = null, // TODO: Add if user selected a saved route
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
                strugglePoints = emptyList<StrugglePoint>(),
                kmSplits = runSession.kmSplits,
                terrainType = runSession.terrainType.name.lowercase(),
                userComments = null,
                // Run goals - target tracking
                targetDistance = targetDistance,
                targetTime = targetTime,
                wasTargetAchieved = calculateWasTargetAchieved()
            )
            
            val response = apiService.uploadRun(uploadRequest)
            Log.d("RunTrackingService", "Run uploaded successfully: ${response.id}")
            
            // Update the run session with the backend ID
            _currentRunSession.value = _currentRunSession.value?.copy(id = response.id)
            
            // Auto-upload to Garmin Connect if enabled
            tryAutoUploadToGarmin(response.id)

        } catch (e: HttpException) {
            // Handle 401 Unauthorized errors
            if (e.code() == 401) {
                android.util.Log.e("RunTrackingService", "❌ 401 Unauthorized - run not uploaded (session expired)")
                // Don't crash - run is saved locally
            } else {
                android.util.Log.e("RunTrackingService", "HTTP ${e.code()} error uploading run: ${e.message()}")
            }
        } catch (e: Exception) {
            // Log error but don't crash - run is saved locally
            android.util.Log.e("RunTrackingService", "Failed to upload run to backend", e)
            // TODO: Save to local queue for retry later
        }
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
        val pIntent = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).apply { flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK }, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
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
        serviceScope.cancel()
        Log.d("RunTrackingService", "Service destroyed")
    }
    
    /**
     * Play coaching audio using OpenAI TTS if available, otherwise fall back to Android TTS
     */
    private fun playCoachingAudio(base64Audio: String?, format: String?, fallbackText: String) {
        if (base64Audio != null && format != null) {
            // Play OpenAI TTS audio
            Log.d("RunTrackingService", "Playing OpenAI TTS audio ($format)")
            audioPlayerHelper.playAudio(base64Audio, format) {
                Log.d("RunTrackingService", "OpenAI TTS playback completed")
            }
        } else {
            // Fall back to Android TTS
            Log.d("RunTrackingService", "Falling back to Android TTS")
            textToSpeechHelper.speak(fallbackText)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
    
    // ==================== AI COACHING TRIGGERS ====================
    
    private fun determinePhase(distanceKm: Double, targetDistance: Double?): CoachingPhase {
        return live.airuncoach.airuncoach.domain.model.determinePhase(distanceKm, targetDistance)
    }
    
    private fun check500mMilestones() {
        val current500m = (totalDistance / 500).toInt()
        if (current500m > last500mMilestone) {
            last500mMilestone = current500m
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
                        coachName = currentUser?.coachName,
                        coachTone = currentUser?.coachTone,
                        coachGender = currentUser?.coachGender,
                        coachAccent = currentUser?.coachAccent,
                        activityType = "run"
                    )
                    val response = apiService.getPhaseCoaching(update)
                    coachingHistory.add("500m: ${response.message}")
                    
                    // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }
    
    private fun checkPhaseChange(newPhase: CoachingPhase) {
        if (newPhase != lastPhase && lastPhase != null) {
            lastPhase = newPhase
            serviceScope.launch {
                try {
                    val update = PhaseCoachingUpdate(
                        phase = newPhase.name,
                        distance = totalDistance / 1000.0,
                        targetDistance = targetDistance,
                        elapsedTime = System.currentTimeMillis() - startTime,
                        currentPace = _currentRunSession.value?.averagePace ?: "0:00",
                        currentGrade = calculateAverageGradient().toDouble(),
                        totalElevationGain = totalElevationGain,
                        coachName = currentUser?.coachName,
                        coachTone = currentUser?.coachTone,
                        coachGender = currentUser?.coachGender,
                        coachAccent = currentUser?.coachAccent,
                        activityType = "run"
                    )
                    val response = apiService.getPhaseCoaching(update)
                    coachingHistory.add("Phase change: ${response.message}")
                    
                    // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
                    if (!isMuted) {
                        playCoachingAudio(response.audio, response.format, response.message)
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
        lastPhase = newPhase
    }
    
    private fun triggerStruggleCoaching() {
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
                    coachAccent = currentUser?.coachAccent
                )
                val response = apiService.getStruggleCoaching(update)
                coachingHistory.add("Struggle: ${response.message}")
                
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
                    kmSplits = kmSplits.toList()
                )
                val response = apiService.getPaceUpdate(update)
                coachingHistory.add("Km ${split.km}: ${response.message}")
                
                // Play OpenAI TTS audio if available, otherwise fall back to Android TTS
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
                currentHeartRate = event.values[0].toInt()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
