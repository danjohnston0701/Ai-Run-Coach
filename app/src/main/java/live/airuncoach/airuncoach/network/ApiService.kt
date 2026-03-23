package live.airuncoach.airuncoach.network

import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.network.model.GroupRunsResponse
import live.airuncoach.airuncoach.network.model.CreateGroupRunRequest
import live.airuncoach.airuncoach.network.model.InviteFriendsRequest
import live.airuncoach.airuncoach.network.model.GroupRunRespondRequest
import live.airuncoach.airuncoach.network.model.GroupRunCompleteRequest
import live.airuncoach.airuncoach.network.model.GroupRunResultsResponse
import live.airuncoach.airuncoach.network.model.*
import live.airuncoach.airuncoach.network.model.GeneratePlanRequest
import live.airuncoach.airuncoach.network.model.GeneratePlanResponse
import live.airuncoach.airuncoach.network.model.TrainingPlanSummary
import live.airuncoach.airuncoach.network.model.TrainingPlanDetails
import live.airuncoach.airuncoach.network.model.TodayWorkoutResponse
import live.airuncoach.airuncoach.network.model.TrainingPlanProgress
import live.airuncoach.airuncoach.network.model.CompleteWorkoutRequest
import live.airuncoach.airuncoach.network.model.CompleteWorkoutResponse
import live.airuncoach.airuncoach.domain.model.ConnectedDevice
import live.airuncoach.airuncoach.domain.model.WellnessSyncResponse
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @POST("/api/auth/register")
    suspend fun register(@Body request: RegisterRequest): AuthResponse

    @POST("/api/auth/login")
    suspend fun login(@Body request: LoginRequest): AuthResponse

    @GET("/api/users/{id}")
    suspend fun getUser(@Path("id") userId: String): User

    @GET("/api/users/me")
    suspend fun getCurrentUser(): User

    @POST("/api/users/me/fcm-token")
    suspend fun saveFcmToken(@Body body: Map<String, String>): retrofit2.Response<Unit>

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
    suspend fun deleteGoal(@Path("id") goalId: String): retrofit2.Response<Unit>

    @PUT("/api/goals/{id}")
    suspend fun updateGoal(@Path("id") goalId: String, @Body request: UpdateGoalRequest): Goal

    @GET("/api/users/{userId}/friends")
    suspend fun getFriends(@Path("userId") userId: String): List<Friend>

    @GET("/api/users/search")
    suspend fun searchUsers(@Query("q") query: String): List<Friend> 

    @POST("/api/friend-requests")
    suspend fun sendFriendRequest(@Body request: Map<String, String>)
    
    @GET("/api/friend-requests/{userId}")
    suspend fun getFriendRequests(@Path("userId") userId: String): FriendRequestsResponse
    
    @POST("/api/friend-requests/{id}/accept")
    suspend fun acceptFriendRequest(@Path("id") requestId: String)
    
    @POST("/api/friend-requests/{id}/decline")
    suspend fun declineFriendRequest(@Path("id") requestId: String)

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

    @PUT("/api/runs/{runId}/struggle-points/{pointId}/comment")
    suspend fun updateStrugglePointComment(
        @Path("runId") runId: String,
        @Path("pointId") pointId: String,
        @Body request: UpdateStrugglePointCommentRequest
    ): Response<Unit>

    @POST("/api/coaching/elevation-coaching")
    suspend fun getElevationCoaching(@Body request: ElevationCoachingRequest): ElevationCoachingResponse

    @POST("/api/coaching/pre-run-briefing-audio")
    suspend fun getPreRunBriefing(@Body request: PreRunBriefingRequest): PreRunBriefingResponse

    @POST("/api/coaching/cadence-coaching")
    suspend fun getCadenceCoaching(@Body request: CadenceCoachingRequest): CadenceCoachingResponse

    @POST("/api/coaching/elite-coaching")
    suspend fun getEliteCoaching(@Body request: EliteCoachingRequest): EliteCoachingResponse

    @POST("/api/coaching/interval-coaching")
    suspend fun getIntervalCoaching(@Body request: IntervalCoachingRequest): IntervalCoachingResponse

    @GET("/api/group-runs")
    suspend fun getGroupRuns(@Query("my_groups") myGroups: Boolean? = null): GroupRunsResponse

    @GET("/api/group-runs/{id}")
    suspend fun getGroupRun(@Path("id") groupRunId: String): GroupRun

    @POST("/api/group-runs")
    suspend fun createGroupRun(@Body request: CreateGroupRunRequest): GroupRun

    @POST("/api/group-runs/{id}/invite")
    suspend fun inviteFriendsToGroupRun(
        @Path("id") groupRunId: String,
        @Body request: InviteFriendsRequest
    ): Response<Unit>

    @POST("/api/group-runs/{id}/respond")
    suspend fun respondToGroupRun(
        @Path("id") groupRunId: String,
        @Body request: GroupRunRespondRequest
    ): GroupRun

    @POST("/api/group-runs/{id}/ready")
    suspend fun markReadyToStart(@Path("id") groupRunId: String): GroupRun

    @POST("/api/group-runs/{id}/start")
    suspend fun startGroupRun(@Path("id") groupRunId: String): GroupRun

    @POST("/api/group-runs/{id}/complete")
    suspend fun completeGroupRun(
        @Path("id") groupRunId: String,
        @Body request: GroupRunCompleteRequest
    ): GroupRun

    @GET("/api/group-runs/{id}/results")
    suspend fun getGroupRunResults(@Path("id") groupRunId: String): GroupRunResultsResponse

    @DELETE("/api/group-runs/{id}/leave")
    suspend fun leaveGroupRun(@Path("id") groupRunId: String): Response<Unit>

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

    // AI analysis (new comprehensive flow)
    @GET("/api/runs/{id}/analysis")
    suspend fun getRunAnalysisRecord(@Path("id") runId: String): RunAnalysisRecord?

    @POST("/api/runs/{id}/analysis")
    suspend fun saveRunAnalysis(
        @Path("id") runId: String,
        @Body request: SaveRunAnalysisRequest
    ): RunAnalysisRecord

    @POST("/api/runs/{id}/comprehensive-analysis")
    suspend fun getComprehensiveRunAnalysis(@Path("id") runId: String): ComprehensiveAnalysisResponse

    @POST("/api/runs/{runId}/enrich-with-garmin-data")
    suspend fun enrichRunWithGarminData(@Path("runId") runId: String): RunSession

    /** Raw version — returns the full HTTP response so callers can inspect 202 Pending. */
    @POST("/api/runs/{runId}/enrich-with-garmin-data")
    suspend fun enrichRunWithGarminDataRaw(@Path("runId") runId: String): retrofit2.Response<RunSession>

    @POST("/api/runs/{id}/ai-insights")
    suspend fun getBasicRunInsights(
        @Path("id") runId: String,
        @Body request: Map<String, String> = emptyMap()
    ): BasicRunInsights

    @POST("/api/runs/{id}/freeform-analysis")
    suspend fun generateFreeformAnalysis(
        @Path("id") runId: String,
        @Body request: FreeformAnalysisRequest
    ): FreeformAnalysisResponse
    
    @POST("/api/runs")
    suspend fun uploadRun(@Body request: UploadRunRequest): UploadRunResponse

    @POST("/api/runs/sync-progress")
    suspend fun updateRunProgress(@Body request: UpdateRunProgressRequest)
    
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

    @GET("/api/users/{userId}/run-history-stats")
    suspend fun getRunHistoryStats(
        @Path("userId") userId: String,
        @Query("targetDistanceKm") targetDistanceKm: Double? = null
    ): RunHistoryStats

    // ========== FITNESS & FRESHNESS ==========
    
    @GET("/api/fitness/trend/{userId}")
    suspend fun getFitnessTrend(
        @Path("userId") userId: String,
        @Query("days") days: Int = 90
    ): FitnessTrend

    @GET("/api/fitness/current/{userId}")
    suspend fun getCurrentFitness(@Path("userId") userId: String): DailyFitness

    // ========== WEATHER IMPACT ANALYSIS ==========
    
    @GET("/api/users/{userId}/weather-impact")
    suspend fun getWeatherImpact(@Path("userId") userId: String): WeatherImpactData

    // ========== SEGMENTS ==========
    
    @GET("/api/segments/nearby")
    suspend fun getNearbySegments(
        @Query("lat") latitude: Double,
        @Query("lng") longitude: Double,
        @Query("radius") radiusMeters: Int = 5000
    ): List<NearbySegment>

    @GET("/api/segments/{segmentId}")
    suspend fun getSegment(@Path("segmentId") segmentId: String): Segment

    @GET("/api/segments/{segmentId}/leaderboard")
    suspend fun getSegmentLeaderboard(
        @Path("segmentId") segmentId: String,
        @Query("period") period: String = "all_time" // all_time, year, month
    ): SegmentLeaderboard

    @POST("/api/segments/{segmentId}/efforts")
    suspend fun submitSegmentEffort(
        @Path("segmentId") segmentId: String,
        @Body effort: SegmentEffort
    )

    @POST("/api/segments")
    suspend fun createSegment(@Body segment: Segment): Segment

    @GET("/api/runs/{runId}/segments")
    suspend fun getSegmentsForRun(@Path("runId") runId: String): List<SegmentMatch>

    // ========== TRAINING PLANS ==========

    @POST("/api/training-plans/generate")
    suspend fun generateTrainingPlan(@Body request: GeneratePlanRequest): GeneratePlanResponse

    @GET("/api/training-plans/{userId}")
    suspend fun getUserTrainingPlans(
        @Path("userId") userId: String,
        @Query("status") status: String = "active"
    ): List<TrainingPlanSummary>

    @GET("/api/training-plans/details/{planId}")
    suspend fun getTrainingPlanDetails(@Path("planId") planId: String): TrainingPlanDetails

    @GET("/api/training-plans/{planId}/today")
    suspend fun getTodayWorkout(
        @Path("planId") planId: String,
        @Query("timezone") timezone: String? = null
    ): TodayWorkoutResponse

    @GET("/api/training-plans/{planId}/progress")
    suspend fun getTrainingPlanProgress(@Path("planId") planId: String): TrainingPlanProgress

    @PUT("/api/training-plans/workouts/{workoutId}/complete")
    suspend fun completeWorkout(
        @Path("workoutId") workoutId: String,
        @Body request: CompleteWorkoutRequest
    ): Response<CompleteWorkoutResponse>

    @PUT("/api/training-plans/workouts/{workoutId}/skip")
    suspend fun skipWorkout(@Path("workoutId") workoutId: String): Response<Unit>

    @PUT("/api/training-plans/{planId}/status")
    suspend fun updatePlanStatus(
        @Path("planId") planId: String,
        @Body request: Map<String, String>
    ): Response<Unit>

    @DELETE("/api/training-plans/{planId}")
    suspend fun deleteTrainingPlan(@Path("planId") planId: String): Response<Unit>

    @POST("/api/training-plans/adaptations/{adaptationId}/accept")
    suspend fun acceptAdaptation(@Path("adaptationId") adaptationId: String): Response<AdaptationResponse>

    @POST("/api/training-plans/adaptations/{adaptationId}/decline")
    suspend fun declineAdaptation(@Path("adaptationId") adaptationId: String): Response<AdaptationResponse>

    @GET("/api/training-plans/{planId}/adaptations/pending")
    suspend fun getPendingAdaptations(@Path("planId") planId: String): PendingAdaptationsResponse

    // ========== NOTIFICATION PREFERENCES ==========

    @GET("/api/notification-preferences/{userId}")
    suspend fun getNotificationPreferences(@Path("userId") userId: String): NotificationPreferencesResponse

    @PUT("/api/notification-preferences/{userId}")
    suspend fun updateNotificationPreferences(
        @Path("userId") userId: String,
        @Body updates: Map<String, Boolean>
    ): Response<Unit>

    // ========== SOCIAL FEED ==========
    
    @GET("/api/feed")
    suspend fun getFeed(
        @Query("page") page: Int = 0,
        @Query("limit") limit: Int = 20
    ): List<FeedActivity>

    @POST("/api/feed/{activityId}/kudos")
    suspend fun giveKudos(@Path("activityId") activityId: String)

    @DELETE("/api/feed/{activityId}/kudos")
    suspend fun removeKudos(@Path("activityId") activityId: String)

    @POST("/api/feed/{activityId}/comments")
    suspend fun addComment(
        @Path("activityId") activityId: String,
        @Body comment: String
    ): ActivityComment

    @POST("/api/feed/post")
    suspend fun createPost(@Body activity: FeedActivity)

    // ========== CLUBS ==========
    
    @GET("/api/clubs")
    suspend fun getClubs(@Query("query") query: String?): List<Club>

    @GET("/api/clubs/{clubId}")
    suspend fun getClub(@Path("clubId") clubId: String): Club

    @POST("/api/clubs/{clubId}/join")
    suspend fun joinClub(@Path("clubId") clubId: String)

    @DELETE("/api/clubs/{clubId}/leave")
    suspend fun leaveClub(@Path("clubId") clubId: String)

    // ========== CHALLENGES ==========
    
    @GET("/api/challenges")
    suspend fun getChallenges(): List<Challenge>

    @POST("/api/challenges/{challengeId}/join")
    suspend fun joinChallenge(@Path("challengeId") challengeId: String)

    @GET("/api/challenges/{challengeId}/leaderboard")
    suspend fun getChallengeLeaderboard(@Path("challengeId") challengeId: String): List<ChallengeRank>

    // ========== HEATMAP ==========
    
    @GET("/api/heatmap/{userId}")
    suspend fun getPersonalHeatmap(
        @Path("userId") userId: String,
        @Query("startDate") startDate: String?,
        @Query("endDate") endDate: String?
    ): HeatmapData

    // ========== NOTIFICATIONS ==========
    
    @GET("/api/notifications")
    suspend fun getNotifications(): List<Notification>

    @PUT("/api/notifications/{notificationId}/read")
    suspend fun markNotificationRead(@Path("notificationId") notificationId: String)

    @PUT("/api/notifications/read-all")
    suspend fun markAllNotificationsRead()
    
    // ========== CONNECTED DEVICES & GARMIN ==========
    
    @GET("/api/connected-devices")
    suspend fun getConnectedDevices(): List<ConnectedDevice>

    @POST("/api/connected-devices")
    suspend fun connectDevice(@Body request: Map<String, String>): ConnectedDevice
    
    @DELETE("/api/connected-devices/{deviceId}")
    suspend fun disconnectDevice(@Path("deviceId") deviceId: String)
    
    @GET("/api/auth/garmin")
    suspend fun startGarminAuth(@Query("app_redirect") appRedirect: String = "airuncoach://connected-devices"): String
    
    @POST("/api/garmin/wellness/sync")
    suspend fun syncGarminWellness(@Body date: Map<String, String> = emptyMap()): WellnessSyncResponse
    
    @POST("/api/garmin/upload-run")
    suspend fun uploadRunToGarmin(@Body request: GarminUploadRequest): GarminUploadResponse
    
    // Garmin Permissions Management
    @GET("/api/garmin/permissions")
    suspend fun getGarminPermissions(): GarminPermissionsResponse
    
    @POST("/api/garmin/reauthorize")
    suspend fun getGarminReauthorizationUrl(): GarminAuthUrlResponse
    
    @POST("/api/garmin/disconnect")
    suspend fun disconnectGarminDevice(): Unit

    // ========== SHARE RUN LINKS ==========
    @POST("/api/runs/{id}/share-link")
    suspend fun createShareLink(@Path("id") runId: String): ShareLinkResponse

    @GET("/api/shared-run/{token}")
    suspend fun getSharedRun(@Path("token") token: String): SharedRunResponse

    // ========== SHARE IMAGE CREATOR ==========
    @GET("/api/share/templates")
    suspend fun getShareTemplates(): ShareTemplatesResponse

    @POST("/api/share/preview")
    suspend fun getSharePreview(@Body request: ShareImageRequest): SharePreviewResponse

    @POST("/api/share/generate")
    suspend fun generateShareImage(@Body request: ShareImageRequest): okhttp3.ResponseBody

    // ========== SESSION COACHING (Phase 1 Integration) ==========
    
    @GET("/api/workouts/{workoutId}/session-instructions")
    suspend fun getSessionInstructions(@Path("workoutId") workoutId: String): SessionInstructionsResponse
    
    @POST("/api/coaching/session-events")
    suspend fun logCoachingEvent(@Body event: CoachingSessionEvent): Response<Unit>

    // ========== MY DATA - ANALYTICS & INSIGHTS ==========
    
    @GET("/api/my-data/personal-bests")
    suspend fun getMyDataPersonalBests(): Response<MyDataResponse>
    
    @GET("/api/my-data/statistics")
    suspend fun getMyDataStatistics(
        @Query("days") days: Int = 30
    ): Response<MyDataResponse>
    
    @GET("/api/my-data/trends")
    suspend fun getMyDataTrends(): Response<MyDataResponse>
    
    @GET("/api/my-data/detailed-trends")
    suspend fun getMyDataDetailedTrends(
        @Query("days") days: Int = 30
    ): Response<MyDataResponse>
    
    @GET("/api/my-data/all-time-stats")
    suspend fun getMyDataAllTimeStats(): Response<MyDataResponse>
}

/**
 * Generic response wrapper for My Data endpoints
 */
data class MyDataResponse(
    val success: Boolean = true,
    val data: Map<String, Any> = emptyMap(),
    val message: String? = null
)



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
