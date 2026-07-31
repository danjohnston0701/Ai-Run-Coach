# iOS "Run with Route" Experience — Technical & Design Brief
**For Xcode Agent Implementation**

---

## Executive Summary

This brief provides a **complete technical specification** for building the iOS "Run with Route" experience, including:
1. **Route Setup Screen** — User enters distance preference, receives AI-generated routes
2. **Route Visualization Screen** — Browse and select from 3 generated route options with map preview
3. **Live Run Session Screen** — Real-time run tracking with interactive map, route line, and navigation UI

The design follows Apple's Human Interface Guidelines (HIG), uses SwiftUI for composition, MapKit for mapping, and integrates with HealthKit for real-time metrics.

---

## 1. Route Setup Screen (`RouteSetupView`)

### 1.1 Purpose & User Flow
**User Journey:**
- User taps "Run with AI Route" from home
- Enters desired distance (km or miles, respects locale preference)
- Optionally selects activity type (run/walk), difficulty, terrain preference
- Taps "Generate Routes" → API call generates 3 unique routes
- Proceeds to Route Visualization Screen

### 1.2 UI Layout & Design

#### Header
- **Navigation Bar:**
  - Back button (dismiss to home)
  - Title: "Plan Your Route"
  - (optional) Close button (× icon, top-right)
  - Tint color: `Color.teal` (`#00BFFF`)

#### Main Content (scrollable)

##### 1. Distance Input Card
```
┌─────────────────────────────────────────┐
│  TARGET DISTANCE                        │
│  ┌─────────────────────────────────────┐│
│  │ [50.0]   [v]   km                  ││  (segmented picker for unit)
│  └─────────────────────────────────────┘│
│  Preset distance buttons:                │
│  [3 km] [5 km] [8 km] [10 km] [21 km]  │
│  [42 km]                                │
└─────────────────────────────────────────┘
```

- **Input:** TextField with Stepper controls (min 0.5 km / 0.3 mi, max 100 km / 62 mi)
- **Unit toggle:** Respects user's preferred units (from settings/locale)
- **Quick presets:** Row of common distances
- **Validation:** Real-time input validation, disable "Generate" button if distance invalid

##### 2. Advanced Options (collapsible)
```
┌─────────────────────────────────────────┐
│  ▼ ROUTE OPTIONS                        │
│  Activity Type: ◉ Run  ○ Walk            │
│  Difficulty:   ◉ Balanced  ○ Hilly  ○ Flat│
│  Terrain:      ☑ Roads ☑ Parks ☐ Trails│
│  ☐ Return to Start (out-and-back)       │
└─────────────────────────────────────────┘
```

- **Activity Type:** Radio buttons (Run / Walk) — affects route terrain suggestions
- **Difficulty:** Segmented picker (Balanced, Hilly, Flat)
- **Terrain:** Multi-select checkboxes (Roads, Parks, Trails)
- **Loop vs Out-and-Back:** Toggle switch

##### 3. AI Coach Info Card
```
┌─────────────────────────────────────────┐
│  🤖 AI COACHING                         │
│  Enable voice coaching during this run  │
│  (Coach will guide pacing, form, etc.)  │
│  [Toggle: ON/OFF]                       │
└─────────────────────────────────────────┘
```

#### Action Buttons (sticky footer)
```
[Cancel]  [Generate Routes ▶]
```
- **Generate Routes:** Primary button (teal, enabled only if distance valid)
  - Shows loading spinner while generating
  - Disable UI during API call
  - Handle timeout gracefully (15s max)

### 1.3 Data Model & State Management

```swift
@MainActor
class RouteSetupViewModel: ObservableObject {
    @Published var distanceKm: Double = 5.0
    @Published var unitPreference: DistanceUnit = .kilometers  // from UserDefaults
    @Published var activityType: PhysicalActivityType = .run
    @Published var difficulty: RouteDifficulty = .balanced
    @Published var selectedTerrains: Set<TerrainType> = [.roads, .parks]
    @Published var isLoopRoute: Bool = false
    @Published var aiCoachEnabled: Bool = true
    
    @Published var isGenerating: Bool = false
    @Published var generatedRoutes: [GeneratedRoute] = []
    @Published var error: String? = nil
    
    func generateRoutes() async {
        isGenerating = true
        defer { isGenerating = false }
        
        do {
            let request = GenerateRoutesRequest(
                startLatitude: currentLocation.latitude,
                startLongitude: currentLocation.longitude,
                distanceMeters: distanceKm * 1000,
                activityType: activityType,
                difficulty: difficulty,
                terrainPreferences: Array(selectedTerrains),
                isLoop: isLoopRoute
            )
            
            generatedRoutes = try await apiService.generateRoutes(request)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
```

### 1.4 API Integration

**Endpoint:** `POST /api/routes/generate`

**Request:**
```json
{
  "startLatitude": 37.7749,
  "startLongitude": -122.4194,
  "distanceMeters": 5000,
  "activityType": "RUN",
  "difficulty": "BALANCED",
  "terrainPreferences": ["ROADS", "PARKS"],
  "isLoop": false,
  "aiCoachingEnabled": true
}
```

