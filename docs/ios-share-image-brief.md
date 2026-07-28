# iOS Brief: Share Image Editor Screen

**Feature:** Create & share a branded run stats image from the run summary screen  
**Platform:** iOS (Swift / SwiftUI, Xcode)  
**Backend:** `https://airuncoach.live` (existing, no changes needed)  
**Reference implementation:** Android — `ShareImageEditorScreen.kt` + `ShareImageViewModel.kt`

---

## 1. Entry Point

The share image editor is reached from the **Run Summary screen**.  
Add a **"Create Image"** (or share/image icon) button to the run summary action bar/toolbar. When tapped:

```swift
// Navigate to the editor, passing the run's ID
NavigationLink / .sheet / .fullScreenCover → ShareImageEditorView(runId: run.id)
```

The `runId` is the integer/string ID from the run object already loaded on that screen.

---

## 2. Authentication

All API calls (except `GET /api/share/templates`) require a Bearer token.

The token lives in **Keychain** under the same key the rest of the app uses for the logged-in user's session token. Retrieve it the same way every other authenticated API call in the iOS app does. Send it as:

```
Authorization: Bearer <token>
```

---

## 3. API Endpoints

**Base URL:** `https://airuncoach.live`

### 3.1 Get Templates (no auth)
```
GET /api/share/templates
```
**Response:**
```json
{
  "templates": [
    {
      "id": "stats-grid",
      "name": "Run Rings",
      "description": "Dynamic ring gauges showing your key metrics",
      "category": "stats",
      "aspectRatios": ["1:1", "9:16", "4:5"]
    },
    { "id": "run-metrics",    "name": "Run Metrics",    "aspectRatios": ["1:1","9:16","4:5"] },
    { "id": "route-map",      "name": "Route Map",      "aspectRatios": ["1:1","9:16","4:5"] },
    { "id": "split-summary",  "name": "Split Summary",  "aspectRatios": ["1:1","9:16","4:5"] },
    { "id": "achievement",    "name": "Achievement",    "aspectRatios": ["1:1","9:16","4:5"] },
    { "id": "minimal-dark",   "name": "Minimal Dark",   "aspectRatios": ["1:1","9:16","4:5"] }
  ],
  "stickers": [
    { "id": "stat-distance",   "type": "stat",  "category": "metrics", "label": "Distance",          "icon": "map-pin" },
    { "id": "stat-duration",   "type": "stat",  "category": "metrics", "label": "Duration",           "icon": "clock" },
    { "id": "stat-pace",       "type": "stat",  "category": "metrics", "label": "Avg Pace",           "icon": "zap" },
    { "id": "stat-heartrate",  "type": "stat",  "category": "metrics", "label": "Avg Heart Rate",     "icon": "heart" },
    { "id": "stat-calories",   "type": "stat",  "category": "metrics", "label": "Calories",           "icon": "activity" },
    { "id": "stat-elevation",  "type": "stat",  "category": "metrics", "label": "Elevation",          "icon": "trending-up" },
    { "id": "stat-cadence",    "type": "stat",  "category": "metrics", "label": "Cadence",            "icon": "repeat" },
    { "id": "stat-maxhr",      "type": "stat",  "category": "metrics", "label": "Max Heart Rate",     "icon": "heart" },
    { "id": "chart-elevation", "type": "chart", "category": "charts",  "label": "Elevation Profile",  "icon": "bar-chart" },
    { "id": "chart-pace",      "type": "chart", "category": "charts",  "label": "Pace Chart",         "icon": "bar-chart" },
    { "id": "chart-heartrate", "type": "chart", "category": "charts",  "label": "Heart Rate Chart",   "icon": "bar-chart" },
    { "id": "badge-difficulty","type": "badge", "category": "badges",  "label": "Difficulty Badge",   "icon": "shield" },
    { "id": "badge-weather",   "type": "badge", "category": "badges",  "label": "Weather",            "icon": "cloud" },
    { "id": "text-custom",     "type": "text",  "category": "text",    "label": "Custom Text",        "icon": "type" }
  ]
}
```

