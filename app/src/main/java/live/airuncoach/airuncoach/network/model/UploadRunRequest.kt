package live.airuncoach.airuncoach.network.model

import live.airuncoach.airuncoach.domain.model.KmSplit
import live.airuncoach.airuncoach.domain.model.LocationPoint
import live.airuncoach.airuncoach.domain.model.StrugglePoint

data class UploadRunRequest(
    val routeId: String?,
    val distance: Double,
    val duration: Long,
    val avgPace: String,
    val avgHeartRate: Int?,
    val maxHeartRate: Int?,
    val minHeartRate: Int?,
    val calories: Int,
    val cadence: Int?,
    val elevation: Double,
    val difficulty: String,
    val startLat: Double,
    val startLng: Double,
    val gpsTrack: List<LocationPoint>,
    val completedAt: Long,
    val elevationGain: Double,
    val elevationLoss: Double,
    val tss: Int,
    val gap: String?,
    val isPublic: Boolean,
    val strugglePoints: List<StrugglePoint>,
    val kmSplits: List<KmSplit>,
    val terrainType: String,
    val userComments: String?,
    val targetDistance: Double?,
    val targetTime: Long?,
    val wasTargetAchieved: Boolean?
)
