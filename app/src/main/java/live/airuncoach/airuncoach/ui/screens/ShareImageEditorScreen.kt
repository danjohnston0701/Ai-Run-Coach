package live.airuncoach.airuncoach.ui.screens

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import live.airuncoach.airuncoach.ui.components.GarminAttributionBadge
import live.airuncoach.airuncoach.ui.components.GarminBadgeStyle
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

    val context = LocalContext.current

    var isStickerPanelExpanded by remember { mutableStateOf(false) }
    var isBackgroundPanelExpanded by remember { mutableStateOf(false) }
    var isRingsPanelExpanded by remember { mutableStateOf(false) }

    // Collapsible control strip state
    var isControlStripExpanded by remember { mutableStateOf(true) }

    val cameraPhotoUri = remember {
        val photoFile = File(context.cacheDir, "share_bg_photo.jpg")
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", photoFile)
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success) {
            viewModel.setCustomBackground(cameraPhotoUri)
        }
    }

    val backgroundPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        uri?.let { viewModel.setCustomBackground(it) }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF050A12))
    ) {
        if (state.isLoadingTemplates) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Colors.primary)
                    Spacer(modifier = Modifier.height(Spacing.lg))
                    Text("Loading templates...", color = Colors.textSecondary, style = AppTextStyles.body)
                }
            }
        } else {
            // ─── Full-bleed preview fills the screen ───
            Column(modifier = Modifier.fillMaxSize()) {
                // Preview area takes all remaining space
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    PreviewAreaFullBleed(
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

                // ─── Collapsible control strip ───
                AnimatedVisibility(
                    visible = isControlStripExpanded,
                    enter = expandVertically(expandFrom = Alignment.Bottom) + fadeIn(),
                    exit = shrinkVertically(shrinkTowards = Alignment.Bottom) + fadeOut()
                ) {
                    ControlStrip(
                        templates = state.templates,
                        selectedTemplate = state.selectedTemplate,
                        selectedAspectRatio = state.selectedAspectRatio,
                        onSelectTemplate = { viewModel.selectTemplate(it) },
                        onSelectAspectRatio = { viewModel.selectAspectRatio(it) },
                        isStickerPanelExpanded = isStickerPanelExpanded,
                        onToggleStickers = { isStickerPanelExpanded = !isStickerPanelExpanded },
                        placedStickerCount = state.placedStickers.size,
                        stickers = state.stickers,
                        placedStickerIds = state.placedStickers.map { it.widgetId }.toSet(),
                        onAddSticker = { viewModel.addSticker(it) },
                        onRemoveSticker = { viewModel.removeSticker(it) },
                        // Background
                        isBackgroundPanelExpanded = isBackgroundPanelExpanded,
                        onToggleBackground = { isBackgroundPanelExpanded = !isBackgroundPanelExpanded },
                        hasCustomBackground = state.customBackgroundBase64 != null,
                        backgroundOpacity = state.backgroundOpacity,
                        backgroundBlur = state.backgroundBlur,
                        onPickBackground = { backgroundPickerLauncher.launch("image/*") },
                        onTakePhoto = { cameraLauncher.launch(cameraPhotoUri) },
                        onRemoveBackground = { viewModel.removeCustomBackground() },
                        onBackgroundOpacityChange = { viewModel.setBackgroundOpacity(it) },
                        onBackgroundBlurChange = { viewModel.setBackgroundBlur(it) },
                        // Ring customizer
                        isStatsGridTemplate = state.selectedTemplate?.id == "stats-grid",
                        isRingsPanelExpanded = isRingsPanelExpanded,
                        onToggleRings = { isRingsPanelExpanded = !isRingsPanelExpanded },
                        ringLayout = state.ringLayout,
                        onRingPositionClick = { position -> viewModel.openRingPicker(position) },
                        // Actions
                        isSaving = state.isSaving,
                        isGenerating = state.isGenerating,
                        onDownload = { viewModel.saveToGallery() },
                        onShare = { viewModel.shareImage() },
                        // Collapse
                        onCollapse = { isControlStripExpanded = false }
                    )
                }
                
                // ─── Collapsed mini bar when controls are hidden ───
                if (!isControlStripExpanded) {
                    Surface(
                        color = Color(0xFF0D1117),
                        modifier = Modifier
                            .fillMaxWidth()
                            .pointerInput(Unit) {
                                detectVerticalDragGestures { _, dragAmount ->
                                    if (dragAmount < -30) { // Swipe up to expand
                                        isControlStripExpanded = true
                                    }
                                }
                            }
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            // Swipe up hint
                            Box(
                                modifier = Modifier
                                    .width(36.dp)
                                    .height(4.dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(Colors.border)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Swipe up for controls",
                                style = AppTextStyles.caption,
                                color = Colors.textMuted
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            // Minimal action row
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                OutlinedButton(
                                    onClick = { viewModel.saveToGallery() },
                                    enabled = !state.isSaving && !state.isGenerating,
                                    modifier = Modifier.weight(1f).height(42.dp),
                                    shape = RoundedCornerShape(14.dp),
                                    border = BorderStroke(1.5.dp, Colors.primary),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary)
                                ) {
                                    Icon(Icons.Default.Download, null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Download", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                }
                                Button(
                                    onClick = { viewModel.shareImage() },
                                    enabled = !state.isSaving && !state.isGenerating,
                                    modifier = Modifier.weight(1f).height(42.dp),
                                    shape = RoundedCornerShape(14.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = Colors.primary,
                                        contentColor = Colors.buttonText
                                    )
                                ) {
                                    Icon(Icons.Default.Share, null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Share", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                }
                            }
                        }
                    }
                }
            }

            // ─── Back button floating top-left ───
            Surface(
                onClick = onNavigateBack,
                shape = CircleShape,
                color = Color.Black.copy(alpha = 0.6f),
                border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.4f)),
                modifier = Modifier
                    .statusBarsPadding()
                    .padding(start = 12.dp, top = 8.dp)
                    .size(40.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Color.White,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            // ─── Garmin attribution — floating top-right (Garmin API Brand Guidelines) ───
            // Run data displayed in shared images may originate from a Garmin device.
            // Attribution must be visible to the user above the fold.
            GarminAttributionBadge(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding()
                    .padding(end = 12.dp, top = 14.dp),
                style = GarminBadgeStyle.INLINE,
            )
        }

        // ─── Error snackbar ───
        state.error?.let { error ->
            Snackbar(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(Spacing.lg)
                    .navigationBarsPadding(),
                containerColor = Colors.error.copy(alpha = 0.95f),
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

        // ─── Success toast ───
        state.successMessage?.let { msg ->
            Snackbar(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(Spacing.lg)
                    .navigationBarsPadding(),
                containerColor = Colors.success.copy(alpha = 0.95f),
                contentColor = Colors.textPrimary
            ) {
                Text(msg)
            }
        }

        // ─── Ring metric picker overlay ───
        if (state.showRingPicker) {
            RingPickerOverlay(
                position = state.ringPickerPosition ?: "",
                currentMetric = state.ringLayout[state.ringPickerPosition ?: ""] ?: "",
                onMetricSelected = { metric ->
                    viewModel.setRingMetric(state.ringPickerPosition ?: "", metric)
                },
                onDismiss = { viewModel.closeRingPicker() }
            )
        }
    }
}

/* ═══════════════════════ FULL-BLEED PREVIEW ═══════════════════════ */

@Composable
private fun PreviewAreaFullBleed(
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
            .fillMaxSize()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        // The preview card fills as much space as possible while maintaining aspect ratio
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117)),
            shape = RoundedCornerShape(20.dp),
            border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.5f)),
            elevation = CardDefaults.cardElevation(defaultElevation = 12.dp)
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
                        } catch (_: Exception) {
                            null
                        }
                    }

                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap,
                            contentDescription = "Preview",
                            modifier = Modifier
                                .fillMaxSize()
                                .clip(RoundedCornerShape(20.dp)),
                            contentScale = ContentScale.Crop
                        )
                    }
                }

                // Loading overlay
                if (isLoading) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color(0xFF050A12).copy(alpha = 0.5f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(
                                color = Colors.primary,
                                modifier = Modifier.size(36.dp),
                                strokeWidth = 3.dp
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "Rendering...",
                                style = AppTextStyles.caption,
                                color = Colors.textSecondary
                            )
                        }
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
                            tint = Colors.textMuted.copy(alpha = 0.5f),
                            modifier = Modifier.size(56.dp)
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

                // Sticker overlay indicators
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
                                onDrag = { id, x, y -> onStickerDrag(id, x, y) },
                                onDragEnd = { id -> onStickerDragEnd(id) },
                                onScale = { id, scale -> onStickerScale(id, scale) },
                                onRemove = { onStickerRemove(placed.widgetId) }
                            )
                        }
                    }
                }
            }
        }
    }
}

