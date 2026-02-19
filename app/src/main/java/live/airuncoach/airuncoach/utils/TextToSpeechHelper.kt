package live.airuncoach.airuncoach.utils

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale

class TextToSpeechHelper(context: Context) : TextToSpeech.OnInitListener {

    private val tts: TextToSpeech = TextToSpeech(context, this)
    private var isReady = false
    private var pendingText: String? = null
    private var pendingUtteranceId: String? = null
    private var onCompleteCallback: (() -> Unit)? = null

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val result = tts.setLanguage(Locale.US)
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                Log.e("TTS", "The Language specified is not supported!")
            }
            isReady = true
            Log.d("TTS", "TextToSpeech engine initialized successfully")

            // If there was text queued before init, speak it now
            pendingText?.let { text ->
                Log.d("TTS", "Speaking queued text after init: ${text.take(50)}...")
                speakInternal(text, pendingUtteranceId ?: "tts_pending")
                pendingText = null
                pendingUtteranceId = null
            }
        } else {
            Log.e("TTS", "Initialization Failed!")
        }
    }

    /**
     * Speak text. If engine isn't ready yet, queues the text for when it initializes.
     */
    fun speak(text: String, utteranceId: String = "tts_utterance", onComplete: (() -> Unit)? = null) {
        onCompleteCallback = onComplete

        if (isReady) {
            speakInternal(text, utteranceId)
        } else {
            Log.d("TTS", "TTS not ready yet, queueing text: ${text.take(50)}...")
            pendingText = text
            pendingUtteranceId = utteranceId
        }
    }

    private fun speakInternal(text: String, utteranceId: String) {
        // Set up completion listener
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {
                Log.d("TTS", "Started speaking: $id")
            }

            override fun onDone(id: String?) {
                Log.d("TTS", "Finished speaking: $id")
                onCompleteCallback?.invoke()
                onCompleteCallback = null
            }

            @Deprecated("Deprecated in Java")
            override fun onError(id: String?) {
                Log.e("TTS", "TTS error for: $id")
                onCompleteCallback?.invoke()
                onCompleteCallback = null
            }
        })

        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    }

    fun stop() {
        try {
            tts.stop()
        } catch (e: Exception) {
            Log.w("TTS", "Error stopping TTS", e)
        }
        onCompleteCallback = null
    }

    fun destroy() {
        try {
            tts.stop()
            tts.shutdown()
        } catch (e: Exception) {
            Log.w("TTS", "Error destroying TTS", e)
        }
        onCompleteCallback = null
    }
}
