@file:OptIn(androidx.compose.animation.ExperimentalAnimationApi::class)

package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.with
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Scaffold
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.ExploreOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.PolyUtil
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.SphericalUtil

import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.util.RunConfigHolder
import live.airuncoach.airuncoach.viewmodel.RunSessionViewModel
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * RunSessionScreenElite
 *
 * Modes:
 * 1) Route Mode (hasRoute = true)  -> keep similar (map + route UI)
 * 2) Garmin Elite+ (hasRoute = false, Garmin connected) -> Effort Core + adaptive insight layers
 * 3) Free Run Elite (hasRoute = false, no Garmin) -> performance dashboard (pace/elevation/cadence/score)
 *
 * NOTE:
 * - AI coach text clears automatically when your ViewModel sets latestCoachMessage=null after TTS playback completes.
 * - This screen already behaves correctly once you wire that helper callback.
 */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RunSessionScreen(
    hasRoute: Boolean,
    onEndRun: (String) -> Unit,
    onCancel: () -> Unit = {},
    viewModel: RunSessionViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val runState by viewModel.runState.collectAsState()
    val runSession by viewModel.runSession.collectAsState()

    var showMap by remember { mutableStateOf(hasRoute) }
    var routePolyline by remember { mutableStateOf<String?>(null) }
    var showPauseConfirm by remember { mutableStateOf(false) }
    var showStopConfirm by remember { mutableStateOf(false) }

    val isRunActive = runState.isRunning || runState.isPaused

    val isGarminConnected = remember(runSession) {
        false // wire later
    }

    // Navigate to run summary when upload completes
    // isStopping = true means the run was stopped in THIS session (not stale from previous run)
    // isRunning/isPaused = true means the run is actively in progress
    LaunchedEffect(runState.backendRunId) {
        runState.backendRunId?.let { backendId ->
            if (runState.isRunning || runState.isPaused || runState.isStopping) {
                Log.d("RunSessionScreen", "Navigating to run summary: $backendId")
                onEndRun(backendId)
            } else {
                // Stale value from previous run - ignore
                Log.d("RunSessionScreen", "Ignoring stale backendRunId from previous run: $backendId")
            }
        }
    }

    BackHandler(enabled = isRunActive) {}

    val cameraPositionState = rememberCameraPositionState()

    val audioPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted ->
            if (isGranted) viewModel.startListening()
        }
    )

    LaunchedEffect(Unit) {
        RunConfigHolder.getConfig()?.let { config ->
            viewModel.setRunConfig(config)
            routePolyline = config.route?.polyline
        }
        
        // Only prepare run (show pre-run briefing) if NOT resuming an active run
        // This prevents the briefing from playing again when resuming from Dashboard
        if (!runState.isRunning && !runState.isPaused) {
            viewModel.prepareRun()
        }
    }

    // ✅ NEW ARCHITECTURE
    Scaffold(
        containerColor = Colors.backgroundRoot,

        bottomBar = {
            ControlButtons(
                isRunning = runState.isRunning,
                isPaused = runState.isPaused,
                isStopping = runState.isStopping,
                onStart = { viewModel.startRun() },
                onPause = { showPauseConfirm = true },
                onResume = { viewModel.resumeRun() },
                onStop = { showStopConfirm = true },
                onCancel = onCancel,
                onSimulate = { viewModel.startSimulatedRun() }
            )
        }

    ) { padding ->

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(
                bottom = 120.dp
            ),
            verticalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {

            item {
                TopBarSection(
                    isCoachEnabled = runState.isCoachEnabled,
                    isMuted = runState.isMuted,
                    actionsEnabled = !isRunActive,
                    micEnabled = true,
                    onCoachToggle = { viewModel.toggleCoach() },
                    onMicClick = {
                        when (PackageManager.PERMISSION_GRANTED) {
                            ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.RECORD_AUDIO
                            ) -> viewModel.startListening()

                            else -> audioPermissionLauncher.launch(
                                Manifest.permission.RECORD_AUDIO
                            )
                        }
                    },
                    onShareClick = {},
                    onCloseClick = {}
                )
            }

            item {

                when {
                    hasRoute -> {

                        // 1️⃣ Elite Rings Dashboard (same as Free Mode)
                        FreeRunEliteDashboard(
                            time = runState.time,
                            distanceKmStr = runState.distance,
                            paceStr = runState.pace, //Avg Pace
                            currentPaceStr = runState.currentPace, //Realtime Pace
                            cadenceStr = runState.cadence,
                            heartRateStr = runState.heartRate,
                            aiCoachMessage = runState.latestCoachMessage,
                            aiSpeaking = runState.latestCoachMessage != null || runState.isLoadingBriefing,
                            isRunning = runState.isRunning,
                            isLoadingBriefing = runState.isLoadingBriefing
                        )

                        // 2️⃣ Route Map (NEW ELITE VERSION)
                        EliteRouteMap(
                            runSession = runSession,
                            routePolyline = routePolyline
                        )

                        // 3️⃣ AI Coach Panel (navigation + insights)
                        AiCoachLivePanel(
                            message = runState.latestCoachMessage,
                            isLoading = runState.isLoadingBriefing,
                            modifier = Modifier.padding(horizontal = Spacing.md)
                        )
                    }

                    isGarminConnected -> {

                        GarminElitePlusDashboard(
                            time = runState.time,
                            paceStr = runState.pace,
                            cadenceStr = runState.cadence,
                            heartRateStr = runState.heartRate,
                            powerWatts = null,
                            hrZone = null,
                            insightText = runState.latestCoachMessage,
                            aiSpeaking = runState.latestCoachMessage != null
                                    || runState.isLoadingBriefing,
                            isRunning = runState.isRunning,
                            isLoadingBriefing = runState.isLoadingBriefing
                        )

                        AiCoachLivePanel(
                            message = runState.latestCoachMessage,
                            isLoading = runState.isLoadingBriefing,
                            modifier = Modifier.padding(horizontal = Spacing.md)
                        )
                    }

                    else -> {

                        FreeRunEliteDashboard(
                            time = runState.time,
                            distanceKmStr = runState.distance,
                            paceStr = runState.pace,
                            currentPaceStr = runState.currentPace,
                            cadenceStr = runState.cadence,
                            heartRateStr = runState.heartRate,
                            aiCoachMessage = runState.latestCoachMessage,
                            aiSpeaking = runState.latestCoachMessage != null
                                    || runState.isLoadingBriefing,
                            isRunning = runState.isRunning,
                            isLoadingBriefing = runState.isLoadingBriefing
                        )

                        AiCoachLivePanel(
                            message = runState.latestCoachMessage,
                            isLoading = runState.isLoadingBriefing,
                            modifier = Modifier.padding(horizontal = Spacing.md)
                        )
                    }
                }
            }
        }
    }

    // Dialogs unchanged
    if (showPauseConfirm) {
        AlertDialog(
            onDismissRequest = { showPauseConfirm = false },
            title = { Text("Pause run?") },
            text = { Text("This will pause tracking until you resume.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showPauseConfirm = false
                        viewModel.pauseRun()
                    }
                ) { Text("Pause") }
            },
            dismissButton = {
                TextButton(
                    onClick = { showPauseConfirm = false }
                ) { Text("Cancel") }
            }
        )
    }

    if (showStopConfirm) {
        AlertDialog(
            onDismissRequest = { showStopConfirm = false },
            title = { Text("Stop run?") },
            text = { Text("This will end the session and save your run.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showStopConfirm = false
                        viewModel.stopRun()
                    },
                    enabled = !runState.isStopping
                ) { Text("Stop") }
            },
            dismissButton = {
                TextButton(
                    onClick = { showStopConfirm = false },
                    enabled = !runState.isStopping
                ) { Text("Cancel") }
            }
        )
    }
}

