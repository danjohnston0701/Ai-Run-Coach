package live.airuncoach.airuncoach.navigation

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Turn-by-turn navigation for a run along a planned route. Pure Kotlin (no Android types) so the
 * exact production logic can be replayed against simulated runs in JVM unit tests
 * (RouteNavigatorSimulationTest). iOS has a line-for-line port in RouteNavigator.swift — keep the
 * two in step.
 *
 * Progress is measured ALONG the route: every fix is projected onto the nearest polyline SEGMENT
 * (cross-track distance + metres along the route), so running the far pavement, cutting a corner
 * or crossing a roundabout never stalls or skips a turn. Per turn the runner hears:
 *   • a warning ~100 m out ("In 100 metres, turn left onto King Street") — pace-scaled so it is
 *     always ~30 s of running, clamped to 100–160 m;
 *   • a "now" cue at the turn (≤ 25 m, confirmed on two fixes so one GPS jump can't fake it).
 * Turns closer together than CLOSE_TURN_M arrive pre-chained from the server ("…, then right onto
 * Queen Street"), so the second one gets no separate warning — just its own "now" cue.
 *
 * Off route = cross-track beyond max(50 m, accuracy + 30 m) on 3 consecutive checks AND at least
 * 25 m of actual movement (so standing at lights in GPS drift never trips it). The cue then says
 * how to get back: a missed turn ("go back about 80 metres and turn left onto King Street"), or
 * where the route is relative to the runner's direction of travel (ahead / left / right / behind
 * — never compass bearings), plus "check the map" when it's far or direction is unknown.
 */
class RouteNavigator(
    routePoints: List<GeoPoint>,
    turns: List<NavTurn>,
    private val config: Config = Config(),
) {
    data class GeoPoint(val lat: Double, val lng: Double)

    /** One spoken instruction. [routeMetersHint] is used only when there is no polyline. */
    data class NavTurn(
        val text: String,
        val lat: Double,
        val lng: Double,
        val routeMetersHint: Double = 0.0,
        val streetName: String? = null,
    )

    enum class CueKind { WARNING, TURN_NOW, REORIENT, OFF_ROUTE, OFF_ROUTE_REMINDER, REJOIN, LAST_TURN, ROUTE_COMPLETE }

    /** [turnIndex] = the instruction the cue is about (null for off-route / completion cues). */
    data class Cue(val kind: CueKind, val text: String, val turnIndex: Int? = null)

    data class Config(
        val checkIntervalMs: Long = 2_000,
        val warningLeadSeconds: Double = 30.0,
        val warningMinM: Double = 100.0,
        val warningMaxM: Double = 160.0,
        val turnNowM: Double = 25.0,
        val skipBehindM: Double = 60.0,
        val offRouteBaseM: Double = 50.0,
        val offRouteAccuracyMarginM: Double = 30.0,
        val rejoinM: Double = 30.0,
        val offRouteStrikes: Int = 3,
        val offRouteMinTravelM: Double = 25.0,
        val maxAccuracyM: Double = 40.0,
        val searchAheadM: Double = 400.0,
        val oppositeDirectionPenaltyM: Double = 40.0,
        val jumpAllowanceM: Double = 40.0,        // along-route slack per check beyond what the runner could cover
        val maxSpeedMps: Double = 6.5,
        val shortcutGainRatio: Double = 2.5,      // a shortcut may gain at most this × the straight-line distance run
        val completionM: Double = 30.0,
        val closeTurnM: Double = 60.0,
        val missedTurnWindowM: Double = 60.0,
        val offRouteReminderMs: Long = 45_000,
        val offRouteMaxReminders: Int = 3,
        val defaultSpeedMps: Double = 2.8,
        val headingWindowMs: Long = 25_000,       // smoothed heading for spoken guidance
        val headingMinSpanM: Double = 25.0,
        val matchHeadingWindowMs: Long = 8_000,   // responsive heading for route matching
        val matchHeadingMinSpanM: Double = 12.0,
        val rejoinTurnAngle: Double = 45.0,
    )

    /** Snapshot for the map HUD — the screen and the voice read the same state. */
    data class State(
        val nextTurnIndex: Int,
        val nextInstruction: String?,
        val distanceToNextTurnM: Double?,
        val progressIndex: Int,
        val progressMeters: Double,
        val routeRemainingM: Double,
        val isOffRoute: Boolean,
        val offRouteDistanceM: Double?,
        val crossTrackM: Double? = null,
    )

    private data class Projection(val segmentIndex: Int, val crossTrackM: Double, val routeMeters: Double, val lat: Double, val lng: Double)
    private data class Fix(val timeMs: Long, val lat: Double, val lng: Double)

    private val pts: List<GeoPoint> = routePoints
    private val turns: List<NavTurn> = turns
    private val cum: DoubleArray = DoubleArray(pts.size)
    val totalMeters: Double
    private val turnMeters: DoubleArray = DoubleArray(turns.size)

    private var progressIndex = 0
    private var progressMeters = 0.0
    private var nextTurn = 0
    private val warned = HashSet<Int>()
    private val announced = HashSet<Int>()
    private var reachedFixes = 0
    private var offRoute = false
    private var strikes = 0
    private var strikeStart: Fix? = null
    private var offRouteLastCueMs = 0L
    private var offRouteLastCueXt = 0.0
    private var offRouteReminders = 0
    private var lastCrossTrack: Double? = null
    private var completionAnnounced = false
    private var lastCheckMs = Long.MIN_VALUE
    private var lastProgressMs = Long.MIN_VALUE
    private var lastOnRoute: Fix? = null
    private val recent = ArrayDeque<Fix>()

    init {
        for (i in 1 until pts.size) cum[i] = cum[i - 1] + distanceM(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng)
        totalMeters = if (pts.isEmpty()) 0.0 else cum[pts.size - 1]
        // Instructions sit on polyline vertices. A route that passes the same roundabout or corner
        // twice has two vertices at that spot, so the server's along-route distance picks the right
        // pass; without usable hints (an older server sent each leg's length, not metres from the
        // start), search forward from the previous instruction.
        val hintsUsable = pts.isNotEmpty() && turns.isNotEmpty() &&
            turns.zipWithNext().all { (a, b) -> b.routeMetersHint >= a.routeMetersHint } &&
            turns.last().routeMetersHint in 1.0..(totalMeters + 50)
        var searchFrom = 0
        turns.forEachIndexed { i, t ->
            if (pts.isEmpty()) { turnMeters[i] = t.routeMetersHint; return@forEachIndexed }
            var best = -1
            if (hintsUsable) {
                var bestGap = Double.MAX_VALUE
                for (j in pts.indices) {
                    if (distanceM(t.lat, t.lng, pts[j].lat, pts[j].lng) > 20) continue
                    val gap = abs(cum[j] - t.routeMetersHint)
                    if (gap < bestGap) { bestGap = gap; best = j }
                }
            }
            if (best < 0) {
                var bestD = Double.MAX_VALUE
                for (j in searchFrom until pts.size) {
                    val d = distanceM(t.lat, t.lng, pts[j].lat, pts[j].lng)
                    if (d < bestD) { bestD = d; best = j }
                }
            }
            turnMeters[i] = cum[best]
            searchFrom = best
        }
    }

    val hasRoute: Boolean get() = turns.isNotEmpty()

    fun state(): State {
        val next = turns.getOrNull(nextTurn)
        return State(
            nextTurnIndex = nextTurn,
            nextInstruction = next?.text,
            distanceToNextTurnM = next?.let { max(0.0, turnMeters[nextTurn] - progressMeters) },
            progressIndex = progressIndex,
            progressMeters = progressMeters,
            routeRemainingM = max(0.0, totalMeters - progressMeters),
            isOffRoute = offRoute,
            offRouteDistanceM = if (offRoute) lastCrossTrack else null,
            crossTrackM = lastCrossTrack,
        )
    }

    /**
     * Feed every location fix. Returns the cues to speak now (usually none). [timeMs] is the fix
     * time; checks run at most every [Config.checkIntervalMs].
     */
    fun update(lat: Double, lng: Double, accuracyM: Double, speedMps: Double?, timeMs: Long): List<Cue> {
        if (turns.isEmpty() && pts.size < 2) return emptyList()
        if (accuracyM <= config.maxAccuracyM) {
            recent.addLast(Fix(timeMs, lat, lng))
            while (recent.size > 2 && timeMs - recent.first().timeMs > 30_000) recent.removeFirst()
        }
        if (lastCheckMs != Long.MIN_VALUE && timeMs - lastCheckMs < config.checkIntervalMs) return emptyList()
        lastCheckMs = timeMs
        // Noisy fix: don't let a 40 m jump fake a turn or an off-route. Skip, don't stop.
        if (accuracyM > config.maxAccuracyM) return emptyList()

        val cues = ArrayList<Cue>(2)
        val projection = project(lat, lng, accuracyM, timeMs)
        if (projection != null) {
            lastCrossTrack = projection.crossTrackM
            val offCue = updateOffRoute(projection, lat, lng, accuracyM, timeMs)
            if (offCue != null) cues += offCue
            if (offRoute) return cues
            progressIndex = projection.segmentIndex
            progressMeters = max(progressMeters, projection.routeMeters)
            lastProgressMs = timeMs
            lastOnRoute = Fix(timeMs, lat, lng)
        }

        if (nextTurn >= turns.size) {
            completionCue()?.let { cues += it }
            return cues
        }

        // ── Advance past anything already behind the runner (along the route) ──
        var skipped = 0
        while (nextTurn < turns.size && turnMeters[nextTurn] < progressMeters - config.skipBehindM) {
            if (nextTurn !in announced) skipped++
            nextTurn++
            reachedFixes = 0
        }
        if (nextTurn >= turns.size) {
            completionCue()?.let { cues += it }
            return cues
        }
        if (skipped > 0) {
            warned += nextTurn
            val ahead = roundTo10(turnMeters[nextTurn] - progressMeters)
            cues += Cue(CueKind.REORIENT, "Next: in about $ahead metres, ${lowerFirst(turns[nextTurn].text)}", nextTurn)
            return cues
        }

        val along = turnMeters[nextTurn] - progressMeters
        val distanceToTurn = if (projection != null) along
            else distanceM(lat, lng, turns[nextTurn].lat, turns[nextTurn].lng)
        val speed = speedMps?.takeIf { it > 0.5 } ?: recentSpeed() ?: config.defaultSpeedMps
        val warnDistance = (speed * config.warningLeadSeconds).coerceIn(config.warningMinM, config.warningMaxM)

        // ── "Now" cue: two consecutive fixes inside the radius, or one once actually past it ──
        val atTurn = distanceToTurn <= config.turnNowM
        reachedFixes = if (atTurn) reachedFixes + 1 else 0
        if (reachedFixes >= 2 || (atTurn && distanceToTurn <= 5.0)) {
            if (nextTurn !in announced) {
                announced += nextTurn
                // Last turn right by the finish: say so now — a runner who stops at the finish
                // would never hear a separate "end of the route".
                val endsJustAfter = nextTurn == turns.size - 1 && pts.size >= 2 && totalMeters - turnMeters[nextTurn] <= 60
                if (endsJustAfter) completionAnnounced = true
                cues += Cue(CueKind.TURN_NOW,
                    if (endsJustAfter) "${turns[nextTurn].text}. The end of the route is just after that." else turns[nextTurn].text, nextTurn)
            }
            reachedFixes = 0
            val passed = nextTurn
            nextTurn++
            // A turn chained onto this one was already announced in its "then …" — no separate warning.
            if (nextTurn < turns.size && turnMeters[nextTurn] - turnMeters[passed] < config.closeTurnM) warned += nextTurn
            if (nextTurn >= turns.size) {
                val toFinish = totalMeters - turnMeters[passed]
                if (pts.size >= 2 && toFinish > 150) {
                    cues += Cue(CueKind.LAST_TURN, "That's the last turn. About ${spokenDistance(toFinish)} to the end of the route.")
                }
            }
            return cues
        }

        // ── Advance warning ──
        if (distanceToTurn <= warnDistance && nextTurn !in warned) {
            warned += nextTurn
            cues += Cue(CueKind.WARNING, "In ${roundTo10(distanceToTurn)} metres, ${lowerFirst(turns[nextTurn].text)}", nextTurn)
        }
        return cues
    }

    // ── Off-route ────────────────────────────────────────────────────────────

    private fun updateOffRoute(p: Projection, lat: Double, lng: Double, accuracyM: Double, timeMs: Long): Cue? {
        val threshold = max(config.offRouteBaseM, accuracyM + config.offRouteAccuracyMarginM)
        if (!offRoute) {
            if (p.crossTrackM > threshold) {
                strikes++
                if (strikes == 1) strikeStart = Fix(timeMs, lat, lng)
                val travelled = strikeStart?.let { distanceM(it.lat, it.lng, lat, lng) } ?: 0.0
                if (strikes >= config.offRouteStrikes && travelled >= config.offRouteMinTravelM) {
                    offRoute = true
                    strikes = 0
                    offRouteLastCueMs = timeMs
                    offRouteLastCueXt = p.crossTrackM
                    offRouteReminders = 0
                    return Cue(CueKind.OFF_ROUTE, offRouteGuidance(p, lat, lng, first = true))
                }
            } else {
                strikes = 0
                strikeStart = null
            }
            return null
        }
        if (p.crossTrackM <= config.rejoinM) {
            offRoute = false
            strikes = 0
            strikeStart = null
            progressIndex = p.segmentIndex
            progressMeters = max(progressMeters, p.routeMeters)
            while (nextTurn < turns.size && turnMeters[nextTurn] < progressMeters - config.skipBehindM) nextTurn++
            reachedFixes = 0
            // Which way now, relative to how they're moving. Near a junction (the usual case after
            // going back to a missed turn) it's the turn AT the junction: from the direction they
            // approach it to the direction the route leaves it. Otherwise it's where a point 30 m
            // along the route lies relative to their direction of travel. (The route's own direction
            // at the rejoin point is no good near a junction — the match can land on the street
            // leading into the turn.)
            val heading = recentHeading()
            val junctionM = turnMeters.firstOrNull { it > p.routeMeters - 5 && it <= p.routeMeters + 40 }
            var atJunction = false
            val aimM: Double
            val rel: Double = if (junctionM != null) {
                val j = pointAt(junctionM)
                aimM = junctionM + 25
                val aim = pointAt(aimM)
                val toJunction = distanceM(lat, lng, j.lat, j.lng)
                atJunction = toJunction >= 15
                val approach = if (toJunction >= 10) bearingDeg(lat, lng, j.lat, j.lng) else heading
                approach?.let { normalise180(bearingDeg(j.lat, j.lng, aim.lat, aim.lng) - it) } ?: 0.0
            } else {
                aimM = p.routeMeters + 30
                val aim = pointAt(aimM)
                heading?.let { normalise180(bearingDeg(lat, lng, aim.lat, aim.lng) - it) } ?: 0.0
            }
            val onto = streetAt(aimM)?.let { " onto $it" } ?: ""
            val where = if (atJunction) "At the junction, turn" else "Turn"
            when {
                abs(rel) > 140 -> return Cue(CueKind.REJOIN, "You're back on the route, but heading the wrong way. Turn around.")
                rel > config.rejoinTurnAngle -> return Cue(CueKind.REJOIN, "You're back on the route. $where right$onto.")
                rel < -config.rejoinTurnAngle -> return Cue(CueKind.REJOIN, "You're back on the route. $where left$onto.")
            }
            val next = turns.getOrNull(nextTurn) ?: return Cue(CueKind.REJOIN, "You're back on the route.")
            warned += nextTurn
            val ahead = turnMeters[nextTurn] - progressMeters
            return if (ahead <= config.turnNowM) Cue(CueKind.REJOIN, "You're back on the route. ${next.text}", nextTurn)
                   else Cue(CueKind.REJOIN, "You're back on the route. Next: in about ${roundTo10(ahead)} metres, ${lowerFirst(next.text)}", nextTurn)
        }
        // Still off: remind only if it's been a while AND they're getting further away.
        if (offRouteReminders < config.offRouteMaxReminders &&
            timeMs - offRouteLastCueMs >= config.offRouteReminderMs &&
            p.crossTrackM >= offRouteLastCueXt + 20.0) {
            offRouteReminders++
            offRouteLastCueMs = timeMs
            offRouteLastCueXt = p.crossTrackM
            return Cue(CueKind.OFF_ROUTE_REMINDER, offRouteGuidance(p, lat, lng, first = false))
        }
        return null
    }

    /**
     * How to get back. A turn the runner just went past → "go back and take it". Otherwise where
     * the route is relative to their direction of travel (never compass bearings).
     */
    private fun offRouteGuidance(p: Projection, lat: Double, lng: Double, first: Boolean): String {
        val lead = if (first) "You're off the route." else "You're still off the route."
        // Missed turn: they left the line right at a turn (the projection is pinned to it).
        val missed = (0 until turns.size).firstOrNull { abs(turnMeters[it] - p.routeMeters) <= config.missedTurnWindowM &&
            turnMeters[it] >= progressMeters - config.missedTurnWindowM }
        if (missed != null) {
            val back = distanceM(lat, lng, turns[missed].lat, turns[missed].lng)
            if (back >= 30) {
                // No left/right here: once they turn round it would be the wrong way. The rejoin
                // cue gives the direction relative to the way they're facing then.
                val target = turns[missed].streetName?.let { "the turn onto $it" } ?: "the turn"
                return "$lead Looks like you've gone the wrong way. Head back about ${spokenDistance(back)} to $target."
            }
        }
        // General: nearest point on the route ahead (or the closest point if nothing ahead).
        val target = nearestRoutePointAhead(lat, lng) ?: p
        val dist = distanceM(lat, lng, target.lat, target.lng)
        val street = streetAt(target.routeMeters)
        val where = street?.let { ", on $it" } ?: ""
        val heading = recentHeading()
        val checkMap = " Check the map on your phone if you need to."
        if (heading == null) return "$lead The route is about ${spokenDistance(dist)} away$where.$checkMap"
        val rel = normalise180(bearingDeg(lat, lng, target.lat, target.lng) - heading)
        val direction = when {
            abs(rel) <= 40 -> "about ${spokenDistance(dist)} ahead of you"
            rel in 40.0..140.0 -> "about ${spokenDistance(dist)} to your right"
            rel in -140.0..-40.0 -> "about ${spokenDistance(dist)} to your left"
            else -> null
        }
        val body = direction?.let { "The route is $it$where." }
            ?: "Turn around — the route is about ${spokenDistance(dist)} behind you$where."
        return "$lead $body" + if (dist > 120) checkMap else ""
    }

    /** Point [m] metres along the route (clamped). */
    private fun pointAt(m: Double): GeoPoint {
        if (pts.isEmpty()) return GeoPoint(0.0, 0.0)
        val t = m.coerceIn(0.0, totalMeters)
        var lo = 0; var hi = pts.size - 1
        while (hi - lo > 1) { val mid = (lo + hi) ushr 1; if (cum[mid] <= t) lo = mid else hi = mid }
        val seg = cum[hi] - cum[lo]
        val f = if (seg > 0) (t - cum[lo]) / seg else 0.0
        return GeoPoint(pts[lo].lat + f * (pts[hi].lat - pts[lo].lat), pts[lo].lng + f * (pts[hi].lng - pts[lo].lng))
    }

    private fun streetAt(routeMeters: Double): String? {
        var name: String? = null
        for (i in turns.indices) { if (turnMeters[i] <= routeMeters + 1) name = turns[i].streetName ?: name else break }
        return name
    }

    private fun completionCue(): Cue? {
        if (completionAnnounced || pts.size < 2 || totalMeters <= 0) return null
        if (progressMeters >= totalMeters - config.completionM) {
            completionAnnounced = true
            return Cue(CueKind.ROUTE_COMPLETE, "You've reached the end of the route.")
        }
        return null
    }

    // ── Geometry ─────────────────────────────────────────────────────────────

    /**
     * Nearest-segment projection within a DISTANCE window (60 m back … 400 m ahead of progress),
     * preferring segments that run the way the runner is going. Routes often use a street twice
     * (out-and-back, a roundabout passed on the way out and back); a segment-count window used to
     * reach the return pass on sparse straight roads and jump progress a kilometre ahead. A
     * whole-route match is used only when the window is clearly off AND that match is ahead, on the
     * line and in the runner's direction (a shortcut that rejoined further along).
     */
    private fun project(lat: Double, lng: Double, accuracyM: Double, timeMs: Long): Projection? {
        if (pts.size < 2) return null
        // Responsive heading for matching (the smoothed one lags a sharp turn and would make the
        // new street look like the opposite direction); only a clear reversal is penalised anyway.
        val heading = recentHeading(config.matchHeadingWindowMs, config.matchHeadingMinSpanM)
        val from = progressMeters - config.skipBehindM
        // Continuity: how far along the route the runner could plausibly be since the last good fix.
        val dtS = if (lastProgressMs == Long.MIN_VALUE) 0.0 else (timeMs - lastProgressMs) / 1000.0
        // Before the first good fix the runner may have started a little way along the route.
        val reach = if (lastProgressMs == Long.MIN_VALUE) progressMeters + config.searchAheadM
            else min(progressMeters + config.searchAheadM, progressMeters + config.jumpAllowanceM + config.maxSpeedMps * dtS)
        val windowed = search(lat, lng, from, reach, heading)
        val threshold = max(config.offRouteBaseM, accuracyM + config.offRouteAccuracyMarginM)
        if (windowed.crossTrackM <= threshold && !offRoute) return windowed
        // Shortcut that rejoined further along: accept a whole-route match only if it is on the line,
        // in the runner's direction, and the along-route gain is believable for the straight-line
        // distance actually run (a route passing the same roundabout twice is not a 1 km shortcut).
        val global = search(lat, lng, from, Double.MAX_VALUE, heading)
        val globalHeadingOk = heading == null || !isOpposite(global.segmentIndex, heading)
        val ranM = lastOnRoute?.let { distanceM(it.lat, it.lng, lat, lng) } ?: 0.0
        // Distance-based, not time-based: after two minutes off route, "could have run 800 m" is
        // true but meaningless — what matters is how far they actually are from where they left.
        val gainOk = global.routeMeters - progressMeters <= config.jumpAllowanceM + config.shortcutGainRatio * ranM
        return if (global.crossTrackM <= config.rejoinM && globalHeadingOk && gainOk) global else windowed
    }

    private fun nearestRoutePointAhead(lat: Double, lng: Double): Projection? {
        if (pts.size < 2) return null
        var best: Projection? = null
        for (i in 0 until pts.size - 1) {
            if (cum[i + 1] < progressMeters - config.skipBehindM) continue
            val p = projectOnSegment(lat, lng, i)
            if (best == null || p.crossTrackM < best.crossTrackM) best = p
        }
        return best
    }

    /** Best segment whose span overlaps [fromM, toM]; opposite-direction segments are penalised. */
    private fun search(lat: Double, lng: Double, fromM: Double, toM: Double, heading: Double?): Projection {
        var best = Projection(progressIndex, Double.MAX_VALUE, progressMeters, lat, lng)
        var bestScore = Double.MAX_VALUE
        for (i in 0 until pts.size - 1) {
            if (cum[i + 1] < fromM) continue
            if (cum[i] > toM) break
            val p = projectOnSegment(lat, lng, i)
            var score = p.crossTrackM
            if (heading != null && isOpposite(i, heading)) score += config.oppositeDirectionPenaltyM
            if (score < bestScore) { bestScore = score; best = p }
        }
        return best
    }

    /** Segment runs against the runner's direction of travel (> 110° apart). */
    private fun isOpposite(i: Int, heading: Double): Boolean {
        if (cum[i + 1] - cum[i] < 3) return false
        val seg = bearingDeg(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng)
        return abs(normalise180(seg - heading)) > 110
    }

    /** Equirectangular local frame in metres around the runner (segments are short). */
    private fun projectOnSegment(lat: Double, lng: Double, i: Int): Projection {
        val a = pts[i]; val b = pts[i + 1]
        val mLat = 111_320.0
        val mLng = 111_320.0 * cos(lat * PI / 180)
        val bx = (b.lng - a.lng) * mLng; val by = (b.lat - a.lat) * mLat
        val px = (lng - a.lng) * mLng; val py = (lat - a.lat) * mLat
        val len2 = bx * bx + by * by
        val t = if (len2 > 0) ((px * bx + py * by) / len2).coerceIn(0.0, 1.0) else 0.0
        val cx = t * bx; val cy = t * by
        val d = sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy))
        return Projection(i, d, cum[i] + t * (cum[i + 1] - cum[i]), a.lat + t * (b.lat - a.lat), a.lng + t * (b.lng - a.lng))
    }

    /**
     * Direction of travel: from the average of the older half of the last ~25 s of fixes to the
     * average of the newer half. Two raw fixes 15 m apart can be 60° off with ordinary GPS noise,
     * which turned "carry straight on" into "turn left". Null if the runner has barely moved.
     */
    private fun recentHeading(
        windowMs: Long = config.headingWindowMs,
        minSpanM: Double = config.headingMinSpanM,
    ): Double? {
        val last = recent.lastOrNull() ?: return null
        val window = recent.filter { last.timeMs - it.timeMs <= windowMs }
        if (window.size < 4) return null
        val first = window.first()
        if (distanceM(first.lat, first.lng, last.lat, last.lng) < minSpanM) return null
        val half = window.size / 2
        val a = window.subList(0, half); val b = window.subList(half, window.size)
        return bearingDeg(a.sumOf { it.lat } / a.size, a.sumOf { it.lng } / a.size,
            b.sumOf { it.lat } / b.size, b.sumOf { it.lng } / b.size)
    }

    private fun recentSpeed(): Double? {
        if (recent.size < 2) return null
        val a = recent.first(); val b = recent.last()
        val dt = (b.timeMs - a.timeMs) / 1000.0
        if (dt < 5) return null
        val v = distanceM(a.lat, a.lng, b.lat, b.lng) / dt
        return v.takeIf { it > 0.5 }
    }

    companion object {
        fun distanceM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
            val r = 6_371_000.0
            val dLat = (lat2 - lat1) * PI / 180
            val dLng = (lng2 - lng1) * PI / 180
            val h = sin(dLat / 2) * sin(dLat / 2) + cos(lat1 * PI / 180) * cos(lat2 * PI / 180) * sin(dLng / 2) * sin(dLng / 2)
            return 2 * r * asin(min(1.0, sqrt(h)))
        }

        fun bearingDeg(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
            val p1 = lat1 * PI / 180; val p2 = lat2 * PI / 180
            val dl = (lng2 - lng1) * PI / 180
            val y = sin(dl) * cos(p2)
            val x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
            return (atan2(y, x) * 180 / PI + 360) % 360
        }

        private fun normalise180(deg: Double): Double { var d = deg % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d }

        fun roundTo10(m: Double): Int = max(10, ((m / 10.0).roundToInt() * 10))

        /** "80 metres", "350 metres", "1.2 kilometres". */
        fun spokenDistance(m: Double): String = when {
            m < 1_000 -> "${roundTo10(m)} metres"
            else -> {
                val km = (m / 100.0).roundToInt() / 10.0
                if (km == km.toInt().toDouble()) "${km.toInt()} kilometre${if (km.toInt() == 1) "" else "s"}" else "$km kilometres"
            }
        }

        private fun lowerFirst(s: String): String = if (s.isEmpty()) s else s[0].lowercaseChar() + s.substring(1)
    }
}
