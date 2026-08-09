# iOS Pre-Run Brief Implementation Guide

## Problem Statement

**iOS is missing the pre-run brief** that Android displays before every run. Android shows:
- ✅ AI-generated 2-3 sentence coaching brief
- ✅ Intensity advice (e.g., "💪 Keep it steady and conversational")
- ✅ Warnings (e.g., "⚠️ Headwind on the way back")
- ✅ Readiness insight (e.g., "📊 Your body is ready for a quality effort")
- ✅ Optional intensity advice based on coaching plan

**iOS currently displays nothing** — just a blank loading state.

---

## Solution Overview

iOS needs to:
1. **Fetch the pre-run brief** from the same API endpoint that Android uses
2. **Display it beautifully** in the pre-run screen (before start button is pressed)
3. **Play optional audio** (same TTS as Android)
4. **Update state management** to track briefing loading state

---

## API Endpoint (Android → iOS)

### Request

```swift
// POST /api/briefing
// Header: Authorization: Bearer <token>

let payload: [String: Any] = [
    "startLocation": [
        "lat": 40.7128,
        "lng": -74.0060
    ],
    "distance": 5.0,           // kilometers
    "elevationGain": 120,      // meters
    "elevationLoss": 110,      // meters
    "maxGradientDegrees": 4.5, // steepest section
    "difficulty": "moderate",  // flat|moderate|hilly|very_hilly
    "hasRoute": true,          // has GPS route
    "activityType": "run",     // run|walk
    
    // Target/plan context (if applicable)
    "targetTime": 1800,        // seconds (optional)
    "targetPace": "6:00/km",   // string (optional)
    
    // Weather data
    "weather": [
        "temp": 22,            // Celsius
        "condition": "cloudy",
        "windSpeed": 5,        // km/h
        "timestamp": 1691234567000,  // epoch millis
        "userTimezoneId": "America/New_York"
    ],
    
    // Coach personality
    "coachName": "Alex",
    "coachGender": "female",
    "coachAccent": "british",
    "coachTone": "energetic",
    
    // Optional: Training plan context
    "trainingPlanId": "plan_123",
    "planGoalType": "5k_race",
    "planWeekNumber": 4,
    "planTotalWeeks": 12,
    "workoutType": "tempo",
    "workoutIntensity": "z3",
    "workoutDescription": "20 min tempo at lactate threshold"
]
```

### Response

```json
{
  "briefing": "Today's a tempo run at lactate threshold. We're doing 20 minutes at a hard but sustainable effort. The cloud cover means cooler conditions — perfect for pushing.",
  "intensityAdvice": "Keep your heart rate in zone 3 (around 160-170 bpm). Push the pace but stay controlled.",
  "weatherAdvice": "Light wind from the north. Expect a headwind on the way back — practice power on climbs.",
  "warnings": [
    "Your body is showing some fatigue today. Start conservatively and build in.",
    "Warm conditions — hydrate well every 5 minutes."
  ],
  "readinessInsight": "You're in good shape for a solid effort. You have the energy for this tempo session.",
  "routeInsight": "Final 400m has an 8% gradient — save a little for the finish.",
  "audio": "base64-encoded-mp3-audio",
  "format": "mp3",
  "voice": "british_female_energetic"
}
```

### Fields Explained

| Field | Type | Example | Use |
|-------|------|---------|-----|
| `briefing` | string | "Today's a tempo run..." | Main brief (2-3 sentences). Display prominently at top. |
| `intensityAdvice` | string | "Keep HR in zone 3..." | How to feel during run. Show with 💪 emoji. |
| `weatherAdvice` | string | "Light wind from north..." | Weather impact. Show with 🌬️ emoji. Can be null. |
| `warnings` | array | ["Hydrate well", "Start slow"] | ⚠️ warnings. Show each on separate line. Can be empty. |
| `readinessInsight` | string | "Your body is ready..." | Wellness feedback. Show with 📊 emoji. Can be null. |
| `routeInsight` | string | "Final 400m is steep..." | Terrain/route challenge. Can be null. |
| `audio` | string | base64 MP3 data | Optional TTS audio. Play or skip. |
| `format` | string | "mp3" | Audio format (always "mp3" if present). |
| `voice` | string | "british_female_energetic" | Voice used for audio. |

