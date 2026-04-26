package live.airuncoach.airuncoach.network.model

data class ShareTemplatesResponse(
    val templates: List<ShareTemplate>,
    val stickers: List<StickerWidget>
)

data class ShareTemplate(
    val id: String,
    val name: String,
    val description: String,
    val category: String,
    val aspectRatios: List<String>
)

data class StickerWidget(
    val id: String,
    val type: String,
    val category: String,
    val label: String,
    val icon: String
)

data class ShareImageRequest(
    val runId: String,
    val templateId: String,
    val aspectRatio: String = "9:16",
    val stickers: List<PlacedSticker> = emptyList(),
    val customBackground: String? = null,
    val backgroundOpacity: Float? = null,
    val backgroundBlur: Int? = null,
    val customStickers: List<CustomSticker>? = null,
    val ringLayout: Map<String, String>? = null,
    val customCaption: String? = null
)

data class PlacedSticker(
    val widgetId: String,
    val x: Float,
    val y: Float,
    val scale: Float = 1.0f
)

data class CustomSticker(
    val imageBase64: String,
    val x: Float,
    val y: Float,
    val scale: Float = 1.0f,
    val rotation: Float = 0f,
    val opacity: Float = 1.0f
)

data class SharePreviewResponse(
    val image: String // "data:image/png;base64,..."
)

// Share Link models
data class ShareLinkResponse(
    val shareToken: String,
    val shareUrl: String,
    val deepLink: String
)

data class SharedRunResponse(
    val runId: String,
    val sharerId: String,
    val sharerName: String?,
    val distanceKm: Double?,
    val durationSeconds: Int?,
    val avgPace: String?,
    val completedAt: String?
)
