package live.airuncoach.airuncoach.utils

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Singleton audio queue that ensures coaching audio never overlaps.
 *
 * Both RunSessionViewModel (pre-run briefing) and RunTrackingService (in-run coaching)
 * use this queue. If audio is already playing, new requests are queued and played
 * sequentially once the current audio finishes.
 */
object CoachingAudioQueue {

    private const val TAG = "CoachingAudioQueue"

    data class AudioRequest(
        val base64Audio: String?,
        val format: String?,
        val fallbackText: String?,
        val context: Context,
        val onComplete: (() -> Unit)? = null
    )

    private val queue = ConcurrentLinkedQueue<AudioRequest>()
    private val isPlaying = AtomicBoolean(false)

    // Shared AudioPlayerHelper instance for all playback
    private var audioPlayer: AudioPlayerHelper? = null
    private var ttsHelper: TextToSpeechHelper? = null

    /**
     * Initialize with a Context. Safe to call multiple times.
     */
    fun init(context: Context) {
        if (audioPlayer == null) {
            audioPlayer = AudioPlayerHelper(context.applicationContext)
        }
        if (ttsHelper == null) {
            ttsHelper = TextToSpeechHelper(context.applicationContext)
        }
    }

    /**
     * Enqueue an audio request. Plays immediately if nothing is playing,
     * otherwise waits for the current audio to finish.
     */
    fun enqueue(request: AudioRequest) {
        init(request.context)
        queue.add(request)
        Log.d(TAG, "Enqueued audio (queue size: ${queue.size}, isPlaying: ${isPlaying.get()})")
        playNext()
    }

    /**
     * Convenience method: enqueue OpenAI TTS audio with text fallback.
     */
    fun enqueue(
        context: Context,
        base64Audio: String?,
        format: String?,
        fallbackText: String?,
        onComplete: (() -> Unit)? = null
    ) {
        enqueue(AudioRequest(base64Audio, format, fallbackText, context, onComplete))
    }

    /**
     * Check if audio is currently playing or queued.
     */
    fun isBusy(): Boolean = isPlaying.get() || queue.isNotEmpty()

    /**
     * Check if audio is actively playing right now.
     */
    fun isCurrentlyPlaying(): Boolean = isPlaying.get()

    /**
     * Clear all queued audio (does NOT stop currently playing audio).
     */
    fun clearQueue() {
        val cleared = queue.size
        queue.clear()
        if (cleared > 0) {
            Log.d(TAG, "Cleared $cleared queued audio requests")
        }
    }

    /**
     * Stop current playback AND clear the queue.
     */
    fun stopAll() {
        clearQueue()
        audioPlayer?.stop()
        isPlaying.set(false)
        Log.d(TAG, "Stopped all audio and cleared queue")
    }

    private fun playNext() {
        // Only one playback at a time
        if (!isPlaying.compareAndSet(false, true)) {
            return
        }

        val next = queue.poll()
        if (next == null) {
            isPlaying.set(false)
            return
        }

        Log.d(TAG, "Playing next audio (remaining in queue: ${queue.size})")

        val onDone: () -> Unit = {
            Log.d(TAG, "Audio playback completed")
            next.onComplete?.invoke()
            isPlaying.set(false)
            // Automatically play next queued item
            playNext()
        }

        if (next.base64Audio != null && next.format != null) {
            audioPlayer?.playAudio(next.base64Audio, next.format, onDone)
                ?: run {
                    Log.e(TAG, "AudioPlayerHelper not initialized")
                    onDone()
                }
        } else if (!next.fallbackText.isNullOrEmpty()) {
            val tts = ttsHelper
            if (tts != null) {
                tts.speak(next.fallbackText)
                // TTS will callback via UtteranceProgressListener which triggers onDone
            } else {
                Log.e(TAG, "TextToSpeechHelper not initialized")
                onDone()
            }
        } else {
            Log.w(TAG, "Empty audio request, skipping")
            onDone()
        }
    }

    /**
     * Clean up resources. Call when the app is shutting down.
     */
    fun destroy() {
        stopAll()
        audioPlayer?.destroy()
        audioPlayer = null
        ttsHelper?.destroy()
        ttsHelper = null
    }
}
