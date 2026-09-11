package live.airuncoach.airuncoach.ui.screens

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.viewmodel.ObserverRunSessionViewModel
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*

/**
 * Observer view of a live run session.
 * Shows the runner's real-time location and metrics, with a waiting state if the run hasn't started yet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ObserverRunSessionScreen(
    sessionId: String,
    onNavigateBack: () -> Unit,
    isStandaloneObserver: Boolean = false,  // True when accessed from login screen (no back nav)
    // Opens the runner's full run summary once their phone has linked the finished session to
    // its uploaded run. Only offered to signed-in observers (the run endpoints need auth), so
    // the standalone/token path leaves this as the default no-op and the button is hidden.
    onViewRunSummary: ((runId: String) -> Unit)? = null
) {
    val viewModel: ObserverRunSessionViewModel = hiltViewModel()
    val liveSession by viewModel.liveSession.collectAsState()
    val error by viewModel.error.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    LaunchedEffect(sessionId) {
        Log.d("ObserverSession", "Loading session: $sessionId (standalone: $isStandaloneObserver)")
        viewModel.loadRunnerSession(sessionId)
    }

    Scaffold(
        topBar = {
            if (!isStandaloneObserver) {
                // Show top bar with back button for logged-in observers
                TopAppBar(
                    title = { 
                        Text(
                            if (liveSession?.hasStarted == true) "Live Run" else "Run Invitation",
                            style = AppTextStyles.h4,
                            color = Color.White
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onNavigateBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Colors.primary,
                        titleContentColor = Color.White,
                        navigationIconContentColor = Color.White
                    )
                )
            } else {
                // Hide navigation for standalone observers (from login screen)
                TopAppBar(
                    title = { 
                        Text(
                            if (liveSession?.hasStarted == true) "Live Run" else "Run Invitation",
                            style = AppTextStyles.h4,
                            color = Color.White
                        )
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Colors.primary,
                        titleContentColor = Color.White,
                        navigationIconContentColor = Color.White
                    )
                )
            }
        },
        containerColor = Colors.backgroundRoot
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Colors.backgroundRoot)
        ) {
            when {
                isLoading -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Colors.backgroundRoot),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            CircularProgressIndicator(color = Colors.primary)
                            Text(
                                "Loading run session...",
                                style = AppTextStyles.body,
                                color = Colors.textMuted
                            )
                        }
                    }
                }
                error != null -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Colors.backgroundRoot),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                            modifier = Modifier.padding(24.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Clear,
                                contentDescription = "Error",
                                modifier = Modifier.size(48.dp),
                                tint = Color.Red
                            )
                            Text(
                                "Error loading session",
                                style = AppTextStyles.body.copy(fontSize = 18.sp),
                                color = Color.Red,
                                textAlign = TextAlign.Center
                            )
                            Text(
                                error ?: "Unknown error",
                                style = AppTextStyles.body,
                                color = Colors.textMuted,
                                textAlign = TextAlign.Center
                            )
                            Button(
                                onClick = { viewModel.loadRunnerSession(sessionId) },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Retry")
                            }
                        }
                    }
                }
                liveSession == null -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Colors.backgroundRoot),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "Session not found",
                            style = AppTextStyles.body,
                            color = Colors.textMuted
                        )
                    }
                }
                liveSession?.isActive == false -> {
                    // Run has ended — show the finished screen
                    RunFinishedScreen(
                        session = liveSession!!,
                        onNavigateBack = onNavigateBack,
                        isStandaloneObserver = isStandaloneObserver,
                        onViewRunSummary = if (isStandaloneObserver) null else onViewRunSummary
                    )
                }
                liveSession?.hasStarted != true -> {
                    // Waiting state - runner hasn't started yet
                    WaitingForRunnerScreen(
                        runnerName = liveSession?.runnerName ?: "Unknown",
                        onCancel = onNavigateBack
                    )
                }
                else -> {
                    // Active run - show map and metrics
                    LiveRunMapScreen(
                        session = liveSession!!,
                        onNavigateBack = onNavigateBack
                    )
                }
            }
        }
    }
}

/**
 * Waiting screen shown to observer until the runner starts their run.
 */
