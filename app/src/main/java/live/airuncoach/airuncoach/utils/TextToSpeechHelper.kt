package live.airuncoach.airuncoach.utils

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale

class TextToSpeechHelper(context: Context) : TextToSpeech.OnInitListener {

    private val tts: TextToSpeech = TextToSpeech(context, this)
    private var isReady = false
    private var pendingText: String? = null
    private var pendingUtteranceId: String? = null
    
    @Volatile
    private var onCompleteCallback: (() -> Unit)? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val result = tts.setLanguage(Locale.US)
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                Log.e("TTS", "The Language specified is not supported!")
            }
            isReady = true
            Log.d("TTS", "TextToSpeech engine initialized successfully")

            // Set up the listener once during init (not every speak call)
            tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String?) {
                    Log.d("TTS", "Started speaking: $id")
                }

                override fun onDone(id: String?) {
                    Log.d("TTS", "Finished speaking: $id")
                    invokeComplete()
                }

                @Deprecated("Deprecated in Java")
                override fun onError(id: String?) {
                    Log.e("TTS", "TTS error for: $id")
                    invokeComplete()
                }
                
                override fun onError(utteranceId: String?, errorCode: Int) {
                    Log.e("TTS", "TTS error for: $utteranceId, code=$errorCode")
                    invokeComplete()
                }
            })

            // If there was text queued before init, speak it now
            pendingText?.let { text ->
                Log.d("TTS", "Speaking queued text after init: ${text.take(50)}...")
                speakInternal(text, pendingUtteranceId ?: "tts_pending")
                pendingText = null
                pendingUtteranceId = null
            }
        } else {
            Log.e("TTS", "Initialization Failed!")
            // TTS init failed — invoke any pending callback so the queue doesn't get stuck
            invokeComplete()
        }
    }
    
    private fun invokeComplete() {
        val callback = onCompleteCallback
        onCompleteCallback = null
        if (callback != null) {
            mainHandler.post { callback.invoke() }
        }
    }

    /**
     * Speak text. If engine isn't ready yet, queues the text for when it initializes.
     */
    fun speak(text: String, utteranceId: String = "tts_utterance_${System.currentTimeMillis()}", onComplete: (() -> Unit)? = null) {
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
        val result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
        if (result != TextToSpeech.SUCCESS) {
            Log.e("TTS", "TTS speak() returned error: $result")
            // speak() failed — invoke callback so queue doesn't get stuck
            invokeComplete()
        }
    }

    fun stop() {
        try {
            tts.stop()
        } catch (e: Exception) {
            Log.w("TTS", "Error stopping TTS", e)
        }
        // Don't null out the callback — let the caller handle completion
        // The queue's watchdog will clean up if needed
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
