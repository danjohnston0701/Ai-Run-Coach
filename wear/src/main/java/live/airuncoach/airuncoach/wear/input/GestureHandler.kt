package live.airuncoach.airuncoach.wear.input

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput

/**
 * Primary tap → start/pause/resume (the one unavoidable platform deviation from Garmin: Wear
 * OS/Galaxy Watch side buttons are OS-reserved, so there's no hardware START button analog —
 * the outcome is preserved via a context-sensitive tap instead of the trigger).
 *
 * Double-tap → talk-to-coach, gated by the caller to only fire while running+unpaused,
 * mirroring RunView.mc's `onTap()` exactly (that one behavior DOES map 1:1 to Wear OS).
 */
fun Modifier.runScreenTapGestures(
    onSingleTap: () -> Unit,
    onDoubleTap: () -> Unit
): Modifier = this.pointerInput(Unit) {
    detectTapGestures(
        onTap = { onSingleTap() },
        onDoubleTap = { onDoubleTap() }
    )
}

/** Horizontal drag → toggle Diamond/Grid screen. Deliberately NOT the OS edge-swipe-back
 * gesture (that's reserved for system back navigation) — an in-content drag instead,
 * mirroring RunView.mc's `onSwipe()`/`onNextPage()`/`onPreviousPage()` toggle behavior. */
fun Modifier.runScreenSwipeToggle(onToggle: () -> Unit): Modifier = this.pointerInput(Unit) {
    var dragged = false
    detectHorizontalDragGestures(
        onDragStart = { dragged = false },
        onHorizontalDrag = { change, dragAmount ->
            change.consume()
            if (!dragged && kotlin.math.abs(dragAmount) > 20f) {
                dragged = true
                onToggle()
            }
        }
    )
}
