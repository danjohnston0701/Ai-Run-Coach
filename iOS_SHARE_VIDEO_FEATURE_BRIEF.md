# iOS Share Video Feature — Complete Implementation Brief

**Status**: Ready for Xcode AI Implementation  
**Scope**: 3D drone-style video generation and sharing for run summary  
**Reference**: Android implementation complete (version 1.7+)  
**Timeline**: 3-4 days for full feature

---

## 📋 Executive Summary

**Share Run Video** is a cinematic video-generation feature that creates a stunning 3D drone-style flyover of the user's run route. Users can:
- **Generate** a video with a branded intro card, drone flyover, and live stats HUD
- **Preview** the video before saving
- **Download** to device storage
- **Share** via Messages, Mail, Instagram, WhatsApp, etc.

The video is rendered client-side using MapLibre GL for 3D terrain visualization and HTML5 Canvas for 2D overlays (intro card, flight HUD). The final MP4 is generated using native WebCodecs (with MediaRecorder fallback).

### Key Features:
- ✅ 3D MapLibre terrain with satellite imagery
- ✅ Drone-style camera following the run route
- ✅ Cinematic intro card (brand lockup + stats)
- ✅ Live flight HUD (time, distance, altitude, date)
- ✅ Pulsing marker with energy rings
- ✅ Aurora ribbon progress line effect
- ✅ CloudKit/Files integration for sharing
- ✅ Generate in MP4 format
- ✅ Portrait video (9:16 aspect ratio)

---

## 🎯 User Experience Flow

```
RunSummaryView
  ↓
"Share Run Video" button
  ↓
RunVideoScreen (WebView/Native hybrid)
  ├─ Load run data from API
  ├─ Initialize MapLibre map
  ├─ Render to canvas
  ├─ Preview idle state
  │
  ├─ User: "Generate Video"
  │   ├─ Run animation (intro + follow + outro)
  │   ├─ Record frames in real-time
  │   ├─ Show recording progress (%)
  │   ├─ Auto-stop after outro
  │   └─ Save to temp file
  │
  ├─ Video ready
  │   ├─ Show preview
  │   ├─ "Download" button → save to Files app
  │   ├─ "Share" button → iOS share sheet
  │   └─ "Generate Again" button → restart recording
  │
  └─ Share
      ├─ iOS native share sheet
      ├─ Messages, Mail, Instagram, WhatsApp, etc.
      └─ Return to video screen
```

---

## 📱 UI Specifications

### Screen: Run Video Screen

**Layout**:
```
┌──────────────────────────────┐
│ ← Share Run Video    [9:16]  │
│ 3D flyover of your run       │
├──────────────────────────────┤
│                              │
│  ┌──────────────────────┐    │
│  │                      │    │
│  │  [Map Canvas Preview]│    │
│  │  9:16 Portrait       │    │
│  │  Rounded corners     │    │
│  │                      │    │
│  └──────────────────────┘    │
│                              │
│  ✅ Video ready              │ (status badge)
│                              │
│  ┌──────────────────────┐    │
│  │  Download Video      │    │ (teal button)
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  Share Video         │    │ (outlined)
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  Generate Again      │    │ (ghost)
│  └──────────────────────┘    │
│                              │
│  A 3D drone-style flyover… │ (info text)
│                              │
└──────────────────────────────┘
```

**Components**:
- **Header**: Back button + title + description
- **Preview Canvas**: 9:16 portrait map/animation display (rounded corners, shadow)
- **Status Badge**: Shows recording/playing/done/error state with progress %
- **Action Buttons**: Download, Share, Generate Again (state-dependent)
- **Info Text**: Explains the feature at bottom

### Status Badge States

**Idle**:
```
[Generate Video] [Checking video support…]
```

**Recording** (red):
```
🔴 Generating video… 45%
```

**Playing** (blue):
```
▶️ Playing preview… 72%
```

**Done** (green):
```
✅ Video ready — save or share it below
```

**Error** (red):
```
⚠️ Recording failed — please try again
[Technical error details in small text]
```

### Button States

| State | Generate Button | Download | Share | Generate Again |
|-------|---|---|---|---|
| **Idle** (no video) | ✅ Enabled (Teal) | ❌ Disabled | ❌ Disabled | ❌ Disabled |
| **Recording** | ❌ Disabled | ❌ Disabled | ❌ Disabled | ❌ Disabled |
| **Playing** | ❌ Disabled | ❌ Disabled | ❌ Disabled | ❌ Disabled |
| **Done** (video ready) | ❌ Hidden | ✅ Enabled | ✅ Enabled | ✅ Enabled (Ghost) |
| **Error** | ✅ Re-enabled | ❌ Disabled | ❌ Disabled | ❌ Disabled |

---

## 🏗️ Architecture

### Data Flow

```
1. Load Run Data
   ↓
   GET /api/runs/:runId
   ↓
   Returns RunSession with:
   - distance, duration, totalTime
   - routePoints: [{ latitude, longitude, timestamp, altitude }]
   - completedAt (date)
   - avgPace, totalElevationGain
   ↓

2. Initialize Map
   ↓
   MapLibre GL with:
   - ESRI satellite imagery tiles
   - AWS terrarium terrain tiles
   - Terrain exaggeration (2.4x)
   - Sky gradient
   ↓

3. Prepare Route
   ↓
   - Smooth GPS coordinates with 3-point moving average
   - Calculate cumulative distances
   - Calculate elapsed-time fractions from timestamps
   - Smooth altitude profile
   ↓

4. Render & Record
   ↓
   - Render map to WebGL canvas
   - Draw 2D overlays on separate canvas
   - Composite both to recording canvas
   - Encode frames at 30fps
   - Mux to MP4 with correct timestamps
   ↓

5. Save & Share
   ↓
   - Write MP4 to temp file
   - Present iOS share sheet
   - User selects app (Messages, Mail, WhatsApp, etc.)
   - Or save to Files app
```

### Core Components

#### 1. RunVideoViewController (Main)
Manages the overall screen, loads data, initializes map.

