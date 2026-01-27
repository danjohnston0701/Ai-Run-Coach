# 🔧 Backend Implementation Plan

## Overview
The database tables are created, but now you need **backend logic** to:
1. Calculate complex metrics (Fitness, TSS, GAP)
2. Match GPS tracks to segments
3. Generate AI training plans
4. Build activity feeds
5. Serve data via API endpoints

---

## ✅ What's Already Done (Client-Side)

These work WITHOUT backend changes:
- ✅ GAP calculation (`GAPCalculator.kt` - runs on device)
- ✅ Basic run tracking
- ✅ Route display
- ✅ Simple statistics

---

## 🔴 CRITICAL: Backend Work Required

### 1. **Fitness & Freshness** 🔴 HIGH PRIORITY

**What it does:** Calculate CTL/ATL/TSB from historical runs

**Backend endpoints needed:**
```javascript
// File: backend/routes/fitness.js

// Calculate fitness trend for user
GET /api/fitness/trend/{userId}?days=90
Response: {
  dailyMetrics: [
    { date: "2024-01-27", ctl: 45.2, atl: 38.5, tsb: 6.7, ... }
  ],
  currentFitness: 45.2,
  currentFatigue: 38.5,
  currentForm: 6.7,
  trainingStatus: "OPTIMAL",
  recommendations: ["Perfect form for a race!"]
}

// Get current fitness snapshot
GET /api/fitness/current/{userId}
Response: {
  fitness: 45.2,
  fatigue: 38.5,
  form: 6.7,
  status: "OPTIMAL",
  injuryRisk: "LOW"
}

// Calculate historical fitness (run once to populate)
POST /api/fitness/calculate-historical/{userId}
Body: { startDate: "2024-01-01", endDate: "2024-01-27" }
Response: { calculated: 90, inserted: 90 }
```

**Implementation:**
```javascript
// backend/services/fitnessCalculator.js

class FitnessCalculator {
  constructor(db) {
    this.db = db;
    this.CTL_DAYS = 42;  // Fitness time constant
    this.ATL_DAYS = 7;   // Fatigue time constant
  }

  async calculateTrend(userId, days = 90) {
    // 1. Get all runs for user in date range
    const runs = await this.db.query(`
      SELECT date, 
             SUM(tss) as daily_tss 
      FROM runs 
      WHERE user_id = $1 
        AND date >= NOW() - INTERVAL '${days} days'
      GROUP BY date 
      ORDER BY date
    `, [userId]);

    // 2. Calculate CTL/ATL/TSB for each day
    let ctl = 0, atl = 0;
    const dailyMetrics = [];

    for (const run of runs) {
      const tss = run.daily_tss || 0;
      
      // Exponential moving average
      ctl = ctl + (tss - ctl) * (1 / this.CTL_DAYS);
      atl = atl + (tss - atl) * (1 / this.ATL_DAYS);
      const tsb = ctl - atl;

      dailyMetrics.push({
        date: run.date,
        ctl: ctl,
        atl: atl,
        tsb: tsb,
        trainingLoad: tss,
        trainingStatus: this.determineStatus(tsb),
        injuryRisk: this.assessInjuryRisk(ctl, atl, tss)
      });

      // 3. Insert/update in database
      await this.db.query(`
        INSERT INTO daily_fitness 
        (user_id, date, ctl, atl, tsb, training_load, training_status, injury_risk)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, date) 
        DO UPDATE SET ctl = $3, atl = $4, tsb = $5
      `, [userId, run.date, ctl, atl, tsb, tss, 
          this.determineStatus(tsb), 
          this.assessInjuryRisk(ctl, atl, tss)]);
    }

    return {
      dailyMetrics,
      currentFitness: ctl,
      currentFatigue: atl,
      currentForm: tsb,
      trainingStatus: this.determineStatus(tsb),
      recommendations: this.generateRecommendations(tsb, ctl, atl)
    };
  }

  determineStatus(tsb) {
    if (tsb < -30) return 'OVERTRAINED';
    if (tsb < -10) return 'STRAINED';
    if (tsb < 5) return 'OPTIMAL';
    if (tsb < 25) return 'FRESH';
    return 'DETRAINING';
  }

  assessInjuryRisk(ctl, atl, todayTss) {
    const rampRate = todayTss / ctl;
    if (rampRate > 8) return 'CRITICAL';
    if (rampRate > 6) return 'HIGH';
    if (rampRate > 4) return 'MODERATE';
    return 'LOW';
  }

  generateRecommendations(tsb, ctl, atl) {
    const recommendations = [];
    if (tsb < -30) {
      recommendations.push('⚠️ Overtrained. Take 2-3 rest days immediately.');
    } else if (tsb > -10 && tsb < 5) {
      recommendations.push('Perfect form for a race or hard workout!');
    }
    // ... more logic
    return recommendations;
  }
}

module.exports = FitnessCalculator;
```

