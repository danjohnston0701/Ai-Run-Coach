package live.airuncoach.airuncoach.utils

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.util.Log

/**
 * Manages audio focus so that background music (Spotify, etc.) is paused
 * while the AI coaching audio plays, then resumes when coaching finishes.
 *
 * Uses AUDIOFOCUS_GAIN_TRANSIENT which tells other audio apps to pause
 * (rather than just "duck" / lower volume slightly), giving the coaching
 * voice full clarity.
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
     * Request transient audio focus, causing background music to pause.
     * Safe to call multiple times — will only request if we don't already hold focus.
     */
    fun requestFocus(): Boolean {
        if (hasFocus) {
            Log.d(TAG, "Already holding audio focus, skipping request")
            return true
        }

        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setOnAudioFocusChangeListener(focusChangeListener)
            .setWillPauseWhenDucked(true) // We want other apps to pause, not just duck
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
