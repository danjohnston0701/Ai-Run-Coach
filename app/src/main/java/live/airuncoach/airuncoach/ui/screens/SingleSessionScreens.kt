package live.airuncoach.airuncoach.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.SessionTypes
import live.airuncoach.airuncoach.network.model.SingleSessionItem
import live.airuncoach.airuncoach.network.model.WorkoutDetails
import live.airuncoach.airuncoach.ui.components.SessionTypePickerRow
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.SingleSessionCreateState
import live.airuncoach.airuncoach.viewmodel.SingleSessionViewModel

/** Length line for a one-off session: "40 min" or "6 km". */
private fun sessionLength(w: WorkoutDetails): String? =
    w.distance?.takeIf { it > 0 }?.let { "%.1f km".format(it).replace(".0 km", " km") }
        ?: w.duration?.takeIf { it > 0 }?.let { "${it / 60} min" }

/**
 * "Sessions" tab of the Coaching Programme screen: one-off AI-designed sessions, newest first.
 */
@Composable
fun SingleSessionsTab(
    onDesignSession: () -> Unit,
    onOpenSession: (SingleSessionItem) -> Unit,
    isActive: Boolean,
) {
    val vm: SingleSessionViewModel = hiltViewModel()
    val sessions by vm.sessions.collectAsState()
    val listError by vm.listError.collectAsState()
    var confirmDelete by remember { mutableStateOf<SingleSessionItem?>(null) }

    LaunchedEffect(isActive) { if (isActive) vm.loadSessions() }

    val list = sessions
    when {
        list == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Colors.primary)
        }
        list.isEmpty() -> Column(
            modifier = Modifier.fillMaxSize().padding(Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(painterResource(R.drawable.icon_ai_vector), null, tint = Colors.primary, modifier = Modifier.size(52.dp))
            Spacer(Modifier.height(Spacing.lg))
            Text("One-off sessions", style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary, textAlign = TextAlign.Center)
            Spacer(Modifier.height(Spacing.sm))
            Text(
                "Want an interval session today but not a whole plan? Your coach designs a single session around your history and coaches you through it live.",
                style = AppTextStyles.body, color = Colors.textSecondary, textAlign = TextAlign.Center,
            )
            listError?.let {
                Spacer(Modifier.height(Spacing.sm))
                Text(it, style = AppTextStyles.small, color = Colors.error)
            }
            Spacer(Modifier.height(Spacing.xl))
            Button(
                onClick = onDesignSession,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                shape = RoundedCornerShape(16.dp),
            ) {
                Text("Design a Session", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
            }
        }
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                Button(
                    onClick = onDesignSession,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    shape = RoundedCornerShape(14.dp),
                ) { Text("Design a Session", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText) }
            }
            items(list, key = { it.workout.id }) { item ->
                Card(
                    modifier = Modifier.fillMaxWidth().clickable { onOpenSession(item) },
                    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Row(Modifier.padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                item.name ?: live.airuncoach.airuncoach.ui.components.workoutTypeLabel(item.workout.workoutType),
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary,
                            )
                            val meta = listOfNotNull(
                                live.airuncoach.airuncoach.ui.components.workoutTypeLabel(item.workout.workoutType),
                                sessionLength(item.workout),
                                item.workout.scheduledDate?.take(10),
                            ).joinToString(" · ")
                            Text(meta, style = AppTextStyles.small, color = Colors.textSecondary)
                            if (item.workout.isCompleted) {
                                Text("Done", style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold), color = Colors.success)
                            }
                        }
                        IconButton(onClick = { confirmDelete = item }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete session", tint = Colors.textMuted)
                        }
                    }
                }
            }
        }
    }

    confirmDelete?.let { item ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            containerColor = Colors.backgroundSecondary,
            title = { Text("Delete this session?", style = AppTextStyles.h3) },
            text = { Text("It's removed from this list. Any run you've done with it is kept.", style = AppTextStyles.body, color = Colors.textSecondary) },
            confirmButton = {
                Button(onClick = { vm.delete(item.workout.id); confirmDelete = null }, colors = ButtonDefaults.buttonColors(containerColor = Colors.primary)) {
                    Text("Delete", color = Colors.buttonText)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Keep", color = Colors.textPrimary) } },
        )
    }
}

