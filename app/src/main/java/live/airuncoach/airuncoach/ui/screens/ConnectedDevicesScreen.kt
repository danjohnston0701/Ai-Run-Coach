
package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.ConnectedDevicesViewModel
import live.airuncoach.airuncoach.viewmodel.Device

@Composable
fun ConnectedDevicesScreen() {
    val viewModel: ConnectedDevicesViewModel = viewModel()
    val devices by viewModel.devices.collectAsState()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .padding(Spacing.lg)
    ) {
        item {
            Text(
                text = "Connected Devices",
                style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                text = "Connect your fitness watch to track heart rate during runs and sync health metrics.",
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.lg))
        }

        items(devices) { device ->
            DeviceCard(device = device)
            Spacer(modifier = Modifier.height(Spacing.md))
        }

        item { Spacer(modifier = Modifier.height(Spacing.lg)) }
        
        item { BluetoothHrSection() }
        
        item { Spacer(modifier = Modifier.height(Spacing.lg)) }
        
        item { InfoBanner() }
    }
}

@Composable
fun DeviceCard(device: Device) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(
            containerColor = Colors.backgroundSecondary
        )
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(BorderRadius.sm))
                        .background(if (device.connected) Colors.success.copy(alpha = 0.2f) else Colors.backgroundTertiary),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.icon_timer_vector),
                        contentDescription = device.name,
                        tint = if (device.connected) Colors.success else Colors.textMuted,
                        modifier = Modifier.size(24.dp)
                    )
                }
                Spacer(modifier = Modifier.width(Spacing.md))
                Column {
                    Text(
                        text = device.name,
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        text = device.description,
                        style = AppTextStyles.small,
                        color = Colors.textSecondary
                    )
                }
            }
            Spacer(modifier = Modifier.height(Spacing.md))
            Row {
                if (device.connected) {
                    Button(
                        onClick = { /* TODO: Sync */ },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(BorderRadius.lg),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        )
                    ) {
                        Text("Sync Wellness")
                    }
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    OutlinedButton(
                        onClick = { /* TODO: Disconnect */ },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(BorderRadius.lg),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Colors.error
                        ),
                        border = BorderStroke(1.dp, Colors.error)
                    ) {
                        Text("Disconnect")
                    }
                } else {
                    Button(
                        onClick = { /* TODO: Connect */ },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(BorderRadius.lg),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Colors.primary,
                            contentColor = Colors.buttonText
                        )
                    ) {
                        Text("Connect")
                    }
                }
            }
        }
    }
}

@Composable
fun BluetoothHrSection() {
    Column {
        Text(
            text = "Bluetooth Heart Rate",
            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Text(
            text = "Connect to a Bluetooth heart rate monitor for real-time HR during runs.",
            style = AppTextStyles.body,
            color = Colors.textSecondary
        )
        Spacer(modifier = Modifier.height(Spacing.md))
        Button(
            onClick = { /* TODO: Scan for HR monitors */ },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(BorderRadius.lg),
            colors = ButtonDefaults.buttonColors(
                containerColor = Colors.primary,
                contentColor = Colors.buttonText
            )
        ) {
            Icon(
                painter = painterResource(id = R.drawable.icon_timer_vector),
                contentDescription = "Scan",
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text("Scan for HR Monitors", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
        }
    }
}

@Composable
fun InfoBanner() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Colors.primary.copy(alpha = 0.1f), shape = RoundedCornerShape(BorderRadius.sm))
            .padding(Spacing.md),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            painter = painterResource(id = R.drawable.icon_info_vector),
            contentDescription = "Info",
            tint = Colors.primary,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(Spacing.sm))
        Text(
            text = "Garmin users: Enable \"Broadcast Heart Rate\" in your watch settings to stream live HR during Garmin's native run tracking.",
            style = AppTextStyles.small,
            color = Colors.textSecondary
        )
    }
}