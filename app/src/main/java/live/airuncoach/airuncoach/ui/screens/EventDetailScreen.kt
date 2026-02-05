package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.Event
import live.airuncoach.airuncoach.domain.model.Route
import live.airuncoach.airuncoach.domain.model.WeatherData
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.*
import live.airuncoach.airuncoach.ui.theme.*
import java.io.File
import java.io.FileOutputStream

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventDetailScreen(
    event: Event,
    onNavigateBack: () -> Unit,
    onStartRun: (String) -> Unit
) {
    val context = LocalContext.current
    val sessionManager = remember { SessionManager(context) }
    val apiService = remember { RetrofitClient(context, sessionManager).instance }
    val scope = rememberCoroutineScope()
    
    var route by remember { mutableStateOf<Route?>(null) }
    var weatherData by remember { mutableStateOf<WeatherData?>(null) }
    var briefingText by remember { mutableStateOf<String?>(null) }
    var briefingAudio by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var isLoadingBriefing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var currentLocation by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var hasLocationPermission by remember { mutableStateOf(false) }
    var isPlayingAudio by remember { mutableStateOf(false) }
    var mediaPlayer by remember { mutableStateOf<MediaPlayer?>(null) }
    
    // Check permission status
    LaunchedEffect(Unit) {
        hasLocationPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }
    
    // Permission launcher
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
    }
    
    // Get current location and weather
    LaunchedEffect(hasLocationPermission) {
        if (hasLocationPermission) {
            try {
                val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
                @SuppressLint("MissingPermission")
                val location = fusedLocationClient.lastLocation.await()
                if (location != null) {
                    currentLocation = Pair(location.latitude, location.longitude)
                }
            } catch (e: Exception) {
                android.util.Log.e("EventDetail", "Error getting location", e)
            }
        }
    }
    
    // Load route and weather data
    LaunchedEffect(event.routeId) {
        scope.launch {
            try {
                isLoading = true
                error = null
                
                // Fetch route details
                route = apiService.getRoute(event.routeId)
                android.util.Log.d("EventDetail", "✅ Loaded route: ${route?.distance} km")
                
                // Use default weather for now (can be enhanced later with weather API)
                weatherData = WeatherData(
                    temperature = 20.0,
                    humidity = 60.0,
                    windSpeed = 10.0,
                    description = "Clear skies",
                    condition = "Clear"
                )
                
            } catch (e: Exception) {
                android.util.Log.e("EventDetail", "❌ Failed to load event details: ${e.message}", e)
                error = "Failed to load event details: ${e.message}"
            } finally {
                isLoading = false
            }
        }
    }
    
    // Function to generate pre-run briefing
    fun generateBriefing() {
        scope.launch {
            try {
                isLoadingBriefing = true
                
                val r = route ?: return@launch
                val weather = weatherData ?: return@launch
                
                val request = PreRunBriefingRequest(
                    startLocation = StartLocation(
                        lat = r.startLat,
                        lng = r.startLng
                    ),
                    distance = r.distance,
                    elevationGain = (r.elevationGain ?: 0.0).toInt(),
                    elevationLoss = (r.elevationLoss ?: 0.0).toInt(),
                    maxGradientDegrees = calculateMaxGradient(r),
                    difficulty = r.difficulty ?: event.difficulty ?: "moderate",
                    activityType = event.eventType,
                    targetTime = null, // User can set this later
                    firstTurnInstruction = "Start at ${event.city}",
                    weather = WeatherPayload(
                        temp = weather.temperature.toInt(),
                        condition = weather.condition ?: weather.description,
                        windSpeed = weather.windSpeed.toInt()
                    )
                )
                
                val response = apiService.getPreRunBriefing(request)
                briefingText = response.text
                briefingAudio = response.audio
                
                android.util.Log.d("EventDetail", "✅ Generated pre-run briefing")
                
            } catch (e: Exception) {
                android.util.Log.e("EventDetail", "❌ Failed to generate briefing: ${e.message}", e)
                error = "Failed to generate briefing: ${e.message}"
            } finally {
                isLoadingBriefing = false
            }
        }
    }
    
    // Function to play audio
    fun playAudio() {
        try {
            briefingAudio?.let { audioBase64 ->
                // Stop any existing playback
                mediaPlayer?.stop()
                mediaPlayer?.release()
                
                // Decode base64 audio
                val audioBytes = Base64.decode(audioBase64, Base64.DEFAULT)
                
                // Write to temp file
                val tempFile = File(context.cacheDir, "pre_run_briefing.mp3")
                FileOutputStream(tempFile).use { it.write(audioBytes) }
                
                // Play audio
                mediaPlayer = MediaPlayer().apply {
                    setDataSource(tempFile.absolutePath)
                    prepare()
                    setOnCompletionListener {
                        isPlayingAudio = false
                    }
                    start()
                }
                isPlayingAudio = true
            }
        } catch (e: Exception) {
            android.util.Log.e("EventDetail", "❌ Failed to play audio: ${e.message}", e)
            isPlayingAudio = false
        }
    }
    
    // Function to stop audio
    fun stopAudio() {
        mediaPlayer?.stop()
        mediaPlayer?.release()
        mediaPlayer = null
        isPlayingAudio = false
    }
    
    // Cleanup
    DisposableEffect(Unit) {
        onDispose {
            mediaPlayer?.release()
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = event.name,
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundRoot
                )
            )
        },
        containerColor = Colors.backgroundRoot
    ) { paddingValues ->
        when {
            isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Colors.primary)
                }
            }
            error != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(Spacing.lg),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = error ?: "Unknown error",
                            color = Colors.error,
                            style = AppTextStyles.body
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = onNavigateBack,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Colors.primary
                            )
                        ) {
                            Text("Go Back")
                        }
                    }
                }
            }
            route != null -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .verticalScroll(rememberScrollState())
                        .padding(Spacing.md)
                ) {
                    // Event Info Card
                    EventInfoCard(event = event, route = route!!, weather = weatherData)
                    
                    Spacer(modifier = Modifier.height(Spacing.md))
                    
                    // Pre-Run Briefing Section
                    if (briefingText == null) {
                        // Generate Briefing Button
                        Button(
                            onClick = { generateBriefing() },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !isLoadingBriefing,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Colors.primary,
                                contentColor = Colors.buttonText
                            ),
                            shape = RoundedCornerShape(BorderRadius.md)
                        ) {
                            if (isLoadingBriefing) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = Colors.buttonText
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Generating AI Briefing...")
                            } else {
                                Text("Generate Pre-Run AI Briefing", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold))
                            }
                        }
                    } else {
                        // Show Briefing
                        BriefingCard(
                            briefingText = briefingText!!,
                            isPlayingAudio = isPlayingAudio,
                            onPlayAudio = { playAudio() },
                            onStopAudio = { stopAudio() }
                        )
                        
                        Spacer(modifier = Modifier.height(Spacing.md))
                        
                        // Start Run Button
                        Button(
                            onClick = { onStartRun(event.routeId) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Colors.success,
                                contentColor = Colors.buttonText
                            ),
                            shape = RoundedCornerShape(BorderRadius.md)
                        ) {
                            Text(
                                text = "▶ Start Run",
                                style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold)
                            )
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(Spacing.xl))
                }
            }
        }
    }
}