/**
 * Design a one-off session: type, how long or how far, optional notes. The AI designs it from the
 * runner's history (same pipeline as plan sessions), then [onReady] opens the normal workout screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateSingleSessionScreen(
    onNavigateBack: () -> Unit,
    onReady: (workout: WorkoutDetails, planId: String) -> Unit,
    onUpgrade: () -> Unit,
) {
    val vm: SingleSessionViewModel = hiltViewModel()
    val allowance by vm.allowance.collectAsState()
    val createState by vm.createState.collectAsState()
    LaunchedEffect(Unit) { vm.resetCreate(); vm.loadAllowance() }

    var type by remember { mutableStateOf(SessionTypes.byKey("intervals") ?: SessionTypes.aiDesignable.first()) }
    var byTime by remember { mutableStateOf(true) }
    var minutes by remember { mutableStateOf("40") }
    var km by remember { mutableStateOf("5") }
    var notes by remember { mutableStateOf("") }

    LaunchedEffect(createState) {
        (createState as? SingleSessionCreateState.Ready)?.let { ready ->
            vm.resetCreate()
            onReady(ready.result.workout, ready.result.planId)
        }
    }

    val minutesVal = minutes.toIntOrNull()
    val kmVal = km.replace(',', '.').toDoubleOrNull()
    val lengthValid = if (byTime) minutesVal != null && minutesVal in 10..300 else kmVal != null && kmVal in 1.0..60.0
    val designing = createState is SingleSessionCreateState.Designing
    val blocked = allowance?.let { !it.isAvailable } == true

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Design a Session", style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
                        Text("One session, designed by your coach", style = AppTextStyles.small, color = Colors.textMuted)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(painterResource(R.drawable.icon_arrow_back_vector), "Back", tint = Colors.textPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Colors.backgroundRoot),
            )
        },
        containerColor = Colors.backgroundRoot,
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        if (designing) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(color = Colors.primary)
                Spacer(Modifier.height(Spacing.lg))
                Text("Your coach is designing your session…", style = AppTextStyles.h3, color = Colors.textPrimary, textAlign = TextAlign.Center)
                Spacer(Modifier.height(Spacing.sm))
                Text("Using your recent runs, paces and heart rate. This takes about half a minute.",
                    style = AppTextStyles.body, color = Colors.textSecondary, textAlign = TextAlign.Center)
            }
            return@Scaffold
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(vertical = Spacing.lg),
        ) {
            SessionTypePickerRow(
                selected = type,
                onSelected = { type = it },
                options = SessionTypes.aiDesignable,
            )
            Spacer(Modifier.height(Spacing.sm))
            Text(type.blurb, style = AppTextStyles.small, color = Colors.textSecondary, modifier = Modifier.padding(horizontal = Spacing.lg))

            Spacer(Modifier.height(Spacing.xl))
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("How long?", style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
                Row(
                    modifier = Modifier.clip(RoundedCornerShape(BorderRadius.full)).background(Colors.backgroundSecondary).padding(3.dp),
                ) {
                    LengthPill("Time", byTime) { byTime = true }
                    LengthPill("Distance", !byTime) { byTime = false }
                }
            }
            Spacer(Modifier.height(Spacing.sm))
            OutlinedTextField(
                value = if (byTime) minutes else km,
                onValueChange = { v ->
                    if (byTime) { if (v.length <= 3 && v.all { it.isDigit() }) minutes = v }
                    else if (v.length <= 5 && v.all { it.isDigit() || it == '.' || it == ',' }) km = v
                },
                label = { Text(if (byTime) "Total time, including warm-up and cool-down" else "Total distance") },
                suffix = { Text(if (byTime) "min" else "km", color = Colors.textMuted) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = if (byTime) KeyboardType.Number else KeyboardType.Decimal),
                isError = !lengthValid,
                supportingText = { if (!lengthValid) Text(if (byTime) "10 to 300 minutes" else "1 to 60 km") },
                colors = fieldColors(),
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg),
            )

            Spacer(Modifier.height(Spacing.md))
            OutlinedTextField(
                value = notes,
                onValueChange = { if (it.length <= 300) notes = it },
                label = { Text("Anything your coach should know? (optional)") },
                placeholder = { Text("e.g. legs a bit tired, track available, keep it on flat roads") },
                minLines = 2,
                colors = fieldColors(),
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg),
            )

            Spacer(Modifier.height(Spacing.lg))
            allowance?.let { a ->
                val line = when {
                    a.notIncluded -> a.message ?: "AI-designed sessions are part of AI Plans."
                    a.isUnlimited -> "Unlimited sessions on your plan."
                    a.remaining != null && a.limit != null -> "${a.remaining} of ${a.limit} AI sessions left ${if (a.wholeTrial) "in your free trial" else "this month"}."
                    else -> null
                }
                line?.let {
                    Text(it, style = AppTextStyles.small, color = if (a.isAvailable) Colors.textSecondary else Colors.error,
                        modifier = Modifier.padding(horizontal = Spacing.lg))
                    Spacer(Modifier.height(Spacing.md))
                }
            }
            (createState as? SingleSessionCreateState.Failed)?.let { f ->
                Text(f.message, style = AppTextStyles.small, color = Colors.error, modifier = Modifier.padding(horizontal = Spacing.lg))
                Spacer(Modifier.height(Spacing.md))
            }

            if (blocked || (createState as? SingleSessionCreateState.Failed)?.upgradeRequired == true) {
                Button(
                    onClick = onUpgrade,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg).height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    shape = RoundedCornerShape(16.dp),
                ) { Text("See Plans", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText) }
            } else {
                Button(
                    onClick = {
                        vm.create(
                            workoutType = type.key ?: "intervals",
                            durationMinutes = if (byTime) minutesVal else null,
                            distanceKm = if (byTime) null else kmVal,
                            notes = notes,
                        )
                    },
                    enabled = lengthValid,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg).height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Icon(painterResource(R.drawable.icon_ai_vector), null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(Spacing.sm))
                    Text("Design My Session", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.buttonText)
                }
            }
        }
    }
}

@Composable
private fun LengthPill(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(BorderRadius.full))
            .background(if (selected) Colors.primary.copy(alpha = 0.20f) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Text(text, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = if (selected) Colors.primary else Colors.textMuted)
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Colors.primary,
    unfocusedBorderColor = Colors.textMuted.copy(alpha = 0.4f),
    focusedTextColor = Colors.textPrimary,
    unfocusedTextColor = Colors.textPrimary,
    focusedLabelColor = Colors.primary,
    unfocusedLabelColor = Colors.textSecondary,
)
