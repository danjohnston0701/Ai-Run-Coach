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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.components.TargetTimeCard
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import kotlin.coroutines.resume

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapMyRunSetupScreen(
    mode: String = "route", // "route" or "no_route"
    initialDistance: Float = 5f,
    initialTargetTimeEnabled: Boolean = false,
    initialHours: Int = 0,
    initialMinutes: Int = 0,
    initialSeconds: Int = 0,
    onNavigateBack: () -> Unit = {},
    onGenerateRoute: (
        distance: Float,
        targetTimeEnabled: Boolean,
        hours: Int,
        minutes: Int,
        seconds: Int,
        liveTrackingEnabled: Boolean,
        isGroupRun: Boolean,
        latitude: Double,
        longitude: Double
    ) -> Unit = { _, _, _, _, _, _, _, _, _ -> },
    onStartRunWithoutRoute: (
        distance: Float,
        targetTimeEnabled: Boolean,
        hours: Int,
        minutes: Int,
        seconds: Int
    ) -> Unit = { _, _, _, _, _ -> }
) {
    val context = LocalContext.current
    var selectedActivity by remember { mutableStateOf("Run") }
    var targetDistance by remember { mutableStateOf(initialDistance) }
    var isTargetTimeEnabled by remember { mutableStateOf(initialTargetTimeEnabled) }
    var targetHours by remember { mutableStateOf(initialHours.toString().padStart(2, '0')) }
    var targetMinutes by remember { mutableStateOf(initialMinutes.toString().padStart(2, '0')) }
    var targetSeconds by remember { mutableStateOf(initialSeconds.toString().padStart(2, '0')) }
    var isLiveTrackingEnabled by remember { mutableStateOf(false) }
    
    // GPS State
    var currentLocation by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var hasLocationPermission by remember { mutableStateOf(false) }
    var isGettingLocation by remember { mutableStateOf(false) }
    var gpsError by remember { mutableStateOf<String?>(null) }
    
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
    LaunchedEffect(hasLocationPermission) {
        if (hasLocationPermission) {
            isGettingLocation = true
            gpsError = null
            try {
                val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
                
                Log.d("MapSetup", "🔄 Requesting fresh GPS location...")
                
                @SuppressLint("MissingPermission")
                val location = suspendCancellableCoroutine { continuation ->
                    fusedLocationClient.getCurrentLocation(
                        Priority.PRIORITY_HIGH_ACCURACY,
                        null
                    ).addOnSuccessListener { location ->
                        continuation.resume(location)
                    }.addOnFailureListener { e ->
                        Log.w("MapSetup", "Fresh location failed, trying lastLocation", e)
                        fusedLocationClient.lastLocation.addOnSuccessListener { lastLoc ->
                            continuation.resume(lastLoc)
                        }.addOnFailureListener {
                            continuation.resume(null)
                        }
                    }
                }
                
                if (location != null) {
                    currentLocation = Pair(location.latitude, location.longitude)
                    Log.d("MapSetup", "✅ Got fresh GPS location: ${location.latitude}, ${location.longitude}")
                } else {
                    gpsError = "Unable to acquire GPS signal"
                    Log.e("MapSetup", "❌ GPS location is null")
                }
            } catch (e: Exception) {
                gpsError = "Error getting GPS location"
                Log.e("MapSetup", "❌ Error getting location", e)
            } finally {
                isGettingLocation = false
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 100.dp)  // Space for bottom button
        ) {
            item {
                // Header with close button
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.lg, vertical = Spacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "MAP MY RUN SETUP",
                            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        Text(
                            text = "Configure your AI-generated route",
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                    }
                    
                    // Close button
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_x_vector),
                            contentDescription = "Close",
                            tint = Colors.textPrimary,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            }
            
            item { Spacer(modifier = Modifier.height(Spacing.lg)) }
            
            // GPS Location Status Card
            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.lg),
                    colors = CardDefaults.cardColors(
                        containerColor = if (currentLocation != null) Colors.backgroundSecondary else Colors.error.copy(alpha = 0.1f)
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(Spacing.md),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
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
                                tint = if (currentLocation != null) Colors.primary else Colors.error
                            )
                        }
                        
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = when {
                                    isGettingLocation -> "Acquiring GPS location..."
                                    currentLocation != null -> "GPS location confirmed"
                                    gpsError != null -> "GPS signal unavailable"
                                    !hasLocationPermission -> "Location permission required"
                                    else -> "Waiting for GPS..."
                                },
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                                color = if (currentLocation != null) Colors.textPrimary else Colors.error
                            )
                            
                            if (currentLocation != null) {
                                Text(
                                    text = "Ready to start",
                                    style = AppTextStyles.caption,
                                    color = Colors.textSecondary
                                )
                            } else if (!hasLocationPermission) {
                                Text(
                                    text = "Grant permission to continue",
                                    style = AppTextStyles.caption,
                                    color = Colors.textSecondary
                                )
                            } else {
                                Text(
                                    text = "Please wait for GPS signal",
                                    style = AppTextStyles.caption,
                                    color = Colors.textSecondary
                                )
                            }
                        }
                        
                        if (!hasLocationPermission) {
                            Button(
                                onClick = {
                                    locationPermissionLauncher.launch(
                                        arrayOf(
                                            Manifest.permission.ACCESS_FINE_LOCATION,
                                            Manifest.permission.ACCESS_COARSE_LOCATION
                                        )
                                    )
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                            ) {
                                Text("Grant", color = Colors.buttonText)
                            }
                        }
                    }
                }
            }
            
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
            
            // Activity Type Selector
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.lg),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    ActivityTypeButton(
                        text = "Run",
                        isSelected = selectedActivity == "Run",
                        onClick = { selectedActivity = "Run" },
                        modifier = Modifier.weight(1f)
                    )
                    ActivityTypeButton(
                        text = "Walk",
                        isSelected = selectedActivity == "Walk",
                        onClick = { selectedActivity = "Walk" },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
            
            item { Spacer(modifier = Modifier.height(Spacing.xl)) }
            
            // Target Distance
            item {
                TargetDistanceCard(
                    distance = targetDistance,
                    onDistanceChanged = { targetDistance = it }
                )
            }
            
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
            
            // Target Time
            item {
                TargetTimeCard(
                    isEnabled = isTargetTimeEnabled,
                    onEnabledChange = { isTargetTimeEnabled = it },
                    hours = targetHours,
                    minutes = targetMinutes,
                    seconds = targetSeconds,
                    onHoursChange = { if (it.length <= 2) targetHours = it },
                    onMinutesChange = { if (it.length <= 2) targetMinutes = it },
                    onSecondsChange = { if (it.length <= 2) targetSeconds = it }
                )
            }
            
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
            
            // Live Tracking
            item {
                LiveTrackingCard(
                    isEnabled = isLiveTrackingEnabled,
                    onToggle = { isLiveTrackingEnabled = it },
                    onAddObservers = { /* Navigate to friend selector */ }
                )
            }
            
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
            
            // Run with Friends
            item {
                RunWithFriendsCard(
                    onSetupGroupRun = { /* Navigate to group run setup */ }
                )
            }
            
            item { Spacer(modifier = Modifier.height(Spacing.xxl)) }
        }
        
        // Bottom Buttons
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Colors.backgroundRoot)
                .padding(Spacing.lg)
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                // Show "Generate Route" button if mode is "route"
                if (mode == "route") {
                    Button(
                        onClick = {
                            currentLocation?.let { (lat, lng) ->
                                val hours = targetHours.toIntOrNull() ?: 0
                                val minutes = targetMinutes.toIntOrNull() ?: 0
                                val seconds = targetSeconds.toIntOrNull() ?: 0
                                onGenerateRoute(
                                    targetDistance,
                                    isTargetTimeEnabled,
                                    hours,
                                    minutes,
                                    seconds,
                                    isLiveTrackingEnabled,
                                    false,
                                    lat,
                                    lng
                                )
                            }
                        },
                        enabled = currentLocation != null && !isGettingLocation,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        shape = RoundedCornerShape(BorderRadius.lg),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        )
                    ) {
                        if (isGettingLocation) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Colors.buttonText,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text(
                                text = "ACQUIRING GPS...",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                            )
                        } else if (currentLocation == null) {
                            Text(
                                text = "WAITING FOR GPS SIGNAL",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                            )
                        } else {
                            Icon(
                                painter = painterResource(id = R.drawable.icon_location_vector),
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text(
                                text = "GENERATE ROUTES",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                            )
                        }
                    }
                }
                
                // Show "Start Run" button if mode is "no_route"
                if (mode == "no_route") {
                    Button(
                        onClick = {
                            val hours = targetHours.toIntOrNull() ?: 0
                            val minutes = targetMinutes.toIntOrNull() ?: 0
                            val seconds = targetSeconds.toIntOrNull() ?: 0
                            onStartRunWithoutRoute(
                                targetDistance,
                                isTargetTimeEnabled,
                                hours,
                                minutes,
                                seconds
                            )
                        },
                        enabled = currentLocation != null && !isGettingLocation,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        shape = RoundedCornerShape(BorderRadius.lg),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        )
                    ) {
                        if (isGettingLocation) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Colors.buttonText,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text(
                                text = "ACQUIRING GPS...",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                            )
                        } else if (currentLocation == null) {
                            Text(
                                text = "WAITING FOR GPS SIGNAL",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                            )
                        } else {
                            Icon(
                                painter = painterResource(id = R.drawable.icon_navigation_vector),
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text(
                                text = "START RUN",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                            )
                        }
                    }
                }
                
                Text(
                    text = "Target: ${targetDistance.toInt()} km",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.xs),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