**Estimated time:** 2-3 days

---

### 2. **Segment Matching** 🔴 HIGH PRIORITY

**What it does:** Detect when a run matches known segments

**Backend endpoints:**
```javascript
// Find segments near a location
GET /api/segments/nearby?lat=37.7749&lng=-122.4194&radius=5000
Response: [
  { id: "uuid", name: "Hill Climb", distance: 1200, ... }
]

// Get segment leaderboard
GET /api/segments/{segmentId}/leaderboard?period=all_time
Response: {
  segment: { name: "Hill Climb", ... },
  leaderboard: [
    { rank: 1, userName: "Alice", time: 225000, isPR: false, isKOM: true }
  ],
  yourBest: { rank: 12, time: 245000 },
  komTime: 225000
}

// Match run to segments (called after run upload)
POST /api/segments/match
Body: { runId: "uuid", routePoints: [...] }
Response: {
  matches: [
    { 
      segment: { name: "Hill Climb" },
      effort: { time: 235000, rank: 8 },
      newPR: true,
      improvement: 10000
    }
  ]
}
```

**Implementation:**
```javascript
// backend/services/segmentMatcher.js

class SegmentMatcher {
  async matchRunToSegments(runId, routePoints) {
    // 1. Get all segments near this run's path
    const bounds = this.calculateBounds(routePoints);
    const nearbySegments = await this.db.query(`
      SELECT * FROM segments
      WHERE start_lat BETWEEN $1 AND $2
        AND start_lng BETWEEN $3 AND $4
    `, [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng]);

    const matches = [];

    // 2. For each segment, check if run's GPS track matches
    for (const segment of nearbySegments) {
      const match = this.findSegmentMatch(routePoints, segment);
      
      if (match) {
        // 3. Calculate effort metrics
        const effort = {
          segmentId: segment.id,
          runId: runId,
          elapsedTime: match.duration,
          movingTime: match.movingDuration,
          startTime: match.startTime
        };

        // 4. Insert effort into database
        await this.insertEffort(effort);

        // 5. Update leaderboard ranks
        await this.updateRanks(segment.id);

        // 6. Check if it's a PR
        const isPR = await this.checkIfPR(userId, segment.id, match.duration);

        matches.push({
          segment,
          effort,
          newPR: isPR,
          improvement: isPR ? await this.calculateImprovement(userId, segment.id, match.duration) : null
        });
      }
    }

    return matches;
  }

  findSegmentMatch(routePoints, segment) {
    // Simplified Douglas-Peucker matching algorithm
    // 1. Find if run's GPS track contains segment's path
    // 2. Use distance threshold (e.g., 50m from segment line)
    // 3. Return start/end indices and duration
    
    const segmentPath = segment.route_points;
    let matchStart = null;
    let matchEnd = null;

    // Look for segment start point in run
    for (let i = 0; i < routePoints.length; i++) {
      const distance = this.haversineDistance(
        routePoints[i].lat,
        routePoints[i].lng,
        segmentPath[0].lat,
        segmentPath[0].lng
      );

      if (distance < 50) { // Within 50m
        matchStart = i;
        break;
      }
    }

    if (!matchStart) return null;

    // Look for segment end point
    for (let i = matchStart; i < routePoints.length; i++) {
      const distance = this.haversineDistance(
        routePoints[i].lat,
        routePoints[i].lng,
        segmentPath[segmentPath.length - 1].lat,
        segmentPath[segmentPath.length - 1].lng
      );

      if (distance < 50) {
        matchEnd = i;
        break;
      }
    }

    if (!matchEnd) return null;

    // Calculate duration
    const duration = routePoints[matchEnd].timestamp - routePoints[matchStart].timestamp;

    return {
      startIndex: matchStart,
      endIndex: matchEnd,
      duration: duration,
      movingDuration: this.calculateMovingTime(routePoints.slice(matchStart, matchEnd + 1)),
      startTime: routePoints[matchStart].timestamp
    };
  }

  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  async updateRanks(segmentId) {
    // Update all ranks for this segment
    await this.db.query(`
      WITH ranked AS (
        SELECT 
          id,
          ROW_NUMBER() OVER (ORDER BY elapsed_time) as new_rank,
          PERCENT_RANK() OVER (ORDER BY elapsed_time DESC) * 100 as percentile
        FROM segment_efforts
        WHERE segment_id = $1
      )
      UPDATE segment_efforts se
      SET 
        leaderboard_rank = r.new_rank,
        percentile_rank = r.percentile,
        is_kom = (r.new_rank = 1)
      FROM ranked r
      WHERE se.id = r.id
    `, [segmentId]);
  }
}

module.exports = SegmentMatcher;
```