/* ═══════════════════════ CONTROL STRIP ═══════════════════════ */

@Composable
private fun ControlStrip(
    templates: List<ShareTemplate>,
    selectedTemplate: ShareTemplate?,
    selectedAspectRatio: String,
    onSelectTemplate: (ShareTemplate) -> Unit,
    onSelectAspectRatio: (String) -> Unit,
    isStickerPanelExpanded: Boolean,
    onToggleStickers: () -> Unit,
    placedStickerCount: Int,
    stickers: List<StickerWidget>,
    placedStickerIds: Set<String>,
    onAddSticker: (StickerWidget) -> Unit,
    onRemoveSticker: (String) -> Unit,
    // Background
    isBackgroundPanelExpanded: Boolean,
    onToggleBackground: () -> Unit,
    hasCustomBackground: Boolean,
    backgroundOpacity: Float,
    backgroundBlur: Int,
    onPickBackground: () -> Unit,
    onTakePhoto: () -> Unit,
    onRemoveBackground: () -> Unit,
    onBackgroundOpacityChange: (Float) -> Unit,
    onBackgroundBlurChange: (Int) -> Unit,
    // Ring customizer (stats-grid only)
    isStatsGridTemplate: Boolean,
    isRingsPanelExpanded: Boolean,
    onToggleRings: () -> Unit,
    ringLayout: Map<String, String>,
    onRingPositionClick: (String) -> Unit,
    // Actions
    isSaving: Boolean,
    isGenerating: Boolean,
    onDownload: () -> Unit,
    onShare: () -> Unit,
    // Collapse
    onCollapse: () -> Unit
) {
    Surface(
        color = Color(0xFF0D1117),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.4f)),
        tonalElevation = 8.dp,
        shadowElevation = 16.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .pointerInput(Unit) {
                    detectVerticalDragGestures { _, dragAmount ->
                        if (dragAmount > 50) { // Swipe down to collapse
                            onCollapse()
                        }
                    }
                }
        ) {
            // Drag handle
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Colors.border)
                )
            }

            // Template chips row + aspect ratio pills (single combined row)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Templates
                LazyRow(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(templates) { template ->
                        TemplateChip(
                            template = template,
                            isSelected = template.id == selectedTemplate?.id,
                            onClick = { onSelectTemplate(template) }
                        )
                    }
                }

                Spacer(modifier = Modifier.width(8.dp))

                // Aspect ratio toggles
                selectedTemplate?.let { tmpl ->
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        tmpl.aspectRatios.forEach { ratio ->
                            AspectRatioChip(
                                ratio = ratio,
                                isSelected = ratio == selectedAspectRatio,
                                onClick = { onSelectAspectRatio(ratio) }
                            )
                        }
                    }
                }
            }

            // Sticker toggle row
            Surface(
                onClick = onToggleStickers,
                color = Color.Transparent
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Widgets,
                        contentDescription = null,
                        tint = Colors.primary,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Stickers",
                        style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
                        color = Colors.textPrimary,
                        modifier = Modifier.weight(1f)
                    )
                    if (placedStickerCount > 0) {
                        Surface(
                            shape = CircleShape,
                            color = Colors.primary,
                            modifier = Modifier.size(20.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    "$placedStickerCount",
                                    style = AppTextStyles.caption.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 10.sp
                                    ),
                                    color = Colors.buttonText
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                    }
                    Icon(
                        imageVector = if (isStickerPanelExpanded) Icons.Default.ExpandMore else Icons.Default.ExpandLess,
                        contentDescription = null,
                        tint = Colors.textSecondary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            // Expandable sticker panel
            AnimatedVisibility(
                visible = isStickerPanelExpanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                StickerPanelCompact(
                    stickers = stickers,
                    placedStickerIds = placedStickerIds,
                    onAddSticker = onAddSticker,
                    onRemoveSticker = onRemoveSticker
                )
            }

            // ─── Background image toggle ───
            Surface(
                onClick = onToggleBackground,
                color = Color.Transparent
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Image,
                        contentDescription = null,
                        tint = if (hasCustomBackground) Colors.success else Colors.primary,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Background Photo",
                        style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
                        color = Colors.textPrimary,
                        modifier = Modifier.weight(1f)
                    )
                    if (hasCustomBackground) {
                        Surface(
                            shape = CircleShape,
                            color = Colors.success,
                            modifier = Modifier.size(8.dp)
                        ) {}
                        Spacer(modifier = Modifier.width(4.dp))
                    }
                    Icon(
                        imageVector = if (isBackgroundPanelExpanded) Icons.Default.ExpandMore else Icons.Default.ExpandLess,
                        contentDescription = null,
                        tint = Colors.textSecondary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            // Expandable background panel
            AnimatedVisibility(
                visible = isBackgroundPanelExpanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                BackgroundControlPanel(
                    hasCustomBackground = hasCustomBackground,
                    backgroundOpacity = backgroundOpacity,
                    backgroundBlur = backgroundBlur,
                    onPickBackground = onPickBackground,
                    onTakePhoto = onTakePhoto,
                    onRemoveBackground = onRemoveBackground,
                    onOpacityChange = onBackgroundOpacityChange,
                    onBlurChange = onBackgroundBlurChange
                )
            }

            // ─── Customize Rings (stats-grid only) ───
            AnimatedVisibility(
                visible = isStatsGridTemplate,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column {
                    Surface(onClick = onToggleRings, color = Color.Transparent) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Tune,
                                contentDescription = null,
                                tint = Colors.primary,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Customize Rings",
                                style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
                                color = Colors.textPrimary,
                                modifier = Modifier.weight(1f)
                            )
                            Icon(
                                imageVector = if (isRingsPanelExpanded) Icons.Default.ExpandMore else Icons.Default.ExpandLess,
                                contentDescription = null,
                                tint = Colors.textSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    AnimatedVisibility(
                        visible = isRingsPanelExpanded,
                        enter = expandVertically() + fadeIn(),
                        exit = shrinkVertically() + fadeOut()
                    ) {
                        RingCustomizerPanel(ringLayout = ringLayout, onRingPositionClick = onRingPositionClick)
                    }
                }
            }

            // Action buttons
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Download button
                OutlinedButton(
                    onClick = onDownload,
                    enabled = !isSaving && !isGenerating,
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(
                        1.5.dp,
                        if (isSaving) Colors.textMuted else Colors.primary
                    ),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Colors.primary,
                        disabledContentColor = Colors.textMuted
                    )
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = Colors.textMuted,
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Saving...", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    } else {
                        Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Download", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    }
                }

                // Share button
                Button(
                    onClick = onShare,
                    enabled = !isSaving && !isGenerating,
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Colors.primary,
                        contentColor = Colors.buttonText,
                        disabledContainerColor = Colors.backgroundTertiary,
                        disabledContentColor = Colors.textMuted
                    )
                ) {
                    if (isGenerating) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = Colors.buttonText,
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Generating...", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    } else {
                        Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Share", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                }
            }
        }
    }
}

