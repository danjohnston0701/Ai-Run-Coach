
package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
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
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.service.RunTrackingService
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.RunSessionViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RunSessionScreen(
    hasRoute: Boolean,
    onEndRun: () -> Unit,
    viewModel: RunSessionViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val runState by viewModel.runState.collectAsState()
    val runSession by viewModel.runSession.collectAsState()

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
        viewModel.prepareRun()
    }
    
    LaunchedEffect(runSession?.routePoints) {
        runSession?.routePoints?.lastOrNull()?.let { lastPoint ->
            val newPosition = LatLng(lastPoint.latitude, lastPoint.longitude)
            cameraPositionState.animate(
                update = com.google.android.gms.maps.CameraUpdateFactory.newLatLngZoom(newPosition, 17f),
                durationMs = 1000
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { },
                actions = {
                    Switch(checked = runState.isCoachEnabled, onCheckedChange = { viewModel.toggleCoach() })
                    Text(text = if(runState.isCoachEnabled) "COACH ON" else "COACH OFF", style = AppTextStyles.h4, color = Colors.textPrimary)
                    Spacer(modifier = Modifier.width(Spacing.md))
                    IconButton(onClick = { viewModel.toggleMute() }) {
                        Icon(painter = painterResource(id = if (runState.isMuted) R.drawable.icon_volume_off_vector else R.drawable.icon_volume_on_vector), contentDescription = "Mute", tint = Colors.textPrimary)
                    }
                    IconButton(onClick = { 
                        when (PackageManager.PERMISSION_GRANTED) {
                            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) -> {
                                viewModel.startListening()
                            }
                            else -> {
                                audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        }
                    }) {
                        Icon(painter = painterResource(id = R.drawable.icon_mic_vector), contentDescription = "Talk to coach", tint = Colors.primary)
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
                .padding(padding),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Run Metrics
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                RunMetric("TIME", runState.time)
                RunMetric("DISTANCE", runState.distance)
                RunMetric("PACE", runState.pace)
                RunMetric("CADENCE", runState.cadence)
            }

            // Middle Section
            Box(modifier = Modifier.weight(1f)) {
                if (hasRoute) {
                    GoogleMap(
                        modifier = Modifier.fillMaxSize(),
                        cameraPositionState = cameraPositionState
                    ) {
                        runSession?.let { session ->
                            val routeLatLngs = session.routePoints.map { LatLng(it.latitude, it.longitude) }
                            Polyline(
                                points = routeLatLngs,
                                color = Colors.primary,
                                width = 15f
                            )
                            session.routePoints.lastOrNull()?.let {
                                Marker(
                                    state = MarkerState(position = LatLng(it.latitude, it.longitude)),
                                    title = "Current Location"
                                )
                            }
                        }
                    }
                    // Zoom buttons
                    Column(
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .padding(Spacing.md)
                    ) {
                        IconButton(onClick = { cameraPositionState.move(com.google.android.gms.maps.CameraUpdateFactory.zoomIn()) }) {
                           Icon(painter = painterResource(R.drawable.icon_zoom_in_vector), contentDescription = "Zoom In")
                        }
                        IconButton(onClick = { cameraPositionState.move(com.google.android.gms.maps.CameraUpdateFactory.zoomOut()) }) {
                            Icon(painter = painterResource(R.drawable.icon_zoom_out_vector), contentDescription = "Zoom Out")
                        }
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.ai_coach_avatar),
                            contentDescription = "AI Coach Avatar",
                            modifier = Modifier
                                .size(150.dp)
                                .clip(CircleShape)
                        )
                        Spacer(modifier = Modifier.height(Spacing.lg))
                        Text(
                            text = runState.coachText,
                            style = AppTextStyles.h4,
                            color = Colors.textPrimary,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = Spacing.lg)
                        )
                    }
                }
            }

            // Bottom Section
            Column(
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Image(
                    painter = painterResource(id = R.drawable.sound_waves), // Placeholder for sound waves
                    contentDescription = "Sound Waves",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                )

                // Run Controls
                Row(
                    modifier = Modifier.padding(vertical = Spacing.lg),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xl),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (runState.isRunning || runState.isPaused) {
                        FloatingActionButton(onClick = { 
                            viewModel.stopRun()
                            onEndRun()
                         }, containerColor = Colors.error) {
                            Icon(painter = painterResource(id = R.drawable.icon_stop_vector), contentDescription = "Stop", tint = Color.White)
                        }
                        FloatingActionButton(onClick = {
                            if (runState.isRunning) viewModel.pauseRun() else viewModel.resumeRun()
                        }, modifier = Modifier.size(70.dp)) {
                            Icon(painter = painterResource(id = if (runState.isRunning) R.drawable.icon_pause_vector else R.drawable.icon_play_vector), contentDescription = if (runState.isRunning) "Pause" else "Resume", tint = Color.White)
                        }
                        Spacer(modifier = Modifier.size(48.dp)) // To balance the layout
                    } else {
                        FloatingActionButton(onClick = { viewModel.startRun() }, modifier = Modifier.size(70.dp)) {
                            Icon(painter = painterResource(id = R.drawable.icon_play_vector), contentDescription = "Start", tint = Color.White)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun RunMetric(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = label, style = AppTextStyles.caption, color = Colors.textMuted)
        Text(text = value, style = AppTextStyles.h2, color = Colors.textPrimary, fontWeight = FontWeight.Bold)
    }
}