@Composable
fun EventInfoCard(event: Event, route: Route, weather: WeatherData?) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            // Location
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(text = "📍", style = AppTextStyles.h3)
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(
                        text = event.city ?: "Event Location",
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = event.country,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            Divider(color = Colors.border)
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Stats Grid
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                StatItem(label = "Distance", value = "${route.distance} km", icon = "🏃")
                StatItem(label = "Elevation", value = "${(route.elevationGain ?: 0.0).toInt()}m", icon = "⛰️")
                StatItem(label = "Difficulty", value = (route.difficulty ?: "Moderate").capitalize(), icon = "💪")
            }
            
            // Weather
            weather?.let {
                Spacer(modifier = Modifier.height(Spacing.md))
                Divider(color = Colors.border)
                Spacer(modifier = Modifier.height(Spacing.md))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    StatItem(label = "Temperature", value = "${it.temperature.toInt()}°C", icon = "🌡️")
                    StatItem(label = "Conditions", value = it.condition ?: it.description, icon = getWeatherIcon(it.condition ?: it.description))
                    StatItem(label = "Wind", value = "${it.windSpeed.toInt()} km/h", icon = "💨")
                }
            }
        }
    }
}

@Composable
fun StatItem(label: String, value: String, icon: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = icon, style = AppTextStyles.h3)
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
            color = Colors.primary
        )
        Text(
            text = label,
            style = AppTextStyles.small,
            color = Colors.textSecondary
        )
    }
}

@Composable
fun BriefingCard(
    briefingText: String,
    isPlayingAudio: Boolean,
    onPlayAudio: () -> Unit,
    onStopAudio: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "🤖 Pre-Run Briefing",
                    style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary
                )
                
                Button(
                    onClick = { if (isPlayingAudio) onStopAudio() else onPlayAudio() },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    )
                ) {
                    Text(if (isPlayingAudio) "⏸ Stop" else "▶ Play Audio")
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.sm))
            
            Text(
                text = briefingText,
                style = AppTextStyles.body,
                color = Colors.textPrimary
            )
        }
    }
}

private fun calculateMaxGradient(route: Route): Double {
    val elevationGain = route.elevationGain ?: 0.0
    val distance = route.distance * 1000 // Convert to meters
    return if (distance > 0) {
        (elevationGain / distance) * 100
    } else {
        0.0
    }
}

private fun getWeatherIcon(condition: String): String {
    return when (condition.lowercase()) {
        "clear", "sunny" -> "☀️"
        "cloudy", "clouds" -> "☁️"
        "rain", "rainy" -> "🌧️"
        "snow", "snowy" -> "❄️"
        "wind", "windy" -> "💨"
        else -> "🌤️"
    }
}
