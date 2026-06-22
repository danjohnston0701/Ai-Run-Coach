package live.airuncoach.airuncoach.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.ProfileViewModel
import java.text.SimpleDateFormat
import java.util.*

// Body parts that have a left/right side
private val BILATERAL_BODY_PARTS = setOf(
    "Knee", "Ankle", "Hip", "Shoulder", "Elbow", "Wrist", "Foot", "Leg", "Arm",
    "Hamstring", "Quad", "Calf", "IT Band", "Achilles", "Plantar Fascia"
)

@Composable
fun InjuryManagementScreen(
    onNavigateBack: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val user by viewModel.user.collectAsState()
    var showAddInjuryDialog by remember { mutableStateOf(false) }
    var editingInjury by remember { mutableStateOf<Injury?>(null) }

    val allInjuries: List<Injury> = user?.injuries ?: emptyList()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {

            // ── Header ──────────────────────────────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.lg, vertical = Spacing.md)
                    .padding(top = Spacing.sm),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onNavigateBack, modifier = Modifier.size(40.dp)) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Colors.textPrimary
                    )
                }
                Text(
                    "Health & Injuries",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Colors.textPrimary,
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = Spacing.md)
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = Spacing.lg),
                color = Colors.border
            )

            // ── Content ────────────────────────────────────��────────────────────
            if (allInjuries.isEmpty()) {
                // Empty state
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(Spacing.xl)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(72.dp)
                                .clip(CircleShape)
                                .background(Colors.backgroundSecondary),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Filled.Favorite,
                                contentDescription = null,
                                modifier = Modifier.size(36.dp),
                                tint = Colors.primary
                            )
                        }
                        Spacer(modifier = Modifier.height(Spacing.lg))
                        Text(
                            "No injuries recorded",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = Colors.textPrimary
                        )
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            "Track injuries and conditions so your AI coach\ncan personalise your training plan.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Colors.textSecondary,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(Spacing.xl))
                        Button(
                            onClick = { showAddInjuryDialog = true },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Colors.primary,
                                contentColor = Colors.buttonText
                            ),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth(0.7f)
                                .height(52.dp)
                        ) {
                            Icon(
                                Icons.Filled.Add,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text(
                                "Add Injury or Condition",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 15.sp
                            )
                        }
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(Spacing.lg),
                    verticalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    items(allInjuries) { injury ->
                        InjuryCard(
                            injury = injury,
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
                    }

                    // Add another button at the bottom
                    item {
                        OutlinedButton(
                            onClick = { showAddInjuryDialog = true },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Colors.primary),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary)
                        ) {
                            Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Text("Add Another Injury or Condition", fontWeight = FontWeight.Medium)
                        }
                        Spacer(modifier = Modifier.height(Spacing.lg))
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

// ── Injury Card ────────────────────────────────────────────────────────────────

@Composable
fun InjuryCard(
    injury: Injury,
    onMarkHealed: (() -> Unit)? = null,
    onEdit: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null
) {
    val statusColor = when (injury.status) {
        InjuryStatus.RECOVERING -> Color(0xFFFFB300) // amber
        InjuryStatus.CHRONIC    -> Color(0xFFAB47BC) // purple
        InjuryStatus.HEALED     -> Colors.success
    }
    val statusLabel = when (injury.status) {
        InjuryStatus.RECOVERING -> "Recovering"
        InjuryStatus.CHRONIC    -> "Chronic"
        InjuryStatus.HEALED     -> "Healed"
    }
    val severityIcon: ImageVector = when (injury.severity) {
        InjurySeverity.MILD     -> Icons.Filled.CheckCircle
        InjurySeverity.MODERATE -> Icons.Filled.Warning
        InjurySeverity.SEVERE   -> Icons.Filled.Error
    }
    val severityColor = when (injury.severity) {
        InjurySeverity.MILD     -> Colors.success
        InjurySeverity.MODERATE -> Colors.warning
        InjurySeverity.SEVERE   -> Colors.error
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {

            // Title row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Coloured left accent bar
                Box(
                    modifier = Modifier
                        .width(4.dp)
                        .height(40.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(statusColor)
                )
                Spacer(modifier = Modifier.width(Spacing.md))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = buildString {
                            append(injury.bodyPart)
                            if (!injury.injurySide.isNullOrEmpty()) append(" · ${injury.injurySide}")
                        },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textPrimary
                    )
                    if (injury.injuryDate != null) {
                        Text(
                            "Since ${formatDateForDisplay(injury.injuryDate!!)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = Colors.textMuted
                        )
                    }
                }
                // Status badge
                Surface(
                    color = statusColor.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Text(
                        statusLabel,
                        color = statusColor,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(Spacing.md))
            HorizontalDivider(color = Colors.border)
            Spacer(modifier = Modifier.height(Spacing.md))

            // Severity + recovery row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.lg)
            ) {
                // Severity chip
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(severityIcon, null, tint = severityColor, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        injury.severity.name.lowercase().replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelSmall,
                        color = severityColor,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                // Recovery progress (only for recovering)
                if (injury.status == InjuryStatus.RECOVERING &&
                    injury.estimatedRecoveryWeeks != null &&
                    injury.injuryDate != null
                ) {
                    val weeksAgo = calculateWeeksSince(injury.injuryDate!!)
                    val progress = (weeksAgo.toFloat() / injury.estimatedRecoveryWeeks!!).coerceAtMost(1f)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.Timeline,
                            null,
                            tint = Colors.primary,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            "Recovery ${(progress * 100).toInt()}%",
                            style = MaterialTheme.typography.labelSmall,
                            color = Colors.primary,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            // Notes
            if (!injury.notes.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(Spacing.sm))
                Text(
                    injury.notes!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = Colors.textSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Prosthetic
            if (injury.isProstheticOrAFO && injury.prostheticType != null) {
                Spacer(modifier = Modifier.height(Spacing.sm))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.Accessibility,
                        null,
                        tint = Colors.primary,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        injury.prostheticType!!,
                        style = MaterialTheme.typography.labelSmall,
                        color = Colors.primary
                    )
                }
            }

            // Actions
            if (injury.status != InjuryStatus.HEALED || onDelete != null) {
                Spacer(modifier = Modifier.height(Spacing.md))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    if (onMarkHealed != null) {
                        Button(
                            onClick = onMarkHealed,
                            modifier = Modifier.weight(1f).height(38.dp),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Colors.success.copy(alpha = 0.15f),
                                contentColor = Colors.success
                            )
                        ) {
                            Icon(Icons.Filled.Check, null, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Mark Healed", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    if (onEdit != null && injury.status != InjuryStatus.HEALED) {
                        OutlinedButton(
                            onClick = onEdit,
                            modifier = Modifier.weight(1f).height(38.dp),
                            shape = RoundedCornerShape(8.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Colors.border),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.textSecondary)
                        ) {
                            Icon(Icons.Filled.Edit, null, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Edit", fontSize = 12.sp)
                        }
                    }
                    if (onDelete != null) {
                        IconButton(
                            onClick = onDelete,
                            modifier = Modifier
                                .size(38.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Colors.error.copy(alpha = 0.10f))
                        ) {
                            Icon(
                                Icons.Filled.Delete,
                                contentDescription = "Delete",
                                tint = Colors.error,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Add / Edit Sheet ──────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
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
    var injuryDate by remember { mutableStateOf(
        if (injury?.injuryDate != null) formatDateForDisplay(injury.injuryDate!!) else ""
    ) }
    var estimatedRecoveryWeeks by remember { mutableStateOf(injury?.estimatedRecoveryWeeks?.toString() ?: "") }
    var isProsthetic by remember { mutableStateOf(injury?.isProstheticOrAFO ?: false) }
    var prostheticType by remember { mutableStateOf(injury?.prostheticType ?: "") }
    var bodyPartSuggestions by remember { mutableStateOf<List<String>>(emptyList()) }
    var bodyPartError by remember { mutableStateOf(false) }

    val shouldShowSideSelector = BILATERAL_BODY_PARTS.contains(bodyPart)

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .clip(RoundedCornerShape(20.dp))
                .background(Colors.backgroundSecondary)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(Spacing.lg)
            ) {

                // ── Sheet header ────────────────────────────────────────────────
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            if (injury == null) "Log Injury or Condition" else "Edit Injury",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = Colors.textPrimary
                        )
                        Text(
                            "Help your AI coach protect your training",
                            style = MaterialTheme.typography.bodySmall,
                            color = Colors.textSecondary
                        )
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Filled.Close, "Close", tint = Colors.textMuted)
                    }
                }

                Spacer(modifier = Modifier.height(Spacing.lg))
                HorizontalDivider(color = Colors.border)
                Spacer(modifier = Modifier.height(Spacing.lg))

                // ── Body Part ────────────────────────────────────────────────────
                FormSectionLabel("Body Part")
                Box(modifier = Modifier.padding(top = Spacing.sm)) {
                    OutlinedTextField(
                        value = bodyPart,
                        onValueChange = { v ->
                            bodyPart = v
                            bodyPartError = false
                            bodyPartSuggestions = if (v.isNotEmpty())
                                BODY_PARTS.filter { it.lowercase().contains(v.lowercase()) }
                            else emptyList()
                            if (!shouldShowSideSelector) injurySide = ""
                        },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("e.g. Knee, Ankle, Back…", color = Colors.textMuted) },
                        singleLine = true,
                        isError = bodyPartError,
                        supportingText = if (bodyPartError) {
                            { Text("Please enter a body part", color = Colors.error) }
                        } else null,
                        colors = outlinedFieldColors(),
                        shape = RoundedCornerShape(10.dp)
                    )
                    if (bodyPartSuggestions.isNotEmpty()) {
                        DropdownMenu(
                            expanded = true,
                            onDismissRequest = { bodyPartSuggestions = emptyList() },
                            modifier = Modifier
                                .fillMaxWidth(0.88f)
                                .background(Colors.backgroundTertiary)
                        ) {
                            bodyPartSuggestions.take(6).forEach { part ->
                                DropdownMenuItem(
                                    text = { Text(part, color = Colors.textPrimary) },
                                    onClick = {
                                        bodyPart = part
                                        bodyPartSuggestions = emptyList()
                                    }
                                )
                            }
                        }
                    }
                }

                // ── Side selector ────────────────────────────────────────────────
                AnimatedVisibility(
                    visible = shouldShowSideSelector,
                    enter = expandVertically(),
                    exit = shrinkVertically()
                ) {
                    Column {
                        Spacer(modifier = Modifier.height(Spacing.md))
                        FormSectionLabel("Which Side?")
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            listOf("Left", "Right").forEach { side ->
                                val selected = injurySide == side
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(44.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(if (selected) Colors.primary.copy(alpha = 0.15f) else Colors.backgroundTertiary)
                                        .border(
                                            1.dp,
                                            if (selected) Colors.primary else Colors.border,
                                            RoundedCornerShape(10.dp)
                                        )
                                        .clickable { injurySide = side },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        side,
                                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                                        color = if (selected) Colors.primary else Colors.textSecondary,
                                        fontSize = 14.sp
                                    )
                                }
                            }
                        }
                    }
                }

                // ── Status ───────────────────────────────────────────────────────
                Spacer(modifier = Modifier.height(Spacing.lg))
                FormSectionLabel("Status")
                Spacer(modifier = Modifier.height(Spacing.sm))
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    listOf(
                        Triple(InjuryStatus.RECOVERING, "Recovering", "Currently healing — avoiding aggravation"),
                        Triple(InjuryStatus.CHRONIC, "Chronic", "Ongoing condition to manage long-term"),
                        Triple(InjuryStatus.HEALED, "Healed", "Fully recovered, back to normal training")
                    ).forEach { (s, label, desc) ->
                        val selected = status == s
                        val color = when (s) {
                            InjuryStatus.RECOVERING -> Color(0xFFFFB300)
                            InjuryStatus.CHRONIC    -> Color(0xFFAB47BC)
                            InjuryStatus.HEALED     -> Colors.success
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (selected) color.copy(alpha = 0.12f) else Colors.backgroundTertiary)
                                .border(
                                    1.dp,
                                    if (selected) color else Colors.border,
                                    RoundedCornerShape(10.dp)
                                )
                                .clickable { status = s }
                                .padding(horizontal = Spacing.md, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = selected,
                                onClick = { status = s },
                                colors = RadioButtonDefaults.colors(
                                    selectedColor = color,
                                    unselectedColor = Colors.border
                                )
                            )
                            Spacer(modifier = Modifier.width(Spacing.sm))
                            Column {
                                Text(label, fontWeight = FontWeight.SemiBold, color = if (selected) color else Colors.textPrimary, fontSize = 14.sp)
                                Text(desc, style = MaterialTheme.typography.labelSmall, color = Colors.textMuted)
                            }
                        }
                    }
                }

                // ── Severity ─────────────────────────────────────────────────────
                Spacer(modifier = Modifier.height(Spacing.lg))
                FormSectionLabel("Severity")
                Spacer(modifier = Modifier.height(Spacing.sm))
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    listOf(
                        Triple(InjurySeverity.MILD, "Mild", Colors.success),
                        Triple(InjurySeverity.MODERATE, "Moderate", Colors.warning),
                        Triple(InjurySeverity.SEVERE, "Severe", Colors.error)
                    ).forEach { (s, label, color) ->
                        val selected = severity == s
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (selected) color.copy(alpha = 0.15f) else Colors.backgroundTertiary)
                                .border(1.dp, if (selected) color else Colors.border, RoundedCornerShape(10.dp))
                                .clickable { severity = s },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                label,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                                color = if (selected) color else Colors.textSecondary,
                                fontSize = 13.sp
                            )
                        }
                    }
                }

                // ── Date ─────────────────────────────────────────────────────────
                Spacer(modifier = Modifier.height(Spacing.lg))
                FormSectionLabel("Date of Injury (optional)")
                Spacer(modifier = Modifier.height(Spacing.sm))
                OutlinedTextField(
                    value = injuryDate,
                    onValueChange = { injuryDate = it },
                    placeholder = { Text("DD-MM-YYYY", color = Colors.textMuted) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedFieldColors(),
                    shape = RoundedCornerShape(10.dp)
                )

                // ── Expected Recovery (hidden for Chronic) ────────────────────────
                AnimatedVisibility(
                    visible = status == InjuryStatus.RECOVERING,
                    enter = expandVertically(),
                    exit = shrinkVertically()
                ) {
                    Column {
                        Spacer(modifier = Modifier.height(Spacing.lg))
                        FormSectionLabel("Expected Recovery (weeks)")
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        OutlinedTextField(
                            value = estimatedRecoveryWeeks,
                            onValueChange = { if (it.isEmpty() || it.toIntOrNull() != null) estimatedRecoveryWeeks = it },
                            placeholder = { Text("e.g. 6", color = Colors.textMuted) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            colors = outlinedFieldColors(),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                }

                // ── Notes ─────────────────────────────────────────────────────────
                Spacer(modifier = Modifier.height(Spacing.lg))
                FormSectionLabel("Describe your injury or condition")
                Spacer(modifier = Modifier.height(Spacing.sm))
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    placeholder = { Text("What happened? Any restrictions or pain triggers?", color = Colors.textMuted) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 96.dp),
                    minLines = 3,
                    colors = outlinedFieldColors(),
                    shape = RoundedCornerShape(10.dp)
                )

                // ── Prosthetic / AFO ──────────────────────────────────────────────
                Spacer(modifier = Modifier.height(Spacing.lg))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Colors.backgroundTertiary)
                        .clickable { isProsthetic = !isProsthetic }
                        .padding(horizontal = Spacing.md, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Filled.Accessibility, null, tint = Colors.primary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(Spacing.md))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Prosthetic or AFO Device", color = Colors.textPrimary, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                        Text("Includes orthotics, braces, carbon fibre AFOs", color = Colors.textMuted, style = MaterialTheme.typography.labelSmall)
                    }
                    Switch(
                        checked = isProsthetic,
                        onCheckedChange = { isProsthetic = it },
                        colors = SwitchDefaults.colors(checkedThumbColor = Colors.buttonText, checkedTrackColor = Colors.primary)
                    )
                }

                AnimatedVisibility(
                    visible = isProsthetic,
                    enter = expandVertically(),
                    exit = shrinkVertically()
                ) {
                    Column {
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        OutlinedTextField(
                            value = prostheticType,
                            onValueChange = { prostheticType = it },
                            placeholder = { Text("e.g. Carbon fibre AFO, full prosthetic leg…", color = Colors.textMuted) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = outlinedFieldColors(),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                }

                // ── Buttons ───────────────────────────────────────────────────────
                Spacer(modifier = Modifier.height(Spacing.xl))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Colors.border),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.textSecondary)
                    ) {
                        Text("Cancel")
                    }
                    Button(
                        onClick = {
                            if (bodyPart.isEmpty()) {
                                bodyPartError = true
                                return@Button
                            }
                            val storedDate = parseDateToStorage(injuryDate)
                            onSave(
                                Injury(
                                    id = injury?.id,
                                    bodyPart = bodyPart,
                                    injurySide = if (shouldShowSideSelector && injurySide.isNotEmpty()) injurySide else null,
                                    status = status,
                                    severity = severity,
                                    notes = notes.ifEmpty { null },
                                    injuryDate = storedDate,
                                    estimatedRecoveryWeeks = estimatedRecoveryWeeks.toIntOrNull(),
                                    isProstheticOrAFO = isProsthetic,
                                    prostheticType = if (isProsthetic) prostheticType.ifEmpty { null } else null,
                                    createdAt = injury?.createdAt ?: System.currentTimeMillis()
                                )
                            )
                        },
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary, contentColor = Colors.buttonText)
                    ) {
                        Text(
                            if (injury == null) "Save Injury" else "Update",
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(Spacing.lg))
            }
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