---

## Implementation Steps

### Step 1: Create Models

**Create `PreRunBrief.swift`:**

```swift
import Foundation

struct PreRunBriefRequest: Codable {
    let startLocation: Location
    let distance: Double?
    let elevationGain: Int
    let elevationLoss: Int
    let maxGradientDegrees: Double
    let difficulty: String
    let hasRoute: Bool
    let activityType: String
    let targetTime: Int?
    let targetPace: String?
    let weather: Weather?
    let coachName: String?
    let coachGender: String?
    let coachAccent: String?
    let coachTone: String?
    let trainingPlanId: String?
    let planGoalType: String?
    let planWeekNumber: Int?
    let planTotalWeeks: Int?
    let workoutType: String?
    let workoutIntensity: String?
    let workoutDescription: String?
}

struct Location: Codable {
    let lat: Double
    let lng: Double
}

struct Weather: Codable {
    let temp: Int
    let condition: String
    let windSpeed: Int
    let timestamp: Int64?
    let userTimezoneId: String?
}

struct PreRunBriefResponse: Codable {
    let briefing: String?
    let intensityAdvice: String?
    let weatherAdvice: String?
    let warnings: [String]?
    let readinessInsight: String?
    let routeInsight: String?
    let audio: String?  // base64-encoded MP3
    let format: String?
    let voice: String?
    
    /// Get the full briefing text for display
    func getFullBriefingText() -> String {
        var parts: [String] = []
        
        if let briefing = briefing?.trimmingCharacters(in: .whitespaces), !briefing.isEmpty {
            parts.append(briefing)
        }
        
        if let intensity = intensityAdvice?.trimmingCharacters(in: .whitespaces), !intensity.isEmpty {
            parts.append("💪 \(intensity)")
        }
        
        if let weather = weatherAdvice?.trimmingCharacters(in: .whitespaces), !weather.isEmpty {
            parts.append("🌬️ \(weather)")
        }
        
        if let warnings = warnings, !warnings.isEmpty {
            for warning in warnings {
                parts.append("⚠️ \(warning)")
            }
        }
        
        if let readiness = readinessInsight?.trimmingCharacters(in: .whitespaces), !readiness.isEmpty {
            parts.append("📊 \(readiness)")
        }
        
        if let route = routeInsight?.trimmingCharacters(in: .whitespaces), !route.isEmpty {
            parts.append("🗺️ \(route)")
        }
        
        return parts.joined(separator: "\n\n")
    }
}
```

### Step 2: Update API Service

**In your existing APIService:**

```swift
func fetchPreRunBrief(request: PreRunBriefRequest) async throws -> PreRunBriefResponse {
    let endpoint = "\(baseURL)/api/briefing"
    let url = URL(string: endpoint)!
    
    var urlRequest = URLRequest(url: url)
    urlRequest.httpMethod = "POST"
    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    if let token = authToken {
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    
    let encoder = JSONEncoder()
    urlRequest.httpBody = try encoder.encode(request)
    
    let (data, response) = try await URLSession.shared.data(for: urlRequest)
    
    guard let httpResponse = response as? HTTPURLResponse,
          (200...299).contains(httpResponse.statusCode) else {
        throw APIError.invalidResponse
    }
    
    let decoder = JSONDecoder()
    return try decoder.decode(PreRunBriefResponse.self, from: data)
}
```

### Step 3: Update ViewModel

**Add to your run session view model:**

