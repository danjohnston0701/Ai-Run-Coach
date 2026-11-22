package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.domain.model.SessionPhaseRecord
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors

/**
 * Run Summary card for a phased session (intervals, hill repeats, fartlek, walk-run, or any
 * plan session with a warm-up / reps / cool-down timeline). Replaces the km splits, which mean
 * little when every rep is 400 m. Built from runs.session_phases.
 *
 * Chart: one bar per phase, its width the phase's share of the session time and its height its
 * pace (slower = taller). Reps blue (red when 10%+ slower), recoveries green, warm-up / cool-down grey, the rep target
 * pace as a dashed band. Under it, a line per rep with pace and how it compared with the target.
 * iOS `SessionBreakdownCard` (RunSummaryScreen.swift) draws the same; the share image uses
 * [SessionPhaseBars] too.
 */
object SessionPhaseColors {
    val work = Color(0xFFFF4D5E)
    val recovery = Color(0xFF4CAF50)
    val easy = Color(0xFF7A8699)
    fun forKind(kind: String): Color = when (kind) {
        "work" -> work
        "recovery" -> recovery
        else -> easy
    }
}

/** Pace in sec/km over the phase, or null when it's too short to mean anything. */
fun SessionPhaseRecord.paceSecPerKm(): Int? {
    val secs = endSec - startSec
    val metres = endM - startM
    if (secs < 5 || metres < 20) return null
    return (secs / (metres / 1000.0)).toInt().takeIf { it in 120..1800 }
}

fun formatPaceSec(sec: Int): String = "%d:%02d".format(sec / 60, sec % 60)

/** True when a run's phases are worth a session breakdown (at least one rep). */
fun List<SessionPhaseRecord>?.hasReps(): Boolean = this?.any { it.kind == "work" } == true

/** The bar chart alone, for the summary card and the share image. */
@Composable
fun SessionPhaseBars(phases: List<SessionPhaseRecord>, modifier: Modifier = Modifier, showTarget: Boolean = true) {
    Canvas(modifier = modifier) { drawSessionPhaseBars(phases, showTarget) }
}

fun DrawScope.drawSessionPhaseBars(phases: List<SessionPhaseRecord>, showTarget: Boolean = true) {
    val usable = phases.filter { it.endSec > it.startSec }
    if (usable.isEmpty()) return
    val totalSec = usable.sumOf { it.endSec - it.startSec }.toFloat().coerceAtLeast(1f)
    val paces = usable.mapNotNull { it.paceSecPerKm() }
    if (paces.isEmpty()) return
    val targets = usable.mapNotNull { it.targetPaceMinSec } + usable.mapNotNull { it.targetPaceMaxSec }
    // Bar height = pace, so a slower phase is a taller bar and a faster one shorter (Daniel,
    // 2026-11-22). Reps blue, red only when 10%+ slower than the target / average rep
    // (SummaryPaceRule, SessionSummaryCards.kt); recoveries green; warm-up / cool-down grey.
    val scale = (paces + targets).maxOrNull()!! * 1.06f
    fun yFor(pace: Int): Float = size.height * (1f - (pace / scale)).coerceIn(0f, 0.95f)
    val reps = usable.filter { it.kind == "work" }
    val ref = (reps.firstNotNullOfOrNull { it.targetPaceMaxSec ?: it.targetPaceMinSec }?.toDouble())
        ?: reps.mapNotNull { it.paceSecPerKm() }.takeIf { it.isNotEmpty() }?.average() ?: 0.0
    val gap = 2.dp.toPx()
    var x = 0f
    usable.forEach { p ->
        val w = size.width * ((p.endSec - p.startSec) / totalSec)
        val pace = p.paceSecPerKm()
        if (pace != null) {
            val top = yFor(pace)
            val color = when (p.kind) {
                "work" -> if (SummaryPaceRule.isNoticeablySlower(pace, ref)) SummaryColors.slower else SummaryColors.onPace
                "recovery" -> SummaryColors.recovery
                else -> SummaryColors.easy
            }
            drawRoundRect(
                color = color,
                topLeft = Offset(x + gap / 2, top),
                size = Size((w - gap).coerceAtLeast(1f), size.height - top),
                cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx()),
            )
        }
        x += w
    }
    if (showTarget) {
        val tMin = usable.firstNotNullOfOrNull { it.targetPaceMinSec }
        val tMax = usable.firstNotNullOfOrNull { it.targetPaceMaxSec } ?: tMin
        if (tMin != null && tMax != null) {
            val dash = PathEffect.dashPathEffect(floatArrayOf(8f, 6f))
            listOf(tMin, tMax).distinct().forEach { t ->
                val y = yFor(t)
                drawLine(Color.White.copy(alpha = 0.7f), Offset(0f, y), Offset(size.width, y), strokeWidth = 1.5.dp.toPx(), pathEffect = dash)
            }
        }
    }
}