@Composable
private fun FormSectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = Colors.textSecondary,
        letterSpacing = 0.5.sp
    )
}

@Composable
private fun outlinedFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Colors.primary,
    unfocusedBorderColor = Colors.border,
    focusedTextColor = Colors.textPrimary,
    unfocusedTextColor = Colors.textPrimary,
    cursorColor = Colors.primary,
    focusedContainerColor = Colors.backgroundTertiary,
    unfocusedContainerColor = Colors.backgroundTertiary
)

private fun calculateWeeksSince(dateString: String): Int {
    return try {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val date = dateFormat.parse(dateString) ?: return 0
        ((System.currentTimeMillis() - date.time) / (7 * 24 * 60 * 60 * 1000)).toInt()
    } catch (e: Exception) { 0 }
}

private fun formatDateForDisplay(dateString: String): String {
    return try {
        val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val outputFormat = SimpleDateFormat("dd-MM-yyyy", Locale.getDefault())
        val date = inputFormat.parse(dateString) ?: return dateString
        outputFormat.format(date)
    } catch (e: Exception) { dateString }
}

/** Accepts DD-MM-YYYY and returns YYYY-MM-DD for storage, or null if blank. */
private fun parseDateToStorage(input: String): String? {
    if (input.isBlank()) return null
    return try {
        val parts = input.split("-")
        if (parts.size == 3 && parts[0].length == 2) "${parts[2]}-${parts[1]}-${parts[0]}"
        else input
    } catch (e: Exception) { input }
}
