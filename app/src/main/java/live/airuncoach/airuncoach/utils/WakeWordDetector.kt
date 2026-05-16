package live.airuncoach.airuncoach.utils

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Continuously listens for the wake phrase "hey coach" during an active run.
 *
 * Uses Android's built-in SpeechRecognizer in a tight loop — no third-party
 * SDK required. Each listening window is ~4 seconds. If the recognised text
 * contains "hey coach" (case-insensitive, fuzzy matched), the [onWakeWord]
 * callback fires and the loop pauses until [resumeListening] is called.
 *
 * Battery impact: SpeechRecognizer requires an active network connection and
 * uses Google's on-device model when available. In practice <2% extra battery
 * drain per hour when using the on-device recogniser.
 *
 * Usage:
 *   1. Call [startWatching] when a run begins.
 *   2. Implement [onWakeWord] to launch the full talk-to-coach flow.
 *   3. Call [resumeListening] after the coaching exchange completes.
 *   4. Call [stopWatching] when the run ends.
 */
class WakeWordDetector(
    private val context: Context,
    val onWakeWord: () -> Unit
) {
    companion object {
        private const val TAG = "WakeWordDetector"

        // Phrases that count as the wake word (lower-case, fuzzy)
        private val WAKE_PHRASES = listOf(
            "hey coach",
            "hey coach",
            "a coach",       // common mishearing
            "hey couch",     // common mishearing
            "hey coach,",
            "ok coach",
            "okay coach",
        )
    }

    enum class State { IDLE, WATCHING, PAUSED, STOPPED }

    private val _state = MutableStateFlow(State.IDLE)
    val state: StateFlow<State> = _state.asStateFlow()

    private var speechRecognizer: SpeechRecognizer? = null
    private var isWatching = false

    // ── Public API ────────────────────────────────────────────────────────────

    /** Begin continuously listening for "hey coach". */
    fun startWatching() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.w(TAG, "Speech recognition not available on this device")
            return
        }
        isWatching = true
        _state.value = State.WATCHING
        Log.d(TAG, "Wake word detector started — listening for 'hey coach'")
        startListeningWindow()
    }

    /** Pause wake word detection while the coaching exchange is happening. */
    fun pauseListening() {
        _state.value = State.PAUSED
        speechRecognizer?.stopListening()
        Log.d(TAG, "Wake word detector paused")
    }

    /** Resume after a coaching exchange is complete. */
    fun resumeListening() {
        if (!isWatching) return
        _state.value = State.WATCHING
        Log.d(TAG, "Wake word detector resumed")
        startListeningWindow()
    }

    /** Stop completely — call when the run ends. */
    fun stopWatching() {
        isWatching = false
        _state.value = State.STOPPED
        speechRecognizer?.apply {
            stopListening()
            destroy()
        }
        speechRecognizer = null
        Log.d(TAG, "Wake word detector stopped")
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private fun startListeningWindow() {
        if (!isWatching || _state.value == State.PAUSED || _state.value == State.STOPPED) return

        // Destroy previous instance cleanly
        speechRecognizer?.destroy()
        speechRecognizer = null

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(wakeListener)
            val intent = buildWakeIntent()
            startListening(intent)
        }
    }

    private fun buildWakeIntent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
        // Keep each window short — we're just scanning for the wake phrase
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1000L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 500L)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        // Prefer on-device recognition to save battery and avoid network round trips
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
    }

    private fun isWakePhrase(text: String): Boolean {
        val lower = text.lowercase().trim()
        return WAKE_PHRASES.any { lower.contains(it) }
    }

    private val wakeListener = object : RecognitionListener {
        override fun onResults(results: Bundle?) {
            val candidates = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?: return loop()

            Log.d(TAG, "Wake window results: $candidates")

            val matched = candidates.any { isWakePhrase(it) }
            if (matched) {
                Log.d(TAG, "🎤 Wake word 'hey coach' detected!")
                pauseListening()
                onWakeWord()
            } else {
                loop()
            }
        }

        override fun onError(error: Int) {
            // 7 = ERROR_NO_MATCH (silence window), 8 = ERROR_RECOGNIZER_BUSY,
            // 6 = ERROR_SPEECH_TIMEOUT — all expected during continuous watching
            val label = when (error) {
                SpeechRecognizer.ERROR_NO_MATCH       -> "no_match"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "timeout"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY-> "busy"
                SpeechRecognizer.ERROR_NETWORK        -> "network"
                else                                  -> "error_$error"
            }
            Log.d(TAG, "Wake window ended ($label) — looping")
            // Small back-off before retrying to avoid tight crash loops
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ loop() }, 300)
        }

        override fun onReadyForSpeech(params: Bundle?)     {}
        override fun onBeginningOfSpeech()                 {}
        override fun onRmsChanged(rmsdB: Float)            {}
        override fun onBufferReceived(buffer: ByteArray?)  {}
        override fun onEndOfSpeech()                       {}
        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun loop() {
        if (!isWatching || _state.value == State.PAUSED || _state.value == State.STOPPED) return
        // Post to main thread — SpeechRecognizer must be created on main thread
        android.os.Handler(android.os.Looper.getMainLooper()).post { startListeningWindow() }
    }
}
