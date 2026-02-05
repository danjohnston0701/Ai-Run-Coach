package live.airuncoach.airuncoach.data

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import live.airuncoach.airuncoach.domain.model.WellnessContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * Garmin Data Sync Service
 * 
 * Fetches wellness and activity data from Garmin Connect API
 */
class GarminDataSync(context: Context) {
    
    private val authManager = GarminAuthManager(context)
    private val client = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true }
    
    companion object {
        private const val TAG = "GarminDataSync"
    }
    
    /**
     * Fetch wellness data (sleep, stress, body battery, etc.) for today
     */
    suspend fun fetchWellnessData(): Result<GarminWellnessData?> = withContext(Dispatchers.IO) {
        try {
            if (!authManager.isAuthenticated()) {
                return@withContext Result.failure(Exception("Not authenticated with Garmin"))
            }
            
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            
            // Fetch multiple wellness endpoints
            val sleep = fetchSleepData(today)
            val stress = fetchStressData(today)
            val bodyBattery = fetchBodyBatteryData(today)
            val heartRate = fetchHeartRateData(today)
            
            val wellnessData = GarminWellnessData(
                date = today,
                sleepData = sleep,
                stressData = stress,
                bodyBatteryData = bodyBattery,
                heartRateData = heartRate
            )
            
            Result.success(wellnessData)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching wellness data", e)
            Result.failure(e)
        }
    }
    
    /**
     * Convert Garmin wellness data to app's WellnessContext
     */
    fun toWellnessContext(garminData: GarminWellnessData): WellnessContext {
        val sleepHours = garminData.sleepData?.totalSleepTimeSeconds?.let { it / 3600.0 }
        val sleepScore = garminData.sleepData?.overallSleepScore
        
        return WellnessContext(
            sleepHours = sleepHours,
            sleepQuality = garminData.sleepData?.sleepQuality,
            sleepScore = sleepScore,
            bodyBattery = garminData.bodyBatteryData?.currentBodyBattery,
            stressLevel = garminData.stressData?.avgStressLevel,
            stressQualifier = garminData.stressData?.stressQualifier,
            hrvStatus = null, // Not in standard Garmin API
            hrvFeedback = null,
            restingHeartRate = garminData.heartRateData?.restingHeartRate,
            readinessScore = garminData.bodyBatteryData?.currentBodyBattery, // Body Battery as readiness proxy
            readinessRecommendation = when {
                (garminData.bodyBatteryData?.currentBodyBattery ?: 0) > 75 -> "You're well-rested and ready for a challenging run!"
                (garminData.bodyBatteryData?.currentBodyBattery ?: 0) > 50 -> "Good energy levels - maintain steady effort today."
                (garminData.bodyBatteryData?.currentBodyBattery ?: 0) > 25 -> "Consider an easy recovery run today."
                else -> "Your body needs rest - take it easy or rest today."
            }
        )
    }
    
    /**
     * Fetch recent activities
     */
    suspend fun fetchRecentActivities(limit: Int = 10): Result<List<GarminActivity>> = withContext(Dispatchers.IO) {
        try {
            if (!authManager.isAuthenticated()) {
                return@withContext Result.failure(Exception("Not authenticated with Garmin"))
            }
            
            val url = "${GarminConfig.ACTIVITIES_API_URL}/activities?limit=$limit"
            val response = makeAuthenticatedRequest(url)
            
            if (!response.isSuccessful) {
                return@withContext Result.failure(Exception("Failed to fetch activities: ${response.code}"))
            }
            
            val body = response.body?.string() ?: ""
            val activities = json.decodeFromString<List<GarminActivity>>(body)
            
            Log.d(TAG, "Fetched ${activities.size} activities from Garmin")
            Result.success(activities)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching activities", e)
            Result.failure(e)
        }
    }
    
    /**
     * Fetch sleep data
     */
    private suspend fun fetchSleepData(date: String): GarminSleepData? {
        return try {
            val url = "${GarminConfig.WELLNESS_API_URL}/dailies/$date/sleep"
            val response = makeAuthenticatedRequest(url)
            
            if (response.isSuccessful) {
                val body = response.body?.string() ?: return null
                json.decodeFromString<GarminSleepData>(body)
            } else null
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching sleep data", e)
            null
        }
    }
    
    /**
     * Fetch stress data
     */
    private suspend fun fetchStressData(date: String): GarminStressData? {
        return try {
            val url = "${GarminConfig.WELLNESS_API_URL}/dailies/$date/stress"
            val response = makeAuthenticatedRequest(url)
            
            if (response.isSuccessful) {
                val body = response.body?.string() ?: return null
                json.decodeFromString<GarminStressData>(body)
            } else null
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching stress data", e)
            null
        }
    }
    
    /**
     * Fetch body battery data
     */
    private suspend fun fetchBodyBatteryData(date: String): GarminBodyBatteryData? {
        return try {
            val url = "${GarminConfig.WELLNESS_API_URL}/dailies/$date/bodyBattery"
            val response = makeAuthenticatedRequest(url)
            
            if (response.isSuccessful) {
                val body = response.body?.string() ?: return null
                json.decodeFromString<GarminBodyBatteryData>(body)
            } else null
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching body battery data", e)
            null
        }
    }
    
    /**
     * Fetch heart rate data
     */
    private suspend fun fetchHeartRateData(date: String): GarminHeartRateData? {
        return try {
            val url = "${GarminConfig.WELLNESS_API_URL}/dailies/$date/heartRate"
            val response = makeAuthenticatedRequest(url)
            
            if (response.isSuccessful) {
                val body = response.body?.string() ?: return null
                json.decodeFromString<GarminHeartRateData>(body)
            } else null
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching heart rate data", e)
            null
        }
    }
    
    /**
     * Make authenticated request to Garmin API
     */
    @OptIn(ExperimentalEncodingApi::class)
    private suspend fun makeAuthenticatedRequest(url: String): okhttp3.Response {
        val accessToken = authManager.getAccessToken() ?: throw Exception("No access token")
        val accessTokenSecret = authManager.getAccessTokenSecret() ?: throw Exception("No access token secret")
        
        // Generate OAuth signature
        val timestamp = (System.currentTimeMillis() / 1000).toString()
        val nonce = UUID.randomUUID().toString()
        
        val params = mapOf(
            "oauth_consumer_key" to GarminConfig.CONSUMER_KEY,
            "oauth_nonce" to nonce,
            "oauth_signature_method" to "HMAC-SHA1",
            "oauth_timestamp" to timestamp,
            "oauth_token" to accessToken,
            "oauth_version" to "1.0"
        )
        
        val signature = generateSignature(
            method = "GET",
            url = url,
            params = params,
            consumerSecret = GarminConfig.CONSUMER_SECRET,
            tokenSecret = accessTokenSecret
        )
        
        val authHeader = buildAuthorizationHeader(params, signature)
        
        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", authHeader)
            .get()
            .build()
        
        return client.newCall(request).execute()
    }
    
    @OptIn(ExperimentalEncodingApi::class)
    private fun generateSignature(
        method: String,
        url: String,
        params: Map<String, String>,
        consumerSecret: String,
        tokenSecret: String
    ): String {
        val sortedParams = params.toSortedMap()
        val paramString = sortedParams.entries.joinToString("&") { (key, value) ->
            "${urlEncode(key)}=${urlEncode(value)}"
        }
        
        val signatureBase = listOf(
            method.uppercase(),
            urlEncode(url),
            urlEncode(paramString)
        ).joinToString("&")
        
        val signingKey = "${urlEncode(consumerSecret)}&${urlEncode(tokenSecret)}"
        
        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(signingKey.toByteArray(), "HmacSHA1"))
        val signatureBytes = mac.doFinal(signatureBase.toByteArray())
        
        return Base64.encode(signatureBytes)
    }
    
    private fun buildAuthorizationHeader(params: Map<String, String>, signature: String): String {
        val authParams = params.toMutableMap()
        authParams["oauth_signature"] = signature
        
        val headerValue = authParams.entries
            .sortedBy { it.key }
            .joinToString(", ") { (key, value) ->
                """$key="${urlEncode(value)}""""
            }
        
        return "OAuth $headerValue"
    }
    
    private fun urlEncode(value: String): String {
        return java.net.URLEncoder.encode(value, "UTF-8")
            .replace("+", "%20")
            .replace("*", "%2A")
            .replace("%7E", "~")
    }
}

