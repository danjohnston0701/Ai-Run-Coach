
package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import com.google.maps.android.compose.*
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.util.RunConfigHolder
import live.airuncoach.airuncoach.viewmodel.RunSessionViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RunSessionScreen(
    hasRoute: Boolean,
    onEndRun: (String) -> Unit,
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
    
    // Navigate to summary when upload completes
    LaunchedEffect(runState.backendRunId) {
        runState.backendRunId?.let { backendId ->
            onEndRun(backendId)
        }
    }

    BackHandler(enabled = isRunActive) {
        // Block back navigation during an active run.
    }

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(LatLng(0.0, 0.0), 15f)
    }

    val audioPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted ->
            if (isGranted) {
                viewModel.startListening()
            }
        }
    )

    LaunchedEffect(Unit) {
        // Get run config if coming from run setup screen
        RunConfigHolder.getConfig()?.let { config ->
            viewModel.setRunConfig(config)
            // Extract route polyline if available
            routePolyline = config.route?.polyline
        }
        viewModel.prepareRun()
    }
    
    // Auto-follow user's location on map
    LaunchedEffect(hasRoute, runSession?.routePoints) {
        if (hasRoute) {
            runSession?.routePoints?.lastOrNull()?.let { lastPoint ->
                val newPosition = LatLng(lastPoint.latitude, lastPoint.longitude)
                cameraPositionState.animate(
                    update = CameraUpdateFactory.newLatLngZoom(newPosition, 17f),
                    durationMs = 1000
                )
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Top Bar with GPS, Coach toggle, and action buttons
            TopBarSection(
                isCoachEnabled = runState.isCoachEnabled,
                isMuted = runState.isMuted,
                actionsEnabled = !isRunActive,
                micEnabled = true,
                onCoachToggle = { viewModel.toggleCoach() },
                onMicClick = {
                    when (PackageManager.PERMISSION_GRANTED) {
                        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) -> {
                            viewModel.startListening()
                        }
                        else -> {
                            audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    }
                },
                onShareClick = { /* TODO: Implement share */ },
                onCloseClick = { /* TODO: Implement close */ }
            )

            // Metrics Row
            MetricsRow(
                time = runState.time,
                distance = runState.distance,
                pace = runState.pace,
                cadence = runState.cadence,
                heartRate = runState.heartRate
            )

            Spacer(modifier = Modifier.height(Spacing.md))

            // Control Buttons
            ControlButtons(
                isRunning = runState.isRunning,
                isPaused = runState.isPaused,
                isStopping = runState.isStopping,
                onStart = { viewModel.startRun() },
                onPause = { showPauseConfirm = true },
                onResume = { viewModel.resumeRun() },
                onStop = { showStopConfirm = true }
            )

            Spacer(modifier = Modifier.height(Spacing.md))

            // Map Section (collapsible)
            if (hasRoute) {
                MapSection(
                    showMap = showMap,
                    onToggleMap = { showMap = !showMap },
                    interactionEnabled = !isRunActive,
                    cameraPositionState = cameraPositionState,
                    runSession = runSession,
                    routePolyline = routePolyline
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            // Coach Message Section at bottom
            CoachMessageSection(
                coachText = runState.latestCoachMessage ?: runState.coachText,
                isRunning = runState.isRunning,
                isLoadingBriefing = runState.isLoadingBriefing
            )
        }
    }

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
                ) {
                    Text("Pause")
                }
            },
            dismissButton = {
                TextButton(onClick = { showPauseConfirm = false }) {
                    Text("Cancel")
                }
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
                ) {
                    Text("Stop")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showStopConfirm = false },
                    enabled = !runState.isStopping
                ) {
                    Text("Cancel")
                }
            }
        )
    }
}

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
        // Left: GPS and Coach status
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // GPS Indicator
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color(0xFF10B981).copy(alpha = 0.2f))
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
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

            // Coach Toggle
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(if (isCoachEnabled) Colors.primary.copy(alpha = 0.2f) else Color.Gray.copy(alpha = 0.2f))
                    .clickable(enabled = actionsEnabled, onClick = onCoachToggle)
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
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

        // Right: Action buttons
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onMicClick,
                modifier = Modifier.size(36.dp),
                enabled = micEnabled
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_mic_vector),
                    contentDescription = "Talk to coach",
                    tint = Colors.primary
                )
            }

            IconButton(
                onClick = onShareClick,
                modifier = Modifier.size(36.dp),
                enabled = actionsEnabled
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_share_vector),
                    contentDescription = "Share",
                    tint = Colors.textSecondary
                )
            }

            IconButton(
                onClick = onCloseClick,
                modifier = Modifier.size(36.dp),
                enabled = actionsEnabled
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_x_vector),
                    contentDescription = "Close",
                    tint = Colors.textSecondary
                )
            }
        }
    }
}

@Composable
fun MetricsRow(
    time: String,
    distance: String,
    pace: String,
    cadence: String,
    heartRate: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        horizontalArrangement = Arrangement.SpaceAround
    ) {
        MetricItem("TIME", time)
        MetricItem("DISTANCE", distance, unit = "km")
        MetricItem("AVG PACE", pace, unit = "/km")
        MetricItem("CADENCE", cadence, unit = "spm")
        MetricItem("HR", heartRate, unit = "bpm")
    }
}

