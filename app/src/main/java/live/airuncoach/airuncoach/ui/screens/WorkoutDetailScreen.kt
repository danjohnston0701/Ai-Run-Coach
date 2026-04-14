package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.HeartRateZones
import live.airuncoach.airuncoach.network.model.WorkoutDetails
import live.airuncoach.airuncoach.ui.components.PrepareRunOnWatchButton
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.RunSessionViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutDetailScreen(
    workout: WorkoutDetails,
    onNavigateBack: () -> Unit,
    onStartWorkout: (WorkoutDetails) -> Unit,
    onMarkComplete: (WorkoutDetails) -> Unit,
    onSkipWorkout: (WorkoutDetails) -> Unit = {}
) {
    val context = LocalContext.current
    val color = workoutTypeColor(workout.workoutType)
    val runSessionViewModel: RunSessionViewModel = hiltViewModel()
    val companionInstalled by runSessionViewModel.isWatchCompanionInstalled.collectAsState()
    // Drive watch send state from ViewModel (supports async prepare-coaching flow)
    val watchSendState by runSessionViewModel.watchSendState.collectAsState()

    // ── AI Coaching generation state ──────────────────────────────────────
    val coachingState by runSessionViewModel.coachingGenerationState.collectAsState()
    val isCoachingReady = coachingState == RunSessionViewModel.CoachingGenerationState.READY ||
                          coachingState == RunSessionViewModel.CoachingGenerationState.FAILED
    val isCoachingGenerating = coachingState == RunSessionViewModel.CoachingGenerationState.GENERATING

    // Trigger AI coaching generation as soon as the screen opens
    LaunchedEffect(workout.id) {
        if (workout.workoutType != "rest") {
            runSessionViewModel.generateCoachingForWorkout(workout.id)
        }
    }

    // ── GPS / permission state ─────────────────────────────────────────────
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        )
    }
    var isGettingLocation by remember { mutableStateOf(false) }
    var gpsReady by remember { mutableStateOf(false) }
    var gpsError by remember { mutableStateOf<String?>(null) }

    // Permission launcher
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        hasLocationPermission = granted
        if (!granted) gpsError = "Location permission denied"
    }

    // Request permission immediately on first load if not already granted
    LaunchedEffect(Unit) {
        if (!hasLocationPermission) {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    // Acquire GPS fix once we have permission
    LaunchedEffect(hasLocationPermission) {
        if (!hasLocationPermission) return@LaunchedEffect
        if (gpsReady) return@LaunchedEffect

        isGettingLocation = true
        gpsError = null
        Log.d("WorkoutDetail", "📡 Acquiring GPS fix...")

        try {
            val fusedClient = LocationServices.getFusedLocationProviderClient(context)

            @SuppressLint("MissingPermission")
            val location = suspendCancellableCoroutine { cont ->
                fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                    .addOnSuccessListener { loc -> cont.resume(loc) }
                    .addOnFailureListener { e ->
                        Log.w("WorkoutDetail", "High-accuracy failed, falling back to lastLocation", e)
                        fusedClient.lastLocation
                            .addOnSuccessListener { last -> cont.resume(last) }
                            .addOnFailureListener { cont.resume(null) }
                    }
            }

            if (location != null) {
                gpsReady = true
                Log.d("WorkoutDetail", "✅ GPS ready: ${location.latitude}, ${location.longitude}")
            } else {
                gpsError = "Unable to acquire GPS signal"
                Log.e("WorkoutDetail", "❌ GPS location returned null")
            }
        } catch (e: Exception) {
            gpsError = "GPS error: ${e.message}"
            Log.e("WorkoutDetail", "❌ Exception acquiring GPS", e)
        } finally {
            isGettingLocation = false
        }
    }

    // "Start This Workout" is only enabled once GPS is confirmed AND coaching is ready
    val canStart = hasLocationPermission && gpsReady && !isGettingLocation && isCoachingReady

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        workoutTypeLabel(workout.workoutType),
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(R.drawable.icon_arrow_back_vector), "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg)
        ) {

            // ── GPS status banner ──────────────────────────────────────────────
            if (workout.workoutType != "rest") {
                WorkoutGpsBanner(
                    hasPermission = hasLocationPermission,
                    isAcquiring = isGettingLocation,
                    isReady = gpsReady,
                    error = gpsError,
                    onGrantPermission = {
                        locationPermissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    },
                    onRetry = {
                        gpsError = null
                        gpsReady = false
                        // Re-trigger the LaunchedEffect by toggling permission state
                        hasLocationPermission = ContextCompat.checkSelfPermission(
                            context, Manifest.permission.ACCESS_FINE_LOCATION
                        ) == PackageManager.PERMISSION_GRANTED ||
                        ContextCompat.checkSelfPermission(
                            context, Manifest.permission.ACCESS_COARSE_LOCATION
                        ) == PackageManager.PERMISSION_GRANTED
                    }
                )
                Spacer(modifier = Modifier.height(Spacing.md))
            }

            // ── Hero section ───────────────────────────────────────────────────
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f)),
                shape = RoundedCornerShape(20.dp)
            ) {
                Column(modifier = Modifier.padding(Spacing.xl), horizontalAlignment = Alignment.CenterHorizontally) {
                    WorkoutTypeBadge(workout.workoutType)
                    Spacer(modifier = Modifier.height(Spacing.md))
                    Text(
                        workout.description ?: workoutTypeLabel(workout.workoutType),
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // ── Key stats ─────────────────────────────────────────────────────
            if (workout.workoutType != "rest") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    workout.distance?.let {
                        WorkoutStatCard(label = "Distance", value = "${it}km", icon = R.drawable.icon_target_vector, modifier = Modifier.weight(1f))
                    }
                    workout.targetPace?.let {
                        WorkoutStatCard(label = "Target Pace", value = it, icon = R.drawable.icon_timer_vector, modifier = Modifier.weight(1f))
                    }
                    workout.intensity?.let {
                        // Convert "z1" to "Zone 1", "z2" to "Zone 2", etc.
                        val zoneLabel = it.replace(Regex("^z([1-5])$")) { match -> "Zone ${match.groupValues[1].uppercase()}" }
                        WorkoutStatCard(label = "Intensity", value = zoneLabel, icon = R.drawable.icon_heart_vector, modifier = Modifier.weight(1f))
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))

                // ── Zone description and pace guidance ─────────────────────────────
                workout.intensity?.let { intensity ->
                    val zoneNumber = intensity.replace(Regex("[^0-9]"), "").toIntOrNull() ?: 2
                    val zoneInfo = HeartRateZones.getZoneInfo(zoneNumber)
                    
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, zoneInfo.run { 
                                when(zone) {
                                    1 -> Colors.success.copy(alpha = 0.3f)
                                    2 -> Colors.primary.copy(alpha = 0.3f)
                                    3 -> Colors.warning.copy(alpha = 0.3f)
                                    4, 5 -> Colors.error.copy(alpha = 0.3f)
                                    else -> Colors.textMuted.copy(alpha = 0.3f)
                                }
                            }, RoundedCornerShape(12.dp)),
                        colors = CardDefaults.cardColors(containerColor = zoneInfo.run { 
                            when(zone) {
                                1 -> Colors.success.copy(alpha = 0.05f)
                                2 -> Colors.primary.copy(alpha = 0.05f)
                                3 -> Colors.warning.copy(alpha = 0.05f)
                                4, 5 -> Colors.error.copy(alpha = 0.05f)
                                else -> Colors.backgroundSecondary
                            }
                        }),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(Spacing.lg)) {
                            Text(zoneInfo.name, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            
                            Text("What it feels like:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                            Text(zoneInfo.description, style = AppTextStyles.small, color = Colors.textSecondary)
                            
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text("Pace guidance:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                            Text(zoneInfo.paceGuidance, style = AppTextStyles.small, color = Colors.textSecondary)
                            
                            // Heart rate range (estimated for ~35 year old, max HR ~185)
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text("Target heart rate:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                            val estimatedMaxHR = 185 // Standard estimate for ~35 year old
                            val hrRange = HeartRateZones.getTargetHRRange(zoneNumber, estimatedMaxHR)
                            Text("Keep your HR between ${hrRange.first} and ${hrRange.last} beats per minute", style = AppTextStyles.small, color = Colors.textSecondary)
                            
                            Spacer(modifier = Modifier.height(Spacing.sm))
                            Text("Benefits:", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                            Text(zoneInfo.benefits, style = AppTextStyles.small, color = Colors.textSecondary)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ── Zone comparison chart (for Zone 2 focus) ──────────────────────
            workout.intensity?.let { intensity ->
                val zoneNumber = intensity.replace(Regex("[^0-9]"), "").toIntOrNull() ?: 2
                if (zoneNumber == 2) {
                    Text("How Zone 2 Compares", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(Spacing.lg)) {
                            // Zone 1
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Zone 1", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.success)
                                    Text("Recovery", style = AppTextStyles.small, color = Colors.textMuted)
                                }
                                Text("Resting walk", style = AppTextStyles.small, color = Colors.textSecondary)
                            }
                            
                            Spacer(modifier = Modifier.height(Spacing.md))
                            HorizontalDivider(color = Colors.backgroundSecondary, thickness = 0.5.dp)
                            Spacer(modifier = Modifier.height(Spacing.md))
                            
                            // Zone 2 (highlighted)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Colors.primary.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                                    .padding(Spacing.md),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Zone 2 (YOUR SESSION)", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.primary)
                                    Text("Aerobic/Endurance", style = AppTextStyles.small, color = Colors.textMuted)
                                }
                                Text("9–13 min/km", style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold), color = Colors.primary)
                            }
                            
                            Spacer(modifier = Modifier.height(Spacing.md))
                            HorizontalDivider(color = Colors.backgroundSecondary, thickness = 0.5.dp)
                            Spacer(modifier = Modifier.height(Spacing.md))
                            
                            // Zone 3
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Zone 3", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.warning)
                                    Text("Tempo", style = AppTextStyles.small, color = Colors.textMuted)
                                }
                                Text("Light jog", style = AppTextStyles.small, color = Colors.textSecondary)
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(Spacing.lg))
                }
            }

            // ── Instructions ──────────────────────────────────────────────────
            if (!workout.instructions.isNullOrEmpty()) {
                Text("Workout Instructions", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                Spacer(modifier = Modifier.height(Spacing.sm))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        workout.instructions,
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        modifier = Modifier.padding(Spacing.lg)
                    )
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ── Structure breakdown ───────────────────────────────────────────
            if (workout.workoutType == "intervals" || workout.workoutType == "tempo") {
                WorkoutStructureSection(workout)
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            // ── Why this workout ──────────────────────────────────────────────
            val why = workoutWhyText(workout.workoutType)
            Text("Why this workout?", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            Spacer(modifier = Modifier.height(Spacing.sm))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.primary.copy(alpha = 0.06f)),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(modifier = Modifier.padding(Spacing.lg)) {
                    Icon(painterResource(R.drawable.icon_ai_vector), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text(why, style = AppTextStyles.body, color = Colors.textSecondary)
                }
            }

            Spacer(modifier = Modifier.height(Spacing.xl))

            // ── Actions ───────────────────────────────────────────────────────
            if (workout.isCompleted) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, tint = Colors.success, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Workout Complete!", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.success)
                }
            } else if (workout.workoutType != "rest") {

                // ── AI Coaching generation banner ──────────────────────────
                AiCoachingGenerationBanner(
                    state = coachingState,
                    modifier = Modifier.padding(bottom = Spacing.sm)
                )

                // "Prepare Run on Watch" — only shown when companion app is installed on watch
                // Disabled while coaching is still generating
                PrepareRunOnWatchButton(
                    companionInstalled = companionInstalled && isCoachingReady,
                    sendState = watchSendState,
                    onPrepare = {
                        runSessionViewModel.prepareRunOnWatchWithCoaching(
                            workoutId        = workout.id,
                            distanceKm       = workout.distance?.toFloat() ?: 0f,
                            workoutType      = workout.workoutType,
                            workoutIntensity = workout.intensity,
                            targetPace       = workout.targetPace,
                            intervalCount    = workout.intervalCount,
                            intervalDistKm   = workout.intervalDistanceMeters?.let { it / 1000f },
                            intervalDurSecs  = workout.intervalDurationSeconds
                        )
                    },
                    modifier = Modifier.padding(bottom = Spacing.sm)
                )

                Button(
                    onClick = { onStartWorkout(workout) },
                    enabled = canStart,
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        disabledContainerColor = Colors.primary.copy(alpha = 0.35f)
                    ),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    if (isCoachingGenerating) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = Colors.buttonText
                        )
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text("Preparing AI Coaching…", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                    } else if (isGettingLocation) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = Colors.buttonText
                        )
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text("Acquiring GPS…", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                    } else if (!hasLocationPermission) {
                        Icon(Icons.Default.LocationOn, null, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text("Location Required", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                    } else {
                        Icon(painterResource(R.drawable.icon_play_vector), null, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text("Start This Workout", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.sm))
                OutlinedButton(
                    onClick = { onMarkComplete(workout) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Mark as Done (no GPS)", style = AppTextStyles.body)
                }
                Spacer(modifier = Modifier.height(Spacing.sm))
                OutlinedButton(
                    onClick = { onSkipWorkout(workout) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.textMuted)
                ) {
                    Icon(painterResource(R.drawable.icon_x_vector), null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Skip Session", style = AppTextStyles.body)
                }
            } else {
                // Rest day
                Button(
                    onClick = { onMarkComplete(workout) },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.success),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Icon(painterResource(R.drawable.icon_check_vector), null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Log Rest Day", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                }
            }

            Spacer(modifier = Modifier.height(Spacing.xl))
        }
    }
}

// ── AI Coaching generation banner ─────────────────────────────────────────────

/**
 * Displays a bottom banner showing the AI coaching generation progress.
 *
 * States:
 *  - IDLE / not shown (handled externally)
 *  - GENERATING → pulsing cyan banner "Generating your AI coaching plan…"
 *  - READY       → green banner "AI coaching ready" (auto-hides after short display)
 *  - FAILED      → subtle amber notice "Coaching unavailable — run will still be tracked"
 */
@Composable
private fun AiCoachingGenerationBanner(
    state: RunSessionViewModel.CoachingGenerationState,
    modifier: Modifier = Modifier
) {
    if (state == RunSessionViewModel.CoachingGenerationState.IDLE) return

    val pulse by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 0.5f,
        targetValue  = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    val bgColor: Color
    val accentColor: Color
    val icon: String
    val message: String
    when (state) {
        RunSessionViewModel.CoachingGenerationState.GENERATING -> {
            bgColor     = Color(0xFF001A2E)
            accentColor = Color(0xFF00E5FF)
            icon        = "⚡"
            message     = "Generating your AI coaching plan…"
        }
        RunSessionViewModel.CoachingGenerationState.READY -> {
            bgColor     = Color(0xFF001A14)
            accentColor = Color(0xFF00FF88)
            icon        = "✓"
            message     = "AI coaching ready"
        }
        RunSessionViewModel.CoachingGenerationState.FAILED -> {
            bgColor     = Color(0xFF1A1200)
            accentColor = Color(0xFFFFB300)
            icon        = "⚠"
            message     = "Coaching unavailable — run will still be tracked"
        }
        else -> return
    }

    val dynamicAlpha = if (state == RunSessionViewModel.CoachingGenerationState.GENERATING) pulse else 1f

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(bgColor)
            .border(
                width = 1.dp,
                color = accentColor.copy(alpha = dynamicAlpha),
                shape = RoundedCornerShape(12.dp)
            )
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (state == RunSessionViewModel.CoachingGenerationState.GENERATING) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = accentColor
                )
            } else {
                Text(icon, fontSize = 14.sp, color = accentColor)
            }
            Column {
                Text(
                    message,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor.copy(alpha = dynamicAlpha)
                )
                if (state == RunSessionViewModel.CoachingGenerationState.GENERATING) {
                    Text(
                        "Preparing phases, triggers & pacing targets for this session",
                        fontSize = 11.sp,
                        color = accentColor.copy(alpha = 0.6f)
                    )
                }
            }
        }
    }
}

