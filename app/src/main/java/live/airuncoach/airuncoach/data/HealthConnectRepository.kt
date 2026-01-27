package live.airuncoach.airuncoach.data

import android.content.Context
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import live.airuncoach.airuncoach.domain.model.WellnessContext
import java.time.Instant
import java.time.ZonedDateTime

class HealthConnectRepository(private val context: Context) {

    private var healthConnectClient: HealthConnectClient? = null

    private val healthPermissions = setOf(
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class)
    )

    fun isHealthConnectAvailable(): Boolean {
        return HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
    }

    fun getPermissionsRequestContract(): ActivityResultContract<Set<String>, Set<String>> {
        return PermissionController.createRequestPermissionResultContract()
    }

    suspend fun getWellnessContext(): WellnessContext? {
        if (!isHealthConnectAvailable()) return null
        if (healthConnectClient == null) {
            healthConnectClient = HealthConnectClient.getOrCreate(context)
        }

        val grantedPermissions = healthConnectClient!!.permissionController.getGrantedPermissions()
        if (grantedPermissions.containsAll(healthPermissions)) {
            val now = ZonedDateTime.now()
            val yesterday = now.minusDays(1)

            val sleepSession = getLatestRecord<SleepSessionRecord>(yesterday.toInstant(), now.toInstant())
            val restingHeartRate = getLatestRecord<RestingHeartRateRecord>(yesterday.toInstant(), now.toInstant())
            val hrv = getLatestRecord<HeartRateVariabilityRmssdRecord>(yesterday.toInstant(), now.toInstant())

            return WellnessContext(
                sleepHours = sleepSession?.let { (it.endTime.toEpochMilli() - it.startTime.toEpochMilli()) / 3_600_000.0 },
                sleepQuality = null, // Not directly available
                sleepScore = null, // Not directly available
                bodyBattery = null, // Garmin-specific
                stressLevel = null,
                stressQualifier = null, // Not directly available
                hrvStatus = null, // Not directly available
                hrvFeedback = null, // Not directly available
                restingHeartRate = restingHeartRate?.beatsPerMinute?.toInt(),
                readinessScore = null, // Not directly available
                readinessRecommendation = null // Not directly available
            )
        }
        return null
    }

    private suspend inline fun <reified T : Record> getLatestRecord(startTime: Instant, endTime: Instant): T? {
        val request = ReadRecordsRequest(
            recordType = T::class,
            timeRangeFilter = TimeRangeFilter.between(startTime, endTime)
        )
        return healthConnectClient?.readRecords(request)?.records?.lastOrNull()
    }
}