```swift
@Published var preRunBrief: PreRunBriefResponse?
@Published var isLoadingBrief = false
@Published var briefError: String?

func fetchPreRunBrief(
    location: CLLocationCoordinate2D,
    distance: Double,
    elevationGain: Int,
    elevationLoss: Int,
    maxGradient: Double,
    difficulty: String,
    hasRoute: Bool,
    activityType: String = "run"
) {
    isLoadingBrief = true
    briefError = nil
    
    Task {
        do {
            let request = PreRunBriefRequest(
                startLocation: Location(lat: location.latitude, lng: location.longitude),
                distance: distance,
                elevationGain: elevationGain,
                elevationLoss: elevationLoss,
                maxGradientDegrees: maxGradient,
                difficulty: difficulty,
                hasRoute: hasRoute,
                activityType: activityType,
                targetTime: nil,
                targetPace: nil,
                weather: getWeatherData(),
                coachName: userSettings.coachName,
                coachGender: userSettings.coachGender,
                coachAccent: userSettings.coachAccent,
                coachTone: userSettings.coachTone,
                trainingPlanId: nil,
                planGoalType: nil,
                planWeekNumber: nil,
                planTotalWeeks: nil,
                workoutType: nil,
                workoutIntensity: nil,
                workoutDescription: nil
            )
            
            let response = try await apiService.fetchPreRunBrief(request: request)
            
            DispatchQueue.main.async {
                self.preRunBrief = response
                self.isLoadingBrief = false
                
                // Optional: Play audio if available
                if let audioBase64 = response.audio, !audioBase64.isEmpty {
                    self.playBriefingAudio(audioBase64)
                }
            }
        } catch {
            DispatchQueue.main.async {
                self.briefError = error.localizedDescription
                self.isLoadingBrief = false
            }
        }
    }
}

private func getWeatherData() -> Weather? {
    guard let location = currentLocation else { return nil }
    
    return Weather(
        temp: Int(currentWeather.temperature ?? 20),
        condition: currentWeather.condition ?? "clear",
        windSpeed: Int(currentWeather.windSpeed ?? 0),
        timestamp: Int64(Date().timeIntervalSince1970 * 1000),
        userTimezoneId: TimeZone.current.identifier
    )
}

private func playBriefingAudio(_ audioBase64: String) {
    guard let audioData = Data(base64Encoded: audioBase64) else { return }
    
    let tempFile = FileManager.default.temporaryDirectory.appendingPathComponent("briefing.mp3")
    try? audioData.write(to: tempFile)
    
    audioPlayer = try? AVAudioPlayer(contentsOf: tempFile)
    audioPlayer?.play()
}
```

### Step 4: Create Pre-Run Brief UI Component

**Create `PreRunBriefView.swift`:**

```swift
import SwiftUI

struct PreRunBriefView: View {
    let brief: PreRunBriefResponse?
    let isLoading: Bool
    let error: String?
    
    var body: some View {
        VStack(spacing: 12) {
            if isLoading {
                HStack(spacing: 8) {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Preparing your briefing...")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding()
            } else if let error = error {
                VStack(spacing: 8) {
                    Label("Unable to load briefing", systemImage: "exclamationmark.circle")
                        .foregroundColor(.red)
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding()
            } else if let brief = brief, let briefText = brief.briefing, !briefText.isEmpty {
                // Main briefing
                VStack(alignment: .leading, spacing: 12) {
                    // Main brief text
                    Text(briefText)
                        .font(.body)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                        .lineLimit(nil)
                    
                    // Intensity advice
                    if let intensity = brief.intensityAdvice, !intensity.isEmpty {
                        HStack(spacing: 6) {
                            Text("💪")
                            Text(intensity)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    // Weather advice
                    if let weather = brief.weatherAdvice, !weather.isEmpty {
                        HStack(spacing: 6) {
                            Text("🌬️")
                            Text(weather)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    // Warnings
                    if let warnings = brief.warnings, !warnings.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(warnings, id: \.self) { warning in
                                HStack(spacing: 6) {
                                    Text("⚠️")
                                    Text(warning)
                                        .font(.caption)
                                        .foregroundColor(.orange)
                                }
                            }
                        }
                    }
                    
                    // Readiness insight
                    if let readiness = brief.readinessInsight, !readiness.isEmpty {
                        HStack(spacing: 6) {
                            Text("📊")
                            Text(readiness)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    // Route insight
                    if let route = brief.routeInsight, !route.isEmpty {
                        HStack(spacing: 6) {
                            Text("🗺️")
                            Text(route)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(12)
                .background(Color(.systemGray6))
                .cornerRadius(10)
            }
        }
    }
}

#Preview {
    PreRunBriefView(
        brief: PreRunBriefResponse(
            briefing: "Today's a tempo run at lactate threshold. We're doing 20 minutes at a hard but sustainable effort. The cloud cover means cooler conditions — perfect for pushing.",
            intensityAdvice: "Keep your heart rate in zone 3 (around 160-170 bpm). Push the pace but stay controlled.",
            weatherAdvice: "Light wind from the north. Expect a headwind on the way back.",
            warnings: ["Your body is showing some fatigue. Start conservatively."],
            readinessInsight: "You're in good shape for a solid effort.",
            routeInsight: "Final 400m has an 8% gradient — save a little for the finish.",
            audio: nil,
            format: nil,
            voice: nil
        ),
        isLoading: false,
        error: nil
    )
}
```

