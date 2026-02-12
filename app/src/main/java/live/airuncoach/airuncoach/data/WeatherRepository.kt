package live.airuncoach.airuncoach.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await
import live.airuncoach.airuncoach.BuildConfig
import live.airuncoach.airuncoach.domain.model.WeatherData
import live.airuncoach.airuncoach.network.WeatherRetrofitClient

class WeatherRepository(private val context: Context) {
    
    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)
    
    private val weatherApiService = WeatherRetrofitClient.weatherApiService
    
    /**
     * Fetches current weather data based on device's GPS location
     * @return WeatherData object with real-time weather information, or null if unable to fetch
     */
    suspend fun getCurrentWeather(): WeatherData? {
        return try {
            // Get current location
            val location = getCurrentLocation() ?: return null
            
            // Fetch weather data from OpenWeatherMap API
            val response = weatherApiService.getCurrentWeather(
                latitude = location.latitude,
                longitude = location.longitude,
                apiKey = BuildConfig.WEATHER_API_KEY
            )
            
            // Convert API response to domain model
            WeatherData(
                temperature = response.main.temperature,
                humidity = response.main.humidity.toDouble(),
                windSpeed = response.wind.speed,
                description = response.weather.firstOrNull()?.main ?: "Unknown"
            )
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
    
    /**
     * Gets the device's current GPS location
     * @return Android Location object, or null if unable to get location
     */
    suspend fun getCurrentLocation(): Location? {
        // Check permissions
        if (ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return null
        }
        
        return try {
            // Use high accuracy priority for better location
            val cancellationToken = CancellationTokenSource()
            fusedLocationClient.getCurrentLocation(
                Priority.PRIORITY_HIGH_ACCURACY,
                cancellationToken.token
            ).await()
        } catch (e: Exception) {
            e.printStackTrace()
            // Fallback to last known location
            try {
                fusedLocationClient.lastLocation.await()
            } catch (e: Exception) {
                e.printStackTrace()
                null
            }
        }
    }
}
