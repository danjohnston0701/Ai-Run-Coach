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

/**
 * Direct watch->cloud HTTP path for standalone/offline mode — the Wear OS analog of the
 * Garmin watch app's DataStreamer.mc. Used only when the phone isn't reachable over the Data
 * Layer (mirrors Garmin's `!_isConnected` gating). Targets the same, already-hardened
 * `/api/garmin-companion/` endpoints the Garmin watch app uses (FCM wake fallback, batch
 * upload, dedup against phone-tracked runs) — see the backend generalization in
 * server/routes.ts (`watchDeviceLabel`/`watchExternalSource`) that lets a `deviceModel`
 * string distinguish Samsung/Wear OS sessions from Garmin ones without a separate API.
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
    val longitude: Double?
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
    val points: List<List<Int>>, // compact 7-field arrays, see OfflineGpsBuffer
    val distanceM: Float,
    val durationSec: Int,
    val totalAscent: Float,
    val plannedWorkoutId: String? = null
)

data class UploadBatchResponse(val runId: String?)

private interface GarminCompanionApi {
    @POST("/api/garmin-companion/session/start")
    suspend fun startSession(@Body body: SessionStartRequest): Response<Unit>

    @POST("/api/garmin-companion/data")
    suspend fun sendData(@Body body: SessionDataRequest): Response<Map<String, Any?>>

    @POST("/api/garmin-companion/session/end")
    suspend fun endSession(@Body body: SessionEndRequest): Response<Unit>

    @POST("/api/garmin-companion/session/{sessionId}/upload-batch")
    suspend fun uploadBatch(
        @Path("sessionId") sessionId: String,
        @Body body: UploadBatchRequest
    ): Response<UploadBatchResponse>
}

class DirectHttpApiClient(private val getAuthToken: suspend () -> String?) {

    private val authInterceptor = Interceptor { chain ->
        val token = kotlinx.coroutines.runBlocking { getAuthToken() }
        val request = chain.request().newBuilder().apply {
            if (!token.isNullOrBlank()) addHeader("Authorization", "Bearer $token")
        }.build()
        chain.proceed(request)
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        })
        .build()

    private val api: GarminCompanionApi = Retrofit.Builder()
        .baseUrl(BuildConfig.BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(GarminCompanionApi::class.java)

    suspend fun startSession(body: SessionStartRequest): Boolean =
        runCatching { api.startSession(body).isSuccessful }.getOrDefault(false)

    /** Returns any "coaching" cue text piggybacked on the response, or null. */
    suspend fun sendData(body: SessionDataRequest): Result<String?> =
        runCatching {
            val resp = api.sendData(body)
            if (!resp.isSuccessful) throw java.io.IOException("HTTP ${resp.code()}")
            resp.body()?.get("coaching") as? String
        }

    suspend fun endSession(body: SessionEndRequest): Boolean =
        runCatching { api.endSession(body).isSuccessful }.getOrDefault(false)

    suspend fun uploadBatch(sessionId: String, body: UploadBatchRequest): String? =
        runCatching {
            val resp = api.uploadBatch(sessionId, body)
            if (resp.isSuccessful) resp.body()?.runId else null
        }.getOrNull()
}