### Step 5: Integrate into Pre-Run Screen

**In your pre-run setup screen (before the Start button):**

```swift
VStack(spacing: 16) {
    // Route info / map
    MapView(route: route)
        .frame(height: 200)
    
    // 🆕 PRE-RUN BRIEF (NEW!)
    PreRunBriefView(
        brief: viewModel.preRunBrief,
        isLoading: viewModel.isLoadingBrief,
        error: viewModel.briefError
    )
    
    // Workout details
    WorkoutDetailsView(workout: workout)
    
    // Start button
    Button(action: startRun) {
        Text("Start Run")
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(10)
    }
    .disabled(viewModel.isLoadingBrief)
}
.onAppear {
    // Fetch the brief when screen appears
    viewModel.fetchPreRunBrief(
        location: currentLocation,
        distance: plannedDistance,
        elevationGain: elevationGain,
        elevationLoss: elevationLoss,
        maxGradient: maxGradient,
        difficulty: difficulty,
        hasRoute: hasRoute
    )
}
```

---

## Android Implementation Reference

For comparison, here's how Android displays the pre-run brief:

### Android Pre-Run Brief Display
```kotlin
// app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSessionScreen.kt (line ~1636)

Text(
    text = message.orEmpty(),  // Main briefing text
    style = AppTextStyles.body,
    color = Colors.primary,
    textAlign = TextAlign.Center,
    fontWeight = FontWeight.Medium,
    fontSize = 12.sp
)

// Intensity advice with emoji
briefingResponse?.intensityAdvice?.takeIf { it.isNotBlank() }?.let {
    Text(
        text = "💪 $it",
        style = AppTextStyles.caption,
        color = Colors.primary.copy(alpha = 0.8f),
        textAlign = TextAlign.Center,
        fontSize = 11.sp
    )
}

// Warnings with emoji
briefingResponse?.warnings?.takeIf { it.isNotEmpty() }?.let { warnings ->
    warnings.forEach { warning ->
        Text(
            text = "⚠️ $warning",
            style = AppTextStyles.caption,
            color = Colors.warning,
            textAlign = TextAlign.Center,
            fontSize = 10.sp
        )
    }
}

// Readiness insight
briefingResponse?.readinessInsight?.takeIf { it.isNotBlank() }?.let {
    Text(
        text = "📊 $it",
        style = AppTextStyles.caption,
        color = Colors.primary.copy(alpha = 0.7f),
        textAlign = TextAlign.Center,
        fontSize = 10.sp
    )
}
```

### Android Flow
1. **Screen opens** → `onAppear` → fetch pre-run briefing
2. **API called** → `POST /api/briefing` with route/weather/user data
3. **Response received** → update `latestCoachMessage` and `briefingResponse`
4. **UI updates** → show briefing text + intensity + warnings + readiness
5. **Audio plays** → optional TTS audio if available
6. **User taps Start** → briefing continues to play, run begins

---

## Testing Checklist

