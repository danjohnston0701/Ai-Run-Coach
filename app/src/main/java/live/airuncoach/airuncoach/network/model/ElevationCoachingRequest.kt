package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

data class ElevationCoachingRequest(
    @SerializedName("eventType") val eventType: String, // uphill, downhill, hill_top, downhill_finish, flat_terrain
    @SerializedName("distance") val distance: Double,
    @SerializedName("elapsedTime") val elapsedTime: Long,
    @SerializedName("currentGrade") val currentGrade: Double,
    @SerializedName("segmentDistanceMeters") val segmentDistanceMeters: Double,
    @SerializedName("totalElevationGain") val totalElevationGain: Double,
    @SerializedName("totalElevationLoss") val totalElevationLoss: Double,
    @SerializedName("hasRoute") val hasRoute: Boolean,
    @SerializedName("coachName") val coachName: String?,
    @SerializedName("coachTone") val coachTone: String?,
    @SerializedName("coachGender") val coachGender: String?,
    @SerializedName("coachAccent") val coachAccent: String?,
    @SerializedName("activityType") val activityType: String,

    // Cross-metric context: how the runner is performing RIGHT NOW
    @SerializedName("currentPace") val currentPace: String? = null,
    @SerializedName("averagePace") val averagePace: String? = null,
    @SerializedName("heartRate") val heartRate: Int? = null,
    @SerializedName("cadence") val cadence: Int? = null,
    @SerializedName("avgCadence") val avgCadence: Int? = null,

    // Per-km split data with elevation context
    @SerializedName("kmSplitSummaries") val kmSplitSummaries: List<KmSplitElevation>? = null,

    // Terrain classification for the run so far
    @SerializedName("terrainProfile") val terrainProfile: String? = null, // flat, undulating, hilly, mountainous
    @SerializedName("elevationPerKm") val elevationPerKm: Double? = null, // avg metres gained per km
    @SerializedName("maxGradientSoFar") val maxGradientSoFar: Double? = null,
    // Altitude range so far (highest − lowest, m) and live wind — see WindContext / PaceUpdate.
    @SerializedName("elevationRangeM") val elevationRangeM: Double? = null,
    @SerializedName("wind") val wind: WindContext? = null,

    // Segment-specific elevation context
    @SerializedName("segmentElevationGain") val segmentElevationGain: Double? = null,
    @SerializedName("segmentElevationLoss") val segmentElevationLoss: Double? = null,

    // Pace consistency — how steady have they been?
    @SerializedName("paceSpreadSeconds") val paceSpreadSeconds: Int? = null, // fastest-to-slowest split spread
    @SerializedName("isNegativeSplitting") val isNegativeSplitting: Boolean? = null,

    // Runner experience — used to tailor tone (softer for newcomers/beginners with little history)
    @SerializedName("fitnessLevel") val fitnessLevel: String? = null,
    @SerializedName("totalRunsAllTime") val totalRunsAllTime: Int? = null,

    // ── Cross-platform terrain state contract (matches iOS TERRAIN_AWARENESS_SPEC) ──
    // terrain_state: the confirmed current state from the 150m-hysteresis classifier.
    //   Values: flat | rolling | gradual_climb | steep_climb | gradual_descent | steep_descent
    @SerializedName("terrain_state") val terrainState: String? = null,
    // distance_in_state_m: metres already travelled in the confirmed terrain state.
    //   Lets the backend calibrate language ("you've been climbing for 300m" vs "just started").
    @SerializedName("distance_in_state_m") val distanceInStateM: Double? = null,
    // has_route_elevation_ahead: true only when route elevation lookahead data exists.
    //   When false (current Android behaviour) the backend MUST NOT say "the top is coming",
    //   "enjoy the downhill ahead", or any prediction about future terrain.
    @SerializedName("has_route_elevation_ahead") val hasRouteElevationAhead: Boolean = false
)

data class KmSplitElevation(
    @SerializedName("km") val km: Int,
    @SerializedName("pace") val pace: String,
    @SerializedName("elevGain") val elevGain: Int, // metres gained in this km
    @SerializedName("elevLoss") val elevLoss: Int, // metres lost in this km
    @SerializedName("avgGrade") val avgGrade: Double // average gradient %
)