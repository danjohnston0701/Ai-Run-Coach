# iOS Group Run Results Tab — Implementation Brief

## Overview
Add a **Group Run Results tab** to RunSummaryView that displays a leaderboard with sortable stats for all group run participants.

---

## UI Layout

```
┌─────────────────────────────────┐
│ 5K Together                 🔄  │  ← Tab bar at top
│ Leaderboard                     │
├─────────────────────────────────┤
│                                 │
│ 🤖 AI Debrief                   │
│ Finished #2 of 6                │
│                                 │
│ Great effort! You hung with Bob │
│ for the first 2km, then faded   │
│ slightly. Strong finish though. │
│                                 │
├─────────────────────────────────┤
│                                 │
│ [Pace] Time Cadence HR Elevation│  ← Filter chips
│                                 │
│ 🥇 A  Alice      5:31/km        │  ← Leaderboard rows
│ 🥈 B  Bob        5:39/km        │
│ 🥉 C  Carol    [YOU] 5:48/km    │     (highlighted if current user)
│ #4 D  Dave     Still running… │
│                                 │
└─────────────────────────────────┘
```

---

## Key Features

### 1. AI Debrief Card
- Shows AI-generated analysis of the group run
- Displays placement: "Finished #2 of 6"
- States:
  - **Loaded**: Show debrief text
  - **Loading**: "Generating AI debrief…" spinner
  - **Not Requested**: "Get AI Group Debrief" button

### 2. Filter Chips (5 options)
- **Pace** (default) — sorts by avg pace, displays as "5:31/km"
- **Time** — displays as "27:33" (mm:ss) or "1:27:33" (h:mm:ss)
- **Cadence** — displays as "161 spm"
- **HR** — displays as "155 bpm"
- **Elevation** — displays as "+47 m"

Each chip toggles sorting by that stat.

### 3. Leaderboard Rows
Each row shows:
- **Rank**: 🥇 🥈 🥉 or #4, #5, etc.
- **Avatar**: Circle with user's first initial
- **Name**: User display name
- **"YOU" badge**: Only for current user (small pill badge)
- **Status**: "Still running…" if participant hasn't finished
- **Active Stat**: Based on selected filter

**Highlight for current user**:
- Tinted background (primary color at 12% alpha)
- Border at 1.5pt with primary color at 40% alpha

---

## Data Model

```swift
struct GroupRunResultsResponse: Codable {
    let groupRunTitle: String
    let participants: [GroupRunParticipantResult]
}

struct GroupRunParticipantResult: Codable {
    let userId: String
    let userName: String
    let isCurrentUser: Bool
    let stats: GroupRunParticipantStats?  // null if still running
}

struct GroupRunParticipantStats: Codable {
    let distance: Double              // metres
    let duration: Int                 // milliseconds
    let avgPace: String               // "5:31" format
    let avgHeartRate: Int?            // bpm
    let avgCadence: Int?              // spm
    let totalElevationGain: Double?   // metres
}
```

---

## API Calls

```swift
// Load leaderboard
apiService.getGroupRunResults(groupRunId)
  -> GET /api/group-runs/:id/results
  -> Returns GroupRunResultsResponse

// Load AI debrief
apiService.getGroupRunDebrief(groupRunId)
  -> GET /api/group-runs/:id/debrief
  -> Returns GroupRunDebriefResponse (string)

// Refresh leaderboard
// Call getGroupRunResults again with pull-to-refresh
```

---

## State Management

```swift
@State var selectedFilter = "Pace"           // "Pace" | "Time" | "Cadence" | "HR" | "Elevation"
@State var groupRunResults: GroupRunResultsResponse?
@State var groupRunDebrief: String?
@State var isLoadingResults = false
@State var isLoadingDebrief = false

// Sort results based on selected filter
var sortedResults: [GroupRunParticipantResult] {
    let list = groupRunResults?.participants ?? []
    switch selectedFilter {
    case "Pace":
        return list.sorted { 
            ($0.stats?.avgPace ?? "") < ($1.stats?.avgPace ?? "")
        }
    case "Time":
        return list.sorted { 
            ($0.stats?.duration ?? Int.max) < ($1.stats?.duration ?? Int.max)
        }
    case "Cadence":
        return list.sorted { 
            ($0.stats?.avgCadence ?? 0) > ($1.stats?.avgCadence ?? 0)
        }
    case "HR":
        return list.sorted { 
            ($0.stats?.avgHeartRate ?? 0) < ($1.stats?.avgHeartRate ?? 0)
        }
    case "Elevation":
        return list.sorted { 
            ($0.stats?.totalElevationGain ?? 0) > ($1.stats?.totalElevationGain ?? 0)
        }
    default:
        return list
    }
}
```

---

## Component Structure

### GroupRunResultsView
Main container — manages state and data loading.

