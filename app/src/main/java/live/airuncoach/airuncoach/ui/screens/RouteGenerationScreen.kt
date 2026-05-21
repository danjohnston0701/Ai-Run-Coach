package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.foundation.border
import kotlinx.coroutines.delay as coroutineDelay
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.RouteGenerationViewModel
import kotlin.math.abs
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteGenerationScreen(
    onNavigateBack: () -> Unit,
    onRouteSelected: (String) -> Unit,
    viewModel: RouteGenerationViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val routes by viewModel.routes.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    
    var distanceKm by remember { mutableFloatStateOf(5.0f) }
    var preferTrails by remember { mutableStateOf(true) }
    var avoidHills by remember { mutableStateOf(false) }
    var currentLocation by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var hasLocationPermission by remember { mutableStateOf(false) }
    var locationRefreshTrigger by remember { mutableIntStateOf(0) }
    var isGettingLocation by remember { mutableStateOf(false) }
    var gpsError by remember { mutableStateOf<String?>(null) }
    var loadingStartTime by remember { mutableStateOf<Long?>(null) }
    
    // Track loading state change to reset timer
    LaunchedEffect(isLoading) {
        if (isLoading) {
            loadingStartTime = System.currentTimeMillis()
        } else {
            loadingStartTime = null
        }
    }
    
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
    
    // Get current location - request fresh location instead of using cached lastLocation
    LaunchedEffect(hasLocationPermission, locationRefreshTrigger) {
        if (hasLocationPermission) {
            isGettingLocation = true
            try {
                val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
                
                Log.d("RouteGen", "🔄 Requesting fresh GPS location...")
                
                // Request a fresh location update with high accuracy GPS
                @SuppressLint("MissingPermission")
                val location = suspendCancellableCoroutine { continuation ->
                    fusedLocationClient.getCurrentLocation(
                        Priority.PRIORITY_HIGH_ACCURACY,
                        null
                    ).addOnSuccessListener { location ->
                        continuation.resume(location)
                    }.addOnFailureListener { e ->
                        Log.w("RouteGen", "Fresh location failed, trying lastLocation", e)
                        // Fallback to lastLocation if fresh location fails
                        fusedLocationClient.lastLocation.addOnSuccessListener { lastLoc ->
                            continuation.resume(lastLoc)
                        }.addOnFailureListener {
                            continuation.resume(null)
                        }
                    }
                }
                
                if (location != null) {
                    val lat = location.latitude
                    val lng = location.longitude
                    currentLocation = Pair(lat, lng)
                    gpsError = null
                    Log.d("RouteGen", "✅ Got fresh GPS location: $lat, $lng")
                } else {
                    gpsError = "Unable to acquire GPS signal"
                    Log.e("RouteGen", "❌ GPS location is null - GPS may be disabled or signal is too weak")
                }
            } catch (e: Exception) {
                Log.e("RouteGen", "❌ Error getting location", e)
            } finally {
                isGettingLocation = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Generate Route", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundDefault
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundDefault)
                .padding(padding)
                .padding(horizontal = Spacing.md),
            verticalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            // Request permission if needed
            if (!hasLocationPermission) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                    ) {
                        Column(
                            modifier = Modifier.padding(Spacing.md)
                        ) {
                            Text(
                                "Location Permission Required",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.height(Spacing.sm))
                            Text(
                                "We need your location to generate routes nearby",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Colors.textSecondary
                            )
                            Spacer(Modifier.height(Spacing.md))
                            Button(
                                onClick = {
                                    locationPermissionLauncher.launch(
                                        arrayOf(
                                            Manifest.permission.ACCESS_FINE_LOCATION,
                                            Manifest.permission.ACCESS_COARSE_LOCATION
                                        )
                                    )
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Colors.primary
                                )
                            ) {
                                Text("Grant Permission")
                            }
                        }
                    }
                }
            }
            
            // Location indicator
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(Spacing.md),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(
                            modifier = Modifier.weight(1f)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (isGettingLocation) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        strokeWidth = 2.dp,
                                        color = Colors.primary
                                    )
                                } else {
                                    Icon(
                                        Icons.Default.LocationOn,
                                        contentDescription = null,
                                        tint = if (currentLocation != null) Colors.primary else Colors.textSecondary
                                    )
                                }
                                Spacer(Modifier.width(Spacing.sm))
                                Text(
                                    text = when {
                                        isGettingLocation -> "Acquiring GPS location..."
                                        currentLocation != null -> "GPS location confirmed"
                                        else -> "Waiting for GPS..."
                                    },
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = if (currentLocation != null && !isGettingLocation) FontWeight.Medium else FontWeight.Normal
                                )
                            }
                            
                            // Show actual coordinates for verification
                            currentLocation?.let { (lat, lng) ->
                                Spacer(Modifier.height(Spacing.xs))
                                Text(
                                    text = "📍 %.6f, %.6f".format(lat, lng),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Colors.textSecondary,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                            
                            // Show helpful hint while getting location
                            if (isGettingLocation) {
                                Spacer(Modifier.height(Spacing.xs))
                                Text(
                                    text = "Please ensure GPS is enabled and you're outdoors for best accuracy",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Colors.textSecondary,
                                    fontStyle = FontStyle.Italic
                                )
                            }
                        }
                        
                        // Refresh location button
                        if (!isGettingLocation) {
                            IconButton(
                                onClick = { locationRefreshTrigger++ },
                                enabled = hasLocationPermission
                            ) {
                                Icon(
                                    Icons.Default.Refresh,
                                    contentDescription = "Refresh location",
                                    tint = if (hasLocationPermission) Colors.primary else Colors.textSecondary
                                )
                            }
                        }
                    }
                }
            }
            
            // GPS Error Screen
            gpsError?.let { _ ->
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Colors.error.copy(alpha = 0.1f)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(Spacing.lg),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "📡",
                                style = MaterialTheme.typography.displayMedium
                            )
                            Spacer(Modifier.height(Spacing.md))
                            Text(
                                text = "GPS Signal Too Weak",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Colors.error
                            )
                            Spacer(Modifier.height(Spacing.sm))
                            Text(
                                text = "Unable to acquire an accurate GPS location to generate your route.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Colors.textPrimary,
                                textAlign = TextAlign.Center
                            )
                            Spacer(Modifier.height(Spacing.md))
                            Text(
                                text = "Please try the following:",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                color = Colors.textPrimary
                            )
                            Spacer(Modifier.height(Spacing.sm))
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                            ) {
                                Text(
                                    text = "• Move outdoors with clear sky visibility",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Colors.textSecondary
                                )
                                Text(
                                    text = "• Check that Location Services are enabled",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Colors.textSecondary
                                )
                                Text(
                                    text = "• Ensure GPS is set to 'High Accuracy' mode",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Colors.textSecondary
                                )
                                Text(
                                    text = "• Wait a few moments for GPS to acquire satellites",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Colors.textSecondary
                                )
                            }
                            Spacer(Modifier.height(Spacing.md))
                            Button(
                                onClick = { locationRefreshTrigger++ },
                                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = null)
                                Spacer(Modifier.width(Spacing.sm))
                                Text("Try Again", fontWeight = FontWeight.Bold, color = Colors.buttonText)
                            }
                        }
                    }
                }
            }

            // Distance slider
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Column(
                        modifier = Modifier.padding(Spacing.md)
                    ) {
                        Text(
                            "Distance: ${distanceKm.roundToInt()}km",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Slider(
                            value = distanceKm,
                            onValueChange = { distanceKm = it },
                            valueRange = 1f..20f,
                            steps = 18
                        )
                    }
                }
            }

            // Options
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
                ) {
                    Column(
                        modifier = Modifier.padding(Spacing.md)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { preferTrails = !preferTrails }
                                .padding(vertical = Spacing.sm),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("Prefer Trails", fontWeight = FontWeight.Medium)
                                Text(
                                    "Use paths, parks, and trails over roads",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Colors.textSecondary
                                )
                            }
                            Switch(
                                checked = preferTrails,
                                onCheckedChange = { preferTrails = it }
                            )
                        }
                        
                        HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.sm))
                        
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { avoidHills = !avoidHills }
                                .padding(vertical = Spacing.sm),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("Avoid Hills", fontWeight = FontWeight.Medium)
                                Text(
                                    "Prefer flat routes with minimal elevation",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Colors.textSecondary
                                )
                            }
                            Switch(
                                checked = avoidHills,
                                onCheckedChange = { avoidHills = it }
                            )
                        }
                    }
                }
            }

            // Generate button
            item {
                Button(
                    onClick = {
                        currentLocation?.let { (lat, lng) ->
                            viewModel.generateIntelligentRoutes(
                                latitude = lat,
                                longitude = lng,
                                distanceKm = distanceKm.toDouble(),
                                preferTrails = preferTrails,
                                avoidHills = avoidHills
                            )
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    enabled = currentLocation != null && !isLoading && !isGettingLocation,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary
                    )
                ) {
                    Row(
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        when {
                            isLoading -> {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    color = Colors.buttonText
                                )
                                Spacer(Modifier.width(Spacing.sm))
                                Text("Generating Routes...", fontWeight = FontWeight.Bold, color = Colors.buttonText)
                            }
                            isGettingLocation -> {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    color = Colors.buttonText
                                )
                                Spacer(Modifier.width(Spacing.sm))
                                Text("Confirming GPS Location...", fontWeight = FontWeight.Bold, color = Colors.buttonText)
                            }
                            currentLocation == null -> {
                                Text("Waiting for GPS...", fontWeight = FontWeight.Bold, color = Colors.buttonText)
                            }
                            else -> {
                                Text("Generate 3 Route Options", fontWeight = FontWeight.Bold, color = Colors.buttonText)
                            }
                        }
                    }
                }
            }
            
            // Loading state with progress indicator and helpful message
            if (isLoading) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(Spacing.lg),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(Spacing.md)
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(48.dp),
                                color = Colors.primary,
                                strokeWidth = 4.dp
                            )
                            Text(
                                "Finding the Best Routes",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                "Analyzing terrain, trails, and elevation...\nThis may take 10-30 seconds.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Colors.textSecondary,
                                textAlign = TextAlign.Center
                            )
                            
                            // Show elapsed time
                            if (loadingStartTime != null) {
                                var elapsedTime by remember { mutableIntStateOf(0) }
                                LaunchedEffect(Unit) {
                                    while (isLoading) {
                                        elapsedTime = ((System.currentTimeMillis() - loadingStartTime!!) / 1000).toInt()
                                        coroutineDelay(1000)
                                    }
                                }
                                Text(
                                    "Elapsed: ${elapsedTime}s",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Colors.textSecondary
                                )
                            }
                        }
                    }
                }
            }

            // Error message - prominent and actionable
            error?.let { errorMessage ->
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.5.dp, Colors.error, RoundedCornerShape(12.dp)),
                        colors = CardDefaults.cardColors(containerColor = Colors.error.copy(alpha = 0.15f)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(Spacing.lg)
                        ) {
                            Row(
                                verticalAlignment = Alignment.Top,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = "❌",
                                    style = MaterialTheme.typography.displaySmall,
                                    modifier = Modifier.padding(end = Spacing.md)
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Route Generation Failed",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = Colors.error
                                    )
                                    Spacer(Modifier.height(Spacing.sm))
                                    Text(
                                        text = errorMessage,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = Colors.textPrimary,
                                        lineHeight = 1.5.em
                                    )
                                }
                            }
                            
                            Spacer(Modifier.height(Spacing.md))
                            
                            // Helpful suggestions
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Colors.backgroundDefault.copy(alpha = 0.7f), RoundedCornerShape(8.dp))
                                    .padding(Spacing.md),
                                verticalArrangement = Arrangement.spacedBy(Spacing.xs)
                            ) {
                                Text(
                                    text = "💡 Try one of these:",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Medium,
                                    color = Colors.textSecondary
                                )
                                Text(
                                    text = "• Adjust the distance (try 3-7km)",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Colors.textSecondary
                                )
                                Text(
                                    text = "• Move to a different location with more paths",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Colors.textSecondary
                                )
                                Text(
                                    text = "• Toggle trail preferences or hill avoidance",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Colors.textSecondary
                                )
                                Text(
                                    text = "• Check your internet connection and try again",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Colors.textSecondary
                                )
                            }
                            
                            Spacer(Modifier.height(Spacing.md))
                            
                            // Retry button
                            Button(
                                onClick = {
                                    currentLocation?.let { (lat, lng) ->
                                        viewModel.generateIntelligentRoutes(
                                            latitude = lat,
                                            longitude = lng,
                                            distanceKm = distanceKm.toDouble(),
                                            preferTrails = preferTrails,
                                            avoidHills = avoidHills
                                        )
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Colors.primary
                                ),
                                enabled = currentLocation != null && !isLoading
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = null)
                                Spacer(Modifier.width(Spacing.sm))
                                Text("Retry", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // Generated routes
            if (routes.isNotEmpty()) {
                item {
                    Text(
                        "Select a Route",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = Spacing.md)
                    )
                }

                itemsIndexed(routes) { index, route ->
                    RouteCard(
                        route = route,
                        routeNumber = index + 1,
                        onClick = { onRouteSelected(route.id) }
                    )
                }
            }

            // Bottom spacing
            item {
                Spacer(Modifier.height(Spacing.xl))
            }
        }
    }
}

