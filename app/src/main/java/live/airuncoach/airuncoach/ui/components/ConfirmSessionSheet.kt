package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import live.airuncoach.airuncoach.domain.model.ManualSessionStructure
import live.airuncoach.airuncoach.domain.model.SessionTypeOption
import live.airuncoach.airuncoach.network.model.SuggestedPacesResponse
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing

/** Pace band in sec/km, min = faster end. */
private data class Band(val min: Int, val max: Int) {
    fun shift(by: Int) = Band((min + by).coerceIn(150, 1200), (max + by).coerceIn(155, 1205))
    fun text() = "${fmt(min)}–${fmt(max)} /km"
}

private fun fmt(secs: Int): String = "${secs / 60}:${(secs % 60).toString().padStart(2, '0')}"

// Starting points when there's no history to suggest from and the runner taps "Set pace".
private val DEFAULT_WORK = Band(330, 345)
private val DEFAULT_EASY = Band(420, 460)

/**
 * "Confirm session" — shown after a runner configures reps on the setup screen, before the run
 * is prepared. Suggested paces come from POST /api/sessions/suggest-paces (the plans' pace
 * anchor) or, if the runner changed them for this rep shape before, from their own saved paces (with a
 * "Use suggested paces" way back). Every pace
 * can be nudged 5 s/km at a time or turned off (coach on effort). The confirmed paces become the
 * phases' targets in SelfConfiguredSessionPlan. iOS mirror: ConfirmSessionSheet in SessionTypes.swift.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfirmSessionSheet(
    type: SessionTypeOption,
    structure: ManualSessionStructure,
    remembered: IntArray?,
    loadSuggestion: suspend () -> SuggestedPacesResponse?,
    onDismiss: () -> Unit,
    /**
     * edited = the paces are the runner's own (changed from the suggestion, or their saved ones kept):
     * remember them for this rep shape. false = the suggestion as shown: forget any saved paces.
     */
    onConfirm: (structure: ManualSessionStructure, edited: Boolean) -> Unit,
) {
    val isWalkRun = type.key == "walk_run"
    val isHills = type.key == "hill_repeats"
    var loading by remember { mutableStateOf(true) }
    var basis by remember { mutableStateOf<String?>(null) }
    var workNote by remember { mutableStateOf<String?>(null) }
    var work by remember { mutableStateOf<Band?>(null) }
    var easy by remember { mutableStateOf<Band?>(null) }
    var shownWork by remember { mutableStateOf<Band?>(null) }
    var shownEasy by remember { mutableStateOf<Band?>(null) }

    var suggestion by remember { mutableStateOf<SuggestedPacesResponse?>(null) }
    var usingRemembered by remember { mutableStateOf(false) }
    val repShape = structure.workMeters?.let { "$it m" } ?: structure.workSeconds?.let { secsText(it) } ?: ""

    fun applySuggestion(sg: SuggestedPacesResponse?) {
        work = if (isWalkRun) null else sg?.workPace?.let { Band(it.min, it.max) }
        easy = sg?.easyPace?.let { Band(it.min, it.max) }
        basis = when {
            sg == null -> "Couldn't load suggested paces. Your coach will go on effort, or set your own below."
            sg.basis != null -> sg.basis
            else -> "Not enough recent runs to suggest paces. Your coach will go on effort, or set your own below."
        }
        shownWork = work
        shownEasy = easy
        usingRemembered = false
    }

    LaunchedEffect(Unit) {
        // The runner's own paces for this rep shape show straight away; the suggestion loads behind
        // them (for the note and "Use suggested paces").
        if (remembered != null) {
            work = if (isWalkRun) null else remembered.takeIf { it[0] > 0 && it[1] > 0 }?.let { Band(it[0], it[1]) }
            easy = remembered.takeIf { it[2] > 0 && it[3] > 0 }?.let { Band(it[2], it[3]) }
            basis = "Your own paces from the last time you set up $repShape reps."
            shownWork = work
            shownEasy = easy
            usingRemembered = true
            loading = false
        }
        val sg = loadSuggestion()
        suggestion = sg
        workNote = sg?.workNote
        if (remembered == null) {
            applySuggestion(sg)
            loading = false
        }
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = Colors.backgroundSecondary) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg)
                .navigationBarsPadding(),
        ) {
            Text("Confirm session", style = AppTextStyles.h3, color = Colors.textPrimary)
            Text("${type.label}: ${structure.summary()}", style = AppTextStyles.body, color = Colors.textSecondary)
            Spacer(Modifier.height(Spacing.md))

            if (loading) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = Spacing.lg)) {
                    CircularProgressIndicator(color = Colors.primary, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(Spacing.sm))
                    Text("Working out your paces…", style = AppTextStyles.body, color = Colors.textSecondary)
                }
            } else {
                basis?.let { Text(it, style = AppTextStyles.caption, color = Colors.textMuted) }
                if (usingRemembered && suggestion?.source == "history") {
                    Text(
                        "Use suggested paces",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                        color = Colors.primary,
                        modifier = Modifier.padding(top = 4.dp).clickable { applySuggestion(suggestion) },
                    )
                }
                if (work != null || easy != null) {
                    Text("Tap − for a faster pace, + for slower.", style = AppTextStyles.caption, color = Colors.textMuted,
                        modifier = Modifier.padding(top = 2.dp))
                }
                Spacer(Modifier.height(Spacing.md))

                if (structure.warmupMinutes > 0) {
                    PhaseRow(
                        title = "Warm-up", detail = "${structure.warmupMinutes} min",
                        band = if (isWalkRun) null else easy, paceAllowed = !isWalkRun,
                        effortText = if (isWalkRun) "Brisk walk" else "Easy",
                        onBand = { easy = it }, defaultBand = shownEasy ?: DEFAULT_EASY,
                    )
                }
                val repDetail = buildString {
                    append("${structure.reps} × ")
                    append(structure.workMeters?.let { "$it m" } ?: structure.workSeconds?.let { secsText(it) } ?: "")
                }
                PhaseRow(
                    title = if (isWalkRun) "Run segments" else "Reps", detail = repDetail,
                    band = if (isHills || isWalkRun) null else work, paceAllowed = !isHills && !isWalkRun,
                    effortText = when {
                        isHills -> "On effort: hard but controlled, the same every rep"
                        isWalkRun -> "Easy, relaxed running"
                        else -> "On effort"
                    },
                    onBand = { work = it }, defaultBand = shownWork ?: DEFAULT_WORK,
                    extra = work?.takeIf { !isHills }?.let { b ->
                        structure.workMeters?.let { m -> "≈ ${fmt(b.min * m / 1000)}–${fmt(b.max * m / 1000)} per rep" }
                    },
                    note = workNote?.takeIf { work != null || isHills },
                )
                val restDetail = structure.restMeters?.let { "$it m" } ?: structure.restSeconds?.let { secsText(it) } ?: ""
                PhaseRow(
                    title = if (isWalkRun) "Walk breaks" else "Recoveries", detail = restDetail,
                    band = null, paceAllowed = false,
                    effortText = if (isWalkRun) "Walk" else "Easy jog or walk — as slow as you need",
                    onBand = {}, defaultBand = DEFAULT_EASY,
                )
                if (structure.cooldownMinutes > 0) {
                    PhaseRow(
                        title = "Cool-down", detail = "${structure.cooldownMinutes} min",
                        band = if (isWalkRun) null else easy, paceAllowed = !isWalkRun,
                        effortText = if (isWalkRun) "Easy walk" else "Easy",
                        onBand = { easy = it }, defaultBand = shownEasy ?: DEFAULT_EASY,
                    )
                }
                if (easy != null && structure.warmupMinutes > 0 && structure.cooldownMinutes > 0) {
                    Text("Warm-up and cool-down share one easy pace.", style = AppTextStyles.caption, color = Colors.textMuted)
                }

                Spacer(Modifier.height(Spacing.lg))
                Button(
                    onClick = {
                        onConfirm(structure.copy(
                            workPaceMinSec = work?.min, workPaceMaxSec = work?.max,
                            easyPaceMinSec = easy?.min, easyPaceMaxSec = easy?.max,
                        ), work != shownWork || easy != shownEasy || usingRemembered)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Colors.primary),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                ) {
                    Text("CONFIRM SESSION", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.backgroundRoot)
                }
                Spacer(Modifier.height(Spacing.lg))
            }
        }
    }
}