/* =====================================================================================
   ROUTE MODE UI (kept similar)
===================================================================================== */

@Composable
fun PremiumMetricsRow3(time: String, distance: String, pace: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        verticalAlignment = Alignment.CenterVertically
    ) {
        MetricColumnSimple("TIME", time, isPrimary = true, modifier = Modifier)
        VerticalDividerSubtle()
        MetricColumnSimple("DISTANCE", distance, unit = "km", modifier = Modifier)
        VerticalDividerSubtle()
        MetricColumnSimple("AVG PACE", pace, unit = "/km", modifier = Modifier)
    }
}

@Composable
fun MetricColumnSimple(
    label: String,
    value: String,
    unit: String? = null,
    isPrimary: Boolean = false,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = label,
            style = AppTextStyles.caption,
            color = Colors.textMuted,
            fontSize = 10.sp
        )
        Spacer(modifier = Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            AnimatedContent(
                targetState = value,
                label = "metric_$label",
                transitionSpec = {
                    fadeIn(tween(200)) togetherWith fadeOut(tween(120)) using SizeTransform(clip = false)
                }
            ) { v ->
                Text(
                    text = v,
                    style = if (isPrimary) AppTextStyles.h1 else AppTextStyles.h2,
                    color = Colors.textPrimary,
                    fontWeight = FontWeight.Bold
                )
            }
            unit?.let {
                Text(
                    text = it,
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    fontSize = 10.sp,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }
        }
    }
}

@Composable
fun VerticalDividerSubtle() {
    Box(
        modifier = Modifier
            .height(40.dp)
            .width(1.dp)
            .background(Colors.textMuted.copy(alpha = 0.12f))
    )
}

@Composable
fun CoachMessageSectionPremium(
    coachText: String,
    aiIsSpeaking: Boolean,
    isRunning: Boolean,
    isLoadingBriefing: Boolean
) {
    val glow by animateFloatAsState(
        targetValue = if (aiIsSpeaking || isLoadingBriefing) 1f else 0f,
        animationSpec = tween(500, easing = FastOutSlowInEasing),
        label = "coach_glow"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(Spacing.md),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Coach Avatar (reuse your asset)
        Box(
            modifier = Modifier
                .size(108.dp)
                .padding(bottom = Spacing.sm),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .size(108.dp)
                    .clip(CircleShape)
                    .background(Colors.primary.copy(alpha = 0.08f))
            )
            Image(
                painter = painterResource(id = R.drawable.ai_coach_avatar),
                contentDescription = "AI Coach Avatar",
                modifier = Modifier
                    .size(92.dp)
                    .clip(CircleShape)
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Colors.backgroundSecondary.copy(alpha = 0.85f))
                .drawBehind {
                    if (glow > 0f) {
                        drawRect(
                            brush = Brush.radialGradient(
                                colors = listOf(Colors.primary.copy(alpha = 0.18f * glow), Color.Transparent),
                                center = center,
                                radius = size.minDimension * 1.2f
                            )
                        )
                    }
                }
                .padding(Spacing.md),
            contentAlignment = Alignment.Center
        ) {
            if (isLoadingBriefing) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Colors.primary)
            } else {
                Text(
                    text = coachText,
                    style = AppTextStyles.body,
                    color = Colors.primary,
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.Medium,
                    fontSize = 16.sp
                )
            }
        }

        if (isRunning && !isLoadingBriefing) {
            Spacer(modifier = Modifier.height(Spacing.md))
            BreathingWave(active = true, glow = aiIsSpeaking, modifier = Modifier.fillMaxWidth().height(52.dp))
        }
    }
}

/* =====================================================================================
   GARMIN ELITE+ MODE (Effort Core + adaptive minimal insight)
===================================================================================== */

