package live.airuncoach.airuncoach.wear.data

import live.airuncoach.airuncoach.wear.BuildConfig
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Path
import java.util.concurrent.TimeUnit

/**
 * Direct watch->cloud HTTP path — the Wear OS analog of the Garmin watch app's DataStreamer.mc.
 * Targets the same, already-hardened `/api/garmin-companion/` endpoints the Garmin watch app
 * uses (FCM wake fallback, batch upload, dedup against phone-tracked runs) — see the backend
 * generalization in server/routes.ts (`watchDeviceLabel`/`watchExternalSource`) that lets a
 * `deviceModel` string distinguish Samsung/Wear OS sessions from Garmin ones without a
 * separate API.
 *
 * Field names below are the JSON keys — proguard-rules.pro keeps them from being renamed.
 */

data class SessionStartRequest(
    val sessionId: String,
    val deviceId: String,
    val deviceModel: String,
    val activityType: String, // "running" | "walking"
    val sessionType: String,  // "run" | "walk"
    val plannedWorkoutId: String? = null
)

data class SessionDataRequest(
    val sessionId: String,
    val timestamp: Long,
    val heartRate: Int?,
    val heartRateZone: Int?,
    val cadence: Int?,
    val pace: Double?,
    val cumulativeDistance: Double,
    val elapsedTime: Long,
    val altitude: Double?,
    val isMoving: Boolean,
    val isPaused: Boolean,
    val latitude: Double?,
    val longitude: Double?,
    val cumulativeAscent: Double? = null,
    val cumulativeDescent: Double? = null
)

data class SessionSummary(
    val totalDistance: Double,
    val totalDuration: Long,
    val avgHeartRate: Int?,
    val maxHeartRate: Int?,
    val avgCadence: Int?,
    val avgPace: Double?,
    val totalAscent: Double?,
    val totalDescent: Double?
)

data class SessionEndRequest(
    val sessionId: String,
    val sessionType: String,
    val summary: SessionSummary,
    val plannedWorkoutId: String? = null
)

data class UploadBatchRequest(
    val sessionId: String,
    val sessionType: String,
    val points: List<List<Int>>, // compact 7-field arrays, see GpsPoint
    val distanceM: Float,
    val durationSec: Int,
    val totalAscent: Float,
    val plannedWorkoutId: String? = null,
    /** Wall-clock start, epoch seconds — dates a late-synced run to when it was run. */
    val startedAtEpoch: Long? = null,
    val phoneConnected: Boolean? = null,
    val deviceModel: String? = null,
    val watchAppVersion: String? = null
)

data class UploadBatchResponse(val runId: String?)
data class SessionEndResponse(val runId: String?)

/** Outcome of one call: [ok] = 2xx; [unauthorized] = 401 (the stored token is dead). */
data class ApiResult<T>(val ok: Boolean, val value: T? = null, val unauthorized: Boolean = false)

/** The calls the watch makes, as an interface so the sync logic is unit-testable. */
interface CompanionApi {
    suspend fun startSession(body: SessionStartRequest): ApiResult<Unit>
    suspend fun sendData(body: SessionDataRequest): ApiResult<String?>
    suspend fun endSession(body: SessionEndRequest): ApiResult<String?>
    suspend fun uploadBatch(sessionId: String, body: UploadBatchRequest): ApiResult<String?>
}

private interface GarminCompanionApi {
    @POST("/api/garmin-companion/session/start")
    suspend fun startSession(@Body body: SessionStartRequest): Response<Unit>

    @POST("/api/garmin-companion/data")
    suspend fun sendData(@Body body: SessionDataRequest): Response<Map<String, Any?>>

    @POST("/api/garmin-companion/session/end")
    suspend fun endSession(@Body body: SessionEndRequest): Response<SessionEndResponse>

    @POST("/api/garmin-companion/session/{sessionId}/upload-batch")
    suspend fun uploadBatch(
        @Path("sessionId") sessionId: String,
        @Body body: UploadBatchRequest
    ): Response<UploadBatchResponse>
}

/**
 * @param onUnauthorized called whenever the server rejects the stored token (HTTP 401), with
 *   the token that was rejected — mirrors DataStreamer.mc's `_markAuthExpired()`.
 */
class DirectHttpApiClient(
    private val getAuthToken: suspend () -> String?,
    private val onUnauthorized: (rejectedToken: String) -> Unit = {}
) : CompanionApi {

    private val authInterceptor = Interceptor { chain ->
        val token = kotlinx.coroutines.runBlocking { getAuthToken() }
        val request = chain.request().newBuilder().apply {
            if (!token.isNullOrBlank()) addHeader("Authorization", "Bearer $token")
        }.build()
        val response = chain.proceed(request)
        if (response.code == 401 && !token.isNullOrBlank()) onUnauthorized(token)
        response
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        })
        // A 6-hour track is a few hundred KB — allow for a slow Bluetooth-proxied link.
        .writeTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val api: GarminCompanionApi = Retrofit.Builder()
        .baseUrl(BuildConfig.BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(GarminCompanionApi::class.java)

    private suspend fun <R, T> call(block: suspend () -> Response<R>, map: (R?) -> T): ApiResult<T> =
        try {
            val resp = block()
            ApiResult(ok = resp.isSuccessful, value = if (resp.isSuccessful) map(resp.body()) else null,
                unauthorized = resp.code() == 401)
        } catch (e: Exception) {
            ApiResult(ok = false)
        }

    override suspend fun startSession(body: SessionStartRequest): ApiResult<Unit> =
        call({ api.startSession(body) }) { Unit }

    /** Value: any "coaching" cue text piggybacked on the response. */
    override suspend fun sendData(body: SessionDataRequest): ApiResult<String?> =
        call({ api.sendData(body) }) { it?.get("coaching") as? String }

    override suspend fun endSession(body: SessionEndRequest): ApiResult<String?> =
        call({ api.endSession(body) }) { it?.runId }

    override suspend fun uploadBatch(sessionId: String, body: UploadBatchRequest): ApiResult<String?> =
        call({ api.uploadBatch(sessionId, body) }) { it?.runId }
}