@Composable
private fun RouteCard(
    route: live.airuncoach.airuncoach.domain.model.GeneratedRoute,
    routeNumber: Int,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(Spacing.md)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Route Option $routeNumber",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                
                Surface(
                    color = when (route.difficulty) {
                        live.airuncoach.airuncoach.domain.model.RouteDifficulty.EASY -> Colors.success
                        live.airuncoach.airuncoach.domain.model.RouteDifficulty.MODERATE -> Colors.warning
                        live.airuncoach.airuncoach.domain.model.RouteDifficulty.HARD -> Colors.error
                    },
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text(
                        route.difficulty.name,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = Colors.buttonText
                    )
                }
            }
            
            Spacer(Modifier.height(Spacing.sm))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        "Distance",
                        style = MaterialTheme.typography.bodySmall,
                        color = Colors.textSecondary
                    )
                    Text(
                        "${(route.distance / 1000.0).format(2)} km",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                }
                
                Column {
                    Text(
                        "Elevation Gain",
                        style = MaterialTheme.typography.bodySmall,
                        color = Colors.textSecondary
                    )
                    Text(
                        "${route.elevationGain.toInt()}m",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                }
                
                Column {
                    Text(
                        "Est. Time",
                        style = MaterialTheme.typography.bodySmall,
                        color = Colors.textSecondary
                    )
                    Text(
                        "${route.duration.toInt()} min",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

private fun Double.format(digits: Int) = "%.${digits}f".format(this)