/* ═══════════════════════ TEMPLATE CHIP ═══════════════════════ */

@Composable
private fun TemplateChip(
    template: ShareTemplate,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val icon = when (template.category) {
        "stats" -> Icons.Default.GridView
        "map" -> Icons.Default.Map
        "splits" -> Icons.Default.BarChart
        "achievement" -> Icons.Default.EmojiEvents
        "minimal" -> Icons.Default.Contrast
        else -> Icons.Default.Image
    }

    val bgColor = if (isSelected) Colors.primary.copy(alpha = 0.15f) else Color(0xFF1A2332)
    val borderColor = if (isSelected) Colors.primary else Colors.border.copy(alpha = 0.5f)
    val contentColor = if (isSelected) Colors.primary else Colors.textSecondary

    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = bgColor,
        border = BorderStroke(if (isSelected) 1.5.dp else 1.dp, borderColor)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(16.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = template.name,
                style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
                color = if (isSelected) Colors.primary else Colors.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/* ═══════════════════════ ASPECT RATIO CHIP ═══════════════════════ */

@Composable
private fun AspectRatioChip(
    ratio: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val label = when (ratio) {
        "1:1" -> "1:1"
        "9:16" -> "9:16"
        "4:5" -> "4:5"
        else -> ratio
    }

    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(8.dp),
        color = if (isSelected) Colors.primary else Color(0xFF1A2332),
        modifier = Modifier.size(36.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = label,
                fontSize = 9.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                color = if (isSelected) Colors.buttonText else Colors.textSecondary,
                textAlign = TextAlign.Center
            )
        }
    }
}

