package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
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
    onNavigateToStrava: () -> Unit = {},
    viewModel: ConnectedDevicesViewModel = hiltViewModel()
) {
    val garminConnectionStatus by viewModel.garminConnectionStatus.collectAsState()
    val garminDeviceName by viewModel.garminDeviceName.collectAsState()
    val isGarminConnectConnected = garminConnectionStatus == "connected"

    val stravaConnected by viewModel.stravaConnected.collectAsState()
    val stravaAthleteName by viewModel.stravaAthleteName.collectAsState()
    val stravaLoading by viewModel.stravaLoading.collectAsState()
    val stravaImportStatus by viewModel.stravaImportStatus.collectAsState()

    // Refresh both Garmin and Strava status whenever this screen is foregrounded.
    // This covers the OAuth callback case: Chrome may block airuncoach:// redirects, so the
    // deep link → onNewIntent path isn't guaranteed. The lifecycle observer acts as a
    // belt-and-suspenders fallback — when the user returns from the browser, the status is
    // always re-checked regardless of whether the deep link fired.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.checkStravaConnection()
                viewModel.refreshGarminStatus()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val comingSoonDevices = remember {
        listOf(
            // Apple Watch and COROS removed per requirements
            // DeviceInfo(
            //     name = "Apple Watch",
            //     description = "Connect via Apple HealthKit for real-time heart rate and health metrics",
            //     icon = Icons.Default.Star,
            //     supportsRealtimeHR = true,
            //     supportsPostRunSync = true,
            //     isAvailableOnAndroid = false,
            //     requiresAppInstall = true,
            //     onConnect = {}
            // ),
            DeviceInfo(
                name = "Samsung Galaxy Watch",
                description = "Connect via Samsung Health for real-time heart rate tracking",
                icon = Icons.Default.Star,
                supportsRealtimeHR = true,
                supportsPostRunSync = true,
                isAvailableOnAndroid = false,
                requiresAppInstall = true,
                onConnect = {}
            )
            // COROS removed per requirements
            // DeviceInfo(
            //     name = "COROS",
            //     description = "Connect via COROS API for post-run activity sync",
            //     icon = Icons.Default.Place,
            //     supportsRealtimeHR = false,
            //     supportsPostRunSync = true,
            //     isAvailableOnAndroid = true,
            //     onConnect = {}
            // )
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
                    "Connect your Ai Run Coach app to your fitness devices and services. Get real-time coaching with your Garmin watch, and publish completed runs to Strava with full GPS data and metrics.",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }

            // ── Section: Garmin Watch App ─────────────────────────────────────
            item {
                SectionHeader(
                    title = "Garmin Watch App",
                    accentColor = Colors.primary
                )
            }

            item {
                GarminWatchAppCard(onSetUp = onNavigateToGarminWatchApp)
            }

            // ── Section: Strava Integration ───────────────────────────────────
            item {
                SectionHeader(
                    title = "Strava",
                    subtitle = "Publish runs with GPS data",
                    accentColor = Color(0xFFFC5200)  // Strava orange
                )
            }

            item {
                StravaIntegrationCard(
                    isConnected = stravaConnected,
                    athleteName = stravaAthleteName,
                    isLoading = stravaLoading,
                    importStatus = stravaImportStatus,
                    onConnect = { viewModel.connectStrava() },
                    onDisconnect = { viewModel.disconnectStrava() },
                    onImportHistory = { viewModel.importStravaHistory() },
                    onClearImportStatus = { viewModel.clearStravaImportStatus() }
                )
            }

            // ── Section: Garmin Connect (COMMENTED OUT) ───────────────────────
            // This integration is disabled because Garmin Connect data cannot be
            // used for AI processing. The data is not useful for the coaching engine.
            // If needed in the future, uncomment below.
            /*
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
                    deviceName = garminDeviceName,
                    onConnect = onNavigateToGarminConnect,
                    onDisconnect = { viewModel.disconnectGarmin() },
                    onManagePermissions = onNavigateToGarminPermissions
                )
            }
            */

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
private fun SectionHeader(title: String, accentColor: Color, subtitle: String? = null) {
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
        if (subtitle != null) {
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                subtitle,
                style = AppTextStyles.caption,
                color = Colors.textSecondary,
                modifier = Modifier.padding(start = 11.dp)
            )
        }
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
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Top row: Garmin IQ asset logo (full width)
            Icon(
                painter = painterResource(id = R.drawable.available_connect_iq_badge),
                contentDescription = "Garmin Connect IQ",
                tint = Color.Unspecified,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            )

            // Header: "Garmin Watch App" title + "Premium" badge
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Download from Connect IQ Store",
                        style = AppTextStyles.h3,
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = Colors.primary.copy(alpha = 0.18f)
                    ) {
                        Text(
                            "★ FREE",
                            style = AppTextStyles.caption.copy(
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold
                            ),
                            color = Colors.primary,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Description
            Text(
                "Install the Ai Run Coach companion app on your Garmin watch. Your watch GPS, heart rate, and running metrics stream live to your phone for real-time coaching cues — for a totally elite experience.",
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
                        "Automatically syncs your run activity to Garmin Connect.",
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
        Pair(Icons.Default.LocationOn, "23+ Biometric Sensors"),     // Ground contact, vertical oscillation, training effect, etc.
        Pair(Icons.Default.Favorite, "Personal HR Zones"),            // Based on user's actual max HR
        Pair(Icons.Default.Star, "Advanced Running Metrics"),                    // GCT, stride, bounce tracking
        Pair(Icons.Default.Info, "Real-Time Coaching")                // AI-powered form & pacing cues
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

// ── Strava Integration card ──────────────────────────────────────────────────
//
// Integration with Strava API to publish completed runs with full GPS data,
// heart rate, cadence, and elevation metrics. Enables route map generation
// and historic run import for AI coaching baseline data.

/**
 * Official "Compatible with Strava" logo per Strava API Brand Guidelines.
 *
 * SETUP: Replace the placeholder drawable with the real asset:
 *   1. Download the orange PNG from https://developers.strava.com/guidelines/
 *   2. Save as app/src/main/res/drawable/ic_strava_compatible_with.png (2x, 96px height)
 *   3. Delete ic_strava_compatible_with.xml
 */
@Composable
private fun StravaCompatibleBanner() {
    Icon(
        painter = painterResource(id = R.drawable.ic_strava_compatible_with),
        contentDescription = "Compatible with Strava",
        tint = Color.Unspecified,
        modifier = Modifier.height(28.dp)
    )
}

@Composable
private fun StravaIntegrationCard(
    isConnected: Boolean,
    athleteName: String?,
    isLoading: Boolean,
    importStatus: String?,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    onImportHistory: () -> Unit,
    onClearImportStatus: () -> Unit
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
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // "Compatible with Strava" banner
            StravaCompatibleBanner()

            // Title + connection status badge
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Strava Integration",
                        style = AppTextStyles.h3,
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        if (isConnected) "Publish runs · Import history"
                        else "Publish runs with complete GPS data",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
                if (isConnected) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color(0xFF4CAF50).copy(alpha = 0.15f)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .background(Color(0xFF4CAF50), CircleShape)
                            )
                            Spacer(modifier = Modifier.width(5.dp))
                            Text(
                                "Connected",
                                style = AppTextStyles.caption.copy(
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                ),
                                color = Color(0xFF4CAF50)
                            )
                        }
                    }
                }
            }

            // Connected: show athlete name
            if (isConnected && !athleteName.isNullOrBlank()) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFFC5200).copy(alpha = 0.08f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Person,
                            contentDescription = null,
                            tint = Color(0xFFFC5200),
                            modifier = Modifier.size(15.dp)
                        )
                        Spacer(modifier = Modifier.width(7.dp))
                        Text(
                            "Connected as $athleteName",
                            style = AppTextStyles.caption.copy(fontSize = 12.sp),
                            color = Color(0xFFFC5200)
                        )
                    }
                }
            }

            // Description — changes based on connection state
            Text(
                if (isConnected)
                    "Your Strava account is connected. Publish completed runs with full GPS tracks, heart rate, cadence, and elevation. Import your Strava run history to power AI coaching and plan recommendations."
                else
                    "Connect your Strava account to publish completed runs with full GPS tracks, heart rate, cadence, and elevation data. Share your Ai Run Coach sessions with your Strava community.",
                style = AppTextStyles.caption,
                color = Colors.textSecondary,
                lineHeight = 18.sp
            )

            // Feature chips
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SmallChip(Icons.Default.LocationOn, "Route Map", Color(0xFFFC5200))
                SmallChip(Icons.Default.Favorite, "All Metrics", Color(0xFFFC5200))
                if (isConnected)
                    SmallChip(Icons.Default.Star, "AI Baseline", Color(0xFFFC5200))
                else
                    SmallChip(Icons.Default.Share, "Social Share", Color(0xFFFC5200))
            }

            // Import status message
            if (!importStatus.isNullOrBlank() && importStatus != "importing") {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (importStatus.startsWith("Import failed"))
                        Color(0xFFE53935).copy(alpha = 0.10f)
                    else
                        Color(0xFF4CAF50).copy(alpha = 0.10f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            if (importStatus.startsWith("Import failed")) Icons.Default.Warning else Icons.Default.Check,
                            contentDescription = null,
                            tint = if (importStatus.startsWith("Import failed")) Color(0xFFE53935) else Color(0xFF4CAF50),
                            modifier = Modifier.size(15.dp)
                        )
                        Spacer(modifier = Modifier.width(7.dp))
                        Text(
                            importStatus,
                            style = AppTextStyles.caption.copy(fontSize = 11.sp),
                            color = if (importStatus.startsWith("Import failed")) Color(0xFFE53935) else Color(0xFF4CAF50),
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(
                            onClick = onClearImportStatus,
                            modifier = Modifier.size(20.dp)
                        ) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Dismiss",
                                tint = Colors.textSecondary,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(2.dp))

            if (isConnected) {
                // Import history button
                Button(
                    onClick = onImportHistory,
                    enabled = !isLoading && importStatus != "importing",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFFC5200),
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    if (isLoading || importStatus == "importing") {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "Importing runs…",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                        )
                    } else {
                        Icon(
                            Icons.Default.Download,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "Import Run History",
                            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }

                // Disconnect button
                OutlinedButton(
                    onClick = onDisconnect,
                    enabled = !isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Colors.textSecondary
                    ),
                    border = BorderStroke(1.dp, Colors.textSecondary.copy(alpha = 0.3f)),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(
                        Icons.Default.LinkOff,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        "Disconnect Strava",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.Medium)
                    )
                }
            } else {
                // Official "Connect with Strava" button per Strava API Brand Guidelines.
                // SETUP: Replace the placeholder drawable with the real asset:
                //   1. Download the orange PNG from https://developers.strava.com/guidelines/
                //   2. Save as app/src/main/res/drawable/btn_strava_connect.png (2x, 96px height)
                //   3. Delete btn_strava_connect.xml
                if (isLoading) {
                    Button(
                        onClick = {},
                        enabled = false,
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        colors = ButtonDefaults.buttonColors(
                            disabledContainerColor = Color(0xFFFC5200).copy(alpha = 0.6f),
                            disabledContentColor = Color.White
                        ),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Connecting…", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold))
                    }
                } else {
                    Image(
                        painter = painterResource(id = R.drawable.btn_strava_connect),
                        contentDescription = "Connect with Strava",
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                            .clickable { onConnect() }
                    )
                }
            }
        }
    }
}

