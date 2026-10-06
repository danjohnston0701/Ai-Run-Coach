package live.airuncoach.airuncoach.navigation

import com.google.gson.Gson
import com.google.gson.JsonObject
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Replays simulated runs (tools/nav-sim/generate-fixtures.ts → src/test/resources/nav) through the
 * production [RouteNavigator] and writes what the runner would hear to build/nav-sim/android/.
 * tools/nav-sim/evaluate.ts scores those transcripts (and the iOS ones) against the true position.
 *
 * The assertions here are the hard guarantees; timing quality is reported by evaluate.ts.
 */
class RouteNavigatorSimulationTest {

    private val fixturesDir = File("src/test/resources/nav")
    private val outDir = File("build/nav-sim/android").apply { mkdirs() }
    private val gson = Gson()

    @Test
    fun replayAllFixtures() {
        val files = fixturesDir.listFiles { f -> f.extension == "json" }?.sortedBy { it.name }.orEmpty()
        assertTrue("no fixtures in $fixturesDir — run tools/nav-sim/generate-fixtures.ts", files.isNotEmpty())
        val failures = mutableListOf<String>()

        for (file in files) {
            val fx = gson.fromJson(file.readText(), JsonObject::class.java)
            val id = fx["id"].asString
            val points = fx["route"].asJsonObject["points"].asJsonArray.map {
                val a = it.asJsonArray; RouteNavigator.GeoPoint(a[0].asDouble, a[1].asDouble)
            }
            val turns = fx["turns"].asJsonArray.map {
                val o = it.asJsonObject
                RouteNavigator.NavTurn(
                    text = o["text"].asString, lat = o["lat"].asDouble, lng = o["lng"].asDouble,
                    routeMetersHint = o["distance"].asDouble,
                    streetName = o["streetName"]?.takeIf { s -> !s.isJsonNull }?.asString,
                )
            }
            val nav = RouteNavigator(points, turns)
            val transcript = mutableListOf<Map<String, Any?>>()
            for (f in fx["fixes"].asJsonArray) {
                val o = f.asJsonObject
                val t = o["t"].asLong
                val cues = nav.update(o["lat"].asDouble, o["lng"].asDouble, o["acc"].asDouble, o["speed"].asDouble, t)
                // NAV_DEBUG=<fixture id>:<fromSec>-<toSec> prints the engine state per fix
                System.getenv("NAV_DEBUG")?.split(":")?.takeIf { it[0] == id }?.let { d ->
                    val (a, b) = d[1].split("-").map { it.toLong() * 1000 }
                    if (t in a..b) println("DBG $id t=${t / 1000} s=${o["s"]} acc=${o["acc"]} ${nav.state()} cues=$cues")
                }
                for (c in cues) {
                    transcript += mapOf(
                        "t" to t, "kind" to c.kind.name, "text" to c.text, "turnIndex" to c.turnIndex,
                        "s" to o["s"]?.takeIf { !it.isJsonNull }?.asDouble,
                    )
                }
            }
            File(outDir, "$id.json").writeText(gson.toJson(mapOf("id" to id, "platform" to "android", "cues" to transcript)))

            // Hard guarantees
            val behaviour = fx["behaviour"].asString
            val offRouteCues = transcript.count { it["kind"] == "OFF_ROUTE" }
            if (!fx["expectOffRoute"].asBoolean && offRouteCues > 0) failures += "$id: $offRouteCues false off-route cue(s)"
            if (behaviour in listOf("missed_turn", "wrong_turn") && offRouteCues == 0) failures += "$id: deviation never flagged"
            if (behaviour in listOf("missed_turn", "wrong_turn") && transcript.none { it["kind"] == "REJOIN" }) failures += "$id: never told back on route"
            // Every turn gets its "now" cue
            val nowTurns = transcript.filter { it["kind"] == "TURN_NOW" }.map { it["turnIndex"] }.toSet()
            val missingNow = turns.indices.filter { it !in nowTurns }
            if (missingNow.isNotEmpty()) failures += "$id: no \"now\" cue for turn(s) $missingNow"
            // Back at a MISSED turn the original left is now a right (and vice versa); back from a
            // WRONG turn the runner just carries on.
            fx["deviationTurn"]?.takeIf { !it.isJsonNull }?.asInt?.let { k ->
                val first = turns[k].text.substringBefore(", then")
                val orig = when { Regex("\\bleft\\b", RegexOption.IGNORE_CASE).containsMatchIn(first) -> "left"
                                  Regex("\\bright\\b", RegexOption.IGNORE_CASE).containsMatchIn(first) -> "right"; else -> null }
                val rejoin = (transcript.firstOrNull { it["kind"] == "REJOIN" }?.get("text") as? String)?.substringBefore("Next:") ?: ""
                val said = when { rejoin.contains("turn left", true) -> "left"; rejoin.contains("turn right", true) -> "right"; else -> "straight" }
                val expected = if (behaviour == "missed_turn") (if (orig == "left") "right" else if (orig == "right") "left" else null) else "straight"
                if (expected != null && said != expected) failures += "$id: rejoin said \"$said\", expected \"$expected\""
            }
        }
        assertTrue("Navigation simulation failures:\n" + failures.joinToString("\n"), failures.isEmpty())
    }
}
