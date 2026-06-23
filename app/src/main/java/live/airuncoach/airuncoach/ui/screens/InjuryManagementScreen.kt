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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.platform.LocalContext
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
import android.app.DatePickerDialog

// Body parts that have a left/right side
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
fun InjuryManagementScreen(
    onNavigateBack: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val user by viewModel.user.collectAsState()
    var showAddInjuryDialog by remember { mutableStateOf(false) }
    var editingInjury by remember { mutableStateOf<Injury?>(null) }
    var selectedTab by remember { mutableStateOf(0) }

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
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Health & Injuries",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = Colors.textPrimary
                    )
                    Text(
                        "Track your injuries and conditions",
                        style = MaterialTheme.typography.bodySmall,
                        color = Colors.textSecondary
                    )
                }
                // Add Injury Button
                Button(
                    onClick = { showAddInjuryDialog = true },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    ),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .height(40.dp)
                        .wrapContentWidth(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 0.dp)
                ) {
                    Icon(
                        Icons.Filled.Add,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Add", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                }
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = Spacing.lg),
                color = Colors.border
            )

            // ── Tab Row ─────────────────────────────────────────────────────────
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Colors.backgroundRoot,
                contentColor = Colors.primary,
                indicator = { tabPositions ->
                    if (selectedTab < tabPositions.size) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .wrapContentSize(Alignment.BottomStart)
                                .offset(x = tabPositions[selectedTab].left)
                                .width(tabPositions[selectedTab].width)
                                .padding(horizontal = 16.dp)
                                .height(3.dp)
                                .background(Colors.primary)
                        )
                    }
                },
                divider = {
                    HorizontalDivider(color = Colors.backgroundSecondary, thickness = 1.dp)
                }
            ) {
                val tabs = listOf(
                    Triple(InjuryStatus.RECOVERING, "Recovering", Color(0xFFFFB300)),
                    Triple(InjuryStatus.CHRONIC, "Chronic", Color(0xFFAB47BC)),
                    Triple(InjuryStatus.HEALED, "Healed", Colors.success)
                )
                tabs.forEachIndexed { index, (status, title, _) ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        modifier = Modifier.padding(vertical = 12.dp),
                        selectedContentColor = Colors.primary,
                        unselectedContentColor = Color(0xFF8B9AA8)
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = title,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal,
                                color = if (selectedTab == index) Colors.primary else Color(0xFF8B9AA8)
                            )
                            // Show count badge
                            val count = allInjuries.count { it.status == status }
                            if (count > 0) {
                                Spacer(modifier = Modifier.width(8.dp))
                                Box(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .background(Colors.primary.copy(alpha = 0.2f), CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = count.toString(),
                                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                        color = Colors.primary
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // ── Content ──────────────────────────────────────────────────────────
            val tabs = listOf(InjuryStatus.RECOVERING, InjuryStatus.CHRONIC, InjuryStatus.HEALED)
            val currentStatus = tabs[selectedTab]
            val filteredInjuries = allInjuries.filter { it.status == currentStatus }

            if (filteredInjuries.isEmpty()) {
                EmptyInjuryState(
                    status = currentStatus,
                    onAddInjury = { showAddInjuryDialog = true }
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(Spacing.lg),
                    verticalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    items(filteredInjuries) { injury ->
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

// ── Empty State ────────────────────────────────────────────────────────────────

@Composable
fun EmptyInjuryState(status: InjuryStatus, onAddInjury: () -> Unit) {
    val (message, icon) = when (status) {
        InjuryStatus.RECOVERING -> Pair(
            "No active injuries. Add one to get personalized training.",
            Icons.Filled.Favorite
        )
        InjuryStatus.CHRONIC -> Pair(
            "No chronic conditions recorded.",
            Icons.Filled.Info
        )
        InjuryStatus.HEALED -> Pair(
            "You have no healed injuries.",
            Icons.Filled.Check
        )
    }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.lg),
            modifier = Modifier.padding(Spacing.xxxl)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = "Empty state",
                tint = Colors.textMuted.copy(alpha = 0.5f),
                modifier = Modifier.size(80.dp)
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = Colors.textSecondary,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            if (status == InjuryStatus.RECOVERING) {
                Spacer(modifier = Modifier.height(Spacing.sm))
                Button(
                    onClick = onAddInjury,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(
                        Icons.Filled.Add,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Add Injury")
                }
            }
        }
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

            // Severity info
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Warning, null, tint = Colors.warning, modifier = Modifier.size(14.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    injury.severity.name.lowercase().replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelSmall,
                    color = Colors.warning,
                    fontWeight = FontWeight.SemiBold
                )
            }

            // Recovery progress (only for recovering)
            if (injury.status == InjuryStatus.RECOVERING &&
                injury.estimatedRecoveryWeeks != null &&
                injury.injuryDate != null
            ) {
                Spacer(modifier = Modifier.height(Spacing.sm))
                val weeksAgo = calculateWeeksSince(injury.injuryDate!!)
                val progress = (weeksAgo.toFloat() / injury.estimatedRecoveryWeeks!!).coerceAtMost(1f)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Timeline, null, tint = Colors.primary, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        "Recovery ${(progress * 100).toInt()}%",
                        style = MaterialTheme.typography.labelSmall,
                        color = Colors.primary,
                        fontWeight = FontWeight.SemiBold
                    )
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
                    Icon(Icons.Filled.Accessibility, null, tint = Colors.primary, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        injury.prostheticType!!,
                        style = MaterialTheme.typography.labelSmall,
                        color = Colors.primary
                    )
                }
            }

            // Actions
            if (onMarkHealed != null || onEdit != null || onDelete != null) {
                Spacer(modifier = Modifier.height(Spacing.md))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
                ) {
                    if (onMarkHealed != null) {
                        Button(
                            onClick = onMarkHealed,
                            modifier = Modifier
                                .weight(1f)
                                .height(38.dp),
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
                    if (onEdit != null) {
                        OutlinedButton(
                            onClick = onEdit,
                            modifier = Modifier
                                .weight(1f)
                                .height(38.dp),
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

// ── Add / Edit Dialog ──────────────────────────────────────────────────────────

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
        if (injury?.injuryDate != null) injury.injuryDate!! else ""
    ) }
    var injuryDateDisplay by remember { mutableStateOf(
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
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.9f)
                .clip(RoundedCornerShape(20.dp))
                .background(Colors.backgroundSecondary)
        ) {
            Column(
                modifier = Modifier.fillMaxSize()
            ) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentPadding = PaddingValues(Spacing.lg, Spacing.lg, Spacing.lg, Spacing.lg),
                    verticalArrangement = Arrangement.spacedBy(0.dp)
                ) {

                    // ── Sheet header ────────────────────────────────────────────────
                    item {
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
                    }

                    // ── Body Part ────────────────────────────────────────────────────
                    item {
                        FormSectionLabel("Body Part")
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Box(modifier = Modifier.fillMaxWidth()) {
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
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }

                    // ── Side selector ────────────────────────────────────────────────
                    if (shouldShowSideSelector) {
                        item {
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
                            Spacer(modifier = Modifier.height(Spacing.lg))
                        }
                    }

                    // ── Status ───────────────────────────────────────────────────────
                    item {
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
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }

                    // ── Severity ─────────────────────────────────────────────────────
                    item {
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
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }

                    // ── Date ─────────────────────────────────────────────────────────
                    item {
                        DatePickerField(
                            value = injuryDateDisplay,
                            onDateSelected = { dateString ->
                                injuryDate = dateString
                                injuryDateDisplay = formatDateForDisplay(dateString)
                            }
                        )
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }

                    // ── Expected Recovery (hidden for Chronic) ────────────────────────
                    if (status == InjuryStatus.RECOVERING) {
                        item {
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
                            Spacer(modifier = Modifier.height(Spacing.lg))
                        }
                    }

                    // ── Notes ─────────────────────────────────────────────────────────
                    item {
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
                        Spacer(modifier = Modifier.height(Spacing.lg))
                    }

                    // ── Prosthetic / AFO ──────────────────────────────────────────────
                    item {
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
                        if (isProsthetic) {
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
                }

                // ── Floating Buttons (Fixed at Bottom) ──────────────────────────────
                HorizontalDivider(color = Colors.border)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(Spacing.lg),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .weight(1f)
                            .height(52.dp),
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
                            onSave(
                                Injury(
                                    id = injury?.id,
                                    bodyPart = bodyPart,
                                    injurySide = if (shouldShowSideSelector && injurySide.isNotEmpty()) injurySide else null,
                                    status = status,
                                    severity = severity,
                                    notes = notes.ifEmpty { null },
                                    injuryDate = injuryDate.ifEmpty { null },
                                    estimatedRecoveryWeeks = estimatedRecoveryWeeks.toIntOrNull(),
                                    isProstheticOrAFO = isProsthetic,
                                    prostheticType = if (isProsthetic) prostheticType.ifEmpty { null } else null,
                                    createdAt = injury?.createdAt ?: System.currentTimeMillis()
                                )
                            )
                        },
                        modifier = Modifier
                            .weight(1f)
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Colors.primary, contentColor = Colors.buttonText)
                    ) {
                        Text(
                            if (injury == null) "Save Injury" else "Update",
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

// ── Date Picker Field ──────────────────────────────────────────────────────────

@Composable
private fun DatePickerField(
    value: String,
    onDateSelected: (String) -> Unit
) {
    val context = LocalContext.current
    val calendar = Calendar.getInstance()
    var showDatePicker by remember { mutableStateOf(false) }

    // Parse existing date if available
    if (value.isNotEmpty()) {
        try {
            val dateFormat = SimpleDateFormat("dd-MM-yyyy", Locale.getDefault())
            val date = dateFormat.parse(value)
            if (date != null) {
                calendar.time = date
            }
        } catch (_: Exception) {
            // Ignore parsing errors
        }
    }

    // Show the date picker dialog when state is true
    if (showDatePicker) {
        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                val selectedCalendar = Calendar.getInstance()
                selectedCalendar.set(year, month, dayOfMonth)
                val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                val formattedDate = dateFormat.format(selectedCalendar.time)
                onDateSelected(formattedDate)
                showDatePicker = false
            },
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH),
            calendar.get(Calendar.DAY_OF_MONTH)
        ).show()
    }

    FormSectionLabel("Date of Injury (optional)")
    Spacer(modifier = Modifier.height(Spacing.sm))
    OutlinedTextField(
        value = value,
        onValueChange = {},
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                showDatePicker = true
            },
        placeholder = { Text("Select date...", color = Colors.textMuted) },
        readOnly = true,
        trailingIcon = {
            Icon(
                Icons.Filled.DateRange,
                contentDescription = "Select date",
                tint = Colors.primary,
                modifier = Modifier.size(20.dp)
            )
        },
        colors = outlinedFieldColors(),
        shape = RoundedCornerShape(10.dp)
    )
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
    } catch (_: Exception) { 0 }
}

private fun formatDateForDisplay(dateString: String): String {
    return try {
        val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val outputFormat = SimpleDateFormat("dd-MM-yyyy", Locale.getDefault())
        val date = inputFormat.parse(dateString) ?: return dateString
        outputFormat.format(date)
    } catch (_: Exception) { dateString }
}
