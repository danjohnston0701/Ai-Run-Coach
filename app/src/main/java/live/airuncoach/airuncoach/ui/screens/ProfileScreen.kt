
package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import coil.request.ImageRequest
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.ProfileViewModel
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
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
    val viewModel: ProfileViewModel = hiltViewModel()
    val user by viewModel.user.collectAsState()
    val friendCount by viewModel.friendCount.collectAsState()
    
    var showImagePickerDialog by remember { mutableStateOf(false) }
    
    val cameraUri = remember { mutableStateOf<Uri?>(null) }
    
    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
        onResult = { uri: Uri? ->
            uri?.let { viewModel.uploadProfilePicture(it) }
        }
    )
    
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
        onResult = { success ->
            if (success) {
                cameraUri.value?.let { viewModel.uploadProfilePicture(it) }
            }
        }
    )
    
    // Camera permission launcher - must be declared after cameraLauncher
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted ->
            if (isGranted) {
                // Permission granted, launch camera
                cameraUri.value?.let { uri ->
                    cameraLauncher.launch(uri)
                }
            }
        }
    )

    // Refresh user data when the screen appears
    LaunchedEffect(Unit) {
        viewModel.refreshUser()
    }

    // Show loading state if user data hasn't loaded yet
    if (user == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundRoot),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                CircularProgressIndicator(color = Colors.primary)
                Spacer(modifier = Modifier.height(Spacing.md))
                Text(
                    text = "Loading profile...",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
            }
        }
        return
    }
    
    // Image Picker Dialog
    if (showImagePickerDialog) {
        AlertDialog(
            onDismissRequest = { showImagePickerDialog = false },
            title = { Text("Choose Profile Photo", color = Colors.textPrimary) },
            text = { Text("Select a source for your profile photo", color = Colors.textSecondary) },
            confirmButton = {
                TextButton(onClick = {
                    showImagePickerDialog = false
                    // Create temp file for camera
                    val photoFile = File(context.cacheDir, "profile_${System.currentTimeMillis()}.jpg")
                    cameraUri.value = FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        photoFile
                    )
                    
                    // Check camera permission
                    when {
                        ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.CAMERA
                        ) == PackageManager.PERMISSION_GRANTED -> {
                            // Permission already granted, launch camera
                            cameraLauncher.launch(cameraUri.value)
                        }
                        else -> {
                            // Request permission
                            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                        }
                    }
                }) {
                    Text("Take Photo", color = Colors.primary)
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showImagePickerDialog = false
                    galleryLauncher.launch("image/*")
                }) {
                    Text("Choose from Gallery", color = Colors.primary)
                }
            },
            containerColor = Colors.backgroundSecondary
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .padding(vertical = Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        item { user?.let { ProfileHeader(user = it, onImageClick = { showImagePickerDialog = true }) } }
        item { Spacer(modifier = Modifier.height(Spacing.xl)) }

        item { SectionTitle(title = "Friends") }
        item {
            SettingsSection {
                SettingsItem(icon = R.drawable.icon_profile_vector, text = "My Friends", value = "$friendCount ${if (friendCount == 1) "friend" else "friends"}", onClick = onNavigateToFriends)
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
                onClick = { 
                    viewModel.logout()
                    onNavigateToLogin()
                },
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
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "AI Run Coach v1.0.0",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted
                )
                // "Powered by Garmin" attribution (required for Garmin brand guidelines)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Health data powered by Garmin",
                    style = AppTextStyles.caption.copy(fontSize = 11.sp),
                    color = Colors.textMuted.copy(alpha = 0.8f)
                )
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.xxl)) }
    }
}

@Composable
fun ProfileHeader(user: User, onImageClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(85.dp)
                    .clip(CircleShape)
                    .background(Colors.primary.copy(alpha = 0.2f))
                    .border(4.dp, Colors.primary, CircleShape)
                    .clickable { onImageClick() },
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
                        error = painterResource(id = R.drawable.icon_profile_vector),
                        placeholder = painterResource(id = R.drawable.icon_profile_vector)
                    )
                } else {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_profile_vector),
                        contentDescription = "User Profile",
                        modifier = Modifier.size(50.dp),
                        tint = Colors.primary
                    )
                }
            }
            Icon(
                painter = painterResource(id = R.drawable.icon_camera_vector),
                contentDescription = "Edit Profile Picture",
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(28.dp)
                    .background(Colors.backgroundSecondary, CircleShape)
                    .border(2.dp, Colors.primary, CircleShape)
                    .padding(4.dp),
                tint = Colors.primary
            )
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
