package live.airuncoach.airuncoach.data

/**
 * Garmin Developer Configuration
 * 
 * IMPORTANT: Add your Garmin app credentials here
 * Get these from: https://developer.garmin.com/connect-iq/my-apps/
 */
object GarminConfig {
    // Garmin app credentials
    const val CONSUMER_KEY = "1a40f4dd-9110-4df3-8a71-e59ec4e0387f"
    const val CONSUMER_SECRET = "FUYKIaxdBPHyBSnr7binxKecD+qAzRvEvouU2KQX0SU"
    
    // OAuth URLs
    const val OAUTH_REQUEST_TOKEN_URL = "https://connectapi.garmin.com/oauth-service/oauth/request_token"
    const val OAUTH_AUTHORIZE_URL = "https://connect.garmin.com/oauthConfirm"
    const val OAUTH_ACCESS_TOKEN_URL = "https://connectapi.garmin.com/oauth-service/oauth/access_token"
    
    // API Base URLs
    const val API_BASE_URL = "https://apis.garmin.com"
    const val WELLNESS_API_URL = "$API_BASE_URL/wellness-api/rest"
    const val ACTIVITIES_API_URL = "$API_BASE_URL/activity-service/activity"
    
    // OAuth Callback (must match your Garmin app configuration)
    // Garmin requires HTTPS, so we use backend as bridge
    const val OAUTH_CALLBACK = "https://airuncoach.live/garmin/callback"
    
    // Deep link for backend to redirect back to app
    const val APP_DEEP_LINK = "airuncoach://garmin/auth-complete"
    
    // Requested API Scopes
    val SCOPES = listOf(
        "read_activities",
        "read_wellness",
        "read_sleep",
        "read_weight",
        "read_body_battery",
        "read_respiration",
        "read_stress"
    )
}
