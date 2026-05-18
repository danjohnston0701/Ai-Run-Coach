package live.airuncoach.android.strava

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Strava Share Button & Status - shown on post-run screen
 */
@Composable
fun StravaShareButton(
    runId: String,
    connectionStatus: StravaConnection,
    viewModel: StravaViewModel,
    modifier: Modifier = Modifier
) {
    val publishResult by viewModel.publishResult.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    Column(modifier = modifier.fillMaxWidth()) {
        if (connectionStatus.connected) {
            // Strava Connected - Show Share Button
            StravaPublishButton(
                isLoading = isLoading,
                onPublishClick = {
                    viewModel.publishToStrava(runId)
                }
            )
        } else {
            // Strava Not Connected - Show Connect Prompt
            NotConnectedPrompt()
        }

        // Publish Status/Result
        publishResult?.let { result ->
            Spacer(modifier = Modifier.height(12.dp))
            PublishResultCard(result)
        }
    }
}

@Composable
fun StravaPublishButton(
    isLoading: Boolean,
    onPublishClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onPublishClick,
        enabled = !isLoading,
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color(0xFFFC5200) // Strava orange
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                color = Color.White,
                strokeWidth = 2.dp
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Publishing to Strava...", color = Color.White)
        } else {
            Icon(
                imageVector = Icons.Default.Share,
                contentDescription = "Share",
                tint = Color.White,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Share to Strava", color = Color.White)
        }
    }
}

@Composable
fun NotConnectedPrompt(modifier: Modifier = Modifier) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.warningContainer,
                RoundedCornerShape(8.dp)
            ),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.warningContainer
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = "Info",
                tint = MaterialTheme.colorScheme.onWarningContainer,
                modifier = Modifier.size(24.dp).padding(bottom = 8.dp)
            )
            Text(
                text = "Connect Strava in Settings",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onWarningContainer,
                modifier = Modifier.padding(bottom = 4.dp)
            )
            Text(
                text = "Share your runs to Strava with complete GPS data and metrics",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onWarningContainer
            )
        }
    }
}

@Composable
fun PublishResultCard(
    result: StravaPublishResult,
    modifier: Modifier = Modifier
) {
    val isSuccess = result.success

    Card(
        modifier = modifier
            .fillMaxWidth()
            .background(
                if (isSuccess)
                    MaterialTheme.colorScheme.primaryContainer
                else
                    MaterialTheme.colorScheme.errorContainer,
                RoundedCornerShape(8.dp)
            ),
        colors = CardDefaults.cardColors(
            containerColor = if (isSuccess)
                MaterialTheme.colorScheme.primaryContainer
            else
                MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = if (isSuccess)
                        Icons.Default.CheckCircle
                    else
                        Icons.Default.Error,
                    contentDescription = if (isSuccess) "Success" else "Error",
                    tint = if (isSuccess)
                        MaterialTheme.colorScheme.primary
                    else
                        MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(20.dp)
                )

                Text(
                    text = when {
                        result.message != null -> result.message
                        result.error != null -> result.error
                        isSuccess -> "Run published to Strava!"
                        else -> "Failed to publish run"
                    },
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (isSuccess)
                        MaterialTheme.colorScheme.onPrimaryContainer
                    else
                        MaterialTheme.colorScheme.onErrorContainer
                )
            }

            // Show Strava link if available
            if (result.stravaUrl != null && isSuccess) {
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { /* Handle click to open Strava */ },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        imageVector = Icons.Default.OpenInBrowser,
                        contentDescription = "Open in Strava",
                        modifier = Modifier.size(16.dp).padding(end = 4.dp)
                    )
                    Text("View on Strava")
                }
            }

            // Show processing message
            if (result.uploadId != null && result.activityId == null && isSuccess) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Color.Black.copy(alpha = 0.1f),
                            RoundedCornerShape(4.dp)
                        )
                        .padding(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 1.dp
                    )
                    Text(
                        text = "Processing on Strava... (20-30 seconds)",
                        fontSize = 11.sp
                    )
                }
            }
        }
    }
}

/**
 * Strava Activities List - shows all published runs
 */
@Composable
fun StravaActivitiesScreen(
    viewModel: StravaViewModel,
    modifier: Modifier = Modifier
) {
    val activities by viewModel.stravaActivities.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.fetchStravaActivities()
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(16.dp)
    ) {
        // Header
        Text(
            text = "Published to Strava",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (activities.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = "No activities",
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.outline
                    )
                    Text(
                        text = "No activities published yet",
                        fontSize = 16.sp,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        } else {
            // Activities List
            activities.forEach { activity ->
                ActivityCard(activity)
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

@Composable
fun ActivityCard(activity: StravaActivity) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.surfaceVariant,
                RoundedCornerShape(8.dp)
            ),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = activity.name,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = "Published",
                    tint = Color(0xFFFC5200),
                    modifier = Modifier.size(20.dp)
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "📍 ${String.format("%.1f", activity.distance)}km",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "⏱️ ${activity.duration / 60}m",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Button(
                onClick = { /* Handle click to open in Strava */ },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFFC5200)
                )
            ) {
                Text("View on Strava", color = Color.White, fontSize = 12.sp)
            }
        }
    }
}
