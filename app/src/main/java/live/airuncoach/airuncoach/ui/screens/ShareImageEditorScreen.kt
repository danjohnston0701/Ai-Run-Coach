package live.airuncoach.airuncoach.ui.screens

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.animation.*
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import live.airuncoach.airuncoach.network.model.PlacedSticker
import live.airuncoach.airuncoach.network.model.ShareTemplate
import live.airuncoach.airuncoach.network.model.StickerWidget
import live.airuncoach.airuncoach.ui.theme.AppTextStyles
import live.airuncoach.airuncoach.ui.theme.Colors
import live.airuncoach.airuncoach.ui.theme.Spacing
import live.airuncoach.airuncoach.viewmodel.ShareImageViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareImageEditorScreen(
    runId: String,
    onNavigateBack: () -> Unit,
    viewModel: ShareImageViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(runId) {
        viewModel.initialize(runId)
    }

    var isStickerPanelExpanded by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = Colors.backgroundRoot,
        topBar = {
            ShareEditorTopBar(onBack = onNavigateBack)
        },
        bottomBar = {
            ShareEditorBottomBar(
                isSaving = state.isSaving,
                isGenerating = state.isGenerating,
                onDownload = { viewModel.saveToGallery() },
                onShare = { viewModel.shareImage() }
            )
        }
    ) { padding ->
        if (state.isLoadingTemplates) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Colors.primary)
                    Spacer(modifier = Modifier.height(Spacing.lg))
                    Text("Loading templates...", color = Colors.textSecondary, style = AppTextStyles.body)
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                // Template selector
                TemplateSelector(
                    templates = state.templates,
                    selectedTemplate = state.selectedTemplate,
                    onSelect = { viewModel.selectTemplate(it) }
                )

                // Aspect ratio picker
                state.selectedTemplate?.let { template ->
                    AspectRatioPicker(
                        availableRatios = template.aspectRatios,
                        selectedRatio = state.selectedAspectRatio,
                        onSelect = { viewModel.selectAspectRatio(it) }
                    )
                }

                // Live preview area
                Box(modifier = Modifier.weight(1f)) {
                    PreviewArea(
                        previewBase64 = state.previewImageBase64,
                        isLoading = state.isLoadingPreview,
                        placedStickers = state.placedStickers,
                        stickers = state.stickers,
                        aspectRatio = state.selectedAspectRatio,
                        onStickerDrag = { id, x, y -> viewModel.updateStickerPosition(id, x, y) },
                        onStickerDragEnd = { id -> viewModel.finalizeStickerPosition(id) },
                        onStickerScale = { id, scale -> viewModel.updateStickerScale(id, scale) },
                        onStickerRemove = { id -> viewModel.removeSticker(id) }
                    )
                }

                // Sticker panel toggle
                StickerPanelToggle(
                    isExpanded = isStickerPanelExpanded,
                    onToggle = { isStickerPanelExpanded = !isStickerPanelExpanded },
                    placedCount = state.placedStickers.size
                )

                // Collapsible sticker panel
                AnimatedVisibility(
                    visible = isStickerPanelExpanded,
                    enter = expandVertically() + fadeIn(),
                    exit = shrinkVertically() + fadeOut()
                ) {
                    StickerPanel(
                        stickers = state.stickers,
                        placedStickerIds = state.placedStickers.map { it.widgetId }.toSet(),
                        onAddSticker = { viewModel.addSticker(it) },
                        onRemoveSticker = { viewModel.removeSticker(it) }
                    )
                }
            }
        }

        // Error snackbar
        state.error?.let { error ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.BottomCenter
            ) {
                Snackbar(
                    modifier = Modifier.padding(Spacing.lg),
                    containerColor = Colors.error.copy(alpha = 0.9f),
                    contentColor = Colors.textPrimary,
                    action = {
                        TextButton(onClick = { viewModel.clearError() }) {
                            Text("OK", color = Colors.textPrimary)
                        }
                    }
                ) {
                    Text(error)
                }
            }
        }

        // Success message
        state.successMessage?.let { msg ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.BottomCenter
            ) {
                Snackbar(
                    modifier = Modifier.padding(Spacing.lg),
                    containerColor = Colors.success.copy(alpha = 0.9f),
                    contentColor = Colors.textPrimary
                ) {
                    Text(msg)
                }
            }
        }
    }
}