---

### 3.2 Preview Image (auth required)
```
POST /api/share/preview
Content-Type: application/json
Authorization: Bearer <token>
```
**Request body:**
```json
{
  "runId": "123",
  "templateId": "stats-grid",
  "aspectRatio": "9:16",
  "stickers": [
    { "widgetId": "stat-distance", "x": 0.5, "y": 0.5, "scale": 1.0, "transparentBackground": false }
  ],
  "customBackground": "data:image/jpeg;base64,...",
  "backgroundOpacity": 0.4,
  "backgroundBlur": 8,
  "ringLayout": {
    "topLeft": "distance",
    "topRight": "pace",
    "bottomLeft": "duration",
    "bottomRight": "elevationGain"
  },
  "customCaption": "Optional caption text"
}
```
All fields except `runId` and `templateId` are optional.  

**Response:**
```json
{ "image": "data:image/png;base64,iVBORw0KGgo..." }
```
Strip the `data:image/png;base64,` prefix, base64-decode, and display as a `UIImage` / `Image`.

---

### 3.3 Generate Final Image (auth required)
```
POST /api/share/generate
Content-Type: application/json
Authorization: Bearer <token>
```
**Request body:** identical shape to `/api/share/preview`

**Response:** raw `image/png` bytes (not JSON). Use these bytes directly to:
- Save to Photos via `PHPhotoLibrary`
- Share via `UIActivityViewController`

---

## 4. Data Models (Swift)

```swift
// MARK: - API Models

struct ShareTemplatesResponse: Codable {
    let templates: [ShareTemplate]
    let stickers: [StickerWidget]
}

struct ShareTemplate: Codable, Identifiable {
    let id: String
    let name: String
    let description: String
    let category: String
    let aspectRatios: [String]
}

struct StickerWidget: Codable, Identifiable {
    let id: String
    let type: String
    let category: String
    let label: String
    let icon: String
}

struct ShareImageRequest: Codable {
    let runId: String
    let templateId: String
    let aspectRatio: String           // "1:1" | "9:16" | "4:5"
    let stickers: [PlacedSticker]
    let customBackground: String?     // "data:image/jpeg;base64,..."
    let backgroundOpacity: Float?     // 0.1 – 1.0, default 0.4
    let backgroundBlur: Int?          // 0 – 100, default 8
    let customStickers: [CustomSticker]?
    let ringLayout: [String: String]? // keys: "topLeft","topRight","bottomLeft","bottomRight"
    let customCaption: String?
}

struct PlacedSticker: Codable {
    let widgetId: String
    let x: Float                      // 0.0 – 1.0 (fraction of image width)
    let y: Float                      // 0.0 – 1.0 (fraction of image height)
    let scale: Float                  // 0.5 – 2.5, default 1.0
    let transparentBackground: Bool   // default false
}

struct CustomSticker: Codable {
    let imageBase64: String           // "data:image/png;base64,..."
    let x: Float
    let y: Float
    let scale: Float                  // 0.1 – 3.0, default 0.5
    let rotation: Float               // degrees, default 0
    let opacity: Float                // 0.1 – 1.0, default 1.0
}

struct SharePreviewResponse: Codable {
    let image: String                 // "data:image/png;base64,..."
}
```

---

## 5. ViewModel State

```swift
@MainActor
class ShareImageViewModel: ObservableObject {
    @Published var templates: [ShareTemplate] = []
    @Published var stickers: [StickerWidget] = []
    @Published var selectedTemplate: ShareTemplate? = nil
    @Published var selectedAspectRatio: String = "9:16"
    @Published var placedStickers: [PlacedSticker] = []
    @Published var previewImage: UIImage? = nil
    @Published var isLoadingTemplates: Bool = false
    @Published var isLoadingPreview: Bool = false
    @Published var isGenerating: Bool = false        // generating final image for share
    @Published var isSaving: Bool = false            // saving to gallery
    @Published var error: String? = nil
    @Published var successMessage: String? = nil
    
    // Background customisation
    @Published var customBackgroundData: Data? = nil  // JPEG data
    @Published var backgroundOpacity: Float = 0.4
    @Published var backgroundBlur: Int = 8
    
    // Ring layout (stats-grid template only)
    @Published var ringLayout: [String: String] = [
        "topLeft": "distance",
        "topRight": "pace",
        "bottomLeft": "duration",
        "bottomRight": "elevationGain"
    ]
    @Published var showRingPicker: Bool = false
    @Published var ringPickerPosition: String? = nil

    // Debounce: cancel the previous preview task and wait 400ms before firing
    private var previewTask: Task<Void, Never>? = nil
    let runId: String
}
```

