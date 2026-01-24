package live.airuncoach.airuncoach.network

import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.model.CreateGoalRequest
import live.airuncoach.airuncoach.network.model.LoginRequest
import live.airuncoach.airuncoach.network.model.RegisterRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface ApiService {
    @POST("/api/auth/login")
    suspend fun login(@Body request: LoginRequest): User

    @POST("/api/auth/register")
    suspend fun register(@Body request: RegisterRequest): User

    @GET("/api/users/{id}")
    suspend fun getUser(@Path("id") userId: String): User
    
    @GET("/api/goals/{userId}")
    suspend fun getGoals(@Path("userId") userId: String): List<Goal>
    
    @POST("/api/goals")
    suspend fun createGoal(@Body request: CreateGoalRequest): Goal
    
    @PUT("/api/goals/{goalId}")
    suspend fun updateGoal(@Path("goalId") goalId: Long, @Body request: CreateGoalRequest): Goal
    
    @DELETE("/api/goals/{goalId}")
    suspend fun deleteGoal(@Path("goalId") goalId: Long)
}
