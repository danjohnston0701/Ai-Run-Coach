package live.airuncoach.airuncoach.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.AiConsentManager
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/**
 * Comprehensive permissions and consents screen for new user registration.
 * Covers: Location, Activity Recognition, Notifications, and AI Coaching Consent.
 * Users must grant core permissions (Location + Activity) to proceed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PermissionsAndConsentsScreen(
    onNavigateBack: () -> Unit = {},
    onNavigateToPersonalDetails: () -> Unit = {}
) {
    val context = LocalContext.current
    val consentManager = remember { AiConsentManager(context) }
    
    // Track permission states
    var hasLocationPermission by remember { mutableStateOf(false) }
    var hasActivityPermission by remember { mutableStateOf(false) }
    var hasNotificationPermission by remember { mutableStateOf(false) }
    var aiConsentGiven by remember { mutableStateOf(consentManager.hasSeenConsent()) }
    var hasNavigated by remember { mutableStateOf(false) }
    
    // Check initial permission states
    LaunchedEffect(Unit) {
        hasLocationPermission = (ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED) || (ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED)
        
        hasActivityPermission = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
        
        hasNotificationPermission = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }
    
    // Permission launcher for location and activity
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
        val activityGranted = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            permissions[Manifest.permission.ACTIVITY_RECOGNITION] ?: false
        } else {
            true
        }
        
        if (fineLocationGranted || coarseLocationGranted) {
            hasLocationPermission = true
        }
        if (activityGranted) {
            hasActivityPermission = true
        }
    }
    
    // Notification permission launcher
    val notificationLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            hasNotificationPermission = true
        }
    }
    
    // Auto-proceed once core permissions are granted and consent is given
    LaunchedEffect(hasLocationPermission, hasActivityPermission, aiConsentGiven) {
        if (hasLocationPermission && hasActivityPermission && aiConsentGiven && !hasNavigated) {
            hasNavigated = true
            onNavigateToPersonalDetails()
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "Permissions & Consent",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Colors.textPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0)
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg)
                .padding(vertical = Spacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "We need a few permissions to get you started",
                style = AppTextStyles.body,
                color = Colors.textSecondary,
                textAlign = TextAlign.Center
            )
            
            Spacer(modifier = Modifier.height(Spacing.xl))
            
            // Location Permission Card
            PermissionCard(
                icon = R.drawable.icon_location_vector,
                title = "Location Access",
                description = "Track your runs and provide location-based coaching insights",
                isGranted = hasLocationPermission,
                isRequired = true,
                onRequestClick = {
                    permissionLauncher.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION,
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                                Manifest.permission.ACTIVITY_RECOGNITION
                            } else {
                                Manifest.permission.ACCESS_FINE_LOCATION
                            }
                        )
                    )
                }
            )
            
            Spacer(modifier = Modifier.height(Spacing.lg))
            
            // Notification Permission Card
            PermissionCard(
                icon = R.drawable.icon_timer_vector,
                title = "Notifications",
                description = "Get reminders for runs and coaching tips",
                isGranted = hasNotificationPermission,
                isRequired = false,
                onRequestClick = {
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                        notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
            )
            
            Spacer(modifier = Modifier.height(Spacing.xl))
            
            HorizontalDivider(color = Colors.border.copy(alpha = 0.3f))
            
            Spacer(modifier = Modifier.height(Spacing.xl))
            
            // AI Consent Card
            ConsentCard(
                isGranted = aiConsentGiven,
                onAllow = {
                    consentManager.setConsent(granted = true)
                    aiConsentGiven = true
                },
                onDecline = {
                    consentManager.setConsent(granted = false)
                    aiConsentGiven = true // Still proceed even if declined
                }
            )
            
            Spacer(modifier = Modifier.height(Spacing.xxxxl))
            
            // Continue button — only enabled when core permissions are granted
            Button(
                onClick = onNavigateToPersonalDetails,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(BorderRadius.lg),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                enabled = hasLocationPermission && hasActivityPermission && aiConsentGiven
            ) {
                Text(
                    "Continue to Profile Setup",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.lg))
            
            if (!hasLocationPermission || !hasActivityPermission) {
                Text(
                    text = "Location access is required to continue",
                    style = AppTextStyles.small,
                    color = Colors.error,
                    textAlign = TextAlign.Center
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
        }
    }
}

@Composable
private fun PermissionCard(
    icon: Int,
    title: String,
    description: String,
    isGranted: Boolean,
    isRequired: Boolean,
    onRequestClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.lg),
        colors = CardDefaults.cardColors(
            containerColor = if (isGranted) 
                Colors.success.copy(alpha = 0.1f) 
            else 
                Colors.backgroundSecondary
        ),
        border = if (isGranted)
            BorderStroke(1.dp, Colors.success.copy(alpha = 0.3f))
        else
            BorderStroke(1.dp, Colors.border.copy(alpha = 0.3f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(
                        color = if (isGranted) Colors.success.copy(alpha = 0.2f) else Colors.primary.copy(alpha = 0.1f),
                        shape = RoundedCornerShape(BorderRadius.md)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(id = icon),
                    contentDescription = title,
                    tint = if (isGranted) Colors.success else Colors.primary,
                    modifier = Modifier.size(24.dp)
                )
            }
            
            Spacer(modifier = Modifier.width(Spacing.lg))
            
            Column(
                modifier = Modifier
                    .weight(1f)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = title,
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    if (isRequired) {
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text(
                            text = "*",
                            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                            color = Colors.error
                        )
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.xs))
                Text(
                    text = description,
                    style = AppTextStyles.small,
                    color = Colors.textSecondary
                )
            }
            
            Spacer(modifier = Modifier.width(Spacing.md))
            
            if (isGranted) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_check_vector),
                    contentDescription = "Granted",
                    tint = Colors.success,
                    modifier = Modifier.size(24.dp)
                )
            } else {
                Button(
                    onClick = onRequestClick,
                    modifier = Modifier.height(36.dp),
                    shape = RoundedCornerShape(BorderRadius.md),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    contentPadding = PaddingValues(horizontal = Spacing.md, vertical = Spacing.sm)
                ) {
                    Text(
                        "Allow",
                        style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }
        }
    }
}

@Composable
private fun ConsentCard(
    isGranted: Boolean,
    onAllow: () -> Unit,
    onDecline: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.lg),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(
                            color = Colors.primary.copy(alpha = 0.1f),
                            shape = RoundedCornerShape(BorderRadius.md)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_ai_vector),
                        contentDescription = "AI Coaching",
                        tint = Colors.primary,
                        modifier = Modifier.size(24.dp)
                    )
                }
                
                Spacer(modifier = Modifier.width(Spacing.lg))
                
                Text(
                    text = "AI Coaching Consent",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary,
                    modifier = Modifier.weight(1f)
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.lg))
            
            Text(
                text = "AI Run Coach uses OpenAI to generate personalized coaching during and after your runs. Your workout data (pace, heart rate, cadence, elevation) is shared with OpenAI for analysis.",
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
            
            Spacer(modifier = Modifier.height(Spacing.lg))
            
            Text(
                text = "Privacy guarantees:",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            ConsentGuaranteeRow(text = "No personal identifiers are ever shared")
            Spacer(modifier = Modifier.height(Spacing.sm))
            ConsentGuaranteeRow(text = "Zero-retention policy — data is not stored by OpenAI")
            Spacer(modifier = Modifier.height(Spacing.sm))
            ConsentGuaranteeRow(text = "You can disable AI coaching anytime in settings")
            
            Spacer(modifier = Modifier.height(Spacing.lg))
            
            if (!isGranted) {
                Row(modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(
                        onClick = onDecline,
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        shape = RoundedCornerShape(BorderRadius.md),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.textSecondary),
                    border = BorderStroke(1.dp, Colors.border)
                    ) {
                        Text(
                            "Not Now",
                            style = AppTextStyles.small.copy(fontWeight = FontWeight.Medium)
                        )
                    }
                    
                    Spacer(modifier = Modifier.width(Spacing.md))
                    
                    Button(
                        onClick = onAllow,
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp),
                        shape = RoundedCornerShape(BorderRadius.md),
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                    ) {
                        Text(
                            "Allow",
                            style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_check_vector),
                        contentDescription = "Decided",
                        tint = Colors.success,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(Spacing.md))
                    Text(
                        text = "Consent preference saved",
                        style = AppTextStyles.small,
                        color = Colors.success
                    )
                }
            }
        }
    }
}

@Composable
private fun ConsentGuaranteeRow(text: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            painter = painterResource(id = R.drawable.icon_check_vector),
            contentDescription = null,
            tint = Colors.success,
            modifier = Modifier
                .size(16.dp)
                .padding(top = 2.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.md))
        Text(
            text = text,
            style = AppTextStyles.small,
            color = Colors.textSecondary
        )
    }
}
