package live.airuncoach.airuncoach.network

import android.content.Context
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
            
            chain.proceed(newRequest)
        }
        .build()

    val instance: ApiService by lazy {
        // Use local backend for debug builds, production backend for release builds
        val baseUrl = if (BuildConfig.DEBUG) { 
            // LOCAL DEV: Your Mac's IP address
            // TOGGLE: Switch between local and production for testing
            val useLocalBackend = true  // Set to true for local development with Bearer tokens
            
            if (useLocalBackend) {
                // Use 10.0.2.2 for Android Emulator
                // Use your Mac's IP (e.g., "http://192.168.1.100:3000") for physical device
                "http://10.0.2.2:3000"
            } else {
                "https://airuncoach.live"  // Production backend
            }
        } else {
            "https://airuncoach.live"
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
        
        // Provide direct access to apiService for ViewModels
        val apiService: ApiService
            get() = INSTANCE ?: throw IllegalStateException("RetrofitClient not initialized")
        
        fun initialize(context: Context, sessionManager: SessionManager): ApiService {
            return INSTANCE ?: synchronized(this) {
                val instance = RetrofitClient(context, sessionManager).instance
                INSTANCE = instance
                instance
            }
        }
        
        // Force re-initialization (useful for switching backends during development)
        fun reset() {
            INSTANCE = null
        }
    }
}