```swift
class RunVideoViewController: UIViewController {
    @IBOutlet weak var canvasView: UIView!
    @IBOutlet weak var statusBadge: UIView!
    @IBOutlet weak var generateButton: UIButton!
    @IBOutlet weak var downloadButton: UIButton!
    @IBOutlet weak var shareButton: UIButton!
    
    var runId: String
    var runData: RunSession?
    var mapView: MGLMapView?
    var compositorCanvas: CADisplayLink?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        loadRunData()
        initializeMap()
    }
    
    func loadRunData() async {
        do {
            runData = try await apiService.getRun(runId)
            prepareRoute()
            initializeMap()
        } catch {
            showError("Failed to load run")
        }
    }
    
    func initializeMap() {
        // Initialize MapLibre with satellite tiles + terrain
        // Set initial zoom/pitch/bearing
        // Wait for "map ready" before allowing recording
    }
}
```

#### 2. RouteProcessor
Processes GPS coordinates and generates the animation timeline.

```swift
struct RouteProcessor {
    var coordinates: [[Double]]  // [[lng, lat], ...]
    var timestamps: [TimeInterval]
    var altitudes: [Double]?
    
    // Smooth GPS jitter
    func smoothPath() -> [[Double]]
    
    // Calculate cumulative distances
    func calculateDistances() -> [Double]
    
    // Normalize timestamps to 0..1 fraction
    func calculateTimeFractions() -> [Double]?
    
    // Smooth altitude profile
    func smoothAltitudes() -> [Double]?
    
    // Interpolate position at distance
    func interpolate(distance: Double) -> CLLocationCoordinate2D
}
```

#### 3. VideoGenerator
Handles the animation loop and frame recording.

```swift
class VideoGenerator {
    var status: VideoStatus = .idle
    var progress: CGFloat = 0
    
    // Timeline: intro → follow → outro
    let INTRO_MS = 2200
    let FOLLOW_MS_BASE = 18000  // scales with run distance
    let OUTRO_MS = 3400
    let HOLD_MS = 1400
    
    func startRecording() async throws {
        status = .recording
        
        // Initialize encoder
        // Start animation loop at 30 fps
        // Encode each frame
        // Stop after outro + hold
        
        let video = try await finishEncoding()
        try video.save(to: tempFile)
        status = .done
    }
    
    func updateFrame(at progress: CGFloat, time: TimeInterval) {
        // Intro phase: tilt + zoom into start
        // Follow phase: drone chase with lookahead
        // Outro phase: pull up to reveal whole route
        // Draw markers, pulse rings, overlay
    }
}
```

#### 4. CanvasCompositor
Draws map + overlays to a single recording canvas.

```swift
class CanvasCompositor {
    var mapCanvas: CALayer     // MapLibre WebGL output
    var overlayCanvas: CALayer // 2D graphics (intro card, HUD)
    var recordingCanvas: CALayer // composited result for recording
    
    func compositeFrame(mapImage: CGImage, overlayImage: CGImage) -> CGImage {
        // Create new bitmap context
        // Draw map with cinematic color grading
        // Draw atmospheric haze
        // Draw vignette
        // Draw overlays
        // Return composited image
    }
}
```

#### 5. OverlayRenderer
Draws the 2D overlay (intro card and flight HUD).

```swift
class OverlayRenderer {
    var canvasSize = CGSize(width: 1080, height: 1920)
    
    func drawOverlay(
        ctx: CGContext,
        routeProgress: CGFloat,
        elapsed: TimeInterval,
        runData: RunSession,
        units: UnitLength
    ) {
        // Draw intro card (cross-fade out)
        drawIntroCard(ctx, fade: introFade)
        
        // Draw flight HUD (cross-fade in)
        drawFlightHUD(ctx, fade: hudFade)
        
        // Draw progress bar (always)
        drawProgressBar(ctx, progress: routeProgress)
    }
    
    private func drawIntroCard(_ ctx: CGContext, fade: CGFloat) {
        // Scrim background
        // "AI RUN COACH" text (teal, bold)
        // Run name
        // Distance (hero, large)
        // Time + avg pace (secondary stats)
    }
    
    private func drawFlightHUD(_ ctx: CGContext, fade: CGFloat) {
        // Top-left brand lockup
        // Bottom glass stat panel
        //   - TIME (real elapsed at marker)
        //   - DISTANCE (hero stat, large)
        //   - ALTITUDE (real per-point or interpolated)
        // Date at bottom
    }
}
```

---

## 🎬 Animation Timeline

### Overview
```
Total Duration: INTRO_MS + FOLLOW_MS + OUTRO_MS + HOLD_MS

INTRO_MS (2200ms)
├─ 0ms to 700ms: Slow ease-out cubic tilt/zoom into start
├─ Cross-fade: Title card → flight HUD
└─ Camera frames the start point

FOLLOW_MS (varies with distance)
├─ Drone follows runner along route
├─ Lookahead distance: 95m
├─ Camera smoothing: low (0.09 per frame)
├─ Bearing smoothing: very low (0.04)
├─ Marker pulses with energy rings
└─ Progress line trails behind

OUTRO_MS (3400ms)
├─ Pull up and out to reveal full route
├─ Ease-out cubic camera transition
└─ Marker at finish point, pulsing

HOLD_MS (1400ms)
├─ Final frame held
└─ Record stops, MP4 finalized
```

### Camera Movement

**Intro Phase**:
```swift
let t = currentTime / INTRO_MS
let easeT = 1 - pow(1 - t, 3)  // ease-out cubic

camera.position = interpAt(0)  // start point
camera.zoom = 13.4 + (FOLLOW_ZOOM - 13.4) * easeT
camera.pitch = 38 + (FOLLOW_PITCH - 38) * easeT
camera.bearing = initialBearing
```

**Follow Phase** (drone chase):
```swift
let d = routeProgress * totalDistance
let headPos = interpAt(d)
let lookaheadPos = interpAt(d + LOOKAHEAD_M)

// Smooth chase with easing
cameraCenter += (lookaheadPos - cameraCenter) * 0.09
cameraBearing = lerpAngle(cameraBearing, targetBearing, 0.04)

map.flyTo(center: cameraCenter, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH)
```