**Valid ring metric values** (for the ring picker):
`distance`, `pace`, `duration`, `elevationGain`, `heartRate`, `calories`, `cadence`

---

## 6. Preview Debounce Logic

Any change to template, aspect ratio, stickers, background, ring layout, etc. should trigger a debounced preview request:

```swift
func requestPreviewDebounced() {
    previewTask?.cancel()
    previewTask = Task {
        try? await Task.sleep(nanoseconds: 400_000_000) // 400ms
        guard !Task.isCancelled else { return }
        await loadPreview()
    }
}
```

---

## 7. Background Image Processing

When the user picks a photo (from Photos library or camera):

1. Decode to `UIImage`
2. Apply EXIF orientation correction (SwiftUI's `UIImage(data:)` usually handles this automatically)
3. Resize to max 1080px on the longest side
4. Compress to JPEG at 80% quality
5. Encode as `"data:image/jpeg;base64," + base64String`
6. Store and trigger debounced preview

Custom stickers (user-uploaded overlay images):
- Max 512px longest side
- PNG at 90% quality
- `"data:image/png;base64," + base64String`
- Max 10 custom stickers per image

---

## 8. Screen Layout

The screen is **full-screen**, dark background `#050A12`.

### 8.1 Structure (top → bottom)
```
┌─────────────────────────────────┐
│  ← (back button, floating)      │  ← Floating circle button, top-left, 40×40pt
│                                 │
│                                 │
│      IMAGE PREVIEW AREA         │  ← Fills remaining vertical space
│   (rounded card, aspect-locked) │     Card background: #0D1117, corner radius 20
│                                 │     Aspect ratio maintained: 9:16 / 4:5 / 1:1
│                                 │
├─────────────────────────────────┤
│  CONTROL STRIP (collapsible)    │  ← Bottom sheet panel, bg #0D1117
│  ┌ drag handle ┐                │     Can swipe down to collapse
│  [Template chips ─────] [Size▾] │     Can swipe up on mini bar to expand
│  [Stickers ▸] [Background ▸]   │
│  [Ring Layout ▸] (stats-grid)  │
│  [Download]  [Share]            │
└─────────────────────────────────┘
```

When control strip is **collapsed**, show a mini bar with just Download + Share buttons and a "Swipe up for controls" hint.

### 8.2 Preview Area
- Show a `ProgressView` spinner with "Rendering..." text while `isLoadingPreview` is true
- Show placeholder icon + "Select a template to preview" when no image yet
- Decode base64 response → `UIImage` → fill the card with `ContentMode.scaleAspectFill` + `clipped()`

### 8.3 Template Chips (horizontal scroll)
Each chip:
- Pill shape, selected = primary teal border + teal text, unselected = subtle border
- Taps immediately trigger debounced preview
- Templates in order: Run Rings, Run Metrics, Route Map, Split Summary, Achievement, Minimal Dark

### 8.4 Aspect Ratio Picker
A compact dropdown/menu button showing the current size label:
- `"1:1"` → **"Square"**
- `"9:16"` → **"Story"**  
- `"4:5"` → **"Post"**

Only show ratios that the selected template's `aspectRatios` array supports.

### 8.5 Sticker Panel (expandable section)
Expandable below the template row. Shows a grid of available `StickerWidget` items.
- Tap to add (placed at x=0.5, y=0.5, scale=1.0)
- Cannot add the same sticker twice
- Tap again to remove
- Show count badge on the "Stickers" toggle button when stickers are placed

Placed stickers show as draggable chips overlaid on the preview card:
- Drag to reposition (x/y as fractions 0–1 of image dimensions)
- Pinch to scale (0.5 – 2.5)
- Tap × to remove
- Long-press or toggle button to switch transparent background on/off

> **Note:** Sticker position/scale are sent to the server with the preview/generate request. The server renders them into the final image. The on-screen overlay is a visual affordance only — the actual pixel position is computed server-side from the normalised x/y/scale values.

### 8.6 Background Panel (expandable section)
Controls for custom photo background:
- **Pick Photo** — `PHPickerViewController`, single image selection
- **Take Photo** — `UIImagePickerController` camera
- **Remove** — clears custom background
- **Opacity slider** — 0.1 to 1.0 (default 0.4), step 0.05
- **Blur slider** — 0 to 100 (default 8), integer steps

### 8.7 Ring Customizer (expandable, stats-grid template only)
Show 4 position buttons in a 2×2 grid layout (topLeft, topRight, bottomLeft, bottomRight).
Each button shows the current metric name. Tap to open a picker sheet with the valid metric list.

### 8.8 Action Buttons
```
[↓ Download]   [↑ Share]
```
- **Download**: calls `/api/share/generate` → save PNG to Photos (`PHPhotoLibrary.shared().performChanges`)  
  Show "Saved to Photos!" success toast, auto-dismiss after 3 seconds.
- **Share**: calls `/api/share/generate` → present `UIActivityViewController(activityItems: [image, "Check out my run stats! #AIRunCoach"])`
- Both buttons disabled while `isGenerating` or `isSaving`

---

## 9. Error Handling

- Show errors as a `Toast` / bottom snackbar that auto-dismisses or has an "OK" button
- "Failed to load templates. Please check your connection."
- "Preview failed. Try again."
- "Failed to generate image."
- "Failed to save image." / "Failed to share image."
- "Failed to load background image."

---

## 10. Permissions Required

Add to `Info.plist`:
```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>AI Run Coach needs access to save your run share image.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>AI Run Coach needs access to save your run share image to Photos.</string>
<key>NSCameraUsageDescription</key>
<string>AI Run Coach needs camera access to take a custom background photo.</string>
```

---

## 11. Colours & Design Tokens

Match the app's existing design system. Key values used on this screen:

| Token | Hex | Usage |
|---|---|---|
| Background | `#050A12` | Full-screen bg |
| Card | `#0D1117` | Control strip + preview card |
| Primary (teal) | `#00BFFF` | Selected states, buttons, borders |
| Text primary | `#FFFFFF` | Labels |
| Text secondary | `rgba(255,255,255,0.6)` | Subtitles |
| Text muted | `rgba(255,255,255,0.35)` | Hints |
| Border | `rgba(255,255,255,0.12)` | Card borders |
| Error | `#FF5252` | Error snackbar bg |
| Success | `#00E676` | Success snackbar bg |
| Button text | `#000000` | Text on primary teal button |

---

## 12. Navigation Integration

From the **Run Summary screen**, add a share/image button that presents `ShareImageEditorView` as a full-screen cover:

```swift
.fullScreenCover(isPresented: $showShareEditor) {
    ShareImageEditorView(runId: String(run.id))
}
```

The view has its own back/dismiss button (floating top-left); no navigation bar needed.

---

## 13. Summary of All API Calls Made by This Screen

| When | Endpoint | Auth | Notes |
|---|---|---|---|
| On screen appear | `GET /api/share/templates` | No | Load templates + sticker list once |
| Any setting change (debounced 400ms) | `POST /api/share/preview` | Yes | Returns base64 PNG for preview |
| Tap "Download" | `POST /api/share/generate` | Yes | Returns raw PNG bytes → save to Photos |
| Tap "Share" | `POST /api/share/generate` | Yes | Returns raw PNG bytes → UIActivityViewController |
