# Android Weather Impact Analysis Implementation

## Overview
Updated Android Weather Impact Analysis to match iOS design, featuring three independent weather components across different tabs in the Run Summary screen.

---

## Component 1: AI Weather Insight Card (AI Insights Tab)

### What it does
Displays a natural language paragraph that the AI generates about how weather specifically affected the run.

### API Integration
- **Endpoint**: POST `/api/runs/{id}/comprehensive-analysis`
- **Response field**: `weatherImpact` (String, nullable)
- **Data sent**: Weather conditions are already part of the RunSession and WeatherData model

### Component Details
- **Location**: `RunSummaryScreen.kt` - `WeatherImpactInsightCard()` function
- **Visual Style**: Card with weather emoji icon (🌤), title "WEATHER IMPACT", and paragraph body
- **Integration**: Added to `ComprehensiveAnalysisFlagship()` to display after wellness impact section

### Code Changes
```kotlin
@Composable
private fun WeatherImpactInsightCard(weatherImpact: String) {
    // Card displaying the AI-generated weather impact paragraph
}
```

**Updated data class**:
- `ComprehensiveRunAnalysis` now includes: `@SerializedName("weatherImpact") val weatherImpact: String? = null`

---

## Component 2: Weather Performance Index Card (Graphs Tab)

### What it does
Shows a numeric 0–100 index (WPI) of how favorable conditions were, with visual indicators. **Entirely client-side** — no API call needed.

### WPI Score Formula
```
optimalTemp = 12°C
tempDiff = abs(runTemp - 12)
wpi = max(0, 100 - tempDiff × 3.5)
```

### WPI Band Ratings & Colors
| WPI Range | Rating | Color |
|-----------|--------|-------|
| ≥ 80 | Ideal conditions | Green #4CAF50 |
| ≥ 60 | Good conditions | Lime #8BC34A |
| ≥ 40 | Moderate conditions | Amber #FFC107 |
| < 40 | Challenging conditions | Orange #FF9800 |

### Temperature Labels
- < 5°C = "Cold"
- 5-12°C = "Cool"
- 12-18°C = "Ideal"
- 18-25°C = "Warm"
- ≥ 25°C = "Hot"

### Component Details
- **Location**: `RunSummaryScreen.kt` - `WeatherPerformanceCard()` function (completely rewritten)
- **Layout**:
  - Header with title and large WPI score in colored circle
  - Temperature row with label
  - Filled/unfilled score bar (visual representation of WPI out of 100)
  - Weather condition display (optional)
  - Rating badge with colored background
  - Helpful footnote about optimal running temperature

### Display Logic
Only shown when `run.weatherAtStart != null` in the Graphs tab content.

---

## Component 3: Weather Data Tab Section

### What it does
Simple key-value rows showing raw weather data collected during the run.

### Component Details
- **Location**: `RunSummaryScreen.kt` - `WeatherCardFlagship()` function (updated)
- **Data displayed**:
  - Condition (optional, only if not null)
  - Temperature (always shown if temperature != null)
- **Visibility**: Only shown when at least one of `weatherCondition` or `temperature` is non-null

### Code Structure
Updated to match iOS simple two-line format:
```
WEATHER
  Condition     Sunny
  Temperature   22°C
```

---

## Data Flow

### Weather Data Sources
1. **WeatherData model**: Contains temperature, humidity, windSpeed, condition, description
2. **RunSession**: Has `weatherAtStart` and `weatherAtEnd` properties
3. **API Response**: `ComprehensiveRunAnalysis.weatherImpact` (AI-generated text from backend)

### Weather Data Handling
- **Temperature**: Required for WPI calculation
- **Condition**: Optional, displayed if available
- **Wind & Humidity**: Collected but not displayed in new design (simplified per iOS)

---

## Files Modified

### 1. `RunInsightsModels.kt`
- **Change**: Added `weatherImpact` field to `ComprehensiveRunAnalysis` data class
- **Type**: `@SerializedName("weatherImpact") val weatherImpact: String? = null`

### 2. `RunSummaryScreen.kt`
Multiple updates:

#### New Component
- **`WeatherImpactInsightCard()`**: Displays AI-generated weather impact text in AI Insights tab

#### Updated Components
- **`WeatherPerformanceCard()`**: Completely rewritten to match iOS WPI design with proper formula and visual indicators
- **`WeatherCardFlagship()`**: Simplified to show only Condition and Temperature as key-value rows
- **`ComprehensiveAnalysisFlagship()`**: Added call to `WeatherImpactInsightCard()` when weather impact is available

#### Removed Components
- **`WeatherMetricFlagship()`**: No longer needed (was showing individual metrics)

---

## Weather Fallback Logic

Per iOS design, fallback text should activate for older runs or when AI analysis hasn't been generated:

| Condition | Message |
|-----------|---------|
| temp ≥ 28°C | Heat affected pace — expect 5-10% slower, hydration key |
| temp ≤ 5°C | Cold stiffened muscles, warm-up km likely slower |
| temp 12-18°C | Near-ideal conditions, in your favour today |
| condition contains "rain" | Wet footing adds mental resistance |
| condition contains "wind"/"storm" | Increases energy expenditure |

**Implementation Note**: This logic would be implemented in the backend when `weatherImpact` is null or not provided by the AI.

---

## Historical Context

The iOS implementation includes using **all runs in the last 12 months or 30 sessions** for the full weather analysis. This data aggregation happens on the backend and is not directly reflected in the Android client code but should be considered when the backend computes user weather performance trends.

---

## Testing Checklist

- [ ] AI Weather Insight card displays when `weatherImpact` is present in API response
- [ ] AI Weather Insight card is hidden when `weatherImpact` is null
- [ ] Weather Performance Index score calculates correctly based on temperature
- [ ] WPI color changes appropriately based on score bands (green/lime/amber/orange)
- [ ] Temperature label updates correctly for different temperature ranges
- [ ] Score bar fills proportionally to WPI percentage
- [ ] Weather condition is shown/hidden based on availability
- [ ] Weather Data Tab shows only condition (optional) and temperature rows
- [ ] All components are hidden when weather data is not available
- [ ] Layout matches iOS design and spacing

---

## API Contract Notes

The backend should return:
```json
{
  "analysis": {
    "summary": "...",
    "performanceScore": 85,
    "weatherImpact": "Running in 27°C heat likely contributed to your pace dropping in the final 3km...",
    ...
  }
}
```

The `weatherImpact` field is optional and can be null for older runs or if AI analysis is unavailable.