@Composable
fun SessionBreakdownCard(title: String, phases: List<SessionPhaseRecord>) {
    val reps = phases.filter { it.kind == "work" }
    val repPaces = reps.mapNotNull { r -> r.paceSecPerKm()?.let { r to it } }
    val tMin = reps.firstNotNullOfOrNull { it.targetPaceMinSec }
    val tMax = reps.firstNotNullOfOrNull { it.targetPaceMaxSec } ?: tMin
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
        Card(
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(),
            border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f)),
        ) {
            Column(Modifier.padding(16.dp)) {
                if (repPaces.isNotEmpty()) {
                    val avg = repPaces.map { it.second }.average().toInt()
                    val best = repPaces.minByOrNull { it.second }!!
                    val spread = repPaces.maxOf { it.second } - repPaces.minOf { it.second }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Stat("Avg rep", "${formatPaceSec(avg)}/km")
                        Stat("Fastest", "${best.first.label} · ${formatPaceSec(best.second)}")
                        Stat("Spread", "$spread s/km")
                    }
                    Spacer(Modifier.height(14.dp))
                }
                SessionPhaseBars(phases, Modifier.fillMaxWidth().height(120.dp))
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Legend(SummaryColors.onPace, "Reps")
                    Legend(SummaryColors.slower, "10%+ slower")
                    Legend(SummaryColors.recovery, "Recovery")
                    Legend(SessionPhaseColors.easy, "Warm-up / cool-down")
                    if (tMin != null) Text("- - target", color = Colors.textSecondary, fontSize = 11.sp)
                }
                if (repPaces.isNotEmpty()) {
                    Spacer(Modifier.height(14.dp))
                    repPaces.forEachIndexed { i, (r, pace) ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(r.label, color = Colors.textPrimary, style = AppTextStyles.body, modifier = Modifier.width(64.dp))
                            Text(repDetail(r), color = Colors.textSecondary, fontSize = 13.sp, modifier = Modifier.weight(1f))
                            Column(horizontalAlignment = Alignment.End) {
                                Text("${formatPaceSec(pace)}/km", color = if (SummaryPaceRule.isNoticeablySlower(pace, tMax?.toDouble() ?: repPaces.map { it.second }.average())) SummaryColors.slower else Colors.primary, fontWeight = FontWeight.Bold)
                                targetVerdict(pace, tMin, tMax)?.let { (txt, ok) ->
                                    Text(txt, color = if (ok) SessionPhaseColors.recovery else Colors.textSecondary, fontSize = 11.sp)
                                }
                            }
                        }
                        if (i < repPaces.lastIndex) HorizontalDivider(color = Colors.border, thickness = 1.dp)
                    }
                }
            }
        }
    }
}

private fun repDetail(r: SessionPhaseRecord): String {
    val secs = r.endSec - r.startSec
    val m = r.endM - r.startM
    val time = if (secs >= 60) "%d:%02d".format(secs / 60, secs % 60) else "$secs s"
    val dist = if (m >= 1000) "%.2f km".format(m / 1000.0) else "$m m"
    return "$dist in $time"
}

