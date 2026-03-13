package live.airuncoach.airuncoach.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.viewmodel.GarminPermissionsViewModel

data class PermissionCategory(
    val title: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val description: String,
    val permissions: List<PermissionItem>
)

data class PermissionItem(
    val name: String,
    val description: String,
    val isGranted: Boolean
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GarminPermissionsScreenWrapper(
    onNavigateBack: () -> Unit,
    viewModel: GarminPermissionsViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    var showDisconnectDialog by remember { mutableStateOf(false) }
    
    // Placeholder permissions data - in production, this would come from the viewModel
    val permissionCategories = listOf(
        PermissionCategory(
            title = "📊 Activities & Running",
            icon = Icons.Default.DirectionsRun,
            description = "Track your runs and workouts",
            permissions = listOf(
                PermissionItem("Activity Summaries", "Basic run metrics and data", isGranted = true),
                PermissionItem("Activity Details", "GPS tracks and detailed metrics", isGranted = true),
                PermissionItem("MoveIQ Classifications", "AI activity type detection", isGranted = true)
            )
        ),
        PermissionCategory(
            title = "❤️ Health & Recovery",
            icon = Icons.Default.Favorite,
            description = "Monitor your heart rate and recovery",
            permissions = listOf(
                PermissionItem("Heart Rate Data", "Real-time and historical HR", isGranted = true),
                PermissionItem("Blood Pressure", "BP measurements and trends", isGranted = false),
                PermissionItem("HRV (Recovery)", "Heart rate variability metrics", isGranted = true)
            )
        ),
        PermissionCategory(
            title = "😴 Sleep & Wellness",
            icon = Icons.Default.Hotel,
            description = "Track sleep quality and stress",
            permissions = listOf(
                PermissionItem("Sleep Analysis", "Sleep stages and quality scores", isGranted = true),
                PermissionItem("Stress Levels", "Daily stress and body battery", isGranted = true),
                PermissionItem("SpO2 Monitoring", "Oxygen saturation levels", isGranted = false)
            )
        ),
        PermissionCategory(
            title = "🫀 Advanced Metrics",
            icon = Icons.Default.Favorite,
            description = "Detailed fitness and health insights",
            permissions = listOf(
                PermissionItem("VO2 Max", "Aerobic fitness capacity", isGranted = true),
                PermissionItem("Fitness Age", "Biological fitness age", isGranted = true),
                PermissionItem("Minute-by-Minute Data", "Detailed epoch data", isGranted = false)
            )
        )
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Manage Garmin Permissions",
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
        containerColor = Colors.backgroundRoot
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item { Spacer(modifier = Modifier.height(8.dp)) }

            // Device Status
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                    shape = RoundedCornerShape(BorderRadius.lg)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    "✅ Garmin Fenix 7X",
                                    style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                                    color = Colors.textPrimary
                                )
                                Text(
                                    "Connected 2 weeks ago • Last sync: 2 hours ago",
                                    style = AppTextStyles.caption,
                                    color = Colors.textSecondary,
                                    fontSize = 12.sp
                                )
                            }
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = "Connected",
                                tint = Color(0xFF00FF88),
                                modifier = Modifier.size(24.dp)
                            )
                        }

                        Divider(color = Colors.backgroundRoot, thickness = 1.dp)

                        // Permissions Summary
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "8/12",
                                    style = AppTextStyles.h3,
                                    color = Color(0xFF00D4FF)
                                )
                                Text(
                                    "Permissions Granted",
                                    style = AppTextStyles.caption,
                                    color = Colors.textSecondary
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "4",
                                    style = AppTextStyles.h3,
                                    color = Color(0xFFFFB000)
                                )
                                Text(
                                    "Can Be Requested",
                                    style = AppTextStyles.caption,
                                    color = Colors.textSecondary
                                )
                            }
                        }
                    }
                }
            }

            // Re-authorize Button
            item {
                Button(
                    onClick = {
                        // In production, this would call viewModel.reauthorize()
                        // which would open Garmin's OAuth page
                        val authUrl =
                            "https://connect.garmin.com/auth/authorize"
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(authUrl))
                        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        context.startActivity(intent)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF00D4FF),
                        contentColor = Color.Black
                    ),
                    shape = RoundedCornerShape(BorderRadius.md)
                ) {
                    Icon(
                        imageVector = Icons.Default.VpnKey,
                        contentDescription = "Update",
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Update Permissions",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium)
                    )
                }
            }

            // Permissions by Category
            permissionCategories.forEach { category ->
                item {
                    Text(
                        category.title,
                        style = AppTextStyles.h3,
                        color = Colors.textPrimary,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    Text(
                        category.description,
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }

                items(category.permissions.size) { index ->
                    val permission = category.permissions[index]
                    PermissionRow(permission)
                }

                item { Spacer(modifier = Modifier.height(4.dp)) }
            }

            // Disconnect Button
            item {
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = { showDisconnectDialog = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF3A1A1A),
                        contentColor = Color(0xFFFF5555)
                    ),
                    shape = RoundedCornerShape(BorderRadius.md)
                ) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Disconnect",
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Disconnect Device",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium)
                    )
                }
            }

            item { Spacer(modifier = Modifier.height(24.dp)) }
        }
    }

    // Disconnect Confirmation Dialog
    if (showDisconnectDialog) {
        AlertDialog(
            onDismissRequest = { showDisconnectDialog = false },
            title = { Text("Disconnect Garmin?") },
            text = {
                Text(
                    "You'll stop receiving Garmin activity and health data. You can reconnect anytime.",
                    color = Colors.textSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        // In production: viewModel.disconnectGarmin()
                        showDisconnectDialog = false
                        onNavigateBack()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFFF5555)
                    )
                ) {
                    Text("Disconnect")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDisconnectDialog = false }) {
                    Text("Cancel", color = Colors.textPrimary)
                }
            },
            containerColor = Colors.backgroundSecondary
        )
    }
}

@Composable
fun PermissionRow(permission: PermissionItem) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(BorderRadius.md),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = if (permission.isGranted) Icons.Default.Check else Icons.Default.Close,
                contentDescription = if (permission.isGranted) "Granted" else "Not granted",
                tint = if (permission.isGranted) Color(0xFF00FF88) else Color(0xFFFF8800),
                modifier = Modifier.size(20.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    permission.name,
                    style = AppTextStyles.body,
                    color = Colors.textPrimary,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    permission.description,
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary,
                    fontSize = 11.sp
                )
            }
        }
    }
}
