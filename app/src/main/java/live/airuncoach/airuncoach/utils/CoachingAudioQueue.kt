package live.airuncoach.airuncoach.utils

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Singleton audio queue that ensures coaching audio never overlaps.
 *
 * KEY FEATURES:
 * - Navigation audio has PRIORITY: it interrupts any currently playing coaching audio
 * - Stuck-state recovery: if isPlaying gets stuck, a watchdog timer resets it
 * - Safety timeout: individual playback items auto-complete after 15s
 *
 * Both RunSessionViewModel (pre-run briefing) and RunTrackingService (in-run coaching)
 * use this queue.
 */
object CoachingAudioQueue {

    private const val TAG = "CoachingAudioQueue"
    
    /** Max time any single audio item can hold the queue before being force-completed */
    private const val STUCK_WATCHDOG_MS = 20_000L

    data class AudioRequest(
        val base64Audio: String?,
        val format: String?,
        val fallbackText: String?,
        val context: Context,
        val isNavigation: Boolean = false,  // Navigation requests get priority
        val onComplete: (() -> Unit)? = null
    )

    private val queue = ConcurrentLinkedQueue<AudioRequest>()
    private val isPlaying = AtomicBoolean(false)
    private val playStartTime = AtomicLong(0L)

    // Shared helpers
    private var audioPlayer: AudioPlayerHelper? = null
    private var ttsHelper: TextToSpeechHelper? = null
    private var audioFocusManager: AudioFocusManager? = null
    
    private val mainHandler = Handler(Looper.getMainLooper())
    private var watchdogRunnable: Runnable? = null

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
        if (audioFocusManager == null) {
            audioFocusManager = AudioFocusManager(context.applicationContext)
        }
    }

    /**
     * Enqueue a NAVIGATION audio request. Has PRIORITY over coaching:
     * - Interrupts any currently playing coaching audio
     * - Skips to front of queue (ahead of other coaching items)
     */
    fun enqueueNavigation(
        context: Context,
        base64Audio: String?,
        format: String?,
        fallbackText: String?,
        onComplete: (() -> Unit)? = null
    ) {
        init(context)
        val request = AudioRequest(base64Audio, format, fallbackText, context, isNavigation = true, onComplete = onComplete)
        
        // If coaching audio is currently playing, interrupt it for navigation
        if (isPlaying.get()) {
            Log.d(TAG, "Navigation audio interrupting current playback")
            // Clear any queued coaching items (keep other nav items)
            val navItems = queue.filter { it.isNavigation }
            queue.clear()
            navItems.forEach { queue.add(it) }
            
            // Stop current playback
            audioPlayer?.stop()
            ttsHelper?.stop()
            
            // Force reset playing state
            isPlaying.set(false)
        }
        
        queue.add(request)
        Log.d(TAG, "Enqueued NAVIGATION audio (queue size: ${queue.size})")
        playNext()
    }

    /**
     * Enqueue a regular coaching audio request. Plays after current audio finishes.
     */
    fun enqueue(request: AudioRequest) {
        init(request.context)
        queue.add(request)
        Log.d(TAG, "Enqueued audio (queue size: ${queue.size}, isPlaying: ${isPlaying.get()})")
        checkStuckState()
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
        enqueue(AudioRequest(base64Audio, format, fallbackText, context, isNavigation = false, onComplete = onComplete))
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
        cancelWatchdog()
        audioPlayer?.stop()
        ttsHelper?.stop()
        isPlaying.set(false)
        audioFocusManager?.abandonFocus()
        Log.d(TAG, "Stopped all audio and cleared queue")
    }
    
    /**
     * Check if the queue is stuck (isPlaying=true for too long) and recover.
     */
    private fun checkStuckState() {
        if (isPlaying.get()) {
            val elapsed = System.currentTimeMillis() - playStartTime.get()
            if (elapsed > STUCK_WATCHDOG_MS) {
                Log.w(TAG, "STUCK STATE DETECTED: isPlaying=true for ${elapsed}ms — forcing reset")
                audioPlayer?.stop()
                ttsHelper?.stop()
                isPlaying.set(false)
                audioFocusManager?.abandonFocus()
            }
        }
    }

    private fun playNext() {
        // Only one playback at a time
        if (!isPlaying.compareAndSet(false, true)) {
            return
        }

        val next = queue.poll()
        if (next == null) {
            isPlaying.set(false)
            cancelWatchdog()
            audioFocusManager?.abandonFocus()
            return
        }

        playStartTime.set(System.currentTimeMillis())
        startWatchdog()

        // Request audio focus
        val focusGranted = audioFocusManager?.requestFocus() ?: false
        if (!focusGranted) {
            Log.w(TAG, "Audio focus denied, skipping audio")
            next.onComplete?.invoke()
            isPlaying.set(false)
            playNext()
            return
        }

        val label = if (next.isNavigation) "NAV" else "COACHING"
        Log.d(TAG, "Playing $label audio (remaining in queue: ${queue.size})")

        val onDone: () -> Unit = {
            Log.d(TAG, "$label audio playback completed")
            cancelWatchdog()
            next.onComplete?.invoke()
            isPlaying.set(false)
            playNext()
        }

        try {
            if (next.base64Audio != null && next.format != null) {
                audioPlayer?.playAudio(next.base64Audio, next.format, onDone)
                    ?: run {
                        Log.e(TAG, "AudioPlayerHelper not initialized")
                        onDone()
                    }
            } else if (!next.fallbackText.isNullOrEmpty()) {
                val tts = ttsHelper
                if (tts != null) {
                    tts.speak(next.fallbackText, onComplete = onDone)
                } else {
                    Log.e(TAG, "TextToSpeechHelper not initialized")
                    onDone()
                }
            } else {
                Log.w(TAG, "Empty audio request, skipping")
                onDone()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error starting playback", e)
            onDone()
        }
    }
    
    private fun startWatchdog() {
        cancelWatchdog()
        watchdogRunnable = Runnable {
            if (isPlaying.get()) {
                Log.w(TAG, "Watchdog: audio stuck for ${STUCK_WATCHDOG_MS}ms — force completing")
                audioPlayer?.stop()
                ttsHelper?.stop()
                isPlaying.set(false)
                playNext()
            }
        }
        mainHandler.postDelayed(watchdogRunnable!!, STUCK_WATCHDOG_MS)
    }
    
    private fun cancelWatchdog() {
        watchdogRunnable?.let { mainHandler.removeCallbacks(it) }
        watchdogRunnable = null
    }

    /**
     * Clean up resources. Call when the app is shutting down.
     */
    fun destroy() {
        stopAll()
        cancelWatchdog()
        audioPlayer?.destroy()
        audioPlayer = null
        ttsHelper?.destroy()
        ttsHelper = null
        audioFocusManager?.destroy()
        audioFocusManager = null
    }
}
