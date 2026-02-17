package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import coil.request.ImageRequest
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.GarminConnection
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.domain.model.WeatherData
import live.airuncoach.airuncoach.ui.components.TargetTimeCard
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.DashboardViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onNavigateToRouteGeneration: () -> Unit = {},
    onNavigateToFreeRunSetup: () -> Unit = {},
    onNavigateToRunSession: () -> Unit = {},
    onNavigateToPreviousRuns: () -> Unit = {},
    onNavigateToGoals: () -> Unit = {},
    onNavigateToProfile: () -> Unit = {},
    onNavigateToHistory: () -> Unit = {},
    onCreateGoal: () -> Unit = {},
    viewModel: DashboardViewModel = hiltViewModel(),
    // Key to trigger refresh when returning from other screens
    refreshKey: Int = 0
) {
    val user by viewModel.user.collectAsState()
    val garminConnection by viewModel.garminConnection.collectAsState()
    val weatherData by viewModel.weatherData.collectAsState()
    val goals by viewModel.goals.collectAsState()
    val currentTime by viewModel.currentTime.collectAsState()
    val targetDistance by viewModel.targetDistance.collectAsState()
    val isTargetTimeEnabled by viewModel.isTargetTimeEnabled.collectAsState()
    val targetHours by viewModel.targetHours.collectAsState()
    val targetMinutes by viewModel.targetMinutes.collectAsState()
    val targetSeconds by viewModel.targetSeconds.collectAsState()
    val hasLocationPermission by viewModel.hasLocationPermission.collectAsState()
    val recentRun by viewModel.recentRun.collectAsState()
    val isAiCoachEnabled by viewModel.isAiCoachEnabled.collectAsState()
    val activeRunSession by viewModel.activeRunSession.collectAsState()

    // Optimize: Only load data once when screen is first shown
    LaunchedEffect(Unit) {
        viewModel.fetchRecentRun()
        viewModel.refreshGoals()
        viewModel.checkLocationPermission()
    }

    // Refresh runs when returning from other screens (e.g., after completing a run)
    LaunchedEffect(refreshKey) {
        if (refreshKey > 0) {
            viewModel.fetchRecentRun()
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .imePadding() // Auto-scroll to keep text fields visible when keyboard opens
            .padding(vertical = Spacing.lg)
    ) {
        // Active Run Banner (if run is in progress)
        val activeRun = activeRunSession
        if (activeRun != null && activeRun.isActive) {
            item {
                ActiveRunBanner(
                    runSession = activeRun,
                    onResumeRun = onNavigateToRunSession
                )
            }
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
        }
        
        item { 
            WelcomeSection(
                userName = user?.name,
                profilePicUrl = user?.profilePic,
                aiCoachName = user?.coachName,
                onProfileClick = onNavigateToProfile
            )
        }
        item { Spacer(modifier = Modifier.height(Spacing.xl)) }
        
        // Only show Garmin card if device is connected
        garminConnection?.let {
            item { GarminConnectionCard(connection = it) }
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
        }
        item { GoalCard(goal = goals.firstOrNull(), onClick = onNavigateToGoals, onAddGoal = onCreateGoal) }
        item { Spacer(modifier = Modifier.height(Spacing.md)) }
        item { 
            val weather = weatherData
            if (weather != null) {
                TimeAndWeatherBar(time = currentTime, weather = weather)
            } else {
                NoWeatherDataBar(time = currentTime)
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.xl)) }
        
        // Location permission warning
        if (!hasLocationPermission) {
            item { LocationPermissionWarning() }
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
        }
        item { TargetDistanceSection(distance = targetDistance, onDistanceChanged = viewModel::onDistanceChanged) }
        item { Spacer(modifier = Modifier.height(Spacing.md)) }
        item { 
            TargetTimeCard(
                isEnabled = isTargetTimeEnabled,
                onEnabledChange = viewModel::onTargetTimeToggled,
                hours = targetHours,
                minutes = targetMinutes,
                seconds = targetSeconds,
                onHoursChange = viewModel::onTargetHoursChanged,
                onMinutesChange = viewModel::onTargetMinutesChanged,
                onSecondsChange = viewModel::onTargetSecondsChanged
            )
        }
        item { Spacer(modifier = Modifier.height(Spacing.md)) }
        // AI Coach Toggle
        item {
            AiCoachToggle(
                isEnabled = isAiCoachEnabled,
                onToggle = viewModel::toggleAiCoach
            )
        }
        item { Spacer(modifier = Modifier.height(Spacing.sm)) }
        item { 
            val activeRun = activeRunSession
            val hasActiveRun = activeRun != null && activeRun.isActive
            ActionButtons(
                onMapMyRun = onNavigateToRouteGeneration,
                onRunWithoutRoute = onNavigateToFreeRunSetup,
                isEnabled = hasLocationPermission && !hasActiveRun
            )
        }
        item { Spacer(modifier = Modifier.height(Spacing.md)) }
        item {
            PreviousRunsCard(
                recentRun = recentRun,
                onClick = onNavigateToPreviousRuns
            )
        }
        item { Spacer(modifier = Modifier.height(Spacing.xxl)) }
    }
}

