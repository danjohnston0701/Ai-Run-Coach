package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.domain.model.ManualSessionStructure
import live.airuncoach.airuncoach.domain.model.SessionKind
import live.airuncoach.airuncoach.domain.model.SessionTypeOption
import live.airuncoach.airuncoach.domain.model.SessionTypes
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.BorderRadius
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/**
 * "Session Type:" row with a pill that opens a picker of every session type (replaces the old
 * RUN / WALK toggle). [options] defaults to the setup-screen list; the one-off AI session screen
 * passes SessionTypes.aiDesignable.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionTypePickerRow(
    selected: SessionTypeOption,
    onSelected: (SessionTypeOption) -> Unit,
    modifier: Modifier = Modifier,
    options: List<SessionTypeOption> = SessionTypes.all,
    label: String = "Session Type:",
) {
    var open by remember { mutableStateOf(false) }
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), color = Colors.textSecondary)
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(BorderRadius.full))
                .background(Colors.primary.copy(alpha = 0.20f))
                .clickable { open = true }
                .padding(start = 14.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(selected.label.uppercase(), style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.primary)
            Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Change session type", tint = Colors.primary, modifier = Modifier.size(18.dp))
        }
    }

    if (open) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { open = false },
            sheetState = sheetState,
            containerColor = Colors.backgroundSecondary,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = Spacing.lg)
                    .navigationBarsPadding(),
            ) {
                Text("Session type", style = AppTextStyles.h3, color = Colors.textPrimary)
                Spacer(Modifier.height(Spacing.md))
                val groups = listOf(
                    SessionKind.FREE to "Free",
                    SessionKind.CONTINUOUS to "Steady sessions",
                    SessionKind.REPS to "Reps & intervals",
                    SessionKind.RACE to "Race day",
                )
                for ((kind, title) in groups) {
                    val inGroup = options.filter { it.kind == kind }
                    if (inGroup.isEmpty()) continue
                    Text(title.uppercase(), style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = Colors.textMuted,
                        modifier = Modifier.padding(top = Spacing.sm, bottom = 4.dp))
                    for (option in inGroup) {
                        val isSel = option.key == selected.key && option.activity == selected.activity
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (isSel) Colors.primary.copy(alpha = 0.12f) else Color.Transparent)
                                .clickable { onSelected(option); open = false }
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(option.label, style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), color = Colors.textPrimary)
                                Text(option.blurb, style = AppTextStyles.caption, color = Colors.textSecondary)
                            }
                            if (isSel) Icon(Icons.Default.Check, contentDescription = null, tint = Colors.primary)
                        }
                    }
                }
                Spacer(Modifier.height(Spacing.lg))
            }
        }
    }
}

/** What the setup screen's "Configure session" card is editing. All fields optional strings. */
data class ManualStructureDraft(
    val reps: String = "6",
    val workIsTime: Boolean = false,
    val work: String = "400",      // metres, or seconds when workIsTime
    val restIsTime: Boolean = true,
    val rest: String = "90",       // seconds, or metres when !restIsTime
    val warmup: String = "10",
    val cooldown: String = "5",
) {
    fun toStructure(): ManualSessionStructure? {
        val r = reps.toIntOrNull() ?: return null
        val w = work.toIntOrNull() ?: return null
        val rs = rest.toIntOrNull() ?: return null
        val s = ManualSessionStructure(
            reps = r,
            workSeconds = if (workIsTime) w else null,
            workMeters = if (workIsTime) null else w,
            restSeconds = if (restIsTime) rs else null,
            restMeters = if (restIsTime) null else rs,
            warmupMinutes = warmup.toIntOrNull() ?: 0,
            cooldownMinutes = cooldown.toIntOrNull() ?: 0,
        )
        return s.takeIf { it.isValid() }
    }

    companion object {
        /** Sensible starting structure per rep type. */
        fun defaultFor(key: String?): ManualStructureDraft = when (key) {
            "hill_repeats" -> ManualStructureDraft(reps = "8", workIsTime = true, work = "60", restIsTime = true, rest = "90")
            "fartlek" -> ManualStructureDraft(reps = "8", workIsTime = true, work = "60", restIsTime = true, rest = "90")
            "walk_run" -> ManualStructureDraft(reps = "6", workIsTime = true, work = "180", restIsTime = true, rest = "60", warmup = "5", cooldown = "5")
            else -> ManualStructureDraft()
        }
    }
}

