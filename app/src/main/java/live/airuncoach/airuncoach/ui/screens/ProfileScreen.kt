
package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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
    onNavigateToMyData: () -> Unit = {},
    onNavigateToGoals: () -> Unit,
    onNavigateToDistanceScale: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToConnectedDevices: () -> Unit,
    onNavigateToSubscription: () -> Unit,
    onNavigateToCoachingProgramme: () -> Unit = {},
) {
    val context = LocalContext.current
    val viewModel: ProfileViewModel = hiltViewModel()
    val user by viewModel.user.collectAsState()
    val friendCount by viewModel.friendCount.collectAsState()
    val profilePicCacheBuster by viewModel.profilePicCacheBuster.collectAsState()
    val isUploadingProfilePic by viewModel.isUploadingProfilePic.collectAsState()
    val profilePicUploadError by viewModel.profilePicUploadError.collectAsState()
    val profilePicUploadSuccess by viewModel.profilePicUploadSuccess.collectAsState()

    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    // Show success / error snackbars
    LaunchedEffect(profilePicUploadSuccess) {
        if (profilePicUploadSuccess) {
            scope.launch {
                snackbarHostState.showSnackbar("Profile picture updated!")
            }
            viewModel.clearProfilePicUploadSuccess()
        }
    }
    LaunchedEffect(profilePicUploadError) {
        profilePicUploadError?.let { msg ->
            scope.launch {
                snackbarHostState.showSnackbar(msg)
            }
            viewModel.clearProfilePicUploadError()
        }
    }

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

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = Colors.backgroundRoot
    ) { paddingValues ->

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(paddingValues)
    ) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .padding(vertical = Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        item { user?.let {
            ProfileHeader(
                user = it,
                cacheBuster = profilePicCacheBuster,
                isUploading = isUploadingProfilePic,
                onImageClick = { showImagePickerDialog = true }
            )
        }}
        item { Spacer(modifier = Modifier.height(Spacing.xl)) }

        item { SectionTitle(title = "Social") }
        item {
            SettingsSection {
                SettingsItem(icon = R.drawable.icon_people_vector, text = "Friends", value = "$friendCount ${if (friendCount == 1) "friend" else "friends"}", onClick = onNavigateToFriends)
                SettingsItem(icon = R.drawable.icon_people_vector, text = "Group Runs", onClick = onNavigateToGroupRuns)
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.md)) }

        // Friend invite link card
        user?.let { u ->
            item {
                FriendInviteLinkCard(userId = u.id, context = context)
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.lg)) }

        item { SectionTitle(title = "Ai Coach") }
        item {
            SettingsSection {
                SettingsItem(icon = R.drawable.icon_ai_vector, text = "Ai Coach Settings", onClick = onNavigateToCoachSettings)
                SettingsItem(icon = R.drawable.icon_calendar_vector, text = "Coaching Programme", onClick = onNavigateToCoachingProgramme)
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.lg)) }

        item { SectionTitle(title = "Profile") }
        item {
            SettingsSection {
                SettingsItem(icon = R.drawable.icon_profile_vector, text = "Personal Details", onClick = onNavigateToPersonalDetails)
                SettingsItem(icon = R.drawable.icon_trophy_vector, text = "My Data", onClick = onNavigateToMyData)
                SettingsItem(icon = R.drawable.icon_chart_vector, text = "Fitness Level", onClick = onNavigateToFitnessLevel)
                SettingsItem(icon = R.drawable.icon_target_vector, text = "Goals", onClick = onNavigateToGoals)
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.lg)) }

        item { SectionTitle(title = "Settings") }
        item {
            SettingsSection {
                SettingsItem(icon = R.drawable.icon_watch_vector, text = "Connected Devices", onClick = onNavigateToConnectedDevices)
                SettingsItem(icon = R.drawable.icon_info_vector, text = "Push Notifications", onClick = onNavigateToNotifications)
                SettingsItem(icon = R.drawable.icon_crown_vector, text = "Subscription", value = user?.subscriptionTier ?: "Free", onClick = onNavigateToSubscription)
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
            }
        }
        item { Spacer(modifier = Modifier.height(Spacing.xxl)) }
    }

    // Upload loading overlay
    if (isUploadingProfilePic) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.45f)),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = Colors.primary)
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    "Uploading photo...",
                    style = AppTextStyles.body,
                    color = Color.White
                )
            }
        }
    }
    } // end Box
    } // end Scaffold
}

