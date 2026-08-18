package live.airuncoach.airuncoach.wear.input

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput

/**
 * Double-tap → talk-to-coach, gated by the caller to only fire while running+unpaused,
 * mirroring RunView.mc's `onTap()` exactly. Single tap is intentionally NOT wired to any
 * run-state action — Garmin's `onTap()` consumes single taps and does nothing with them
 * ("screen touches must NEVER start/pause a run"); all run control is button-only, via
 * WearMainActivity.onKeyDown (KEYCODE_STEM_1 = start/pause/resume, KEYCODE_STEM_2 = back).
 */
fun Modifier.runScreenDoubleTapGesture(onDoubleTap: () -> Unit): Modifier = this.pointerInput(Unit) {
    detectTapGestures(onDoubleTap = { onDoubleTap() })
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
