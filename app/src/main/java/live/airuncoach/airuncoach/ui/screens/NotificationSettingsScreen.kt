package live.airuncoach.airuncoach.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.util.NotificationPermissionHelper
import live.airuncoach.airuncoach.viewmodel.NotificationSettingsViewModel

@Composable
fun NotificationSettingsScreen(
    onNavigateBack: () -> Unit = {}
) {
    val viewModel: NotificationSettingsViewModel = hiltViewModel()
    val state by viewModel.state.collectAsState()
    var pendingNotificationEnable by remember { mutableStateOf(false) }
    
    // Notification permission launcher
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted ->
            if (isGranted) {
                android.util.Log.d("NotificationSettings", "Notification permission granted ✅")
                // Permission granted, now enable notifications
                if (pendingNotificationEnable) {
                    viewModel.updateAllNotifications(true)
                    pendingNotificationEnable = false
                }
            } else {
                android.util.Log.d("NotificationSettings", "Notification permission denied")
                pendingNotificationEnable = false
            }
        }
    )
    
    // Request permission when user tries to enable notifications
    LaunchedEffect(pendingNotificationEnable) {
        if (pendingNotificationEnable && NotificationPermissionHelper.shouldRequestPermission()) {
            notificationPermissionLauncher.launch(NotificationPermissionHelper.getPermissionString())
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
                .height(56.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onNavigateBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = Colors.textPrimary,
                    modifier = Modifier.size(24.dp)
                )
            }
            Text(
                "Push Notifications",
                style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary,
                modifier = Modifier.weight(1f)
            )
        }

        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(Spacing.lg),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Colors.primary)
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                item {
                    Spacer(modifier = Modifier.height(Spacing.sm))
                }

                // Error message if any
                if (!state.error.isNullOrEmpty()) {
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Colors.error.copy(alpha = 0.15f)),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                state.error!!,
                                style = AppTextStyles.small,
                                color = Colors.error,
                                modifier = Modifier.padding(Spacing.md)
                            )
                        }
                    }
                }

                // Master toggle - All Notifications
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(Spacing.md)) {
                            Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "All Notifications",
                                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                    color = Colors.textPrimary
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    "Enable or disable all notifications at once",
                                    style = AppTextStyles.small,
                                    color = Colors.textSecondary
                                )
                            }
                            Switch(
                                checked = allNotificationsEnabled(
                                    state.coachingPlanReminder,
                                    state.friendRequest,
                                    state.friendAccepted,
                                    state.groupRunInvite,
                                    state.groupRunStarting,
                                    state.runCompleted,
                                    state.weeklyProgress,
                                    state.liveRunInvite,
                                    state.liveObserverJoined
                                ),
                                onCheckedChange = { enabled ->
                                    if (enabled && NotificationPermissionHelper.shouldRequestPermission()) {
                                        // If enabling notifications, first request permission
                                        pendingNotificationEnable = true
                                    } else {
                                        // If disabling or no permission needed, update directly
                                        viewModel.updateAllNotifications(enabled)
                                    }
                                },
                                modifier = Modifier.padding(start = Spacing.md)
                            )
                        }
                        }
                    }
                }

                item {
                    Text(
                        "NOTIFICATION TYPES",
                        style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textMuted,
                        modifier = Modifier.padding(top = Spacing.lg, bottom = Spacing.sm)
                    )
                }

                // Coaching Plan Reminders
                item {
                    NotificationToggleItem(
                        icon = R.drawable.icon_calendar_vector,
                        title = "Coaching Session Reminders",
                        description = "Daily 8 AM reminder for scheduled workouts",
                        enabled = state.coachingPlanReminder,
                        onToggle = { viewModel.updatePreference("coachingPlanReminder", it) }
                    )
                }

                // Friend Requests
                item {
                    NotificationToggleItem(
                        icon = R.drawable.icon_profile_vector,
                        title = "Friend Requests",
                        description = "When someone sends you a friend request",
                        enabled = state.friendRequest,
                        onToggle = { viewModel.updatePreference("friendRequest", it) }
                    )
                }

                // Friend Accepted
                item {
                    NotificationToggleItem(
                        icon = R.drawable.icon_check_vector,
                        title = "Friend Request Accepted",
                        description = "When someone accepts your friend request",
                        enabled = state.friendAccepted,
                        onToggle = { viewModel.updatePreference("friendAccepted", it) }
                    )
                }

                // Group Run Invites
                item {
                    NotificationToggleItem(
                        icon = R.drawable.icon_timer_vector,
                        title = "Group Run Invitations",
                        description = "When invited to a group run",
                        enabled = state.groupRunInvite,
                        onToggle = { viewModel.updatePreference("groupRunInvite", it) }
                    )
                }

                // Group Run Starting
                item {
                    NotificationToggleItem(
                        icon = R.drawable.icon_play_vector,
                        title = "Group Run Starting",
                        description = "When a group run is about to start",
                        enabled = state.groupRunStarting,
                        onToggle = { viewModel.updatePreference("groupRunStarting", it) }
                    )
                }

                // Run Completed
                item {
                    NotificationToggleItem(
                        icon = R.drawable.icon_check_vector,
                        title = "Run Completed",
                        description = "When a friend completes a run",
                        enabled = state.runCompleted,
                        onToggle = { viewModel.updatePreference("runCompleted", it) }
                    )
                }

                // Weekly Progress
                item {
                    NotificationToggleItem(
                        icon = R.drawable.icon_chart_vector,
                        title = "Weekly Progress Summary",
                        description = "Weekly summary of your running activity",
                        enabled = state.weeklyProgress,
                        onToggle = { viewModel.updatePreference("weeklyProgress", it) }
                    )
                }

                // Live Run Invites
                item {
                    NotificationToggleItem(
                        icon = R.drawable.icon_timer_vector,
                        title = "Live Run Invitations",
                        description = "When invited to a live run session",
                        enabled = state.liveRunInvite,
                        onToggle = { viewModel.updatePreference("liveRunInvite", it) }
                    )
                }

                // Observer Joined
                item {
                    NotificationToggleItem(
                        icon = R.drawable.icon_profile_vector,
                        title = "Observer Joined",
                        description = "When someone joins your live run as observer",
                        enabled = state.liveObserverJoined,
                        onToggle = { viewModel.updatePreference("liveObserverJoined", it) }
                    )
                }

                item {
                    Spacer(modifier = Modifier.height(Spacing.xl))
                }
            }
        }
    }
}

