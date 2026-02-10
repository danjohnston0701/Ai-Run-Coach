package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import live.airuncoach.airuncoach.ui.theme.*
import live.airuncoach.airuncoach.viewmodel.ConnectedDevicesViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GarminConnectScreen(
    onNavigateBack: () -> Unit,
    viewModel: ConnectedDevicesViewModel = viewModel()
) {
    var selectedHistoryOption by remember { mutableStateOf("30") }
    
    val historyOptions = listOf(
        "30" to "Last 30 days",
        "14" to "Last 14 days",
        "7" to "Last 7 days",
        "0" to "No Run History"
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "Connect Garmin",
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
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            item { Spacer(modifier = Modifier.height(8.dp)) }
            
            // Garmin Logo/Header
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(80.dp)
                            .background(Colors.backgroundSecondary, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Favorite,
                            contentDescription = "Garmin",
                            tint = Color(0xFFFF5252),
                            modifier = Modifier.size(40.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Connect to Garmin",
                        style = AppTextStyles.h1,
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Sync your runs, heart rate data, and training metrics from Garmin Connect",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        modifier = Modifier.padding(horizontal = 24.dp)
                    )
                }
            }
            
            // What you'll get section
            item {
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
                        Text(
                            "What you'll get:",
                            style = AppTextStyles.h3,
                            color = Colors.textPrimary
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        BenefitRow(
                            icon = Icons.Default.Refresh,
                            text = "Automatic activity sync after every run"
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        BenefitRow(
                            icon = Icons.Default.Favorite,
                            text = "Heart rate and training load data"
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        BenefitRow(
                            icon = Icons.Default.DateRange,
                            text = "Performance metrics and analytics"
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        BenefitRow(
                            icon = Icons.Default.DateRange,
                            text = "Import historical run data"
                        )
                    }
                }
            }
            
            // Historical Run Import Options
            item {
                Column {
                    Text(
                        "Historical Run Import",
                        style = AppTextStyles.h3,
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Choose how far back to retrieve your run history from Garmin Connect",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }
            
            // History options
            items(historyOptions.size) { index ->
                val (value, label) = historyOptions[index]
                HistoryOptionCard(
                    label = label,
                    isSelected = selectedHistoryOption == value,
                    onClick = { selectedHistoryOption = value }
                )
            }
            
            // Garmin Connect IQ App Info
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFF2196F3).copy(alpha = 0.1f)
                    )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Info,
                                contentDescription = null,
                                tint = Color(0xFF2196F3),
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                "Garmin Connect IQ App",
                                style = AppTextStyles.h3,
                                color = Colors.textPrimary
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            "For real-time coaching during runs, download the AI Run Coach companion app from the Garmin Connect IQ Store.",
                            style = AppTextStyles.body,
                            color = Colors.textSecondary
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        OutlinedButton(
                            onClick = { /* TODO: Open Connect IQ Store link */ },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = Color(0xFF2196F3)
                            ),
                            border = BorderStroke(
                                1.dp,
                                Color(0xFF2196F3)
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(
                                Icons.Default.ExitToApp,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                "Visit Connect IQ Store",
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold)
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "(Coming soon)",
                            style = AppTextStyles.caption,
                            color = Colors.textMuted,
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        )
                    }
                }
            }
            
            // Connect Button
            item {
                Button(
                    onClick = { 
                        viewModel.connectGarmin(historyDays = selectedHistoryOption.toInt())
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        "Continue to Garmin",
                        style = AppTextStyles.h3.copy(fontSize = 16.sp),
                        color = Color.Black
                    )
                }
            }
            
            // Privacy notice
            item {
                Text(
                    "By connecting, you authorize AI Run Coach to access your Garmin Connect data. You can disconnect at any time from settings.",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
            }
            
            item { Spacer(modifier = Modifier.height(16.dp)) }
        }
    }
}

@Composable
fun BenefitRow(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .background(Color(0xFF4CAF50).copy(alpha = 0.2f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = Color(0xFF4CAF50),
                modifier = Modifier.size(18.dp)
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text,
            style = AppTextStyles.body,
            color = Colors.textPrimary
        )
    }
}

@Composable
fun HistoryOptionCard(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .then(
                if (isSelected) {
                    Modifier.border(
                        width = 2.dp,
                        color = Colors.primary,
                        shape = RoundedCornerShape(12.dp)
                    )
                } else {
                    Modifier
                }
            ),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) Colors.backgroundSecondary else Colors.backgroundSecondary
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RadioButton(
                selected = isSelected,
                onClick = onClick,
                colors = RadioButtonDefaults.colors(
                    selectedColor = Colors.primary,
                    unselectedColor = Colors.textMuted
                )
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                label,
                style = AppTextStyles.body.copy(fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal),
                color = if (isSelected) Colors.textPrimary else Colors.textSecondary
            )
            Spacer(modifier = Modifier.weight(1f))
            if (isSelected) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    tint = Colors.primary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}