/* ═══════════════════════ STICKER OVERLAY ═══════════════════════ */

@Composable
private fun StickerOverlayChip(
    placed: PlacedSticker,
    widget: StickerWidget,
    containerSize: IntSize,
    onDrag: (String, Float, Float) -> Unit,
    onDragEnd: (String) -> Unit,
    onScale: (String, Float) -> Unit,
    onRemove: () -> Unit
) {
    val density = LocalDensity.current
    val xPx = placed.x * containerSize.width
    val yPx = placed.y * containerSize.height
    val xDp = with(density) { xPx.toDp() }
    val yDp = with(density) { yPx.toDp() }

    val currentPlaced by rememberUpdatedState(placed)
    val currentOnDrag by rememberUpdatedState(onDrag)
    val currentOnDragEnd by rememberUpdatedState(onDragEnd)
    val currentOnScale by rememberUpdatedState(onScale)
    val currentContainerSize by rememberUpdatedState(containerSize)

    val baseChipW = 90.dp
    val baseChipH = 36.dp
    val chipW = baseChipW * placed.scale
    val chipH = baseChipH * placed.scale

    Box(
        modifier = Modifier
            .offset(
                x = xDp - chipW / 2,
                y = yDp - chipH / 2
            )
    ) {
        // Main draggable chip
        Surface(
            shape = RoundedCornerShape(chipH / 2),
            color = Colors.primary.copy(alpha = 0.85f),
            border = BorderStroke(1.5.dp, Color.White.copy(alpha = 0.3f)),
            shadowElevation = 6.dp,
            modifier = Modifier
                .width(chipW)
                .height(chipH)
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragEnd = {
                            currentOnDragEnd(currentPlaced.widgetId)
                        }
                    ) { change, dragAmount ->
                        change.consume()
                        val newX = currentPlaced.x + dragAmount.x / currentContainerSize.width
                        val newY = currentPlaced.y + dragAmount.y / currentContainerSize.height
                        currentOnDrag(currentPlaced.widgetId, newX, newY)
                    }
                }
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 8.dp * placed.scale),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                val icon = stickerIcon(widget.icon)
                Icon(
                    imageVector = icon,
                    contentDescription = widget.label,
                    tint = Colors.buttonText,
                    modifier = Modifier.size(14.dp * placed.scale)
                )
                Spacer(modifier = Modifier.width(4.dp * placed.scale))
                Text(
                    text = widget.label,
                    color = Colors.buttonText,
                    fontSize = (10 * placed.scale).sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        // Control buttons — positioned above the chip
        Row(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(y = (-22).dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // Scale down
            Surface(
                onClick = {
                    val newScale = (currentPlaced.scale - 0.2f).coerceIn(0.5f, 2.5f)
                    currentOnScale(currentPlaced.widgetId, newScale)
                    currentOnDragEnd(currentPlaced.widgetId)
                },
                shape = CircleShape,
                color = Color(0xFF1A2332).copy(alpha = 0.95f),
                border = BorderStroke(1.dp, Colors.border),
                modifier = Modifier.size(22.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Remove, contentDescription = "Smaller", tint = Color.White, modifier = Modifier.size(12.dp))
                }
            }
            // Scale up
            Surface(
                onClick = {
                    val newScale = (currentPlaced.scale + 0.2f).coerceIn(0.5f, 2.5f)
                    currentOnScale(currentPlaced.widgetId, newScale)
                    currentOnDragEnd(currentPlaced.widgetId)
                },
                shape = CircleShape,
                color = Color(0xFF1A2332).copy(alpha = 0.95f),
                border = BorderStroke(1.dp, Colors.border),
                modifier = Modifier.size(22.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Add, contentDescription = "Larger", tint = Color.White, modifier = Modifier.size(12.dp))
                }
            }
            // Remove
            Surface(
                onClick = onRemove,
                shape = CircleShape,
                color = Colors.error.copy(alpha = 0.95f),
                modifier = Modifier.size(22.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Close, contentDescription = "Remove", tint = Color.White, modifier = Modifier.size(12.dp))
                }
            }
        }
    }
}