**Response:** (Array of 3 GeneratedRoute objects)
```json
{
  "routes": [
    {
      "id": "route_abc123",
      "name": "Golden Gate Waterfront",
      "distance": 5047,
      "elevationGain": 145,
      "difficulty": "BALANCED",
      "routePoints": [
        { "latitude": 37.7749, "longitude": -122.4194, "altitude": 10, "order": 0 },
        { "latitude": 37.7760, "longitude": -122.4180, "altitude": 12, "order": 1 },
        ...
      ],
      "estimatedDuration": 2400,
      "terrainTypes": ["ROADS", "PARKS"],
      "highlights": ["Golden Gate Park", "Waterfront Views", "Scenic Hills"]
    },
    ...
  ]
}
```

### 1.5 Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Invalid distance | Disable button, show red border on field |
| Location permission denied | Show alert, offer settings link |
| API timeout (>15s) | Show error message, "Try Again" button |
| User has no internet | Show offline message, suggest waiting |
| User goes background | Cancel request, preserve entered data in UserDefaults |

---

## 2. Route Visualization & Selection Screen (`RouteVisualizationView`)

### 2.1 Purpose & User Flow
**User Journey:**
- Display 3 AI-generated routes
- User scrolls through each route's details
- User can preview route on map
- User taps "Select Route" on preferred route
- Proceeds to Run Session Screen

### 2.2 UI Layout & Design

#### Header
```
┌──────────────────────────────────────┐
│ ◀ Back    SELECT ROUTE (1 of 3)   ✓  │
└──────────────────────────────────────┘
```
- Back arrow → returns to RouteSetupView
- Title shows current route index
- Right button → checkmark when selection confirmed

#### Horizontal Carousel (Paginated Swipe)
```
┌──────────────────────────────────────┐
│ ┌──────────────────────────────────┐ │
│ │                                  │ │
│ │   [MAP PREVIEW - Route 1]        │ │
│ │   5.0 km | Moderate | 25 min     │ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │                                  │ │
│ │   [MAP PREVIEW - Route 2]        │ │
│ │   5.1 km | Easy | 24 min         │ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │                                  │ │
│ │   [MAP PREVIEW - Route 3]        │ │
│ │   5.2 km | Hard | 26 min         │ │
│ │                                  │ │
│ └──────��───────────────────────────┘ │
└──────────────────────────────────────┘
```

#### Route Detail Card (below map)
```
┌──────────────────────────────────────┐
│ ◀ Route 1 of 3 ▶        ○ ◉ ○      │
├──────────────────────────────────────┤
│ Golden Gate Waterfront               │
│ 5.0 km  •  🟨 Moderate  •  ~25 min  │
├──────────────────────────────────────┤
│ Terrain: 🏙️ Parks, Roads             │
│ Elevation Gain: 145 m (474 ft)       │
│ Highlights:                          │
│ • Golden Gate Park                   │
│ • Waterfront Views                   │
│ • Scenic Hills                       │
├──────────────────────────────────────┤
│ [✓ Select This Route]                │
│ [⟲ Regenerate All Routes]            │
└──────────────────────────────────────┘
```

#### Map Preview Component
- **MapKit-based view** showing route geometry
- **Route polyline:** Teal stroke (`#00BFFF`), 4pt width
- **Start marker:** Green circle with checkmark
- **End marker:** Red circle with flag
- **Map style:** Standard (light/dark based on system appearance)
- **Initial zoom:** Fit entire route with 64pt padding
- **Interactions:** Disabled (read-only preview)

### 2.3 SwiftUI Implementation Structure

