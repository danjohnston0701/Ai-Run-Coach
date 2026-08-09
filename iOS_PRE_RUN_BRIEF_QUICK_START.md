# iOS Pre-Run Brief - Quick Start (5 Minutes)

## The Problem
✅ Android shows a beautiful pre-run brief (AI-generated coaching) before each run  
❌ iOS shows nothing

## The Solution
iOS needs to fetch and display the same brief that Android uses.

---

## API Endpoint (Copy-Paste Ready)

```swift
POST /api/briefing
Authorization: Bearer {authToken}
Content-Type: application/json

// Request body:
{
  "startLocation": { "lat": 40.7128, "lng": -74.0060 },
  "distance": 5.0,                    // km
  "elevationGain": 120,               // m
  "elevationLoss": 110,               // m
  "maxGradientDegrees": 4.5,          // steepest section
  "difficulty": "moderate",           // flat|moderate|hilly|very_hilly
  "hasRoute": true,
  "activityType": "run",
  "weather": {
    "temp": 22,
    "condition": "cloudy",
    "windSpeed": 5,
    "timestamp": 1691234567000,
    "userTimezoneId": "America/New_York"
  },
  "coachName": "Alex",
  "coachGender": "female",
  "coachAccent": "british",
  "coachTone": "energetic"
}

// Response:
{
  "briefing": "Today's a tempo run. The cloud cover means cooler conditions.",
  "intensityAdvice": "Keep your heart rate in zone 3 (around 160-170 bpm).",
  "weatherAdvice": "Light wind from the north. Headwind on the way back.",
  "warnings": [
    "Your body is showing some fatigue. Start conservatively.",
    "Warm conditions — hydrate well every 5 minutes."
  ],
  "readinessInsight": "You're in good shape for a solid effort.",
  "routeInsight": "Final 400m has an 8% gradient — save a little for the finish.",
  "audio": "base64-encoded-mp3-audio",
  "format": "mp3",
  "voice": "british_female_energetic"
}
```

---

## What to Display

| Field | Display | Emoji | Example |
|-------|---------|-------|---------|
| `briefing` | Bold, large | — | "Today's a tempo run. The cloud cover means cooler conditions." |
| `intensityAdvice` | Smaller | 💪 | "Keep your heart rate in zone 3" |
| `weatherAdvice` | Smaller | 🌬️ | "Light wind from the north" |
| `warnings` | Alert red | ⚠️ | "Your body is showing fatigue" |
| `readinessInsight` | Smaller | 📊 | "You're in good shape for effort" |
| `routeInsight` | Smaller | 🗺️ | "Final 400m has 8% gradient" |
| `audio` | (optional) | 🔊 | Play TTS audio |

---

## Implementation Checklist

### 1. Create Models
```swift
struct PreRunBriefResponse: Codable {
    let briefing: String?
    let intensityAdvice: String?
    let weatherAdvice: String?
    let warnings: [String]?
    let readinessInsight: String?
    let routeInsight: String?
    let audio: String?
    let format: String?
}
```

### 2. Add API Method
```swift
func fetchPreRunBrief(request: PreRunBriefRequest) async throws -> PreRunBriefResponse {
    let url = URL(string: "\(baseURL)/api/briefing")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = try JSONEncoder().encode(request)
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
        throw APIError.invalidResponse
    }
    return try JSONDecoder().decode(PreRunBriefResponse.self, from: data)
}
```

### 3. Add ViewModel Properties
```swift
@Published var preRunBrief: PreRunBriefResponse?
@Published var isLoadingBrief = false

func fetchPreRunBrief(location: CLLocationCoordinate2D, distance: Double, ...) {
    isLoadingBrief = true
    Task {
        do {
            let response = try await apiService.fetchPreRunBrief(request: request)
            DispatchQueue.main.async {
                self.preRunBrief = response
                self.isLoadingBrief = false
            }
        } catch {
            DispatchQueue.main.async { self.isLoadingBrief = false }
        }
    }
}
```

### 4. Create UI View
```swift
struct PreRunBriefView: View {
    let brief: PreRunBriefResponse?
    let isLoading: Bool
    
    var body: some View {
        if isLoading {
            ProgressView()
        } else if let brief = brief, let briefing = brief.briefing {
            VStack(alignment: .leading, spacing: 8) {
                Text(briefing).font(.body).fontWeight(.semibold)
                if let intensity = brief.intensityAdvice {
                    Text("💪 \(intensity)").font(.caption)
                }
                if let warnings = brief.warnings {
                    ForEach(warnings, id: \.self) { w in
                        Text("⚠️ \(w)").font(.caption).foregroundColor(.orange)
                    }
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(10)
        }
    }
}
```

### 5. Add to Pre-Run Screen
```swift
PreRunBriefView(
    brief: viewModel.preRunBrief,
    isLoading: viewModel.isLoadingBrief
)
.onAppear {
    viewModel.fetchPreRunBrief(
        location: currentLocation,
        distance: 5.0,
        elevationGain: 120,
        elevationLoss: 110,
        maxGradient: 4.5,
        difficulty: "moderate",
        hasRoute: true
    )
}
```

---

## Testing

1. **Run on simulator** → go to pre-run screen
2. **Check network tab** → should see `POST /api/briefing` request
3. **Look for response** → briefing text should appear on screen
4. **Verify fields** → all emojis and warnings should show
5. **Compare to Android** → should look nearly identical

---

## Common Issues

| Issue | Fix |
|-------|-----|
| Brief doesn't show | Check `briefing` field isn't null in response |
| Warnings don't appear | Check `warnings` array is not empty |
| API fails with 401 | Check Authorization header has Bearer token |
| Location is nil | Must fetch location before calling briefing API |
| No weather data | `weather` can be null, API handles it gracefully |

---

## Full Reference

See `iOS_PRE_RUN_BRIEF.md` for:
- Complete API request/response spec
- Full Swift code examples
- Audio playback implementation
- Integration with existing screens
- Comparison to Android implementation
- Troubleshooting guide

---

**That's it!** You should have a working pre-run brief in iOS within an hour of implementing these steps.

Test against Android to make sure they match! 🎯