@Composable
fun GarminElitePlusDashboard(
    time: String,
    paceStr: String,
    cadenceStr: String,
    heartRateStr: String,
    powerWatts: Int?,         // wire later
    hrZone: Int?,             // wire later
    insightText: String?,     // shows while AI speaking (clears after TTS completion)
    aiSpeaking: Boolean,
    isRunning: Boolean,
    isLoadingBriefing: Boolean,
    modifier: Modifier = Modifier
) {
    val hr = heartRateStr.toIntOrNull()?.takeIf { it > 0 }
    val cadence = cadenceStr.toIntOrNull()?.takeIf { it > 0 }
    val paceSec = parsePaceToSeconds(paceStr).takeIf { it > 0 }

    val effortMode = when {
        powerWatts != null -> "POWER"
        hr != null -> "HR"
        paceSec != null -> "PACE"
        else -> "EFFORT"
    }

    val effortPercent = remember(powerWatts, hr, paceSec) {
        when {
            powerWatts != null -> (powerWatts / 450f).coerceIn(0f, 1f) // placeholder scale
            hr != null -> ((hr - 90) / 90f).coerceIn(0f, 1f)
            paceSec != null -> paceIntensity(paceSec)
            else -> 0.35f
        }
    }

    val ringColor = remember(hrZone, hr) {
        when (hrZone) {
            1 -> Color(0xFF94A3B8)
            2 -> Color(0xFF10B981)
            3 -> Color(0xFF38BDF8)
            4 -> Color(0xFFF59E0B)
            5 -> Color(0xFFEF4444)
            else -> Colors.primary
        }
    }

    val effortLabel = remember(effortPercent, effortMode) {
        when {
            effortPercent < 0.35f -> "CONTROLLED"
            effortPercent < 0.60f -> "STEADY"
            effortPercent < 0.78f -> "BUILD"
            effortPercent < 0.92f -> "THRESHOLD"
            else -> "REDLINE"
        } + " · $effortMode"
    }

    // Minimal derived stability/fatigue placeholders (wire to real running dynamics later)
    val fatigue = remember(hr, effortPercent, cadence) {
        computeFatigueProxy(hr, effortPercent, cadence).coerceIn(0, 100)
    }
    val stability = remember(cadence, paceSec) {
        computeStabilityProxy(cadence, paceSec).coerceIn(0, 100)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(Spacing.md))

        // Small status row
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (isRunning) Color(0xFF10B981).copy(alpha = 0.16f) else Color.Gray.copy(alpha = 0.14f))
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Text(
                    text = if (isRunning) "LIVE" else "READY",
                    style = AppTextStyles.caption,
                    color = if (isRunning) Color(0xFF10B981) else Color.Gray,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(modifier = Modifier)

            // small readiness chip (use wellness later)
            TinyChip(
                title = "FATIGUE",
                value = "$fatigue",
                tint = if (fatigue < 45) Color(0xFF10B981) else if (fatigue < 70) Color(0xFFF59E0B) else Color(0xFFEF4444)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.lg))

        EffortCoreRing(
            time = time,
            label = effortLabel,
            progress = effortPercent,
            ringColor = ringColor,
            heartRate = hr,
            insight = insightText,
            aiSpeaking = aiSpeaking || isLoadingBriefing
        )

        Spacer(modifier = Modifier.height(Spacing.lg))

        // Minimal triad: Pace / Cadence / (Power or HR)
        CinematicMetricRow(
            paceStr = paceStr.takeIf { it.isNotBlank() && it != "0:00" },
            cadence = cadence,
            powerWatts = powerWatts,
            heartRate = hr
        )

        Spacer(modifier = Modifier.height(Spacing.md))

        // Adaptive micro-panels (only show if running)
        if (isRunning) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                MinimalMeterCard(
                    title = "STABILITY",
                    value = stability,
                    note = if (stability >= 80) "Balanced" else "Drifting",
                    modifier = Modifier,
                    tint = if (stability >= 80) Color(0xFF10B981) else Color(0xFFF59E0B)
                )
                MinimalMeterCard(
                    title = "EFFORT LOAD",
                    value = (effortPercent * 100).toInt(),
                    note = effortLabel.substringBefore("·").trim().lowercase().replaceFirstChar { it.uppercase() },
                    modifier = Modifier,
                    tint = ringColor
                )
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            ElevationPowerStrip(
                // Placeholder values until you wire elevation/power history
                elevationSeries = remember { listOf(0.40f, 0.45f, 0.52f, 0.50f, 0.58f, 0.63f, 0.60f) },
                powerSeries = remember { listOf(0.55f, 0.58f, 0.62f, 0.60f, 0.68f, 0.70f, 0.66f) },
                show = true
            )
        }

        Spacer(modifier = Modifier.height(Spacing.md))

        if (aiSpeaking || isLoadingBriefing) {
            AiGlowStrip(isLoading = isLoadingBriefing, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
fun EffortCoreRing(
    time: String,
    label: String,
    progress: Float,
    ringColor: Color,
    heartRate: Int?,
    insight: String?,
    aiSpeaking: Boolean
) {
    val animatedProgress by animateFloatAsState(
        targetValue = progress.coerceIn(0f, 1f),
        animationSpec = tween(900, easing = FastOutSlowInEasing),
        label = "effort_progress"
    )

    val beatMs = heartRate?.takeIf { it > 0 }?.let { max(250, 60000 / it) } ?: 1100
    val infinite = rememberInfiniteTransition(label = "effort_pulse")
    val pulse by infinite.animateFloat(
        initialValue = 0.985f,
        targetValue = 1.015f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = beatMs, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )

    val glow by animateFloatAsState(
        targetValue = if (aiSpeaking) 1f else 0f,
        animationSpec = tween(600, easing = FastOutSlowInEasing),
        label = "ai_glow"
    )

    Box(contentAlignment = Alignment.Center) {
        Canvas(
            modifier = Modifier
                .size(288.dp)
                .drawBehind {
                    if (glow > 0f) {
                        drawRect(
                            brush = Brush.radialGradient(
                                colors = listOf(ringColor.copy(alpha = 0.18f * glow), Color.Transparent),
                                center = center,
                                radius = size.minDimension * 0.95f
                            )
                        )
                    }
                }
        ) {
            val stroke = 22.dp.toPx()
            val pad = stroke / 2f + 4.dp.toPx()
            val diameter = min(size.width, size.height) - pad * 2
            val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
            val rect = Rect(topLeft, Size(diameter, diameter))

            // Background arc
            drawArc(
                color = Colors.textMuted.copy(alpha = 0.14f),
                startAngle = -215f,
                sweepAngle = 250f,
                useCenter = false,
                topLeft = rect.topLeft,
                size = rect.size,
                style = Stroke(width = stroke, cap = StrokeCap.Round)
            )

            // Active arc (slight pulse scaling)
            val pulsedSweep = 250f * animatedProgress
            drawArc(
                color = ringColor,
                startAngle = -215f,
                sweepAngle = pulsedSweep,
                useCenter = false,
                topLeft = rect.topLeft,
                size = rect.size,
                style = Stroke(width = stroke * pulse, cap = StrokeCap.Round)
            )
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = time,
                style = AppTextStyles.h1,
                color = Colors.textPrimary,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 44.sp
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = label,
                style = AppTextStyles.body,
                color = ringColor,
                fontWeight = FontWeight.SemiBold
            )

            AnimatedVisibility(
                visible = !insight.isNullOrBlank(),
                enter = fadeIn(tween(200)),
                exit = fadeOut(tween(160))
            ) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = insight.orEmpty(),
                    style = AppTextStyles.body,
                    color = Colors.primary,
                    textAlign = TextAlign.Center,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(horizontal = 28.dp)
                )
            }
        }
    }
}

@Composable
fun CinematicMetricRow(
    paceStr: String?,
    cadence: Int?,
    powerWatts: Int?,
    heartRate: Int?
) {
    val items = buildList {
        paceStr?.let { add(Triple("PACE", it, "/km")) }
        cadence?.let { add(Triple("CADENCE", it.toString(), "spm")) }
        when {
            powerWatts != null -> add(Triple("POWER", powerWatts.toString(), "w"))
            heartRate != null -> add(Triple("HR", heartRate.toString(), "bpm"))
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.55f))
            .padding(vertical = Spacing.md, horizontal = Spacing.md),
        verticalAlignment = Alignment.CenterVertically
    ) {
        items.forEachIndexed { index, (label, value, unit) ->
            Column(
                modifier = Modifier,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(text = label, style = AppTextStyles.caption, color = Colors.textMuted, fontSize = 10.sp)
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(text = value, style = AppTextStyles.h2, color = Colors.textPrimary, fontWeight = FontWeight.Bold)
                    Text(text = unit, style = AppTextStyles.caption, color = Colors.textMuted, fontSize = 10.sp, modifier = Modifier.padding(bottom = 4.dp))
                }
            }

            if (index != items.lastIndex) {
                Box(
                    modifier = Modifier
                        .height(34.dp)
                        .width(1.dp)
                        .background(Colors.textMuted.copy(alpha = 0.12f))
                )
            }
        }
    }
}

@Composable
fun MinimalMeterCard(
    title: String,
    value: Int,
    note: String,
    tint: Color,
    modifier: Modifier = Modifier
) {
    val animated by animateIntAsState(
        targetValue = value.coerceIn(0, 100),
        animationSpec = tween(600, easing = FastOutSlowInEasing),
        label = "meter_$title"
    )
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.55f))
            .padding(Spacing.md)
    ) {
        Column {
            Text(text = title, style = AppTextStyles.caption, color = Colors.textMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(text = note, style = AppTextStyles.body, color = Colors.textPrimary, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(Spacing.sm))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(10.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Colors.textMuted.copy(alpha = 0.14f))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(animated / 100f)
                        .clip(RoundedCornerShape(999.dp))
                        .background(tint.copy(alpha = 0.95f))
                )
            }

            Spacer(modifier = Modifier.height(6.dp))
            Text(text = "$animated%", style = AppTextStyles.caption, color = Colors.textMuted, fontSize = 11.sp)
        }
    }
}

@Composable
fun ElevationPowerStrip(
    elevationSeries: List<Float>,
    powerSeries: List<Float>,
    show: Boolean
) {
    if (!show) return

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.45f))
            .padding(Spacing.md)
    ) {
        Column {
            Text(
                text = "TERRAIN · EFFORT",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(Spacing.sm))

            MiniDualSparkline(
                a = elevationSeries,
                b = powerSeries,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp)
            )

            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Elevation (grey) vs Effort (accent)",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 11.sp
            )
        }
    }
}

@Composable
fun MiniDualSparkline(a: List<Float>, b: List<Float>, modifier: Modifier = Modifier) {
    val aPts = a.map { it.coerceIn(0f, 1f) }
    val bPts = b.map { it.coerceIn(0f, 1f) }

    Canvas(modifier = modifier) {
        if (aPts.size < 2 || bPts.size < 2) return@Canvas
        val n = min(aPts.size, bPts.size)
        val w = size.width
        val h = size.height
        val step = w / (n - 1).toFloat()

        fun pathFor(values: List<Float>): Path {
            val p = Path()
            for (i in 0 until n) {
                val x = step * i
                val y = h - (values[i] * h)
                if (i == 0) p.moveTo(x, y) else p.lineTo(x, y)
            }
            return p
        }

        // baseline
        drawLine(
            color = Colors.textMuted.copy(alpha = 0.10f),
            start = Offset(0f, h - 1f),
            end = Offset(w, h - 1f),
            strokeWidth = 1.dp.toPx()
        )

        // elevation (grey)
        drawPath(
            path = pathFor(aPts.take(n)),
            color = Colors.textMuted.copy(alpha = 0.45f),
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
        )

        // effort/power (accent)
        drawPath(
            path = pathFor(bPts.take(n)),
            color = Colors.primary.copy(alpha = 0.95f),
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
        )
    }
}

