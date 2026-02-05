package live.airuncoach.airuncoach.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URLEncoder
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * Garmin OAuth 1.0a Authentication Manager
 * 
 * Handles the OAuth flow to connect user's Garmin account:
 * 1. Get request token
 * 2. Redirect to Garmin authorization page
 * 3. Handle callback and exchange for access token
 * 4. Store access token securely
 */
class GarminAuthManager(private val context: Context) {
    
    private val client = OkHttpClient()
    private val prefs = context.getSharedPreferences("garmin_auth", Context.MODE_PRIVATE)
    
    companion object {
        private const val TAG = "GarminAuthManager"
        private const val PREF_ACCESS_TOKEN = "access_token"
        private const val PREF_ACCESS_TOKEN_SECRET = "access_token_secret"
        private const val PREF_USER_ID = "user_id"
        private const val PREF_REQUEST_TOKEN = "request_token"
        private const val PREF_REQUEST_TOKEN_SECRET = "request_token_secret"
    }
    
    /**
     * Check if user has valid Garmin authentication
     */
    fun isAuthenticated(): Boolean {
        return prefs.getString(PREF_ACCESS_TOKEN, null) != null &&
               prefs.getString(PREF_ACCESS_TOKEN_SECRET, null) != null
    }
    
    /**
     * Get stored access token
     */
    fun getAccessToken(): String? {
        return prefs.getString(PREF_ACCESS_TOKEN, null)
    }
    
    /**
     * Get stored access token secret
     */
    fun getAccessTokenSecret(): String? {
        return prefs.getString(PREF_ACCESS_TOKEN_SECRET, null)
    }
    
    /**
     * Step 1: Get OAuth request token from Garmin
     * Returns the authorization URL to open in browser
     */
    suspend fun startOAuthFlow(): Result<String> = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Starting OAuth flow - requesting token")
            
            // Generate OAuth 1.0a signature
            val timestamp = (System.currentTimeMillis() / 1000).toString()
            val nonce = UUID.randomUUID().toString()
            
            val params = mapOf(
                "oauth_callback" to GarminConfig.OAUTH_CALLBACK,
                "oauth_consumer_key" to GarminConfig.CONSUMER_KEY,
                "oauth_nonce" to nonce,
                "oauth_signature_method" to "HMAC-SHA1",
                "oauth_timestamp" to timestamp,
                "oauth_version" to "1.0"
            )
            
            val signature = generateSignature(
                method = "POST",
                url = GarminConfig.OAUTH_REQUEST_TOKEN_URL,
                params = params,
                consumerSecret = GarminConfig.CONSUMER_SECRET,
                tokenSecret = ""
            )
            
            // Build authorization header
            val authHeader = buildAuthorizationHeader(params, signature)
            
            // Make request to Garmin
            val request = Request.Builder()
                .url(GarminConfig.OAUTH_REQUEST_TOKEN_URL)
                .addHeader("Authorization", authHeader)
                .post(FormBody.Builder().build())
                .build()
            
            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""
            
            Log.d(TAG, "Request token response: $responseBody")
            
            if (!response.isSuccessful) {
                Log.e(TAG, "Failed to get request token: ${response.code}")
                return@withContext Result.failure(Exception("Failed to get request token: ${response.code}"))
            }
            
            // Parse response
            val tokenData = parseOAuthResponse(responseBody)
            val requestToken = tokenData["oauth_token"] 
                ?: return@withContext Result.failure(Exception("No oauth_token in response"))
            val requestTokenSecret = tokenData["oauth_token_secret"]
                ?: return@withContext Result.failure(Exception("No oauth_token_secret in response"))
            
            // Store request token temporarily
            prefs.edit()
                .putString(PREF_REQUEST_TOKEN, requestToken)
                .putString(PREF_REQUEST_TOKEN_SECRET, requestTokenSecret)
                .apply()
            
            Log.d(TAG, "Request token obtained successfully")
            
            // Build authorization URL
            val authUrl = "${GarminConfig.OAUTH_AUTHORIZE_URL}?oauth_token=$requestToken"
            