**Estimated time:** 4-5 days

---

### 3. **Training Plans (AI Generation)** 🟡 MEDIUM PRIORITY

**What it does:** Generate personalized training plans using AI

**Backend endpoints:**
```javascript
// Generate AI training plan
POST /api/training-plans/generate
Body: {
  userId: "uuid",
  goal: {
    type: "DISTANCE_10K",
    targetTime: 2700000,  // 45 minutes in ms
    raceDate: "2024-03-15"
  },
  fitnessLevel: "INTERMEDIATE"
}
Response: {
  planId: "uuid",
  name: "10K Sub-45 Plan",
  weeks: 8,
  workouts: [ ... ]
}

// Get user's active plan
GET /api/training-plans/{userId}/active
Response: { plan: {...}, progress: {...} }

// Mark workout complete
POST /api/training-plans/workouts/{workoutId}/complete
Body: { runId: "uuid" }
Response: { 
  executionScore: 87.5,
  adaptations: ["Great job! Next tempo run will be 5% faster"]
}
```

**Implementation:**
```javascript
// backend/services/trainingPlanGenerator.js

class TrainingPlanGenerator {
  async generatePlan(userId, goal, fitnessLevel) {
    // 1. Get user's fitness history
    const fitnessData = await this.getFitnessHistory(userId);
    const recentRuns = await this.getRecentRuns(userId, 30);

    // 2. Build AI prompt
    const prompt = this.buildPrompt(goal, fitnessLevel, fitnessData, recentRuns);

    // 3. Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an elite running coach creating personalized training plans.
          Return a JSON training plan with weekly workouts.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    // 4. Parse AI response
    const planData = JSON.parse(completion.choices[0].message.content);

    // 5. Save to database
    const plan = await this.savePlan(userId, planData, goal);

    return plan;
  }

  buildPrompt(goal, fitnessLevel, fitnessData, recentRuns) {
    return `
Create a ${goal.type} training plan with these parameters:

GOAL:
- Distance: ${goal.targetDistance}m
- Target Time: ${this.formatTime(goal.targetTime)}
- Race Date: ${goal.raceDate}
- Fitness Level: ${fitnessLevel}

CURRENT FITNESS:
- CTL (Fitness): ${fitnessData.ctl}
- Weekly Mileage: ${this.calculateWeeklyMileage(recentRuns)}km
- Recent Average Pace: ${this.calculateAveragePace(recentRuns)}

REQUIREMENTS:
- Return JSON with: { weeks: [], peakWeek: 6, taperWeeks: 2 }
- Each week contains: { weekNumber, workouts: [] }
- Each workout: { day, type, distance, pace, description, intervals }
- Include variety: easy runs, tempo, intervals, long runs
- Progressive overload with 10% weekly increase max
- Include taper in final 2 weeks

