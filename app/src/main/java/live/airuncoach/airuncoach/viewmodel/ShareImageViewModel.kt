package live.airuncoach.airuncoach.viewmodel

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
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
import java.io.File
import javax.inject.Inject

data class ShareEditorState(
    val templates: List<ShareTemplate> = emptyList(),
    val stickers: List<StickerWidget> = emptyList(),
    val selectedTemplate: ShareTemplate? = null,
    val selectedAspectRatio: String = "1:1",
    val placedStickers: List<PlacedSticker> = emptyList(),
    val previewImageBase64: String? = null,
    val isLoadingTemplates: Boolean = false,
    val isLoadingPreview: Boolean = false,
    val isGenerating: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null,
    val runId: String = ""
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
                _state.update {
                    it.copy(
                        templates = response.templates,
                        stickers = response.stickers,
                        selectedTemplate = defaultTemplate,
                        selectedAspectRatio = defaultTemplate?.aspectRatios?.firstOrNull() ?: "1:1",
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

    private fun requestPreviewDebounced() {
        previewJob?.cancel()
        previewJob = viewModelScope.launch {
            delay(400) // Debounce
            loadPreview()
        }
    }

    private suspend fun loadPreview() {
        val s = _state.value
        val template = s.selectedTemplate ?: return

        _state.update { it.copy(isLoadingPreview = true, error = null) }
        try {
            val request = ShareImageRequest(
                runId = s.runId,
                templateId = template.id,
                aspectRatio = s.selectedAspectRatio,
                stickers = s.placedStickers
            )
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
        val s = _state.value
        val template = s.selectedTemplate ?: return null

        val request = ShareImageRequest(
            runId = s.runId,
            templateId = template.id,
            aspectRatio = s.selectedAspectRatio,
            stickers = s.placedStickers
        )
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
}
