package live.airuncoach.airuncoach.di

import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import live.airuncoach.airuncoach.service.GarminWatchManager

/**
 * Hilt EntryPoint that allows non-Hilt-annotated components (e.g. plain Android Services)
 * to access the application-scoped GarminWatchManager singleton.
 *
 * Usage in a Service:
 *   val entry = EntryPointAccessors.fromApplication(applicationContext,
 *       GarminWatchManagerEntryPoint::class.java)
 *   val garminWatchManager = entry.garminWatchManager()
 *
 * This avoids creating a second GarminWatchManager (which would reinitialise the ConnectIQ SDK
 * and invalidate the existing message-event registration, causing IQ errors on the watch).
 */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface GarminWatchManagerEntryPoint {
    fun garminWatchManager(): GarminWatchManager
}