/** "On target", "4 s slow", "6 s fast" against the rep target band; null without a target. */
fun targetVerdict(pace: Int, tMin: Int?, tMax: Int?): Pair<String, Boolean>? {
    if (tMin == null || tMax == null) return null
    return when {
        pace < tMin -> "${tMin - pace} s fast" to true
        pace > tMax -> "${pace - tMax} s slow" to false
        else -> "On target" to true
    }
}

@Composable
private fun Stat(label: String, value: String) {
    Column {
        Text(label, color = Colors.textSecondary, fontSize = 11.sp)
        Text(value, color = Colors.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}

@Composable
private fun Legend(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        androidx.compose.foundation.layout.Box(Modifier.size(8.dp).background(color, CircleShape))
        Spacer(Modifier.width(4.dp))
        Text(label, color = Colors.textSecondary, fontSize = 11.sp)
    }
}


/**
 * Consistency of one kind of phase (reps, or recoveries) — the coefficient of variation of their
 * paces, scored 0–100. Km splits can't judge an interval session (fast reps, slow recoveries:
 * Daniel's 4 × 400 m scored 0, 2026-11-22), so reps and recoveries are judged separately.
 * Reps are scored strictly (a rep set is meant to be even); recoveries loosely (they're easy
 * jogs or walks and vary more). Null with fewer than two of that kind.
 */
data class PhaseConsistency(val score: Int, val label: String, val color: Color, val detail: String)

fun phaseConsistency(phases: List<SessionPhaseRecord>, kind: String): PhaseConsistency? {
    val paces = phases.filter { it.kind == kind }.mapNotNull { it.paceSecPerKm()?.toDouble() }
    if (paces.size < 2) return null
    val mean = paces.average()
    val cv = kotlin.math.sqrt(paces.map { (it - mean) * (it - mean) }.average()) / mean * 100.0
    val strict = kind == "work"
    val score = (100 - cv * (if (strict) 6.0 else 2.5)).coerceIn(0.0, 100.0).let { Math.round(it).toInt() }
    val spread = (paces.max() - paces.min()).toInt()
    val noun = if (strict) "reps" else "recoveries"
    val (label, color) = when {
        score >= 85 -> "Very even" to Color(0xFF4CAF50)
        score >= 70 -> "Even" to Color(0xFF8BC34A)
        score >= 50 -> "Some variation" to Color(0xFFFFC107)
        else -> "Uneven" to Color(0xFFFF9800)
    }
    val detail = if (strict) {
        val first = paces.first(); val last = paces.last()
        val trend = when {
            last < first - 3 -> "You got quicker through the set"
            last > first + 3 -> "You slowed through the set"
            else -> "You held the pace through the set"
        }
        "$trend: ${paces.size} $noun within $spread s/km of each other."
    } else {
        "${paces.size} $noun within $spread s/km of each other."
    }
    return PhaseConsistency(score, label, color, detail)
}

/** Replaces the km-split Pace Consistency card for a session with reps. */
@Composable
fun SessionConsistencyCard(phases: List<SessionPhaseRecord>) {
    val reps = phaseConsistency(phases, "work")
    val recoveries = phaseConsistency(phases, "recovery")
    if (reps == null && recoveries == null) return
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f)),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Session Consistency", style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold), color = Colors.textPrimary)
            Text("Reps and recoveries judged separately: their paces are meant to differ.", style = AppTextStyles.caption, color = Colors.textSecondary)
            reps?.let { ConsistencyRow("Rep consistency", it) }
            recoveries?.let { ConsistencyRow("Recovery consistency", it) }
        }
    }
}

@Composable
private fun ConsistencyRow(title: String, c: PhaseConsistency) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        androidx.compose.foundation.layout.Box(
            Modifier.size(48.dp).background(c.color.copy(alpha = 0.15f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text("${c.score}", color = c.color, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp) }
        Spacer(Modifier.width(12.dp))
        Column {
            Text("$title · ${c.label}", color = Colors.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text(c.detail, color = Colors.textSecondary, fontSize = 12.sp)
        }
    }
}

/** Session types whose pace varies by design: km-split consistency isn't a fair score for them. */
val VARIABLE_PACE_TYPES = setOf("intervals", "interval", "short_interval", "hill_repeats", "fartlek", "walk_run")
