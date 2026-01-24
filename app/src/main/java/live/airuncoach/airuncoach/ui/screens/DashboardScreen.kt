package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import coil.request.ImageRequest
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.WeatherData
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.DashboardViewModel
import live.airuncoach.airuncoach.viewmodel.DashboardViewModelFactory

@Composable
fun DashboardScreen(
    onNavigateToRouteGeneration: () -> Unit = {},
    onNavigateToRunSession: () -> Unit = {},
    onNavigateToGoals: () -> Unit = {},
    onNavigateToProfile: () -> Unit = {},
    onNavigateToHistory: () -> Unit = {},
    onCreateGoal: () -> Unit = {}
) {
    val context = LocalContext.current
    val viewModel: DashboardViewModel = viewModel(
        factory = DashboardViewModelFactory(context)
    )
    
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

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .padding(vertical = Spacing.lg)
    ) {
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
        garminConnection?.let { connection ->
            item { GarminConnectionCard(connection = connection) }
            item { Spacer(modifier = Modifier.height(Spacing.md)) }
        }
        item { GoalCard(goal = goals.firstOrNull(), onClick = onNavigateToGoals, onAddGoal = onCreateGoal) }
        item { Spacer(modifier = Modifier.height(Spacing.md)) }
        item { weatherData?.let { TimeAndWeatherBar(time = currentTime, weather = it) } }
        item { Spacer(modifier = Modifier.height(Spacing.xl)) }
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
        item { Spacer(modifier = Modifier.height(Spacing.xl)) }
        item { 
            ActionButtons(
                onMapMyRun = onNavigateToRouteGeneration,
                onRunWithoutRoute = onNavigateToRunSession
            )
        }
        item { Spacer(modifier = Modifier.height(Spacing.md)) }
        item {
            viewModel.getLastRunSession()?.let { lastRun ->
                PreviousRunDashboard(
                    lastRun = lastRun,
                    onClick = onNavigateToHistory
                )
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.xxl)) }
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
fun GarminConnectionCard(connection: live.airuncoach.airuncoach.domain.model.GarminConnection) {
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
            // Trophy icon with background
            Box(
                modifier = Modifier
                    .size(50.dp)
                    .clip(CircleShape)
                    .background(Colors.backgroundTertiary),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_target_vector),
                    contentDescription = "Goal Icon",
                    tint = Colors.textMuted,
                    modifier = Modifier.size(28.dp)
                )
            }
            
            Spacer(modifier = Modifier.width(Spacing.md))
            
            Column(modifier = Modifier.weight(1f)) {
                if (goal != null) {
                    Text(
                        text = goal.title,
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = goal.description,
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                } else {
                    Text(
                        text = "No active goal",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = "Set a goal to track your progress",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
            }
            
            // Plus button
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Colors.primary.copy(alpha = 0.2f))
                    .clickable { onAddGoal() },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "+",
                    style = AppTextStyles.h2,
                    color = Colors.primary
                )
            }
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
        Icon(
            painter = painterResource(id = R.drawable.icon_trending_vector),
            contentDescription = "Weather",
            tint = Colors.textMuted,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(
            text = "${weather.temperature.toInt()}°",
            style = AppTextStyles.body,
            color = Colors.textPrimary
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
fun TargetTimeCard(
    isEnabled: Boolean,
    onEnabledChange: (Boolean) -> Unit,
    hours: String,
    minutes: String,
    seconds: String,
    onHoursChange: (String) -> Unit,
    onMinutesChange: (String) -> Unit,
    onSecondsChange: (String) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary.copy(alpha = 0.8f)
        )
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Clock icon with background
                Box(
                    modifier = Modifier
                        .size(50.dp)
                        .clip(CircleShape)
                        .background(Colors.backgroundTertiary),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_timer_vector),
                        contentDescription = "Target Time",
                        tint = Colors.primary,
                        modifier = Modifier.size(28.dp)
                    )
                }
                
                Spacer(modifier = Modifier.width(Spacing.md))
                
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "TARGET TIME",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = if (isEnabled) "Set your goal time" else "Tap to enable",
                        style = AppTextStyles.small,
                        color = Colors.textMuted
                    )
                }
                
                // Toggle switch styled
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(BorderRadius.full))
                        .clickable { onEnabledChange(!isEnabled) }
                        .background(if (isEnabled) Colors.primary else Colors.backgroundTertiary)
                        .padding(horizontal = Spacing.md, vertical = Spacing.sm),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (isEnabled) "ON" else "OFF",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                        color = if (isEnabled) Colors.buttonText else Colors.textMuted
                    )
                }
            }
            
            if (isEnabled) {
                Spacer(modifier = Modifier.height(Spacing.md))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.Bottom
                ) {
                    TimePickerColumn(value = hours, label = "HOURS", onValueChange = onHoursChange)
                    Text(
                        text = ":",
                        style = AppTextStyles.h2,
                        color = Colors.textMuted,
                        modifier = Modifier.padding(bottom = 4.dp, start = 4.dp, end = 4.dp)
                    )
                    TimePickerColumn(value = minutes, label = "MINUTES", onValueChange = onMinutesChange)
                    Text(
                        text = ":",
                        style = AppTextStyles.h2,
                        color = Colors.textMuted,
                        modifier = Modifier.padding(bottom = 4.dp, start = 4.dp, end = 4.dp)
                    )
                    TimePickerColumn(value = seconds, label = "SECONDS", onValueChange = onSecondsChange)
                }
            }
        }
    }
}

@Composable
fun TimePickerColumn(value: String, label: String, onValueChange: (String) -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label,
            style = AppTextStyles.caption.copy(
                fontSize = androidx.compose.ui.unit.TextUnit(9f, androidx.compose.ui.unit.TextUnitType.Sp),
                fontWeight = FontWeight.Medium
            ),
            color = Colors.textMuted
        )
        Box(
            modifier = Modifier
                .size(width = 48.dp, height = 40.dp)
                .clip(RoundedCornerShape(BorderRadius.sm))
                .background(Colors.backgroundTertiary)
                .clickable { /* Could open number picker dialog */ },
            contentAlignment = Alignment.Center
        ) {
            androidx.compose.foundation.text.BasicTextField(
                value = value,
                onValueChange = onValueChange,
                textStyle = AppTextStyles.h3.copy(
                    color = Colors.primary,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    fontWeight = FontWeight.Bold
                ),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                ),
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(Colors.primary)
            )
        }
    }
}

@Composable
fun ActionButtons(onMapMyRun: () -> Unit, onRunWithoutRoute: () -> Unit) {
    Column(modifier = Modifier.padding(horizontal = Spacing.lg)) {
        // MAP MY RUN button - bright cyan with location icon
        Button(
            onClick = onMapMyRun,
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
            onClick = onRunWithoutRoute,
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
fun PreviousRunDashboard(lastRun: live.airuncoach.airuncoach.domain.model.RunSession, onClick: () -> Unit) {
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
                text = java.text.SimpleDateFormat("MMM dd, yyyy • HH:mm", java.util.Locale.getDefault())
                    .format(java.util.Date(lastRun.startTime)),
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
                        text = lastRun.averagePace,
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

