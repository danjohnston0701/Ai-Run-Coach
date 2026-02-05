package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.domain.model.PhysicalActivityType
import live.airuncoach.airuncoach.domain.model.RunSetupConfig
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RunSetupScreen(
    mode: String = "non-route", // "route" or "non-route"
    onBack: () -> Unit,
    onStartRun: (RunSetupConfig) -> Unit,
    onGenerateRoute: (Float, Boolean, Int, Int, Int) -> Unit = { _, _, _, _, _ -> } // distance, hasTime, hours, minutes, seconds
) {
    var targetDistance by remember { mutableStateOf("5.0") }
    var hasTargetTime by remember { mutableStateOf(false) }
    var targetHours by remember { mutableStateOf("0") }
    var targetMinutes by remember { mutableStateOf("30") }
    var targetSeconds by remember { mutableStateOf("0") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Setup Your Run", style = AppTextStyles.h2) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Colors.backgroundSecondary
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Colors.backgroundDefault)
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg)
        ) {
            // Header
            Text(
                text = "Set your goals for this run",
                style = AppTextStyles.body,
                color = Colors.textSecondary,
                modifier = Modifier.padding(bottom = Spacing.lg)
            )

            // Distance Input
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = Spacing.lg),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    Text(
                        text = "Target Distance",
                        style = AppTextStyles.h3,
                        modifier = Modifier.padding(bottom = Spacing.sm)
                    )
                    
                    OutlinedTextField(
                        value = targetDistance,
                        onValueChange = { 
                            if (it.isEmpty() || it.matches(Regex("^\\d*\\.?\\d*$"))) {
                                targetDistance = it
                            }
                        },
                        label = { Text("Distance (km)") },
                        suffix = { Text("km") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Colors.primary,
                            unfocusedBorderColor = Colors.textSecondary.copy(alpha = 0.3f)
                        )
                    )
                    
                    Text(
                        text = "Enter the distance you plan to run",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary,
                        modifier = Modifier.padding(top = Spacing.xs)
                    )
                }
            }

            // Target Time Toggle
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = Spacing.lg),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
            ) {
                Column(modifier = Modifier.padding(Spacing.lg)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Set Target Time",
                                style = AppTextStyles.h3
                            )
                            Text(
                                text = "Optional: Set a time goal",
                                style = AppTextStyles.caption,
                                color = Colors.textSecondary,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }
                        
                        Switch(
                            checked = hasTargetTime,
                            onCheckedChange = { hasTargetTime = it },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Colors.primary,
                                checkedTrackColor = Colors.primary.copy(alpha = 0.5f)
                            )
                        )
                    }
                    
                    // Time Input Fields (shown when enabled)
                    if (hasTargetTime) {
                        Spacer(modifier = Modifier.height(Spacing.lg))
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                        ) {
                            // Hours
                            OutlinedTextField(
                                value = targetHours,
                                onValueChange = { 
                                    if (it.isEmpty() || (it.toIntOrNull() != null && it.toInt() < 24)) {
                                        targetHours = it
                                    }
                                },
                                label = { Text("Hours") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Colors.primary,
                                    unfocusedBorderColor = Colors.textSecondary.copy(alpha = 0.3f)
                                )
                            )
                            
                            // Minutes
                            OutlinedTextField(
                                value = targetMinutes,
                                onValueChange = { 
                                    if (it.isEmpty() || (it.toIntOrNull() != null && it.toInt() < 60)) {
                                        targetMinutes = it
                                    }
                                },
                                label = { Text("Minutes") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Colors.primary,
                                    unfocusedBorderColor = Colors.textSecondary.copy(alpha = 0.3f)
                                )
                            )
                            
                            // Seconds
                            OutlinedTextField(
                                value = targetSeconds,
                                onValueChange = { 
                                    if (it.isEmpty() || (it.toIntOrNull() != null && it.toInt() < 60)) {
                                        targetSeconds = it
                                    }
                                },
                                label = { Text("Seconds") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Colors.primary,
                                    unfocusedBorderColor = Colors.textSecondary.copy(alpha = 0.3f)
                                )
                            )
                        }
                        
                        // Calculated Pace Display
                        val distanceValue = targetDistance.toFloatOrNull() ?: 0f
                        val totalSeconds = (targetHours.toIntOrNull() ?: 0) * 3600 + 
                                          (targetMinutes.toIntOrNull() ?: 0) * 60 + 
                                          (targetSeconds.toIntOrNull() ?: 0)
                        
                        if (distanceValue > 0 && totalSeconds > 0) {
                            val paceMinPerKm = totalSeconds / 60.0 / distanceValue
                            val paceMin = paceMinPerKm.toInt()
                            val paceSec = ((paceMinPerKm - paceMin) * 60).toInt()
                            
                            Text(
                                text = "Target Pace: ${paceMin}:${paceSec.toString().padStart(2, '0')}/km",
                                style = AppTextStyles.small,
                                color = Colors.primary,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(top = Spacing.sm)
                            )
                        }
                    }
                }
            }

            // Info Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = Spacing.lg),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Colors.primary.copy(alpha = 0.1f)
                )
            ) {
                Row(
                    modifier = Modifier.padding(Spacing.lg),
                    verticalAlignment = Alignment.Top
                ) {
                    Text(
                        text = "💡",
                        style = AppTextStyles.h3,
                        modifier = Modifier.padding(end = Spacing.sm)
                    )
                    Text(
                        text = "Your AI coach will use these goals to provide personalized guidance throughout your run, helping you maintain the right pace and effort.",
                        style = AppTextStyles.small,
                        color = Colors.textSecondary
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Action Button (Generate Route or Start Run based on mode)
            Button(
                onClick = {
                    val distanceValue = targetDistance.toFloatOrNull() ?: 5.0f
                    val hours = if (hasTargetTime) targetHours.toIntOrNull() ?: 0 else 0
                    val minutes = if (hasTargetTime) targetMinutes.toIntOrNull() ?: 0 else 0
                    val seconds = if (hasTargetTime) targetSeconds.toIntOrNull() ?: 0 else 0
                    
                    if (mode == "route") {
                        // Navigate to route generation
                        onGenerateRoute(distanceValue, hasTargetTime, hours, minutes, seconds)
                    } else {
                        // Start run without route
                        val config = RunSetupConfig(
                            activityType = PhysicalActivityType.RUN,
                            targetDistance = distanceValue,
                            hasTargetTime = hasTargetTime,
                            targetHours = hours,
                            targetMinutes = minutes,
                            targetSeconds = seconds,
                            liveTrackingEnabled = false,
                            liveTrackingObservers = emptyList(),
                            isGroupRun = false,
                            groupRunParticipants = emptyList()
                        )
                        onStartRun(config)
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                enabled = targetDistance.toFloatOrNull()?.let { it > 0 } == true
            ) {
                Text(
                    text = if (mode == "route") "Generate Route" else "Start Run",
                    style = AppTextStyles.body,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            }

            // Summary Text
            val distanceValue = targetDistance.toFloatOrNull() ?: 0f
            if (distanceValue > 0) {
                Text(
                    text = buildString {
                        append("Starting ${String.format("%.1f", distanceValue)} km run")
                        if (hasTargetTime) {
                            val hours = targetHours.toIntOrNull() ?: 0
                            val minutes = targetMinutes.toIntOrNull() ?: 0
                            val seconds = targetSeconds.toIntOrNull() ?: 0
                            if (hours > 0 || minutes > 0 || seconds > 0) {
                                append(" with ")
                                val parts = mutableListOf<String>()
                                if (hours > 0) parts.add("${hours}h")
                                if (minutes > 0) parts.add("${minutes}m")
                                if (seconds > 0) parts.add("${seconds}s")
                                append(parts.joinToString(" "))
                                append(" target time")
                            }
                        }
                    },
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm)
                )
            }
        }
    }
}
