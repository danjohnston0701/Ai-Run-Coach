package live.airuncoach.airuncoach.viewmodel

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.*
import java.io.ByteArrayOutputStream
import java.io.File
import javax.inject.Inject

data class ShareEditorState(
    val templates: List<ShareTemplate> = emptyList(),
    val stickers: List<StickerWidget> = emptyList(),
    val selectedTemplate: ShareTemplate? = null,
    val selectedAspectRatio: String = "9:16",
    val placedStickers: List<PlacedSticker> = emptyList(),
    val previewImageBase64: String? = null,
    val isLoadingTemplates: Boolean = false,
    val isLoadingPreview: Boolean = false,
    val isGenerating: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null,
    val runId: String = "",
    // Custom background
    val customBackgroundBase64: String? = null,
    val backgroundOpacity: Float = 0.4f,
    val backgroundBlur: Int = 8,
    // Custom stickers (user-uploaded images)
    val customStickers: List<CustomSticker> = emptyList(),
    // Ring layout customization (for stats-grid template)
    val ringLayout: Map<String, String> = mapOf(
        "topLeft" to "distance",
        "topRight" to "pace",
        "bottomLeft" to "duration",
        "bottomRight" to "elevationGain"
    ),
    val showRingPicker: Boolean = false,
    val ringPickerPosition: String? = null,
    // Caption text shown below the stat rings on the share image
    val customCaption: String = ""
)