```swift
struct GroupRunResultsView: View {
    @State var selectedFilter = "Pace"
    @State var groupRunResults: GroupRunResultsResponse?
    @State var groupRunDebrief: String?
    @State var isLoadingResults = false
    @State var isLoadingDebrief = false
    
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Header
                HStack {
                    VStack(alignment: .leading) {
                        Text(groupRunResults?.groupRunTitle ?? "Group Run")
                            .font(.title3.bold())
                        Text("Leaderboard")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Button(action: { refreshResults() }) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                
                // AI Debrief Card
                GroupRunDebriefCard(
                    debrief: groupRunDebrief,
                    isLoading: isLoadingDebrief,
                    onRequest: { requestDebrief() }
                )
                
                // Filter chips
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(["Pace", "Time", "Cadence", "HR", "Elevation"], id: \.self) { filter in
                            FilterChip(
                                title: filter,
                                isSelected: selectedFilter == filter,
                                action: { selectedFilter = filter }
                            )
                        }
                    }
                }
                
                // Leaderboard
                if isLoadingResults {
                    ProgressView()
                } else if sortedResults.isEmpty {
                    Text("No results yet — runners will appear here once they finish.")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(Array(sortedResults.enumerated()), id: \.element.userId) { index, participant in
                        GroupRunLeaderboardRow(
                            rank: index + 1,
                            participant: participant,
                            activeFilter: selectedFilter
                        )
                    }
                }
            }
            .padding()
        }
        .onAppear { loadResults() }
    }
}
```

### FilterChip Component
Reusable chip for stat filtering.

```swift
struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.bold())
                .foregroundColor(isSelected ? .white : .secondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.accentColor : Color(.systemGray6))
                .cornerRadius(999)
        }
    }
}
```

### GroupRunLeaderboardRow Component
Individual leaderboard entry.

```swift
struct GroupRunLeaderboardRow: View {
    let rank: Int
    let participant: GroupRunParticipantResult
    let activeFilter: String
    
    var rankEmoji: String {
        switch rank {
        case 1: return "🥇"
        case 2: return "🥈"
        case 3: return "🥉"
        default: return "#\(rank)"
        }
    }
    
    var statValue: String {
        guard let stats = participant.stats else { return "Still running…" }
        
        switch activeFilter {
        case "Pace": return "\(stats.avgPace)/km"
        case "Time": return formatDuration(stats.duration)
        case "Cadence": return "\(stats.avgCadence ?? 0) spm"
        case "HR": return "\(stats.avgHeartRate ?? 0) bpm"
        case "Elevation": return String(format: "+%.0f m", stats.totalElevationGain ?? 0)
        default: return "—"
        }
    }
    
    var body: some View {
        HStack(spacing: 12) {
            // Rank
            Text(rankEmoji)
                .font(.title3)
                .frame(width: 40, alignment: .leading)
            
            // Avatar
            Circle()
                .fill(Color.accentColor.opacity(0.2))
                .frame(width: 40, height: 40)
                .overlay(
                    Text(String(participant.userName.prefix(1)).uppercased())
                        .font(.body.bold())
                        .foregroundColor(.accentColor)
                )
            
            // Name + YOU badge
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(participant.userName)
                        .font(.body.bold())
                        .lineLimit(1)
                    
                    if participant.isCurrentUser {
                        Text("YOU")
                            .font(.caption2.bold())
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Color.accentColor)
                            .cornerRadius(4)
                    }
                }
                if participant.stats == nil {
                    Text("Still running…")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            // Active stat
            Text(statValue)
                .font(.body.bold())
                .foregroundColor(participant.isCurrentUser ? .accentColor : .primary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            participant.isCurrentUser 
                ? Color.accentColor.opacity(0.12)
                : Color(.systemGray6)
        )
        .overlay(
            participant.isCurrentUser 
                ? RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.accentColor.opacity(0.4), lineWidth: 1.5)
                : nil
        )
        .cornerRadius(12)
    }
    
    func formatDuration(_ ms: Int) -> String {
        let seconds = ms / 1000
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        let secs = seconds % 60
        
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        } else {
            return String(format: "%d:%02d", minutes, secs)
        }
    }
}
```

### GroupRunDebriefCard Component
AI debrief display.

```swift
struct GroupRunDebriefCard: View {
    let debrief: String?
    let isLoading: Bool
    let onRequest: () -> Void
    
    var body: some View {
        if let debrief = debrief {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Text("🤖")
                        .font(.title3)
                    Text("AI Debrief")
                        .font(.body.bold())
                        .foregroundColor(.accentColor)
                    Spacer()
                }
                Text(debrief)
                    .font(.body)
                    .foregroundColor(.primary)
            }
            .padding()
            .background(
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color.accentColor.opacity(0.15),
                        Color(.systemGray6)
                    ]),
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .cornerRadius(16)
        } else if isLoading {
            HStack(spacing: 8) {
                ProgressView()
                    .scaleEffect(0.8)
                Text("Generating AI debrief…")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        } else {
            Button(action: onRequest) {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                    Text("Get AI Group Debrief")
                }
                .foregroundColor(.accentColor)
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }
}
```

---

## Integration Points

1. **Add to RunSummaryView tab bar** — Include "Results" tab alongside existing tabs
2. **Pass groupRunId** — When run is linked to group, pass the ID to results view
3. **Auto-load on appear** — Call `getGroupRunResults()` and auto-link via `completeGroupRun()`
4. **Refresh button** — Pull-to-refresh or button to reload leaderboard

---

## Testing Checklist

- [ ] Load and display leaderboard with 3+ participants
- [ ] Filter by each stat (Pace, Time, Cadence, HR, Elevation) — verify sorting
- [ ] Show "Still running…" for participant without completed stats
- [ ] Highlight current user row with tint + border
- [ ] Load and display AI debrief with rank info
- [ ] Show loading spinner while debrief generates
- [ ] Show "Get AI Debrief" button when not yet requested
- [ ] Refresh leaderboard — updates with new data
- [ ] Empty state — "No results yet…" when no participants finished
