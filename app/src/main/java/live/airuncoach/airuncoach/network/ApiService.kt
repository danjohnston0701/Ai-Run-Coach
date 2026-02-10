package live.airuncoach.airuncoach.network

import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.network.model.PaceUpdateResponse
import live.airuncoach.airuncoach.network.model.StruggleUpdateResponse
import live.airuncoach.airuncoach.network.model.PhaseCoachingResponse
import live.airuncoach.airuncoach.network.model.TalkToCoachResponse
import live.airuncoach.airuncoach.network.model.HeartRateCoachingResponse
import live.airuncoach.airuncoach.network.model.*
import live.airuncoach.airuncoach.domain.model.ConnectedDevice
import live.airuncoach.airuncoach.domain.model.WellnessSyncResponse
import okhttp3.MultipartBody
import retrofit2.http.*

interface ApiService {
    @POST("/api/auth/register")
    suspend fun register(@Body request: RegisterRequest): AuthResponse

    @POST("/api/auth/login")
    suspend fun login(@Body request: LoginRequest): AuthResponse

    @GET("/api/users/{id}")
    suspend fun getUser(@Path("id") userId: String): User

    @PUT("/api/users/{id}")
    suspend fun updateUser(@Path("id") userId: String, @Body request: UpdateUserRequest): User

    @PUT("/api/users/{id}/coach-settings")
    suspend fun updateCoachSettings(
        @Path("id") userId: String,
        @Body request: UpdateCoachSettingsRequest
    ): User

    @GET("/api/goals/{userId}")
    suspend fun getGoals(@Path("userId") userId: String): List<Goal>

    @POST("/api/goals")
    suspend fun createGoal(@Body request: CreateGoalRequest): Goal

    @DELETE("/api/goals/{id}")
    suspend fun deleteGoal(@Path("id") goalId: String)

    @GET("/api/users/{userId}/friends")
    suspend fun getFriends(@Path("userId") userId: String): List<Friend>

    @GET("/api/users/search")
    suspend fun searchUsers(@Query("query") query: String): List<Friend> 

    @POST("/api/friend-requests")
    suspend fun addFriend(@Body request: AddFriendRequest): Friend

    @POST("/api/coaching/pace-update")
    suspend fun getPaceUpdate(@Body request: PaceUpdate): PaceUpdateResponse

    @POST("/api/coaching/struggle-coaching")
    suspend fun getStruggleCoaching(@Body request: StruggleUpdate): StruggleUpdateResponse

    @POST("api/coaching/phase-coaching")
    suspend fun getPhaseCoaching(@Body request: PhaseCoachingUpdate): PhaseCoachingResponse

    @POST("/api/coaching/talk-to-coach")
    suspend fun talkToCoach(@Body request: TalkToCoachRequest): TalkToCoachResponse
    
    @POST("/api/coaching/hr-coaching")
    suspend fun getHeartRateCoaching(@Body request: HeartRateCoachingRequest): HeartRateCoachingResponse

    @POST("/api/coaching/pre-run-briefing-audio")
    suspend fun getPreRunBriefing(@Body request: PreRunBriefingRequest): PreRunBriefingResponse

    @GET("/api/group-runs")
    suspend fun getGroupRuns(): List<GroupRun>

    @GET("/api/events/grouped")
    suspend fun getEventsGrouped(): Map<String, List<Event>>

    @GET("/api/routes/{id}")
    suspend fun getRoute(@Path("id") routeId: String): Route

    @POST("/api/users/{id}/profile-picture")
    suspend fun uploadProfilePicture(@Path("id") userId: String, @Body request: UploadProfilePictureRequest): User

    @POST("/api/routes/generate-options")
    suspend fun generateAIRoutes(@Body request: RouteGenerationRequest): RouteGenerationResponse

    @POST("/api/routes/generate-intelligent")
    suspend fun generateIntelligentRoutes(@Body request: IntelligentRouteRequest): IntelligentRouteResponse

