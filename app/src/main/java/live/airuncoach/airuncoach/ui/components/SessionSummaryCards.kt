package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import live.airuncoach.airuncoach.domain.model.KmSplit
import live.airuncoach.airuncoach.domain.model.LocationPoint
import live.airuncoach.airuncoach.domain.model.SessionPhaseRecord
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/*
 * Run Summary, "Round 1 revised" design (Daniel, 2026-11-22): rep lab, effort trace, pulse and
 * the km split bars. iOS `SessionSummaryCards.swift` is a line-for-line port; change both together.
 *
 * Bar rules, everywhere a pace is a bar (reps, recoveries, km splits, the session strip):
 *  - the bar's size is the pace itself, so SHORT = FAST and TALL (or long) = SLOW;
 *  - reps and km splits are blue, and red only when noticeably slower: more than
 *    [SummaryPaceRule.SLOWER_FRACTION] (10%) slower than the rep target's slow end, or, with no
 *    target, than the average rep; km splits against the average full km;
 *  - recoveries are green, warm-up / cool-down and a part-km grey.
 */

object SummaryPaceRule {
    const val SLOWER_FRACTION = 0.10
    fun isNoticeablySlower(paceSec: Int, referenceSec: Double): Boolean =
        referenceSec > 0 && paceSec > referenceSec * (1 + SLOWER_FRACTION)
}

object SummaryColors {
    val onPace = Color(0xFF00D4FF)
    val slower = Color(0xFFFF5A6E)
    val recovery = Color(0xFF34D399)
    val easy = Color(0xFF7A8699)
    val hr = Color(0xFFFF5A6E)
    val orange = Color(0xFFFF9F43)
    val track = Color(0xFF141D30)
}

/** A track point's seconds from the run start. */
private fun LocationPoint.secFrom(startMs: Long): Double = (timestamp - startMs) / 1000.0

private fun metresBetween(a: LocationPoint, b: LocationPoint): Double {
    val r = 6_371_000.0
    val dLat = Math.toRadians(b.latitude - a.latitude)
    val dLon = Math.toRadians(b.longitude - a.longitude)
    val h = sin(dLat / 2) * sin(dLat / 2) +
        cos(Math.toRadians(a.latitude)) * cos(Math.toRadians(b.latitude)) * sin(dLon / 2) * sin(dLon / 2)
    return 2 * r * atan2(sqrt(h), sqrt(1 - h))
}

/** Longest stretch, in seconds, with no track point inside [t0, t1] (the edges count). */
private fun longestGapSec(points: List<LocationPoint>, startMs: Long, t0: Double, t1: Double): Double {
    if (points.size < 10) return 0.0   // no real track: nothing to judge
    var last = t0
    var gap = 0.0
    for (p in points) {
        val t = p.secFrom(startMs)
        if (t < t0) continue
        if (t > t1) break
        gap = maxOf(gap, t - last)
        last = t
    }
    return maxOf(gap, t1 - last)
}

/** A phase as the summary shows it. noData: the watch/phone stopped recording inside it. */
data class PhaseView(
    val phase: SessionPhaseRecord,
    val pace: Int?,
    val noData: Boolean,
    val gapSec: Int,
)

/** Gaps over this inside a phase make its pace untrustworthy (a 42 s watch drop-out, 2026-11-22). */
private const val NO_DATA_GAP_SEC = 30.0

fun phaseViews(phases: List<SessionPhaseRecord>, points: List<LocationPoint>, startMs: Long): List<PhaseView> =
    phases.filter { it.endSec > it.startSec }.map { p ->
        val gap = longestGapSec(points, startMs, p.startSec.toDouble(), p.endSec.toDouble())
        val noData = gap > NO_DATA_GAP_SEC
        PhaseView(p, if (noData) null else p.paceSecPerKm(), noData, gap.roundToInt())
    }

/** The reference a rep is judged against: the target's slow end, else the average rep. */
private fun repReference(reps: List<PhaseView>): Double {
    val target = reps.firstNotNullOfOrNull { it.phase.targetPaceMaxSec ?: it.phase.targetPaceMinSec }
    if (target != null) return target.toDouble()
    val paces = reps.mapNotNull { it.pace }
    return if (paces.isEmpty()) 0.0 else paces.average()
}

