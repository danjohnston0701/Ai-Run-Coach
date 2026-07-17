package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.ProfileViewModel

private val BILATERAL_BODY_PARTS = setOf(
    "Knee", "Ankle", "Hip", "Shoulder", "Elbow", "Wrist", "Foot", "Leg", "Arm",
    "Hamstring", "Quad", "Calf", "IT Band", "Achilles", "Plantar Fascia"
)

private val BODY_PARTS = listOf(
    "Knee", "Ankle", "Shin", "Hip", "Back", "Neck / Cervical Spine",
    "Foot", "Calf", "Hamstring", "Quad", "Groin", "Shoulder",
    "Wrist", "IT Band", "Achilles", "Plantar Fascia", "Other"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InjuryOnboardingScreen(
    onNavigateBack: () -> Unit = {},
    onNavigateToFitnessLevel: () -> Unit = {},
    viewModel: ProfileViewModel = hiltViewModel()
) {
    var showAddInjuryDialog by remember { mutableStateOf(false) }
    var injuryList by remember { mutableStateOf<List<Injury>>(emptyList()) }
    
    LaunchedEffect(Unit) {
        // Load existing injuries if any
        val user = viewModel.user.value
        injuryList = user?.injuries ?: emptyList()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "Health & Injuries",
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    ) 
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot)
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding(),
                color = Colors.backgroundRoot,
                shadowElevation = 8.dp
            ) {
                Button(
                    onClick = onNavigateToFitnessLevel,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.lg, vertical = Spacing.md)
                        .height(50.dp),
                    shape = RoundedCornerShape(BorderRadius.lg),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                ) {
                    Text("Continue", style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Spacing.lg),
            contentPadding = PaddingValues(bottom = Spacing.xl)
        ) {
            item {
                Text(
                    "Do you have any injuries or medical conditions your AI Coach needs to be aware of?",
                    style = AppTextStyles.body,
                    color = Colors.textSecondary
                )
                Spacer(modifier = Modifier.height(Spacing.lg))
            }

            if (injuryList.isEmpty()) {
                item {
                    Button(
                        onClick = { showAddInjuryDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                    ) {
                        Icon(
                            Icons.Filled.Add,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text("Add Injury or Condition", color = Colors.buttonText)
                    }
                    Spacer(modifier = Modifier.height(Spacing.xl))
                }
            } else {
                items(injuryList.size) { index ->
                    InjuryOnboardingCard(
                        injury = injuryList[index],
                        onDelete = {
                            injuryList = injuryList.filterIndexed { i, _ -> i != index }
                        }
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                }

                item {
                    Button(
                        onClick = { showAddInjuryDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
                    ) {
                        Icon(
                            Icons.Filled.Add,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(Spacing.sm))
                        Text("Add Another", color = Colors.buttonText)
                    }
                    Spacer(modifier = Modifier.height(Spacing.xl))
                }
            }
        }
    }

    if (showAddInjuryDialog) {
        InjuryOnboardingDialog(
            onDismiss = { showAddInjuryDialog = false },
            onSave = { newInjury ->
                injuryList = injuryList + newInjury
                showAddInjuryDialog = false
                // Persist injury to backend via ViewModel
                viewModel.addInjury(newInjury)
            }
        )
    }
}

@Composable
private fun InjuryOnboardingCard(
    injury: Injury,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Colors.border, RoundedCornerShape(12.dp)),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = injury.bodyPart,
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    if (injury.injurySide != null) {
                        Text(
                            text = injury.injurySide,
                            style = AppTextStyles.small,
                            color = Colors.textSecondary
                        )
                    }
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        StatusBadge(injury.status.name)
                        SeverityBadge(injury.severity.name)
                    }
                    if (!injury.notes.isNullOrEmpty()) {
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            text = injury.notes,
                            style = AppTextStyles.small,
                            color = Colors.textSecondary
                        )
                    }
                }
                IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Colors.warning, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(status: String) {
    Box(
        modifier = Modifier
            .background(Colors.primary.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            text = status,
            style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
            color = Colors.primary
        )
    }
}