    @POST("/api/coaching/run-analysis")
    suspend fun getRunAnalysis(@Body request: RunAnalysisRequest): RunAnalysisResponse
    
    @POST("/api/runs")
    suspend fun uploadRun(@Body request: UploadRunRequest): UploadRunResponse
    
    @GET("/api/runs/{id}")
    suspend fun getRunById(@Path("id") runId: String): RunSession

    @DELETE("/api/runs/{runId}")
    suspend fun deleteRun(@Path("runId") runId: String)

    // Garmin OAuth
    @GET("/api/auth/garmin")
    suspend fun initiateGarminAuth(
        @Query("app_redirect") appRedirect: String,
        @Query("history_days") historyDays: Int = 30
    ): GarminAuthResponse
    
    @GET("/api/users/{userId}/runs")
    suspend fun getRunsForUser(@Path("userId") userId: String): List<RunSession>

    // ========== FITNESS & FRESHNESS ==========
    
    @GET("/api/fitness/trend/{userId}")
    suspend fun getFitnessTrend(
        @Path("userId") userId: String,
        @Query("days") days: Int = 90
    ): live.airuncoach.airuncoach.domain.model.FitnessTrend

    @GET("/api/fitness/current/{userId}")
    suspend fun getCurrentFitness(@Path("userId") userId: String): live.airuncoach.airuncoach.domain.model.DailyFitness

    // ========== SEGMENTS ==========
    
    @GET("/api/segments/nearby")
    suspend fun getNearbySegments(
        @Query("lat") latitude: Double,
        @Query("lng") longitude: Double,
        @Query("radius") radiusMeters: Int = 5000
    ): List<live.airuncoach.airuncoach.domain.model.NearbySegment>

    @GET("/api/segments/{segmentId}")
    suspend fun getSegment(@Path("segmentId") segmentId: String): live.airuncoach.airuncoach.domain.model.Segment

    @GET("/api/segments/{segmentId}/leaderboard")
    suspend fun getSegmentLeaderboard(
        @Path("segmentId") segmentId: String,
        @Query("period") period: String = "all_time" // all_time, year, month
    ): live.airuncoach.airuncoach.domain.model.SegmentLeaderboard

    @POST("/api/segments/{segmentId}/efforts")
    suspend fun submitSegmentEffort(
        @Path("segmentId") segmentId: String,
        @Body effort: live.airuncoach.airuncoach.domain.model.SegmentEffort
    )

    @POST("/api/segments")
    suspend fun createSegment(@Body segment: live.airuncoach.airuncoach.domain.model.Segment): live.airuncoach.airuncoach.domain.model.Segment

    @GET("/api/runs/{runId}/segments")
    suspend fun getSegmentsForRun(@Path("runId") runId: String): List<live.airuncoach.airuncoach.domain.model.SegmentMatch>

    // ========== TRAINING PLANS ==========
    
    @GET("/api/training-plans")
    suspend fun getTrainingPlans(
        @Query("goal") goal: String,
        @Query("level") level: String
    ): List<live.airuncoach.airuncoach.domain.model.TrainingPlan>

    @GET("/api/training-plans/{planId}")
    suspend fun getTrainingPlan(@Path("planId") planId: String): live.airuncoach.airuncoach.domain.model.TrainingPlan

    @POST("/api/training-plans/{userId}/generate")
    suspend fun generateAITrainingPlan(
        @Path("userId") userId: String,
        @Body goal: live.airuncoach.airuncoach.domain.model.TrainingGoal
    ): live.airuncoach.airuncoach.domain.model.TrainingPlan

    @POST("/api/training-plans/{planId}/enroll")
    suspend fun enrollInPlan(@Path("planId") planId: String)

    @PUT("/api/training-plans/{planId}/workouts/{workoutId}")
    suspend fun completeWorkout(
        @Path("planId") planId: String,
        @Path("workoutId") workoutId: String,
        @Body runId: String
    )

    @GET("/api/training-plans/{planId}/progress")
    suspend fun getPlanProgress(@Path("planId") planId: String): live.airuncoach.airuncoach.domain.model.PlanProgress