fun ActivityTypeButton(
    text: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(50.dp),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) Colors.primary else Colors.backgroundSecondary,
            contentColor = if (isSelected) Colors.buttonText else Colors.textPrimary
        )
    ) {
        Text(
            text = text,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
        )
    }
}

@Composable
fun TargetDistanceCard(distance: Float, onDistanceChanged: (Float) -> Unit) {
    Column(modifier = Modifier.padding(horizontal = Spacing.lg)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom
        ) {
            Text(
                text = "Target Distance",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(BorderRadius.sm))
                    .background(Colors.backgroundSecondary)
                    .padding(horizontal = Spacing.md, vertical = Spacing.sm)
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_location_vector),
                    contentDescription = null,
                    tint = Colors.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.xs))
                Text(
                    text = "%.0f km goal".format(distance),
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary
                )
            }
        }
        Spacer(modifier = Modifier.height(Spacing.md))
        Slider(
            value = distance,
            onValueChange = onDistanceChanged,
            valueRange = 1f..50f,
            modifier = Modifier.fillMaxWidth(),
            colors = SliderDefaults.colors(
                thumbColor = Colors.primary,
                activeTrackColor = Colors.primary,
                inactiveTrackColor = Colors.backgroundTertiary
            )
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("1 km", style = AppTextStyles.caption, color = Colors.textMuted)
            Text("50 km", style = AppTextStyles.caption, color = Colors.textMuted)
        }
    }
}