@Composable
fun WaitingForRunnerScreen(
    runnerName: String,
    onCancel: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(32.dp)
        ) {
            // Spinner animation
            CircularProgressIndicator(
                color = Colors.primary,
                modifier = Modifier.size(48.dp),
                strokeWidth = 4.dp
            )

            Text(
                "Waiting for $runnerName to start the run session",
                style = AppTextStyles.h3,
                textAlign = TextAlign.Center,
                color = Colors.textPrimary
            )

            Text(
                "You'll see their live location and metrics once they begin",
                style = AppTextStyles.body,
                textAlign = TextAlign.Center,
                color = Colors.textMuted
            )

            Button(
                onClick = onCancel,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp)
            ) {
                Text("Cancel", fontSize = 16.sp)
            }
        }
    }
}

/**
 * Live map view showing the runner's real-time location and metrics.
 */
@Composable
fun LiveRunMapScreen(
    session: ObserverLiveRunSession,
    onNavigateBack: () -> Unit
) {
    var mapReady by remember { mutableStateOf(false) }
    val cameraPositionState = rememberCameraPositionState()

    // Follow the runner. The camera was only positioned once in onMapLoaded, so after the
    // first fix the marker ran straight off-screen. Only re-centre while the observer isn't
    // dragging the map themselves, so they can still look around the route.
    LaunchedEffect(session.currentLat, session.currentLng, mapReady) {
        val lat = session.currentLat ?: return@LaunchedEffect
        val lng = session.currentLng ?: return@LaunchedEffect
        if (!mapReady || cameraPositionState.isMoving) return@LaunchedEffect
        cameraPositionState.animate(CameraUpdateFactory.newLatLng(LatLng(lat, lng)))
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        if (session.isPaused) {
            Text(
                "${session.runnerName} has paused",
                style = AppTextStyles.body,
                color = Colors.buttonText,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Colors.warning)
                    .padding(vertical = 8.dp)
            )
        }

        // Map area
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(Colors.backgroundRoot)
        ) {
            if (session.currentLat != null && session.currentLng != null) {
                GoogleMap(
                    modifier = Modifier.fillMaxSize(),
                    cameraPositionState = cameraPositionState,
                    onMapLoaded = {
                        mapReady = true
                        // Center on runner's location
                        cameraPositionState.move(
                            CameraUpdateFactory.newLatLngZoom(
                                LatLng(session.currentLat!!, session.currentLng!!),
                                17f
                            )
                        )
                    }
                ) {
                    // Runner marker
                    if (session.currentLat != null && session.currentLng != null) {
                        Marker(
                            state = MarkerState(
                                position = LatLng(session.currentLat!!, session.currentLng!!)
                            ),
                            title = session.runnerName,
                            snippet = "Current position"
                        )
                    }

                    // GPS track polyline
                    if (session.gpsTrack != null && session.gpsTrack!!.isNotEmpty()) {
                        Polyline(
                            points = session.gpsTrack!!.map { LatLng(it.lat, it.lng) },
                            color = Colors.primary,
                            width = 5f
                        )
                    }
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Colors.backgroundRoot),
                    contentAlignment = Alignment.Center
                ) {
                    Text("Waiting for GPS signal...", color = Colors.textMuted)
                }
            }
        }

        // Metrics panel
        MetricsPanel(session = session)

        // Back button
        Button(
            onClick = onNavigateBack,
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text("Exit")
        }
    }
}

/**
 * Metrics panel showing runner's live stats.
 */
