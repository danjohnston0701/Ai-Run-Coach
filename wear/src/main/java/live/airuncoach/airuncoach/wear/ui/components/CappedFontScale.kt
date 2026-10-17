package live.airuncoach.airuncoach.wear.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

/**
 * Caps the system font scale for its content. Only for the Diamond/Grid run dashboards: those
 * are fixed instrument layouts (rings and cells placed by fractions of the round face, like a
 * watch face), so text can't reflow or scroll there and a large font would push values out of
 * their rings. Every screen with sentences or buttons uses [ScrollingScreen] and the full scale.
 */
@Composable
fun CappedFontScale(maxScale: Float, content: @Composable () -> Unit) {
    val density = LocalDensity.current
    if (density.fontScale <= maxScale) {
        content()
        return
    }
    CompositionLocalProvider(LocalDensity provides Density(density.density, maxScale)) {
        content()
    }
}
