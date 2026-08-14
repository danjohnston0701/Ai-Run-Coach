package live.airuncoach.airuncoach.di

import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import live.airuncoach.airuncoach.service.SamsungWatchManager

/**
 * Hilt EntryPoint that allows non-Hilt-annotated components (e.g. plain Android Services)
 * to access the application-scoped SamsungWatchManager singleton — mirrors
 * [GarminWatchManagerEntryPoint] exactly, for the Wear OS/Samsung companion bridge.
 *
 * Usage in a Service:
 *   val entry = EntryPointAccessors.fromApplication(applicationContext,
 *       SamsungWatchManagerEntryPoint::class.java)
 *   val samsungWatchManager = entry.samsungWatchManager()
 *
 * This avoids creating a second SamsungWatchManager (which would re-register Data Layer
 * listeners and could cause duplicate message dispatch).
 */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface SamsungWatchManagerEntryPoint {
    fun samsungWatchManager(): SamsungWatchManager
}