@Composable
private fun SummaryCard(content: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f)),
    ) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) { content() } }
}

@Composable
private fun Eyebrow(text: String) {
    Text(text.uppercase(), color = Colors.textMuted, fontSize = 11.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun SummaryTitle(text: String) {
    Text(text, style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
}

@Composable
private fun LegendDot(color: Color, label: String, dashed: Boolean = false) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (dashed) {
            Canvas(Modifier.size(width = 14.dp, height = 8.dp)) {
                drawLine(color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), 2.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 4f)))
            }
        } else {
            Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(color))
        }
        Spacer(Modifier.width(6.dp))
        Text(label, color = Colors.textSecondary, fontSize = 12.sp)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rep lab
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One column per rep with its recovery beside it. Bar height = pace (taller = slower), against
 * the slowest pace on the chart. Reps blue, red when noticeably slower; recoveries green with
 * their pace under the rep; a rep with a recording gap is a dashed "no data" outline.
 */
@Composable
fun RepLabCard(phases: List<SessionPhaseRecord>, points: List<LocationPoint>, startMs: Long) {
    val views = remember(phases, points, startMs) { phaseViews(phases, points, startMs) }
    val reps = views.filter { it.phase.kind == "work" }
    if (reps.isEmpty()) return
    val recs = views.filter { it.phase.kind == "recovery" }
    fun recoveryFor(i: Int, rep: PhaseView): PhaseView? =
        recs.firstOrNull { rep.phase.rep != null && it.phase.rep == rep.phase.rep } ?: recs.getOrNull(i)
    val ref = repReference(reps)
    val target = reps.firstNotNullOfOrNull { it.phase.targetPaceMaxSec ?: it.phase.targetPaceMinSec }
    val allPaces = (reps + recs).mapNotNull { it.pace } + listOfNotNull(target)
    if (allPaces.isEmpty()) return
    val scale = allPaces.max() * 1.06
    val usable = reps.filter { it.pace != null }
    val onPace = usable.count { !SummaryPaceRule.isNoticeablySlower(it.pace!!, ref) }
    val best = usable.minByOrNull { it.pace!! }
    val headline = when {
        usable.isEmpty() -> "Your reps"
        onPace == usable.size -> "Every rep on pace"
        onPace == 0 -> "Every rep slower than ${if (target != null) "target" else "your average"}"
        else -> "$onPace of ${usable.size} reps on pace · best ${formatPaceSec(best!!.pace!!)}/km"
    }
    val plotH = 170.dp

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Eyebrow("Rep lab · shorter bar = faster")
        SummaryTitle(headline)
        SummaryCard {
            Box(Modifier.fillMaxWidth().height(plotH + 22.dp)) {
                // Target line, drawn under the bars.
                if (target != null) {
                    Canvas(Modifier.fillMaxSize()) {
                        val y = size.height - (target / scale).toFloat() * plotH.toPx()
                        drawLine(Color.White.copy(alpha = 0.6f), Offset(0f, y), Offset(size.width, y), 1.5.dp.toPx(),
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f)))
                    }
                }
                Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.Bottom) {
                    reps.forEachIndexed { i, rep ->
                        Row(Modifier.weight(1f).fillMaxHeight(), verticalAlignment = Alignment.Bottom,
                            horizontalArrangement = Arrangement.Center) {
                            PaceBar(rep, scale, plotH, 22.dp, repColor(rep, ref), labelSize = 12)
                            Spacer(Modifier.width(3.dp))
                            recoveryFor(i, rep)?.let { PaceBar(it, scale, plotH, 11.dp, SummaryColors.recovery, labelSize = 0) }
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth()) {
                reps.forEachIndexed { i, rep ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Rep ${rep.phase.rep ?: (i + 1)}", color = Colors.textSecondary, fontSize = 11.sp)
                        val rc = recoveryFor(i, rep)
                        Text(
                            when { rc == null -> ""; rc.pace == null -> "–"; else -> formatPaceSec(rc.pace) },
                            color = SummaryColors.recovery, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                LegendDot(SummaryColors.onPace, "On pace")
                LegendDot(SummaryColors.slower, "10%+ slower")
                LegendDot(SummaryColors.recovery, "Recovery")
                if (target != null) LegendDot(Color.White, "Target", dashed = true)
            }
        }
        val trusted = views.filterNot { it.noData }.map { it.phase }
        val repC = phaseConsistency(trusted, "work")
        val recC = phaseConsistency(trusted, "recovery")
        if (repC != null || recC != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                repC?.let { GaugeTile("Rep consistency", it, Modifier.weight(1f)) }
                recC?.let { GaugeTile("Recovery consistency", it, Modifier.weight(1f)) }
            }
        }
        reps.firstOrNull { it.noData }?.let { gap ->
            Card(
                colors = CardDefaults.cardColors(containerColor = SummaryColors.orange.copy(alpha = 0.07f)),
                shape = RoundedCornerShape(18.dp),
                border = BorderStroke(1.dp, SummaryColors.orange.copy(alpha = 0.3f)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("WHY ${gap.phase.label.uppercase()} HAS NO BAR", color = SummaryColors.orange, fontSize = 11.sp, letterSpacing = 1.5.sp)
                    Text(
                        "Your watch stopped sending for ${gap.gapSec} seconds during ${gap.phase.label.lowercase()}, so its pace can't be trusted and is left out.",
                        color = Colors.textPrimary, fontSize = 14.sp, lineHeight = 20.sp,
                    )
                }
            }
        }
    }
}

