package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.R
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.ui.theme.*
import live.airuncoach.airuncoach.viewmodel.ConnectedDevicesViewModel

// Generic device info for the "Coming Soon" section
data class DeviceInfo(
    val name: String,
    val description: String,
    val icon: ImageVector? = null,
    val iconDrawable: Int? = null,
    val supportsRealtimeHR: Boolean,
    val supportsPostRunSync: Boolean,
    val isAvailableOnAndroid: Boolean,
    val requiresAppInstall: Boolean = false,
    val isConnected: Boolean = false,
    val onConnect: () -> Unit,
    val onDisconnect: () -> Unit = {}
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectedDevicesScreen(
    onNavigateBack: () -> Unit,
    onNavigateToGarminConnect: () -> Unit = {},
    onNavigateToGarminWatchApp: () -> Unit = {},
    onNavigateToGarminPermissions: () -> Unit = {},
    viewModel: ConnectedDevicesViewModel = hiltViewModel()
) {
    val garminConnectionStatus by viewModel.garminConnectionStatus.collectAsState()
    val isGarminConnectConnected = garminConnectionStatus == "connected"

    val comingSoonDevices = remember {
        listOf(
            DeviceInfo(
                name = "Apple Watch",
                description = "Connect via Apple HealthKit for real-time heart rate and health metrics",
                icon = Icons.Default.Star,
                supportsRealtimeHR = true,
                supportsPostRunSync = true,
                isAvailableOnAndroid = false,
                requiresAppInstall = true,
                onConnect = {}
            ),
            DeviceInfo(
                name = "Samsung Galaxy Watch",
                description = "Connect via Samsung Health for real-time heart rate tracking",
                icon = Icons.Default.Star,
                supportsRealtimeHR = true,
                supportsPostRunSync = true,
                isAvailableOnAndroid = false,
                requiresAppInstall = true,
                onConnect = {}
            ),
            DeviceInfo(
                name = "COROS",
                description = "Connect via COROS API for post-run activity sync",
                icon = Icons.Default.Place,
                supportsRealtimeHR = false,
                supportsPostRunSync = true,
                isAvailableOnAndroid = true,
                onConnect = {}
            ),
            DeviceInfo(
                name = "Strava",
                description = "Connect via Strava API for post-run activity sync",
                icon = Icons.Default.LocationOn,
                supportsRealtimeHR = false,
                supportsPostRunSync = true,
                isAvailableOnAndroid = true,
                onConnect = {}
            )
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Connected Devices",
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
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ── Page subtitle ─────────────────────────────────────────────────
            item {
                Text(
                    "Connect your Garmin watch for live AI coaching during runs, or link your Garmin account to sync activity history.",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }

            // ── Section: Garmin Watch App ─────────────────────────────────────
            item {
                SectionHeader(
                    title = "Garmin Watch App",
                    subtitle = "Most popular integration",
                    accentColor = Colors.primary
                )
            }

            item {
                GarminWatchAppCard(onSetUp = onNavigateToGarminWatchApp)
            }

            // ── Section: Garmin Connect ───────────────────────────────────────
            item {
                SectionHeader(
                    title = "Garmin Connect",
                    subtitle = "Cloud account sync",
                    accentColor = Color(0xFF8E9BAE)
                )
            }

            item {
                GarminConnectCard(
                    isConnected = isGarminConnectConnected,
                    onConnect = onNavigateToGarminConnect,
                    onDisconnect = { viewModel.disconnectGarmin() },
                    onManagePermissions = onNavigateToGarminPermissions
                )
            }

            // ── Section: Coming Soon ──────────────────────────────────────────
            item {
                Column {
                    Spacer(modifier = Modifier.height(4.dp))
                    SectionHeader(
                        title = "Coming Soon",
                        subtitle = "Additional device integrations in development",
                        accentColor = Color(0xFF8E9BAE)
                    )
                }
            }

            items(comingSoonDevices) { device ->
                DeviceCard(
                    device = device,
                    isConnected = false,
                    isComingSoon = true
                )
            }

            item { Spacer(modifier = Modifier.height(16.dp)) }
        }
    }
}

// ── Section header ────────────────────────────────────────────────────────────

@Composable
private fun SectionHeader(title: String, subtitle: String, accentColor: Color) {
    Column(modifier = Modifier.padding(top = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(18.dp)
                    .background(accentColor, RoundedCornerShape(2.dp))
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(title, style = AppTextStyles.h3, color = Colors.textPrimary)
        }
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            subtitle,
            style = AppTextStyles.caption,
            color = Colors.textSecondary,
            modifier = Modifier.padding(start = 11.dp)
        )
    }
}

// ── Garmin Watch App card ─────────────────────────────────────────────────────
//
// The primary integration — Garmin ConnectIQ companion app that streams
// watch GPS, HR, cadence to the phone for live AI coaching. No Garmin
// Connect account required.

@Composable
private fun GarminWatchAppCard(onSetUp: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            // Header row: logo + name + "FEATURED" badge
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_garmin_logo),
                    contentDescription = "Garmin",
                    tint = Color.Unspecified,
                    modifier = Modifier.size(52.dp)
                )
                Spacer(modifier = Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Garmin Watch App",
                            style = AppTextStyles.h3,
                            color = Colors.textPrimary
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = Colors.primary.copy(alpha = 0.18f)
                        ) {
                            Text(
                                "★ FEATURED",
                                style = AppTextStyles.caption.copy(
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold
                                ),
                                color = Colors.primary,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        "AI coaching directly on your Garmin watch",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Description
            Text(
                "Install the AI Run Coach companion app on your Garmin watch. Your watch GPS, heart rate, and running metrics stream live to your phone for real-time coaching cues — no Garmin Connect account needed.",
                style = AppTextStyles.caption,
                color = Colors.textSecondary,
                lineHeight = 18.sp
            )

            Spacer(modifier = Modifier.height(14.dp))

            // Feature chips
            WatchFeatureChips()

            Spacer(modifier = Modifier.height(10.dp))

            // "No Garmin Connect needed" info badge
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = Colors.primary.copy(alpha = 0.08f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = null,
                        tint = Colors.primary,
                        modifier = Modifier.size(15.dp)
                    )
                    Spacer(modifier = Modifier.width(7.dp))
                    Text(
                        "No Garmin Connect account required to use the watch app",
                        style = AppTextStyles.caption.copy(fontSize = 11.sp),
                        color = Colors.primary
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // CTA button
            Button(
                onClick = onSetUp,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Color.Black
                ),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(
                    Icons.Default.Share,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    "Get Watch App",
                    style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                )
            }
        }
    }
}

