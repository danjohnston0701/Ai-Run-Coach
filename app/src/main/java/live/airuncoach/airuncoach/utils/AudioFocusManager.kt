package live.airuncoach.airuncoach.utils

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.util.Log

/**
 * Manages audio focus so that background music (Spotify, etc.) is ducked
 * (lowered in volume, not paused) while the AI coaching audio plays, then
 * returns to full volume when coaching finishes. Mirrors iOS's
 * `AVAudioSession` `.duckOthers` behavior so runners can still hear the
 * beat of their music underneath the coach's voice.
 *
 * Uses AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK, which tells other audio apps
 * it's fine to just lower their volume instead of stopping playback.
 */
class AudioFocusManager(context: Context) {

    private val audioManager: AudioManager =
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private var focusRequest: AudioFocusRequest? = null
    private var hasFocus = false

    private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_GAIN -> {
                Log.d(TAG, "Audio focus gained")
                hasFocus = true
            }
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                Log.d(TAG, "Audio focus lost: $focusChange")
                hasFocus = false
            }
        }
    }

    /**
     * Request transient audio focus, causing background music to duck (lower
     * volume) rather than pause. Safe to call multiple times — will only
     * request if we don't already hold focus.
     */
    fun requestFocus(): Boolean {
        if (hasFocus) {
            Log.d(TAG, "Already holding audio focus, skipping request")
            return true
        }

        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setOnAudioFocusChangeListener(focusChangeListener)
            .build()
        focusRequest = request
        val result = audioManager.requestAudioFocus(request)

        hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        Log.d(TAG, "Requested audio focus: ${if (hasFocus) "GRANTED" else "DENIED"}")
        return hasFocus
    }

    /**
     * Abandon audio focus, allowing background music to resume at full volume.
     */
    fun abandonFocus() {
        if (!hasFocus) {
            return
        }

        focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }

        hasFocus = false
        focusRequest = null
        Log.d(TAG, "Abandoned audio focus — background music can resume")
    }

    /**
     * Clean up resources.
     */
    fun destroy() {
        abandonFocus()
    }

    companion object {
        private const val TAG = "AudioFocusManager"
    }
}