@Composable
private fun SeverityBadge(severity: String) {
    val color = when (severity) {
        "MILD" -> Color(0xFF4CAF50)
        "MODERATE" -> Color(0xFFFFB300)
        "SEVERE" -> Color(0xFFFF6B6B)
        else -> Colors.textMuted
    }
    Box(
        modifier = Modifier
            .background(color.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            text = severity,
            style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
            color = color
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InjuryOnboardingDialog(
    onDismiss: () -> Unit,
    onSave: (Injury) -> Unit
) {
    var selectedBodyPart by remember { mutableStateOf("") }
    var selectedSide by remember { mutableStateOf("") }
    var selectedStatus by remember { mutableStateOf(InjuryStatus.RECOVERING) }
    var selectedSeverity by remember { mutableStateOf(InjurySeverity.MODERATE) }
    var injuryDate by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var recoveryWeeks by remember { mutableStateOf("") }

    val isBilateral = selectedBodyPart in BILATERAL_BODY_PARTS

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Injury or Condition", style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary) },
        containerColor = Colors.backgroundSecondary,
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                // Body Part Selection
                item {
                    Text("Body Part", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    var showBodyPartMenu by remember { mutableStateOf(false) }
                    Box {
                        OutlinedButton(
                            onClick = { showBodyPartMenu = true },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.textPrimary)
                        ) {
                            Text(selectedBodyPart.ifEmpty { "Select body part" }, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Start)
                        }
                        DropdownMenu(expanded = showBodyPartMenu, onDismissRequest = { showBodyPartMenu = false }) {
                            BODY_PARTS.forEach { part ->
                                DropdownMenuItem(
                                    text = { Text(part, color = Colors.textPrimary) },
                                    onClick = {
                                        selectedBodyPart = part
                                        selectedSide = ""
                                        showBodyPartMenu = false
                                    }
                                )
                            }
                        }
                    }
                }

                // Side Selection (if bilateral)
                if (isBilateral) {
                    item {
                        Text("Side", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            listOf("Left", "Right").forEach { side ->
                                Button(
                                    onClick = { selectedSide = side },
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(40.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = if (selectedSide == side) Colors.primary else Colors.backgroundRoot
                                    ),
                                    border = if (selectedSide == side) null else androidx.compose.foundation.BorderStroke(1.dp, Colors.border)
                                ) {
                                    Text(side, color = if (selectedSide == side) Colors.buttonText else Colors.textPrimary)
                                }
                            }
                        }
                    }
                }

                // Status Selection
                item {
                    Text("Status", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        InjuryStatus.entries.forEach { status ->
                            Button(
                                onClick = { selectedStatus = status },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(44.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (selectedStatus == status) Colors.primary else Colors.backgroundRoot
                                ),
                                border = if (selectedStatus == status) null else androidx.compose.foundation.BorderStroke(1.dp, Colors.border),
                                shape = RoundedCornerShape(BorderRadius.md)
                            ) {
                                Text(status.name, color = if (selectedStatus == status) Colors.buttonText else Colors.textPrimary, style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold))
                            }
                        }
                    }
                }

                // Severity Selection
                item {
                    Text("Severity", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        InjurySeverity.entries.forEach { severity ->
                            Button(
                                onClick = { selectedSeverity = severity },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(44.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (selectedSeverity == severity) Colors.primary else Colors.backgroundRoot
                                ),
                                border = if (selectedSeverity == severity) null else androidx.compose.foundation.BorderStroke(1.dp, Colors.border),
                                shape = RoundedCornerShape(BorderRadius.md)
                            ) {
                                Text(severity.name, color = if (selectedSeverity == severity) Colors.buttonText else Colors.textPrimary, style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold))
                            }
                        }
                    }
                }

                // Date of Injury (optional)
                item {
                    Text("Date of Injury (optional)", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    OutlinedTextField(
                        value = injuryDate,
                        onValueChange = { injuryDate = it },
                        label = { Text("yyyy-mm-dd") },
                        placeholder = { Text("2026-07-17") },
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Colors.textPrimary,
                            unfocusedTextColor = Colors.textPrimary,
                            focusedBorderColor = Colors.primary,
                            unfocusedBorderColor = Colors.textMuted
                        )
                    )
                }

                // Notes
                item {
                    Text("Notes (optional)", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("Describe your injury") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 80.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Colors.textPrimary,
                            unfocusedTextColor = Colors.textPrimary,
                            focusedBorderColor = Colors.primary,
                            unfocusedBorderColor = Colors.textMuted
                        )
                    )
                }

                // Recovery Weeks (for RECOVERING status)
                if (selectedStatus == InjuryStatus.RECOVERING) {
                    item {
                        Text("Estimated Recovery Weeks", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                        OutlinedTextField(
                            value = recoveryWeeks,
                            onValueChange = { recoveryWeeks = it },
                            label = { Text("e.g., 4") },
                            modifier = Modifier.fillMaxWidth(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Colors.textPrimary,
                                unfocusedTextColor = Colors.textPrimary,
                                focusedBorderColor = Colors.primary,
                                unfocusedBorderColor = Colors.textMuted
                            )
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (selectedBodyPart.isNotEmpty()) {
                        val injury = Injury(
                            bodyPart = selectedBodyPart,
                            injurySide = if (isBilateral && selectedSide.isNotEmpty()) selectedSide else null,
                            status = selectedStatus,
                            severity = selectedSeverity,
                            injuryDate = injuryDate.ifBlank { null },
                            notes = notes.ifEmpty { null },
                            estimatedRecoveryWeeks = if (recoveryWeeks.isNotEmpty()) recoveryWeeks.toIntOrNull() else null
                        )
                        onSave(injury)
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)
            ) {
                Text("Save", color = Colors.buttonText)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Colors.primary)
            }
        }
    )
}