@Composable
fun TinyChip(title: String, value: String, tint: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.55f))
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = title, style = AppTextStyles.caption, color = Colors.textMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.width(8.dp))
            Text(text = value, style = AppTextStyles.body, color = tint, fontWeight = FontWeight.Bold)
        }
    }
}

/* =====================================================================================
   FREE RUN ELITE MODE V2 (professional insights and Rings Based dashboarded data)
   ===================================================================================== */
@Composable
fun FreeRunEliteDashboard(
    time: String,
    distanceKmStr: String,
    paceStr: String, // Average pace for the run
    currentPaceStr: String, // Real-time/instant pace from recent GPS
    cadenceStr: String,
    heartRateStr: String,
    aiCoachMessage: String?,
    aiSpeaking: Boolean,
    isRunning: Boolean,
    isLoadingBriefing: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        Spacer(modifier = Modifier.height(12.dp)) // Reduced from 24.dp (50%)

        // TIME
        Text(
            text = time,
            style = AppTextStyles.h1,
            fontSize = 44.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Colors.textPrimary
        )

        Spacer(modifier = Modifier.height(18.dp)) // Reduced from 36.dp (50%)

        // RING GRID
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(350.dp) // Reduced from 420.dp
                .padding(vertical = 12.dp) // Reduced from 16.dp
                .drawBehind {

                    val center = Offset(size.width / 2f, size.height / 2f)

                    drawRect(
                        brush = Brush.radialGradient(
                            colors = listOf(
                                Colors.backgroundRoot.copy(alpha = 0.7f),
                                Colors.backgroundRoot.copy(alpha = 1f)
                            ),
                            center = center,
                            radius = size.minDimension * 0.8f
                        )
                    )
                }
        ) {

            Column(
                verticalArrangement = Arrangement.spacedBy(16.dp) // Reduced from 32.dp (50%)
            ) {

                Row(
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    MetricRing(
                        label = "Distance (km)",
                        value = distanceKmStr,
                        unit = "",
                        baseColor = Color(0xFF34D399)
                    )

                    // LIVE PACE (real-time)
                    MetricRing(
                        label = "Pace (/km)",
                        value = currentPaceStr,
                        unit = "",
                        baseColor = Color(0xFF3B82F6) // blue
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    MetricRing(
                        label = "Cadence",
                        value = cadenceStr,
                        unit = "",
                        baseColor = Color(0xFFFBBF24) // Yellow - was teal
                    )

                    // AVG PACE
                    MetricRing(
                        label = "Avg Pace (/km)",
                        value = paceStr,
                        unit = "",
                        baseColor = Color(0xFF10B981) // green
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp)) // Reduced from 24.dp (50%)

    }
}

/* =====================================================================================
   FREE RUN ELITE MODE (Olympic Ring UI Design)
   ===================================================================================== */

@Composable
fun MetricRing(
    label: String,
    value: String,
    unit: String,
    baseColor: Color,
    modifier: Modifier = Modifier,
    isSmallValue: Boolean = false
) {
    Box(
        modifier = modifier
            .size(165.dp)   // HARD LOCK SIZE
            .aspectRatio(1f), // guarantees square
        contentAlignment = Alignment.Center
    )
    {


        Canvas(modifier = Modifier.matchParentSize()) {

            val stroke = 12.dp.toPx()
            val pad = stroke / 2
            val diameter = size.minDimension - pad * 2
            val center = Offset(size.width / 2f, size.height / 2f)

            // 1️⃣ Recessed inner well (depth foundation)
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Colors.backgroundRoot.copy(alpha = 0.55f),
                        Colors.backgroundRoot.copy(alpha = 1f)
                    ),
                    center = center,
                    radius = size.minDimension / 2f
                ),
                radius = size.minDimension / 2f
            )

            // 2️⃣ Inner bevel (subtle instrument housing effect)
            drawCircle(
                color = Color.White.copy(alpha = 0.04f),
                radius = (size.minDimension / 2f) - 4.dp.toPx(),
                style = Stroke(width = 2.dp.toPx())
            )

            // 3️⃣ Metallic ring base (curved light simulation)
            drawArc(
                brush = Brush.sweepGradient(
                    colors = listOf(
                        baseColor.copy(alpha = 0.95f),
                        baseColor.copy(alpha = 1f),
                        baseColor.copy(alpha = 0.85f),
                        baseColor.copy(alpha = 0.65f),
                        baseColor.copy(alpha = 0.85f),
                        baseColor.copy(alpha = 1f),
                        baseColor.copy(alpha = 0.95f)
                    ),
                    center = center
                ),
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(pad, pad),
                size = Size(diameter, diameter),
                style = Stroke(width = stroke, cap = StrokeCap.Round)
            )

            // 4️⃣ Specular highlight band (metal reflection)
            drawArc(
                color = Color.White.copy(alpha = 0.18f),
                startAngle = -70f,
                sweepAngle = 45f,
                useCenter = false,
                topLeft = Offset(pad, pad),
                size = Size(diameter, diameter),
                style = Stroke(width = stroke * 0.35f, cap = StrokeCap.Round)
            )

            // 5️⃣ Subtle lower shadow band (depth underside)
            drawArc(
                color = Color.Black.copy(alpha = 0.20f),
                startAngle = 110f,
                sweepAngle = 60f,
                useCenter = false,
                topLeft = Offset(pad, pad),
                size = Size(diameter, diameter),
                style = Stroke(width = stroke * 0.4f, cap = StrokeCap.Round)
            )
        }

        // Perfectly centered text layer
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {

            Text(
                text = label,
                color = Color.White, // Pure white
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                letterSpacing = 1.sp
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = value,
                color = Color.White,
                fontSize = if (isSmallValue) 15.sp else 30.sp, // 50% smaller for Pace Zone
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            if (unit.isNotEmpty()) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = unit,
                    color = Color.White.copy(alpha = 0.6f),
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}





/* =====================================================================================
   AI PANEL (shows only while speaking/loading, disappears when latestCoachMessage=null)
===================================================================================== */

@Composable
fun AiCoachLivePanel(
    message: String?,
    isLoading: Boolean,
    modifier: Modifier = Modifier
) {
    val visible = isLoading || !message.isNullOrBlank()
    if (!visible) return

    val glowTarget = if (visible) 1f else 0f
    val glow by animateFloatAsState(
        targetValue = glowTarget,
        animationSpec = tween(500, easing = FastOutSlowInEasing),
        label = "ai_glow"
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.85f))
            .drawBehind {
                if (glow > 0f) {
                    drawRect(
                        brush = Brush.radialGradient(
                            colors = listOf(Colors.primary.copy(alpha = 0.22f * glow), Color.Transparent),
                            center = center,
                            radius = size.minDimension * 1.2f
                        )
                    )
                }
            }
            .padding(Spacing.md),
        contentAlignment = Alignment.Center
    ) {
        if (isLoading) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), color = Colors.primary)
                Text(
                    text = "Coach is preparing…",
                    style = AppTextStyles.body,
                    color = Colors.primary,
                    fontWeight = FontWeight.Medium
                )
            }
        } else {
            Text(
                text = message.orEmpty(),
                style = AppTextStyles.body,
                color = Colors.primary,
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Medium,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
fun AiGlowStrip(isLoading: Boolean, modifier: Modifier = Modifier) {
    val infinite = rememberInfiniteTransition(label = "ai_strip")
    val shimmer by infinite.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "shimmer"
    )

    val alpha = if (isLoading) 0.22f else 0.16f
    Box(
        modifier = modifier
            .height(8.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        Colors.primary.copy(alpha = alpha * (0.7f + 0.3f * shimmer)),
                        Color.Transparent,
                        Colors.primary.copy(alpha = alpha * (0.7f + 0.3f * (1f - shimmer)))
                    )
                )
            )
    )
}

