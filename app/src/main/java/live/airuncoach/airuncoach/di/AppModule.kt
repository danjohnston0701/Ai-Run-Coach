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

    @Singleton
    @Provides
    fun provideSessionManager(@ApplicationContext context: Context): SessionManager {
        return SessionManager(context)
    }

    @Singleton
    @Provides
    fun provideApiService(sessionManager: SessionManager, @ApplicationContext context: Context): ApiService {
        return RetrofitClient(context, sessionManager).instance
    }

    @Singleton
    @Provides
    fun provideHealthConnectRepository(@ApplicationContext context: Context): HealthConnectRepository {
        return HealthConnectRepository(context)
    }
}