@Composable
private fun NotificationToggleItem(
    icon: Int,
    title: String,
    description: String,
    enabled: Boolean,
    onToggle: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            Icon(
                painter = painterResource(icon),
                contentDescription = title,
                tint = if (enabled) Colors.primary else Colors.textMuted,
                modifier = Modifier.size(24.dp)
            )
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    title,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                    color = Colors.textPrimary
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    description,
                    style = AppTextStyles.small,
                    color = Colors.textSecondary
                )
            }
            
            Switch(
                checked = enabled,
                onCheckedChange = onToggle,
                modifier = Modifier.padding(start = Spacing.sm)
            )
        }
    }
}

private fun allNotificationsEnabled(
    coachingPlanReminder: Boolean,
    friendRequest: Boolean,
    friendAccepted: Boolean,
    groupRunInvite: Boolean,
    groupRunStarting: Boolean,
    runCompleted: Boolean,
    weeklyProgress: Boolean,
    liveRunInvite: Boolean,
    liveObserverJoined: Boolean
): Boolean {
    return coachingPlanReminder &&
            friendRequest &&
            friendAccepted &&
            groupRunInvite &&
            groupRunStarting &&
            runCompleted &&
            weeklyProgress &&
            liveRunInvite &&
            liveObserverJoined
}