/* =====================================================================================
   FREE RUN UI COMPONENTS
===================================================================================== */

@Composable
fun BigMetricClock(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text(text = label, style = AppTextStyles.caption, color = Colors.textMuted, fontSize = 11.sp)
        Spacer(modifier = Modifier.height(6.dp))

        AnimatedContent(
            targetState = value,
            label = "clock_anim",
            transitionSpec = {
                fadeIn(tween(220)) togetherWith fadeOut(tween(140)) using SizeTransform(clip = false)
            }
        ) { v ->
            Text(
                text = v,
                style = AppTextStyles.h1,
                color = Colors.textPrimary,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 44.sp
            )
        }
    }
}

@Composable
fun PerformanceScoreChip(score: Int) {
    val clamped = score.coerceIn(0, 100)
    val pct = clamped / 100f

    val scoreColor = when {
        clamped >= 80 -> Color(0xFF10B981)
        clamped >= 55 -> Color(0xFFF59E0B)
        else -> Color(0xFFEF4444)
    }

    val animatedPct by animateFloatAsState(
        targetValue = pct,
        animationSpec = tween(durationMillis = 650, easing = FastOutSlowInEasing),
        label = "score_pct"
    )

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.55f))
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "SCORE",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(text = "$clamped", style = AppTextStyles.body, color = Colors.textPrimary, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.width(10.dp))

            Box(
                modifier = Modifier
                    .height(6.dp)
                    .width(46.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Colors.textMuted.copy(alpha = 0.18f))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(animatedPct)
                        .clip(RoundedCornerShape(999.dp))
                        .background(scoreColor.copy(alpha = 0.95f))
                )
            }
        }
    }
}

@Composable
fun PaceZoneRingCard(paceStr: String, paceSec: Int, modifier: Modifier = Modifier) {
    val zone = remember(paceStr) { paceZone(paceSec) }
    val zoneLabel = when (zone) {
        1 -> "RECOVERY"
        2 -> "EASY"
        3 -> "TEMPO"
        4 -> "THRESHOLD"
        else -> "SPEED"
    }

    val zoneColor = when (zone) {
        1 -> Color(0xFF94A3B8)
        2 -> Color(0xFF10B981)
        3 -> Color(0xFF38BDF8)
        4 -> Color(0xFFF59E0B)
        else -> Color(0xFFEF4444)
    }

    val intensity = remember(paceStr) { paceIntensity(paceSec) }
    val animIntensity by animateFloatAsState(
        targetValue = intensity,
        animationSpec = tween(durationMillis = 700, easing = FastOutSlowInEasing),
        label = "pace_intensity"
    )

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.55f))
            .padding(Spacing.md)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "PACE ZONE",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(Spacing.sm))

            PaceRing(progress = animIntensity, ringColor = zoneColor, modifier = Modifier.size(120.dp))

            Spacer(modifier = Modifier.height(Spacing.sm))

            Text(text = zoneLabel, style = AppTextStyles.body, color = zoneColor, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(2.dp))

            AnimatedContent(
                targetState = paceStr,
                label = "pace_anim",
                transitionSpec = { fadeIn(tween(220)) with fadeOut(tween(140)) using SizeTransform(clip = false) }
            ) { p ->
                Text(text = p, style = AppTextStyles.h2, color = Colors.textPrimary, fontWeight = FontWeight.Bold)
            }

            Text(text = "/km", style = AppTextStyles.caption, color = Colors.textMuted, fontSize = 10.sp)
        }
    }
}

@Composable
fun PaceRing(progress: Float, ringColor: Color, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val stroke = 12.dp.toPx()
        val pad = stroke / 2f + 4.dp.toPx()
        val diameter = min(size.width, size.height) - pad * 2
        val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
        val rect = Rect(topLeft, Size(diameter, diameter))

        drawArc(
            color = Colors.textMuted.copy(alpha = 0.16f),
            startAngle = -215f,
            sweepAngle = 250f,
            useCenter = false,
            topLeft = rect.topLeft,
            size = rect.size,
            style = Stroke(width = stroke, cap = StrokeCap.Round)
        )

        val clamped = progress.coerceIn(0f, 1f)
        drawArc(
            color = ringColor,
            startAngle = -215f,
            sweepAngle = 250f * clamped,
            useCenter = false,
            topLeft = rect.topLeft,
            size = rect.size,
            style = Stroke(width = stroke, cap = StrokeCap.Round)
        )
    }
}

@Composable
fun KeyStatsCard(
    distanceKmStr: String,
    paceStr: String,
    cadenceStr: String,
    heartRateStr: String,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.55f))
            .padding(Spacing.md)
    ) {
        Column {
            Text(
                text = "KEY STATS",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(Spacing.sm))
            StatRow(label = "Distance", value = distanceKmStr, unit = "km")
            SubtleDivider()
            StatRow(label = "Avg Pace", value = paceStr, unit = "/km")
            SubtleDivider()
            StatRow(label = "Cadence", value = cadenceStr, unit = "spm")
            SubtleDivider()
            StatRow(label = "HR", value = heartRateStr, unit = "bpm")
        }
    }
}

@Composable
fun StatRow(label: String, value: String, unit: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(text = label, style = AppTextStyles.body, color = Colors.textMuted, fontSize = 13.sp)
        Spacer(modifier = Modifier)
        AnimatedContent(
            targetState = value,
            label = "stat_$label",
            transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(120)) using SizeTransform(clip = false) }
        ) { v ->
            Row(verticalAlignment = Alignment.Bottom) {
                Text(text = v, style = AppTextStyles.body, color = Colors.textPrimary, fontWeight = FontWeight.Bold)
                Text(
                    text = unit,
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    fontSize = 10.sp,
                    modifier = Modifier.padding(start = 4.dp, bottom = 2.dp)
                )
            }
        }
    }
}

@Composable
fun SubtleDivider() {
    Box(
        modifier = Modifier
            .padding(vertical = 10.dp)
            .height(1.dp)
            .fillMaxWidth()
            .background(Colors.textMuted.copy(alpha = 0.10f))
    )
}

@Composable
fun Vo2TrendCard(current: Float, history: List<Float>, modifier: Modifier = Modifier) {
    val animCurrent by animateFloatAsState(
        targetValue = current.coerceIn(0f, 1f),
        animationSpec = tween(durationMillis = 700, easing = FastOutSlowInEasing),
        label = "vo2_current"
    )

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.55f))
            .padding(Spacing.md)
    ) {
        Column {
            Text(
                text = "VO₂ TREND",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(Spacing.sm))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(10.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Colors.textMuted.copy(alpha = 0.16f))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(animCurrent)
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0xFF38BDF8).copy(alpha = 0.95f))
                )
            }

            Spacer(modifier = Modifier.height(Spacing.sm))
            MiniSparkline(values = history, modifier = Modifier.fillMaxWidth().height(44.dp))
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = vo2Label(current), style = AppTextStyles.caption, color = Colors.textMuted, fontSize = 11.sp)
        }
    }
}

