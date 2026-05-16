package live.airuncoach.airuncoach.utils

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class SpeechStatus { LISTENING, IDLE, ERROR, TIMED_OUT }

data class SpeechState(
    val status: SpeechStatus = SpeechStatus.IDLE,
    val text: String = ""
)

/**
 * Wraps Android's SpeechRecognizer for the "Talk to Coach" query window.
 *
 * After [startListening] is called the recogniser listens until it hears
 * speech and then detects end-of-speech, OR until [silenceTimeoutMs] elapses
 * with no speech detected at all — whichever comes first.
 *
 * The 5-second "no speech" timeout prevents the app from hanging indefinitely
 * waiting for the user to speak after the wake word fires.
 */
class SpeechRecognizerHelper(
    private val context: Context,
    /** How long to wait for the user to start speaking before giving up. */
    private val silenceTimeoutMs: Long = 5_000L
) {
    companion object {
        private const val TAG = "SpeechRecognizerHelper"
    }

    private var speechRecognizer: SpeechRecognizer? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var silenceTimeoutRunnable: Runnable? = null

    private val _speechState = MutableStateFlow(SpeechState())
    val speechState: StateFlow<SpeechState> = _speechState.asStateFlow()

    private val recognitionListener = object : RecognitionListener {

        override fun onReadyForSpeech(params: Bundle?) {
            _speechState.update { it.copy(status = SpeechStatus.LISTENING) }
            Log.d(TAG, "Ready for speech — silence timeout armed (${silenceTimeoutMs}ms)")
            // Arm the silence timeout — if the user doesn't say anything, cancel
            armSilenceTimeout()
        }

        override fun onBeginningOfSpeech() {
            // User started talking — disarm the silence timeout
            Log.d(TAG, "Speech detected — silence timeout disarmed")
            disarmSilenceTimeout()
        }

        override fun onResults(results: Bundle?) {
            disarmSilenceTimeout()
            val spokenText = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull() ?: ""
            Log.d(TAG, "Speech result: '$spokenText'")
            _speechState.update { it.copy(status = SpeechStatus.IDLE, text = spokenText) }
        }

        override fun onError(error: Int) {
            disarmSilenceTimeout()
            val label = when (error) {
                SpeechRecognizer.ERROR_NO_MATCH       -> "no_match"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "speech_timeout"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY-> "busy"
                SpeechRecognizer.ERROR_NETWORK        -> "network"
                else                                  -> "error_$error"
            }
            Log.w(TAG, "Speech recognition error: $label")
            _speechState.update { it.copy(status = SpeechStatus.ERROR, text = "") }
        }

        override fun onEndOfSpeech()                            {}
        override fun onRmsChanged(rmsdB: Float)                {}
        override fun onBufferReceived(buffer: ByteArray?)      {}
        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?)  {}
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Start listening for a user query. The recogniser will emit [SpeechStatus.IDLE]
     * with the transcript when speech is detected, or [SpeechStatus.TIMED_OUT] if
     * no speech is heard within [silenceTimeoutMs].
     */
    fun startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.w(TAG, "Speech recognition not available")
            _speechState.update { it.copy(status = SpeechStatus.ERROR) }
            return
        }

        // Reset state
        _speechState.update { SpeechState(status = SpeechStatus.IDLE, text = "") }

        speechRecognizer?.destroy()
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(recognitionListener)
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                // Generous end-of-speech pauses so the user can think mid-sentence
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            startListening(intent)
        }
        Log.d(TAG, "Started listening for user query")
    }

    fun stopListening() {
        disarmSilenceTimeout()
        speechRecognizer?.stopListening()
    }

    fun destroy() {
        disarmSilenceTimeout()
        speechRecognizer?.destroy()
        speechRecognizer = null
    }

    // ── Silence timeout ───────────────────────────────────────────────────────

    private fun armSilenceTimeout() {
        disarmSilenceTimeout()
        silenceTimeoutRunnable = Runnable {
            Log.d(TAG, "Silence timeout — user did not speak within ${silenceTimeoutMs}ms")
            speechRecognizer?.stopListening()
            _speechState.update { it.copy(status = SpeechStatus.TIMED_OUT, text = "") }
        }.also { mainHandler.postDelayed(it, silenceTimeoutMs) }
    }

    private fun disarmSilenceTimeout() {
        silenceTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        silenceTimeoutRunnable = null
    }
}