**Outro Phase**:
```swift
let k = (currentTime - INTRO_MS - FOLLOW_MS) / OUTRO_MS
let easeK = 1 - pow(1 - k, 3)

camera.center = lerp(lastFollowPos, overviewCenter, easeK)
camera.zoom = lerp(FOLLOW_ZOOM, overviewZoom, easeK)
camera.pitch = lerp(FOLLOW_PITCH, 24, easeK)
camera.bearing = lerpAngle(lastBearing, 0, easeK)
```

---

## 🎨 Visual Design

### Color Palette

| Element | Color | Usage |
|---------|-------|-------|
| **Brand Teal** | `#00BFFF` | Buttons, accents, glow effects |
| **Teal Glow** | `rgba(0,191,255,0.35)` | Shadow/blur for depth |
| **White** | `#ffffff` | Text, markers, core highlight |
| **Background** | `#0a0a0f` | Canvas, panel backgrounds |
| **Scrim** | `rgba(3,6,14,0.6)` | Intro card overlay |

### Map Styling

| Layer | Style |
|-------|-------|
| **Satellite** | ESRI World Imagery (zoom 13-19) |
| **Terrain** | AWS Terrarium (exaggeration 2.4x) |
| **Sky** | Gradient (blue → white) |
| **Route (full)** | White line, 22% opacity |
| **Route (progress)** | Aurora effect: glow + teal body + white core |
| **Marker** | Pulsing energy rings + glow + white dot |

### Aurora Ribbon Effect

The progress line has three layers:
1. **Glow**: Wide soft blur (line-width: 34, blur: 26, opacity: 0.5)
2. **Body**: Teal line (line-width: 12)
3. **Core**: Bright white (line-width: 4, opacity: 0.9)

This creates a luminous "aurora" effect that trails the marker.

### Marker Pulse Animation

```swift
let pulsePeriod = 1600.0  // ms
let p1 = (time % pulsePeriod) / pulsePeriod
let p2 = ((time + pulsePeriod / 2) % pulsePeriod) / pulsePeriod

// Ring 1: expands + fades
ringRadius1 = 12 + p1 * 48
ringOpacity1 = 0.6 * (1 - p1)

// Ring 2: offset by half period
ringRadius2 = 12 + p2 * 48
ringOpacity2 = 0.45 * (1 - p2)
```

---

## 🔗 API Integration

### Single Endpoint Required

```
GET /api/runs/:runId

Headers:
  Authorization: Bearer {token}

Response:
{
  "id": "run-uuid-123",
  "distance": 5000,          // meters
  "duration": 1653,          // seconds
  "totalTime": 1653,         // seconds
  "totalElevationGain": 47,  // meters
  "averagePace": "5:31",     // min:sec per km
  "completedAt": "2026-07-20T06:27:33Z",
  "routePoints": [
    {
      "latitude": 40.7829,
      "longitude": -73.9654,
      "timestamp": 1721475600000,  // ms since epoch
      "altitude": 10.5             // meters above sea level
    },
    ...
  ],
  "movingTime": 1653,
  ...other run fields...
}
```

**Note**: Auth token must be injected into localStorage before API calls from WebView.

---

## 💾 Video Encoding

### Format
- **Codec**: H.264 (AVC)
- **Container**: MP4
- **Resolution**: 1080×1920 (portrait, 9:16)
- **Frame Rate**: 30 fps
- **Bitrate**: 8 Mbps
- **Duration**: ~25-60 seconds (varies by distance)

### Encoding Paths

#### 1. Preferred: WebCodecs API
```swift
// Initialize encoder
let config = VideoEncoderConfig(
    codec: "avc1.42E029",
    width: 1080,
    height: 1920,
    bitrate: 8_000_000,
    frameRate: 30
)
let encoder = VideoEncoder(config: config)

// For each frame at 30fps:
let frame = VideoFrame(from: canvas, timestamp: currentTime * 1000)
try encoder.encode(frame)

// When done:
let data = muxer.finalize()
let mp4 = Data(data)
```

#### 2. Fallback: AVAssetWriter
```swift
let writer = AVAssetWriter(outputURL: tempURL, fileType: .mp4)
let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
writer.add(videoInput)

for frame in frames {
    let sampleBuffer = try CMSampleBufferFactory.makeSampleBuffer(from: frame)
    videoInput.append(sampleBuffer)
}

writer.finishWriting()
```

---

## 🔄 Recording Process

### Frame Loop (30fps)

```swift
class RecordingLoop {
    let displayLink: CADisplayLink?
    
    init(onFrame: @escaping (TimeInterval) -> Void) {
        displayLink = CADisplayLink(
            target: self,
            selector: #selector(updateFrame)
        )
    }
    
    @objc func updateFrame() {
        let elapsed = CACurrentMediaTime() - startTime
        
        // 1. Calculate animation progress
        let routeProgress = calculateProgress(elapsed)
        
        // 2. Update map camera
        updateCamera(routeProgress: routeProgress)
        
        // 3. Draw overlays
        let overlayImage = drawOverlay(routeProgress: routeProgress, elapsed: elapsed)
        
        // 4. Composite map + overlay
        let frame = compositeFrame(overlayImage: overlayImage)
        
        // 5. Encode frame
        try encoder.encode(frame)
        
        // 6. Check if done
        if elapsed > totalDuration {
            stop()
        }
    }
}
```

---

## 📲 File Management & Sharing

### Save to Files App

```swift
func downloadVideo(_ videoURL: URL) {
    let documentsURL = FileManager.default.urls(
        for: .documentDirectory,
        in: .userDomainMask
    )[0]
    
    let destinationURL = documentsURL.appendingPathComponent(
        "run-summary-\(runId).mp4"
    )
    
    try FileManager.default.copyItem(at: videoURL, to: destinationURL)
    
    // User can now access via Files app
}
```

### Share via iOS Share Sheet

```swift
func shareVideo(_ videoURL: URL) {
    let activityController = UIActivityViewController(
        activityItems: [videoURL],
        applicationActivities: nil
    )
    
    activityController.completionWithItemsHandler = { activity, success, items, error in
        if success {
            print("Shared to: \(activity?.rawValue ?? "unknown")")
        }
    }
    
    present(activityController, animated: true)
}
```

