package live.airuncoach.airuncoach.util

import live.airuncoach.airuncoach.domain.model.RunSetupConfig

/**
 * Temporary holder for RunSetupConfig during navigation
 * Used to pass config from RunSetupScreen to RunSessionScreen
 */
object RunConfigHolder {
    private var config: RunSetupConfig? = null
    
    fun setConfig(newConfig: RunSetupConfig) {
        config = newConfig
    }
    
    fun getConfig(): RunSetupConfig? {
        val currentConfig = config
        config = null // Clear after reading
        return currentConfig
    }
    
    fun clearConfig() {
        config = null
    }
}
