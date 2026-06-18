package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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

    @Suppress("UNCHECKED_CAST", "KotlinConstantConditions")
    val allInjuries: List<Injury> = try {
        (user?.injuryHistory as? List<Injury>) ?: emptyList()
    } catch (e: Exception) {
        emptyList()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Health & Injuries") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showAddInjuryDialog = true }) {
                        Icon(Icons.Filled.Add, "Add injury")
                    }
                }
            )
        }
    ) { padding ->
        if (allInjuries.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("No injuries recorded", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Tap + to add injuries",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.Gray,
                        modifier = Modifier.padding(top = Spacing.md)
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(Spacing.lg)
            ) {
                items(allInjuries) { injury ->
                    InjuryCard(
                        injury = injury,
                        onMarkHealed = {
                            injury.id?.let {
                                val updated = injury.copy(
                                    status = InjuryStatus.HEALED,
                                    recoveryDate = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()),
                                    updatedAt = System.currentTimeMillis()
                                )
                                viewModel.updateInjury(updated)
                            }
                        },
                        onEdit = { editingInjury = injury },
                        onDelete = { injury.id?.let { viewModel.deleteInjury(it) } }
                    )
                    Spacer(modifier = Modifier.height(Spacing.md))
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
                else -> Color.White
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
                    injury.bodyPart,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                Surface(
                    color = when (injury.status) {
                        InjuryStatus.RECOVERING -> Color(0xFFE65100)
                        InjuryStatus.CHRONIC -> Color(0xFF7B1FA2)
                        InjuryStatus.HEALED -> Color(0xFF2E7D32)
                        else -> Color.Gray
                    },
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        injury.status.name.lowercase().replaceFirstChar { it.uppercase() },
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            if (injury.injuryDate != null) {
                Text(
                    "Injured on ${injury.injuryDate}",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.Gray,
                    modifier = Modifier.padding(top = Spacing.sm)
                )
            }

            if (injury.estimatedRecoveryWeeks != null && injury.injuryDate != null) {
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
    var status by remember { mutableStateOf(injury?.status ?: InjuryStatus.RECOVERING) }
    var severity by remember { mutableStateOf(injury?.severity ?: InjurySeverity.MODERATE) }
    var notes by remember { mutableStateOf(injury?.notes ?: "") }
    var injuryDate by remember { mutableStateOf(injury?.injuryDate ?: "") }
    var estimatedRecoveryWeeks by remember { mutableStateOf(injury?.estimatedRecoveryWeeks?.toString() ?: "") }
    var isProsthetic by remember { mutableStateOf(injury?.isProstheticOrAFO ?: false) }
    var prostheticType by remember { mutableStateOf(injury?.prostheticType ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (injury == null) "Add Injury" else "Edit Injury") },
        text = {
            LazyColumn(modifier = Modifier.fillMaxWidth()) {
                item {
                    Text("Body Part", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    OutlinedTextField(
                        value = bodyPart,
                        onValueChange = { bodyPart = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.sm),
                        placeholder = { Text("e.g., Knee, Ankle") }
                    )
                }

                item {
                    Text(
                        "Status",
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
                        InjuryStatus.entries.forEach { s ->
                            FilterChip(
                                selected = status == s,
                                onClick = { status = s },
                                label = { Text(s.name.lowercase().replaceFirstChar { it.uppercase() }) }
                            )
                        }
                    }
                }

                item {
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
                }

                item {
                    Text(
                        "Injury Date",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = Spacing.md)
                    )
                    OutlinedTextField(
                        value = injuryDate,
                        onValueChange = { injuryDate = it },
                        label = { Text("YYYY-MM-DD") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Spacing.sm),
                        singleLine = true
                    )
                }

                item {
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

                item {
                    Text(
                        "Notes",
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
                }

                item {
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
                        OutlinedTextField(
                            value = prostheticType,
                            onValueChange = { prostheticType = it },
                            label = { Text("e.g., Carbon fiber AFO") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = Spacing.sm)
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (bodyPart.isNotEmpty()) {
                        val newInjury = Injury(
                            id = injury?.id,
                            bodyPart = bodyPart,
                            status = status,
                            severity = severity,
                            notes = notes.ifEmpty { null },
                            injuryDate = injuryDate.ifEmpty { null },
                            estimatedRecoveryWeeks = estimatedRecoveryWeeks.toIntOrNull(),
                            isProstheticOrAFO = isProsthetic,
                            prostheticType = if (isProsthetic) prostheticType else null,
                            createdAt = injury?.createdAt ?: System.currentTimeMillis()
                        )
                        onSave(newInjury)
                    }
                }
            ) {
                Text(if (injury == null) "Add" else "Update")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
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
