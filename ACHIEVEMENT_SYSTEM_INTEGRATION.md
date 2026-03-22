# Run Achievement System Integration Guide

## Overview

This document describes how to integrate the new **Run Achievement Badge System** into the AI Run Coach app. The system awards personal best badges when users complete run sessions that meet specific distance and pace criteria.

## Achievement Types

The system recognizes the following achievements:

1. **Personal Best 1K** - Fastest 1K time (0.95-1.1km)
2. **Personal Best 1 Mile** - Fastest mile time (1.559-1.71km)
3. **Personal Best 5K** - Fastest 5K time (4.95-5.1km)
4. **Personal Best 10K** - Fastest 10K time (9.95-10.1km)
5. **Personal Best Half Marathon** - Fastest HM time (21.05-21.2km)
6. **Personal Best Marathon** - Fastest marathon time (42.15-42.3km)
7. **Fastest Km** - Fastest single kilometer split recorded
8. **Fastest Mile** - Fastest single mile split recorded

### Distance Tolerance Rules

- **Under tolerance**: 50 meters (e.g., 9.95km counts as 10km PB attempt)
- **Over tolerance**: 100 meters (e.g., 10.1km still counts as 10km PB attempt)

### Conflicting Achievements

- **Rule**: A user cannot earn both 5K PB and 10K PB in the same run
- If a run qualifies for both, only the 5K PB is awarded

## Backend Implementation

### Files Created/Modified

1. **`server/achievements-service.ts`** (NEW)
   - Core logic for calculating achievements
   - Pace parsing and comparison
   - Database queries for previous bests
   - Fastest segment detection

2. **`server/routes-achievements.ts`** (NEW)
   - API endpoint: `POST /api/runs/:runId/achievements`
   - API endpoint: `GET /api/users/:userId/achievements`

3. **`server/routes.ts`** (MODIFY)
   - Add achievement calculation call in `POST /api/runs` endpoint
   - Include achievements in run response

### Integration Steps - Backend

1. **In the POST /api/runs endpoint**, after run is successfully created, add:

```typescript
// After run creation is successful
const achievements = await achievementsService.calculateRunAchievements(
  userId,
  run.id,
  run.distance || 0,
  run.avgPace,
  run.kmSplits
);

// Include in response
return res.json({
  success: true,
  data: {
    run,
    achievements // Include this in the response
  }
});
```

2. **Register the new route** in `server/index.ts`:

```typescript
import achievementsRouter from './routes-achievements';
app.use('/api', achievementsRouter);
```

## Android Implementation

### Files Created/Modified

1. **`app/src/main/java/live/airuncoach/airuncoach/domain/model/RunAchievements.kt`** (NEW)
   - `RunAchievement` data class
   - Contains: type, title, description, icon, color, category, improvement metrics

2. **`app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSession.kt`** (MODIFIED)
   - Added `achievements: List<RunAchievement>` property

3. **`app/src/main/java/live/airuncoach/airuncoach/ui/components/AchievementBadge.kt`** (NEW)
   - `AchievementBadgePopup()` - Full-screen celebration badge
   - `AchievementBadgeItem()` - Badge item for list display
   - `AchievementBadgesStack()` - Multiple badges container
   - `NoAchievementsState()` - Empty state

4. **`app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt`** (MODIFY)
   - Ensure RunSession/RunResponse includes achievements

### Integration Steps - Android

#### Step 1: Update Run Summary Screen

In `RunSummaryScreen.kt`, add achievement popup display:

```kotlin
// At the top of the screen, show achievements as they're earned
if (runData.achievements.isNotEmpty()) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        runData.achievements.forEach { achievement ->
            AchievementBadgePopup(achievement = achievement, isVisible = true)
        }
    }
}
```

#### Step 2: Add Achievements to Badges Tab

In the **Badges tab** of RunSummaryScreen:

```kotlin
when {
    runData.achievements.isEmpty() -> {
        NoAchievementsState()
    }
    else -> {
        AchievementBadgesStack(achievements = runData.achievements)
    }
}
```