@Composable
fun ProfileHeader(user: User, cacheBuster: Long, isUploading: Boolean = false, onImageClick: () -> Unit) {
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
                    // Decode base64 to ByteArray — pass directly to Coil for reliable rendering
                    // (data: URIs with query strings are invalid and Coil may reject them)
                    val imageBytes = remember(user.profilePic, cacheBuster) {
                        try {
                            android.util.Base64.decode(user.profilePic, android.util.Base64.DEFAULT)
                        } catch (_: Exception) { null }
                    }

                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(imageBytes)
                            .memoryCacheKey("${user.id}_profile_$cacheBuster") // unique per upload
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
            // Show spinner over the circle while uploading
            if (isUploading) {
                Box(
                    modifier = Modifier
                        .size(85.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.5f)),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(32.dp),
                        color = Colors.primary,
                        strokeWidth = 3.dp
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
        // Display short user ID for friend sharing
        user.shortUserId?.let { shortId ->
            Text(
                text = "ID: $shortId",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                color = Colors.primary
            )
        }
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
                painter = painterResource(id = R.drawable.icon_chevron_right_vector),
                contentDescription = "Navigate",
                tint = Colors.textMuted,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

@Composable
fun SettingsToggleItem(
    icon: Int,
    text: String,
    subtitle: String? = null,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
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
            Icon(
                painter = painterResource(id = icon),
                contentDescription = text,
                tint = Color(0xFF00A0DC), // Garmin cyan
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.md))
            Column {
                Text(
                    text = text,
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                    color = Colors.textPrimary
                )
                if (subtitle != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = subtitle,
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = Color(0xFF00A0DC), // Garmin cyan
                uncheckedThumbColor = Color.White,
                uncheckedTrackColor = Colors.textMuted
            )
        )
    }
}

// ── Friend Invite Link Card ──────────────────────────────────────────────────

private const val INVITE_BASE_URL = "https://ai-run-coach.replit.app/invite"

@Composable
fun FriendInviteLinkCard(userId: String, context: Context) {
    val inviteUrl = "$INVITE_BASE_URL/$userId"
    var copied by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            // Header row
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(Colors.primary.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.Share,
                        contentDescription = null,
                        tint = Colors.primary,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Column {
                    Text(
                        text = "Invite a Friend",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = "Share your link so friends can add you",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // Link pill
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Colors.backgroundRoot)
                    .padding(horizontal = Spacing.md, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = inviteUrl,
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.Medium),
                    color = Colors.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // Action buttons
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                // Copy button
                OutlinedButton(
                    onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("Friend invite link", inviteUrl))
                        copied = true
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = if (copied) Colors.success else Colors.primary),
                    border = ButtonDefaults.outlinedButtonBorder.copy(
                        brush = androidx.compose.ui.graphics.SolidColor(if (copied) Colors.success else Colors.primary)
                    )
                ) {
                    Icon(
                        imageVector = Icons.Filled.ContentCopy,
                        contentDescription = "Copy",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(if (copied) "Copied!" else "Copy Link", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold))
                }

                // Share button
                Button(
                    onClick = {
                        val sendIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_SUBJECT, "Join me on AI Run Coach!")
                            putExtra(
                                Intent.EXTRA_TEXT,
                                "Hey! I'm using AI Run Coach to track my runs and get AI coaching. " +
                                "Click this link to add me as a friend: $inviteUrl"
                            )
                        }
                        context.startActivity(Intent.createChooser(sendIntent, "Share via"))
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Share,
                        contentDescription = "Share",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Share", style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}