@Composable
fun ActiveRunBanner(runSession: RunSession, onResumeRun: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .clickable(onClick = onResumeRun),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.primary.copy(alpha = 0.2f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                // Pulsing indicator
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(Colors.success)
                )
                
                Spacer(modifier = Modifier.width(Spacing.md))
                
                Column {
                    Text(
                        text = "RUN IN PROGRESS",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row {
                        Text(
                            text = runSession.getFormattedDuration(),
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                            color = Colors.textPrimary
                        )
                        Text(
                            text = " • ${String.format("%.2f", runSession.distance / 1000)} km",
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                    }
                }
            }
            
            Button(
                onClick = onResumeRun,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText
                ),
                shape = RoundedCornerShape(BorderRadius.sm),
                modifier = Modifier.height(40.dp)
            ) {
                Text(
                    text = "Resume →",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold)
                )
            }
        }
    }
}

@Composable
fun WelcomeSection(userName: String?, profilePicUrl: String?, aiCoachName: String?, onProfileClick: () -> Unit) {
    val context = LocalContext.current
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = userName?.uppercase() ?: "RUNNER",
                style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                color = Colors.primary
            )
            Text(
                text = "Welcome, Plan your run with ${aiCoachName ?: "your AI Coach"}",
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
        }
        // User Avatar - Profile Image or Default Icon (Clickable)
        Box(
            modifier = Modifier
                .size(70.dp)
                .clip(CircleShape)
                .background(Colors.primary.copy(alpha = 0.2f))
                .border(3.dp, Colors.primary, CircleShape)
                .clickable { onProfileClick() },
            contentAlignment = Alignment.Center
        ) {
            if (!profilePicUrl.isNullOrBlank()) {
                // Load actual profile image from URL (Neon database)
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(profilePicUrl)
                        .crossfade(true)
                        .build(),
                    contentDescription = "User Profile Picture",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    error = painterResource(id = R.drawable.icon_profile_vector), // Fallback if image fails to load
                    placeholder = painterResource(id = R.drawable.icon_profile_vector) // Show while loading
                )
            } else {
                // Default profile icon when no image URL set
                Icon(
                    painter = painterResource(id = R.drawable.icon_profile_vector),
                    contentDescription = "User Profile",
                    tint = Colors.primary,
                    modifier = Modifier.size(40.dp)
                )
            }
        }
    }
}