#### Step 3: Display Celebration Animation

When run completes and achievements are loaded:

```kotlin
// In RunSessionViewModel or wherever run completion is handled
val achievements = runResponse.data?.achievements ?: emptyList()
if (achievements.isNotEmpty()) {
    // Show celebration UI
    // Optionally: Play confetti animation
    // Show achievement badges one by one
}
```

## API Contract

### POST /api/runs/:runId/achievements

**Request:**
- Path parameter: `runId` (string)
- Authentication required

**Response:**
```json
{
  "success": true,
  "data": {
    "achievements": [
      {
        "type": "PERSONAL_BEST_5K",
        "title": "Personal Best 5K",
        "description": "New personal record for 5K",
        "icon": "🏆",
        "backgroundColor": "#FFD93D",
        "category": "5K",
        "previousBestPaceMinPerKm": 5.4,
        "improvementPercent": 3.7
      }
    ],
    "count": 1
  }
}
```

### POST /api/runs (Modified)

Now includes achievements in response:

```json
{
  "success": true,
  "data": {
    "run": { /* ...run data... */ },
    "achievements": [ /* ...array of achievements... */ ]
  }
}
```

## Testing Checklist

### Backend Testing

- [ ] Create a test run with distance 5.05km (within 5K tolerance)
- [ ] Verify achievement is calculated
- [ ] Test pace comparison with historical data
- [ ] Test fastest km/mile detection from km splits
- [ ] Verify 5K/10K conflict rule works
- [ ] Test edge cases (first ever run, tie pace)

### Android Testing

- [ ] Display achievements in run summary
- [ ] Show pop-up badge animations
- [ ] Verify badges appear in Badges tab
- [ ] Test with multiple achievements in one run
- [ ] Verify color and styling is correct
- [ ] Test improvement percentage display

## UI/UX Details

### Achievement Badge Colors

- **1K**: Red `#FF6B6B`
- **1 Mile**: Orange `#FF8B3D`
- **5K**: Yellow `#FFD93D`
- **10K**: Green `#6BCB77`
- **Half Marathon**: Blue `#4D96FF`
- **Marathon**: Purple `#9D4EDD`

### Achievement Icons

- **Speed records**: ⚡ (bolt)
- **Distance records**: 🏆 🥇 🎖️ 👑 🏃

### Animation

- Fade in + expand from top
- 200-300ms duration
- Appears after run completion data loads
- Can be dismissed by scrolling or tapping

## Future Enhancements

1. **Persistent Achievement Storage**
   - Store achievements in database for user profile
   - Create achievements leaderboard

2. **Achievement Notifications**
   - Push notification when PB is achieved
   - Social sharing ("Just set a new 5K PB! 🏆")

3. **Streak Tracking**
   - "PB streak" - consecutive runs with achievements
   - "Fastest week" metrics

4. **Goal Integration**
   - Link achievements to user goals
   - "You achieved your goal pace" messaging

5. **Advanced Analytics**
   - "Most improved distance" over time
   - Pace progression chart
   - Seasonal performance trends

## Troubleshooting

### Achievement Not Appearing

1. Check km splits are being sent from frontend
2. Verify avgPace format is "mm:ss/km"
3. Check distance is in km (not meters)
4. Verify user has previous run data for comparison

### Incorrect Distance Classification

1. Check tolerance values: 10m under, 100m over
2. Verify distance field units (should be km)
3. Check pace sorting (lower = faster for running)

### Missing Fastest KM/Mile

1. Ensure kmSplits array is populated
2. Verify pace format in splits
3. Check for null/undefined values in split data

## Code References

- **Achievement calculation**: `server/achievements-service.ts`
- **API routes**: `server/routes-achievements.ts`
- **UI components**: `app/src/main/java/live/airuncoach/airuncoach/ui/components/AchievementBadge.kt`
- **Data models**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/RunAchievements.kt`
