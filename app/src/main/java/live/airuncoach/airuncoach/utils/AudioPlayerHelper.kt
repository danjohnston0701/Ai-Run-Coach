package live.airuncoach.airuncoach.utils

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaPlayer
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream

/**
 * Helper class to play OpenAI TTS audio from base64 encoded strings.
 * Supports both MP3 (via MediaPlayer) and PCM (via AudioTrack) formats.
 */
class AudioPlayerHelper(private val context: Context) {
    
    private var mediaPlayer: MediaPlayer? = null
    private var currentJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    /**
     * Play audio from base64 encoded string.
     * @param base64Audio Base64 encoded audio data
     * @param format Audio format: "mp3", "opus", "pcm", etc.
     * @param onComplete Callback when playback completes
     */
    fun playAudio(base64Audio: String, format: String = "mp3", onComplete: (() -> Unit)? = null) {
        // Cancel any currently playing audio
        stop()
        
        currentJob = scope.launch {
            try {
                when (format.lowercase()) {
                    "mp3", "opus", "aac" -> playEncodedAudio(base64Audio, format, onComplete)
                    "pcm" -> playPcmAudio(base64Audio, onComplete)
                    else -> {
                        Log.w("AudioPlayerHelper", "Unsupported format: $format, trying as MP3")
                        playEncodedAudio(base64Audio, "mp3", onComplete)
                    }
                }
            } catch (e: Exception) {
                Log.e("AudioPlayerHelper", "Error playing audio", e)
                withContext(Dispatchers.Main) {
                    onComplete?.invoke()
                }
            }
        }
    }
    
    /**
     * Play encoded audio (MP3, Opus, AAC) via MediaPlayer
     */
    private suspend fun playEncodedAudio(base64Audio: String, format: String, onComplete: (() -> Unit)?) {
        withContext(Dispatchers.IO) {
            try {
                // Decode base64 to bytes
                val audioBytes = Base64.decode(base64Audio, Base64.DEFAULT)
                
                // Write to temporary file
                val tempFile = File.createTempFile("tts_audio", ".$format", context.cacheDir)
                FileOutputStream(tempFile).use { it.write(audioBytes) }
                
                // Play with MediaPlayer on main thread
                withContext(Dispatchers.Main) {
                    mediaPlayer = MediaPlayer().apply {
                        setAudioAttributes(
                            AudioAttributes.Builder()
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .build()
                        )
                        
                        setDataSource(tempFile.absolutePath)
                        prepare()
                        
                        setOnCompletionListener {
                            mediaPlayer = null  // Null out BEFORE release so stop() sees null and returns early
                            release()
                            tempFile.delete()
                            onComplete?.invoke()
                        }
                        
                        setOnErrorListener { _, what, extra ->
                            Log.e("AudioPlayerHelper", "MediaPlayer error: what=$what, extra=$extra")
                            mediaPlayer = null
                            release()
                            tempFile.delete()
                            onComplete?.invoke()
                            true
                        }
                        
                        start()
                    }
                }
                
                Log.d("AudioPlayerHelper", "Playing $format audio (${audioBytes.size} bytes)")
            } catch (e: Exception) {
                Log.e("AudioPlayerHelper", "Error playing encoded audio", e)
                withContext(Dispatchers.Main) {
                    onComplete?.invoke()
                }
            }
        }
    }
    
    /**
     * Play raw PCM audio via AudioTrack
     */
    private suspend fun playPcmAudio(base64Audio: String, onComplete: (() -> Unit)?) {
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
                
                withContext(Dispatchers.Main) {
                    onComplete?.invoke()
                }
            } catch (e: Exception) {
                Log.e("AudioPlayerHelper", "Error playing PCM audio", e)
                withContext(Dispatchers.Main) {
                    onComplete?.invoke()
                }
            } finally {
                audioTrack?.release()
            }
        }
    }
    
    /**
     * Stop any currently playing audio
     */
    fun stop() {
        currentJob?.cancel()
        val player = mediaPlayer
        if (player == null) {
            return
        }
        try {
            // Check if MediaPlayer is in a valid state before calling methods
            try {
                if (player.isPlaying) {
                    player.stop()
                }
            } catch (e: IllegalStateException) {
                Log.w("AudioPlayerHelper", "MediaPlayer in invalid state during stop", e)
            }
            try {
                player.release()
            } catch (e: Exception) {
                Log.w("AudioPlayerHelper", "Error releasing MediaPlayer", e)
            }
        } catch (e: Exception) {
            Log.w("AudioPlayerHelper", "Error stopping audio", e)
        }
        mediaPlayer = null
    }
    
    /**
     * Check if audio is currently playing
     */
    fun isPlaying(): Boolean {
        return mediaPlayer?.isPlaying == true
    }
    
    /**
     * Clean up resources
     */
    fun destroy() {
        stop()
        scope.cancel()
    }
}
