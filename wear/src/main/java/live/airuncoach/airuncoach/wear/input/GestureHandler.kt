package live.airuncoach.airuncoach.wear.input

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput

/**
 * Double-tap → talk-to-coach, gated by the caller to only fire while running+unpaused,
 * mirroring RunView.mc's `onTap()`. A stray touch on the run dashboards never starts or pauses
 * a run (Garmin's rule); run control is the bottom/BACK button (pause) and the explicit START /
 * RESUME / FINISH buttons on the ready and paused screens.
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