// Data models for Garmin API responses
@Serializable
data class GarminWellnessData(
    val date: String,
    val sleepData: GarminSleepData?,
    val stressData: GarminStressData?,
    val bodyBatteryData: GarminBodyBatteryData?,
    val heartRateData: GarminHeartRateData?
)

@Serializable
data class GarminSleepData(
    val totalSleepTimeSeconds: Int? = null,
    val deepSleepSeconds: Int? = null,
    val lightSleepSeconds: Int? = null,
    val remSleepSeconds: Int? = null,
    val awakeSleepSeconds: Int? = null,
    val overallSleepScore: Int? = null,
    val sleepQuality: String? = null
)

@Serializable
data class GarminStressData(
    val avgStressLevel: Int? = null,
    val maxStressLevel: Int? = null,
    val stressQualifier: String? = null, // "low", "medium", "high"
    val restStressSeconds: Int? = null,
    val activityStressSeconds: Int? = null,
    val lowStressSeconds: Int? = null,
    val mediumStressSeconds: Int? = null,
    val highStressSeconds: Int? = null
)

@Serializable
data class GarminBodyBatteryData(
    val currentBodyBattery: Int? = null,
    val highestBodyBattery: Int? = null,
    val lowestBodyBattery: Int? = null,
    val bodyBatteryChargedUp: Int? = null,
    val bodyBatteryDrainedDown: Int? = null
)

@Serializable
data class GarminHeartRateData(
    val restingHeartRate: Int? = null,
    val minHeartRate: Int? = null,
    val maxHeartRate: Int? = null,
    val avgHeartRate: Int? = null
)

@Serializable
data class GarminActivity(
    val activityId: Long,
    val activityName: String? = null,
    val activityType: String? = null,
    val startTimeGMT: String? = null,
    val distance: Double? = null, // meters
    val duration: Double? = null, // seconds
    val elevationGain: Double? = null, // meters
    val avgHr: Int? = null,
    val maxHr: Int? = null,
    val calories: Int? = null,
    val avgSpeed: Double? = null, // m/s
    val maxSpeed: Double? = null // m/s
)
