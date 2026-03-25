package live.airuncoach.airuncoach.data.repository

import android.util.Log
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.network.ApiService
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Shared repository for Run data.
 * Implements caching and request deduplication to reduce network transfer on Neon.
 * 
 * Usage:
 * - DashboardViewModel, PreviousRunsViewModel, RunSummaryViewModel all use this
 * - Eliminates duplicate API calls for the same data
 * - Caches results for 5 minutes (configurable)
 */
@Singleton
class RunRepository @Inject constructor(
    private val apiService: ApiService
) {
    
    companion object {
        private const val TAG = "RunRepository"
        private const val CACHE_DURATION_MS = 5 * 60 * 1000  // 5 minutes
    }
    
    // Cache for user's run list
    private val runsCache = mutableMapOf<String, CachedData<List<RunSession>>>()
    
    // Cache for individual run by ID
    private val runByIdCache = mutableMapOf<String, CachedData<RunSession>>()
    
    /**
     * Get all runs for a user, with caching.
     * Returns cached data if available and fresh (< 5 minutes old).
     * Otherwise, fetches from API and caches the result.
     * 
     * @param userId User ID to fetch runs for
     * @param forceRefresh Force a fresh fetch even if cached data exists
     * @return List of RunSession objects
     */
    suspend fun getRunsForUser(
        userId: String,
        forceRefresh: Boolean = false
    ): List<RunSession> {
        return try {
            // Check if we have fresh cached data
            val cached = runsCache[userId]
            if (!forceRefresh && cached != null && cached.isFresh()) {
                Log.d(TAG, "✅ Returning cached runs for user $userId (cached ${cached.ageMs()}ms ago)")
                return cached.data
            }
            
            // Make the API call
            Log.d(TAG, "📡 Fetching runs for user $userId from API")
            val runs = apiService.getRunsForUser(userId)
            
            // Cache the result
            runsCache[userId] = CachedData(runs, System.currentTimeMillis())
            
            Log.d(TAG, "💾 Cached ${runs.size} runs for user $userId")
            runs
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error fetching runs for user $userId", e)
            throw e
        }
    }
    
    /**
     * Get a single run by ID, with caching.
     * First checks the runByIdCache.
     * If not found, fetches from API.
     * 
     * @param runId Run ID to fetch
     * @return RunSession object
     */
    suspend fun getRunById(runId: String): RunSession {
        return try {
            // Check individual run cache first
            val cached = runByIdCache[runId]
            if (cached != null && cached.isFresh()) {
                Log.d(TAG, "✅ Returning cached run $runId (cached ${cached.ageMs()}ms ago)")
                return cached.data
            }
            
            // Make the API call
            Log.d(TAG, "📡 Fetching run $runId from API")
            val run = apiService.getRunById(runId)
            
            // Cache the result
            runByIdCache[runId] = CachedData(run, System.currentTimeMillis())
            
            Log.d(TAG, "💾 Cached run $runId")
            run
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error fetching run $runId", e)
            throw e
        }
    }
    
    /**
     * Invalidate cached runs for a user (e.g., after completing a run).
     * The next call to getRunsForUser will fetch fresh data.
     */
    fun invalidateRunsForUser(userId: String) {
        runsCache.remove(userId)
        Log.d(TAG, "🔄 Invalidated cached runs for user $userId")
    }
    
    /**
     * Invalidate cached run by ID (e.g., after updating a run).
     */
    fun invalidateRunById(runId: String) {
        runByIdCache.remove(runId)
        Log.d(TAG, "🔄 Invalidated cached run $runId")
    }
    
    /**
     * Clear all caches (useful on logout).
     */
    fun clearAllCaches() {
        runsCache.clear()
        runByIdCache.clear()
        Log.d(TAG, "🗑️ Cleared all caches")
    }
    
    /**
     * Data class for caching with timestamp.
     */
    private data class CachedData<T>(
        val data: T,
        val cachedAtMs: Long
    ) {
        fun isFresh(): Boolean {
            return System.currentTimeMillis() - cachedAtMs < CACHE_DURATION_MS
        }
        
        fun ageMs(): Long {
            return System.currentTimeMillis() - cachedAtMs
        }
    }
}
