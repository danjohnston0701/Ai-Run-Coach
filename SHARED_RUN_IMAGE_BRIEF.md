# Shared Run Image Route Map Brief

## Objective
Enhance the shared run image route visualization to match the professionally designed and colorized pace route map currently displayed in the run summary screen. The current Replit-generated shared image has a basic route outline that lacks visual sophistication. The goal is to implement the same pace-based color gradient system used in the summary view.

---

## Reference: Current Implementation

### Run Summary Route Map (Target Design)
**Location**: AI Run Coach app → Run Summary Screen  
**Visual Features**:
- **Pace-based color gradient**: Route segments are colorized based on pace intensity
  - Green: Fast pace (strong performance)
  - Yellow/Orange: Moderate pace (steady effort)
  - Red/Orange: Slow pace (struggling sections)
- **Smooth color transitions**: Gradual color shifts between pace zones for aesthetic continuity
- **Clear visual hierarchy**: Route stands out against the map background
- **Start/End markers**: Green circle (start), different icon (end)
- **Pace legend**: Small widget showing pace range (e.g., "5:46 – 9:52" min/km)

### Current Shared Image (Problems)
- Single-color route line (often orange or dull brown)
- No pace differentiation visible
- Lacks professional polish
- Hard to interpret run performance from the image alone

---

## Technical Requirements

### 1. Data Input
The shared image generator should receive:
- **Route coordinates**: Array of lat/lng points from the run GPS trace
- **Pace data**: Per-segment pace values (seconds per kilometer) corresponding to each coordinate
- **Run metadata**: 
  - Distance (km)
  - Duration (HH:MM:SS)
  - Average pace (min/km)
  - Run status (completed, incomplete, etc.)