private fun repColor(rep: PhaseView, ref: Double): Color =
    if (rep.pace != null && SummaryPaceRule.isNoticeablySlower(rep.pace, ref)) SummaryColors.slower else SummaryColors.onPace

@Composable
private fun PaceBar(v: PhaseView, scale: Double, plotH: Dp, width: Dp, color: Color, labelSize: Int) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        if (v.pace == null) {
            val h = plotH * 0.55f
            Box(Modifier.width(width).height(h), contentAlignment = Alignment.Center) {
                Canvas(Modifier.fillMaxSize()) {
                    drawRoundRect(Colors.border, style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f))),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(6.dp.toPx()))
                }
                if (labelSize > 0) Text("no\ndata", color = Colors.textMuted, fontSize = 9.sp, textAlign = TextAlign.Center, lineHeight = 11.sp)
            }
        } else {
            if (labelSize > 0) {
                Text(formatPaceSec(v.pace), color = if (color == SummaryColors.slower) Color(0xFFFFC2CA) else Colors.textPrimary,
                    fontSize = labelSize.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(3.dp))
            }
            val h = plotH * (v.pace / scale).toFloat().coerceIn(0.05f, 1f)
            Box(
                Modifier.width(width).height(h).clip(RoundedCornerShape(topStart = 7.dp, topEnd = 7.dp, bottomStart = 3.dp, bottomEnd = 3.dp))
                    .background(Brush.verticalGradient(listOf(color, color.copy(alpha = 0.18f))))
            )
        }
    }
}