@Composable
fun MiniSparkline(values: List<Float>, modifier: Modifier = Modifier) {
    val pts = values.map { it.coerceIn(0f, 1f) }
    Canvas(modifier = modifier) {
        if (pts.size < 2) return@Canvas
        val w = size.width
        val h = size.height
        val step = w / (pts.size - 1).toFloat()
        val path = Path()
        pts.forEachIndexed { i, v ->
            val x = step * i
            val y = h - (v * h)
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawLine(
            color = Colors.textMuted.copy(alpha = 0.12f),
            start = Offset(0f, h - 1f),
            end = Offset(w, h - 1f),
            strokeWidth = 1.dp.toPx()
        )
        drawPath(
            path = path,
            color = Color(0xFF38BDF8).copy(alpha = 0.95f),
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
        )
    }
}

@Composable
fun BreathingCadenceCard(isRunning: Boolean, aiSpeaking: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.55f))
            .padding(Spacing.md)
    ) {
        Column {
            Text(
                text = "BREATHING",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                text = if (isRunning) "Cadence Wave" else "Ready",
                style = AppTextStyles.body,
                color = Colors.textPrimary,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            BreathingWave(active = isRunning, glow = aiSpeaking, modifier = Modifier.fillMaxWidth().height(52.dp))
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Use a steady rhythm (e.g., 3–2 or 2–2).",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                fontSize = 11.sp
            )
        }
    }
}

@Composable
fun BreathingWave(active: Boolean, glow: Boolean, modifier: Modifier = Modifier) {
    val infinite = rememberInfiniteTransition(label = "breathing_wave")
    val phase by infinite.animateFloat(
        initialValue = 0f,
        targetValue = (2f * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = if (active) 2200 else 5200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase"
    )

    val glowAlpha by animateFloatAsState(
        targetValue = if (glow) 0.30f else 0.0f,
        animationSpec = tween(450, easing = FastOutSlowInEasing),
        label = "wave_glow"
    )

    Canvas(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Colors.backgroundRoot.copy(alpha = 0.25f))
            .drawBehind {
                if (glowAlpha > 0f) {
                    drawRect(
                        brush = Brush.radialGradient(
                            colors = listOf(Colors.primary.copy(alpha = glowAlpha), Color.Transparent),
                            center = center,
                            radius = size.minDimension * 0.9f
                        )
                    )
                }
            }
    ) {
        val w = size.width
        val h = size.height
        val mid = h / 2f
        val amp = if (active) h * 0.22f else h * 0.10f
        val freq = 2.2f

        val path = Path()
        val steps = 60
        for (i in 0..steps) {
            val x = w * (i / steps.toFloat())
            val t = (i / steps.toFloat()) * (2f * PI).toFloat() * freq
            val y = mid + amp * sin(t + phase)
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }

        drawLine(
            color = Colors.textMuted.copy(alpha = 0.12f),
            start = Offset(0f, mid),
            end = Offset(w, mid),
            strokeWidth = 1.dp.toPx()
        )

        drawPath(
            path = path,
            color = Colors.primary.copy(alpha = 0.95f),
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
        )
    }
}

/* =====================================================================================
   TOP BAR + CONTROLS + MAP (kept compatible with your existing assets/theme)
===================================================================================== */

@Composable
fun TopBarSection(
    isCoachEnabled: Boolean,
    isMuted: Boolean,
    actionsEnabled: Boolean,
    micEnabled: Boolean,
    onCoachToggle: () -> Unit,
    onMicClick: () -> Unit,
    onShareClick: () -> Unit,
    onCloseClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color(0xFF10B981).copy(alpha = 0.2f))
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF10B981))
                    )
                    Text(
                        text = "GPS",
                        style = AppTextStyles.caption,
                        color = Color(0xFF10B981),
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(if (isCoachEnabled) Colors.primary.copy(alpha = 0.2f) else Color.Gray.copy(alpha = 0.2f))
                    .clickable(enabled = actionsEnabled, onClick = onCoachToggle)
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(
                        painter = painterResource(id = if (isMuted) R.drawable.icon_volume_off_vector else R.drawable.icon_volume_on_vector),
                        contentDescription = "Volume",
                        tint = if (isCoachEnabled) Colors.primary else Color.Gray,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = if (isCoachEnabled) "COACH ON" else "COACH OFF",
                        style = AppTextStyles.caption,
                        color = if (isCoachEnabled) Colors.primary else Color.Gray,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onMicClick, modifier = Modifier.size(36.dp), enabled = micEnabled) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_mic_vector),
                    contentDescription = "Talk to coach",
                    tint = Colors.primary
                )
            }

            /*
            IconButton(onClick = onShareClick, modifier = Modifier.size(36.dp), enabled = actionsEnabled) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_share_vector),
                    contentDescription = "Share",
                    tint = Colors.textSecondary
                )
            }

            IconButton(onClick = onCloseClick, modifier = Modifier.size(36.dp), enabled = actionsEnabled) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_x_vector),
                    contentDescription = "Close",
                    tint = Colors.textSecondary
                ) */
            }
        }
    }

@Composable
fun ControlButtons(
    isRunning: Boolean,
    isPaused: Boolean,
    isStopping: Boolean = false,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit,
    onCancel: () -> Unit = {},
    onSimulate: (() -> Unit)? = null
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (isRunning || isPaused) {
            // Running/Paused - show Stop and Play/Pause buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                FloatingActionButton(
                    onClick = if (isStopping) ({}) else onStop,
                    containerColor = Color(0xFF2D3748),
                    modifier = Modifier.size(56.dp)
                ) {
                    if (isStopping) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Colors.textPrimary)
                    } else {
                        Icon(
                            painter = painterResource(id = R.drawable.icon_stop_vector),
                            contentDescription = "Stop",
                            tint = Colors.textPrimary,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(Spacing.xl))

                FloatingActionButton(
                    onClick = { if (isRunning) onPause() else onResume() },
                    containerColor = Colors.primary,
                    modifier = Modifier.size(72.dp)
                ) {
                    Icon(
                        painter = painterResource(id = if (isRunning) R.drawable.icon_pause_vector else R.drawable.icon_play_vector),
                        contentDescription = if (isRunning) "Pause" else "Resume",
                        tint = Colors.backgroundRoot,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }
        } else {
            // Not started yet - show Start Run and Cancel buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.lg),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Cancel button
                OutlinedButton(
                    onClick = onCancel,
                    modifier = Modifier.weight(1f).height(56.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Colors.textSecondary
                    ),
                    border = ButtonDefaults.outlinedButtonBorder.copy(
                        brush = SolidColor(Colors.border)
                    )
                ) {
                    Text(
                        text = "Cancel",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                        color = Colors.textSecondary
                    )
                }

                // Start Run button
                Button(
                    onClick = onStart,
                    modifier = Modifier.weight(1f).height(56.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary
                    ),
                    shape = RoundedCornerShape(28.dp)
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_play_vector),
                        contentDescription = null,
                        tint = Colors.backgroundRoot,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Start Run",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.backgroundRoot
                    )
                }
            }

            // Simulate Run button (debug builds only)
            if (onSimulate != null && live.airuncoach.airuncoach.BuildConfig.DEBUG) {
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = onSimulate,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.warning
                    ),
                    shape = RoundedCornerShape(24.dp)
                ) {
                    Text(
                        text = "Simulate 5km Run",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.backgroundRoot
                    )
                }
            }
        }
    }
}

