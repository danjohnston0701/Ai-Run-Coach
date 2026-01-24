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
        .build()

    val instance: ApiService by lazy {
        // Use local backend for debug builds, production backend for release builds
        val baseUrl = if (BuildConfig.DEBUG) { 
            // For Android emulator, use 10.0.2.2 to access host machine's localhost:3000
            // For physical device, replace with your Mac's IP address (e.g., "http://192.168.1.100:3000")
            "http://10.0.2.2:3000"
        } else {
            "https://airuncoach.live"
        }
        
        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(GsonConverterFactory.create())
            .client(okHttpClient)
            .build()

        retrofit.create(ApiService::class.java)
    }
}