@Composable
fun MetricsPanel(session: ObserverLiveRunSession) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Colors.backgroundRoot)
            .padding(16.dp)
    ) {
        // Runner name and status
        Text(
            "${session.runnerName}'s Run",
            style = AppTextStyles.h3,
            color = Colors.textPrimary
        )

        // Staleness line — the runner syncs every 5 s, so anything past ~20 s means the phone
        // has stopped reporting (no signal, backgrounded, dead battery). Without this the
        // observer can't tell frozen numbers from a steady runner. Re-evaluated every second.
        val lastSyncMs = session.lastSyncedAtMs
        if (lastSyncMs != null && !session.isPaused) {
            var nowMs by remember { mutableStateOf(System.currentTimeMillis()) }
            LaunchedEffect(Unit) {
                while (true) {
                    kotlinx.coroutines.delay(1000)
                    nowMs = System.currentTimeMillis()
                }
            }
            val ageSecs = ((nowMs - lastSyncMs) / 1000L).coerceAtLeast(0)
            if (ageSecs >= 20) {
                Text(
                    "Last update ${formatTime(ageSecs.toInt())} ago — ${session.runnerName} may have lost signal",
                    style = AppTextStyles.caption,
                    color = Colors.warning
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Metrics grid
        Row(
            modifier = Modifier
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            MetricBox(
                label = "Distance",
                value = "%.2f km".format(session.distanceCovered),
                modifier = Modifier.weight(1f)
            )
            MetricBox(
                label = "Time",
                value = formatTime(session.elapsedTime),
                modifier = Modifier.weight(1f)
            )
            MetricBox(
                label = "Pace",
                value = session.currentPace ?: "--:--",
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Heart rate if available
        if (session.currentHeartRate != null && session.currentHeartRate!! > 0) {
            Row(
                modifier = Modifier
                    .fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                MetricBox(
                    label = "Heart Rate",
                    value = "${session.currentHeartRate} bpm",
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
fun MetricBox(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .background(Colors.backgroundRoot, shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(label, style = AppTextStyles.caption, color = Colors.textMuted, fontSize = 10.sp)
        Text(value, style = AppTextStyles.h4, color = Colors.primary)
    }
}

fun formatTime(seconds: Int): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val secs = seconds % 60
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, secs)
    } else {
        "%d:%02d".format(minutes, secs)
    }
}

/**
 * Shown to the observer when the runner has ended their session.
 * Registered users see a "Go to Dashboard" button; standalone observers see "Close App" message.
 */
@Composable
fun RunFinishedScreen(
    session: ObserverLiveRunSession,
    onNavigateBack: () -> Unit,
    isStandaloneObserver: Boolean = false,
    onViewRunSummary: ((runId: String) -> Unit)? = null
) {
    val runnerName = session.runnerName
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .padding(32.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Text("✅", fontSize = 56.sp)

            Text(
                if (isStandaloneObserver) "Run has ended" else "Run finished!",
                style = AppTextStyles.h3,
                color = Colors.textPrimary,
                textAlign = TextAlign.Center
            )

            Text(
                if (isStandaloneObserver) {
                    "${runnerName}'s run has ended. You can close this app."
                } else {
                    "${runnerName}'s run has ended. Great job cheering them on!"
                },
                style = AppTextStyles.body,
                color = Colors.textMuted,
                textAlign = TextAlign.Center
            )

            // Final numbers — the runner's phone sends its finishing distance/time/pace/HR in
            // the same sync that ends the session, so these are the real totals, not the last
            // 5 s-throttled update. Only shown if the run actually got going.
            if (session.hasStarted && (session.distanceCovered > 0 || session.elapsedTime > 0)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    MetricBox("Distance", "%.2f km".format(session.distanceCovered), Modifier.weight(1f))
                    MetricBox("Time", formatTime(session.elapsedTime), Modifier.weight(1f))
                    MetricBox("Pace", session.currentPace ?: "--:--", Modifier.weight(1f))
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            val resultRunId = session.resultRunId
            if (onViewRunSummary != null && !resultRunId.isNullOrBlank()) {
                Button(
                    onClick = { onViewRunSummary(resultRunId) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("View ${runnerName}'s full run", fontSize = 16.sp, color = Colors.buttonText)
                }
            } else if (onViewRunSummary != null && session.hasStarted) {
                // The runner's phone links the run a few seconds after finishing (once its
                // upload completes) — the VM's final poll picks it up.
                Text(
                    "Full run summary will be available shortly…",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    textAlign = TextAlign.Center
                )
            }

            Button(
                onClick = onNavigateBack,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
            ) {
                Text(
                    if (isStandaloneObserver) "Close App" else "Go Back to Dashboard",
                    fontSize = 16.sp,
                    color = Color.White
                )
            }
        }
    }
}

// Data class for observer view of a live session
data class ObserverLiveRunSession(
    val id: String,
    val userId: String,          // Runner's ID
    val runnerName: String,
    val currentLat: Double?,
    val currentLng: Double?,
    val distanceCovered: Double,
    val elapsedTime: Int,
    val currentPace: String?,
    val currentHeartRate: Int?,
    val hasStarted: Boolean,
    val isActive: Boolean = true,  // false means run has ended
    val startedAt: Long?,
    val routeId: String?,
    val gpsTrack: List<GpsPoint>?,
    val isPaused: Boolean = false,      // runner paused — shown instead of silently frozen metrics
    val resultRunId: String? = null,    // the runner's uploaded run, once their phone links it
    val lastSyncedAtMs: Long? = null    // server-side last update, for the "last update Xs ago" line
)

data class GpsPoint(
    val lat: Double,
    val lng: Double,
    val timestamp: Long,
    val altitude: Double? = null
)