/* ================================ TOP BAR ================================ */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShareEditorTopBar(onBack: () -> Unit) {
    TopAppBar(
        title = {
            Column {
                Text(
                    "Create Share Image",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold),
                    color = Colors.textPrimary
                )
                Text(
                    "Customize and share your run",
                    style = AppTextStyles.small,
                    color = Colors.textSecondary
                )
            }
        },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Colors.textPrimary)
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Colors.backgroundRoot,
            titleContentColor = Colors.textPrimary
        )
    )
}

/* ================================ TEMPLATE SELECTOR ================================ */

@Composable
private fun TemplateSelector(
    templates: List<ShareTemplate>,
    selectedTemplate: ShareTemplate?,
    onSelect: (ShareTemplate) -> Unit
) {
    Column(modifier = Modifier.padding(vertical = Spacing.sm)) {
        Text(
            text = "TEMPLATE",
            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.sp),
            color = Colors.textMuted,
            modifier = Modifier.padding(start = Spacing.lg, end = Spacing.lg, bottom = Spacing.xs)
        )

        LazyRow(
            contentPadding = PaddingValues(horizontal = Spacing.lg),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            items(templates) { template ->
                TemplateCard(
                    template = template,
                    isSelected = template.id == selectedTemplate?.id,
                    onClick = { onSelect(template) }
                )
            }
        }
    }
}

@Composable
private fun TemplateCard(
    template: ShareTemplate,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val borderColor = if (isSelected) Colors.primary else Colors.border
    val bgColor = if (isSelected) Colors.primary.copy(alpha = 0.12f) else Colors.backgroundSecondary

    val icon = when (template.category) {
        "stats" -> Icons.Default.GridView
        "map" -> Icons.Default.Map
        "splits" -> Icons.Default.BarChart
        "achievement" -> Icons.Default.EmojiEvents
        "minimal" -> Icons.Default.Contrast
        else -> Icons.Default.Image
    }

    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = bgColor),
        border = BorderStroke(if (isSelected) 2.dp else 1.dp, borderColor),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.width(110.dp)
    ) {
        Column(
            modifier = Modifier.padding(Spacing.md),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isSelected) Colors.primary else Colors.textSecondary,
                modifier = Modifier.size(28.dp)
            )
            Spacer(modifier = Modifier.height(Spacing.xs))
            Text(
                text = template.name,
                style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
                color = if (isSelected) Colors.primary else Colors.textPrimary,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = template.category.replaceFirstChar { it.uppercase() },
                style = AppTextStyles.caption,
                color = Colors.textMuted,
                textAlign = TextAlign.Center
            )
        }
    }
}

/* ================================ ASPECT RATIO PICKER ================================ */

@Composable
private fun AspectRatioPicker(
    availableRatios: List<String>,
    selectedRatio: String,
    onSelect: (String) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm, Alignment.CenterHorizontally)
    ) {
        availableRatios.forEach { ratio ->
            val label = when (ratio) {
                "1:1" -> "Square"
                "9:16" -> "Story"
                "4:5" -> "Portrait"
                else -> ratio
            }
            val isSelected = ratio == selectedRatio
            val bgColor = if (isSelected) Colors.primary else Colors.backgroundTertiary
            val textColor = if (isSelected) Colors.buttonText else Colors.textSecondary

            Surface(
                onClick = { onSelect(ratio) },
                shape = RoundedCornerShape(10.dp),
                color = bgColor,
                modifier = Modifier.height(36.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    // Mini aspect ratio icon
                    val (w, h) = when (ratio) {
                        "1:1" -> 12.dp to 12.dp
                        "9:16" -> 9.dp to 14.dp
                        "4:5" -> 10.dp to 13.dp
                        else -> 12.dp to 12.dp
                    }
                    Box(
                        modifier = Modifier
                            .size(w, h)
                            .border(1.5.dp, textColor, RoundedCornerShape(2.dp))
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = label,
                        style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
                        color = textColor
                    )
                }
            }
        }
    }
}

