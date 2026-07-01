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
    private var pendingAccent: String? = null
    private var pendingGender: String? = null
    
    @Volatile
    private var onCompleteCallback: (() -> Unit)? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    
    // Current accent - updates TTS voice when set
    private var currentAccent: String = "british"
    // Current voice gender (male/female)
    private var currentGender: String = "male"

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            setAccentLocale(currentAccent)
            setVoiceGender(currentGender)
            isReady = true
            Log.d("TTS", "TextToSpeech engine initialized successfully with accent: $currentAccent, gender: $currentGender")

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
                // Set pending accent if one was queued
                pendingAccent?.let { accent ->
                    setAccentLocale(accent)
                    currentAccent = accent
                    pendingAccent = null
                }
                // Set pending gender if one was queued
                pendingGender?.let { gender ->
                    setVoiceGender(gender)
                    currentGender = gender
                    pendingGender = null
                }
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
    
    /**
     * Set the TTS voice based on accent/locale
     */
    private fun setAccentLocale(accent: String) {
        val locale = when (accent.lowercase()) {
            "scottish", "scottish english" -> Locale.UK  // Scottish accent uses British English
            "new_zealand", "new zealand" -> Locale("en", "NZ")  // New Zealand English
            "australian", "aussie" -> Locale("en", "AU")  // Australian English
            "irish" -> Locale("en", "IE")  // Irish English
            "american", "american english" -> Locale.US  // American English
            "british", "english", "standard" -> Locale.UK  // British English
            else -> Locale.UK  // Default to British
        }
        
        val result = tts.setLanguage(locale)
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w("TTS", "Accent '$accent' (${locale.displayName}) not fully supported, using available voice")
            // Fallback to US English
            tts.setLanguage(Locale.US)
        } else {
            Log.d("TTS", "TTS locale set to: $accent (${locale.displayName})")
        }
    }
    
    /**
     * Set the TTS voice gender (male/female)
     * Note: Not all TTS engines support voice selection; this attempts to select by pitch
     */
    @Suppress("DEPRECATION")
    private fun setVoiceGender(gender: String) {
        try {
            // Try to get available voices and select based on gender
            // On API 21+, we can access Voice objects
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                val voices = tts.voices
                val selectedVoice = voices?.find { voice ->
                    val n = voice.name.lowercase()
                    when (gender.lowercase()) {
                        "female" -> n.contains("female") || n.contains("woman") || n.contains("queen")
                        // IMPORTANT: "female" contains the substring "male", so we must explicitly
                        // exclude female voices when searching for male ones.
                        "male" -> (n.contains("male") && !n.contains("female")) ||
                                  (n.contains("man") && !n.contains("woman")) ||
                                  n.contains("king")
                        else -> false
                    }
                }
                
                if (selectedVoice != null) {
                    tts.voice = selectedVoice
                    Log.d("TTS", "Voice gender set to: $gender (${selectedVoice.name})")
                    return
                }
            }
        } catch (e: Exception) {
            Log.w("TTS", "Could not set voice gender: ${e.message}")
        }
        
        // Fallback: pitch adjustment for gender (male = lower pitch, female = higher pitch)
        // Note: no named voice was found — adjust pitch so the voice at least sounds gender-appropriate
        val pitch = when (gender.lowercase()) {
            "female" -> 1.2f
            "male" -> 0.75f   // Lower is more distinctly male-sounding
            else -> 1.0f
        }
        tts.setPitch(pitch)
        Log.d("TTS", "Voice gender set via pitch adjustment: $gender (pitch: $pitch)")
    }
    
    /**
     * Set accent before speaking (can be called before or after TTS initialization)
     */
    fun setAccent(accent: String) {
        currentAccent = accent
        if (isReady) {
            setAccentLocale(accent)
            Log.d("TTS", "Accent changed to: $accent")
        } else {
            Log.d("TTS", "Accent queued for when TTS initializes: $accent")
            pendingAccent = accent
        }
    }
    
    /**
     * Set voice gender before speaking (can be called before or after TTS initialization)
     */
    fun setGender(gender: String) {
        currentGender = gender
        if (isReady) {
            setVoiceGender(gender)
            Log.d("TTS", "Voice gender changed to: $gender")
        } else {
            Log.d("TTS", "Voice gender queued for when TTS initializes: $gender")
            pendingGender = gender
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
     * Speak text with optional accent and gender override. If engine isn't ready yet, queues the text for when it initializes.
     */
    fun speak(
        text: String,
        utteranceId: String = "tts_utterance_${System.currentTimeMillis()}",
        accent: String? = null,
        gender: String? = null,
        onComplete: (() -> Unit)? = null
    ) {
        onCompleteCallback = onComplete
        
        // Update accent if provided
        if (accent != null && accent != currentAccent) {
            setAccent(accent)
        }
        
        // Update gender if provided
        if (gender != null && gender != currentGender) {
            setGender(gender)
        }

        if (isReady) {
            speakInternal(text, utteranceId)
        } else {
            Log.d("TTS", "TTS not ready yet, queueing text: ${text.take(50)}...")
            pendingText = text
            pendingUtteranceId = utteranceId
            if (accent != null) {
                pendingAccent = accent
            }
            if (gender != null) {
                pendingGender = gender
            }
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