Generate the plan now.
    `;
  }

  async adaptPlan(enrollmentId, completedWorkoutId, actualRun) {
    // 1. Get planned vs actual performance
    const planned = await this.getPlannedWorkout(completedWorkoutId);
    const actual = actualRun;

    // 2. Calculate execution score
    const executionScore = this.calculateExecutionScore(planned, actual);

    // 3. Determine if adaptations needed
    const adaptations = [];

    if (executionScore < 70) {
      adaptations.push({
        reason: "Struggled with workout",
        change: "Reduce next week's volume by 10%",
        workoutsAffected: await this.getNextWeekWorkouts(enrollmentId)
      });
    } else if (executionScore > 95) {
      adaptations.push({
        reason: "Crushed the workout",
        change: "Increase next week's intensity by 5%",
        workoutsAffected: await this.getNextWeekWorkouts(enrollmentId)
      });
    }

    // 4. Save adaptations
    for (const adapt of adaptations) {
      await this.db.query(`
        INSERT INTO plan_adaptations 
        (enrollment_id, reason, change_description, applied)
        VALUES ($1, $2, $3, false)
      `, [enrollmentId, adapt.reason, adapt.change]);
    }

    return adaptations;
  }
}
```

**Estimated time:** 5-6 days

---

### 4. **Activity Feed & Social** 🟢 MEDIUM PRIORITY

**Backend endpoints:**
```javascript
// Get activity feed
GET /api/feed?page=0&limit=20
Response: {
  activities: [
    {
      id: "uuid",
      user: { name: "Alice", photo: "..." },
      type: "COMPLETED_RUN",
      run: { distance: 10000, time: 2700000, ... },
      reactions: 15,
      comments: 3,
      createdAt: "2024-01-27T10:30:00Z"
    }
  ],
  hasMore: true
}

// Give kudos
POST /api/feed/{activityId}/kudos
Response: { success: true, totalKudos: 16 }

// Post comment
POST /api/feed/{activityId}/comments
Body: { text: "Great run!" }
Response: { comment: { id, text, user, createdAt } }
```

**Implementation:**
```javascript
// backend/services/feedBuilder.js

class FeedBuilder {
  async buildFeed(userId, page = 0, limit = 20) {
    // 1. Get user's friends
    const friends = await this.getFriends(userId);
    const friendIds = friends.map(f => f.id);

    // 2. Get recent activities from friends
    const activities = await this.db.query(`
      SELECT 
        fa.*,
        u.name as user_name,
        u.profile_pic as user_photo,
        (SELECT COUNT(*) FROM reactions WHERE activity_id = fa.id) as reaction_count,
        (SELECT COUNT(*) FROM activity_comments WHERE activity_id = fa.id) as comment_count,
        EXISTS(SELECT 1 FROM reactions WHERE activity_id = fa.id AND user_id = $1) as is_liked_by_user
      FROM feed_activities fa
      JOIN users u ON fa.user_id = u.id
      WHERE fa.user_id = ANY($2)
        AND fa.is_public = true
      ORDER BY fa.created_at DESC
      LIMIT $3 OFFSET $4
    `, [userId, friendIds, limit, page * limit]);

    // 3. Enrich with run data if needed
    for (const activity of activities) {
      if (activity.run_id) {
        activity.run = await this.getRun(activity.run_id);
      }
    }

    return {
      activities,
      hasMore: activities.length === limit
    };
  }

  async createActivityForRun(userId, runId) {
    // Automatically create feed activity when run is uploaded
    const run = await this.getRun(runId);

    // Check if it's a PR or significant achievement
    const activityType = await this.determineActivityType(userId, run);

    await this.db.query(`
      INSERT INTO feed_activities 
      (user_id, activity_type, run_id, is_public)
      VALUES ($1, $2, $3, true)
    `, [userId, activityType, runId]);

    // Notify friends
    await this.notifyFriends(userId, runId);
  }
}
```

**Estimated time:** 4-5 days

---

### 5. **Personal Heatmaps** 🟡 MEDIUM PRIORITY

**Backend endpoint:**
```javascript
// Get user's heatmap data
GET /api/heatmap/{userId}?startDate=2024-01-01&endDate=2024-01-27
Response: {
  points: [
    { lat: 37.7749, lng: -122.4194, intensity: 0.85 },
    // ... thousands of points
  ],
  bounds: { north: 37.8, south: 37.7, east: -122.3, west: -122.5 }
}
```

