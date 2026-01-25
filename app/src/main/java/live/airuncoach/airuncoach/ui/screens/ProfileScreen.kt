
package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import coil.request.ImageRequest
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.ProfileViewModel
import live.airuncoach.airuncoach.viewmodel.ProfileViewModelFactory

@Composable
fun ProfileScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToFriends: () -> Unit,
    onNavigateToGroupRuns: () -> Unit,
    onNavigateToCoachSettings: () -> Unit,
    onNavigateToPersonalDetails: () -> Unit,
    onNavigateToFitnessLevel: () -> Unit,
    onNavigateToGoals: () -> Unit,
    onNavigateToDistanceScale: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToConnectedDevices: () -> Unit,
    onNavigateToSubscription: () -> Unit,
) {
    val context = LocalContext.current
    val viewModel: ProfileViewModel = viewModel(factory = ProfileViewModelFactory(context))
    val user by viewModel.user.collectAsState()

    if (user == null) {
        onNavigateToLogin()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .padding(vertical = Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        item { user?.let { ProfileHeader(user = it) } }
        item { Spacer(modifier = Modifier.height(Spacing.xl)) }

        item { SectionTitle(title = "Friends") }
        item {
            SettingsSection {
                SettingsItem(icon = R.drawable.icon_profile_vector, text = "My Friends", value = "0 friends", onClick = onNavigateToFriends)
                SettingsItem(icon = R.drawable.icon_play_vector, text = "Add Friends", onClick = onNavigateToFriends)
                SettingsItem(icon = R.drawable.icon_profile_vector, text = "Group Runs", onClick = onNavigateToGroupRuns)
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.lg)) }

        item { SectionTitle(title = "AI Coach") }
        item {
            SettingsSection {
                SettingsItem(icon = R.drawable.icon_timer_vector, text = "Coach Voice", value = "${user?.coachGender} - ${user?.coachAccent}", onClick = onNavigateToCoachSettings)
                SettingsItem(icon = R.drawable.icon_trending_vector, text = "Coach Tone", value = user?.coachTone?.replaceFirstChar { it.uppercase() }, onClick = onNavigateToCoachSettings)
                SettingsItem(icon = R.drawable.icon_profile_vector, text = "Coach Name", value = user?.coachName, onClick = onNavigateToCoachSettings)
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.lg)) }

        item { SectionTitle(title = "Profile") }
        item {
            SettingsSection {
                SettingsItem(icon = R.drawable.icon_profile_vector, text = "Personal Details", onClick = onNavigateToPersonalDetails)
                SettingsItem(icon = R.drawable.icon_chart_vector, text = "Fitness Level", onClick = onNavigateToFitnessLevel)
                SettingsItem(icon = R.drawable.icon_target_vector, text = "Goals", onClick = onNavigateToGoals)
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.lg)) }

        item { SectionTitle(title = "Settings") }
        item {
            SettingsSection {
                SettingsItem(icon = R.drawable.icon_timer_vector, text = "Connected Devices", onClick = onNavigateToConnectedDevices)
                SettingsItem(icon = R.drawable.icon_play_vector, text = "Subscription", value = user?.subscriptionTier ?: "Free", onClick = onNavigateToSubscription)
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.xl)) }

        item {
            Button(
                onClick = { viewModel.logout() },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg)
                    .height(50.dp),
                shape = RoundedCornerShape(BorderRadius.lg),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.backgroundSecondary,
                    contentColor = Colors.textPrimary
                )
            ) {
                Text("Sign Out", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.md)) }
        item {
            Text(
                text = "AI Run Coach v1.0.0",
                style = AppTextStyles.caption,
                color = Colors.textMuted
            )
        }
        item { Spacer(modifier = Modifier.height(Spacing.xxl)) }
    }
}

@Composable
fun ProfileHeader(user: User) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Box(
            modifier = Modifier
                .size(100.dp)
                .clip(CircleShape)
                .background(Colors.primary.copy(alpha = 0.2f))
                .border(4.dp, Colors.primary, CircleShape)
                .clickable { /* TODO: Open image picker */ },
            contentAlignment = Alignment.Center
        ) {
            if (!user.profilePic.isNullOrBlank()) {
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current)
                        .data(user.profilePic)
                        .crossfade(true)
                        .build(),
                    contentDescription = "User Profile Picture",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    error = painterResource(id = R.drawable.ai_coach_avatar),
                    placeholder = painterResource(id = R.drawable.ai_coach_avatar)
                )
            } else {
                Image(
                    painter = painterResource(id = R.drawable.ai_coach_avatar),
                    contentDescription = "AI Coach Avatar",
                    modifier = Modifier.size(90.dp)
                )
            }
        }
        Text(
            text = user.name,
            style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Text(
            text = user.email,
            style = AppTextStyles.body,
            color = Colors.textSecondary
        )
        Spacer(modifier = Modifier.height(Spacing.xs))
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(BorderRadius.full))
                .background(Colors.primary.copy(alpha = 0.1f))
                .padding(horizontal = Spacing.md, vertical = Spacing.sm)
        ) {
            Text(
                text = user.subscriptionTier?.uppercase() ?: "FREE",
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                color = Colors.primary
            )
        }
    }
}

@Composable
fun SectionTitle(title: String) {
    Text(
        text = title.uppercase(),
        style = AppTextStyles.h4,
        color = Colors.textSecondary,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .padding(bottom = Spacing.sm)
    )
}

@Composable
fun SettingsSection(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        ),
        content = { Column(content = content) }
    )
}

@Composable
fun SettingsItem(icon: Int, text: String, value: String? = null, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                painter = painterResource(id = icon),
                contentDescription = text,
                tint = Colors.textMuted,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.md))
            Text(
                text = text,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                color = Colors.textPrimary
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (value != null) {
                Text(
                    text = value,
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
            }
            Icon(
                painter = painterResource(id = R.drawable.icon_play_vector),
                contentDescription = "Navigate",
                tint = Colors.textMuted,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}