@HiltViewModel
class ShareImageViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService
) : ViewModel() {

    private val _state = MutableStateFlow(ShareEditorState())
    val state: StateFlow<ShareEditorState> = _state.asStateFlow()

    private var previewJob: Job? = null

    fun initialize(runId: String) {
        _state.update { it.copy(runId = runId) }
        loadTemplates()
    }

    private fun loadTemplates() {
        viewModelScope.launch {
            _state.update { it.copy(isLoadingTemplates = true, error = null) }
            try {
                val response = apiService.getShareTemplates()
                val defaultTemplate = response.templates.firstOrNull()
                val defaultRatio = if (defaultTemplate?.aspectRatios?.contains("9:16") == true) "9:16"
                                   else defaultTemplate?.aspectRatios?.firstOrNull() ?: "9:16"
                _state.update {
                    it.copy(
                        templates = response.templates,
                        stickers = response.stickers,
                        selectedTemplate = defaultTemplate,
                        selectedAspectRatio = defaultRatio,
                        isLoadingTemplates = false
                    )
                }
                // Load initial preview
                requestPreviewDebounced()
            } catch (e: Exception) {
                Log.e("ShareImageVM", "Failed to load templates", e)
                _state.update {
                    it.copy(
                        isLoadingTemplates = false,
                        error = "Failed to load templates. Please check your connection."
                    )
                }
            }
        }
    }

    fun selectTemplate(template: ShareTemplate) {
        val currentRatio = _state.value.selectedAspectRatio
        val validRatio = if (template.aspectRatios.contains(currentRatio)) currentRatio
                         else template.aspectRatios.firstOrNull() ?: "1:1"
        _state.update {
            it.copy(
                selectedTemplate = template,
                selectedAspectRatio = validRatio,
                error = null
            )
        }
        requestPreviewDebounced()
    }

    fun selectAspectRatio(ratio: String) {
        _state.update { it.copy(selectedAspectRatio = ratio, error = null) }
        requestPreviewDebounced()
    }

    fun addSticker(widget: StickerWidget) {
        // Check if already placed
        val alreadyPlaced = _state.value.placedStickers.any { it.widgetId == widget.id }
        if (alreadyPlaced) return

        val newSticker = PlacedSticker(
            widgetId = widget.id,
            x = 0.5f,
            y = 0.5f,
            scale = 1.0f
        )
        _state.update {
            it.copy(placedStickers = it.placedStickers + newSticker)
        }
        requestPreviewDebounced()
    }

    fun updateStickerPosition(widgetId: String, x: Float, y: Float) {
        _state.update { state ->
            state.copy(
                placedStickers = state.placedStickers.map {
                    if (it.widgetId == widgetId) it.copy(x = x.coerceIn(0f, 1f), y = y.coerceIn(0f, 1f))
                    else it
                }
            )
        }
    }

    fun finalizeStickerPosition(widgetId: String) {
        // Called on drag end - trigger preview refresh
        requestPreviewDebounced()
    }

    fun updateStickerScale(widgetId: String, scale: Float) {
        _state.update { state ->
            state.copy(
                placedStickers = state.placedStickers.map {
                    if (it.widgetId == widgetId) it.copy(scale = scale.coerceIn(0.5f, 2.5f))
                    else it
                }
            )
        }
        requestPreviewDebounced()
    }

    fun removeSticker(widgetId: String) {
        _state.update { state ->
            state.copy(placedStickers = state.placedStickers.filter { it.widgetId != widgetId })
        }
        requestPreviewDebounced()
    }

    // ═══════════════════ Custom Background ═══════════════════

    fun setCustomBackground(uri: Uri) {
        viewModelScope.launch {
            try {
                // Get the actual file path from URI for better reliability
                val inputStream = if (uri.scheme == "file") {
                    java.io.FileInputStream(java.io.File(uri.path!!))
                } else {
                    context.contentResolver.openInputStream(uri)
                }

                inputStream?.use { stream ->
                    // First pass: decode bitmap
                    val bitmap = BitmapFactory.decodeStream(stream)
                    if (bitmap == null) {
                        _state.update { it.copy(error = "Failed to load image") }
                        return@launch
                    }

                    // Read EXIF orientation and rotate if needed
                    val rotatedBitmap = try {
                        val exifStream = if (uri.scheme == "file") {
                            java.io.FileInputStream(java.io.File(uri.path!!))
                        } else {
                            context.contentResolver.openInputStream(uri)
                        }
                        val rotated = exifStream?.use { exifInputStream ->
                            val exif = android.media.ExifInterface(exifInputStream)
                            val orientation = exif.getAttributeInt(
                                android.media.ExifInterface.TAG_ORIENTATION,
                                android.media.ExifInterface.ORIENTATION_NORMAL
                            )
                            rotateBitmapByOrientation(bitmap, orientation)
                        }
                        rotated ?: bitmap
                    } catch (e: Exception) {
                        // If EXIF fails, use original bitmap
                        bitmap
                    }

                    // Resize to max 1080px on longest side to keep base64 reasonable
                    val maxDim = 1080
                    val scale = maxDim.toFloat() / maxOf(rotatedBitmap.width, rotatedBitmap.height)
                    val resized = if (scale < 1f) {
                        Bitmap.createScaledBitmap(
                            rotatedBitmap,
                            (rotatedBitmap.width * scale).toInt(),
                            (rotatedBitmap.height * scale).toInt(),
                            true
                        )
                    } else rotatedBitmap

                    val outputStream = ByteArrayOutputStream()
                    resized.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
                    val base64 = "data:image/jpeg;base64," + Base64.encodeToString(
                        outputStream.toByteArray(), Base64.NO_WRAP
                    )

                    _state.update { it.copy(customBackgroundBase64 = base64) }
                    requestPreviewDebounced()
                }
            } catch (e: Exception) {
                Log.e("ShareImageVM", "Failed to process background image", e)
                _state.update { it.copy(error = "Failed to load background image") }
            }
        }
    }

    private fun rotateBitmapByOrientation(bitmap: Bitmap, orientation: Int): Bitmap {
        val matrix = android.graphics.Matrix()
        when (orientation) {
            android.media.ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            android.media.ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            android.media.ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            android.media.ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
            android.media.ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
            else -> return bitmap
        }
        return try {
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        } catch (e: Exception) {
            bitmap
        }
    }

    fun removeCustomBackground() {
        _state.update { it.copy(customBackgroundBase64 = null) }
        requestPreviewDebounced()
    }

    fun setBackgroundOpacity(opacity: Float) {
        _state.update { it.copy(backgroundOpacity = opacity.coerceIn(0.1f, 1.0f)) }
        requestPreviewDebounced()
    }

    fun setBackgroundBlur(blur: Int) {
        _state.update { it.copy(backgroundBlur = blur.coerceIn(0, 100)) }
        requestPreviewDebounced()
    }

    // ═══════════════════ Custom Stickers ═══════════════════

    fun addCustomSticker(uri: Uri) {
        viewModelScope.launch {
            try {
                if (_state.value.customStickers.size >= 10) {
                    _state.update { it.copy(error = "Maximum 10 custom stickers allowed") }
                    return@launch
                }

                val inputStream = context.contentResolver.openInputStream(uri) ?: return@launch
                val bitmap = BitmapFactory.decodeStream(inputStream)
                inputStream.close()

                if (bitmap == null) {
                    _state.update { it.copy(error = "Failed to load sticker image") }
                    return@launch
                }

                // Resize stickers to max 512px
                val maxDim = 512
                val scale = maxDim.toFloat() / maxOf(bitmap.width, bitmap.height)
                val resized = if (scale < 1f) {
                    Bitmap.createScaledBitmap(
                        bitmap,
                        (bitmap.width * scale).toInt(),
                        (bitmap.height * scale).toInt(),
                        true
                    )
                } else bitmap

                val outputStream = ByteArrayOutputStream()
                resized.compress(Bitmap.CompressFormat.PNG, 90, outputStream)
                val base64 = "data:image/png;base64," + Base64.encodeToString(
                    outputStream.toByteArray(), Base64.NO_WRAP
                )

                val newSticker = CustomSticker(
                    imageBase64 = base64,
                    x = 0.5f,
                    y = 0.5f,
                    scale = 0.5f,
                    rotation = 0f,
                    opacity = 1.0f
                )
                _state.update { it.copy(customStickers = it.customStickers + newSticker) }
                requestPreviewDebounced()
            } catch (e: Exception) {
                Log.e("ShareImageVM", "Failed to process custom sticker", e)
                _state.update { it.copy(error = "Failed to load sticker image") }
            }
        }
    }

    fun updateCustomStickerPosition(index: Int, x: Float, y: Float) {
        _state.update { state ->
            val updated = state.customStickers.toMutableList()
            if (index in updated.indices) {
                updated[index] = updated[index].copy(
                    x = x.coerceIn(0f, 1f),
                    y = y.coerceIn(0f, 1f)
                )
            }
            state.copy(customStickers = updated)
        }
    }

    fun finalizeCustomStickerPosition(index: Int) {
        requestPreviewDebounced()
    }

    fun updateCustomStickerScale(index: Int, scale: Float) {
        _state.update { state ->
            val updated = state.customStickers.toMutableList()
            if (index in updated.indices) {
                updated[index] = updated[index].copy(scale = scale.coerceIn(0.1f, 3.0f))
            }
            state.copy(customStickers = updated)
        }
        requestPreviewDebounced()
    }

    fun updateCustomStickerRotation(index: Int, rotation: Float) {
        _state.update { state ->
            val updated = state.customStickers.toMutableList()
            if (index in updated.indices) {
                updated[index] = updated[index].copy(rotation = rotation % 360f)
            }
            state.copy(customStickers = updated)
        }
        requestPreviewDebounced()
    }

    fun updateCustomStickerOpacity(index: Int, opacity: Float) {
        _state.update { state ->
            val updated = state.customStickers.toMutableList()
            if (index in updated.indices) {
                updated[index] = updated[index].copy(opacity = opacity.coerceIn(0.1f, 1.0f))
            }
            state.copy(customStickers = updated)
        }
        requestPreviewDebounced()
    }

    fun removeCustomSticker(index: Int) {
        _state.update { state ->
            val updated = state.customStickers.toMutableList()
            if (index in updated.indices) updated.removeAt(index)
            state.copy(customStickers = updated)
        }
        requestPreviewDebounced()
    }

    private fun requestPreviewDebounced() {
        previewJob?.cancel()
        previewJob = viewModelScope.launch {
            delay(400) // Debounce
            loadPreview()
        }
    }

    private fun buildRequest(): ShareImageRequest? {
        val s = _state.value
        val template = s.selectedTemplate ?: return null
        return ShareImageRequest(
            runId = s.runId,
            templateId = template.id,
            aspectRatio = s.selectedAspectRatio,
            stickers = s.placedStickers,
            customBackground = s.customBackgroundBase64,
            backgroundOpacity = if (s.customBackgroundBase64 != null) s.backgroundOpacity else null,
            backgroundBlur = if (s.customBackgroundBase64 != null) s.backgroundBlur else null,
            customStickers = s.customStickers.ifEmpty { null },
            ringLayout = if (template.id == "stats-grid") s.ringLayout else null,
            customCaption = if (template.id == "stats-grid" && s.customCaption.isNotBlank()) s.customCaption else null
        )
    }

    fun setCustomCaption(caption: String) {
        _state.update { it.copy(customCaption = caption) }
        requestPreviewDebounced()
    }

    private suspend fun loadPreview() {
        val request = buildRequest() ?: return

        _state.update { it.copy(isLoadingPreview = true, error = null) }
        try {
            val response = apiService.getSharePreview(request)
            _state.update {
                it.copy(previewImageBase64 = response.image, isLoadingPreview = false)
            }
        } catch (e: Exception) {
            Log.e("ShareImageVM", "Preview failed", e)
            _state.update {
                it.copy(isLoadingPreview = false, error = "Preview failed. Try again.")
            }
        }
    }

    fun saveToGallery() {
        viewModelScope.launch {
            _state.update { it.copy(isSaving = true, error = null, successMessage = null) }
            try {
                val imageBytes = generateImage()
                if (imageBytes != null) {
                    saveImageToGallery(imageBytes)
                    _state.update {
                        it.copy(isSaving = false, successMessage = "Saved to gallery!")
                    }
                    // Auto-clear success message
                    delay(3000)
                    _state.update { it.copy(successMessage = null) }
                } else {
                    _state.update { it.copy(isSaving = false, error = "Failed to generate image.") }
                }
            } catch (e: Exception) {
                Log.e("ShareImageVM", "Save failed", e)
                _state.update { it.copy(isSaving = false, error = "Failed to save image.") }
            }
        }
    }

    fun shareImage() {
        viewModelScope.launch {
            _state.update { it.copy(isGenerating = true, error = null) }
            try {
                val imageBytes = generateImage()
                if (imageBytes != null) {
                    shareImageViaIntent(imageBytes)
                    _state.update { it.copy(isGenerating = false) }
                } else {
                    _state.update { it.copy(isGenerating = false, error = "Failed to generate image.") }
                }
            } catch (e: Exception) {
                Log.e("ShareImageVM", "Share failed", e)
                _state.update { it.copy(isGenerating = false, error = "Failed to share image.") }
            }
        }
    }

    private suspend fun generateImage(): ByteArray? {
        val request = buildRequest() ?: return null
        val responseBody = apiService.generateShareImage(request)
        return responseBody.bytes()
    }

    private fun saveImageToGallery(imageBytes: ByteArray) {
        val filename = "AIRunCoach_${System.currentTimeMillis()}.png"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/AI Run Coach")
            }
            val uri = context.contentResolver.insert(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues
            )
            uri?.let {
                context.contentResolver.openOutputStream(it)?.use { os ->
                    os.write(imageBytes)
                }
            }
        } else {
            @Suppress("DEPRECATION")
            val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "AI Run Coach")
            if (!dir.exists()) dir.mkdirs()
            val file = File(dir, filename)
            file.writeBytes(imageBytes)
        }
    }

    private fun shareImageViaIntent(imageBytes: ByteArray) {
        val cacheDir = File(context.cacheDir, "share_images")
        if (!cacheDir.exists()) cacheDir.mkdirs()

        val file = File(cacheDir, "AIRunCoach_share.png")
        file.writeBytes(imageBytes)

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )

        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, "Check out my run stats! #AIRunCoach")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(shareIntent, "Share your run").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    fun clearError() {
        _state.update { it.copy(error = null) }
    }

    // ═══════════════════ Ring Layout Customization ═══════════════════

    fun openRingPicker(position: String) {
        _state.update { it.copy(showRingPicker = true, ringPickerPosition = position) }
    }

    fun setRingMetric(position: String, metric: String) {
        _state.update { state ->
            val updated = state.ringLayout.toMutableMap()
            updated[position] = metric
            state.copy(ringLayout = updated, showRingPicker = false, ringPickerPosition = null)
        }
        requestPreviewDebounced()
    }

    fun closeRingPicker() {
        _state.update { it.copy(showRingPicker = false, ringPickerPosition = null) }
    }
}