```swift
struct RouteVisualizationView: View {
    @StateObject private var viewModel: RouteVisualizationViewModel
    @State private var selectedIndex: Int = 0
    
    var body: some View {
        ZStack {
            Color(hex: "0A1628").ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                HStack {
                    Button(action: { /* back */ }) {
                        Image(systemName: "chevron.left")
                            .foregroundColor(.white)
                    }
                    
                    Text("SELECT ROUTE (\(selectedIndex + 1) of \(viewModel.routes.count))")
                        .font(.headline)
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    if !viewModel.routes.isEmpty {
                        Button(action: { /* confirm */ }) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.teal)
                        }
                    }
                }
                .padding()
                .background(Color(hex: "0A1628"))
                
                // Carousel
                TabView(selection: $selectedIndex) {
                    ForEach(Array(viewModel.routes.enumerated()), id: \.element.id) { index, route in
                        VStack(spacing: 12) {
                            // Map preview
                            RouteMapPreview(route: route)
                                .frame(height: 300)
                                .cornerRadius(12)
                            
                            // Route stats
                            HStack(spacing: 16) {
                                Text("\(String(format: "%.1f", route.distance / 1000)) \(viewModel.unitLabel)")
                                    .font(.body)
                                    .foregroundColor(.white)
                                
                                Label(route.difficulty.displayName, systemImage: "flag")
                                    .foregroundColor(route.difficulty.color)
                                
                                Text("~\(route.estimatedMinutes) min")
                                    .font(.body)
                                    .foregroundColor(.gray)
                            }
                        }
                        .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .frame(height: 380)
                
                // Detail card
                ScrollView {
                    if !viewModel.routes.isEmpty {
                        let currentRoute = viewModel.routes[selectedIndex]
                        
                        VStack(alignment: .leading, spacing: 12) {
                            Text(currentRoute.name)
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                            
                            // Stats
                            HStack(spacing: 8) {
                                Text("\(String(format: "%.1f", currentRoute.distance / 1000)) \(viewModel.unitLabel)")
                                Text("•")
                                Text(currentRoute.difficulty.displayName)
                                    .foregroundColor(currentRoute.difficulty.color)
                                Text("•")
                                Text("~\(currentRoute.estimatedMinutes) min")
                            }
                            .font(.subheadline)
                            .foregroundColor(.gray)
                            
                            Divider()
                            
                            // Elevation
                            HStack {
                                Image(systemName: "arrow.up")
                                    .foregroundColor(.teal)
                                Text("Elevation Gain:")
                                    .foregroundColor(.gray)
                                Spacer()
                                Text("\(currentRoute.elevationGain) m")
                                    .foregroundColor(.white)
                            }
                            
                            // Highlights
                            if !currentRoute.highlights.isEmpty {
                                Text("Highlights")
                                    .font(.subheadline)
                                    .foregroundColor(.teal)
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    ForEach(currentRoute.highlights, id: \.self) { highlight in
                                        HStack {
                                            Image(systemName: "mappin")
                                                .font(.caption)
                                                .foregroundColor(.teal)
                                            Text(highlight)
                                                .font(.caption)
                                                .foregroundColor(.white)
                                        }
                                    }
                                }
                            }
                            
                            Spacer()
                            
                            // Action buttons
                            Button(action: { viewModel.selectRoute(viewModel.routes[selectedIndex]) }) {
                                HStack {
                                    Image(systemName: "checkmark")
                                    Text("Select This Route")
                                }
                                .frame(maxWidth: .infinity)
                                .padding(12)
                                .background(Color.teal)
                                .foregroundColor(.black)
                                .cornerRadius(8)
                            }
                            
                            Button(action: { viewModel.regenerateRoutes() }) {
                                HStack {
                                    Image(systemName: "arrow.counterclockwise")
                                    Text("Regenerate All Routes")
                                }
                                .frame(maxWidth: .infinity)
                                .padding(12)
                                .background(Color.gray.opacity(0.15))
                                .foregroundColor(.gray)
                                .cornerRadius(8)
                            }
                        }
                        .padding()
                    }
                }
                
                Spacer()
            }
        }
    }
}
```

### 2.4 Route Map Preview Component

```swift
struct RouteMapPreview: View {
    let route: GeneratedRoute
    @State private var region: MKCoordinateRegion = MKCoordinateRegion()
    
    var body: some View {
        ZStack {
            // MapKit view
            Map(position: .constant(.region(calculateRegion())))
                .mapStyle(.standard)
                .mapControls {
                    MapUserLocationButton()
                }
            
            // Overlay: route polyline (drawn via MapKit shapes)
            Canvas { context in
                let routePoints = route.routePoints
                
                if routePoints.count > 1 {
                    var path = Path()
                    
                    // Convert first point to screen coordinates
                    let firstCoord = CLLocationCoordinate2D(
                        latitude: routePoints[0].latitude,
                        longitude: routePoints[0].longitude
                    )
                    
                    // Draw polyline
                    path.move(to: CGPoint(x: 0, y: 0)) // Placeholder
                    
                    for point in routePoints.dropFirst() {
                        let coord = CLLocationCoordinate2D(
                            latitude: point.latitude,
                            longitude: point.longitude
                        )
                        // Project to screen coordinate
                        path.addLine(to: CGPoint(x: 0, y: 0)) // Placeholder
                    }
                    
                    context.stroke(
                        path,
                        with: .color(.teal),
                        lineWidth: 4
                    )
                }
            }
        }
    }
    
    private func calculateRegion() -> MKCoordinateRegion {
        let points = route.routePoints
        guard !points.isEmpty else {
            return MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 0, longitude: 0),
                span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
            )
        }
        
        let lats = points.map { $0.latitude }
        let lons = points.map { $0.longitude }
        
        let minLat = lats.min()!, maxLat = lats.max()!
        let minLon = lons.min()!, maxLon = lons.max()!
        
        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2
        )
        
        let span = MKCoordinateSpan(
            latitudeDelta: (maxLat - minLat) * 1.2,
            longitudeDelta: (maxLon - minLon) * 1.2
        )
        
        return MKCoordinateRegion(center: center, span: span)
    }
}
```

### 2.5 Data Model