/**
 * Optional "Configure session" card for rep types. Off = the runner manages the reps and the
 * coach sticks to heart rate, form and encouragement; on = the coach calls each rep and recovery.
 */
@Composable
fun ConfigureSessionCard(
    typeLabel: String,
    enabled: Boolean,
    onEnabledChange: (Boolean) -> Unit,
    draft: ManualStructureDraft,
    onDraftChange: (ManualStructureDraft) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isWalkRun = typeLabel.equals("Walk-Run", ignoreCase = true)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg)
            .clip(RoundedCornerShape(16.dp))
            .background(Colors.backgroundSecondary)
            .border(1.dp, Colors.primary.copy(alpha = if (enabled) 0.4f else 0.12f), RoundedCornerShape(16.dp))
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Configure session", style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), color = Colors.textPrimary)
                Text(
                    if (enabled) "Your coach will call each rep and recovery."
                    else "Optional. Skip it and run the reps your way: your coach sticks to heart rate, form and encouragement.",
                    style = AppTextStyles.caption, color = Colors.textSecondary,
                )
            }
            Spacer(Modifier.width(Spacing.sm))
            Switch(
                checked = enabled,
                onCheckedChange = onEnabledChange,
                colors = SwitchDefaults.colors(checkedTrackColor = Colors.primary),
            )
        }
        if (enabled) {
            Spacer(Modifier.height(Spacing.md))
            NumberField("Reps", draft.reps, "", Modifier.fillMaxWidth()) { onDraftChange(draft.copy(reps = it)) }
            Spacer(Modifier.height(Spacing.sm))
            UnitSwitchField(
                label = if (isWalkRun) "Run" else "Work",
                value = draft.work, isTime = draft.workIsTime,
                onValue = { onDraftChange(draft.copy(work = it)) },
                onIsTime = { onDraftChange(draft.copy(workIsTime = it, work = if (it) "60" else "400")) },
            )
            Spacer(Modifier.height(Spacing.sm))
            UnitSwitchField(
                label = if (isWalkRun) "Walk" else "Recovery",
                value = draft.rest, isTime = draft.restIsTime,
                onValue = { onDraftChange(draft.copy(rest = it)) },
                onIsTime = { onDraftChange(draft.copy(restIsTime = it, rest = if (it) "90" else "200")) },
            )
            Spacer(Modifier.height(Spacing.sm))
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                NumberField("Warm-up", draft.warmup, "min", Modifier.weight(1f)) { onDraftChange(draft.copy(warmup = it)) }
                NumberField("Cool-down", draft.cooldown, "min", Modifier.weight(1f)) { onDraftChange(draft.copy(cooldown = it)) }
            }
            val structure = draft.toStructure()
            Spacer(Modifier.height(Spacing.sm))
            Text(
                structure?.summary() ?: "Check the numbers: 1–50 reps, and a work and recovery length above 0.",
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                color = if (structure != null) Colors.primary else Colors.error,
            )
        }
    }
}

@Composable
private fun UnitSwitchField(label: String, value: String, isTime: Boolean, onValue: (String) -> Unit, onIsTime: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        NumberField(label, value, if (isTime) "sec" else "m", Modifier.weight(1f), onValue)
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(BorderRadius.full))
                .background(Colors.backgroundRoot)
                .padding(3.dp),
        ) {
            UnitPill("Time", isTime) { onIsTime(true) }
            UnitPill("Distance", !isTime) { onIsTime(false) }
        }
    }
}

@Composable
private fun UnitPill(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(BorderRadius.full))
            .background(if (selected) Colors.primary.copy(alpha = 0.20f) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Text(text, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = if (selected) Colors.primary else Colors.textMuted)
    }
}

@Composable
private fun NumberField(label: String, value: String, suffix: String, modifier: Modifier, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { v -> if (v.length <= 5 && v.all { it.isDigit() }) onChange(v) },
        label = { Text(label) },
        suffix = if (suffix.isNotEmpty()) ({ Text(suffix, color = Colors.textMuted) }) else null,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Colors.primary,
            unfocusedBorderColor = Colors.textMuted.copy(alpha = 0.4f),
            focusedTextColor = Colors.textPrimary,
            unfocusedTextColor = Colors.textPrimary,
            focusedLabelColor = Colors.primary,
            unfocusedLabelColor = Colors.textSecondary,
        ),
        modifier = modifier,
    )
}