@Composable
fun GarminConnectionCard(connection: GarminConnection) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .clickable { /* Navigate to Garmin settings */ },
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.6f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Garmin watch icon with green background
            Box(
                modifier = Modifier
                    .size(50.dp)
                    .clip(CircleShape)
                    .background(Colors.success.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_timer_vector),
                    contentDescription = "Garmin Watch",
                    tint = Colors.success,
                    modifier = Modifier.size(28.dp)
                )
            }
            
            Spacer(modifier = Modifier.width(Spacing.md))
            
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = connection.deviceName ?: "Garmin Connected",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.width(Spacing.xs))
                    Icon(
                        painter = painterResource(id = R.drawable.icon_play_vector),
                        contentDescription = "Connected",
                        tint = Colors.success,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Text(
                    text = "Last sync: ${connection.getLastSyncFormatted()}",
                    style = AppTextStyles.small,
                    color = Colors.textMuted
                )
            }
            
            Icon(
                painter = painterResource(id = R.drawable.icon_play_vector),
                contentDescription = "Chevron",
                tint = Colors.textMuted,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
fun GoalCard(goal: Goal?, onClick: () -> Unit, onAddGoal: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .clickable(onClick = onClick),
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
            // Target icon with rounded square background (matching web app)
            Box(
                modifier = Modifier
                    .size(60.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Colors.primary.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_target_vector),
                    contentDescription = "Goal Icon",
                    tint = Colors.primary,
                    modifier = Modifier.size(32.dp)
                )
            }
            
            Spacer(modifier = Modifier.width(Spacing.md))
            
            Column(modifier = Modifier.weight(1f)) {
                if (goal != null) {
                    Text(
                        text = "GOAL",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textMuted
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = goal.title,
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    // Format: "5K • Target: 0:22:00"
                    val targetInfo = buildString {
                        goal.distanceTarget?.let { append(it) }
                        goal.timeTargetSeconds?.let { seconds ->
                            if (isNotEmpty()) append(" • ")
                            append("Target: ")
                            val hours = seconds / 3600
                            val minutes = (seconds % 3600) / 60
                            val secs = seconds % 60
                            append(String.format("%d:%02d:%02d", hours, minutes, secs))
                        }
                    }
                    if (targetInfo.isNotEmpty()) {
                        Text(
                            text = targetInfo,
                            style = AppTextStyles.small,
                            color = Colors.textMuted
                        )
                    } else if (goal.description != null) {
                        Text(
                            text = goal.description,
                            style = AppTextStyles.small,
                            color = Colors.textMuted
                        )
                    }
                } else {
                    Text(
                        text = "GOAL",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textMuted
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "No active goal",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Set a goal to track your progress",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
            }
            
            // Arrow icon (matching web app)
            Icon(
                painter = painterResource(id = R.drawable.icon_arrow_left),
                contentDescription = "View Goal",
                tint = Colors.textMuted,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
fun TimeAndWeatherBar(time: String, weather: WeatherData) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .background(Colors.backgroundSecondary, shape = RoundedCornerShape(BorderRadius.sm))
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Icon(
            painter = painterResource(id = R.drawable.icon_timer_vector),
            contentDescription = "Time",
            tint = Colors.textMuted,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(
            text = time,
            style = AppTextStyles.body,
            color = Colors.textPrimary
        )
        Text(
            text = "  •  ",
            style = AppTextStyles.body,
            color = Colors.textMuted
        )
        // Weather icon based on condition
        Text(
            text = getWeatherEmoji(weather.condition ?: "Clear"),
            style = AppTextStyles.body.copy(fontSize = 20.sp),
            modifier = Modifier.padding(bottom = 2.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(
            text = "${weather.temperature.toInt()}°",
            style = AppTextStyles.body,
            color = Colors.textPrimary
        )
    }
}

/**
 * Returns weather emoji based on condition string from OpenWeatherMap API
 */
private fun getWeatherEmoji(condition: String): String {
    return when (condition.lowercase()) {
        "clear" -> "☀️"
        "clouds" -> "☁️"
        "rain", "drizzle" -> "🌧️"
        "thunderstorm" -> "⛈️"
        "snow" -> "❄️"
        "mist", "smoke", "haze", "fog" -> "🌫️"
        else -> "🌤️" // Partly cloudy as default
    }
}

@Composable
fun NoWeatherDataBar(time: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .background(Colors.backgroundSecondary, shape = RoundedCornerShape(BorderRadius.sm))
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Icon(
            painter = painterResource(id = R.drawable.icon_timer_vector),
            contentDescription = "Time",
            tint = Colors.textMuted,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(
            text = time,
            style = AppTextStyles.body,
            color = Colors.textPrimary
        )
        Text(
            text = "  •  ",
            style = AppTextStyles.body,
            color = Colors.textMuted
        )
        Text(
            text = "No weather data available",
            style = AppTextStyles.body,
            color = Colors.textMuted
        )
    }
}

@Composable
fun TargetDistanceSection(distance: Float, onDistanceChanged: (Float) -> Unit) {
    Column(modifier = Modifier.padding(horizontal = Spacing.lg)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom
        ) {
            Text(
                text = "TARGET DISTANCE",
                style = AppTextStyles.h4,
                color = Colors.textSecondary
            )
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = "%.0f".format(distance),
                    style = AppTextStyles.h2,
                    color = Colors.primary
                )
                Spacer(modifier = Modifier.width(Spacing.xs))
                Text(
                    text = "km",
                    style = AppTextStyles.h4,
                    color = Colors.primary,
                    modifier = Modifier.padding(bottom = Spacing.xs)
                )
            }
        }
        Spacer(modifier = Modifier.height(Spacing.sm))
        Slider(
            value = distance,
            onValueChange = onDistanceChanged,
            valueRange = 1f..42f,
            modifier = Modifier.fillMaxWidth(),
            colors = SliderDefaults.colors(
                thumbColor = Colors.primary,
                activeTrackColor = Colors.primary,
                inactiveTrackColor = Colors.backgroundTertiary
            )
        )
    }
}

@Composable
fun LocationPermissionWarning() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFFEF4444).copy(alpha = 0.15f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_location_vector),
                contentDescription = "Warning",
                tint = Color(0xFFEF4444),
                modifier = Modifier.size(32.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.md))
            Column {
                Text(
                    text = "Location Required",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Color(0xFFEF4444)
                )
                Text(
                    text = "Enable location services to generate routes and track runs",
                    style = AppTextStyles.small,
                    color = Colors.textSecondary
                )
            }
        }
    }
}

