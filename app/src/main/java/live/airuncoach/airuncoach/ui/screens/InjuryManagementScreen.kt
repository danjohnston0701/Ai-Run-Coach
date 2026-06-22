package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.ProfileViewModel
import java.text.SimpleDateFormat
import java.util.*

/**
 * Comprehensive injury management screen where users can:
 * - View all injuries organized by status
 * - Add new injuries with detailed information
 * - Update injury status as they recover
 * - Track recovery progress
 * - Delete healed injuries
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InjuryManagementScreen(
    onNavigateBack: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val user by viewModel.user.collectAsState()
    var showAddInjuryDialog by remember { mutableStateOf(false) }
    var editingInjury by remember { mutableStateOf<Injury?>(null) }

    val allInjuries: List<Injury> = user?.injuries ?: emptyList()

    Column(modifier = Modifier.fillMaxSize()) {
        // Header matching Personal Details and My Data style
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.md)
                .padding(top = Spacing.sm),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onNavigateBack, modifier = Modifier.size(40.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
            }
            Text(
                "Health & Injuries",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = Spacing.md)
            )
        }

        HorizontalDivider(modifier = Modifier.padding(horizontal = Spacing.lg))

        // Content
        Box(modifier = Modifier.fillMaxSize()) {
            if (allInjuries.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(Spacing.lg)
                ) {
                    Icon(
                        Icons.Filled.Add,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = Color.Gray
                    )
                    Text(
                        "No injuries recorded",
                        style = MaterialTheme.typography.headlineSmall,
                        modifier = Modifier.padding(top = Spacing.md)
                    )
                    Button(
                        onClick = { showAddInjuryDialog = true },
                        modifier = Modifier.padding(top = Spacing.lg)
                    ) {
                        Icon(Icons.Filled.Add, "Add", modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Add Injury or Condition")
                    }
                }
            }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(Spacing.lg)
                ) {
                items(allInjuries) { injury ->
                    InjuryCard(
                        injury = injury,
                        // Only RECOVERING injuries can be marked healed — CHRONIC ones are managed differently
                        onMarkHealed = if (injury.status == InjuryStatus.RECOVERING) ({
                            val updated = injury.copy(
                                status = InjuryStatus.HEALED,
                                recoveryDate = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()),
                                updatedAt = System.currentTimeMillis()
                            )
                            viewModel.updateInjury(updated)
                        }) else null,
                        onEdit = { editingInjury = injury },
                        onDelete = { injury.id?.let { viewModel.deleteInjury(it) } }
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
                    }
                }
            }
        }
    }

    if (showAddInjuryDialog || editingInjury != null) {
        AddEditInjuryDialog(
            injury = editingInjury,
            onDismiss = {
                showAddInjuryDialog = false
                editingInjury = null
            },
            onSave = { injury ->
                if (editingInjury != null) {
                    viewModel.updateInjury(injury.copy(updatedAt = System.currentTimeMillis()))
                } else {
                    viewModel.addInjury(injury)
                }
                showAddInjuryDialog = false
                editingInjury = null
            }
        )
    }
}

@Composable
fun InjuryCard(
    injury: Injury,
    onMarkHealed: (() -> Unit)? = null,
    onEdit: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.sm),
        colors = CardDefaults.cardColors(
            containerColor = when (injury.status) {
                InjuryStatus.RECOVERING -> Color(0xFFFFF3E0)
                InjuryStatus.CHRONIC -> Color(0xFFF3E5F5)
                InjuryStatus.HEALED -> Color(0xFFE8F5E9)
            }
        )
    ) {
        Column(modifier = Modifier.padding(Spacing.md)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "${injury.bodyPart}${if (!injury.injurySide.isNullOrEmpty()) " (${injury.injurySide})" else ""}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                Surface(
                    color = when (injury.status) {
                        InjuryStatus.RECOVERING -> Color(0xFFE65100)
                        InjuryStatus.CHRONIC -> Color(0xFF7B1FA2)
                        InjuryStatus.HEALED -> Color(0xFF2E7D32)
                    },
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text(
                        injury.status.name.lowercase().replaceFirstChar { it.uppercase() },
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }
            }

            if (injury.injuryDate != null) {
                Text(
                    "Injured on ${formatDateForDisplay(injury.injuryDate!!)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.Gray,
                    modifier = Modifier.padding(top = Spacing.sm)
                )
            }

            if (injury.estimatedRecoveryWeeks != null && injury.injuryDate != null && injury.status == InjuryStatus.RECOVERING) {
                val weeksAgo = calculateWeeksSince(injury.injuryDate!!)
                val progress = (weeksAgo.toFloat() / injury.estimatedRecoveryWeeks!!).coerceAtMost(1f)
                Text(
                    "Recovery: ${(progress * 100).toInt()}%",
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(top = Spacing.sm)
                )
            }

            if (!injury.notes.isNullOrEmpty()) {
                Text(
                    injury.notes!!,
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.DarkGray,
                    modifier = Modifier.padding(top = Spacing.sm)
                )
            }

            if (injury.isProstheticOrAFO && injury.prostheticType != null) {
                Text(
                    "Device: ${injury.prostheticType}",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF1976D2),
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = Spacing.sm)
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.md),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                if (onMarkHealed != null && injury.status != InjuryStatus.HEALED) {
                    Button(
                        onClick = onMarkHealed,
                        modifier = Modifier
                            .weight(1f)
                            .height(40.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50))
                    ) {
                        Text("Mark Healed", fontSize = 12.sp)
                    }
                }

                if (onEdit != null && injury.status != InjuryStatus.HEALED) {
                    OutlinedButton(
                        onClick = onEdit,
                        modifier = Modifier
                            .weight(1f)
                            .height(40.dp)
                    ) {
                        Text("Edit", fontSize = 12.sp)
                    }
                }

                if (onDelete != null) {
                    IconButton(
                        onClick = onDelete,
                        modifier = Modifier.size(40.dp)
                    ) {
                        Icon(Icons.Filled.Delete, "Delete", tint = Color.Red, modifier = Modifier.size(20.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun AddEditInjuryDialog(
    injury: Injury? = null,
    onDismiss: () -> Unit,
    onSave: (Injury) -> Unit
) {
    var bodyPart by remember { mutableStateOf(injury?.bodyPart ?: "") }
    var injurySide by remember { mutableStateOf(injury?.injurySide ?: "") }
    var status by remember { mutableStateOf(injury?.status ?: InjuryStatus.RECOVERING) }
    var severity by remember { mutableStateOf(injury?.severity ?: InjurySeverity.MODERATE) }
    var notes by remember { mutableStateOf(injury?.notes ?: "") }
    var injuryDate by remember { mutableStateOf(injury?.injuryDate ?: "") }
    var estimatedRecoveryWeeks by remember { mutableStateOf(injury?.estimatedRecoveryWeeks?.toString() ?: "") }
    var isProsthetic by remember { mutableStateOf(injury?.isProstheticOrAFO ?: false) }
    var prostheticType by remember { mutableStateOf(injury?.prostheticType ?: "") }
    var bodyPartFilteredSuggestions by remember { mutableStateOf<List<String>>(emptyList()) }

    // Body parts that support left/right side
    val bilateralBodyParts = setOf("Knee", "Ankle", "Hip", "Shoulder", "Elbow", "Wrist", "Foot", "Leg", "Arm")
    val shouldShowSideSelector = bilateralBodyParts.contains(bodyPart)

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .padding(Spacing.lg)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(Spacing.lg)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    if (injury == null) "Add Injury or Condition" else "Edit Injury",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = Spacing.md)
                )

                // Body Part with autocomplete
                Text("Body Part", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                Box(modifier = Modifier.padding(top = Spacing.sm)) {
                    OutlinedTextField(
                        value = bodyPart,
                        onValueChange = { newValue ->
                            bodyPart = newValue
                            // Filter suggestions based on input
                            bodyPartFilteredSuggestions = if (newValue.isNotEmpty()) {
                                BODY_PARTS.filter { it.lowercase().contains(newValue.lowercase()) }
                            } else {
                                emptyList()
                            }
                            // Reset side when body part changes
                            if (!shouldShowSideSelector) injurySide = ""
                        },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Type or select (e.g., 'kn' for Knee)") },
                        singleLine = true
                    )
                    if (bodyPartFilteredSuggestions.isNotEmpty()) {
                        DropdownMenu(
                            expanded = true,
                            onDismissRequest = { bodyPartFilteredSuggestions = emptyList() },
                            modifier = Modifier.fillMaxWidth(0.9f)
                        ) {
                            bodyPartFilteredSuggestions.take(5).forEach { part ->
                                DropdownMenuItem(
                                    text = { Text(part) },
                                    onClick = {
                                        bodyPart = part
                                        bodyPartFilteredSuggestions = emptyList()
                                    }
                                )
                            }
                            if (bodyPartFilteredSuggestions.size > 5) {
                                DropdownMenuItem(
                                    text = { Text("Custom: \"${bodyPart}\"") },
                                    onClick = { bodyPartFilteredSuggestions = emptyList() }
                                )
                            }
                        }
                    }
                }

                // Side selector (only for bilateral body parts)
                if (shouldShowSideSelector) {
                    Text("Side", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = Spacing.md))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        listOf("Left", "Right").forEach { side ->
                            FilterChip(
                                selected = injurySide == side,
                                onClick = { injurySide = side },
                                label = { Text(side) }
                            )
                        }
                    }
                }

                // Status
                Text(
                    "Status",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = Spacing.md)
                )
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    InjuryStatus.entries.forEach { s ->
                        FilterChip(
                            selected = status == s,
                            onClick = { status = s },
                            label = { Text(s.name.lowercase().replaceFirstChar { it.uppercase() }, maxLines = 1) },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }

                // Severity
                Text(
                    "Severity",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = Spacing.md)
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    InjurySeverity.entries.forEach { s ->
                        FilterChip(
                            selected = severity == s,
                            onClick = { severity = s },
                            label = { Text(s.name.lowercase().replaceFirstChar { it.uppercase() }) }
                        )
                    }
                }

                // Injury Date
                Text(
                    "Injury Date",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = Spacing.md)
                )
                OutlinedTextField(
                    value = injuryDate,
                    onValueChange = { injuryDate = it },
                    label = { Text("DD-MM-YYYY") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                    singleLine = true
                )

                // Expected Recovery (only for RECOVERING status)
                if (status == InjuryStatus.RECOVERING) {
                    Text(
                        "Expected Recovery (weeks)",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = Spacing.md)
                    )
                    OutlinedTextField(
                        value = estimatedRecoveryWeeks,
                        onValueChange = { if (it.isEmpty() || it.toIntOrNull() != null) estimatedRecoveryWeeks = it },
                        label = { Text("e.g., 6") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.sm),
                        singleLine = true
                    )
                }

                // Notes
                Text(
                    "Describe your injury/condition",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = Spacing.md)
                )
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Details...") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.sm),
                    minLines = 3
                )

                // Prosthetic/AFO
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.md),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = isProsthetic, onCheckedChange = { isProsthetic = it })
                    Text("Uses prosthetic/AFO", style = MaterialTheme.typography.labelSmall)
                }

                if (isProsthetic) {
                    Box(modifier = Modifier.padding(top = Spacing.sm)) {
                        OutlinedTextField(
                            value = prostheticType,
                            onValueChange = { prostheticType = it },
                            label = { Text("Device type") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                    }
                }

                // Buttons
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.lg),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    TextButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Cancel")
                    }
                    Button(
                        onClick = {
                            if (bodyPart.isNotEmpty()) {
                                // Convert date from DD-MM-YYYY to YYYY-MM-DD for storage
                                val storageDateFormat = if (injuryDate.isNotEmpty()) {
                                    try {
                                        val parts = injuryDate.split("-")
                                        if (parts.size == 3) {
                                            // Assume DD-MM-YYYY format from user
                                            "${parts[2]}-${parts[1]}-${parts[0]}"
                                        } else {
                                            injuryDate
                                        }
                                    } catch (e: Exception) {
                                        injuryDate
                                    }
                                } else {
                                    null
                                }

                                val newInjury = Injury(
                                    id = injury?.id,
                                    bodyPart = bodyPart,
                                    injurySide = if (shouldShowSideSelector) injurySide else null,
                                    status = status,
                                    severity = severity,
                                    notes = notes.ifEmpty { null },
                                    injuryDate = storageDateFormat?.ifEmpty { null },
                                    estimatedRecoveryWeeks = estimatedRecoveryWeeks.toIntOrNull(),
                                    isProstheticOrAFO = isProsthetic,
                                    prostheticType = if (isProsthetic) prostheticType.ifEmpty { null } else null,
                                    createdAt = injury?.createdAt ?: System.currentTimeMillis()
                                )
                                onSave(newInjury)
                            }
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(if (injury == null) "Add" else "Update")
                    }
                }
            }
        }
    }
}

private fun calculateWeeksSince(dateString: String): Int {
    return try {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val date = dateFormat.parse(dateString) ?: return 0
        val weeks = (System.currentTimeMillis() - date.time) / (7 * 24 * 60 * 60 * 1000)
        weeks.toInt()
    } catch (e: Exception) {
        0
    }
}

private fun formatDateForDisplay(dateString: String): String {
    return try {
        val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val outputFormat = SimpleDateFormat("dd-MM-yyyy", Locale.getDefault())
        val date = inputFormat.parse(dateString) ?: return dateString
        outputFormat.format(date)
    } catch (e: Exception) {
        dateString
    }
}
