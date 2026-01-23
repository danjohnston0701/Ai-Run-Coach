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
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import live.airuncoach.airuncoach.MainActivity
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.WeatherRepository
import live.airuncoach.airuncoach.domain.model.LocationPoint
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.domain.model.TerrainType
import live.airuncoach.airuncoach.domain.model.WeatherData
import java.security.MessageDigest
import java.util.*
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.abs

class RunTrackingService : Service() {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var notificationManager: NotificationManager
    private lateinit var weatherRepository: WeatherRepository
    private var wakeLock: PowerManager.WakeLock? = null
    
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    
    // Track current run data
    private val routePoints = mutableListOf<LocationPoint>()
    private var startTime: Long = 0
    private var totalDistance: Double = 0.0
    private var maxSpeed: Float = 0f
    private var isTracking = false
    
    // Weather and terrain tracking - CRITICAL for weather impact analysis
    private var weatherAtStart: WeatherData? = null
    private var weatherAtEnd: WeatherData? = null
    private var totalElevationGain: Double = 0.0
    private var totalElevationLoss: Double = 0.0
    
    companion object {
        private const val CHANNEL_ID = "run_tracking_channel"
        private const val NOTIFICATION_ID = 1001
        private const val LOCATION_UPDATE_INTERVAL = 2000L // 2 seconds
        private const val LOCATION_FASTEST_INTERVAL = 1000L // 1 second
        
        const val ACTION_START_TRACKING = "ACTION_START_TRACKING"
        const val ACTION_STOP_TRACKING = "ACTION_STOP_TRACKING"
        const val ACTION_PAUSE_TRACKING = "ACTION_PAUSE_TRACKING"
        const val ACTION_RESUME_TRACKING = "ACTION_RESUME_TRACKING"
        
        private val _currentRunSession = MutableStateFlow<RunSession?>(null)
        val currentRunSession: StateFlow<RunSession?> = _currentRunSession
        
        private val _isServiceRunning = MutableStateFlow(false)
        val isServiceRunning: StateFlow<Boolean> = _isServiceRunning
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        weatherRepository = WeatherRepository(this)
        
        createNotificationChannel()
        acquireWakeLock()
        setupLocationCallback()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_TRACKING -> startTracking()
            ACTION_STOP_TRACKING -> stopTracking()
            ACTION_PAUSE_TRACKING -> pauseTracking()
            ACTION_RESUME_TRACKING -> resumeTracking()
        }
        return START_STICKY // Auto-restart if killed by system
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "AiRunCoach::RunTrackingWakeLock"
        ).apply {
            acquire(10 * 60 * 60 * 1000L) // 10 hours max
        }
    }

    private fun setupLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                locationResult.lastLocation?.let { location ->
                    onNewLocation(location)
                }
            }
        }
    }

    private fun startTracking() {
        if (isTracking) return
        
        isTracking = true
        _isServiceRunning.value = true
        startTime = System.currentTimeMillis()
        routePoints.clear()
        totalDistance = 0.0
        maxSpeed = 0f
        totalElevationGain = 0.0
        totalElevationLoss = 0.0
        weatherAtStart = null
        weatherAtEnd = null
        
        // Capture weather at run start - CRITICAL for weather impact analysis
        serviceScope.launch {
            weatherAtStart = weatherRepository.getCurrentWeather()
        }
        
        val notification = createNotification("Run tracking started", "Distance: 0.00 km")
        startForeground(NOTIFICATION_ID, notification)
        
        requestLocationUpdates()
    }

    private fun requestLocationUpdates() {
        // Check permissions
        if (ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            stopSelf()
            return
        }

        val locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            LOCATION_UPDATE_INTERVAL
        ).apply {
            setMinUpdateIntervalMillis(LOCATION_FASTEST_INTERVAL)
            setWaitForAccurateLocation(true)
        }.build()

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper()
        )
    }

    private fun onNewLocation(location: Location) {
        if (!isTracking) return
        
        val locationPoint = LocationPoint(
            latitude = location.latitude,
            longitude = location.longitude,
            altitude = if (location.hasAltitude()) location.altitude else null,
            accuracy = location.accuracy,
            speed = if (location.hasSpeed()) location.speed else 0f,
            timestamp = location.time
        )
        
        // Calculate distance from previous point
        if (routePoints.isNotEmpty()) {
            val previousPoint = routePoints.last()
            val distance = calculateDistance(previousPoint, locationPoint)
            
            // Only add point if it moved significantly (filter GPS jitter)
            if (location.accuracy < 20f && distance > 2.0) { // 20m accuracy, 2m minimum movement
                totalDistance += distance
                
                // Track elevation changes for terrain analysis
                if (locationPoint.altitude != null && previousPoint.altitude != null) {
                    val elevationChange = locationPoint.altitude - previousPoint.altitude
                    if (elevationChange > 0) {
                        totalElevationGain += elevationChange
                    } else {
                        totalElevationLoss += abs(elevationChange)
                    }
                }
                
                routePoints.add(locationPoint)
                
                if (location.speed > maxSpeed) {
                    maxSpeed = location.speed
                }
                
                updateRunSession()
                updateNotification()
            }
        } else {
            // First point
            routePoints.add(locationPoint)
        }
    }

    private fun calculateDistance(point1: LocationPoint, point2: LocationPoint): Double {
        // Haversine formula for great circle distance
        val earthRadius = 6371000.0 // meters
        
        val lat1Rad = Math.toRadians(point1.latitude)
        val lat2Rad = Math.toRadians(point2.latitude)
        val deltaLat = Math.toRadians(point2.latitude - point1.latitude)
        val deltaLon = Math.toRadians(point2.longitude - point1.longitude)
        
        val a = sin(deltaLat / 2) * sin(deltaLat / 2) +
                cos(lat1Rad) * cos(lat2Rad) *
                sin(deltaLon / 2) * sin(deltaLon / 2)
        
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        
        return earthRadius * c
    }

    private fun updateRunSession() {
        val duration = System.currentTimeMillis() - startTime
        val averageSpeed = if (duration > 0) {
            (totalDistance / (duration / 1000.0)).toFloat()
        } else {
            0f
        }
        
        val averagePace = calculatePace(averageSpeed)
        val calories = calculateCalories(totalDistance, duration)
        
        // Calculate terrain metrics
        val averageGradient = calculateAverageGradient()
        val maxGradient = calculateMaxGradient()
        val terrainType = determineTerrainType(averageGradient)
        val routeHash = generateRouteHash()
        
        _currentRunSession.value = RunSession(
            id = UUID.randomUUID().toString(),
            startTime = startTime,
            endTime = null,
            duration = duration,
            distance = totalDistance,
            averageSpeed = averageSpeed,
            maxSpeed = maxSpeed,
            averagePace = averagePace,
            calories = calories,
            routePoints = routePoints.toList(),
            weatherAtStart = weatherAtStart,
            weatherAtEnd = null, // Set in stopTracking
            totalElevationGain = totalElevationGain,
            totalElevationLoss = totalElevationLoss,
            averageGradient = averageGradient,
            maxGradient = maxGradient,
            terrainType = terrainType,
            routeHash = routeHash,
            routeName = null, // User can set later
            isActive = true
        )
    }
    
    private fun calculateAverageGradient(): Float {
        if (totalDistance == 0.0) return 0f
        val netElevationChange = totalElevationGain - totalElevationLoss
        return ((netElevationChange / totalDistance) * 100).toFloat()
    }
    
    private fun calculateMaxGradient(): Float {
        var maxGrad = 0f
        for (i in 1 until routePoints.size) {
            val prev = routePoints[i - 1]
            val curr = routePoints[i]
            
            if (prev.altitude != null && curr.altitude != null) {
                val elevChange = curr.altitude - prev.altitude
                val distance = calculateDistance(prev, curr)
                if (distance > 0) {
                    val gradient = ((elevChange / distance) * 100).toFloat()
                    if (abs(gradient) > abs(maxGrad)) {
                        maxGrad = gradient
                    }
                }
            }
        }
        return maxGrad
    }
    
    private fun determineTerrainType(averageGradient: Float): TerrainType {
        val absGradient = abs(averageGradient)
        return when {
            absGradient < 2f -> TerrainType.FLAT
            absGradient < 5f -> TerrainType.ROLLING
            absGradient < 10f -> TerrainType.HILLY
            else -> TerrainType.MOUNTAINOUS
        }
    }
    
    private fun generateRouteHash(): String {
        // Generate hash from route coordinates for similarity comparison
        val coordinates = routePoints.joinToString(",") { 
            "${String.format("%.4f", it.latitude)},${String.format("%.4f", it.longitude)}"
        }
        val bytes = MessageDigest.getInstance("MD5").digest(coordinates.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun calculatePace(speedMetersPerSecond: Float): String {
        if (speedMetersPerSecond <= 0) return "0:00"
        
        val paceSecondsPerKm = 1000.0 / speedMetersPerSecond
        val minutes = (paceSecondsPerKm / 60).toInt()
        val seconds = (paceSecondsPerKm % 60).toInt()
        
        return String.format("%d:%02d", minutes, seconds)
    }

    private fun calculateCalories(distanceMeters: Double, durationMillis: Long): Int {
        // Rough estimate: 1 calorie per kg per km for running
        // Assuming average weight of 70kg
        val distanceKm = distanceMeters / 1000.0
        return (70 * distanceKm).toInt()
    }

    private fun updateNotification() {
        val distanceKm = totalDistance / 1000.0
        val duration = System.currentTimeMillis() - startTime
        val currentSession = _currentRunSession.value
        
        val notification = createNotification(
            "Run in progress",
            String.format(
                "Distance: %.2f km | Pace: %s/km | Time: %s",
                distanceKm,
                currentSession?.averagePace ?: "0:00",
                currentSession?.getFormattedDuration() ?: "00:00"
            )
        )
        
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun pauseTracking() {
        isTracking = false
        fusedLocationClient.removeLocationUpdates(locationCallback)
        updateNotification()
    }

    private fun resumeTracking() {
        isTracking = true
        requestLocationUpdates()
    }

    private fun stopTracking() {
        isTracking = false
        _isServiceRunning.value = false
        
        fusedLocationClient.removeLocationUpdates(locationCallback)
        
        // Capture weather at run end - CRITICAL for weather impact analysis
        serviceScope.launch {
            weatherAtEnd = weatherRepository.getCurrentWeather()
            
            // Finalize the run session with end weather
            _currentRunSession.value?.let { session ->
                _currentRunSession.value = session.copy(
                    endTime = System.currentTimeMillis(),
                    weatherAtEnd = weatherAtEnd,
                    isActive = false
                )
            }
        }
        
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Run Tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notifications for active run tracking"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(title: String, content: String): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(R.drawable.icon_running)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        wakeLock = null
    }

    override fun onDestroy() {
        super.onDestroy()
        releaseWakeLock()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