@Composable
private fun GaugeTile(title: String, c: PhaseConsistency, modifier: Modifier) {
    val color = when {
        c.score >= 70 -> SummaryColors.recovery
        c.score >= 50 -> Color(0xFFFFC107)
        else -> SummaryColors.orange
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f)),
        modifier = modifier,
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(width = 88.dp, height = 50.dp), contentAlignment = Alignment.BottomCenter) {
                Canvas(Modifier.fillMaxSize()) {
                    val stroke = 8.dp.toPx()
                    val d = size.width - stroke
                    val tl = Offset(stroke / 2, stroke / 2)
                    drawArc(SummaryColors.track, 180f, 180f, false, tl, Size(d, d), style = Stroke(stroke, cap = StrokeCap.Round))
                    drawArc(color, 180f, 180f * c.score / 100f, false, tl, Size(d, d), style = Stroke(stroke, cap = StrokeCap.Round))
                }
                Text("${c.score}", color = Colors.textPrimary, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            }
            Text(title, color = Colors.textPrimary, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, textAlign = TextAlign.Center)
            Text("${c.label}: ${c.detail}", color = Colors.textSecondary, fontSize = 11.sp, textAlign = TextAlign.Center, lineHeight = 15.sp)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Effort trace: pace and heart rate over the session, reps shaded
// ─────────────────────────────────────────────────────────────────────────────

private data class TracePoint(val t: Double, val paceSec: Double?, val hr: Int?)

private fun buildTrace(points: List<LocationPoint>, startMs: Long): List<TracePoint> {
    if (points.size < 10) return emptyList()
    val sorted = points.sortedBy { it.timestamp }
    val cum = DoubleArray(sorted.size)
    for (i in 1 until sorted.size) cum[i] = cum[i - 1] + metresBetween(sorted[i - 1], sorted[i])
    val out = ArrayList<TracePoint>(sorted.size)
    var lo = 0
    var hi = 0
    for (i in sorted.indices) {
        val t = sorted[i].secFrom(startMs)
        while (sorted[lo].secFrom(startMs) < t - 15) lo++
        while (hi < sorted.lastIndex && sorted[hi + 1].secFrom(startMs) <= t + 15) hi++
        val dt = sorted[hi].secFrom(startMs) - sorted[lo].secFrom(startMs)
        val dd = cum[hi] - cum[lo]
        // No pace across a recording gap: the line breaks there instead of inventing one.
        val gap = (lo until hi).any { sorted[it + 1].secFrom(startMs) - sorted[it].secFrom(startMs) > 20 }
        val pace = if (!gap && dt >= 10 && dd > 5) dt / (dd / 1000.0) else null
        out += TracePoint(t, pace?.takeIf { it in 120.0..1500.0 }, sorted[i].heartRate?.takeIf { it in 40..230 })
    }
    return out
}

@Composable
fun EffortTraceCard(points: List<LocationPoint>, startMs: Long, phases: List<SessionPhaseRecord>?) {
    val trace = remember(points, startMs) { buildTrace(points, startMs) }
    if (trace.count { it.paceSec != null } < 10) return
    val end = trace.last().t.coerceAtLeast(1.0)
    val paces = trace.mapNotNull { it.paceSec }.sorted()
    val fast = paces[(paces.size * 0.03).toInt()]
    val slow = paces[(paces.size * 0.97).toInt().coerceAtMost(paces.lastIndex)].coerceAtLeast(fast + 60)
    val hrs = trace.mapNotNull { it.hr }
    val hrLo = (hrs.minOrNull() ?: 100).coerceAtMost(110) - 5
    val hrHi = (hrs.maxOrNull() ?: 180) + 5
    val reps = phases.orEmpty().filter { it.kind == "work" }
    val pointsByStart = remember(points, startMs) { points.sortedBy { it.timestamp } }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Eyebrow("Effort trace")
        SummaryCard {
            Canvas(Modifier.fillMaxWidth().height(150.dp)) {
                fun x(t: Double) = (t / end * size.width).toFloat()
                reps.forEach { r ->
                    drawRect(SummaryColors.onPace.copy(alpha = 0.08f), Offset(x(r.startSec.toDouble()), 0f),
                        Size(x(r.endSec.toDouble()) - x(r.startSec.toDouble()), size.height))
                }
                // Recording gaps, hatched grey.
                for (i in 1 until pointsByStart.size) {
                    val a = pointsByStart[i - 1].secFrom(startMs)
                    val b = pointsByStart[i].secFrom(startMs)
                    if (b - a > NO_DATA_GAP_SEC) drawRect(Colors.textMuted.copy(alpha = 0.25f), Offset(x(a), 0f), Size(x(b) - x(a), size.height))
                }
                // Pace: faster = higher.
                var path = Path(); var open = false
                trace.forEach { p ->
                    val pace = p.paceSec
                    if (pace == null) { open = false; return@forEach }
                    val y = ((pace.coerceIn(fast, slow) - fast) / (slow - fast) * size.height).toFloat()
                    if (!open) { path.moveTo(x(p.t), y); open = true } else path.lineTo(x(p.t), y)
                }
                drawPath(path, SummaryColors.onPace, style = Stroke(1.6.dp.toPx()))
                if (hrs.size > 10) {
                    path = Path(); open = false
                    trace.forEach { p ->
                        val hr = p.hr ?: return@forEach
                        val y = size.height - ((hr - hrLo).toFloat() / (hrHi - hrLo)) * size.height
                        if (!open) { path.moveTo(x(p.t), y); open = true } else path.lineTo(x(p.t), y)
                    }
                    drawPath(path, SummaryColors.hr.copy(alpha = 0.85f), style = Stroke(1.4.dp.toPx()))
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                listOf(0.0, end / 2, end).forEach {
                    Text(formatPaceSec(it.toInt()), color = Colors.textMuted, fontSize = 10.sp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                LegendDot(SummaryColors.onPace, "Pace (higher = faster)")
                if (hrs.size > 10) LegendDot(SummaryColors.hr, "Heart rate")
                if (reps.isNotEmpty()) LegendDot(SummaryColors.onPace.copy(alpha = 0.3f), "Reps")
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pulse: time in heart-rate bands
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun PulseCard(points: List<LocationPoint>, avgHr: Int?, maxHr: Int?) {
    val bands = remember(points) {
        val sorted = points.sortedBy { it.timestamp }
        val secs = DoubleArray(4)
        for (i in 1 until sorted.size) {
            val hr = sorted[i - 1].heartRate ?: continue
            if (hr !in 40..230) continue
            val dt = ((sorted[i].timestamp - sorted[i - 1].timestamp) / 1000.0).coerceIn(0.0, 10.0)
            secs[when { hr >= 160 -> 0; hr >= 140 -> 1; hr >= 120 -> 2; else -> 3 }] += dt
        }
        secs
    }
    val total = bands.sum()
    if (total < 60) return
    val labels = listOf("160+ bpm", "140–159 bpm", "120–139 bpm", "Under 120")
    val colors = listOf(SummaryColors.slower, SummaryColors.orange, SummaryColors.onPace, SummaryColors.easy)
    val biggest = bands.max().coerceAtLeast(1.0)
    val hard = bands[0]
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Eyebrow("Pulse")
        SummaryTitle(if (hard >= 60) "${formatPaceSec(hard.toInt())} above 160 bpm" else "Time in each heart-rate range")
        SummaryCard {
            if (avgHr != null && avgHr > 0) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("$avgHr", color = Colors.textPrimary, fontSize = 36.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(10.dp))
                    Text("avg bpm" + (maxHr?.takeIf { it > 0 }?.let { " · max $it" } ?: ""), color = Colors.textSecondary,
                        fontSize = 13.sp, modifier = Modifier.padding(bottom = 6.dp))
                }
            }
            bands.forEachIndexed { i, s ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(labels[i], color = Colors.textSecondary, fontSize = 13.sp)
                        Text("${formatPaceSec(s.roundToInt())} · ${(s / total * 100).roundToInt()}%", color = Colors.textPrimary,
                            fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(SummaryColors.track)) {
                        Box(Modifier.fillMaxWidth((s / biggest).toFloat().coerceAtLeast(0.02f)).fillMaxHeight()
                            .clip(RoundedCornerShape(5.dp)).background(colors[i]))
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Km splits: bar length = pace (longer = slower)
// ─────────────────────────────────────────────────────────────────────────────

private data class KmExtras(val hr: Int?, val cadence: Int?, val climbM: Int?)

/** Average HR and cadence and the climb in each whole km of the track, by distance along it. */
private fun kmExtras(points: List<LocationPoint>): List<KmExtras> {
    if (points.size < 10) return emptyList()
    val sorted = points.sortedBy { it.timestamp }
    val out = ArrayList<KmExtras>()
    var cum = 0.0
    var km = 0
    val hr = ArrayList<Int>(); val cad = ArrayList<Int>()
    var climb = 0.0
    var lastAlt: Double? = null
    fun flush() {
        out += KmExtras(hr.takeIf { it.isNotEmpty() }?.average()?.roundToInt(),
            cad.takeIf { it.isNotEmpty() }?.average()?.roundToInt(),
            if (lastAlt != null) climb.roundToInt() else null)
        hr.clear(); cad.clear(); climb = 0.0
    }
    var smoothAlt: Double? = null
    for (i in sorted.indices) {
        val p = sorted[i]
        if (i > 0) cum += metresBetween(sorted[i - 1], p)
        while (cum >= (km + 1) * 1000.0) { flush(); km++ }
        p.heartRate?.takeIf { it in 40..230 }?.let { hr += it }
        p.cadence?.takeIf { it in 60..240 }?.let { cad += it }
        p.altitude?.let { a ->
            smoothAlt = smoothAlt?.let { it * 0.8 + a * 0.2 } ?: a
            val s = smoothAlt!!
            lastAlt?.let { if (s > it) climb += s - it }
            lastAlt = s
        }
    }
    flush()
    return out
}

@Composable
fun KmSplitBarsCard(kmSplits: List<KmSplit>, distanceKm: Double, points: List<LocationPoint>) {
    val paces = kmSplits.map { parseSplitPace(it.pace) }
    if (paces.count { it > 0 } < 2) return
    val wholeKm = kotlin.math.floor(distanceKm + 0.03).toInt()
    // A last split past the whole kilometres is a part-km: grey, and not part of the average.
    fun isPart(i: Int) = i == kmSplits.lastIndex && kmSplits.size > wholeKm
    val full = paces.filterIndexed { i, p -> p > 0 && !isPart(i) }
    val avg = if (full.isNotEmpty()) full.average() else paces.filter { it > 0 }.average()
    val fastest = full.minOrNull()
    val longest = paces.max().toDouble().coerceAtLeast(1.0)
    val extras = remember(points) { kmExtras(points) }
    val fastestIdx = paces.indexOfFirst { it == fastest }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Eyebrow("Km splits · shorter bar = faster")
        if (fastestIdx >= 0) SummaryTitle("Km ${fastestIdx + 1} was your fastest at ${formatPaceSec(fastest!!)}/km")
        SummaryCard {
            kmSplits.forEachIndexed { i, s ->
                val pace = paces[i]
                val part = isPart(i)
                val slower = !part && pace > 0 && SummaryPaceRule.isNoticeablySlower(pace, avg)
                val color = when { part -> SummaryColors.easy; slower -> SummaryColors.slower; else -> SummaryColors.onPace }
                val partLabel = if (part) "Last %.2f km".format(distanceKm - wholeKm) else "Km ${i + 1}"
                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                        Text(partLabel + if (i == fastestIdx) " · fastest" else "",
                            color = if (i == fastestIdx) SummaryColors.onPace else Colors.textSecondary,
                            fontSize = 13.sp, fontWeight = if (i == fastestIdx) FontWeight.SemiBold else FontWeight.Normal)
                        Text(if (pace > 0) formatPaceSec(pace) else "–", fontSize = 18.sp, fontWeight = FontWeight.Bold,
                            color = when { part -> Colors.textSecondary; slower -> Color(0xFFFFC2CA); else -> Colors.textPrimary })
                    }
                    Box(Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(6.dp)).background(SummaryColors.track)) {
                        if (pace > 0) Box(Modifier.fillMaxWidth((pace / longest).toFloat().coerceIn(0.04f, 1f)).fillMaxHeight()
                            .clip(RoundedCornerShape(6.dp)).background(Brush.horizontalGradient(listOf(color.copy(alpha = 0.25f), color))))
                    }
                    extras.getOrNull(i)?.let { e ->
                        val chips = listOfNotNull(e.hr?.let { "$it bpm" }, e.cadence?.let { "$it spm" },
                            e.climbM?.let { if (it >= 2) "+$it m" else "flat" })
                        if (chips.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            chips.forEach {
                                Text(it, color = Colors.textSecondary, fontSize = 11.sp,
                                    modifier = Modifier.clip(RoundedCornerShape(50)).background(SummaryColors.track)
                                        .padding(horizontal = 8.dp, vertical = 3.dp))
                            }
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                LegendDot(SummaryColors.onPace, "On pace")
                LegendDot(SummaryColors.slower, "10%+ slower than average")
            }
        }
    }
}

private fun parseSplitPace(p: String): Int {
    val parts = p.trim().substringBefore("/").split(":")
    if (parts.size != 2) return 0
    val m = parts[0].trim().toIntOrNull() ?: return 0
    val s = parts[1].trim().toIntOrNull() ?: return 0
    return (m * 60 + s).takeIf { it in 60..3600 } ?: 0
}
