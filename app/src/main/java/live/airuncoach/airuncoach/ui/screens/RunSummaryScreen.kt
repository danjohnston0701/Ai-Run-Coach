package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.R
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
                    // Run Header with Garmin badge if synced from Garmin
                    item {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(20.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Run Summary",
                                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    
                                    // Garmin badge if synced from Garmin
                                    if (runSession?.externalSource == "garmin") {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier
                                                .background(
                                                    Color(0xFF00A0DC).copy(alpha = 0.1f),
                                                    RoundedCornerShape(8.dp)
                                                )
                                                .padding(horizontal = 12.dp, vertical = 6.dp)
                                        ) {
                                            Icon(
                                                painter = painterResource(id = R.drawable.ic_garmin_logo),
                                                contentDescription = "Synced from Garmin Connect",
                                                tint = Color.Unspecified,
                                                modifier = Modifier.size(20.dp)
                                            )
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                text = "Garmin Connect",
                                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                                                color = Color(0xFF00A0DC)
                                            )
                                        }
                                    }
                                }
                                
                                Spacer(modifier = Modifier.height(12.dp))
                                
                                // Run stats
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column {
                                        Text(
                                            text = "Distance",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Text(
                                            text = String.format("%.2f km", runSession!!.distance),
                                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            text = "Duration",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        val durationSeconds = runSession!!.duration / 1000
                                        val hours = durationSeconds / 3600
                                        val minutes = (durationSeconds % 3600) / 60
                                        val seconds = durationSeconds % 60
                                        Text(
                                            text = String.format("%02d:%02d:%02d", hours, minutes, seconds),
                                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                            }
                        }
                    }
                    
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
                    
                    // "Powered by Garmin" attribution (required for Garmin brand guidelines)
                    if (runSession?.externalSource == "garmin") {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 24.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Powered by Garmin",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                )
                            }
                        }
                    }
                }
            }
        }
    )
}