```swift
struct GeneratedRoute: Identifiable, Codable {
    let id: String
    let name: String
    let distance: Double  // meters
    let elevationGain: Double  // meters
    let difficulty: RouteDifficulty
    let routePoints: [RoutePoint]
    let estimatedDuration: Int  // seconds
    let terrainTypes: [TerrainType]
    let highlights: [String]
    
    var estimatedMinutes: Int {
        (estimatedDuration + 30) / 60  // Round to nearest minute
    }
}

struct RoutePoint: Codable {
    let latitude: Double
    let longitude: Double
    let altitude: Double?
    let order: Int
}

enum RouteDifficulty: String, Codable {
    case easy = "EASY"
    case balanced = "BALANCED"
    case hard = "HARD"
    
    var displayName: String {
        switch self {
        case .easy: return "Easy"
        case .balanced: return "Moderate"
        case .hard: return "Hard"
        }
    }
    
    var color: Color {
        switch self {
        case .easy: return .green
        case .balanced: return .yellow
        case .hard: return .red
        }
    }
}

enum TerrainType: String, Codable {
    case roads = "ROADS"
    case parks = "PARKS"
    case trails = "TRAILS"
}
```

---

## 3. Live Run Session Screen (`RunSessionView`)

### 3.1 Purpose & User Flow
**User Journey:**
- Start button transitions to this screen
- User sees real-time map with their current location
- Route polyline displayed, progress line shown as user runs
- Real-time metrics (time, distance, pace, HR) displayed
- Navigation guidance (turn-by-turn or general "stay on route" hints)
- Pause/Resume/End buttons available
- AI Coach provides audio cues

### 3.2 UI Layout & Design

#### Full Screen Map View
```
┌──────────────────────────────────────────┐
│  [Google Maps / Apple Maps style]        │
│  Route shown as teal polyline             │
│  Progress line: brighter teal + glow     │
│  Current location: blue dot + pulsing    │
│  Target end: red marker                   │
│                                          │
│  [Distance Remaining: 2.3 km]            │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ [Live Metrics Card - see below]   │ │
│  └────────────────────────────────────┘ │
│                                          │
│  [< PAUSE] [END RUN >]                  │
└──────────────────────────────────────────┘
```

#### Live Metrics Card (draggable modal, bottom sheet)
```
┌────────────────────────────────────────┐
│ ▲ [Drag handle]                        │
├────────────────────────────────────────┤
│ TIME        DISTANCE        PACE        │
│ 12:34       2.3 km          5:24/km    │
├────────────────────────────────────────┤
│ ♥️ HR: 154 bpm  ⚡ Cadence: 182 spm   │
├────────────────────────────────────────┤
│ 🤖 Coach: "Great pace! Keep it steady" │
├────────────────────────────────────────┤
│ Next checkpoint: Golden Gate (0.4 km)  │
└────────────────────────────────────────┘
```

#### Navigation Guidance Panel (conditional)
```
If off-route:
┌────────────────────────────────────────┐
│ ⚠️  OFF ROUTE — 80m to left            │
│ [↶ Return to Route]                    │
└────────────────────────────────────────┘

If near turn:
┌────────────────────────────────────────┐
│ ↻ Turn right at 50 m                   │
│ Continue on Main St for 0.3 km         │
└────────────────────────────────────────┘
```

### 3.3 SwiftUI Implementation Structure

