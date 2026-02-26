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
    val aspectRatio: String = "1:1",
    val stickers: List<PlacedSticker> = emptyList()
)

data class PlacedSticker(
    val widgetId: String,
    val x: Float,
    val y: Float,
    val scale: Float = 1.0f
)

data class SharePreviewResponse(
    val image: String // "data:image/png;base64,..."
)