/* ================================ PREVIEW AREA ================================ */

@Composable
private fun PreviewArea(
    previewBase64: String?,
    isLoading: Boolean,
    placedStickers: List<PlacedSticker>,
    stickers: List<StickerWidget>,
    aspectRatio: String,
    onStickerDrag: (String, Float, Float) -> Unit,
    onStickerDragEnd: (String) -> Unit,
    onStickerScale: (String, Float) -> Unit,
    onStickerRemove: (String) -> Unit
) {
    val targetAspect = when (aspectRatio) {
        "1:1" -> 1f
        "9:16" -> 9f / 16f
        "4:5" -> 4f / 5f
        else -> 1f
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        contentAlignment = Alignment.Center
    ) {
        Card(
            colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, Colors.border)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(targetAspect),
                contentAlignment = Alignment.Center
            ) {
                // Decoded preview image
                if (previewBase64 != null) {
                    val bitmap = remember(previewBase64) {
                        try {
                            val raw = previewBase64
                                .removePrefix("data:image/png;base64,")
                                .removePrefix("data:image/jpeg;base64,")
                            val bytes = Base64.decode(raw, Base64.DEFAULT)
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                        } catch (e: Exception) {
                            null
                        }
                    }

                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap,
                            contentDescription = "Preview",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Fit
                        )
                    }
                }

                // Loading overlay
                if (isLoading) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Colors.backgroundRoot.copy(alpha = 0.6f)),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            color = Colors.primary,
                            modifier = Modifier.size(32.dp),
                            strokeWidth = 3.dp
                        )
                    }
                }

                // Empty state
                if (previewBase64 == null && !isLoading) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(Spacing.xxl)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Image,
                            contentDescription = null,
                            tint = Colors.textMuted,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(Spacing.md))
                        Text(
                            "Select a template to preview",
                            style = AppTextStyles.body,
                            color = Colors.textMuted,
                            textAlign = TextAlign.Center
                        )
                    }
                }

                // Sticker overlay indicators (show where stickers are placed)
                var containerSize by remember { mutableStateOf(IntSize.Zero) }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .onSizeChanged { containerSize = it }
                ) {
                    placedStickers.forEach { placed ->
                        val widget = stickers.find { it.id == placed.widgetId }
                        if (widget != null && containerSize.width > 0) {
                            StickerOverlayChip(
                                placed = placed,
                                widget = widget,
                                containerSize = containerSize,
                                onDrag = { dx, dy ->
                                    val newX = placed.x + dx / containerSize.width
                                    val newY = placed.y + dy / containerSize.height
                                    onStickerDrag(placed.widgetId, newX, newY)
                                },
                                onDragEnd = { onStickerDragEnd(placed.widgetId) },
                                onRemove = { onStickerRemove(placed.widgetId) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StickerOverlayChip(
    placed: PlacedSticker,
    widget: StickerWidget,
    containerSize: IntSize,
    onDrag: (Float, Float) -> Unit,
    onDragEnd: () -> Unit,
    onRemove: () -> Unit
) {
    val density = LocalDensity.current
    val xPx = placed.x * containerSize.width
    val yPx = placed.y * containerSize.height
    val xDp = with(density) { xPx.toDp() }
    val yDp = with(density) { yPx.toDp() }

    // Offset to center the chip on the position
    val chipSize = 48.dp

    Box(
        modifier = Modifier
            .offset(
                x = xDp - chipSize / 2,
                y = yDp - chipSize / 2
            )
            .size(chipSize * placed.scale)
            .pointerInput(placed.widgetId) {
                detectDragGestures(
                    onDragEnd = { onDragEnd() }
                ) { change, dragAmount ->
                    change.consume()
                    onDrag(dragAmount.x, dragAmount.y)
                }
            }
    ) {
        // Sticker indicator
        Surface(
            shape = CircleShape,
            color = Colors.primary.copy(alpha = 0.85f),
            border = BorderStroke(1.5.dp, Colors.textPrimary.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(contentAlignment = Alignment.Center) {
                val icon = stickerIcon(widget.icon)
                Icon(
                    imageVector = icon,
                    contentDescription = widget.label,
                    tint = Colors.buttonText,
                    modifier = Modifier.size(18.dp * placed.scale)
                )
            }
        }

        // Remove button
        Surface(
            onClick = onRemove,
            shape = CircleShape,
            color = Colors.error,
            modifier = Modifier
                .size(18.dp)
                .align(Alignment.TopEnd)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Remove",
                    tint = Colors.textPrimary,
                    modifier = Modifier.size(12.dp)
                )
            }
        }
    }
}

/* ================================ STICKER PANEL ================================ */

@Composable
private fun StickerPanelToggle(
    isExpanded: Boolean,
    onToggle: () -> Unit,
    placedCount: Int
) {
    Surface(
        onClick = onToggle,
        color = Colors.backgroundSecondary,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        border = BorderStroke(1.dp, Colors.border),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.md),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Widgets,
                contentDescription = null,
                tint = Colors.primary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(Spacing.sm))
            Text(
                text = "Stickers",
                style = AppTextStyles.body.copy(fontWeight = FontWeight.SemiBold),
                color = Colors.textPrimary,
                modifier = Modifier.weight(1f)
            )
            if (placedCount > 0) {
                Surface(
                    shape = CircleShape,
                    color = Colors.primary,
                    modifier = Modifier.size(22.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            "$placedCount",
                            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                            color = Colors.buttonText
                        )
                    }
                }
                Spacer(modifier = Modifier.width(Spacing.sm))
            }
            Icon(
                imageVector = if (isExpanded) Icons.Default.ExpandMore else Icons.Default.ExpandLess,
                contentDescription = if (isExpanded) "Collapse" else "Expand",
                tint = Colors.textSecondary
            )
        }
    }
}

