# Native Implementation Status — Replit Feedback

## Context
Replit team has confirmed that both native-side items from the brief are:
1. **Coordinate Alignment** — required on native side
2. **Transparent Background Toggle** — required on native side

---

## ✅ Android Implementation Complete

### 1. Coordinate Alignment
**Status:** ✅ COMPLETE

**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ShareImageEditorScreen.kt`

**Implementation Detail:**
The drag handle overlay now positions its **top-left corner** at the normalized coordinates `(sticker.x, sticker.y)` without any center-offset:

```kotlin
val xPx = placed.x * containerSize.width  // Direct multiplication
val yPx = placed.y * containerSize.height // No offset

Box(
    modifier = Modifier
        .offset(
            // x/y are normalized top-left coords (matching server's px = x*canvasW, py = y*canvasH).
            // Do NOT center-offset here — that caused the drag handle to appear shifted
            // relative to the server-rendered sticker in the preview image behind it.
            x = xDp,
            y = yDp - buttonRowH  // Only subtract button row height above the sticker
        )
)
```

**Key Points:**
- Normalized values (0→1) are scaled to container dimensions during rendering
- Top-left alignment ensures handle matches server's top-left rendering
- Button row is positioned above, not affecting the sticker's core position

---

### 2. Transparent Background Toggle
**Status:** ✅ COMPLETE

**Files Modified:**

#### A. Model Update
**File:** `app/src/main/java/live/airuncoach/airuncoach/network/model/ShareModels.kt`

```kotlin
data class PlacedSticker(
    val widgetId: String,
    val x: Float,
    val y: Float,
    val scale: Float = 1.0f,
    val transparentBackground: Boolean = false  // NEW FIELD
)
```

**Behavior:**
- Defaults to `false` (opaque background, card background shown)
- When `true`, server skips rendering the background rect and border

#### B. ViewModel Function
**File:** `app/src/main/java/live/airuncoach/airuncoach/viewmodel/ShareImageViewModel.kt`

```kotlin
fun toggleStickerTransparentBackground(widgetId: String) {
    _state.update { state ->
        state.copy(
            placedStickers = state.placedStickers.map {
                if (it.widgetId == widgetId) 
                    it.copy(transparentBackground = !it.transparentBackground)
                else it
            }
        )
    }
    requestPreviewDebounced()  // Re-fetch preview with new setting
}
```

**Behavior:**
- Flips the boolean flag on the target sticker
- Automatically debounces and requests a preview refresh
- Server sees the new flag in the request JSON

#### C. UI Button
**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ShareImageEditorScreen.kt`

```kotlin
// Transparent background toggle (4th button in overlay)
Surface(
    onClick = onToggleTransparent,
    shape = CircleShape,
    color = if (placed.transparentBackground)
        Colors.primary.copy(alpha = 0.85f)  // Highlighted when active
    else
        Color(0xFF1A2332).copy(alpha = 0.95f),
    border = BorderStroke(1.dp, if (placed.transparentBackground) Colors.primary else Colors.border),
    modifier = Modifier.size(buttonSize)
) {
    Box(contentAlignment = Alignment.Center) {
        Icon(
            Icons.Default.InvertColors,
            contentDescription = if (placed.transparentBackground) "Opaque background" else "Transparent background",
            tint = Color.White,
            modifier = Modifier.size(12.dp)
        )
    }
}
```

**Button Behavior:**
- **Icon:** `InvertColors` (palette/swap icon)
- **Highlighted:** Glows in primary color when transparent mode is ON
- **Tap:** Toggles the flag and re-renders preview
- **Position:** Between scale buttons and remove button in the overlay

---

## Server-Side Confirmation

The Replit team has confirmed:
- ✅ Server already handles `transparentBackground` in JSON
- ✅ Server skips background rendering when flag is `true`
- ✅ SVG clipPath is applied to prevent chart overflow (already deployed)

---

## Testing Checklist

- [ ] **Coordinate Alignment**
  - [ ] Drag a sticker to various positions
  - [ ] Verify drag handle position matches the server-rendered sticker in the preview
  - [ ] Test at different scales (50% to 250%)
  - [ ] Confirm no offset appears when dragging

- [ ] **Transparent Background Toggle**
  - [ ] Add a chart sticker (e.g., elevation chart)
  - [ ] Tap the new `InvertColors` button
  - [ ] Confirm preview updates with transparent background (no gray card)
  - [ ] Tap again to revert to opaque
  - [ ] Verify button color changes (highlights when ON)
  - [ ] Test on different sticker types (stats and charts)

---

## Summary

**Android implementation is complete and ready for testing.** Both native items from the Replit brief are now fully integrated:

1. **Coordinate alignment** — drag handles now position at true top-left without center-offset
2. **Transparent background** — toggle button added to sticker overlay, model field added, ViewModel function added

The implementation flows seamlessly through the composition layer:
```
User taps toggle button 
  → onToggleTransparent callback 
  → ViewModel toggles flag 
  → Preview re-fetches with updated PlacedSticker 
  → Server respects transparentBackground=true 
  → Preview renders without card background
```

