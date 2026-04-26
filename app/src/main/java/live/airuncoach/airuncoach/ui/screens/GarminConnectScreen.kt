package live.airuncoach.airuncoach.ui.screens

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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.R
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.ui.theme.*
import live.airuncoach.airuncoach.viewmodel.ConnectedDevicesViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GarminConnectScreen(
    onNavigateBack: () -> Unit,
    viewModel: ConnectedDevicesViewModel = hiltViewModel()
) {
    val garminConnectionStatus by viewModel.garminConnectionStatus.collectAsState()

    // When OAuth completes and the ViewModel refreshes to "connected", go back to
    // Connected Devices screen automatically — so the user sees the Connected state
    LaunchedEffect(garminConnectionStatus) {
        if (garminConnectionStatus == "connected") {
            onNavigateBack()
        }
    }

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
                        "Garmin Connect",
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
            item { Spacer(modifier = Modifier.height(4.dp)) }

            // Garmin Connect logo + header
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
                            painter = painterResource(id = R.drawable.ic_garmin_connect_logo),
                            contentDescription = "Garmin Connect",
                            tint = Color.Unspecified,
                            modifier = Modifier.size(52.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        "Connect your Garmin account to import completed run activities and historical training data.",
                        style = AppTextStyles.body,
                        color = Colors.textSecondary,
                        modifier = Modifier.padding(horizontal = 16.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }

            // ── AI data policy notice ─────────────────────────────────────────
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFFFFA726).copy(alpha = 0.08f)
                    )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(18.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Info,
                                contentDescription = null,
                                tint = Color(0xFFFFA726),
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(
                                "Data Usage Policy",
                                style = AppTextStyles.h3,
                                color = Colors.textPrimary
                            )
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            "Garmin Connect data (activities, health metrics, sleep, body battery, HRV) is displayed in the app for your reference only. It is not included in any AI coaching analysis, run briefings, or OpenAI processing.",
                            style = AppTextStyles.body,
                            color = Colors.textSecondary,
                            lineHeight = 20.sp
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "For AI-powered live coaching, use the Garmin Watch App instead.",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Medium),
                            color = Color(0xFFFFA726)
                        )
                    }
                }
            }

            // ── What you'll get ───────────────────────────────────────────────
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
                            "What Garmin Connect provides:",
                            style = AppTextStyles.h3,
                            color = Colors.textPrimary
                        )
                        Spacer(modifier = Modifier.height(16.dp))

                        BenefitRow(
                            icon = Icons.Default.Refresh,
                            text = "Import your past runs and training history"
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        BenefitRow(
                            icon = Icons.Default.DateRange,
                            text = "View completed activity data in your run history"
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        BenefitRow(
                            icon = Icons.Default.Favorite,
                            text = "See heart rate and performance data for past runs"
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        BenefitRow(
                            icon = Icons.Default.Place,
                            text = "Access route maps and split data from Garmin activities"
                        )
                    }
                }
            }

            // ── Historical Run Import ─────────────────────────────────────────
            item {
                Column {
                    Text(
                        "Historical Run Import",
                        style = AppTextStyles.h3,
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        "Choose how far back to retrieve your run history from Garmin Connect",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }

            items(historyOptions.size) { index ->
                val (value, label) = historyOptions[index]
                HistoryOptionCard(
                    label = label,
                    isSelected = selectedHistoryOption == value,
                    onClick = { selectedHistoryOption = value }
                )
            }

            // ── Connect Button ────────────────────────────────────────────────
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
                        modifier = Modifier.size(22.dp)
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
                    "By connecting, you authorise AI Run Coach to access your Garmin Connect activity data for display purposes only. Your Garmin data is never shared with AI models. You can disconnect at any time.",
                    style = AppTextStyles.caption,
                    color = Colors.textMuted,
                    modifier = Modifier.padding(horizontal = 8.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }

            item { Spacer(modifier = Modifier.height(16.dp)) }
        }
    }
}

@Composable
fun BenefitRow(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
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
            containerColor = Colors.backgroundSecondary
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
                style = AppTextStyles.body.copy(
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                ),
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