@Composable
private fun StickerPanel(
    stickers: List<StickerWidget>,
    placedStickerIds: Set<String>,
    onAddSticker: (StickerWidget) -> Unit,
    onRemoveSticker: (String) -> Unit
) {
    val categories = stickers.groupBy { it.category }
    val categoryOrder = listOf("metrics", "charts", "badges", "text")
    var selectedCategory by remember { mutableStateOf("metrics") }

    Surface(
        color = Colors.backgroundSecondary,
        border = BorderStroke(1.dp, Colors.border)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 220.dp)
        ) {
            // Category tabs
            ScrollableTabRow(
                selectedTabIndex = categoryOrder.indexOf(selectedCategory).coerceAtLeast(0),
                containerColor = Colors.backgroundTertiary,
                contentColor = Colors.textPrimary,
                edgePadding = Spacing.sm,
                divider = {}
            ) {
                categoryOrder.forEach { cat ->
                    val label = when (cat) {
                        "metrics" -> "Metrics"
                        "charts" -> "Charts"
                        "badges" -> "Badges"
                        "text" -> "Text"
                        else -> cat.replaceFirstChar { it.uppercase() }
                    }
                    Tab(
                        selected = selectedCategory == cat,
                        onClick = { selectedCategory = cat },
                        text = {
                            Text(
                                label,
                                fontWeight = if (selectedCategory == cat) FontWeight.Bold else FontWeight.Normal,
                                color = if (selectedCategory == cat) Colors.primary else Colors.textSecondary,
                                fontSize = 13.sp
                            )
                        }
                    )
                }
            }

            // Stickers grid for selected category
            val categoryStickers = categories[selectedCategory] ?: emptyList()

            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                contentPadding = PaddingValues(Spacing.sm),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(categoryStickers) { widget ->
                    val isPlaced = widget.id in placedStickerIds
                    StickerGridItem(
                        widget = widget,
                        isPlaced = isPlaced,
                        onToggle = {
                            if (isPlaced) onRemoveSticker(widget.id)
                            else onAddSticker(widget)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun StickerGridItem(
    widget: StickerWidget,
    isPlaced: Boolean,
    onToggle: () -> Unit
) {
    val bgColor = if (isPlaced) Colors.primary.copy(alpha = 0.15f) else Colors.backgroundTertiary
    val borderColor = if (isPlaced) Colors.primary else Colors.border

    Card(
        onClick = onToggle,
        colors = CardDefaults.cardColors(containerColor = bgColor),
        border = BorderStroke(1.dp, borderColor),
        shape = RoundedCornerShape(10.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.sm),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box {
                Icon(
                    imageVector = stickerIcon(widget.icon),
                    contentDescription = null,
                    tint = if (isPlaced) Colors.primary else Colors.textSecondary,
                    modifier = Modifier.size(22.dp)
                )
                if (isPlaced) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = Colors.primary,
                        modifier = Modifier
                            .size(10.dp)
                            .align(Alignment.TopEnd)
                    )
                }
            }
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = widget.label,
                style = AppTextStyles.caption.copy(fontSize = 10.sp),
                color = if (isPlaced) Colors.primary else Colors.textSecondary,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/* ================================ BOTTOM BAR ================================ */

@Composable
private fun ShareEditorBottomBar(
    isSaving: Boolean,
    isGenerating: Boolean,
    onDownload: () -> Unit,
    onShare: () -> Unit
) {
    Surface(
        color = Colors.backgroundSecondary,
        tonalElevation = 8.dp,
        border = BorderStroke(1.dp, Colors.border)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.md)
                .navigationBarsPadding(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.md)
        ) {
            // Download button
            OutlinedButton(
                onClick = onDownload,
                enabled = !isSaving && !isGenerating,
                modifier = Modifier
                    .weight(1f)
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.5.dp, if (isSaving) Colors.textMuted else Colors.primary),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Colors.primary,
                    disabledContentColor = Colors.textMuted
                )
            ) {
                if (isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = Colors.textMuted,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Saving...", fontWeight = FontWeight.SemiBold)
                } else {
                    Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Download", fontWeight = FontWeight.SemiBold)
                }
            }

            // Share button
            Button(
                onClick = onShare,
                enabled = !isSaving && !isGenerating,
                modifier = Modifier
                    .weight(1f)
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Colors.primary,
                    contentColor = Colors.buttonText,
                    disabledContainerColor = Colors.backgroundTertiary,
                    disabledContentColor = Colors.textMuted
                )
            ) {
                if (isGenerating) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = Colors.buttonText,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Generating...", fontWeight = FontWeight.Bold)
                } else {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(Spacing.sm))
                    Text("Share", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

/* ================================ HELPERS ================================ */

private fun stickerIcon(iconName: String): ImageVector {
    return when (iconName) {
        "map-pin" -> Icons.Default.Place
        "clock" -> Icons.Default.Schedule
        "zap" -> Icons.Default.FlashOn
        "heart" -> Icons.Default.Favorite
        "activity" -> Icons.Default.LocalFireDepartment
        "trending-up" -> Icons.Default.TrendingUp
        "repeat" -> Icons.Default.Repeat
        "bar-chart" -> Icons.Default.BarChart
        "shield" -> Icons.Default.Shield
        "cloud" -> Icons.Default.Cloud
        "type" -> Icons.Default.TextFields
        else -> Icons.Default.Star
    }
}