### 2. Map Rendering
- **Framework**: Use Mapbox GL JS or similar (or existing mapping library integrated with Replit's stack)
- **Base map style**: Light/neutral background (similar to Google Maps light theme in the summary)
- **Map bounds**: Automatically center and zoom to fit the entire route with 15% padding

### 3. Route Line Styling

#### Color Mapping Logic
```
Create a pace-to-color lookup based on run statistics:

1. Calculate min pace and max pace from all segments
2. Divide pace range into 5-7 color bands:
   - Fastest (best performance): Green (#4CAF50 or similar)
   - Fast: Light green (#8BC34A)
   - Moderate: Yellow (#FFC107)
   - Slow: Orange (#FF9800)
   - Slowest (struggle): Red (#FF5252 or similar)

3. For each coordinate segment:
   - Get the pace value
   - Map to the appropriate color band
   - Apply the color to the line segment between current and next coordinate
```

#### Line Properties
- **Line width**: 4-6px (visible but not overwhelming)
- **Line opacity**: 0.85-0.95 (solid, slightly transparent for layering)
- **Line cap/join**: Round (smooth appearance)
- **Antialiasing**: Enabled for smooth edges

### 4. Markers & Icons

#### Start Marker
- **Icon**: Green circle (matching the summary)
- **Position**: First coordinate
- **Z-index**: High (above the line)

#### End Marker
- **Icon**: Different from start (e.g., flag, checkmark, or circle with outline)
- **Position**: Last coordinate
- **Z-index**: High (above the line)

#### Struggle Point Markers
- **Status**: **DO NOT INCLUDE** in shared image
- (These are internal coaching feedback and cluttering the shared image)

### 5. Legend/Info Display

#### Pace Legend
- **Position**: Bottom-left corner of map (or overlay area)
- **Format**:
  ```
  Pace
  [Green bar]  [Orange bar]  [Red bar]
  5:46            7:44         9:52
  (fastest)    (average)    (slowest)
  ```
- **Background**: Semi-transparent dark box (matching app theme)
- **Font**: Clear, readable (white text on dark background)

#### Run Stats Summary
- **Position**: Bottom-right corner or top-left (non-intrusive)
- **Display**:
  ```
  4.07 km  |  30:00  |  7:44 min/km
  ```
- **Background**: Same semi-transparent style as legend

### 6. Image Output

#### Dimensions
- **Standard size**: 1200×800px (16:9 aspect ratio for social sharing)
- **High DPI**: Render at 2x scale internally (2400×1600) then downscale for crisp display

#### File Format
- **Format**: PNG (lossless, supports transparency if needed)
- **Quality**: High (minimize compression artifacts)

#### Metadata
- Include metadata comments with:
  - Date/time of run
  - App version
  - Generation timestamp

---

## Implementation Approach

### Phase 1: Data Pipeline
1. Ensure route data and pace data are synchronized
2. Add validation to confirm:
   - Coordinate count matches pace segment count
   - Pace values are realistic (0.5–20 min/km range)
   - Route is not empty

### Phase 2: Pace-to-Color Mapping
1. Build color palette as a configuration object (easily customizable)
2. Implement percentile-based mapping:
   - Calculate pace percentiles (0, 25, 50, 75, 100)
   - Map to color bands for smooth distribution
3. Add fallback for edge cases (all segments same pace = gradient shades of single color)

### Phase 3: Route Line Rendering
1. Create polyline from coordinates
2. For each segment, apply the mapped color
3. Test with various route shapes and lengths

### Phase 4: Markers & Overlays
1. Add start/end markers
2. Add legend and run stats
3. Test positioning on different map zoom levels

### Phase 5: Output & Optimization
1. Render to canvas/SVG as specified format
2. Optimize file size while maintaining clarity
3. Test across browsers/devices

---

## Design Guidelines

### Color Palette (Reference from Summary Screen)
```
Green (Fast):      #4CAF50 or #66BB6A
Yellow (Moderate): #FFC107 or #FDD835
Orange (Slow):     #FF9800 or #FFB74D
Red (Struggle):    #FF5252 or #E53935
```

### Typography
- **Font**: Use app's primary font (likely Roboto or similar clean sans-serif)
- **Size**: 
  - Stats: 14-16px
  - Legend: 12-14px
  - Labels: 10-12px

### Spacing
- **Padding**: 16px from edges (maintains professional margin)
- **Legend spacing**: 8-12px between elements

---

## Testing Checklist

- [ ] Route renders correctly with 10–500+ coordinate points
- [ ] Color gradient is smooth and matches intensity of pace variations
- [ ] Pace legend accurately reflects min/max pace from run
- [ ] Markers are visible and properly positioned
- [ ] Run stats are readable and formatted correctly
- [ ] Output image is high quality at both 1x and 2x scales
- [ ] File size is reasonable (<2MB)
- [ ] Works with runs of various distances (1km–50km+)
- [ ] Edge cases handled:
  - Very short runs (< 1km)
  - Very long runs (> 20km)
  - Runs with flat pace (all segments near average)
  - Runs with extreme pace variation

---

## Additional Notes

### Why This Approach?
1. **Pace-based coloring** provides instant visual feedback on run performance
2. **Matches existing design** ensures consistency across the app and shareable content
3. **Professional appearance** encourages social sharing and user engagement
4. **No struggle markers** keeps the shared image clean and celebratory (struggle markers are coaching-internal)

### Future Enhancements (Not in Scope)
- Custom color themes (user preference)
- Elevation profile as a secondary visualization
- Heart rate overlay (if data available)
- Cadence overlay (if data available)
- Animations (for video sharing)

---

## Questions for Implementation

1. **Data availability**: Is pace-per-segment data already available in the run export, or does it need to be calculated?
2. **Map library**: What mapping library is currently used in Replit for route generation?
3. **Styling consistency**: Should the map background and styling match a specific brand/theme?
4. **Localization**: Should distance/pace units adapt to user locale (km/mi, min/km vs min/mi)?
5. **Accessibility**: Should the image include alt text describing the run performance?

---

## Delivery Expectation

A JavaScript/Python function (depending on Replit's tech stack) that:
- **Input**: Run data object with coordinates, pace values, and metadata
- **Output**: PNG image file (1200×800px) with pace-colorized route map
- **Quality**: Visually matches the run summary screen route map
- **Performance**: Generates in < 5 seconds for typical runs