/* ═══════════════════════ COMPACT STICKER PANEL ═══════════════════════ */

@Composable
private fun StickerPanelCompact(
    stickers: List<StickerWidget>,
    placedStickerIds: Set<String>,
    onAddSticker: (StickerWidget) -> Unit,
    onRemoveSticker: (String) -> Unit
) {
    val categories = stickers.groupBy { it.category }
    val categoryOrder = listOf("metrics", "charts", "badges", "text")
    var selectedCategory by remember { mutableStateOf("metrics") }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 180.dp)
    ) {
        // Category row — horizontal chips instead of tabs
        LazyRow(
            contentPadding = PaddingValues(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.padding(bottom = 6.dp)
        ) {
            items(categoryOrder) { cat ->
                val label = when (cat) {
                    "metrics" -> "Metrics"
                    "charts" -> "Charts"
                    "badges" -> "Badges"
                    "text" -> "Text"
                    else -> cat.replaceFirstChar { it.uppercase() }
                }
                val isSelected = selectedCategory == cat

                Surface(
                    onClick = { selectedCategory = cat },
                    shape = RoundedCornerShape(8.dp),
                    color = if (isSelected) Colors.primary.copy(alpha = 0.15f) else Color.Transparent,
                    border = BorderStroke(
                        1.dp,
                        if (isSelected) Colors.primary else Colors.border.copy(alpha = 0.3f)
                    )
                ) {
                    Text(
                        text = label,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                        color = if (isSelected) Colors.primary else Colors.textSecondary
                    )
                }
            }
        }

        // Sticker grid
        val categoryStickers = categories[selectedCategory] ?: emptyList()
        LazyVerticalGrid(
            columns = GridCells.Fixed(4),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(categoryStickers) { widget ->
                val isPlaced = widget.id in placedStickerIds
                StickerGridItemCompact(
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

@Composable
private fun StickerGridItemCompact(
    widget: StickerWidget,
    isPlaced: Boolean,
    onToggle: () -> Unit
) {
    val bgColor = if (isPlaced) Colors.primary.copy(alpha = 0.15f) else Color(0xFF1A2332)
    val borderColor = if (isPlaced) Colors.primary else Colors.border.copy(alpha = 0.3f)

    Card(
        onClick = onToggle,
        colors = CardDefaults.cardColors(containerColor = bgColor),
        border = BorderStroke(1.dp, borderColor),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 6.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box {
                Icon(
                    imageVector = stickerIcon(widget.icon),
                    contentDescription = null,
                    tint = if (isPlaced) Colors.primary else Colors.textSecondary,
                    modifier = Modifier.size(18.dp)
                )
                if (isPlaced) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = Colors.primary,
                        modifier = Modifier
                            .size(8.dp)
                            .align(Alignment.TopEnd)
                    )
                }
            }
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = widget.label,
                style = AppTextStyles.caption.copy(fontSize = 9.sp),
                color = if (isPlaced) Colors.primary else Colors.textSecondary,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/* ═══════════════════════ BACKGROUND CONTROL PANEL ═══════════════════════ */

@Composable
private fun BackgroundControlPanel(
    hasCustomBackground: Boolean,
    backgroundOpacity: Float,
    backgroundBlur: Int,
    onPickBackground: () -> Unit,
    onTakePhoto: () -> Unit,
    onRemoveBackground: () -> Unit,
    onOpacityChange: (Float) -> Unit,
    onBlurChange: (Int) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
    ) {
        if (!hasCustomBackground) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onPickBackground,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, Colors.primary.copy(alpha = 0.5f)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary)
                ) {
                    Icon(Icons.Default.PhotoLibrary, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Gallery", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                OutlinedButton(
                    onClick = onTakePhoto,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, Colors.primary.copy(alpha = 0.5f)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Colors.primary)
                ) {
                    Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Camera", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.CheckCircle, null, tint = Colors.success, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Background set", style = AppTextStyles.small, color = Colors.textSecondary, modifier = Modifier.weight(1f))
                TextButton(onClick = onPickBackground) {
                    Text("Change", fontSize = 12.sp, color = Colors.primary)
                }
                TextButton(onClick = onTakePhoto) {
                    Text("Camera", fontSize = 12.sp, color = Colors.primary)
                }
                TextButton(onClick = onRemoveBackground) {
                    Text("Remove", fontSize = 12.sp, color = Colors.error)
                }
            }

            // Opacity slider
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Opacity", style = AppTextStyles.caption, color = Colors.textMuted, modifier = Modifier.width(60.dp))
                Slider(
                    value = backgroundOpacity,
                    onValueChange = onOpacityChange,
                    valueRange = 0.1f..1.0f,
                    modifier = Modifier.weight(1f),
                    colors = SliderDefaults.colors(
                        thumbColor = Colors.primary,
                        activeTrackColor = Colors.primary
                    )
                )
                Text(
                    "${(backgroundOpacity * 100).toInt()}%",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary,
                    modifier = Modifier.width(36.dp),
                    textAlign = TextAlign.End
                )
            }

            // Blur slider
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Blur", style = AppTextStyles.caption, color = Colors.textMuted, modifier = Modifier.width(60.dp))
                Slider(
                    value = backgroundBlur.toFloat(),
                    onValueChange = { onBlurChange(it.toInt()) },
                    valueRange = 0f..50f,
                    modifier = Modifier.weight(1f),
                    colors = SliderDefaults.colors(
                        thumbColor = Colors.primary,
                        activeTrackColor = Colors.primary
                    )
                )
                Text(
                    "$backgroundBlur",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary,
                    modifier = Modifier.width(36.dp),
                    textAlign = TextAlign.End
                )
            }
        }
    }
}

