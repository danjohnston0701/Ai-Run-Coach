package live.airuncoach.airuncoach.network

import live.airuncoach.airuncoach.domain.model.Friend
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.GroupRun
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.model.AddFriendRequest
import live.airuncoach.airuncoach.network.model.AuthResponse
import live.airuncoach.airuncoach.network.model.CreateGoalRequest
import live.airuncoach.airuncoach.network.model.CreateGroupRunRequest
import live.airuncoach.airuncoach.network.model.LoginRequest
import live.airuncoach.airuncoach.network.model.RegisterRequest
import live.airuncoach.airuncoach.network.model.RouteGenerationRequest
import live.airuncoach.airuncoach.network.model.RouteGenerationResponse
import live.airuncoach.airuncoach.network.model.UpdateCoachSettingsRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface ApiService {
    @POST("/api/auth/login")
    suspend fun login(@Body request: LoginRequest): AuthResponse

    @POST("/api/auth/register")
    suspend fun register(@Body request: RegisterRequest): AuthResponse

    @GET("/api/users/{id}")
    suspend fun getUser(@Path("id") userId: String): User
    
    @PUT("/api/users/{id}/coach-settings")
    suspend fun updateCoachSettings(@Path("id") userId: String, @Body request: UpdateCoachSettingsRequest): User
    
    @GET("/api/goals/{userId}")
    suspend fun getGoals(@Path("userId") userId: String): List<Goal>
    
    @POST("/api/goals")
    suspend fun createGoal(@Body request: CreateGoalRequest): Goal
    
    @PUT("/api/goals/{goalId}")
    suspend fun updateGoal(@Path("goalId") goalId: Long, @Body request: CreateGoalRequest): Goal
    
    @DELETE("/api/goals/{goalId}")
    suspend fun deleteGoal(@Path("goalId") goalId: Long)

    @GET("/api/friends/{userId}")
    suspend fun getFriends(@Path("userId") userId: String): List<Friend>

    @POST("/api/friends/{userId}/add")
    suspend fun addFriend(@Path("userId") userId: String, @Body request: AddFriendRequest): Friend

    @GET("/api/group-runs")
    suspend fun getGroupRuns(): List<GroupRun>

    @POST("/api/group-runs")
    suspend fun createGroupRun(@Body request: CreateGroupRunRequest): GroupRun
    
    // AI Route Generation - Premium+ Plans
    @POST("/api/routes/generate-ai")
    suspend fun generateAIRoutes(@Body request: RouteGenerationRequest): RouteGenerationResponse
    
    // Template Route Generation - Free & Lite Plans
    @POST("/api/routes/generate-template")
    suspend fun generateTemplateRoutes(@Body request: RouteGenerationRequest): RouteGenerationResponse
}
