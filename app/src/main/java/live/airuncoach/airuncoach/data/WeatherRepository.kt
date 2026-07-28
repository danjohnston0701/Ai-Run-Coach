package live.airuncoach.airuncoach.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.util.Log
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await
import live.airuncoach.airuncoach.domain.model.WeatherData
import live.airuncoach.airuncoach.network.RetrofitClient

class WeatherRepository(private val context: Context) {
    
    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)
    
    private val apiService = RetrofitClient.apiService
    
    /**
     * Fetches current weather data via backend proxy
     * @return WeatherData object with real-time weather information, or null if unable to fetch
     */
    suspend fun getCurrentWeather(): WeatherData? {
        return try {
            // Get current location
            val location = getCurrentLocation() ?: return null
            
            // Fetch weather data from backend proxy (which calls Open-Meteo API)
            val response = apiService.getWeather(
                latitude = location.latitude,
                longitude = location.longitude
            )
            
            // Convert API response to domain model
            WeatherData(
                temperature = response.temp ?: 0.0,
                humidity = response.humidity ?: 0.0,
                windSpeed = response.windSpeed ?: 0.0,
                description = response.condition ?: "Unknown",
                feelsLike = response.feelsLike,
                windDirection = response.windDirection,
                condition = response.condition
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