@Composable
fun ActionButtons(onMapMyRun: () -> Unit, onRunWithoutRoute: () -> Unit, isEnabled: Boolean = true) {
    Column(modifier = Modifier.padding(horizontal = Spacing.lg)) {
        // MAP MY RUN button - bright cyan with location icon
        Button(
            onClick = { if (isEnabled) onMapMyRun() },
            enabled = isEnabled,
            modifier = Modifier
                .fillMaxWidth()
                .height(60.dp),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = ButtonDefaults.buttonColors(
                containerColor = Colors.primary,
                contentColor = Colors.buttonText
            )
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_location_vector),
                contentDescription = "Location Icon",
                tint = Colors.buttonText,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text(
                text = "MAP MY RUN",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
            )
        }

        Spacer(modifier = Modifier.height(Spacing.md))

        // RUN WITHOUT ROUTE button - dark gray with play icon
        Button(
            onClick = { if (isEnabled) onRunWithoutRoute() },
            enabled = isEnabled,
            modifier = Modifier
                .fillMaxWidth()
                .height(60.dp),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = ButtonDefaults.buttonColors(
                containerColor = Colors.backgroundSecondary,
                contentColor = Colors.textPrimary
            )
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_play_vector),
                contentDescription = "Play Icon",
                tint = Colors.textPrimary,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text(
                text = "RUN WITHOUT ROUTE",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
            )
        }
    }
}

@Composable
fun PreviousRunDashboard(lastRun: RunSession, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.8f)
        )
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(
                text = "PREVIOUS RUN",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            
            // Date and time
            Text(
                text = SimpleDateFormat("MMM dd, yyyy • HH:mm", Locale.getDefault())
                    .format(Date(lastRun.startTime)),
                style = AppTextStyles.body,
                color = Colors.textMuted
            )
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Stats row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Distance
                Column {
                    Text(
                        text = String.format("%.2f km", lastRun.getDistanceInKm()),
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary
                    )
                    Text(
                        text = "Distance",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                }
                
                // Duration
                Column {
                    Text(
                        text = lastRun.getFormattedDuration(),
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary
                    )
                    Text(
                        text = "Time",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                }
                
                // Pace
                Column {
                    Text(
                        text = lastRun.averagePace ?: "--:--",
                        style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary
                    )
                    Text(
                        text = "Avg Pace",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            Text(
                text = "See previous runs →",
                style = AppTextStyles.small,
                color = Colors.primary
            )
        }
    }
}

@Composable
fun AiCoachToggle(
    isEnabled: Boolean,
    onToggle: (Boolean) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.sm),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.4f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_mic_vector),
                    contentDescription = "AI Coach",
                    tint = if (isEnabled) Colors.primary else Colors.textMuted,
                    modifier = Modifier.size(12.dp)
                )

                Spacer(modifier = Modifier.width(Spacing.xs))

                Text(
                    text = "AI Coach",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }

            Switch(
                checked = isEnabled,
                onCheckedChange = onToggle,
                modifier = Modifier.scale(0.6f),
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Colors.backgroundRoot,
                    checkedTrackColor = Colors.primary,
                    uncheckedThumbColor = Colors.textMuted,
                    uncheckedTrackColor = Colors.backgroundTertiary
                )
            )
        }
    }
}

@Composable
fun PreviousRunsCard(
    recentRun: RunSession?,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.6f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_clock_vector),
                        contentDescription = "Previous Runs",
                        tint = Colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    
                    Text(
                        text = "MOST RECENT RUN",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
            }
            
            if (recentRun != null) {
                Spacer(modifier = Modifier.height(Spacing.lg))

                // Use the same tile as Run History
                RunListItem(run = recentRun, onClick = onClick)

                Spacer(modifier = Modifier.height(Spacing.md))

                Text(
                    text = "Click to see all previous runs",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.primary,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onClick)
                )
            } else {
                Spacer(modifier = Modifier.height(Spacing.md))
                
                Text(
                    text = "No previous runs yet. Click to see all previous runs.",
                    style = AppTextStyles.body,
                    color = Colors.textMuted,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onClick)
                )
            }
        }
    }
}
