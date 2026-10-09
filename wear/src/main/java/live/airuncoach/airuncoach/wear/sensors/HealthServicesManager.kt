package live.airuncoach.airuncoach.wear.sensors

import android.content.Context
import android.util.Log
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DataTypeAvailability
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseTrackedStatus
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.health.services.client.data.LocationData
import androidx.health.services.client.data.SampleDataPoint
import androidx.health.services.client.data.WarmUpConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** A single tick of live exercise metrics — the Wear OS analog of Garmin's `Activity.Info`. */
data class ExerciseMetrics(
    /** Only set by the video demo — a real run's moving time comes from the controller's
     * ActiveClock (wall-clock minus pauses), never from here. */
    val elapsedMs: Long = 0,
    val distanceM: Double = 0.0,
    val speedMs: Double? = null,
    val heartRate: Int = 0,
    val cadenceSpm: Int = 0,
    val lat: Double? = null,
    val lng: Double? = null,
    val altM: Double? = null,
    val bearingDeg: Float? = null,
    val gpsAccuracyM: Float? = null
)

/**
 * Wraps Health Services' `ExerciseClient` — the correct modern Wear OS analog to Garmin's
 * `ActivityRecording.Session`: it's the dedicated "native workout recording" API that shows
 * the system "workout in progress" chip, unlocks background sensor sampling through Doze, and
 * is what a real Wear OS fitness app is expected to use rather than raw BODY_SENSORS polling.
 */
class HealthServicesManager(context: Context) {

    companion object {
        private const val TAG = "HealthServicesManager"
    }

    private val exerciseClient = HealthServices.getClient(context).exerciseClient

    private val _metrics = MutableStateFlow(ExerciseMetrics())
    val metrics: StateFlow<ExerciseMetrics> = _metrics

    private val _isExerciseInProgress = MutableStateFlow(false)
    val isExerciseInProgress: StateFlow<Boolean> = _isExerciseInProgress


    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            try {
                val dp = update.latestMetrics
                val hr = dp.getData(DataType.HEART_RATE_BPM).lastOrNull()?.value?.toInt()
                    ?: _metrics.value.heartRate
                val cadence = dp.getData(DataType.STEPS_PER_MINUTE).lastOrNull()?.value?.toInt()
                    ?: _metrics.value.cadenceSpm
                val distance = dp.getData(DataType.DISTANCE_TOTAL)?.total
                    ?: _metrics.value.distanceM
                val speed = dp.getData(DataType.SPEED).lastOrNull()?.value
                // Health Services' LocationData carries lat/lng/alt/bearing but no horizontal
                // accuracy figure in this API version — GPS quality/accuracy comes from a
                // separate FusedLocationProviderClient listener (see RunSessionController),
                // not from this callback.
                val location = dp.getData(DataType.LOCATION).lastOrNull()?.value

                _metrics.value = _metrics.value.copy(
                    distanceM = distance,
                    speedMs = speed ?: _metrics.value.speedMs,
                    heartRate = hr,
                    cadenceSpm = cadence,
                    lat = location?.latitude ?: _metrics.value.lat,
                    lng = location?.longitude ?: _metrics.value.lng,
                    altM = location?.altitude ?: _metrics.value.altM,
                    bearingDeg = location?.bearing?.toFloat() ?: _metrics.value.bearingDeg
                )
            } catch (e: Exception) {
                Log.w(TAG, "onExerciseUpdateReceived: ${e.message}")
            }
        }

        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {
            // No lap concept in the Garmin app's UI — intentionally unused.
        }

        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {
            if (availability is DataTypeAvailability) {
                Log.d(TAG, "Availability changed for $dataType: $availability")
            }
        }

        override fun onRegistered() {
            Log.d(TAG, "Exercise update callback registered")
        }

        override fun onRegistrationFailed(throwable: Throwable) {
            Log.w(TAG, "Exercise update callback registration failed: ${throwable.message}")
        }
    }

    fun setCallbackActive(active: Boolean) {
        try {
            if (active) {
                exerciseClient.setUpdateCallback(callback)
            } else {
                exerciseClient.clearUpdateCallbackAsync(callback)
            }
        } catch (e: Exception) {
            Log.w(TAG, "setCallbackActive($active) failed: ${e.message}")
        }
    }

    fun startExercise(isWalk: Boolean) {
        try {
            _metrics.value = ExerciseMetrics()
            val exerciseType = if (isWalk) ExerciseType.WALKING else ExerciseType.RUNNING
            val dataTypes = setOf(
                DataType.HEART_RATE_BPM,
                DataType.LOCATION,
                DataType.DISTANCE_TOTAL,
                DataType.SPEED,
                DataType.STEPS_PER_MINUTE
            )
            val config = ExerciseConfig.builder(exerciseType)
                .setDataTypes(dataTypes)
                .setIsAutoPauseAndResumeEnabled(false)
                .setIsGpsEnabled(true)
                .build()
            exerciseClient.startExerciseAsync(config)
            _isExerciseInProgress.value = true
            Log.d(TAG, "Exercise started: $exerciseType")
        } catch (e: Exception) {
            Log.e(TAG, "startExercise failed: ${e.message}")
        }
    }

    /**
     * True when Health Services is still running a workout this app started — i.e. the app was
     * killed (or crashed) mid-run and has just been relaunched. Null if it couldn't be asked.
     */
    suspend fun isOwnExerciseInProgress(): Boolean? = try {
        kotlinx.coroutines.withTimeout(5_000L) {
            kotlinx.coroutines.suspendCancellableCoroutine { cont ->
                val future = exerciseClient.getCurrentExerciseInfoAsync()
                future.addListener({
                    val result = runCatching {
                        future.get().exerciseTrackedStatus == ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS
                    }.getOrNull()
                    if (cont.isActive) cont.resumeWith(Result.success(result))
                }, { it.run() })
            }
        }
    } catch (e: Exception) {
        Log.w(TAG, "isOwnExerciseInProgress failed: ${e.message}")
        null
    }

    /** Picks a still-running workout back up after a relaunch (see [isOwnExerciseInProgress]). */
    fun reattach() {
        _metrics.value = ExerciseMetrics()
        _isExerciseInProgress.value = true
        setCallbackActive(true)
    }

    fun pauseExercise() {
        try {
            exerciseClient.pauseExerciseAsync()
        } catch (e: Exception) {
            Log.w(TAG, "pauseExercise failed: ${e.message}")
        }
    }

    fun resumeExercise() {
        try {
            exerciseClient.resumeExerciseAsync()
        } catch (e: Exception) {
            Log.w(TAG, "resumeExercise failed: ${e.message}")
        }
    }

    fun endExercise() {
        try {
            exerciseClient.endExerciseAsync()
            _isExerciseInProgress.value = false
        } catch (e: Exception) {
            Log.w(TAG, "endExercise failed: ${e.message}")
        }
    }
}
