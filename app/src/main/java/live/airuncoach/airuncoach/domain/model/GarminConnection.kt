package live.airuncoach.airuncoach.domain.model

data class GarminConnection(
    val isConnected: Boolean,
    val deviceName: String?,
    val deviceModel: String?,
    val lastSyncTimestamp: Long?,
    val batteryLevel: Int?
) {
    fun getLastSyncFormatted(): String {
        if (lastSyncTimestamp == null) return "Never synced"
        
        val now = System.currentTimeMillis()
        val diff = now - lastSyncTimestamp
        val minutes = diff / (1000 * 60)
        val hours = diff / (1000 * 60 * 60)
        val days = diff / (1000 * 60 * 60 * 24)
        
        return when {
            minutes < 1 -> "Just now"
            minutes < 60 -> "${minutes}m ago"
            hours < 24 -> "${hours}h ago"
            days < 7 -> "${days}d ago"
            else -> "Over a week ago"
        }
    }
}