/* ═══════════════════════ RING CUSTOMIZER ═══════════════════════ */

private val RING_METRIC_OPTIONS = listOf(
    "distance"      to "Distance",
    "pace"          to "Avg Pace",
    "duration"      to "Duration",
    "heartRate"     to "Heart Rate",
    "maxHeartRate"  to "Max HR",
    "calories"      to "Calories",
    "elevationGain" to "Elev Gain",
    "elevationLoss" to "Elev Loss",
    "cadence"       to "Cadence",
)

private fun metricLabel(key: String): String =
    RING_METRIC_OPTIONS.find { it.first == key }?.second ?: key

@Composable
private fun RingCustomizerPanel(
    ringLayout: Map<String, String>,
    onRingPositionClick: (String) -> Unit
) {
    val positions = listOf(
        "topLeft"     to "Top Left",
        "topRight"    to "Top Right",
        "bottomLeft"  to "Bottom Left",
        "bottomRight" to "Bottom Right",
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp)
    ) {
        Text(
            text = "Tap a position to change its metric",
            style = AppTextStyles.caption,
            color = Colors.textMuted,
            modifier = Modifier.padding(start = 4.dp, bottom = 8.dp)
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            positions.take(2).forEach { (posKey, posLabel) ->
                RingPositionButton(
                    posLabel = posLabel,
                    currentMetric = metricLabel(ringLayout[posKey] ?: ""),
                    onClick = { onRingPositionClick(posKey) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            positions.drop(2).forEach { (posKey, posLabel) ->
                RingPositionButton(
                    posLabel = posLabel,
                    currentMetric = metricLabel(ringLayout[posKey] ?: ""),
                    onClick = { onRingPositionClick(posKey) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
    }
}

@Composable
private fun RingPositionButton(
    posLabel: String,
    currentMetric: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1A2332)),
        border = BorderStroke(1.dp, Colors.primary.copy(alpha = 0.4f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = posLabel,
                style = AppTextStyles.caption.copy(fontSize = 10.sp),
                color = Colors.textMuted,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = currentMetric,
                style = AppTextStyles.small.copy(fontWeight = FontWeight.Bold),
                color = Colors.primary,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(4.dp))
            Icon(
                imageVector = Icons.Default.Edit,
                contentDescription = "Change",
                tint = Colors.textMuted,
                modifier = Modifier.size(11.dp)
            )
        }
    }
}

/* ═══════════════════════ RING PICKER OVERLAY ═══════════════════════ */

@Composable
private fun RingPickerOverlay(
    position: String,
    currentMetric: String,
    onMetricSelected: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val posLabel = when (position) {
        "topLeft"     -> "Top Left Ring"
        "topRight"    -> "Top Right Ring"
        "bottomLeft"  -> "Bottom Left Ring"
        "bottomRight" -> "Bottom Right Ring"
        else          -> "Ring"
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.65f))
            .clickable { onDismiss() }
    ) {
        Card(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .clickable { /* consume — prevent dismiss */ },
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0D1117)),
            border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.5f))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 20.dp)
            ) {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Box(
                        modifier = Modifier
                            .width(36.dp)
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(Colors.border)
                    )
                }
                Spacer(modifier = Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Tune, null, tint = Colors.primary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Change Metric — $posLabel",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(RING_METRIC_OPTIONS) { (key, label) ->
                        val isSelected = key == currentMetric
                        Card(
                            onClick = { onMetricSelected(key) },
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = if (isSelected) Colors.primary.copy(alpha = 0.18f)
                                                 else Color(0xFF1A2332)
                            ),
                            border = BorderStroke(
                                if (isSelected) 1.5.dp else 1.dp,
                                if (isSelected) Colors.primary else Colors.border.copy(alpha = 0.4f)
                            )
                        ) {
                            Box(
                                contentAlignment = Alignment.Center,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 14.dp, horizontal = 4.dp)
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 13.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    color = if (isSelected) Colors.primary else Colors.textSecondary,
                                    textAlign = TextAlign.Center,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

/* ═══════════════════════ HELPERS ═══════════════════════ */

private fun stickerIcon(iconName: String): ImageVector {
    return when (iconName) {
        "map-pin" -> Icons.Default.Place
        "clock" -> Icons.Default.Schedule
        "zap" -> Icons.Default.FlashOn
        "heart" -> Icons.Default.Favorite
        "activity" -> Icons.Default.LocalFireDepartment
        "trending-up" -> Icons.AutoMirrored.Filled.TrendingUp
        "repeat" -> Icons.Default.Repeat
        "bar-chart" -> Icons.Default.BarChart
        "shield" -> Icons.Default.Shield
        "cloud" -> Icons.Default.Cloud
        "type" -> Icons.Default.TextFields
        else -> Icons.Default.Star
    }
}