```swift
struct RunSessionView: View {
    @StateObject private var viewModel: RunSessionViewModel
    @State private var showingPauseConfirmation = false
    @State private var mapRegion: MKCoordinateRegion
    @State private var bottomSheetPosition: BottomSheetPosition = .middle
    
    var body: some View {
        ZStack {
            // Background map
            Map(position: .constant(.region(mapRegion)))
                .mapStyle(.standard)
                .ignoresSafeArea()
                .onAppear {
                    // Center on current location
                    viewModel.centerMapOnCurrentLocation()
                }
            
            // Route overlay
            Canvas { context in
                drawRoutePolylines(context: context, viewModel: viewModel)
            }
            
            VStack {
                // Top header bar
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Running")
                            .font(.caption)
                            .foregroundColor(.gray)
                        Text("Golden Gate Waterfront")
                            .font(.headline)
                            .foregroundColor(.white)
                    }
                    
                    Spacer()
                    
                    // Distance remaining
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Remaining")
                            .font(.caption)
                            .foregroundColor(.gray)
                        HStack(spacing: 4) {
                            Image(systemName: "location.fill")
                                .foregroundColor(.teal)
                            Text("\(String(format: "%.1f", (viewModel.route.distance - viewModel.distanceCovered) / 1000)) \(viewModel.unitLabel)")
                                .font(.headline)
                                .foregroundColor(.white)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color.black.opacity(0.5))
                
                Spacer()
                
                // Bottom controls
                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        Button(action: { showingPauseConfirmation = true }) {
                            HStack {
                                Image(systemName: viewModel.isPaused ? "play.fill" : "pause.fill")
                                Text(viewModel.isPaused ? "RESUME" : "PAUSE")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(12)
                            .background(Color.gray.opacity(0.2))
                            .foregroundColor(.white)
                            .cornerRadius(8)
                        }
                        
                        Button(action: { viewModel.endRun() }) {
                            HStack {
                                Image(systemName: "stop.fill")
                                Text("END RUN")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(12)
                            .background(Color.red.opacity(0.3))
                            .foregroundColor(.red)
                            .cornerRadius(8)
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 20)
            }
            
            // Bottom sheet: live metrics
            VStack(spacing: 0) {
                // Drag handle
                Capsule()
                    .fill(Color.white.opacity(0.3))
                    .frame(width: 40, height: 4)
                    .padding(.top, 8)
                
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        // Main metrics row
                        HStack(spacing: 0) {
                            VStack(alignment: .center, spacing: 4) {
                                Text(viewModel.runState.time)
                                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                                    .foregroundColor(.white)
                                Text("TIME")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                            .frame(maxWidth: .infinity)
                            
                            Divider()
                            
                            VStack(alignment: .center, spacing: 4) {
                                Text(String(format: "%.2f", viewModel.runState.distance.floatValue ?? 0))
                                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                                    .foregroundColor(.white)
                                Text("DISTANCE")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                            .frame(maxWidth: .infinity)
                            
                            Divider()
                            
                            VStack(alignment: .center, spacing: 4) {
                                Text(viewModel.runState.pace)
                                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                                    .foregroundColor(.teal)
                                Text("PACE")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .padding(.vertical, 12)
                        
                        Divider()
                        
                        // Secondary metrics
                        HStack(spacing: 16) {
                            if !viewModel.runState.heartRate.isEmpty {
                                HStack(spacing: 6) {
                                    Image(systemName: "heart.fill")
                                        .foregroundColor(.red)
                                    Text(viewModel.runState.heartRate)
                                        .font(.subheadline)
                                        .foregroundColor(.white)
                                    Text("bpm")
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                            }
                            
                            if !viewModel.runState.cadence.isEmpty {
                                HStack(spacing: 6) {
                                    Image(systemName: "figure.walk")
                                        .foregroundColor(.teal)
                                    Text(viewModel.runState.cadence)
                                        .font(.subheadline)
                                        .foregroundColor(.white)
                                    Text("spm")
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                            }
                            
                            Spacer()
                        }
                        .padding(.vertical, 8)
                        
                        // Coach message
                        if let coachMessage = viewModel.runState.latestCoachMessage {
                            HStack(spacing: 8) {
                                Image(systemName: "sparkles")
                                    .foregroundColor(.teal)
                                Text(coachMessage)
                                    .font(.callout)
                                    .foregroundColor(.white)
                                    .lineLimit(2)
                                Spacer()
                            }
                            .padding(12)
                            .background(Color.teal.opacity(0.1))
                            .cornerRadius(8)
                        }
                        
                        // Navigation guidance
                        if let guidance = viewModel.navigationGuidance {
                            HStack(spacing: 8) {
                                Image(systemName: "arrow.turn.up.right")
                                    .foregroundColor(.teal)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(guidance.instruction)
                                        .font(.callout)
                                        .foregroundColor(.white)
                                    Text(guidance.distance)
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                                Spacer()
                            }
                            .padding(12)
                            .background(Color.gray.opacity(0.1))
                            .cornerRadius(8)
                        }
                    }
                    .padding(16)
                }
            }
            .background(Color(hex: "0A1628").opacity(0.95))
            .cornerRadius(16, corners: [.topLeft, .topRight])
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
        .alert("Pause Run?", isPresented: $showingPauseConfirmation) {
            Button("Resume") { viewModel.resumeRun() }
            Button("Pause", role: .cancel) { viewModel.pauseRun() }
        }
    }
    
    private func drawRoutePolylines(context: inout GraphicsContext, viewModel: RunSessionViewModel) {
        // Draw full route (faded)
        drawPolyline(
            points: viewModel.route.routePoints,
            color: .teal.opacity(0.4),
            lineWidth: 3,
            context: &context
        )
        
        // Draw progress line (bright teal with glow)
        let progressPoints = viewModel.routeProgressPoints
        drawPolyline(
            points: progressPoints,
            color: .teal,
            lineWidth: 5,
            context: &context
        )
    }
    
    private func drawPolyline(
        points: [RoutePoint],
        color: Color,
        lineWidth: CGFloat,
        context: inout GraphicsContext
    ) {
        guard points.count > 1 else { return }
        
        var path = Path()
        
        // Project coordinates to screen space (simplified for demo)
        for (index, point) in points.enumerated() {
            let screenPoint = CGPoint(x: 100 + CGFloat(index) * 10, y: 200)
            if index == 0 {
                path.move(to: screenPoint)
            } else {
                path.addLine(to: screenPoint)
            }
        }
        
        context.stroke(
            path,
            with: .color(color),
            lineWidth: lineWidth
        )
    }
}
```

### 3.4 Core ViewModel State

