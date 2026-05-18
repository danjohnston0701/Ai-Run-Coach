package live.airuncoach.airuncoach.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.android.strava.StravaViewModel

/**
 * Strava OAuth Authorization Screen
 *
 * This screen handles the Strava OAuth flow:
 * 1. Shows Strava branding and permissions explanation
 * 2. User taps "Connect with Strava"
 * 3. Opens Strava OAuth in browser
 * 4. Handles callback from backend
 * 5. Returns to Connected Devices with success
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StravaOAuthScreen(
    onNavigateBack: () -> Unit,
    onAuthSuccess: () -> Unit = {},
    viewModel: StravaViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val connectionStatus by viewModel.connectionStatus.collectAsState()

    var showSuccessDialog by remember { mutableStateOf(false) }

    // Check if already connected
    LaunchedEffect(connectionStatus.connected) {
        if (connectionStatus.connected) {
            showSuccessDialog = true
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Connect Strava",
                        style = AppTextStyles.h2,
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
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundRoot
                )
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0)
    ) { paddingValues ->
        if (showSuccessDialog && connectionStatus.connected) {
            SuccessDialog(
                athleteName = connectionStatus.athleteName ?: "Strava",
                onDismiss = {
                    showSuccessDialog = false
                    onAuthSuccess()
                }
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // ── Strava Logo Section ───────────────────────────────────────────
            Box(
                modifier = Modifier
                    .size(100.dp)
                    .background(Color(0xFFFC5200), RoundedCornerShape(20.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "S",
                    style = AppTextStyles.h1.copy(
                        fontSize = 56.sp,
                        color = Color.White
                    ),
                    fontWeight = FontWeight.Bold
                )
            }

            // ── Title ─────────────────────────────────────────────────────────
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    "Connect Your Strava Account",
                    style = AppTextStyles.h2,
                    color = Colors.textPrimary,
                    textAlign = TextAlign.Center
                )
                Text(
                    "Publish your runs with full GPS data and metrics",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center
                )
            }

            // ── Benefits Section ──────────────────────────────────────────────
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Colors.backgroundSecondary,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        "What You'll Get",
                        style = AppTextStyles.h3,
                        color = Colors.textPrimary
                    )

                    BenefitRow(
                        icon = Icons.Default.LocationOn,
                        title = "Route Maps",
                        description = "Beautiful GPS route visualization"
                    )

                    BenefitRow(
                        icon = Icons.Default.Favorite,
                        title = "All Metrics",
                        description = "HR, cadence, elevation, and more"
                    )

                    BenefitRow(
                        icon = Icons.Default.Share,
                        title = "Social Sharing",
                        description = "Share your runs with friends"
                    )
                }
            }

            // ── Permissions Section ───────────────────────────────────────────
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFFFC5200).copy(alpha = 0.1f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            Icons.Default.Info,
                            contentDescription = null,
                            tint = Color(0xFFFC5200),
                            modifier = Modifier
                                .size(20.dp)
                                .padding(top = 2.dp)
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                "What Permissions You're Granting",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                color = Color(0xFFFC5200)
                            )
                            Text(
                                "• Write access: Publish your completed runs\n" +
                                "• Read access: View your Strava activities\n" +
                                "• Profile data: Your name and athlete info",
                                style = AppTextStyles.caption,
                                color = Color(0xFFFC5200),
                                lineHeight = 18.sp
                            )
                        }
                    }
                }
            }

            // ── Error Message (if any) ────────────────────────────────────────
            if (error != null) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFEF5350).copy(alpha = 0.1f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = null,
                            tint = Color(0xFFEF5350),
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            error ?: "",
                            style = AppTextStyles.caption,
                            color = Color(0xFFEF5350),
                            lineHeight = 16.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // ── Main CTA Button ───────────────────────────────────────────────
            Button(
                onClick = {
                    viewModel.initiateStravaAuth(context)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFFC5200),
                    contentColor = Color.White
                ),
                shape = RoundedCornerShape(12.dp),
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Opening Strava...", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold))
                } else {
                    Icon(
                        Icons.Default.Link,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Connect with Strava", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold))
                }
            }

            // ── Privacy Notice ────────────────────────────────────────────────
            Text(
                "You'll be securely redirected to Strava. Your data is never shared with anyone except Strava.",
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                textAlign = TextAlign.Center,
                lineHeight = 16.sp
            )
        }
    }
}

@Composable
private fun BenefitRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    description: String
) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = Color(0xFFFC5200),
            modifier = Modifier.size(20.dp)
        )
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                title,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Text(
                description,
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
        }
    }
}

@Composable
private fun SuccessDialog(
    athleteName: String,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                Icons.Default.CheckCircle,
                contentDescription = null,
                tint = Color(0xFF4CAF50),
                modifier = Modifier.size(48.dp)
            )
        },
        title = {
            Text(
                "Connected!",
                style = AppTextStyles.h3,
                color = Colors.textPrimary
            )
        },
        text = {
            Text(
                "Your Strava account ($athleteName) is now connected. You can now publish your runs directly to Strava with one tap.",
                style = AppTextStyles.body,
                color = Colors.textSecondary,
                lineHeight = 20.sp
            )
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF4CAF50),
                    contentColor = Color.White
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text(
                    "Done",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                )
            }
        },
        containerColor = Colors.backgroundSecondary,
        titleContentColor = Colors.textPrimary,
        textContentColor = Colors.textSecondary
    )
}
