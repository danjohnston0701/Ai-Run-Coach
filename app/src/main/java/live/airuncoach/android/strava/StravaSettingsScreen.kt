package live.airuncoach.android.strava

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Strava Settings Screen - shows connection status and allows connecting/disconnecting
 */
@Composable
fun StravaSettingsScreen(
    viewModel: StravaViewModel,
    onActivityClicked: () -> Unit = {}
) {
    val connectionStatus by viewModel.connectionStatus.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        viewModel.checkStravaConnection()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp)
    ) {
        // Header
        Text(
            text = "Strava Integration",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 24.dp)
        )

        // Connection Status Card
        StravaConnectionCard(
            connectionStatus = connectionStatus,
            isLoading = isLoading,
            onConnectClick = { viewModel.initiateStravaAuth(context) },
            onDisconnectClick = { viewModel.disconnectStrava() },
            onActivitiesClick = { onActivityClicked() }
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Error Message
        if (error != null) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        MaterialTheme.colorScheme.errorContainer,
                        RoundedCornerShape(8.dp)
                    ),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Error,
                        contentDescription = "Error",
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier
                            .size(24.dp)
                            .padding(end = 8.dp)
                    )
                    Text(
                        text = error ?: "",
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // How It Works Section
        HowItWorksSection()

        Spacer(modifier = Modifier.height(24.dp))

        // Features Section
        FeaturesSection()
    }
}

@Composable
fun StravaConnectionCard(
    connectionStatus: StravaConnection,
    isLoading: Boolean,
    onConnectClick: () -> Unit,
    onDisconnectClick: () -> Unit,
    onActivitiesClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (connectionStatus.connected)
                    MaterialTheme.colorScheme.primaryContainer
                else
                    MaterialTheme.colorScheme.surfaceVariant,
                RoundedCornerShape(12.dp)
            ),
        colors = CardDefaults.cardColors(
            containerColor = if (connectionStatus.connected)
                MaterialTheme.colorScheme.primaryContainer
            else
                MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Status Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = if (connectionStatus.connected)
                        Icons.Default.CheckCircle
                    else
                        Icons.Default.Info,
                    contentDescription = "Status",
                    tint = if (connectionStatus.connected)
                        MaterialTheme.colorScheme.primary
                    else
                        MaterialTheme.colorScheme.outline,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (connectionStatus.connected) "Connected to Strava" else "Not Connected",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            // Athlete Info
            if (connectionStatus.connected && connectionStatus.athleteName != null) {
                Text(
                    text = connectionStatus.athleteName ?: "",
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
                if (connectionStatus.lastSync != null) {
                    Text(
                        text = "Last synced: ${connectionStatus.lastSync}",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )
                }
            }

            // Action Buttons
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (connectionStatus.connected) {
                    // Activities Button
                    Button(
                        onClick = onActivitiesClick,
                        modifier = Modifier.weight(1f),
                        enabled = !isLoading
                    ) {
                        Icon(
                            imageVector = Icons.Default.List,
                            contentDescription = "Activities",
                            modifier = Modifier.size(18.dp).padding(end = 4.dp)
                        )
                        Text("Activities")
                    }

                    // Disconnect Button
                    OutlinedButton(
                        onClick = onDisconnectClick,
                        modifier = Modifier.weight(1f),
                        enabled = !isLoading
                    ) {
                        Text("Disconnect")
                    }
                } else {
                    // Connect Button
                    Button(
                        onClick = onConnectClick,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !isLoading
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Text("Connect Strava")
                    }
                }
            }
        }
    }
}

@Composable
fun HowItWorksSection() {
    Text(
        text = "How It Works",
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(bottom = 8.dp)
    )

    val steps = listOf(
        "1. Connect your Strava account",
        "2. Complete a run",
        "3. Tap 'Share to Strava' in post-run screen",
        "4. Activity appears in your Strava feed with route map"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.surfaceVariant,
                RoundedCornerShape(8.dp)
            )
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        steps.forEach { step ->
            Text(
                text = step,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun FeaturesSection() {
    Text(
        text = "Features",
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(bottom = 8.dp)
    )

    val features = listOf(
        "📍 GPS track mapping" to "Strava generates route maps",
        "❤️ Heart rate data" to "Complete biometric details",
        "🏃 Cadence metrics" to "Running dynamics included",
        "⛰️ Elevation data" to "Altitude profiles included"
    )

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        features.forEach { (feature, description) ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant,
                        RoundedCornerShape(8.dp)
                    )
                    .padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = feature,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.width(120.dp)
                )
                Text(
                    text = description,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
