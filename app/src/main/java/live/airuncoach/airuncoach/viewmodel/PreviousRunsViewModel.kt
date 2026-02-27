package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.WeatherImpactData
import javax.inject.Inject

@HiltViewModel
class PreviousRunsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) : ViewModel() {
    
    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    
    private fun getUserId(): String? {
        val userJson = sharedPrefs.getString("user", null)
        android.util.Log.d("PreviousRunsViewModel", "🔍 Getting user ID from SharedPreferences")
        android.util.Log.d("PreviousRunsViewModel", "User JSON exists: ${userJson != null}")
        
        // Detailed diagnostics
        val allKeys = sharedPrefs.all.keys
        android.util.Log.d("PreviousRunsViewModel", "All SharedPreferences keys: $allKeys")
        android.util.Log.d("PreviousRunsViewModel", "SharedPreferences file: user_prefs")
        
        val token = sessionManager.getAuthToken()
        android.util.Log.d("PreviousRunsViewModel", "Auth token exists: ${token != null}")
        if (token != null) {
            android.util.Log.d("PreviousRunsViewModel", "Token preview: ${token.take(20)}...")
        }
        
        return if (userJson != null) {
            try {
                val user = gson.fromJson(userJson, User::class.java)
                android.util.Log.d("PreviousRunsViewModel", "✅ User ID found: ${user.id}")
                android.util.Log.d("PreviousRunsViewModel", "User name: ${user.name}, email: ${user.email}")
                user.id
            } catch (e: Exception) {
                android.util.Log.e("PreviousRunsViewModel", "❌ Failed to parse user JSON: ${e.message}")
                android.util.Log.e("PreviousRunsViewModel", "JSON was: $userJson")
                null
            }
        } else {
            android.util.Log.w("PreviousRunsViewModel", "⚠️ No user data found in SharedPreferences")
            android.util.Log.w("PreviousRunsViewModel", "⚠️ This usually means:")
            android.util.Log.w("PreviousRunsViewModel", "  1. User is not logged in")
            android.util.Log.w("PreviousRunsViewModel", "  2. Login/registration failed to save user data")
            android.util.Log.w("PreviousRunsViewModel", "  3. SharedPreferences were cleared")
            null
        }
    }

    private val _runs = MutableStateFlow<List<RunSession>>(emptyList())
    val runs: StateFlow<List<RunSession>> = _runs.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    
    private val _weatherImpactData = MutableStateFlow<WeatherImpactData?>(null)
    val weatherImpactData: StateFlow<WeatherImpactData?> = _weatherImpactData.asStateFlow()
    
    private val _selectedFilter = MutableStateFlow("Last 7 Days")
    val selectedFilter: StateFlow<String> = _selectedFilter.asStateFlow()