private fun secsText(s: Int): String = when {
    s >= 60 && s % 60 == 0 -> "${s / 60} min"
    s < 120 -> "$s s"
    else -> "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
}

@Composable
private fun PhaseRow(
    title: String,
    detail: String,
    band: Band?,
    paceAllowed: Boolean,
    effortText: String,
    onBand: (Band?) -> Unit,
    defaultBand: Band,
    extra: String? = null,
    note: String? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = Spacing.sm)
            .clip(RoundedCornerShape(12.dp))
            .background(Colors.backgroundRoot)
            .padding(Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold), color = Colors.textPrimary)
                Text(detail, style = AppTextStyles.caption, color = Colors.textSecondary)
            }
            if (band != null) {
                StepButton("−", "Faster") { onBand(band.shift(-5)) }
                Text(band.text(), style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.primary,
                    modifier = Modifier.padding(horizontal = 8.dp))
                StepButton("+", "Slower") { onBand(band.shift(5)) }
            } else {
                Text(effortText, style = AppTextStyles.caption, color = Colors.textSecondary,
                    modifier = Modifier.weight(1f, fill = false))
            }
        }
        extra?.let { Text(it, style = AppTextStyles.caption, color = Colors.textSecondary, modifier = Modifier.padding(top = 4.dp)) }
        note?.let { Text(it, style = AppTextStyles.caption, color = Colors.textMuted, modifier = Modifier.padding(top = 2.dp)) }
        if (paceAllowed) {
            Text(
                if (band != null) "Coach on effort instead" else "Set a pace",
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.primary,
                modifier = Modifier
                    .padding(top = 6.dp)
                    .clickable { onBand(if (band != null) null else defaultBand) },
            )
        }
    }
}

@Composable
private fun StepButton(label: String, description: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(CircleShape)
            .background(Colors.primary.copy(alpha = 0.15f))
            .clickable(onClickLabel = description, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.primary)
    }
}
