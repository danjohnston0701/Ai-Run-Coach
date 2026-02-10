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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.ui.theme.*
import live.airuncoach.airuncoach.viewmodel.ConnectedDevicesViewModel

data class DeviceInfo(
    val name: String,
    val description: String,
    val icon: ImageVector,
    val supportsRealtimeHR: Boolean,
    val supportsPostRunSync: Boolean,
    val isAvailableOnAndroid: Boolean,
    val requiresAppInstall: Boolean = false,
    val isConnected: Boolean = false,
    val onConnect: () -> Unit
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectedDevicesScreen(
    onNavigateBack: () -> Unit,
    onNavigateToGarminConnect: () -> Unit = {},
    viewModel: ConnectedDevicesViewModel = hiltViewModel()
) {
    val garminConnectionStatus by viewModel.garminConnectionStatus.collectAsState()
    
    // Available devices
    val devices = remember {
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
                description = "Connect via Samsung Health SDK for real-time heart rate tracking",
                icon = Icons.Default.Star,
                supportsRealtimeHR = true,
                supportsPostRunSync = true,
                isAvailableOnAndroid = false,
                requiresAppInstall = true,
                onConnect = {}
            ),
            DeviceInfo(
                name = "Garmin",
                description = "Connect via Garmin Connect OAuth for activity sync and health data",
                icon = Icons.Default.Favorite,
                supportsRealtimeHR = false,
                supportsPostRunSync = true,
                isAvailableOnAndroid = true,
                isConnected = garminConnectionStatus == "connected",
                onConnect = onNavigateToGarminConnect
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
    
    val connectedDevices = devices.filter { it.isConnected }
    val availableDevices = devices.filterNot { it.isConnected }

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
        containerColor = Colors.backgroundRoot
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { Spacer(modifier = Modifier.height(8.dp)) }
            
            // Header
            item {
                Column {
                    Text(
                        "Connected Devices",
                        style = AppTextStyles.h1,
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Connect your fitness watch to track heart rate during runs and sync health metrics",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary
                    )
                }
            }
            
            // Real-Time Heart Rate Info Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = Colors.backgroundSecondary
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .background(Color(0x33FF5252), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Default.Favorite,
                                contentDescription = null,
                                tint = Color(0xFFFF5252),
                                modifier = Modifier.size(24.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(16.dp))
                        Column {
                            Text(
                                "Real-Time Heart Rate",
                                style = AppTextStyles.h3,
                                color = Colors.textPrimary
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Get live heart rate data during runs and heart rate zone coaching from your AI coach",
                                style = AppTextStyles.caption,
                                color = Colors.textSecondary
                            )
                        }
                    }
                }
            }
            
            // Connected Devices Section
            if (connectedDevices.isNotEmpty()) {
                item {
                    Text(
                        "Connected",
                        style = AppTextStyles.h3,
                        color = Colors.textPrimary,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
                
                items(connectedDevices) { device ->
                    DeviceCard(
                        device = device,
                        isConnected = true
                    )
                }
            }
            
            // Available Devices Section
            if (availableDevices.isNotEmpty()) {
                item {
                    Text(
                        if (connectedDevices.isEmpty()) "Available Devices" else "More Devices",
                        style = AppTextStyles.h3,
                        color = Colors.textPrimary,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
                
                items(availableDevices) { device ->
                    DeviceCard(device = device, isConnected = false)
                }
            }
            
            item { Spacer(modifier = Modifier.height(16.dp)) }
        }
    }
}

@Composable
fun DeviceCard(device: DeviceInfo, isConnected: Boolean) {
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
            // Header with icon and title
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(Colors.backgroundTertiary, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        device.icon,
                        contentDescription = null,
                        tint = Colors.textMuted,
                        modifier = Modifier.size(28.dp)
                    )
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            device.name,
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
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        device.description,
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Feature badges
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FeatureBadge(
                    text = "Real-time HR",
                    isSupported = device.supportsRealtimeHR
                )
                FeatureBadge(
                    text = "Post-run sync",
                    isSupported = device.supportsPostRunSync
                )
            }
            
            // Additional info badges
            if (device.requiresAppInstall) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    InfoBadge(
                        text = "Requires app install",
                        color = Color(0xFFFFA726)
                    )
                }
            }
            
            // Not available on Android notice
            if (!device.isAvailableOnAndroid) {
                Spacer(modifier = Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        tint = Colors.textMuted,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        "Not available on Android",
                        style = AppTextStyles.caption,
                        color = Colors.textMuted
                    )
                }
            } else {
                // Connect button for available devices
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = device.onConnect,
                    modifier = Modifier.height(40.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isConnected) Colors.backgroundTertiary else Colors.primary,
                        contentColor = if (isConnected) Colors.textMuted else Color.Black
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(
                        if (isConnected) Icons.Default.Check else Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        if (isConnected) "Connected" else "Connect",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }
        }
    }
}

@Composable
fun FeatureBadge(text: String, isSupported: Boolean) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = if (isSupported) Color(0xFF4CAF50).copy(alpha = 0.2f) else Colors.backgroundTertiary
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                if (isSupported) Icons.Default.Check else Icons.Default.Close,
                contentDescription = null,
                tint = if (isSupported) Color(0xFF4CAF50) else Colors.textMuted,
                modifier = Modifier.size(14.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text,
                style = AppTextStyles.caption.copy(fontSize = 12.sp),
                color = if (isSupported) Color(0xFF4CAF50) else Colors.textMuted
            )
        }
    }
}

@Composable
fun InfoBadge(text: String, color: Color) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = color.copy(alpha = 0.2f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Info,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(14.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text,
                style = AppTextStyles.caption.copy(fontSize = 12.sp),
                color = color
            )
        }
    }
}