```swift
@MainActor
class RunSessionViewModel: ObservableObject {
    @Published var runState: RunState = RunState()
    @Published var route: GeneratedRoute
    @Published var routeProgressPoints: [RoutePoint] = []
    @Published var currentLocation: CLLocationCoordinate2D?
    @Published var navigationGuidance: NavigationGuidance?
    @Published var distanceCovered: Double = 0
    @Published var isPaused: Bool = false
    
    private var locationManager: CLLocationManager
    private var healthKitManager: HealthKitManager
    private var timer: Timer?
    private var startTime: Date?
    
    func startRun() {
        startTime = Date()
        locationManager.startUpdatingLocation()
        startTimer()
    }
    
    func pauseRun() {
        isPaused = true
        timer?.invalidate()
        locationManager.stopUpdatingLocation()
    }
    
    func resumeRun() {
        isPaused = false
        startTimer()
        locationManager.startUpdatingLocation()
    }
    
    func endRun() {
        // Save run to HealthKit
        // Generate summary
        // Navigate to RunSummaryView
    }
    
    private func updateMetrics() {
        let elapsed = Date().timeIntervalSince(startTime ?? Date())
        runState.time = formatTime(Int(elapsed))
        
        if let location = currentLocation {
            let distance = calculateDistanceAlongRoute(to: location)
            distanceCovered = distance
            runState.distance = String(format: "%.2f", distance / 1000)
            
            let pace = calculatePace(distance: distance, elapsed: elapsed)
            runState.pace = formatPace(pace)
            
            updateNavigationGuidance(for: location)
        }
    }
    
    private func calculateDistanceAlongRoute(to location: CLLocationCoordinate2D) -> Double {
        var totalDistance: Double = 0
        
        for i in 0..<route.routePoints.count {
            let routePoint = CLLocationCoordinate2D(
                latitude: route.routePoints[i].latitude,
                longitude: route.routePoints[i].longitude
            )
            
            let distance = CLLocation(latitude: currentLocation?.latitude ?? 0, longitude: currentLocation?.longitude ?? 0)
                .distance(from: CLLocation(latitude: routePoint.latitude, longitude: routePoint.longitude))
            
            if distance < 20 {  // Within 20m of this waypoint
                totalDistance += distance
                // Update progress line
                routeProgressPoints = Array(route.routePoints[0...i])
                break
            }
        }
        
        return totalDistance
    }
    
    private func updateNavigationGuidance(for location: CLLocationCoordinate2D) {
        // Check if off-route
        let nearestPoint = findNearestRoutePoint(to: location)
        let distanceToNearest = location.distance(to: nearestPoint)
        
        if distanceToNearest > 50 {  // Off by more than 50m
            navigationGuidance = NavigationGuidance(
                instruction: "OFF ROUTE",
                distance: "\(Int(distanceToNearest))m to route",
                isWarning: true
            )
            return
        }
        
        // Find next turn
        let nextTurn = findNextTurn(after: nearestPoint)
        if let turn = nextTurn {
            navigationGuidance = NavigationGuidance(
                instruction: turn.direction,
                distance: "\(turn.distanceToTurn)m",
                isWarning: false
            )
        }
    }
    
    private func formatTime(_ seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        let secs = seconds % 60
        
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
    
    private func formatPace(_ secondsPerKm: Double) -> String {
        let minutes = Int(secondsPerKm / 60)
        let seconds = Int(secondsPerKm.truncatingRemainder(dividingBy: 60))
        return String(format: "%d:%02d", minutes, seconds)
    }
}

struct NavigationGuidance {
    let instruction: String
    let distance: String
    let isWarning: Bool
}

struct RunState {
    var time: String = "00:00"
    var distance: String = "0.00"
    var pace: String = "0:00"
    var currentPace: String = "0:00"
    var cadence: String = "0"
    var heartRate: String = "0"
    var isRunning: Bool = false
    var isPaused: Bool = false
    var latestCoachMessage: String?
}
```

### 3.5 Map Rendering & Route Polyline

**Key Implementation Details:**

1. **Route Polyline Rendering:**
   - Use `@State` to store projected screen coordinates
   - Update polyline as user moves along route
   - Animate progress line with teal color + shadow

2. **Current Location Marker:**
   - Blue dot with pulse animation
   - Update position every GPS update (min 5m moved or 5s elapsed)
   - Display heading indicator

3. **End Marker:**
   - Red flag icon at route endpoint
   - Show distance remaining to end

4. **Map Camera Control:**
   - Follow user's current location (auto-center)
   - 45° pitch angle for 3D perspective
   - Rotate bearing to match travel direction