@Composable
private fun WatchFeatureChips() {
    val chips = listOf(
        Pair(Icons.Default.LocationOn, "Watch GPS"),
        Pair(Icons.Default.Favorite, "Heart Rate Zones"),
        Pair(Icons.Default.Star, "Live AI Coaching"),
        Pair(Icons.Default.Info, "Pace & Cadence")
    )
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        chips.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { (icon, label) ->
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color(0xFF4CAF50).copy(alpha = 0.15f),
                        modifier = Modifier.wrapContentWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                icon,
                                contentDescription = null,
                                tint = Color(0xFF4CAF50),
                                modifier = Modifier.size(13.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                label,
                                style = AppTextStyles.caption.copy(fontSize = 11.sp),
                                color = Color(0xFF4CAF50)
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Garmin Connect card ───────────────────────────────────────────────────────
//
// Secondary integration — Garmin Connect OAuth for cloud activity sync and
// historical run import. Data is displayed only; NOT used in AI processing.

@Composable
private fun GarminConnectCard(
    isConnected: Boolean,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    onManagePermissions: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            // Header row: logo + name + connected badge
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_garmin_connect_logo),
                    contentDescription = "Garmin Connect",
                    tint = Color.Unspecified,
                    modifier = Modifier.size(52.dp)
                )
                Spacer(modifier = Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Garmin Connect",
                            style = AppTextStyles.h3,
                            color = Colors.textPrimary
                        )
                        if (isConnected) {
                            Spacer(modifier = Modifier.width(8.dp))
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = Color(0xFF4CAF50).copy(alpha = 0.2f)
                            ) {
                                Text(
                                    "Connected",
                                    style = AppTextStyles.caption.copy(fontSize = 10.sp),
                                    color = Color(0xFF4CAF50),
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        "Cloud activity sync & run history",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Description
            Text(
                "Link your Garmin Connect account to import past runs and sync activity data. Useful for viewing your training history in one place.",
                style = AppTextStyles.caption,
                color = Colors.textSecondary,
                lineHeight = 18.sp
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Feature chips
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SmallChip(Icons.Default.Refresh, "Activity Sync", Color(0xFF4CAF50))
                SmallChip(Icons.Default.DateRange, "Run History", Color(0xFF4CAF50))
            }

            Spacer(modifier = Modifier.height(8.dp))

            // AI exclusion notice — prominent and clear
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = Color(0xFFFFA726).copy(alpha = 0.1f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        tint = Color(0xFFFFA726),
                        modifier = Modifier
                            .size(15.dp)
                            .padding(top = 1.dp)
                    )
                    Spacer(modifier = Modifier.width(7.dp))
                    Text(
                        "Garmin Connect data is displayed for reference only and is not used in any AI coaching analysis or recommendations.",
                        style = AppTextStyles.caption.copy(fontSize = 11.sp),
                        color = Color(0xFFFFA726),
                        lineHeight = 16.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            if (isConnected) {
                // Connected: show manage + disconnect
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Button(
                        onClick = onManagePermissions,
                        modifier = Modifier
                            .weight(1f)
                            .height(46.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF1A1A1A),
                            contentColor = Color(0xFF00D4FF)
                        ),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(
                            Icons.Default.Settings,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            "Manage",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                    Button(
                        onClick = onDisconnect,
                        modifier = Modifier.height(46.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFEF5350),
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            "Disconnect",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }
            } else {
                // Not connected: show connect button
                Button(
                    onClick = onConnect,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(46.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF2A2A2A),
                        contentColor = Colors.textPrimary
                    ),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Connect Account",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }
        }
    }
}

@Composable
private fun SmallChip(icon: ImageVector, label: String, color: Color) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = color.copy(alpha = 0.15f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(13.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text(label, style = AppTextStyles.caption.copy(fontSize = 11.sp), color = color)
        }
    }
}

// ── Generic DeviceCard (coming soon) ──────────────────────────────────────────

@Suppress("UNUSED_PARAMETER")
@Composable
fun DeviceCard(device: DeviceInfo, isConnected: Boolean = false, isComingSoon: Boolean = false) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (device.iconDrawable != null) {
                    Icon(
                        painter = painterResource(id = device.iconDrawable),
                        contentDescription = null,
                        tint = Color.Unspecified,
                        modifier = Modifier.size(52.dp)
                    )
                } else if (device.icon != null) {
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .background(Colors.backgroundTertiary, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            device.icon,
                            contentDescription = null,
                            tint = Colors.textMuted,
                            modifier = Modifier.size(26.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(device.name, style = AppTextStyles.h3, color = Colors.textPrimary)
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        device.description,
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }

            if (!device.isAvailableOnAndroid) {
                Spacer(modifier = Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        tint = Colors.textMuted,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        "iOS only",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                }
            }

            if (isComingSoon) {
                Spacer(modifier = Modifier.height(14.dp))
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Colors.backgroundTertiary,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Icon(
                                Icons.Default.Info,
                                contentDescription = null,
                                tint = Colors.textMuted,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                "Coming Soon",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Medium),
                                color = Colors.textMuted
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Legacy badge composables (kept for any external usage) ────────────────────