**Compatible Apps**:
- Messages
- Mail
- iCloud Drive
- Google Drive
- Dropbox
- Instagram (requires iOS Photos access)
- WhatsApp
- TikTok
- Facebook

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] RouteProcessor — smoothing, distance calculation, interpolation
- [ ] TimeFraction calculation — monotonic increasing, bounds [0,1]
- [ ] Altitude smoothing — handles null/missing data
- [ ] Bearing interpolation — handles 359°→1° wrap
- [ ] Camera easing functions — ease-out cubic values
- [ ] Overlay rendering — intro/HUD cross-fade timing
- [ ] Progress bar calculation — 0..1 progress → correct width

### Integration Tests
- [ ] Load run with valid GPS track → map initializes
- [ ] Load run without GPS track → shows "no track" message
- [ ] Record video → MP4 created with correct dimensions
- [ ] Record video → frame count matches duration × 30fps
- [ ] Share video → iOS share sheet appears
- [ ] Download video → file saved to Documents folder
- [ ] Generate again → invalidates previous video, creates new one
- [ ] Stop recording → stops animation and encoder
- [ ] Error handling → recovers gracefully, can retry

### E2E Tests

**Scenario 1: Successful Video Generation**
1. [ ] Tap "Share Run Video" on run summary
2. [ ] Video screen loads with map preview
3. [ ] Tap "Generate Video"
4. [ ] Status shows "Generating video… 0%"
5. [ ] Progress increases over ~25 seconds
6. [ ] Status changes to "✅ Video ready"
7. [ ] Buttons appear: Download, Share, Generate Again

**Scenario 2: Share to Messages**
1. [ ] Video ready (completed generation)
2. [ ] Tap "Share Video"
3. [ ] iOS share sheet appears
4. [ ] Select "Messages"
5. [ ] Message composer opens with video attached
6. [ ] Can select recipient and send
7. [ ] Return to video screen

**Scenario 3: Download to Files**
1. [ ] Video ready
2. [ ] Tap "Download Video"
3. [ ] Video saved to Documents
4. [ ] Open Files app → Documents folder
5. [ ] See `run-summary-{runId}.mp4` file
6. [ ] Can open, play, or share from Files

**Scenario 4: Preview without Recording**
1. [ ] Generate Video not yet tapped
2. [ ] Status shows "Generate Video" button
3. [ ] Map shows idle frame (zoomed to start)
4. [ ] Can tap Generate to start recording

**Scenario 5: Successful MP4 Export and Share**
1. [ ] Video generation completes
2. [ ] MP4 file created at correct 1080×1920 resolution
3. [ ] Video duration matches animation timeline
4. [ ] Tap "Download Video" → saved to Files app
5. [ ] Tap "Share Video" → iOS share sheet appears
6. [ ] Can select Messages, Mail, Instagram, WhatsApp, etc.
7. [ ] Video plays correctly in native player

---

## 🎬 Animation Tuning

### Distance-Scaled Follow Duration

```swift
let followMsForMeters = { (meters: Double) in
    let km = max(0.5, (meters > 0 ? meters : 3000) / 1000)
    return Int(min(60_000, max(12_000, 18_000 * sqrt(km / 3))))
}

// Examples:
// 3 km → ~18s
// 5 km → ~23s
// 10 km → ~33s
// 21 km (half) → ~48s
// 42 km (full) → ~60s (capped)
```

This ensures:
- Short runs don't feel rushed
- Long runs don't drag
- All videos are watchable (12-60 seconds total)

### Camera Tuning Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **FOLLOW_ZOOM** | 16.6 | Closer = lower apparent altitude + more terrain |
| **FOLLOW_PITCH** | 76° | Near-horizon drone angle |
| **LOOKAHEAD_M** | 95m | How far ahead camera looks |
| **POS_SMOOTH** | 0.09 | Camera position easing per frame |
| **BRG_SMOOTH** | 0.04 | Camera bearing easing per frame |
| **SUPERSAMPLE** | 1.25 | Render at 1.25× then downscale for crispness |
| **PULSE_MS** | 1600ms | Marker energy ring pulse period |

---

## ⚠️ Important Implementation Notes

### MapKit Integration (Native iOS Alternative)

Since WebGL isn't available natively on iOS, use **MapKit** with tile rendering:

```swift
import MapKit

class MapKitVideoRenderer: NSObject, MKMapViewDelegate {
    let mapView: MKMapView
    
    func initializeMap(withRoute coordinates: [CLLocationCoordinate2D]) {
        // Configure map
        mapView.mapType = .satellite // Satellite imagery
        mapView.camera.altitude = 2500 // Drone-like altitude
        mapView.camera.pitch = 76 // Near-horizon angle
        
        // Add overlay for route
        let polyline = MKPolyline(coordinates: coordinates, count: coordinates.count)
        mapView.addOverlay(polyline)
        
        // Set region to fit route
        let region = calculateRegion(for: coordinates)
        mapView.setRegion(region, animated: false)
    }
    
    // Render map to image for recording
    func renderToImage(size: CGSize) -> UIImage? {
        let bounds = CGRect(origin: .zero, size: size)
        let renderer = MKMapSnapshotter(mapRect: mapView.visibleMapRect, size: size)
        
        var snapshot: MKMapSnapshot?
        var error: Error?
        
        let semaphore = DispatchSemaphore(value: 0)
        renderer.start { snap, err in
            snapshot = snap
            error = err
            semaphore.signal()
        }
        
        semaphore.wait()
        
        guard let snapshot = snapshot else { return nil }
        return snapshot.image
    }
}
```

**Alternative: Use Web-based MapLibre in WKWebView**

If native MapKit doesn't meet requirements, use a WebView with the existing JavaScript MapLibre implementation:

```swift
import WebKit

class MapLibreWebViewRenderer {
    let webView: WKWebView
    
    func initialize(withRun run: RunSession) {
        let html = generateMapLibreHTML(run: run)
        webView.loadHTMLString(html, baseURL: nil)
    }
    
    func renderToImage(completion: @escaping (UIImage?) -> Void) {
        webView.takeSnapshot(with: nil) { image, error in
            completion(image)
        }
    }
    
    private func generateMapLibreHTML(run: RunSession) -> String {
        // Load the existing MapLibre implementation and adapt it for iOS WebView
        // Include MapLibre GL JS, style definition, route data
        return """
        <html>
        <head>
            <script src='https://cdn.jsdelivr.net/npm/maplibre-gl@latest/dist/maplibre-gl.js'></script>
            <link href='https://cdn.jsdelivr.net/npm/maplibre-gl@latest/dist/maplibre-gl.css' rel='stylesheet' />
        </head>
        <body>
            <div id="map" style="width:100%;height:100%;"></div>
            <script>
                // Initialize map with route...
                // Same logic as Android web implementation
            </script>
        </body>
        </html>
        """
    }
}
```

**Recommended Approach**: WKWebView with MapLibre GL
- Reuses the proven Android web implementation
- Handles all complex map rendering in JavaScript
- iOS WebView support is solid and well-tested
- Can capture WebView to UIImage for frame recording

### WebCodecs Fallback Strategy
1. **On app launch**: Run self-test to find working codec
2. **Store working codec ID** (e.g., "avc1.42E029")
3. **Reuse same codec** for all videos (avoids re-testing)
4. **Fallback to AVAssetWriter** if WebCodecs unavailable
   - Older iOS versions (< 15) may not support WebCodecs
   - Graceful degradation is critical for user experience

### Frame Timestamp Precision
- **Critical**: Every frame MUST have an explicit duration
- Missing duration → muxer drops frame → video duration wrong
- Frame duration: 1/30s = ~33.33ms = 33333 microseconds
- Use explicit timestamps: `frame.timestamp = (frameIndex * 1_000_000) / 30`

### Smooth Path Processing
- Apply 3-point moving average to GPS coordinates
- Preserves start/end points exactly
- Reduces jitter without losing sharp turns
- Critical for smooth camera motion

### Route Validation
- Minimum 2 points required for a valid route
- Minimum 50m total distance (else "no track" message)
- Duplicate points → zero distance segments → skip
- Altitude data optional (fallback to linear elevation gain)

### Native iOS Video Encoding

**MediaRecorder Approach** (Recommended for iOS):

```swift
import AVFoundation

class VideoEncoderAVAssetWriter {
    var assetWriter: AVAssetWriter?
    var videoInput: AVAssetWriterInput?
    var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?
    
    func setup(width: Int, height: Int, outputURL: URL) throws {
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
        
        let outputSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 8_000_000,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCAVLC,
            ]
        ]
        
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: outputSettings)
        videoInput.expectsMediaDataInRealTime = false
        
        let pixelBufferAttrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
        ]
        
        let pixelBufferAdaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: videoInput,
            sourcePixelBufferAttributes: pixelBufferAttrs
        )
        
        writer.add(videoInput)
        self.assetWriter = writer
        self.videoInput = videoInput
        self.pixelBufferAdaptor = pixelBufferAdaptor
    }
    
    func startWriting() throws {
        guard let writer = assetWriter else { throw EncodingError.notInitialized }
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)
    }
    
    func addFrame(from cgImage: CGImage, at frameIndex: Int, frameRate: Int32) throws {
        guard let adaptor = pixelBufferAdaptor,
              let videoInput = videoInput else {
            throw EncodingError.notInitialized
        }
        
        let timestamp = CMTime(value: CMTimeValue(frameIndex), timescale: frameRate)
        
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, adaptor.pixelBufferPool!, &pixelBuffer)
        guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
            throw EncodingError.bufferCreationFailed
        }
        
        // Draw CGImage into pixel buffer
        CVPixelBufferLockBaseAddress(buffer, .readAndWriteOptions)
        if let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer),
                                   width: CVPixelBufferGetWidth(buffer),
                                   height: CVPixelBufferGetHeight(buffer),
                                   bitsPerComponent: 8,
                                   bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
                                   space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue) {
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer)))
        }
        CVPixelBufferUnlockBaseAddress(buffer, .readAndWriteOptions)
        
        // Append to writer
        if videoInput.isReadyForMoreMediaData {
            adaptor.append(buffer, withPresentationTime: timestamp)
        } else {
            while !videoInput.isReadyForMoreMediaData {
                Thread.sleep(forTimeInterval: 0.001)
            }
            adaptor.append(buffer, withPresentationTime: timestamp)
        }
    }
    
    func finishWriting() async throws -> URL? {
        guard let writer = assetWriter, let videoInput = videoInput else {
            throw EncodingError.notInitialized
        }
        
        videoInput.markAsFinished()
        
        return await withCheckedThrowingContinuation { continuation in
            writer.finishWriting {
                if writer.status == .completed {
                    continuation.resume(returning: writer.outputURL)
                } else {
                    continuation.resume(throwing: writer.error ?? EncodingError.finalizingFailed)
                }
            }
        }
    }
}

enum EncodingError: Error {
    case notInitialized
    case bufferCreationFailed
    case finalizingFailed
}
```

**Canvas Rendering (Core Graphics)**:

```swift
class CanvasRenderer {
    let width: Int
    let height: Int
    
    func renderComposite(mapImage: UIImage, overlayImage: UIImage) -> CGImage? {
        let size = CGSize(width: width, height: height)
        
        // Create rendering context
        UIGraphicsBeginImageContextWithOptions(size, true, 1.0)
        defer { UIGraphicsEndImageContext() }
        
        guard let context = UIGraphicsGetCurrentContext() else { return nil }
        
        // Background
        UIColor(hex: "#05070d").setFill()
        context.fill(CGRect(origin: .zero, size: size))
        
        // Draw map image
        if let cgImage = mapImage.cgImage {
            context.draw(cgImage, in: CGRect(origin: .zero, size: size))
        }
        
        // Apply cinematic color grading (filter)
        // Saturation 1.22, contrast 1.08, brightness 1.03
        applyColorGrade(context: context, width: width, height: height)
        
        // Draw atmospheric haze
        drawHaze(context: context, width: width, height: height)
        
        // Draw vignette
        drawVignette(context: context, width: width, height: height)
        
        // Composite overlay
        if let cgImage = overlayImage.cgImage {
            context.draw(cgImage, in: CGRect(origin: .zero, size: size))
        }
        
        return UIGraphicsGetImageFromCurrentImageContext()?.cgImage
    }
    
    private func applyColorGrade(context: CGContext, width: Int, height: Int) {
        // Apply saturation, contrast, brightness filters
        // This is simplified; for production, consider Metal shaders for performance
    }
    
    private func drawHaze(context: CGContext, width: Int, height: Int) {
        let haze = UIImage.createGradient(
            size: CGSize(width: width, height: height / 2),
            colors: [
                UIColor(hex: "#7aaaCA", alpha: 0.42).cgColor,
                UIColor(hex: "#7aaaCA", alpha: 0.10).cgColor,
                UIColor(hex: "#7aaaCA", alpha: 0.0).cgColor
            ],
            locations: [0, 0.5, 1]
        )
        if let cgImage = haze.cgImage {
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height / 2))
        }
    }
    
    private func drawVignette(context: CGContext, width: Int, height: Int) {
        // Draw radial gradient vignette at bottom
        let gradient = CGGradient(
            colorSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [
                UIColor.clear.cgColor,
                UIColor(hex: "#030510", alpha: 0.55).cgColor
            ] as CFArray,
            locations: [0, 1]
        )
        guard let grad = gradient else { return }
        
        context.drawRadialGradient(
            grad,
            startCenter: CGPoint(x: CGFloat(width) / 2, y: CGFloat(height) * 0.46),
            startRadius: CGFloat(width) * 0.30,
            endCenter: CGPoint(x: CGFloat(width) / 2, y: CGFloat(height) * 0.5),
            endRadius: CGFloat(height) * 0.72,
            options: .drawsAfterEndLocation
        )
    }
}
```

**Overlay Drawing (2D Graphics)**:

```swift
class OverlayRenderer {
    let canvasWidth: Int
    let canvasHeight: Int
    
    func drawOverlay(
        routeProgress: CGFloat,
        elapsedTime: TimeInterval,
        runData: RunSession,
        units: String
    ) -> UIImage? {
        let size = CGSize(width: canvasWidth, height: canvasHeight)
        UIGraphicsBeginImageContextWithOptions(size, false, 1.0)
        defer { UIGraphicsEndImageContext() }
        
        guard let context = UIGraphicsGetCurrentContext() else { return nil }
        
        // Cross-fade: intro → HUD
        let introFade = max(0, min(1, (2200 - elapsedTime) / 500)) // intro duration 2200ms, fade window 500ms
        let hudFade = 1 - introFade
        
        if introFade > 0.01 {
            drawIntroCard(context, fade: introFade, runData: runData)
        }
        
        if hudFade > 0.01 {
            drawFlightHUD(context, fade: hudFade, routeProgress: routeProgress, elapsedTime: elapsedTime, runData: runData)
        }
        
        // Progress bar (always)
        drawProgressBar(context, routeProgress: routeProgress, units: units)
        
        return UIGraphicsGetImageFromCurrentImageContext()
    }
    
    private func drawIntroCard(_ ctx: CGContext, fade: CGFloat, runData: RunSession) {
        ctx.setAlpha(fade)
        
        // Scrim background (gradient)
        let scrim = UIImage.createGradient(
            size: CGSize(width: canvasWidth, height: canvasHeight),
            colors: [
                UIColor(hex: "#030A0E", alpha: 0.60).cgColor,
                UIColor(hex: "#030A0E", alpha: 0.22).cgColor,
                UIColor(hex: "#030A0E", alpha: 0.60).cgColor
            ],
            locations: [0, 0.5, 1]
        )
        if let cgImage = scrim.cgImage {
            ctx.draw(cgImage, in: CGRect(origin: .zero, size: CGSize(width: canvasWidth, height: canvasHeight)))
        }
        
        // "AI RUN COACH" title
        let titleStr = "AI RUN COACH" as NSString
        let titleFont = UIFont(name: "Inter-Bold", size: 42) ?? UIFont.boldSystemFont(ofSize: 42)
        let titleAttrs: [NSAttributedString.Key: Any] = [
            .font: titleFont,
            .foregroundColor: UIColor(hex: "#00BFFF"),
            .kern: 8.0
        ]
        let titleSize = titleStr.size(withAttributes: titleAttrs)
        titleStr.draw(
            at: CGPoint(x: CGFloat(canvasWidth) / 2 - titleSize.width / 2, y: CGFloat(canvasHeight) * 0.38),
            withAttributes: titleAttrs
        )
        
        // Run name
        let nameStr = runData.name as NSString
        let nameFont = UIFont(name: "Inter-Medium", size: 46) ?? UIFont.systemFont(ofSize: 46, weight: .medium)
        let nameAttrs: [NSAttributedString.Key: Any] = [
            .font: nameFont,
            .foregroundColor: UIColor(hex: "#FFFFFF", alpha: 0.9)
        ]
        let nameSize = nameStr.size(withAttributes: nameAttrs)
        nameStr.draw(
            at: CGPoint(x: CGFloat(canvasWidth) / 2 - nameSize.width / 2, y: CGFloat(canvasHeight) * 0.45),
            withAttributes: nameAttrs
        )
        
        // Distance (hero stat)
        let distStr = String(format: "%.2f", runData.distance / 1000) as NSString
        let distFont = UIFont(name: "Inter-Bold", size: 210) ?? UIFont.boldSystemFont(ofSize: 210)
        let distAttrs: [NSAttributedString.Key: Any] = [
            .font: distFont,
            .foregroundColor: UIColor.white,
            .shadow: NSShadow() // Apply teal glow shadow
        ]
        let distSize = distStr.size(withAttributes: distAttrs)
        distStr.draw(
            at: CGPoint(x: CGFloat(canvasWidth) / 2 - distSize.width / 2, y: CGFloat(canvasHeight) * 0.60),
            withAttributes: distAttrs
        )
        
        // Secondary stats (time, pace)
        drawSecondaryStats(ctx, y: canvasHeight * 0.72, runData: runData)
    }
    
    private func drawFlightHUD(_ ctx: CGContext, fade: CGFloat, routeProgress: CGFloat, elapsedTime: TimeInterval, runData: RunSession) {
        ctx.setAlpha(fade)
        
        // Top-left brand lockup
        let hudX: CGFloat = 82
        let hudY: CGFloat = 68
        
        let lockupStr = "AI RUN COACH" as NSString
        let lockupFont = UIFont(name: "Inter-Bold", size: 30) ?? UIFont.boldSystemFont(ofSize: 30)
        let lockupAttrs: [NSAttributedString.Key: Any] = [
            .font: lockupFont,
            .foregroundColor: UIColor(hex: "#FFFFFF", alpha: 0.92),
            .kern: 3.0
        ]
        lockupStr.draw(at: CGPoint(x: hudX, y: hudY), withAttributes: lockupAttrs)
        
        // Bottom glass stat panel
        let panelPadding: CGFloat = 40
        let panelHeight: CGFloat = 250
        let panelY: CGFloat = CGFloat(canvasHeight) - panelHeight - 56
        let panelWidth: CGFloat = CGFloat(canvasWidth) - panelPadding * 2
        
        // Draw rounded rect panel with border
        let panelRect = CGRect(x: panelPadding, y: panelY, width: panelWidth, height: panelHeight)
        let path = UIBezierPath(roundedRect: panelRect, cornerRadius: 34)
        UIColor(hex: "#060B16", alpha: 0.55).setFill()
        path.fill()
        UIColor(hex: "#00BFFF", alpha: 0.35).setStroke()
        path.lineWidth = 2
        path.stroke()
        
        // Stats (time, distance, altitude)
        let stats = [
            ("TIME", String(format: "%02d:%02d", Int(elapsedTime) / 60, Int(elapsedTime) % 60), "", false),
            ("DISTANCE", String(format: "%.2f", runData.distance * routeProgress / 1000), "km", true),
            ("ALTITUDE", String(format: "%.0f", runData.totalElevationGain * routeProgress), "m", false)
        ]
        
        let colWidth = panelWidth / 3
        for (i, stat) in stats.enumerated() {
            let colX = panelPadding + colWidth * CGFloat(i) + colWidth / 2
            let (label, value, unit, isHero) = stat
            
            // Label
            let labelStr = label as NSString
            let labelFont = UIFont(name: "Inter-SemiBold", size: 26) ?? UIFont.systemFont(ofSize: 26, weight: .semibold)
            let labelAttrs: [NSAttributedString.Key: Any] = [
                .font: labelFont,
                .foregroundColor: UIColor(hex: "#00BFFF"),
                .kern: 3.0
            ]
            labelStr.draw(at: CGPoint(x: colX - 20, y: panelY + 60), withAttributes: labelAttrs)
            
            // Value
            let valueStr = value as NSString
            let valueSize = isHero ? 106 : 78
            let valueFont = UIFont(name: "Inter-Bold", size: CGFloat(valueSize)) ?? UIFont.boldSystemFont(ofSize: CGFloat(valueSize))
            let valueAttrs: [NSAttributedString.Key: Any] = [
                .font: valueFont,
                .foregroundColor: UIColor.white
            ]
            valueStr.draw(at: CGPoint(x: colX - 50, y: panelY + (isHero ? 152 : 142)), withAttributes: valueAttrs)
            
            // Unit
            if !unit.isEmpty {
                let unitStr = unit as NSString
                let unitFont = UIFont(name: "Inter-Regular", size: 26) ?? UIFont.systemFont(ofSize: 26)
                let unitAttrs: [NSAttributedString.Key: Any] = [
                    .font: unitFont,
                    .foregroundColor: UIColor(hex: "#FFFFFF", alpha: 0.55)
                ]
                unitStr.draw(at: CGPoint(x: colX - 20, y: panelY + 194), withAttributes: unitAttrs)
            }
        }
    }
    
    private func drawProgressBar(_ ctx: CGContext, routeProgress: CGFloat, units: String) {
        // Background bar
        ctx.setFillColor(UIColor(hex: "#FFFFFF", alpha: 0.12).cgColor)
        ctx.fill(CGRect(x: 0, y: CGFloat(canvasHeight) - 6, width: CGFloat(canvasWidth), height: 6))
        
        // Progress bar
        let progressWidth = CGFloat(canvasWidth) * routeProgress
        ctx.setFillColor(UIColor(hex: "#00BFFF").cgColor)
        ctx.setShadow(offset: CGSize(width: 0, height: 0), blur: 16, color: UIColor(hex: "#00BFFF", alpha: 0.35).cgColor)
        ctx.fill(CGRect(x: 0, y: CGFloat(canvasHeight) - 6, width: progressWidth, height: 6))
    }
    
    private func drawSecondaryStats(_ ctx: CGContext, y: CGFloat, runData: RunSession) {
        // Time and pace stats below the hero distance
        // Implementation similar to above
    }
}
```

---

## 🎥 Complete Video Generation Workflow

### End-to-End Process

```
1. User taps "Share Run Video"
   ↓
2. Load run GPS data from API
   ↓
3. Initialize MapLibre (in WebView) or MapKit
   ↓
4. Process GPS coordinates (smooth, calculate distances)
   ↓
5. Set up video encoder (AVAssetWriter)
   ↓
6. Start animation loop at 30fps
   ↓
   For each frame (25-60 seconds):
   ├─ Calculate animation progress (intro/follow/outro)
   ├─ Update map camera position
   ├─ Render map to UIImage (capture WebView or MapKit)
   ├─ Draw 2D overlay (intro card or flight HUD)
   ├─ Composite map + overlay
   ├─ Add frame to video encoder
   └─ Update progress UI
   ↓
7. Finalize video file
   ↓
8. Save to Documents or temp directory
   ↓
9. Show download/share options
```

### Frame-by-Frame Encoding Flow