@Composable
fun EliteRouteMap(
    runSession: RunSession?,
    routePolyline: String?
) {
    var isFullScreen by remember { mutableStateOf(false) }
    var isUserInteracting by remember { mutableStateOf(false) }
    var compassLocked by remember { mutableStateOf(true) }

    val cameraPositionState = rememberCameraPositionState()

    val latestPoint = runSession?.routePoints?.lastOrNull()

    val plannedRoute = remember(routePolyline) {
        routePolyline?.let { PolyUtil.decode(it) }.orEmpty()
    }

    val turnCues = remember(plannedRoute) {
        buildTurnCues(plannedRoute)
    }

    val arrowMarkers = remember(plannedRoute) {
        buildArrowMarkers(plannedRoute, spacingMeters = 70.0)
    }

    val runnerLatLng = latestPoint?.let {
        LatLng(it.latitude, it.longitude)
    }

    val navState = remember(runnerLatLng, plannedRoute, turnCues) {
        if (runnerLatLng != null && plannedRoute.isNotEmpty())
            computeNavState(runnerLatLng, plannedRoute, turnCues)
        else
            NavState()
    }

    // 🔁 Auto-follow + ⅓ bottom framing
    LaunchedEffect(latestPoint, compassLocked) {
        latestPoint?.let { point ->
            if (!isUserInteracting) {

                val target = LatLng(point.latitude, point.longitude)

                val cameraPosition = CameraPosition.Builder()
                    .target(target)
                    .zoom(17f)
                    .bearing(if (compassLocked) point.bearing ?: 0f else 0f)
                    .tilt(45f)
                    .build()

                cameraPositionState.animate(
                    update = CameraUpdateFactory.newCameraPosition(cameraPosition),
                    durationMs = 1000
                )
            }
        }
    }

    // Detect manual interaction
    LaunchedEffect(cameraPositionState.isMoving) {
        if (cameraPositionState.isMoving) {
            isUserInteracting = true
            kotlinx.coroutines.delay(8000)
            isUserInteracting = false
        }
    }

    // Turn trigger logic
    var lastTurnIdPre by remember { mutableStateOf<Int?>(null) }
    var lastTurnIdNow by remember { mutableStateOf<Int?>(null) }

    LaunchedEffect(navState.nextTurn, navState.distanceToNextTurnM) {
        val turn = navState.nextTurn ?: return@LaunchedEffect
        val distance = navState.distanceToNextTurnM
        val id = turn.routeIndex

        // 100m warning
        if (distance <= 100.0 && lastTurnIdPre != id) {
            lastTurnIdPre = id

            // 🔊 Hook into your TTS system here
            // viewModel.speak("In 100 meters, ${turn.instruction.lowercase()}.")
        }

        // Turn now
        if (distance <= 18.0 && lastTurnIdNow != id) {
            lastTurnIdNow = id

            // 🔊 viewModel.speak("${turn.instruction} now.")
        }
    }


    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (isFullScreen) 520.dp else 280.dp)
            .padding(horizontal = Spacing.lg)
            .clip(RoundedCornerShape(18.dp))
    ) {

        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            uiSettings = com.google.maps.android.compose.MapUiSettings(
                compassEnabled = true,
                zoomControlsEnabled = false,
                tiltGesturesEnabled = true,
                rotationGesturesEnabled = true
            )
        ) {

            // Planned route
            if (plannedRoute.isNotEmpty()) {
                Polyline(
                    points = plannedRoute,
                    color = Colors.primary,
                    width = 10f
                )
            }

// 🔁 Direction arrows along route
            arrowMarkers.forEach { (pos, heading) ->
                Marker(
                    state = MarkerState(position = pos),
                    title = null,
                    // Optional: use arrow icon if you have one
                    // icon = BitmapDescriptorFactory.fromResource(R.drawable.map_arrow_small),
                    flat = true,
                    rotation = heading
                )
            }

            // Actual path
            runSession?.let { session ->
                val actualPath =
                    session.routePoints.map { LatLng(it.latitude, it.longitude) }

                if (actualPath.isNotEmpty()) {
                    Polyline(
                        points = actualPath,
                        color = Color(0xFF10B981),
                        width = 12f
                    )

                    latestPoint?.let {
                        Marker(
                            state = MarkerState(
                                position = LatLng(it.latitude, it.longitude)
                            ),
                            title = "Current Position"
                        )
                    }
                }
            }
        }

        // 🧭 Next Turn Overlay (Top Center)
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 12.dp)
        ) {
            NextTurnOverlay(nav = navState)
        }


        // 🔘 Recenter Button
        FloatingActionButton(
            onClick = {
                isUserInteracting = false
            },
            containerColor = Colors.primary,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp)
                .size(56.dp)
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_navigation_vector),
                contentDescription = "Recenter",
                tint = Colors.backgroundRoot
            )
        }

        // 🔄 Compass Lock Toggle
        IconButton(
            onClick = { compassLocked = !compassLocked },
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(12.dp)
                .background(
                    Colors.backgroundSecondary.copy(alpha = 0.85f),
                    CircleShape
                )
        ) {
            Icon(
                imageVector = if (compassLocked)
                    Icons.Filled.Explore
                else
                    Icons.Filled.ExploreOff,
                contentDescription = "Compass Lock",
                tint = Colors.textPrimary
            )
        }

        // 🔘 Fullscreen Toggle
        IconButton(
            onClick = { isFullScreen = !isFullScreen },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp)
                .background(
                    Colors.backgroundSecondary.copy(alpha = 0.85f),
                    CircleShape
                )
        ) {
            Icon(
                painter = painterResource(
                    id = if (isFullScreen)
                        R.drawable.icon_chevron_down_vector
                    else
                        R.drawable.icon_chevron_up_vector
                ),
                contentDescription = "Toggle Map Size",
                tint = Colors.textPrimary
            )
        }
    }
}


/* =====================================================================================
   MAP - DATA MODELS & HELPERS
===================================================================================== */


private data class TurnCue(
    val routeIndex: Int,          // index in route list
    val position: LatLng,         // where the turn occurs
    val deltaDegrees: Double,     // signed heading change
    val instruction: String       // "Turn left", "Turn right", etc.
)

private data class NavState(
    val nextTurn: TurnCue? = null,
    val distanceToNextTurnM: Double = Double.POSITIVE_INFINITY
)

private fun normalize180(deg: Double): Double {
    var d = deg
    while (d > 180) d -= 360
    while (d < -180) d += 360
    return d
}

private fun classifyTurn(deltaDeg: Double): String {
    val a = kotlin.math.abs(deltaDeg)
    return when {
        a < 20 -> "Continue straight"
        deltaDeg > 0 -> { // right turn (clockwise heading increase)
            when {
                a < 45 -> "Bear right"
                a < 120 -> "Turn right"
                else -> "Sharp right"
            }
        }
        else -> { // left turn
            when {
                a < 45 -> "Bear left"
                a < 120 -> "Turn left"
                else -> "Sharp left"
            }
        }
    }
}

/**
 * Turn detection:
 * - Walk route points
 * - Compute heading changes
 * - If change exceeds threshold, record a turn cue at that vertex
 */
private fun buildTurnCues(
    route: List<LatLng>,
    minTurnAngleDeg: Double = 28.0,
    minSpacingMeters: Double = 35.0
): List<TurnCue> {
    if (route.size < 5) return emptyList()

    val cues = mutableListOf<TurnCue>()
    var lastCuePos: LatLng? = null

    for (i in 2 until route.size - 2) {
        val p0 = route[i - 2]
        val p1 = route[i]
        val p2 = route[i + 2]

        val h1 = SphericalUtil.computeHeading(p0, p1)   // -180..180
        val h2 = SphericalUtil.computeHeading(p1, p2)

        val delta = normalize180(h2 - h1)
        val absDelta = kotlin.math.abs(delta)

        if (absDelta >= minTurnAngleDeg) {
            val pos = route[i]
            val tooClose = lastCuePos?.let { SphericalUtil.computeDistanceBetween(it, pos) < minSpacingMeters } ?: false
            if (!tooClose) {
                val instr = classifyTurn(delta)
                cues += TurnCue(
                    routeIndex = i,
                    position = pos,
                    deltaDegrees = delta,
                    instruction = instr
                )
                lastCuePos = pos
            }
        }
    }

    return cues
}

