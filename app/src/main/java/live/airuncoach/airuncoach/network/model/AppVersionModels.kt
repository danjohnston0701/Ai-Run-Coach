package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * Response from GET /api/app/version-check
 *
 * Returned without authentication so the app can check for updates before or
 * immediately after login.
 */
data class AppVersionCheckResponse(
    @SerializedName("android") val android: AndroidVersionInfo,
    @SerializedName("garmin")  val garmin:  GarminVersionInfo,
)

data class AndroidVersionInfo(
    /** Latest versionCode on the Play Store */
    @SerializedName("latestVersionCode") val latestVersionCode: Int,
    /** Human-readable version string e.g. "1.6.0" */
    @SerializedName("latestVersionName") val latestVersionName: String,
    /** Minimum versionCode still allowed — older installs must update */
    @SerializedName("minVersionCode")    val minVersionCode:    Int,
    /** Play Store listing URL */
    @SerializedName("playStoreUrl")      val playStoreUrl:      String,
    /** One-sentence summary of what's new */
    @SerializedName("releaseNote")       val releaseNote:       String = "",
)

data class GarminVersionInfo(
    /** Latest Connect IQ companion version e.g. "1.4.0" */
    @SerializedName("latestVersion")     val latestVersion:     String,
    /** Minimum required companion version — older = show update prompt */
    @SerializedName("minVersion")        val minVersion:        String,
    /** Connect IQ store listing URL */
    @SerializedName("connectIqStoreUrl") val connectIqStoreUrl: String,
    /** One-sentence summary of what's new in the watch app */
    @SerializedName("releaseNote")       val releaseNote:       String = "",
)
