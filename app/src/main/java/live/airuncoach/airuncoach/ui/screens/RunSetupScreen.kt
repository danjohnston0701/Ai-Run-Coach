
package live.airuncoach.airuncoach.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.ui.components.SetupItem
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.RunSessionViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RunSetupScreen(
    onClose: () -> Unit,
    onStartRun: () -> Unit,
    viewModel: RunSessionViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val runState by viewModel.runState.collectAsState()

    val healthConnectPermissionsLauncher = rememberLauncherForActivityResult(
        contract = viewModel.getHealthConnectPermissionsContract(),
        onResult = { grantedPermissions ->
            if (grantedPermissions.isNotEmpty()) {
                viewModel.fetchWellnessData()
            }
        }
    )
    
    LaunchedEffect(Unit) {
        viewModel.fetchWellnessData()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("RUN SETUP", style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(painterResource(id = R.drawable.icon_close_vector), contentDescription = "Close", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(Spacing.lg)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                // ... (existing setup items)

                // Health Connect
                SetupItem(title = "Wellness", enabled = runState.wellnessContext != null, onToggle = { /* Not a toggle */ }) {
                    if (runState.wellnessContext == null) {
                        Button(onClick = { healthConnectPermissionsLauncher.launch(emptySet()) }) {
                            Text("Connect to Health")
                        }
                    } else {
                        Column {
                            runState.wellnessContext?.sleepHours?.let {
                                Text("Last Sleep: ${String.format("%.1f", it)} hours", color = Colors.textPrimary)
                            }
                            runState.wellnessContext?.restingHeartRate?.let {
                                Text("Resting HR: $it bpm", color = Colors.textPrimary)
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(Spacing.lg))
                
                // ... (rest of the setup items)
            }

            Button(
                onClick = onStartRun,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary, contentColor = Colors.buttonText)
            ) {
                Icon(painter = painterResource(id = R.drawable.icon_play_vector), contentDescription = "Start Run")
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text("START RUN", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
            }
        }
    }
}