```swift
struct RouteMapView: UIViewRepresentable {
    let route: GeneratedRoute
    @ObservedRealmObject var runSession: RunSession
    @Binding var mapRegion: MKCoordinateRegion
    
    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.mapType = .standard
        
        // Add route polyline
        let routeCoordinates = route.routePoints.map { point in
            CLLocationCoordinate2D(latitude: point.latitude, longitude: point.longitude)
        }
        
        let polyline = MKPolyline(coordinates: routeCoordinates, count: routeCoordinates.count)
        mapView.addOverlay(polyline)
        
        // Add start/end markers
        let startAnnotation = MKPointAnnotation()
        startAnnotation.coordinate = routeCoordinates[0]
        startAnnotation.title = "Start"
        mapView.addAnnotation(startAnnotation)
        
        let endAnnotation = MKPointAnnotation()
        endAnnotation.coordinate = routeCoordinates[routeCoordinates.count - 1]
        endAnnotation.title = "End"
        mapView.addAnnotation(endAnnotation)
        
        return mapView
    }
    
    func updateUIView(_ mapView: MKMapView, context: Context) {
        mapView.setRegion(mapRegion, animated: true)
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, MKMapViewDelegate {
        var parent: RouteMapView
        
        init(_ parent: RouteMapView) {
            self.parent = parent
        }
        
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let polyline = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: polyline)
                renderer.strokeColor = UIColor(Color.teal)
                renderer.lineWidth = 4
                renderer.alpha = 0.7
                return renderer
            }
            return MKOverlayRenderer()
        }
    }
}
```

---

## 4. Integration with Existing Systems

### 4.1 HealthKit Integration
- **Data to write:**
  - `HKWorkoutType`: Type = `.running` or `.walking`
  - `HKQuantityType`: Active energy, distance, heart rate
  - Timeline: Start and end time
- **Permissions:** Request on app launch or first run

### 4.2 Location Services
- **Permissions:** Request "While Using" (most permissive for background tracking)
- **Accuracy:** `.bestForNavigation` (±5m)
- **Update frequency:** Every 5m moved or 5s elapsed
- **Background:** Use `CLBackgroundActivitySession` for continued location tracking

### 4.3 Audio & Coaching Integration
- **Coach messages:** Play via `AVAudioSession` with `.default` category
- **Interruption handling:** Pause playback if incoming call
- **Muting:** Respect user's mute toggle in RunState

### 4.4 Connectivity & Sync
- **Real-time metrics:** Send to backend every 30s (batched)
- **Fallback offline:** Cache metrics locally, sync on reconnect
- **Run completion:** Upload full route points + HR/cadence data

---

## 5. Design System & Branding

### 5.1 Color Palette
| Element | Color | Hex |
|---------|-------|-----|
| Primary (CTA, highlights) | Teal | #00BFFF |
| Background | Dark Navy | #0A1628 |
| Text (primary) | White | #FFFFFF |
| Text (secondary) | Gray | #8B9AA8 |
| Easy difficulty | Green | #22C55E |
| Moderate difficulty | Yellow | #FBBF24 |
| Hard difficulty | Red | #EF4444 |

### 5.2 Typography
| Use Case | Font | Size | Weight |
|----------|------|------|--------|
| Header titles | `.system(design: .rounded)` | 24pt | Bold |
| Subheadings | `.system` | 16pt | Semibold |
| Body text | `.system` | 14pt | Regular |
| Metrics (monospaced) | `.system(design: .monospaced)` | 28pt | Bold |
| Captions | `.system` | 12pt | Regular |

### 5.3 Spacing & Layout
- **Safe area insets:** 16pt horizontal padding
- **Vertical spacing:** 8pt (micro), 12pt (standard), 16pt (large)
- **Corner radius:** 8pt (buttons), 12pt (cards), 16pt (modals)

### 5.4 Animations
- **Transition:** `.easeInOut(duration: 0.3)`
- **Pulse (marker):** Infinite scale animation, 1.5s cycle
- **Progress line glow:** Shadow blur, 4pt offset
- **Bottom sheet:** Drag-to-dismiss with spring physics

---

## 6. Error Handling & Edge Cases

### 6.1 Route Setup Phase

| Error | Handling |
|-------|----------|
| Invalid distance | Red border, disable button |
| Location permission denied | Show alert + settings link |
| API timeout | Show error, retry button |
| User goes background | Preserve form state in UserDefaults |
| No internet | Show offline message, queue for later |

### 6.2 Route Visualization Phase

| Error | Handling |
|-------|----------|
| Failed to load routes | Show error card, regenerate button |
| Map fails to render | Show fallback text summary |
| User closes routes (back) | Confirm action, discard or save |

### 6.3 Live Run Phase

| Error | Handling |
|-------|----------|
| GPS signal lost | Show "Acquiring GPS…" overlay, pause auto-sync |
| Off-route > 100m | Show warning banner, suggest return |
| HealthKit permission denied | Continue without HR/cadence data |
| Low battery warning | Show banner, offer battery saver mode |
| App backgrounded > 5 min | Ask if user wants to resume or end |

---

## 7. Performance Considerations

### 7.1 Memory Optimization
- **Route points:** Downsample to 10m precision for non-active zooms
- **MapKit canvas:** Limit overlay redraws to every 500ms
- **Metrics updates:** Batch HealthKit writes every 30s

### 7.2 Battery Optimization
- **Location updates:** Use `.bestForNavigation` only when running
- **Screen:** Dim if inactive > 30s (user can disable)
- **Map rendering:** Lower tile detail on cellular

### 7.3 Network Optimization
- **Sync frequency:** 30s intervals, combine with other requests
- **Retry logic:** Exponential backoff (1s, 2s, 4s, 8s)
- **Compression:** Use gzip for route point uploads

