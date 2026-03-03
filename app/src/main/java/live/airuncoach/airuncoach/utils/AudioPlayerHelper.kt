package live.airuncoach.airuncoach.utils

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream

/**
 * Helper class to play OpenAI TTS audio from base64 encoded strings.
 * Supports both MP3 (via MediaPlayer) and PCM (via AudioTrack) formats.
 *
 * IMPORTANT: onComplete callbacks are ALWAYS invoked (even on error/cancel)
 * to prevent the CoachingAudioQueue from getting permanently stuck.
 */
class AudioPlayerHelper(private val context: Context) {
    
    private var mediaPlayer: MediaPlayer? = null
    private var currentJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val mainHandler = Handler(Looper.getMainLooper())
    
    // Safety timeout: if audio doesn't complete within 15 seconds, force-complete
    private var safetyTimeout: Runnable? = null
    private val AUDIO_TIMEOUT_MS = 15_000L
    
    // Track whether onComplete has been called to prevent double-invocation
    @Volatile
    private var onCompleteInvoked = false
    
    /**
     * Play audio from base64 encoded string.
     * @param base64Audio Base64 encoded audio data
     * @param format Audio format: "mp3", "opus", "pcm", etc.
     * @param onComplete Callback when playback completes — GUARANTEED to be called
     */
    fun playAudio(base64Audio: String, format: String = "mp3", onComplete: (() -> Unit)? = null) {
        // Cancel any currently playing audio
        stop()
        
        onCompleteInvoked = false
        
        // Safety wrapper that ensures onComplete is called exactly once
        val safeComplete: () -> Unit = {
            if (!onCompleteInvoked) {
                onCompleteInvoked = true
                cancelSafetyTimeout()
                mainHandler.post { onComplete?.invoke() }
            }
        }
        
        // Set up safety timeout
        startSafetyTimeout(safeComplete)
        
        currentJob = scope.launch {
            try {
                when (format.lowercase()) {
                    "mp3", "opus", "aac" -> playEncodedAudio(base64Audio, format, safeComplete)
                    "pcm" -> playPcmAudio(base64Audio, safeComplete)
                    else -> {
                        Log.w("AudioPlayerHelper", "Unsupported format: $format, trying as MP3")
                        playEncodedAudio(base64Audio, "mp3", safeComplete)
                    }
                }
            } catch (e: CancellationException) {
                Log.d("AudioPlayerHelper", "Audio playback cancelled")
                safeComplete()
            } catch (e: Exception) {
                Log.e("AudioPlayerHelper", "Error playing audio", e)
                safeComplete()
            }
        }
    }
    
    /**
     * Play encoded audio (MP3, Opus, AAC) via MediaPlayer
     */
    private suspend fun playEncodedAudio(base64Audio: String, format: String, onComplete: () -> Unit) {
        withContext(Dispatchers.IO) {
            var tempFile: File? = null
            try {
                // Decode base64 to bytes
                val audioBytes = Base64.decode(base64Audio, Base64.DEFAULT)
                
                // Write to temporary file
                tempFile = File.createTempFile("tts_audio", ".$format", context.cacheDir)
                FileOutputStream(tempFile).use { it.write(audioBytes) }
                
                // Play with MediaPlayer on main thread
                withContext(Dispatchers.Main) {
                    try {
                        val player = MediaPlayer().apply {
                            setAudioAttributes(
                                AudioAttributes.Builder()
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                    .setUsage(AudioAttributes.USAGE_MEDIA)
                                    .build()
                            )
                            
                            setDataSource(tempFile.absolutePath)
                            prepare()
                            
                            setOnCompletionListener { mp ->
                                Log.d("AudioPlayerHelper", "MediaPlayer completed normally")
                                mediaPlayer = null
                                try { mp.release() } catch (_: Exception) {}
                                tempFile?.delete()
                                onComplete()
                            }
                            
                            setOnErrorListener { mp, what, extra ->
                                Log.e("AudioPlayerHelper", "MediaPlayer error: what=$what, extra=$extra")
                                mediaPlayer = null
                                try { mp.release() } catch (_: Exception) {}
                                tempFile?.delete()
                                onComplete()
                                true
                            }
                        }
                        
                        mediaPlayer = player
                        player.start()
                        Log.d("AudioPlayerHelper", "Playing $format audio (${audioBytes.size} bytes)")
                    } catch (e: Exception) {
                        Log.e("AudioPlayerHelper", "Error setting up MediaPlayer", e)
                        tempFile?.delete()
                        onComplete()
                    }
                }
            } catch (e: CancellationException) {
                tempFile?.delete()
                throw e  // Re-throw so outer catch handles it
            } catch (e: Exception) {
                Log.e("AudioPlayerHelper", "Error playing encoded audio", e)
                tempFile?.delete()
                withContext(Dispatchers.Main) { onComplete() }
            }
        }
    }
    