@Composable
fun LiveTrackingCard(
    isEnabled: Boolean,
    onToggle: (Boolean) -> Unit,
    onAddObservers: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.8f)
        )
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(50.dp)
                        .clip(CircleShape)
                        .background(Colors.backgroundTertiary),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_location_vector),
                        contentDescription = "Live Tracking",
                        tint = Colors.primary,
                        modifier = Modifier.size(28.dp)
                    )
                }
                
                Spacer(modifier = Modifier.width(Spacing.md))
                
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Live Tracking",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = "Share your location with friends",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
                
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(BorderRadius.full))
                        .clickable { onToggle(!isEnabled) }
                        .background(if (isEnabled) Colors.primary else Colors.backgroundTertiary)
                        .padding(horizontal = Spacing.md, vertical = Spacing.sm),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (isEnabled) "ON" else "OFF",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                        color = if (isEnabled) Colors.buttonText else Colors.textMuted
                    )
                }
            }
            
            if (isEnabled) {
                Spacer(modifier = Modifier.height(Spacing.md))
                Divider(color = Colors.backgroundTertiary)
                Spacer(modifier = Modifier.height(Spacing.md))
                
                Button(
                    onClick = onAddObservers,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(BorderRadius.md),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary.copy(alpha = 0.2f),
                        contentColor = Colors.primary
                    )
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_profile_vector),
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Add Observers", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

@Composable
fun RunWithFriendsCard(onSetupGroupRun: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .clickable(onClick = onSetupGroupRun),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.8f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(50.dp)
                    .clip(CircleShape)
                    .background(Colors.primary.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_profile_vector),
                    contentDescription = "Run with Friends",
                    tint = Colors.primary,
                    modifier = Modifier.size(28.dp)
                )
            }
            
            Spacer(modifier = Modifier.width(Spacing.md))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Run with Friends",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
                Text(
                    text = "Create a group run and invite friends",
                    style = AppTextStyles.small,
                    color = Colors.textMuted
                )
            }
            
            Icon(
                painter = painterResource(id = R.drawable.icon_play_vector),
                contentDescription = "Navigate",
                tint = Colors.textMuted,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}