@Composable
fun MetricItem(label: String, value: String, unit: String? = null) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = label,
            style = AppTextStyles.caption,
            color = Colors.textMuted,
            fontSize = 10.sp
        )
        Row(
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = value,
                style = AppTextStyles.h2,
                color = Colors.textPrimary,
                fontWeight = FontWeight.Bold
            )
            if (unit != null) {
                Text(
                    text = unit,
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
fun ControlButtons(
    isRunning: Boolean,
    isPaused: Boolean,
    isStopping: Boolean = false,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (isRunning || isPaused) {
            // Stop Button
            FloatingActionButton(
                onClick = if (isStopping) {
                    {}  // Disable click while stopping
                } else {
                    onStop
                },
                containerColor = Color(0xFF2D3748),
                modifier = Modifier.size(56.dp)
            ) {
                if (isStopping) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Colors.textPrimary
                    )
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

            // Pause/Resume Button
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
        } else {
            // Start Button
            FloatingActionButton(
                onClick = onStart,
                containerColor = Colors.primary,
                modifier = Modifier.size(72.dp)
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_play_vector),
                    contentDescription = "Start",
                    tint = Colors.backgroundRoot,
                    modifier = Modifier.size(32.dp)
                )
            }
        }
    }
}

@Composable
fun MapSection(
    showMap: Boolean,
    onToggleMap: () -> Unit,
    interactionEnabled: Boolean,
    cameraPositionState: CameraPositionState,
    runSession: RunSession?,
    routePolyline: String?
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.md)
    ) {
        // Map Toggle Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                .background(Colors.backgroundSecondary)
                .clickable(enabled = interactionEnabled, onClick = onToggleMap)
                .padding(horizontal = Spacing.md, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_navigation_vector),
                    contentDescription = "Navigation",
                    tint = Colors.primary,
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    text = if (showMap) "HIDE MAP" else "SHOW MAP",
                    style = AppTextStyles.body,
                    color = Colors.textPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
            }
            Icon(
                painter = painterResource(id = if (showMap) R.drawable.icon_chevron_up_vector else R.drawable.icon_chevron_down_vector),
                contentDescription = if (showMap) "Collapse" else "Expand",
                tint = Colors.textPrimary,
                modifier = Modifier.size(20.dp)
            )
        }

        // Map Container
        AnimatedVisibility(
            visible = showMap,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(300.dp)
                    .clip(RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp))
            ) {
                GoogleMap(
                    modifier = Modifier.fillMaxSize(),
                    cameraPositionState = cameraPositionState
                ) {
                    // Blue polyline for planned route
                    routePolyline?.let { polyline ->
                        val routeCoordinates = PolyUtil.decode(polyline)
                        Polyline(
                            points = routeCoordinates,
                            color = Colors.primary,
                            width = 8f
                        )
                    }

                    // Green polyline for user's actual path
                    runSession?.let { session ->
                        val actualPathLatLngs = session.routePoints.map { LatLng(it.latitude, it.longitude) }
                        if (actualPathLatLngs.isNotEmpty()) {
                            Polyline(
                                points = actualPathLatLngs,
                                color = Color(0xFF10B981), // Green
                                width = 10f
                            )
                        }

                        // Current location marker
                        session.routePoints.lastOrNull()?.let {
                            Marker(
                                state = MarkerState(position = LatLng(it.latitude, it.longitude)),
                                title = "Current Location",
                                icon = BitmapDescriptorFactory.defaultMarker(
                                    BitmapDescriptorFactory.HUE_RED
                                )
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CoachMessageSection(
    coachText: String,
    isRunning: Boolean,
    isLoadingBriefing: Boolean
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(Spacing.md),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Coach Avatar
        Box(
            modifier = Modifier
                .size(120.dp)
                .padding(bottom = Spacing.sm),
            contentAlignment = Alignment.Center
        ) {
            // Glowing effect
            Box(
                modifier = Modifier
                    .size(120.dp)
                    .clip(CircleShape)
                    .background(Colors.primary.copy(alpha = 0.1f))
            )
            Image(
                painter = painterResource(id = R.drawable.ai_coach_avatar),
                contentDescription = "AI Coach Avatar",
                modifier = Modifier
                    .size(100.dp)
                    .clip(CircleShape)
            )
        }

        // Coach Message Box
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Colors.backgroundSecondary.copy(alpha = 0.8f))
                .padding(Spacing.md),
            contentAlignment = Alignment.Center
        ) {
            if (isLoadingBriefing) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = Colors.primary
                )
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

        // Voice Visualizer (when running)
        if (isRunning && !isLoadingBriefing) {
            Spacer(modifier = Modifier.height(Spacing.md))
            VoiceVisualizer()
        }
    }
}

@Composable
fun VoiceVisualizer() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.Bottom
    ) {
        repeat(20) { index ->
            val infiniteTransition = rememberInfiniteTransition(label = "voice_bar_$index")
            val height by infiniteTransition.animateFloat(
                initialValue = 4f,
                targetValue = (8..24).random().toFloat(),
                animationSpec = infiniteRepeatable(
                    animation = tween(
                        durationMillis = (300..600).random(),
                        easing = LinearEasing
                    ),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "height_$index"
            )

            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(height.dp)
                    .padding(horizontal = 1.dp)
                    .background(Colors.primary, RoundedCornerShape(2.dp))
            )
        }
    }
}
