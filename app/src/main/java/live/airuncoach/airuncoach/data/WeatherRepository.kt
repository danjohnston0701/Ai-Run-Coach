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
     * Fetches current weather data via backend proxy.
     *
     * @param latitude/longitude Use an already-known fix (e.g. a run's first GPS point) instead
     *   of requesting a fresh one. Prefer this overload wherever a fix already exists — a caller
     *   requesting its own fresh [getCurrentLocation] at the same moment another GPS-dependent
     *   flow is cold-starting (e.g. right as run tracking begins) can simply fail with nothing to
     *   show for it, since [getCurrentLocation] has no retry and its own [Exception] catch
     *   returns null silently. Confirmed via a real run where weather ended up null despite a
     *   clean GPS track throughout — the very first tracked fix was 17m accuracy, consistent
     *   with a cold-start race between two simultaneous location requests.
     * @return WeatherData object with real-time weather information, or null if unable to fetch
     */
    suspend fun getCurrentWeather(latitude: Double? = null, longitude: Double? = null): WeatherData? {
        return try {
            val (lat, lng) = if (latitude != null && longitude != null) {
                latitude to longitude
            } else {
                val location = getCurrentLocation() ?: return null
                location.latitude to location.longitude
            }

            // Fetch weather data from backend proxy (which calls Open-Meteo API)
            val response = apiService.getWeather(
                latitude = lat,
                longitude = lng
            )
            
            // The backend answers a failed Open-Meteo call with all-null fields rather than an
            // error. Defaulting those to 0.0 would save "0°C, 0% humidity, Unknown" as the run's
            // weather and skew the weather-impact insights — report no weather instead (the
            // server fills it from Open-Meteo history after upload; see server/run-weather.ts).
            if (response.temp == null) return null

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
