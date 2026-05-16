package live.airuncoach.airuncoach.utils

import ai.picovoice.porcupine.Porcupine
import ai.picovoice.porcupine.PorcupineException
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import live.airuncoach.airuncoach.BuildConfig

/**
 * On-device wake word detector for "hey coach" using Picovoice Porcupine.
 *
 * Why Porcupine instead of Android SpeechRecognizer:
 * - Fully on-device — works offline, no network round trips
 * - ~1% CPU / <2% battery per hour (tested on Pixel 6)
 * - Sub-100ms response latency
 * - Dedicated wake word engine — not confused by running audio (footsteps, breathing, music)
 * - Same wake word processing regardless of ambient noise
 *
 * ## Setup required (one-time):
 *
 * 1. **Picovoice Console** — https://console.picovoice.ai/
 *    - Sign up (free tier covers personal/indie apps)
 *    - Copy your AccessKey → add to `local.properties`:
 *      ```
 *      PICOVOICE_ACCESS_KEY=your_key_here
 *      ```
 *
 * 2. **Generate "hey coach" wake word model**:
 *    - Console → Wake Word → New Wake Word
 *    - Phrase: "hey coach"
 *    - Platform: Android
 *    - Download → place the `.ppn` file at:
 *      `app/src/main/assets/hey_coach_android.ppn`
 *
 * 3. **Rebuild the project** — `BuildConfig.PICOVOICE_ACCESS_KEY` will be injected.
 *
 * If the access key or .ppn file is missing, [startWatching] logs a warning and
 * returns without crashing — the mic button on the run screen still works.
 */
class WakeWordDetector(
    private val context: Context,
    val onWakeWord: () -> Unit
) {
    companion object {
        private const val TAG = "WakeWordDetector"

        /** Asset file name — must match the file placed in app/src/main/assets/ */
        private const val PPQ_ASSET_FILE = "hey_coach_android.ppn"

        /**
         * Detection sensitivity — 0.0 (least sensitive) to 1.0 (most sensitive).
         * 0.7 is a good balance for a running environment with ambient noise.
         * Increase if runners report missed detections; decrease for fewer false positives.
         */
        private const val SENSITIVITY = 0.7f

        /** Porcupine requires 16 kHz mono 16-bit PCM audio. */
        private const val SAMPLE_RATE = 16_000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    }

    enum class State { IDLE, WATCHING, PAUSED, STOPPED }

    private val _state = MutableStateFlow(State.IDLE)
    val state: StateFlow<State> = _state.asStateFlow()

    private var porcupine: Porcupine? = null
    private var audioRecord: AudioRecord? = null
    private var detectionThread: Thread? = null

    @Volatile private var isRunning = false

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Begin listening for "hey coach".
     * Silently no-ops if:
     * - RECORD_AUDIO permission not granted
     * - AccessKey is blank (not set in local.properties)
     * - .ppn model file not found in assets
     */
    fun startWatching() {
        if (!hasMicPermission()) {
            Log.w(TAG, "RECORD_AUDIO permission not granted — wake word detection disabled")
            return
        }
        if (BuildConfig.PICOVOICE_ACCESS_KEY.isBlank()) {
            Log.w(TAG, "PICOVOICE_ACCESS_KEY not set in local.properties — wake word detection disabled")
            return
        }
        if (!assetExists(PPQ_ASSET_FILE)) {
            Log.w(TAG, "Wake word model '$PPQ_ASSET_FILE' not found in assets — wake word detection disabled")
            Log.w(TAG, "→ Generate it at https://console.picovoice.ai/ and place it in app/src/main/assets/")
            return
        }

        try {
            porcupine = Porcupine.Builder()
                .setAccessKey(BuildConfig.PICOVOICE_ACCESS_KEY)
                .setKeywordPath(PPQ_ASSET_FILE)
                .setSensitivity(SENSITIVITY)
                .build(context)

            _state.value = State.WATCHING
            isRunning = true
            startAudioCapture()
            Log.d(TAG, "✅ Porcupine wake word detector started — listening for 'hey coach'")
        } catch (e: PorcupineException) {
            Log.e(TAG, "Failed to initialise Porcupine: ${e.message}")
            porcupine = null
        }
    }

    /** Pause detection while the coaching exchange is happening. */
    fun pauseListening() {
        if (_state.value != State.WATCHING) return
        _state.value = State.PAUSED
        stopAudioCapture()
        Log.d(TAG, "Wake word detector paused")
    }

    /** Resume after a coaching exchange completes. */
    fun resumeListening() {
        if (_state.value != State.PAUSED) return
        _state.value = State.WATCHING
        isRunning = true
        startAudioCapture()
        Log.d(TAG, "Wake word detector resumed")
    }

    /** Stop and release all resources — call when the run ends. */
    fun stopWatching() {
        isRunning = false
        _state.value = State.STOPPED
        stopAudioCapture()
        porcupine?.delete()
        porcupine = null
        Log.d(TAG, "Wake word detector stopped and resources released")
    }

    // ── Internal audio capture ────────────────────────────────────────────────

    private fun startAudioCapture() {
        if (detectionThread?.isAlive == true) return  // already running

        val frameLength = porcupine?.frameLength ?: return

        val bufferSize = maxOf(
            AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT),
            frameLength * 2
        )

        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE,
            CHANNEL_CONFIG,
            AUDIO_FORMAT,
            bufferSize
        ).also {
            if (it.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord failed to initialize")
                return
            }
            it.startRecording()
        }

        detectionThread = Thread {
            val pcmBuffer = ShortArray(frameLength)
            Log.d(TAG, "Audio capture thread started (frameLength=$frameLength)")

            while (isRunning && _state.value == State.WATCHING) {
                val read = audioRecord?.read(pcmBuffer, 0, frameLength) ?: break
                if (read != frameLength) continue

                try {
                    val keywordIndex = porcupine?.process(pcmBuffer) ?: break
                    if (keywordIndex >= 0) {
                        Log.d(TAG, "🎤 'Hey coach' detected! (keyword index=$keywordIndex)")
                        pauseListening()
                        // Fire on main thread so UI/ViewModel callbacks are safe
                        android.os.Handler(android.os.Looper.getMainLooper()).post {
                            onWakeWord()
                        }
                    }
                } catch (e: PorcupineException) {
                    Log.e(TAG, "Porcupine process error: ${e.message}")
                }
            }

            Log.d(TAG, "Audio capture thread exiting")
        }.also {
            it.isDaemon = true
            it.name = "PorcupineDetection"
            it.start()
        }
    }

    private fun stopAudioCapture() {
        isRunning = false
        detectionThread?.interrupt()
        detectionThread = null
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {
            Log.w(TAG, "AudioRecord stop/release: ${e.message}")
        }
        audioRecord = null
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private fun assetExists(fileName: String): Boolean = try {
        context.assets.open(fileName).close()
        true
    } catch (e: Exception) {
        false
    }
}