// ── GPS status banner ─────────────────────────────────────────────────────────

@Composable
private fun WorkoutGpsBanner(
    hasPermission: Boolean,
    isAcquiring: Boolean,
    isReady: Boolean,
    error: String?,
    onGrantPermission: () -> Unit,
    onRetry: () -> Unit
) {
    // Once GPS is locked, hide the banner entirely — no need to celebrate, just unblock the button
    if (isReady) return

    val title = when {
        !hasPermission -> "Location permission required"
        isAcquiring    -> "Acquiring GPS signal…"
        error != null  -> "GPS signal unavailable"
        else           -> "Waiting for GPS…"
    }
    val subtitle = when {
        !hasPermission -> "Tap Grant below to enable location access"
        isAcquiring    -> "Please wait — this usually takes a few seconds"
        error != null  -> error
        else           -> "Please wait…"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = if (isAcquiring) Colors.primary.copy(alpha = 0.08f)
                             else Colors.error.copy(alpha = 0.12f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isAcquiring) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = Colors.primary
                )
            } else {
                Icon(
                    Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = Colors.error,
                    modifier = Modifier.size(20.dp)
                )
            }

            Spacer(modifier = Modifier.width(Spacing.sm))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                    color = if (isAcquiring) Colors.primary else Colors.error
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }

            when {
                !hasPermission -> Button(
                    onClick = onGrantPermission,
                    shape = RoundedCornerShape(BorderRadius.full),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    Text("Grant", color = Colors.buttonText, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold))
                }
                error != null -> TextButton(onClick = onRetry) {
                    Text("Retry", color = Colors.primary, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

// ── Shared helpers (unchanged) ────────────────────────────────────────────────

@Composable
fun WorkoutStatCard(label: String, value: String, icon: Int, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(Spacing.md).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(painterResource(icon), null, tint = Colors.primary, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.height(4.dp))
            Text(value, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            Text(label, style = AppTextStyles.small, color = Colors.textMuted)
        }
    }
}

@Composable
fun WorkoutStructureSection(workout: WorkoutDetails) {
    Text("Workout Structure", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
    Spacer(modifier = Modifier.height(Spacing.sm))

    val structure: List<Triple<String, String, Color>> = when (workout.workoutType) {
        "intervals" -> listOf(
            Triple("Warm-up", "10 min easy (Zone 2)", Colors.success),
            Triple("Work intervals", workout.instructions ?: "Repeat as prescribed", Colors.error),
            Triple("Cool-down", "5 min easy", Colors.success)
        )
        "tempo" -> listOf(
            Triple("Warm-up", "10 min easy (Zone 2)", Colors.success),
            Triple("Tempo", "${workout.instructions ?: "Sustained effort"} (Zone 4)", Colors.warning),
            Triple("Cool-down", "5 min easy", Colors.success)
        )
        else -> emptyList()
    }

    structure.forEach { (phase, detail, color) ->
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
            shape = RoundedCornerShape(10.dp)
        ) {
            Row(modifier = Modifier.padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.width(4.dp).height(40.dp).background(color, RoundedCornerShape(2.dp)))
                Spacer(modifier = Modifier.width(Spacing.md))
                Column {
                    Text(phase, style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    Text(detail, style = AppTextStyles.small, color = Colors.textSecondary)
                }
            }
        }
        Spacer(modifier = Modifier.height(Spacing.sm))
    }
}

fun workoutWhyText(type: String) = when (type) {
    "easy" -> "Easy runs build your aerobic base — the foundation of all running fitness. These runs train your body to burn fat efficiently and prepare you for harder sessions later in the week."
    "long_run" -> "The long run is the cornerstone of your training. It builds endurance, teaches your body to manage fuel over time, and builds the mental resilience needed for race day."
    "tempo" -> "Tempo runs raise your lactate threshold — the pace you can sustain before fatigue kicks in. This is the most direct route to running faster for longer."
    "intervals" -> "High-intensity intervals improve your VO₂ max (maximal oxygen uptake) and running economy. Short bursts at race effort or faster teach your body to move more efficiently."
    "hill_repeats" -> "Hill repeats build strength, power, and running form. They're resistance training for runners — building the muscles needed to sustain pace when tired."
    "recovery" -> "Recovery runs flush out fatigue from hard sessions without adding stress. They keep your legs moving and set you up for the next quality session."
    "rest" -> "Rest is where adaptation happens. Your body repairs muscle, replenishes glycogen, and grows stronger. Skipping rest leads to injury and underperformance."
    else -> "This workout is prescribed by your AI coach to optimally develop your running fitness towards your goal."
}