// ── Garmin Connect card (COMMENTED OUT) ───────────────────────────────────────
//
// This integration is disabled. Garmin Connect data cannot be used for AI processing.
// Secondary integration — Garmin Connect OAuth for cloud activity sync and
// historical run import. Data is displayed only; NOT used in AI processing.

@Composable
private fun GarminConnectCard(
    isConnected: Boolean,
    deviceName: String = "",
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
            // Header row: logo + name
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_garmin_logo),
                    contentDescription = "Garmin Connect",
                    tint = Color.Unspecified,
                    modifier = Modifier.size(52.dp)
                )
                Spacer(modifier = Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Garmin Connect",
                        style = AppTextStyles.h3,
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        "Cloud activity sync & run history",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }

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
                        "Garmin Connect data is NOT allowed to be used or processed for any AI services. This data is displayed for reference purposes only.",
                        style = AppTextStyles.caption.copy(fontSize = 11.sp),
                        color = Color(0xFFFFA726),
                        lineHeight = 16.sp
                    )
                }
            }

            // Connected badge below the header (only when connected)
            if (isConnected) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = Color(0xFF4CAF50).copy(alpha = 0.2f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        "Connected - ${deviceName.ifEmpty { "Garmin Device" }}",
                        style = AppTextStyles.caption.copy(fontSize = 11.sp, fontWeight = FontWeight.Medium),
                        color = Color(0xFF4CAF50),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
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