    // ========== SOCIAL FEED ==========
    
    @GET("/api/feed")
    suspend fun getFeed(
        @Query("page") page: Int = 0,
        @Query("limit") limit: Int = 20
    ): List<live.airuncoach.airuncoach.domain.model.FeedActivity>

    @POST("/api/feed/{activityId}/kudos")
    suspend fun giveKudos(@Path("activityId") activityId: String)

    @DELETE("/api/feed/{activityId}/kudos")
    suspend fun removeKudos(@Path("activityId") activityId: String)

    @POST("/api/feed/{activityId}/comments")
    suspend fun addComment(
        @Path("activityId") activityId: String,
        @Body comment: String
    ): live.airuncoach.airuncoach.domain.model.ActivityComment

    @POST("/api/feed/post")
    suspend fun createPost(@Body activity: live.airuncoach.airuncoach.domain.model.FeedActivity)

    // ========== CLUBS ==========
    
    @GET("/api/clubs")
    suspend fun getClubs(@Query("query") query: String?): List<live.airuncoach.airuncoach.domain.model.Club>

    @GET("/api/clubs/{clubId}")
    suspend fun getClub(@Path("clubId") clubId: String): live.airuncoach.airuncoach.domain.model.Club

    @POST("/api/clubs/{clubId}/join")
    suspend fun joinClub(@Path("clubId") clubId: String)

    @DELETE("/api/clubs/{clubId}/leave")
    suspend fun leaveClub(@Path("clubId") clubId: String)

    // ========== CHALLENGES ==========
    
    @GET("/api/challenges")
    suspend fun getChallenges(): List<live.airuncoach.airuncoach.domain.model.Challenge>

    @POST("/api/challenges/{challengeId}/join")
    suspend fun joinChallenge(@Path("challengeId") challengeId: String)

    @GET("/api/challenges/{challengeId}/leaderboard")
    suspend fun getChallengeLeaderboard(@Path("challengeId") challengeId: String): List<live.airuncoach.airuncoach.domain.model.ChallengeRank>

    // ========== HEATMAP ==========
    
    @GET("/api/heatmap/{userId}")
    suspend fun getPersonalHeatmap(
        @Path("userId") userId: String,
        @Query("startDate") startDate: String?,
        @Query("endDate") endDate: String?
    ): HeatmapData

    // ========== NOTIFICATIONS ==========
    
    @GET("/api/notifications")
    suspend fun getNotifications(): List<live.airuncoach.airuncoach.domain.model.Notification>

    @PUT("/api/notifications/{notificationId}/read")
    suspend fun markNotificationRead(@Path("notificationId") notificationId: String)

    @PUT("/api/notifications/read-all")
    suspend fun markAllNotificationsRead()
    
    // ========== CONNECTED DEVICES & GARMIN ==========
    
    @GET("/api/connected-devices")
    suspend fun getConnectedDevices(): List<ConnectedDevice>
    
    @POST("/api/connected-devices")
    suspend fun connectDevice(@Body request: Map<String, String>): ConnectedDevice
    
    @DELETE("/api/connected-devices/{id}")
    suspend fun disconnectDevice(@Path("id") deviceId: String): Map<String, Boolean>
    
    @GET("/api/auth/garmin")
    suspend fun startGarminAuth(@Query("app_redirect") appRedirect: String = "airuncoach://connected-devices"): String
    
    @POST("/api/garmin/wellness/sync")
    suspend fun syncGarminWellness(@Body date: Map<String, String> = emptyMap()): WellnessSyncResponse
}

/**
 * Heatmap data structure
 */
data class HeatmapData(
    val points: List<HeatmapPoint>,
    val bounds: MapBounds
)

data class HeatmapPoint(
    val latitude: Double,
    val longitude: Double,
    val intensity: Float  // 0.0 to 1.0
)

data class MapBounds(
    val north: Double,
    val south: Double,
    val east: Double,
    val west: Double
)
