package live.airuncoach.airuncoach.network

import android.content.Context
import android.os.Build
import android.util.Log
import live.airuncoach.airuncoach.BuildConfig
import live.airuncoach.airuncoach.data.SessionManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class PersistentCookieJar(private val context: Context) : CookieJar {
    private val cookieStore = mutableMapOf<String, List<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val host = url.host
        cookieStore[host] = cookies
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val host = url.host
        return cookieStore[host]?.filter { cookie ->
            cookie.expiresAt > System.currentTimeMillis()
        } ?: emptyList()
    }
}

class RetrofitClient(context: Context, private val sessionManager: SessionManager) {

    private val okHttpClient = OkHttpClient.Builder()
        .cookieJar(PersistentCookieJar(context))
        // Increase timeouts for AI route generation (OpenAI + Google Maps can take 2+ minutes)
        .connectTimeout(45, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)  // AI route generation can take up to 3 minutes
        .writeTimeout(45, TimeUnit.SECONDS)
        // Add Bearer token to all requests
        .addInterceptor { chain ->
            val request = chain.request()
            val token = sessionManager.getAuthToken()
            
            val newRequest = if (!token.isNullOrEmpty()) {
                android.util.Log.d("RetrofitClient", "🔑 Adding Bearer token to ${request.url.encodedPath}")
                request.newBuilder()
                    .addHeader("Authorization", "Bearer $token")
                    .build()
            } else {
                android.util.Log.d("RetrofitClient", "⚠️ No token for ${request.url.encodedPath}")
                request
            }
            
            val response = chain.proceed(newRequest)
            
            // Handle 401 Unauthorized responses
            if (response.code == 401) {
                android.util.Log.e("RetrofitClient", "❌ 401 Unauthorized - clearing session")
                // Clear the invalid token
                sessionManager.clearAuthToken()
                // Don't throw - let the UI handle showing login screen
            }
            
            // Log response details for debugging
            Log.d("RetrofitClient", "📡 Response from ${request.url.encodedPath}: ${response.code}")
            
            // Detect if API is returning HTML instead of JSON (indicates endpoint not implemented)
            val contentType = response.header("Content-Type") ?: ""
            if (contentType.contains("text/html", ignoreCase = true)) {
                Log.e("RetrofitClient", "⚠️ Backend returning HTML instead of JSON!")
                Log.e("RetrofitClient", "📍 Endpoint: ${request.url}")
                Log.e("RetrofitClient", "📦 Content-Type: $contentType")
                Log.e("RetrofitClient", "💡 This usually means the endpoint is not implemented on the backend")
                
                // Peek at response body to confirm it's HTML
                val bodyPreview = response.peekBody(200).string()
                if (bodyPreview.contains("<!DOCTYPE html>", ignoreCase = true)) {
                    Log.e("RetrofitClient", "✅ Confirmed: Backend served HTML (frontend app)")
                }
            }
            
            // Log raw response body for login/register endpoints
            if (request.url.encodedPath.contains("/login") || request.url.encodedPath.contains("/register")) {
                val responseBody = response.peekBody(Long.MAX_VALUE).string()
                Log.d("RetrofitClient", "📦 RAW RESPONSE BODY: $responseBody")
            }
            
            response
        }
        .addInterceptor(okhttp3.logging.HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                okhttp3.logging.HttpLoggingInterceptor.Level.BODY
            } else {
                okhttp3.logging.HttpLoggingInterceptor.Level.NONE
            }
        })
        .build()

    val instance: ApiService by lazy {
        // Use local backend for debug builds, production backend for release builds
        val baseUrl = if (BuildConfig.DEBUG) { 
            // LOCAL DEV: Your Mac's IP address
            // TOGGLE: Switch between local and production for testing
            val useLocalBackend = false // Set to false to use production backend on physical device
            
            if (useLocalBackend) {
                // Detect if running on emulator or physical device
                val isEmulator = android.os.Build.FINGERPRINT.contains("generic") ||
                                android.os.Build.MODEL.contains("Emulator") ||
                                android.os.Build.MODEL.contains("Android SDK")
                
                if (isEmulator) {
                    // Use 10.0.2.2 for Android Emulator (maps to host's localhost)
                    "http://10.0.2.2:3000"
                } else {
                    // Use your Mac's actual IP address for physical devices
                    // Make sure your Mac and phone are on the same WiFi network
                    "http://192.168.18.14:3000"
                }
            } else {
                "https://ai-run-coach.replit.app"  // Production backend (Replit)
            }
        } else {
            "https://ai-run-coach.replit.app"
        }
        
        // Log which backend we're connecting to
        android.util.Log.d("RetrofitClient", "🔗 Connecting to: $baseUrl")
        println("🔗 API BASE URL: $baseUrl")
        
        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(GsonConverterFactory.create())
            .client(okHttpClient)
            .build()

        retrofit.create(ApiService::class.java)
    }

    companion object {
        @Volatile
        private var INSTANCE: ApiService? = null
        private var _sessionManager: SessionManager? = null
        
        @Volatile
        private var _context: Context? = null
        
        private var isUsingLocalBackend = true

        private fun initializeInternal(context: Context, sessionManager: SessionManager): ApiService {
            return INSTANCE ?: synchronized(this) {
                if (INSTANCE != null) return INSTANCE!!
                
                _context = context
                _sessionManager = sessionManager
                
                // Build okhttp client
                val client = OkHttpClient.Builder()
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .writeTimeout(30, TimeUnit.SECONDS)
                    .cookieJar(PersistentCookieJar(context))
                    .addInterceptor { chain ->
                        val originalRequest = chain.request()
                        val requestBuilder = originalRequest.newBuilder()
                        
                        // Add auth token if available
                        val token = _sessionManager?.getAuthToken()
                        if (token != null && token.isNotEmpty()) {
                            requestBuilder.header("Authorization", "Bearer $token")
                        }
                        
                        chain.proceed(requestBuilder.build())
                    }
                    .build()
                
                // Determine base URL - ALWAYS use production for Garmin (OAuth requires consistent callback URLs)
                val baseUrl = "https://ai-run-coach.replit.app"
                
                // Build Retrofit
                val retrofit = Retrofit.Builder()
                    .client(client)
                    .baseUrl(baseUrl)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
                    
                INSTANCE = retrofit.create(ApiService::class.java)
                INSTANCE!!
            }
        }
        
        // Public initialize method
        fun initialize(context: Context, sessionManager: SessionManager): ApiService {
            return initializeInternal(context, sessionManager)
        }
        
        // Provide direct access to apiService for ViewModels
        val apiService: ApiService
            get() = INSTANCE ?: throw IllegalStateException("RetrofitClient not initialized")
        
        // Helper to check if using local backend
        fun isLocalBackend(): Boolean {
            return BuildConfig.DEBUG && isUsingLocalBackend
        }
        
        // Helper to get the base URL being used
        fun getBaseUrl(): String {
            return if (BuildConfig.DEBUG) {
                val isEmulator = Build.FINGERPRINT.contains("generic") ||
                                    Build.MODEL.contains("Emulator") ||
                                    Build.MODEL.contains("Android SDK")
                if (isEmulator) "http://10.0.2.2:3000" else "http://192.168.18.14:3000"
            } else {
                "https://ai-run-coach.replit.app"
            }
        }
        
        // Force re-initialization (useful for switching backends during development)
        fun reset() {
            INSTANCE = null
            _context = null
            _sessionManager = null
        }
    }
}