    fun fetchRuns() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                android.util.Log.d("PreviousRunsViewModel", "=== FETCH RUNS STARTED ===")
                val userId = getUserId()
                if (userId != null) {
                    android.util.Log.d("PreviousRunsViewModel", "✅ Fetching runs for user: $userId")
                    val allRuns = apiService.getRunsForUser(userId)
                    _runs.value = filterRunsByTimeRange(allRuns)
                    android.util.Log.d("PreviousRunsViewModel", "✅ Fetched ${allRuns.size} total runs, filtered to ${_runs.value.size}")
                } else {
                    android.util.Log.e("PreviousRunsViewModel", "❌ Cannot fetch runs: User ID is null")
                    val hasToken = sessionManager.getAuthToken() != null
                    _error.value = if (hasToken) {
                        "User data missing. Please try logging in again."
                    } else {
                        "Please log in to view your run history"
                    }
                }
            } catch (e: com.google.gson.JsonSyntaxException) {
                android.util.Log.e("PreviousRunsViewModel", "❌ JSON parsing error: ${e.message}", e)
                android.util.Log.e("PreviousRunsViewModel", "This usually means the backend returned HTML or invalid JSON")
                _error.value = "No runs found yet. Complete your first run to see it here!"
                // Set empty list instead of showing error
                _runs.value = emptyList()
                _error.value = null // Clear error to show empty state instead
            } catch (e: retrofit2.HttpException) {
                val errorBody = try {
                    e.response()?.errorBody()?.string() ?: "No error body"
                } catch (ex: Exception) {
                    "Could not read error body"
                }
                android.util.Log.e("PreviousRunsViewModel", "❌ HTTP error fetching runs: ${e.code()} - ${e.message()}", e)
                android.util.Log.e("PreviousRunsViewModel", "Error body: $errorBody")
                android.util.Log.e("PreviousRunsViewModel", "Request URL: ${e.response()?.raw()?.request?.url}")
                
                _error.value = when (e.code()) {
                    401 -> "Authentication expired. Please log in again."
                    403 -> "Access denied. Please log in again."
                    404 -> {
                        // Check if this is truly no data or a missing endpoint
                        if (errorBody.contains("<!DOCTYPE html>", ignoreCase = true)) {
                            "🔧 Backend API not properly configured. Please contact support or check PRODUCTION_BACKEND_FIX.md"
                        } else {
                            // 404 might mean no runs exist yet - show empty state
                            _runs.value = emptyList()
                            null // Don't show error
                        }
                    }
                    500, 502, 503 -> "Server error (${e.code()}). The backend may be down or updating. Please try again in a few minutes."
                    else -> "Failed to load runs (HTTP ${e.code()}). Please check your connection and try again."
                }
            } catch (e: Exception) {
                android.util.Log.e("PreviousRunsViewModel", "❌ Failed to fetch runs: ${e.message}", e)
                android.util.Log.e("PreviousRunsViewModel", "Exception type: ${e.javaClass.simpleName}")
                e.printStackTrace()
                _error.value = "Failed to load runs. Please try again."
            } finally {
                _isLoading.value = false
                android.util.Log.d("PreviousRunsViewModel", "=== FETCH RUNS FINISHED ===")
            }
        }
    }
    
    fun setTimeFilter(filter: String) {
        _selectedFilter.value = filter
        viewModelScope.launch {
            val userId = getUserId()
            if (userId != null) {
                try {
                    val allRuns = apiService.getRunsForUser(userId)
                    _runs.value = filterRunsByTimeRange(allRuns)
                    calculateWeatherImpact()
                } catch (e: Exception) {
                    android.util.Log.e("PreviousRunsViewModel", "Failed to filter runs: ${e.message}", e)
                    _error.value = e.message
                }
            } else {
                _error.value = "User not logged in"
            }
        }
    }
    
    private fun filterRunsByTimeRange(runs: List<RunSession>): List<RunSession> {
        val now = System.currentTimeMillis()
        val cutoff = when (_selectedFilter.value) {
            "Last 7 Days" -> now - (7 * 24 * 60 * 60 * 1000L)
            "Last 30 Days" -> now - (30 * 24 * 60 * 60 * 1000L)
            "Last 3 Months" -> now - (90 * 24 * 60 * 60 * 1000L)
            else -> 0L // All Time
        }
        
        // Debug: log each run's startTime to find parsing issues
        runs.forEach { run ->
            val startDate = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date(run.startTime))
            val effectiveTime = if (run.startTime > 0) run.startTime else run.endTime ?: 0L
            val included = effectiveTime >= cutoff || effectiveTime == 0L
            android.util.Log.d("PreviousRunsViewModel", "Run '${run.name ?: run.id}': startTime=${run.startTime} ($startDate), effectiveTime=$effectiveTime, cutoff=$cutoff, included=$included, filter=${_selectedFilter.value}")
        }
        
        // Use endTime (completedAt) as the primary filter/sort key — it's the most reliable timestamp.
        // startTime may be miscalculated due to duration unit mismatches (ms vs seconds).
        // If endTime is missing, fall back to startTime. If both are 0, include the run anyway.
        val filtered = runs.filter { run ->
            val effectiveTime = run.endTime?.takeIf { it > 0 } ?: run.startTime.takeIf { it > 0 } ?: 0L
            effectiveTime >= cutoff || effectiveTime == 0L
        }.sortedByDescending { run ->
            run.endTime?.takeIf { it > 0 } ?: run.startTime.takeIf { it > 0 } ?: 0L
        }
        android.util.Log.d("PreviousRunsViewModel", "Filter result: ${runs.size} total -> ${filtered.size} after '${_selectedFilter.value}' filter (cutoff=$cutoff, now=$now)")
        return filtered
    }
    
    fun calculateWeatherImpact() {
        viewModelScope.launch {
            val userId = getUserId()
            if (userId == null) {
                Log.e("PreviousRunsViewModel", "Cannot fetch weather impact: userId is null")
                _weatherImpactData.value = null
                return@launch
            }
            
            try {
                val weatherImpact = apiService.getWeatherImpact(userId)
                _weatherImpactData.value = weatherImpact
                Log.d("PreviousRunsViewModel", "Weather impact fetched: ${weatherImpact.runsAnalyzed} runs analyzed")
            } catch (e: Exception) {
                Log.e("PreviousRunsViewModel", "Error fetching weather impact", e)
                _weatherImpactData.value = null
            }
        }
    }
}