**Implementation:**
```javascript
// backend/services/heatmapGenerator.js

class HeatmapGenerator {
  async generateHeatmap(userId, startDate, endDate) {
    // 1. Get all GPS points from user's runs in date range
    const points = await this.db.query(`
      SELECT 
        (jsonb_array_elements(route_points)->>'lat')::float as lat,
        (jsonb_array_elements(route_points)->>'lng')::float as lng
      FROM runs
      WHERE user_id = $1
        AND start_time BETWEEN $2 AND $3
    `, [userId, startDate, endDate]);

    // 2. Cluster points by proximity (grid-based)
    const grid = this.clusterPoints(points, 0.001); // ~100m grid cells

    // 3. Calculate intensity (frequency) for each cluster
    const heatmapPoints = Object.values(grid).map(cluster => ({
      lat: cluster.centerLat,
      lng: cluster.centerLng,
      intensity: Math.min(cluster.count / 100, 1.0) // Normalize to 0-1
    }));

    // 4. Calculate bounds
    const lats = heatmapPoints.map(p => p.lat);
    const lngs = heatmapPoints.map(p => p.lng);

    return {
      points: heatmapPoints,
      bounds: {
        north: Math.max(...lats),
        south: Math.min(...lats),
        east: Math.max(...lngs),
        west: Math.min(...lngs)
      }
    };
  }

  clusterPoints(points, gridSize) {
    const grid = {};

    for (const point of points) {
      // Round to grid cell
      const gridLat = Math.round(point.lat / gridSize) * gridSize;
      const gridLng = Math.round(point.lng / gridSize) * gridSize;
      const key = `${gridLat},${gridLng}`;

      if (!grid[key]) {
        grid[key] = {
          centerLat: gridLat,
          centerLng: gridLng,
          count: 0
        };
      }

      grid[key].count++;
    }

    return grid;
  }
}
```

**Estimated time:** 2-3 days

---

### 6. **Achievements System** 🟢 LOW PRIORITY

**Backend logic:**
```javascript
// backend/services/achievementDetector.js

class AchievementDetector {
  async checkAchievementsForRun(userId, runId) {
    const run = await this.getRun(runId);
    const earnedAchievements = [];

    // Check distance-based achievements
    if (run.distance >= 5000 && run.distance < 6000) {
      await this.awardIfNew(userId, 'FIRST_5K', runId);
      earnedAchievements.push('FIRST_5K');
    }

    // Check streak achievements
    const streak = await this.calculateStreak(userId);
    if (streak === 30) {
      await this.awardIfNew(userId, 'CONSISTENCY_KING', runId);
      earnedAchievements.push('CONSISTENCY_KING');
    }

    // Check monthly distance
    const monthlyDistance = await this.getMonthlyDistance(userId);
    if (monthlyDistance >= 100000) {
      await this.awardIfNew(userId, 'CENTURY_CLUB', runId);
      earnedAchievements.push('CENTURY_CLUB');
    }

    return earnedAchievements;
  }

  async awardIfNew(userId, achievementType, runId) {
    const achievement = await this.db.query(`
      SELECT id FROM achievements WHERE type = $1
    `, [achievementType]);

    await this.db.query(`
      INSERT INTO user_achievements (user_id, achievement_id, run_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, achievement_id) DO NOTHING
    `, [userId, achievement.id, runId]);
  }
}
```

**Estimated time:** 2-3 days

---

## 📊 Backend Implementation Priority

### Phase 1: Core Analytics (Week 1-2)
- ✅ Fitness & Freshness calculation
- ✅ TSS calculation on run upload
- ✅ GAP calculation (optional - can be client-side)
- ✅ Run upload with full metrics

### Phase 2: Competition (Week 3-4)
- ✅ Segment matching algorithm
- ✅ Leaderboard calculations
- ✅ PR detection
- ✅ Heatmap generation

### Phase 3: AI Features (Week 5-6)
- ✅ Training plan AI generation
- ✅ Plan adaptation engine
- ✅ Workout analysis

### Phase 4: Social (Week 7-8)
- ✅ Activity feed algorithm
- ✅ Notifications system
- ✅ Achievements detection

---