            Result.success(authUrl)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting OAuth flow", e)
            Result.failure(e)
        }
    }
    
    /**
     * Step 2: Handle OAuth callback and exchange for access token
     */
    suspend fun handleOAuthCallback(callbackUri: Uri): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Handling OAuth callback")
            
            val oauthToken = callbackUri.getQueryParameter("oauth_token")
            val oauthVerifier = callbackUri.getQueryParameter("oauth_verifier")
            
            if (oauthToken == null || oauthVerifier == null) {
                Log.e(TAG, "Missing oauth_token or oauth_verifier in callback")
                return@withContext Result.failure(Exception("Invalid callback parameters"))
            }
            
            val requestToken = prefs.getString(PREF_REQUEST_TOKEN, null)
            val requestTokenSecret = prefs.getString(PREF_REQUEST_TOKEN_SECRET, null)
            
            if (requestToken == null || requestTokenSecret == null) {
                Log.e(TAG, "No stored request token")
                return@withContext Result.failure(Exception("No stored request token"))
            }
            
            if (requestToken != oauthToken) {
                Log.e(TAG, "Token mismatch")
                return@withContext Result.failure(Exception("OAuth token mismatch"))
            }
            
            // Generate OAuth signature for access token request
            val timestamp = (System.currentTimeMillis() / 1000).toString()
            val nonce = UUID.randomUUID().toString()
            
            val params = mapOf(
                "oauth_consumer_key" to GarminConfig.CONSUMER_KEY,
                "oauth_nonce" to nonce,
                "oauth_signature_method" to "HMAC-SHA1",
                "oauth_timestamp" to timestamp,
                "oauth_token" to oauthToken,
                "oauth_verifier" to oauthVerifier,
                "oauth_version" to "1.0"
            )
            
            val signature = generateSignature(
                method = "POST",
                url = GarminConfig.OAUTH_ACCESS_TOKEN_URL,
                params = params,
                consumerSecret = GarminConfig.CONSUMER_SECRET,
                tokenSecret = requestTokenSecret
            )
            
            val authHeader = buildAuthorizationHeader(params, signature)
            
            // Request access token
            val request = Request.Builder()
                .url(GarminConfig.OAUTH_ACCESS_TOKEN_URL)
                .addHeader("Authorization", authHeader)
                .post(FormBody.Builder().build())
                .build()
            
            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""
            
            Log.d(TAG, "Access token response: $responseBody")
            
            if (!response.isSuccessful) {
                Log.e(TAG, "Failed to get access token: ${response.code}")
                return@withContext Result.failure(Exception("Failed to get access token: ${response.code}"))
            }
            
            // Parse access token response
            val tokenData = parseOAuthResponse(responseBody)
            val accessToken = tokenData["oauth_token"]
                ?: return@withContext Result.failure(Exception("No oauth_token in response"))
            val accessTokenSecret = tokenData["oauth_token_secret"]
                ?: return@withContext Result.failure(Exception("No oauth_token_secret in response"))
            
            // Store access token
            prefs.edit()
                .putString(PREF_ACCESS_TOKEN, accessToken)
                .putString(PREF_ACCESS_TOKEN_SECRET, accessTokenSecret)
                .remove(PREF_REQUEST_TOKEN)
                .remove(PREF_REQUEST_TOKEN_SECRET)
                .apply()
            
            Log.d(TAG, "✅ Garmin authentication successful!")
            
            Result.success(true)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error handling OAuth callback", e)
            Result.failure(e)
        }
    }
    
    /**
     * Clear stored authentication
     */
    fun logout() {
        prefs.edit().clear().apply()
        Log.d(TAG, "Logged out from Garmin")
    }
    
    /**
     * Fetch stored access token from backend
     * (Backend bridge pattern - backend already exchanged OAuth tokens)
     */
    suspend fun fetchStoredToken(tempToken: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Fetching stored token from backend")
            
            // Call your backend to get the access token that was stored
            // TODO: Replace with your actual backend URL
            val backendUrl = "https://airuncoach.live/api/garmin/token/$tempToken"
            
            val request = Request.Builder()
                .url(backendUrl)
                .get()
                .build()
            
            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""
            
            if (!response.isSuccessful) {
                return@withContext Result.failure(Exception("Failed to fetch token: ${response.code}"))
            }
            
            // Parse response (expected format: {"accessToken": "...", "accessTokenSecret": "..."})
            val tokenData = parseOAuthResponse(responseBody)
            val accessToken = tokenData["accessToken"]
                ?: return@withContext Result.failure(Exception("No accessToken in response"))
            val accessTokenSecret = tokenData["accessTokenSecret"]
                ?: return@withContext Result.failure(Exception("No accessTokenSecret in response"))
            
            // Store access token
            prefs.edit()
                .putString(PREF_ACCESS_TOKEN, accessToken)
                .putString(PREF_ACCESS_TOKEN_SECRET, accessTokenSecret)
                .apply()
            
            Log.d(TAG, "✅ Access token fetched and stored successfully!")
            Result.success(true)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching stored token", e)
            Result.failure(e)
        }
    }
    
    /**
     * Generate OAuth 1.0a HMAC-SHA1 signature
     */
    @OptIn(ExperimentalEncodingApi::class)
    private fun generateSignature(
        method: String,
        url: String,
        params: Map<String, String>,
        consumerSecret: String,
        tokenSecret: String
    ): String {
        // Sort parameters
        val sortedParams = params.toSortedMap()
        
        // Build parameter string
        val paramString = sortedParams.entries.joinToString("&") { (key, value) ->
            "${urlEncode(key)}=${urlEncode(value)}"
        }
        
        // Build signature base string
        val signatureBase = listOf(
            method.uppercase(),
            urlEncode(url),
            urlEncode(paramString)
        ).joinToString("&")
        
        // Build signing key
        val signingKey = "${urlEncode(consumerSecret)}&${urlEncode(tokenSecret)}"
        
        // Generate HMAC-SHA1 signature
        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(signingKey.toByteArray(), "HmacSHA1"))
        val signatureBytes = mac.doFinal(signatureBase.toByteArray())
        
        return Base64.encode(signatureBytes)
    }
    
    /**
     * Build OAuth Authorization header
     */
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
    
    /**
     * Parse OAuth response (form-encoded)
     */
    private fun parseOAuthResponse(response: String): Map<String, String> {
        return response.split("&").associate { pair ->
            val (key, value) = pair.split("=")
            key to value
        }
    }
    
    /**
     * URL encode for OAuth
     */
    private fun urlEncode(value: String): String {
        return URLEncoder.encode(value, "UTF-8")
            .replace("+", "%20")
            .replace("*", "%2A")
            .replace("%7E", "~")
    }
    
    /**
     * Open Garmin authorization page in browser
     */
    fun openAuthorizationPage(context: Context, authUrl: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(authUrl))
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        context.startActivity(intent)
    }
}
