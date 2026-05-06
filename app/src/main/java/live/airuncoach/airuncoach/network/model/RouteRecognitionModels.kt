package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

// ─── Request ──────────────────────────────────────────────────────────────────

data class RouteRecognitionRequest(
    @SerializedName("latitude") val latitude: Double,
    @SerializedName("longitude") val longitude: Double,
    @SerializedName("timestamp") val timestamp: Long,          // epoch millis
    @SerializedName("intendedDistanceKm") val intendedDistanceKm: Double? = null
)

// ─── Response ─────────────────────────────────────────────────────────────────

data class RouteRecognitionResponse(
    @SerializedName("matched") val matched: Boolean,
    @SerializedName("confidence") val confidence: Double,      // 0.0–1.0
    @SerializedName("confidenceLabel") val confidenceLabel: String, // "none"|"tentative"|"confident"|"certain"
    @SerializedName("knownRoute") val knownRoute: KnownRouteInfo?,
    @SerializedName("routeIntelligence") val routeIntelligence: RouteIntelligenceData?,
    @SerializedName("confidenceBreakdown") val confidenceBreakdown: ConfidenceBreakdown?
)

data class KnownRouteInfo(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("runCount") val runCount: Int,
    @SerializedName("typicalDistanceKm") val typicalDistanceKm: Double,
    @SerializedName("terrainType") val terrainType: String,
    @SerializedName("elevationProfile") val elevationProfile: List<ElevationPoint>,
    @SerializedName("notableSegments") val notableSegments: List<NotableSegment>
)

data class ElevationPoint(
    @SerializedName("pct") val pct: Double,    // 0.0–1.0 position along route
    @SerializedName("altM") val altM: Double   // altitude in metres
)

data class NotableSegment(
    @SerializedName("name") val name: String,
    @SerializedName("startPct") val startPct: Double,
    @SerializedName("endPct") val endPct: Double,
    @SerializedName("gradient") val gradient: Double,     // % average gradient
    @SerializedName("severity") val severity: String,    // "easy"|"moderate"|"hard"|"brutal"
    @SerializedName("coachingNote") val coachingNote: String
)

data class RouteIntelligenceData(
    @SerializedName("personalBest") val personalBest: RouteTimeRecord?,
    @SerializedName("lastRunStats") val lastRunStats: LastRunStats?,
    @SerializedName("averageSplits") val averageSplits: List<SplitComparison>,
    @SerializedName("splitCount") val splitCount: Int,
    @SerializedName("preRunBrief") val preRunBrief: String
)

data class RouteTimeRecord(
    @SerializedName("timeMs") val timeMs: Long,
    @SerializedName("formatted") val formatted: String,   // "27:12"
    @SerializedName("date") val date: String              // "3 days ago", "April 12"
)

data class LastRunStats(
    @SerializedName("timeMs") val timeMs: Long,
    @SerializedName("formatted") val formatted: String,
    @SerializedName("date") val date: String,
    @SerializedName("kmSplits") val kmSplits: List<KmSplitHistory>
)

data class KmSplitHistory(
    @SerializedName("km") val km: Int,
    @SerializedName("time") val time: Int,               // seconds for this km
    @SerializedName("pace") val pace: String             // "mm:ss"
)

data class SplitComparison(
    @SerializedName("km") val km: Int,
    @SerializedName("avgSecPerKm") val avgSecPerKm: Int?,
    @SerializedName("lastRunSecPerKm") val lastRunSecPerKm: Int?,
    @SerializedName("deltaVsLastRunSec") val deltaVsLastRunSec: Int?,  // positive = faster
    @SerializedName("deltaVsAvgSec") val deltaVsAvgSec: Int?
)

data class ConfidenceBreakdown(
    @SerializedName("gpsProximity") val gpsProximity: ConfidenceSignal,
    @SerializedName("distanceMatch") val distanceMatch: ConfidenceSignal,
    @SerializedName("dayOfWeek") val dayOfWeek: ConfidenceSignal,
    @SerializedName("timeOfDay") val timeOfDay: ConfidenceSignal,
    @SerializedName("runFrequency") val runFrequency: ConfidenceSignal,
    @SerializedName("total") val total: Int
)

data class ConfidenceSignal(
    @SerializedName("score") val score: Int,
    @SerializedName("max") val max: Int,
    @SerializedName("note") val note: String
)

// ─── Route Intelligence context injected into PaceUpdate ─────────────────────
// This mirrors the RouteIntelligenceContext interface in ai-service.ts

data class RouteIntelligenceContext(
    @SerializedName("routeName") val routeName: String,
    @SerializedName("confidence") val confidence: Double,
    @SerializedName("personalBestFormatted") val personalBestFormatted: String?,
    @SerializedName("lastRunFormatted") val lastRunFormatted: String?,
    @SerializedName("lastRunDate") val lastRunDate: String?,
    @SerializedName("splitComparisons") val splitComparisons: List<SplitComparisonContext>?,
    @SerializedName("notableSegments") val notableSegments: List<NotableSegment>?,
    @SerializedName("typicalDistanceKm") val typicalDistanceKm: Double?
)

data class SplitComparisonContext(
    @SerializedName("km") val km: Int,
    @SerializedName("lastRunSecPerKm") val lastRunSecPerKm: Int?,
    @SerializedName("avgSecPerKm") val avgSecPerKm: Int?
)
