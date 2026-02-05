package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.patrykandpatrick.vico.compose.axis.horizontal.rememberBottomAxis
import com.patrykandpatrick.vico.compose.axis.vertical.rememberStartAxis
import com.patrykandpatrick.vico.compose.chart.Chart
import com.patrykandpatrick.vico.compose.chart.line.lineChart
import com.patrykandpatrick.vico.core.entry.entryModelOf
import live.airuncoach.airuncoach.viewmodel.RunSummaryViewModel

@Composable
fun RunSummaryScreen(
    runId: String,
    onNavigateBack: () -> Unit = {},
    onNavigateToLogin: () -> Unit = {},
    viewModel: RunSummaryViewModel = hiltViewModel()
) {
    val runSession by viewModel.runSession.collectAsState()
    val analysisState by viewModel.analysisState.collectAsState()
    val isLoadingRun by viewModel.isLoadingRun.collectAsState()
    val loadError by viewModel.loadError.collectAsState()

    // Load the run data when the screen is first composed
    val error = loadError
    val sessionExpired = error?.contains("expired") == true || error?.contains("log in") == true
    
    if (runSession == null && error == null) {
        viewModel.loadRunById(runId)
    }

    Scaffold(
        topBar = {
            // Top bar with back button and share action
        },
        content = {
            if (isLoadingRun) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (error != null) {
                // Error view
                Box(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(text = "⚠️", fontSize = 48.sp)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = error,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(24.dp))
                        
                        if (sessionExpired) {
                            androidx.compose.material3.Button(
                                onClick = onNavigateToLogin,
                                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary
                                )
                            ) {
                                Text("Log In")
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                        }
                        
                        androidx.compose.material3.TextButton(onClick = onNavigateBack) {
                            Text("Go Back")
                        }
                    }
                }
            } else if (runSession == null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                LazyColumn(modifier = Modifier.padding(it)) {
                    item {
                        val cameraPositionState = rememberCameraPositionState {
                            val routePoints = runSession!!.routePoints.map { LatLng(it.latitude, it.longitude) }
                            position = CameraPosition.fromLatLngZoom(routePoints.first(), 15f)
                        }
                        GoogleMap(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(300.dp),
                            cameraPositionState = cameraPositionState
                        ) {
                            Polyline(
                                points = runSession!!.routePoints.map { LatLng(it.latitude, it.longitude) },
                            )
                        }
                    }
                    item {
                        // Pace Chart
                        val paceData = entryModelOf(*runSession!!.kmSplits.map { it.time.toFloat() }.toTypedArray())
                        Chart(
                            chart = lineChart(),
                            model = paceData,
                            startAxis = rememberStartAxis(),
                            bottomAxis = rememberBottomAxis(),
                        )
                    }
                    item {
                        // Heart Rate Chart
                        val hrData = entryModelOf(*runSession!!.routePoints.map { it.speed }.toTypedArray())
                        Chart(
                            chart = lineChart(),
                            model = hrData,
                            startAxis = rememberStartAxis(),
                            bottomAxis = rememberBottomAxis(),
                        )
                    }
                    item {
                        // Elevation Chart
                        val elevationData = entryModelOf(*runSession!!.routePoints.map { it.altitude?.toFloat() ?: 0f }.toTypedArray())
                        Chart(
                            chart = lineChart(),
                            model = elevationData,
                            startAxis = rememberStartAxis(),
                            bottomAxis = rememberBottomAxis(),
                        )
                    }
                }
            }
        }
    )
}
