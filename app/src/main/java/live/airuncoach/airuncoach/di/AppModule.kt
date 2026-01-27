package live.airuncoach.airuncoach.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import live.airuncoach.airuncoach.data.HealthConnectRepository
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.RetrofitClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideSessionManager(
        @ApplicationContext context: Context
    ): SessionManager {
        return SessionManager(context)
    }

    @Provides
    @Singleton
    fun provideApiService(
        @ApplicationContext context: Context,
        sessionManager: SessionManager
    ): ApiService {
        return RetrofitClient(context, sessionManager).instance
    }

    @Provides
    @Singleton
    fun provideHealthConnectRepository(
        @ApplicationContext context: Context
    ): HealthConnectRepository {
        return HealthConnectRepository(context)
    }
}