## 🛠️ Technology Stack Recommendations

### Backend Framework Options:

**Option 1: Node.js + Express** (Fastest development)
```javascript
// backend/server.js
const express = require('express');
const { Pool } = require('pg');
const OpenAI = require('openai');

const app = express();
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Services
const FitnessCalculator = require('./services/fitnessCalculator');
const SegmentMatcher = require('./services/segmentMatcher');
const TrainingPlanGenerator = require('./services/trainingPlanGenerator');

// Routes
app.use('/api/fitness', require('./routes/fitness'));
app.use('/api/segments', require('./routes/segments'));
app.use('/api/training-plans', require('./routes/trainingPlans'));

app.listen(3000);
```

**Option 2: Python + FastAPI** (Better for ML/AI)
```python
# backend/main.py
from fastapi import FastAPI
from services.fitness_calculator import FitnessCalculator
from services.segment_matcher import SegmentMatcher

app = FastAPI()

@app.get("/api/fitness/trend/{user_id}")
async def get_fitness_trend(user_id: str, days: int = 90):
    calculator = FitnessCalculator(db)
    return await calculator.calculate_trend(user_id, days)
```

**Option 3: Go** (Best performance)
```go
// backend/main.go
package main

func main() {
    r := gin.Default()
    
    fitness := NewFitnessService(db)
    segments := NewSegmentService(db)
    
    r.GET("/api/fitness/trend/:userId", fitness.GetTrend)
    r.POST("/api/segments/match", segments.MatchRun)
    
    r.Run(":3000")
}
```

---

## 📋 Complete API Endpoints Checklist

### Fitness & Freshness:
- [ ] GET /api/fitness/trend/{userId}
- [ ] GET /api/fitness/current/{userId}
- [ ] POST /api/fitness/calculate-historical/{userId}

### Segments:
- [ ] GET /api/segments/nearby
- [ ] GET /api/segments/{segmentId}
- [ ] GET /api/segments/{segmentId}/leaderboard
- [ ] POST /api/segments/match
- [ ] POST /api/segments (create new segment)

### Training Plans:
- [ ] POST /api/training-plans/generate
- [ ] GET /api/training-plans/{planId}
- [ ] POST /api/training-plans/{planId}/enroll
- [ ] POST /api/training-plans/workouts/{workoutId}/complete
- [ ] GET /api/training-plans/{userId}/active

### Social Feed:
- [ ] GET /api/feed
- [ ] POST /api/feed/{activityId}/kudos
- [ ] POST /api/feed/{activityId}/comments
- [ ] POST /api/feed/post

### Heatmap:
- [ ] GET /api/heatmap/{userId}

### Achievements:
- [ ] GET /api/achievements
- [ ] GET /api/users/{userId}/achievements

### Notifications:
- [ ] GET /api/notifications
- [ ] PUT /api/notifications/{notificationId}/read

---

## ⏱️ Total Implementation Time Estimate

| Feature | Backend Time | Frontend Integration | Total |
|---------|--------------|---------------------|-------|
| Fitness & Freshness | 2-3 days | 1-2 days | 3-5 days |
| Segment Matching | 4-5 days | 2-3 days | 6-8 days |
| Training Plans | 5-6 days | 3-4 days | 8-10 days |
| Social Feed | 4-5 days | 2-3 days | 6-8 days |
| Heatmaps | 2-3 days | 1-2 days | 3-5 days |
| Achievements | 2-3 days | 1 day | 3-4 days |
| **TOTAL** | **19-25 days** | **10-15 days** | **29-40 days** |

**With 1 backend developer: 6-8 weeks**  
**With 2 backend developers: 3-4 weeks**

---

## 🎯 Summary

**YES, you need significant backend work:**

1. ✅ Database is ready (done today!)
2. ⏳ Backend APIs needed (6-8 weeks of work)
3. ⏳ Android app integration (2-3 weeks)

**Start with:**
1. Fitness & Freshness backend (highest value)
2. Run upload with TSS calculation
3. Segment matching
4. Then layer in other features

**Good news:** You can build incrementally. Ship Fitness & Freshness first, then add segments, then training plans, then social.

Ready to start building the backend? Let me know which feature you want to tackle first! 🚀