/**
 * Find the closest route index to current position.
 * This is O(n) but usually fine for typical route lengths.
 * (Later you can optimize by searching near lastIndex.)
 */
private fun closestRouteIndex(
    current: LatLng,
    route: List<LatLng>
): Int {
    var bestIdx = 0
    var bestDist = Double.POSITIVE_INFINITY

    for (i in route.indices) {
        val d = SphericalUtil.computeDistanceBetween(current, route[i])
        if (d < bestDist) {
            bestDist = d
            bestIdx = i
        }
    }
    return bestIdx
}

/**
 * Pick the next turn cue whose routeIndex is ahead of the runner (by index).
 */
private fun computeNavState(
    current: LatLng,
    route: List<LatLng>,
    cues: List<TurnCue>
): NavState {
    if (route.isEmpty() || cues.isEmpty()) return NavState()

    val idx = closestRouteIndex(current, route)
    val next = cues.firstOrNull { it.routeIndex > idx } ?: return NavState()

    val dist = SphericalUtil.computeDistanceBetween(current, next.position)
    return NavState(nextTurn = next, distanceToNextTurnM = dist)
}

/**
 * Arrow markers along route: place markers every N meters.
 */
private fun buildArrowMarkers(
    route: List<LatLng>,
    spacingMeters: Double = 70.0
): List<Pair<LatLng, Float>> {
    if (route.size < 2) return emptyList()

    val markers = mutableListOf<Pair<LatLng, Float>>()
    var carry = 0.0

    for (i in 0 until route.size - 1) {
        val a = route[i]
        val b = route[i + 1]
        val segDist = SphericalUtil.computeDistanceBetween(a, b)
        val heading = SphericalUtil.computeHeading(a, b).toFloat()

        var t = (spacingMeters - carry) / segDist
        while (t in 0.0..1.0) {
            val pos = SphericalUtil.interpolate(a, b, t)
            markers += pos to heading
            t += spacingMeters / segDist
        }

        // update carry
        val used = (segDist - ((1.0 - ((spacingMeters - carry) / segDist)).coerceIn(0.0, 1.0) * segDist)).coerceAtLeast(0.0)
        val remainder = segDist % spacingMeters
        carry = if (segDist + carry >= spacingMeters) remainder else carry + segDist
    }

    return markers
}

/* =====================================================================================
   MAP - NEXT TURN HUD OVERLAY COMPOSABLE
===================================================================================== */

@Composable
private fun NextTurnOverlay(
    nav: NavState,
    modifier: Modifier = Modifier
) {
    val turn = nav.nextTurn ?: return
    val dist = nav.distanceToNextTurnM

    // If straight, no arrow needed — but you can still show instruction.
    val show = dist.isFinite() && dist <= 350.0
    if (!show) return

    // Use signed delta to rotate a "straight arrow" into left/right feel.
    // If you have dedicated turn-left/turn-right assets, swap icons instead.
    val rotation = when {
        turn.instruction.contains("left", ignoreCase = true) -> -90f
        turn.instruction.contains("right", ignoreCase = true) -> 90f
        else -> 0f
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary.copy(alpha = 0.88f))
            .padding(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {

            Icon(
                painter = painterResource(id = R.drawable.icon_navigation_vector), // replace with a big arrow icon if you have it
                contentDescription = null,
                tint = Colors.primary,
                modifier = Modifier
                    .size(28.dp)
                    .graphicsLayer { rotationZ = rotation }
            )

            Spacer(modifier = Modifier.width(10.dp))

            Column(Modifier.weight(1f)) {
                Text(
                    text = turn.instruction,
                    style = AppTextStyles.body,
                    color = Colors.textPrimary,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "${dist.toInt()} m",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted
                )
            }
        }
    }
}


/* =====================================================================================
   HELPERS / HEURISTICS (safe placeholders until you wire real Garmin signals)
===================================================================================== */

private fun parsePaceToSeconds(pace: String): Int {
    val parts = pace.split(":")
    if (parts.size != 2) return 0
    val m = parts[0].toIntOrNull() ?: return 0
    val s = parts[1].toIntOrNull() ?: return 0
    return m * 60 + s
}

private fun paceZone(paceSec: Int): Int {
    if (paceSec <= 0) return 1
    return when {
        paceSec >= 420 -> 1
        paceSec >= 360 -> 2
        paceSec >= 315 -> 3
        paceSec >= 270 -> 4
        else -> 5
    }
}

private fun paceZoneLabel(zone: Int): String {
    return when (zone) {
        1 -> "RECOVERY"
        2 -> "EASY"
        3 -> "TEMPO"
        4 -> "THRESHOLD"
        else -> "SPEED"
    }
}

private fun paceIntensity(paceSec: Int): Float {
    val slow = 480f
    val fast = 240f
    val p = paceSec.toFloat().coerceIn(fast, slow)
    return 1f - ((p - fast) / (slow - fast))
}

private fun computeVo2Proxy(paceSec: Int, hr: Int): Float {
    val pace = paceIntensity(paceSec)
    val hrNorm = if (hr <= 0) 0.45f else ((hr - 90f) / 90f).coerceIn(0f, 1f)
    return (0.65f * pace + 0.35f * hrNorm).coerceIn(0f, 1f)
}

private fun vo2Label(v: Float): String {
    val x = v.coerceIn(0f, 1f)
    return when {
        x >= 0.82f -> "Very strong aerobic output"
        x >= 0.62f -> "Strong aerobic output"
        x >= 0.42f -> "Moderate aerobic output"
        else -> "Easy aerobic output"
    }
}

private fun computePerformanceScore(distanceKm: Float, paceSec: Int, cadence: Int, hr: Int): Int {
    val distanceScore = (distanceKm / 10f).coerceIn(0f, 1f)
    val paceScore = paceIntensity(paceSec)
    val cadenceScore = if (cadence <= 0) 0.5f else ((cadence - 140f) / 40f).coerceIn(0f, 1f)
    val hrScore = if (hr <= 0) 0.55f else ((hr - 110f) / 60f).coerceIn(0f, 1f)
    val combined = 0.25f * distanceScore + 0.40f * paceScore + 0.20f * cadenceScore + 0.15f * hrScore
    return (combined * 100f).toInt().coerceIn(0, 100)
}

private fun computeFatigueProxy(hr: Int?, effortPercent: Float, cadence: Int?): Int {
    val hrNorm = ((hr ?: 120) - 100) / 80f
    val cadNorm = if ((cadence ?: 0) <= 0) 0.5f else ((cadence!! - 150f) / 40f)
    val v = 0.55f * effortPercent + 0.30f * hrNorm.coerceIn(0f, 1f) + 0.15f * (1f - cadNorm.coerceIn(0f, 1f))
    return (v.coerceIn(0f, 1f) * 100f).toInt()
}

private fun computeStabilityProxy(cadence: Int?, paceSec: Int?): Int {
    // Placeholder: higher cadence + faster stable pace implies better stability.
    val cad = (cadence ?: 160).coerceIn(130, 190)
    val cadScore = ((cad - 140) / 50f).coerceIn(0f, 1f)
    val paceScore = paceSec?.let { paceIntensity(it) } ?: 0.55f
    return ((0.55f * cadScore + 0.45f * paceScore) * 100f).toInt()
}