```swift
class VideoRecordingSession {
    let encoder: VideoEncoderAVAssetWriter
    let mapRenderer: MapLibreWebViewRenderer  // or MapKit renderer
    let overlayRenderer: OverlayRenderer
    let canvasRenderer: CanvasRenderer
    
    var frameIndex = 0
    let frameRate: Int32 = 30
    
    func startRecording(outputURL: URL) async throws {
        try encoder.setup(width: 1080, height: 1920, outputURL: outputURL)
        try encoder.startWriting()
        
        // Schedule animation loop
        scheduleAnimationLoop()
    }
    
    func onFrameTimer(elapsed: TimeInterval) {
        let routeProgress = calculateRouteProgress(elapsed: elapsed)
        
        // 1. Render map to image
        mapRenderer.renderToImage { [weak self] mapImage in
            guard let self = self, let mapImage = mapImage else { return }
            
            // 2. Render overlay
            let overlayImage = self.overlayRenderer.drawOverlay(
                routeProgress: routeProgress,
                elapsedTime: elapsed,
                runData: self.runData,
                units: "km"
            )
            
            // 3. Composite map + overlay
            let frame = self.canvasRenderer.renderComposite(
                mapImage: mapImage,
                overlayImage: overlayImage ?? UIImage()
            )
            
            // 4. Add frame to encoder
            if let cgImage = frame {
                try? self.encoder.addFrame(from: cgImage, at: self.frameIndex, frameRate: self.frameRate)
                self.frameIndex += 1
            }
        }
    }
    
    func finishRecording() async throws -> URL? {
        return try await encoder.finishWriting()
    }
}
```

### Timer-Based Frame Loop

```swift
class AnimationLoop {
    var timer: Timer?
    let fps: Int = 30
    let interval: TimeInterval = 1.0 / 30
    
    var startTime: Date?
    var onFrame: ((TimeInterval) -> Void)?
    
    func start() {
        startTime = Date()
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            guard let self = self, let startTime = self.startTime else { return }
            let elapsed = Date().timeIntervalSince(startTime)
            self.onFrame?(elapsed)
        }
    }
    
    func stop() {
        timer?.invalidate()
        timer = nil
    }
}
```

### Critical: Frame Timing Precision

Each frame MUST have an explicit timestamp and duration for the MP4 muxer:
- Frame N timestamp: `(N * 1_000_000) / 30` microseconds
- Frame duration: `1_000_000 / 30` microseconds (≈33,333 µs)

Missing duration → MP4 muxer crashes → empty video file.

---

## 🚀 Implementation Order

### Phase 1: Data & Map Setup (1 day)
1. Create RunVideoViewController with MapLibre integration
2. Implement RouteProcessor (smoothing, distance calc, interpolation)
3. Load run data from API (auth token injection)
4. Display map with satellite + terrain tiles
5. Test map rendering and idle preview

### Phase 2: Animation & Rendering (1 day)
1. Implement VideoGenerator animation loop
2. Create CanvasCompositor for map + overlay compositing
3. Implement OverlayRenderer (intro card + flight HUD)
4. Test preview playback (no recording)
5. Verify camera movements and cross-fades

### Phase 3: Encoding & Export (1 day)
1. Implement WebCodecs encoding path
2. Implement AVAssetWriter fallback
3. Create file saving logic (Documents folder)
4. Test MP4 creation and playback in native player

### Phase 4: Sharing & Polish (1/2 day)
1. Implement iOS share sheet integration
2. Add status badges and error handling
3. UI/UX refinement (button states, animations)
4. Comprehensive testing on real devices

---

## 📚 Reference Materials

### MapLibre GL for iOS
- Documentation: `https://docs.mapbox.com/ios/maps/`
- Installation: CocoaPods or SPM
- Example: `https://github.com/mapbox/mapbox-gl-native-ios`

### Video Encoding
- WebCodecs: `https://www.w3.org/TR/webcodecs/`
- AVFoundation: Apple's native framework (fallback)
- MP4 Muxing: `https://github.com/yoya/mp4-muxer` (if porting JS lib)

### Canvas & Graphics
- Core Graphics (CGContext) for 2D drawing
- Metal for GPU acceleration (optional, complex)
- Core Image for color grading

---

## Summary

**Share Run Video** is a sophisticated video-generation feature with:
- ✅ 3D drone-style flyover animation (MapLibre GL via WKWebView)
- ✅ Cinematic intro + live flight HUD overlays
- ✅ Real-time frame encoding to H.264 MP4 (AVAssetWriter)
- ✅ Seamless iOS sharing (UIActivityViewController)
- ✅ Full GPS track support with smooth path processing

**Technical Implementation**:
- **Map Rendering**: WKWebView hosting MapLibre GL JS (reuses Android web implementation)
- **Overlay Drawing**: Core Graphics (UIGraphics) for 2D text, shapes, gradients
- **Video Encoding**: AVAssetWriter with H.264 codec at 8 Mbps
- **Frame Compositing**: CGImage compositing (map + overlay → final frame)
- **Animation Loop**: Timer-based frame scheduling at 30 fps
- **File Management**: Documents directory storage + UIActivityViewController sharing

**Key Features Implemented**:
- Distance-scaled animation duration (3km → 18s, 10km → 33s, 42km → 60s capped)
- Real elapsed-time display interpolation from GPS timestamps
- Altitude profile smoothing with terrain-aware calculations
- Marker pulse animation with expandin energy rings
- Aurora ribbon progress line effect
- Cinematic color grading (saturation +22%, contrast +8%, brightness +3%)
- Atmospheric haze and vignette effects
- Precise frame timestamps for correct MP4 duration (critical!)

**Timeline**: 3-4 days  
**Complexity**: High (animation, multi-layer rendering, real-time encoding)  
**User Impact**: High (visually stunning, highly shareable — the marquee feature!)

**⚠️ Critical Notes**:
1. Every frame MUST have explicit duration (33,333 µs @ 30fps) or MP4 muxer fails
2. WKWebView snapshot timing is async — use DispatchSemaphore or Combine to synchronize
3. AVAssetWriter expects pixel buffers on the same thread — avoid main thread blocking
4. Test on real devices; simulator performance may not reflect actual encoding speed

Everything is ready to implement! 🎬✨ The Android web version provides a proven reference implementation that iOS can adapt.