- [ ] **API connection**: Verify briefing endpoint returns 200 OK
- [ ] **Brief display**: Briefing text appears before Start button
- [ ] **Intensity advice**: 💪 emoji + advice visible
- [ ] **Warnings**: ⚠️ warnings show in orange if present
- [ ] **Readiness**: 📊 insight displays if available
- [ ] **Route insight**: 🗺️ terrain details if hasRoute=true
- [ ] **Audio playback**: Optional TTS audio plays (or skip gracefully)
- [ ] **Error handling**: Graceful fallback if briefing fails
- [ ] **UI responsiveness**: Brief loads while user reviews map/route
- [ ] **Comparison**: Brief content matches Android version

---

## Common Gotchas

### ❌ Don't Do This

```swift
// ❌ Not showing brief at all
startRun() {
    // Skip briefing entirely
}

// ❌ Showing generic text
"Ready to run?"

// ❌ Ignoring warnings
showBriefing() {
    // Only show briefing, skip warnings
}
```

### ✅ Do This

```swift
// ✅ Fetch and display full brief
onAppear {
    viewModel.fetchPreRunBrief(...)
}

// ✅ Show all available fields
PreRunBriefView(brief: viewModel.preRunBrief, ...)

// ✅ Include warnings, emojis, all fields
```

---

## Next Steps

1. **Implement Models** → Copy `PreRunBrief.swift` code
2. **Add API method** → Copy `fetchPreRunBrief()` code
3. **Update ViewModel** → Add brief fetching and state
4. **Create UI** → Copy `PreRunBriefView.swift`
5. **Integrate into screen** → Add brief view to pre-run screen
6. **Test** → Verify briefing appears and matches Android
7. **Deploy** → Roll out to iOS users

---

## Full Example Screen

Here's a complete pre-run screen with brief integrated:

```swift
struct PreRunScreen: View {
    @StateObject var viewModel: RunSessionViewModel
    @Environment(\.dismiss) var dismiss
    @State private var selectedRoute: Route?
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Header
                    HStack {
                        Text("Ready to Run?")
                            .font(.title2)
                            .fontWeight(.bold)
                        Spacer()
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding()
                    
                    // Route Map
                    if let route = selectedRoute {
                        MapView(route: route)
                            .frame(height: 200)
                            .cornerRadius(10)
                    }
                    
                    // BRIEFING (NEW!)
                    PreRunBriefView(
                        brief: viewModel.preRunBrief,
                        isLoading: viewModel.isLoadingBrief,
                        error: viewModel.briefError
                    )
                    .padding()
                    
                    // Workout Details
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Distance: 5.0 km", systemImage: "map")
                        Label("Difficulty: Moderate", systemImage: "chart.bar")
                        Label("Elevation: 120m", systemImage: "triangle")
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(10)
                    .padding(.horizontal)
                    
                    Spacer()
                    
                    // Start Button
                    Button {
                        viewModel.startRun()
                    } label: {
                        Text("Start Run")
                            .frame(maxWidth: .infinity)
                            .padding(16)
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    .disabled(viewModel.isLoadingBrief)
                    .padding()
                }
            }
            .onAppear {
                // Fetch briefing when screen loads
                viewModel.fetchPreRunBrief(
                    location: CLLocationCoordinate2D(latitude: 40.7128, longitude: -74.0060),
                    distance: 5.0,
                    elevationGain: 120,
                    elevationLoss: 110,
                    maxGradient: 4.5,
                    difficulty: "moderate",
                    hasRoute: true
                )
            }
        }
    }
}
```

---

## Support

If the briefing doesn't appear:

1. **Check API response** — Log the JSON response in Xcode debugger
2. **Verify fields** — Ensure `briefing` field is not null
3. **Check location** — Ensure CLLocationCoordinate2D is valid
4. **Test with Android first** — Confirm briefing API works there
5. **Check timezone** — Ensure `userTimezoneId` is set correctly

---

**Questions?** The briefing endpoint is at `POST /api/briefing` on your backend. Use Postman or curl to test manually before integrating into iOS.