---

## 8. Testing & QA Checklist

### 8.1 Route Setup
- [ ] Distance input accepts range 0.5–100 km
- [ ] Unit conversion works (km ↔ miles)
- [ ] Quick preset buttons set correct values
- [ ] Advanced options toggle expand/collapse
- [ ] Generate button disabled until distance valid
- [ ] Loading spinner shows during API call
- [ ] Error message displays on failure
- [ ] Timeout after 15s shows retry option

### 8.2 Route Visualization
- [ ] Carousel swipes smoothly between routes
- [ ] Map preview renders without crashes
- [ ] Polyline color is teal (#00BFFF)
- [ ] Start/end markers visible
- [ ] Route stats calculate correctly
- [ ] Select button transitions to run session
- [ ] Regenerate button re-calls API

### 8.3 Live Run
- [ ] GPS lock achieved before run starts
- [ ] Current location updates smoothly
- [ ] Progress line updates as user runs
- [ ] Metrics (time, distance, pace) update every 1s
- [ ] Heart rate displays correctly (if connected)
- [ ] Coach message appears and dismisses
- [ ] Pause/Resume works correctly
- [ ] End run saves to HealthKit
- [ ] Off-route detection triggers warning
- [ ] Navigation guidance updates every 10 waypoints

### 8.4 Device Testing
- [ ] Test on iPhone 13 Pro, 14 Pro, 15
- [ ] Test on iOS 15.0+
- [ ] Test with cellular network
- [ ] Test with low battery (< 20%)
- [ ] Test with location permission denied
- [ ] Test backgrounding during run (15+ min pause)

---

## 9. API Specifications

### 9.1 Route Generation Endpoint

**POST** `/api/routes/generate`

**Request:**
```json
{
  "startLatitude": 37.7749,
  "startLongitude": -122.4194,
  "distanceMeters": 5000,
  "activityType": "RUN",
  "difficulty": "BALANCED",
  "terrainPreferences": ["ROADS", "PARKS"],
  "isLoop": false
}
```

**Response:**
```json
{
  "routes": [
    {
      "id": "route_abc123",
      "name": "Golden Gate Loop",
      "distance": 5047,
      "elevationGain": 145,
      "difficulty": "BALANCED",
      "estimatedDuration": 2400,
      "routePoints": [
        {
          "latitude": 37.7749,
          "longitude": -122.4194,
          "altitude": 10,
          "order": 0
        }
      ],
      "terrainTypes": ["ROADS", "PARKS"],
      "highlights": ["Golden Gate Park", "Waterfront"]
    }
  ]
}
```

### 9.2 Run Session Endpoints

**POST** `/api/runs/start`
- Start a new run session
- Returns `runId` for tracking

**POST** `/api/runs/{runId}/sync`
- Batch upload metrics (every 30s)
- Payload: time, distance, HR, cadence, GPS points

**POST** `/api/runs/{runId}/complete`
- Mark run as finished
- Upload final metrics + route completion

---

## 10. File Structure & Organization

```
iOS/
├── AiRunCoach/
│   ├── App/
│   │   └── AiRunCoachApp.swift
│   ├── Views/
│   │   ├── RouteSetupView.swift
│   │   ├── RouteVisualizationView.swift
│   │   ├── RunSessionView.swift
│   │   └── Components/
│   │       ├── RouteMapPreview.swift
│   │       ├── RouteCard.swift
│   │       ├── MetricsCard.swift
│   │       └── NavigationGuidance.swift
│   ├── ViewModels/
│   │   ├── RouteSetupViewModel.swift
│   │   ├── RouteVisualizationViewModel.swift
│   │   └── RunSessionViewModel.swift
│   ├── Models/
│   │   ├── GeneratedRoute.swift
│   │   ├── RoutePoint.swift
│   │   ├── RunSession.swift
│   │   └── RunState.swift
│   ├── Services/
│   │   ├── APIService.swift
│   │   ├── LocationManager.swift
│   │   ├── HealthKitManager.swift
│   │   └── AudioCoachManager.swift
│   ├── Utils/
│   │   ├── Extensions.swift
│   │   ├── Constants.swift
│   │   └── Formatters.swift
│   └── Resources/
│       ├── Assets.xcassets
│       └── Localizable.strings
```

---

## 11. Next Steps for Xcode Agent

1. **Create SwiftUI project** with target iOS 15.0+
2. **Set up Core Data** models for offline run caching
3. **Implement LocationManager** with CLLocationManager
4. **Build RouteSetupView** with distance input & generation
5. **Create route visualization carousel** with MapKit
6. **Build live run session screen** with metrics + map
7. **Integrate HealthKit** for workout data
8. **Add CoachAudio integration** for voice guidance
9. **Test on simulators** (iPhone 14, iPhone 15)
10. **Optimize performance** for battery/network

---

**Document Version:** 1.0
**Last Updated:** July 30, 2026
**Author:** AI Run Coach Engineering Team
**Status:** Ready for Xcode Implementation