    /**
     * Play raw PCM audio via AudioTrack
     */
    private suspend fun playPcmAudio(base64Audio: String, onComplete: () -> Unit) {
        withContext(Dispatchers.IO) {
            var audioTrack: AudioTrack? = null
            try {
                // Decode base64 to bytes
                val audioBytes = Base64.decode(base64Audio, Base64.DEFAULT)
                
                // Configure AudioTrack for PCM playback
                val sampleRate = 24000 // OpenAI TTS default
                val audioFormat = AudioFormat.ENCODING_PCM_16BIT
                val channelConfig = AudioFormat.CHANNEL_OUT_MONO
                
                val bufferSize = AudioTrack.getMinBufferSize(sampleRate, channelConfig, audioFormat)
                
                audioTrack = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setSampleRate(sampleRate)
                            .setEncoding(audioFormat)
                            .setChannelMask(channelConfig)
                            .build()
                    )
                    .setBufferSizeInBytes(bufferSize)
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build()
                
                // Write audio data
                audioTrack.write(audioBytes, 0, audioBytes.size)
                audioTrack.play()
                
                // Wait for playback to complete
                while (audioTrack.playState == AudioTrack.PLAYSTATE_PLAYING) {
                    delay(100)
                }
                
                Log.d("AudioPlayerHelper", "Played PCM audio (${audioBytes.size} bytes)")
                withContext(Dispatchers.Main) { onComplete() }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e("AudioPlayerHelper", "Error playing PCM audio", e)
                withContext(Dispatchers.Main) { onComplete() }
            } finally {
                audioTrack?.release()
            }
        }
    }
    
    private fun startSafetyTimeout(onTimeout: () -> Unit) {
        cancelSafetyTimeout()
        safetyTimeout = Runnable {
            Log.w("AudioPlayerHelper", "Safety timeout reached (${AUDIO_TIMEOUT_MS}ms) — forcing completion")
            stop()
            onTimeout()
        }
        mainHandler.postDelayed(safetyTimeout!!, AUDIO_TIMEOUT_MS)
    }
    
    private fun cancelSafetyTimeout() {
        safetyTimeout?.let { mainHandler.removeCallbacks(it) }
        safetyTimeout = null
    }
    
    /**
     * Stop any currently playing audio.
     * NOTE: Does NOT invoke onComplete — the caller (CoachingAudioQueue) handles this.
     */
    fun stop() {
        cancelSafetyTimeout()
        currentJob?.cancel()
        currentJob = null
        
        val player = mediaPlayer
        mediaPlayer = null
        if (player != null) {
            try {
                if (player.isPlaying) {
                    player.stop()
                }
            } catch (_: IllegalStateException) {
                // MediaPlayer already released or in error state
            }
            try {
                player.release()
            } catch (_: Exception) {}
        }
    }
    
    /**
     * Check if audio is currently playing
     */
    fun isPlaying(): Boolean {
        return try {
            mediaPlayer?.isPlaying == true
        } catch (_: IllegalStateException) {
            false
        }
    }
    
    /**
     * Clean up resources
     */
    fun destroy() {
        stop()
        scope.cancel()
    }
}
