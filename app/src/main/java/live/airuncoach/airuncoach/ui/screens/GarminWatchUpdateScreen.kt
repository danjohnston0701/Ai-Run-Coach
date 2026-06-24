package live.airuncoach.airuncoach.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.service.AiRunCoachMessagingService
import live.airuncoach.airuncoach.service.GarminWatchManager
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/**
 * Shown when the user taps a "Garmin Watch App Update Available" push notification.
 *
 * Displays:
 *  - Currently installed watch app version (reported by the watch on connect, stored locally)
 *  - New version available
 *  - Release notes
 *  - A prominent button that opens the Connect IQ store listing from within this Activity
 *    context — bypassing any App Link interception by the Garmin Connect app.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GarminWatchUpdateScreen(
    version: String = "",
    releaseNote: String = "",
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val storeUrl = AiRunCoachMessagingService.CONNECT_IQ_STORE_URL

    // Read the installed version that the watch reported on last connection
    val installedVersion = remember {
        context.getSharedPreferences("garmin_watch_prefs", android.content.Context.MODE_PRIVATE)
            .getString(GarminWatchManager.PREF_WATCH_APP_VERSION, null)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Watch App Update",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Back",
                            tint = Colors.textPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundRoot
                ),
                windowInsets = WindowInsets(0)
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0)
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Spacing.lg)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(Spacing.xl))

            // Watch icon with update badge
            Box(contentAlignment = Alignment.TopEnd) {
                Box(
                    modifier = Modifier
                        .size(96.dp)
                        .background(Colors.primary.copy(alpha = 0.12f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_timer_vector),
                        contentDescription = "Garmin Watch",
                        tint = Colors.primary,
                        modifier = Modifier.size(56.dp)
                    )
                }
                // Green update dot
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .background(Colors.success, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.lg))

            // Title
            Text(
                text = "New Watch App Available",
                style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(Spacing.md))

            // Version pill row — shows "Installed → New" when we know both
            if (installedVersion != null || version.isNotBlank()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                    shape = RoundedCornerShape(BorderRadius.md)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(Spacing.md),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Installed version
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "Installed",
                                style = AppTextStyles.small,
                                color = Colors.textSecondary
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = if (installedVersion != null) "v$installedVersion" else "—",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                color = Colors.textSecondary
                            )
                        }

                        // Arrow
                        Spacer(modifier = Modifier.width(Spacing.lg))
                        Icon(
                            imageVector = Icons.Default.ArrowForward,
                            contentDescription = null,
                            tint = Colors.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(Spacing.lg))

                        // New version
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "New",
                                style = AppTextStyles.small,
                                color = Colors.textSecondary
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = if (version.isNotBlank()) "v$version" else "Latest",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                color = Colors.primary
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // What's new card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                shape = RoundedCornerShape(BorderRadius.md)
            ) {
                Column(modifier = Modifier.padding(Spacing.md)) {
                    Text(
                        text = "What's New",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.xs))
                    Text(
                        text = releaseNote.ifBlank {
                            "Performance improvements, bug fixes, and new features to enhance your running experience."
                        },
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))

            // How to update card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                shape = RoundedCornerShape(BorderRadius.md)
            ) {
                Column(modifier = Modifier.padding(Spacing.md)) {
                    Text(
                        text = "How to Update",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))

                    UpdateStep(number = "1", text = "Tap \"Update on Garmin Connect IQ\" below")
                    Spacer(modifier = Modifier.height(Spacing.xs))
                    UpdateStep(number = "2", text = "The app listing will open in Garmin Connect IQ")
                    Spacer(modifier = Modifier.height(Spacing.xs))
                    UpdateStep(number = "3", text = "Tap Update — it installs automatically over Bluetooth")
                    Spacer(modifier = Modifier.height(Spacing.xs))
                    UpdateStep(number = "4", text = "Open the watch app when your Garmin vibrates")
                }
            }

            Spacer(modifier = Modifier.height(Spacing.xl))

            // Primary CTA — opens Connect IQ store from Activity context (always works)
            Button(
                onClick = {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(storeUrl)).apply {
                            addCategory(Intent.CATEGORY_BROWSABLE)
                        }
                        context.startActivity(intent)
                    } catch (e: Exception) {
                        // Fallback: try without category
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(storeUrl)))
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(BorderRadius.lg),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText
                )
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.icon_timer_vector),
                    contentDescription = null,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    text = "Update on Garmin Connect IQ",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold)
                )
            }

            Spacer(modifier = Modifier.height(Spacing.sm))

            // Secondary — dismiss
            TextButton(
                onClick = onBack,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "Maybe Later",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
            }

            Spacer(modifier = Modifier.height(Spacing.xl))
        }
    }
}

@Composable
private fun UpdateStep(number: String, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .size(22.dp)
                .background(Colors.primary, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = number,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(
            text = text,
            style = AppTextStyles.small,
            color = Colors.textSecondary,
            modifier = Modifier.weight(1f)
        )
    }
}
