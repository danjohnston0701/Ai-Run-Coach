# AI Run Coach - Complete Mobile App Handoff Document

**Version:** 1.0  
**Date:** January 2026  
**Purpose:** Enable fully independent mobile app development with complete feature parity to the web app.

---

## TABLE OF CONTENTS

1. [Environment Configuration](#1-environment-configuration)
2. [Database Schema](#2-database-schema)
3. [API Endpoint Catalog](#3-api-endpoint-catalog)
4. [AI Coaching System](#4-ai-coaching-system)
5. [Navigation System](#5-navigation-system)
6. [Route Map Display](#6-route-map-display)
7. [Live Run Session Features](#7-live-run-session-features)
8. [Talk to Coach Feature](#8-talk-to-coach-feature)
9. [Live Session Sharing](#9-live-session-sharing)
10. [Terrain & Elevation Analysis](#10-terrain--elevation-analysis)
11. [Coach Settings & Preferences](#11-coach-settings--preferences)
12. [Session Persistence](#12-session-persistence)
13. [Business Logic & Calculations](#13-business-logic--calculations)
14. [External API Integrations](#14-external-api-integrations)
15. [Subscription & Payment System](#15-subscription--payment-system)
16. [Push Notifications](#16-push-notifications)
17. [Authentication](#17-authentication)

---

## 1. ENVIRONMENT CONFIGURATION

### Required Secrets (Configure in your mobile app project)

Copy these from the web app project's Secrets tab:

| Secret Name | Description |
|------------|-------------|
| `DATABASE_URL` | Shared PostgreSQL (Neon) connection string |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `GOOGLE_MAPS_API_KEY` | Google Maps Platform API key |
| `SESSION_SECRET` | Session encryption key |

### Optional (if handling payments in mobile)

| Secret Name | Description |
|------------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |

---

## 2. DATABASE SCHEMA

### Complete SQL DDL

```sql
-- Users (core user table)
CREATE TABLE users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_code TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  dob TEXT,
  gender TEXT,
  height TEXT,
  weight TEXT,
  fitness_level TEXT,
  desired_fitness_level TEXT,
  coach_name TEXT DEFAULT 'AI Coach',
  coach_gender TEXT DEFAULT 'male',
  coach_accent TEXT DEFAULT 'british',
  coach_tone TEXT DEFAULT 'energetic',
  profile_pic TEXT,
  distance_min_km REAL DEFAULT 0,
  distance_max_km REAL DEFAULT 50,
  distance_decimals_enabled BOOLEAN DEFAULT false,
  is_admin BOOLEAN DEFAULT false,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_tier TEXT,
  subscription_status TEXT,
  entitlement_type TEXT,
  entitlement_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Routes
CREATE TABLE routes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id),
  name TEXT,
  distance REAL NOT NULL,
  difficulty TEXT NOT NULL,
  start_lat REAL NOT NULL,
  start_lng REAL NOT NULL,
  end_lat REAL,
  end_lng REAL,
  waypoints JSONB,
  polyline TEXT,
  elevation REAL,
  elevation_gain REAL,
  elevation_loss REAL,
  elevation_profile JSONB,
  max_incline_percent REAL,
  max_incline_degrees REAL,
  max_decline_percent REAL,
  max_decline_degrees REAL,
  estimated_time INTEGER,
  terrain_type TEXT,
  start_location_label TEXT,
  turn_instructions JSONB,
  is_favorite BOOLEAN DEFAULT false,
  last_started_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  source TEXT DEFAULT 'ai',
  source_run_id VARCHAR
);

-- Events
CREATE TABLE events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT,
  description TEXT,
  event_type TEXT DEFAULT 'parkrun',
  route_id VARCHAR NOT NULL REFERENCES routes(id),
  source_run_id VARCHAR,
  created_by_user_id VARCHAR NOT NULL REFERENCES users(id),
  schedule_type TEXT DEFAULT 'recurring',
  specific_date TIMESTAMP,
  recurrence_pattern TEXT,
  day_of_week INTEGER,
  day_of_month INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Runs
CREATE TABLE runs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  route_id VARCHAR REFERENCES routes(id),
  event_id VARCHAR REFERENCES events(id),
  group_run_id VARCHAR,
  name TEXT,
  distance REAL NOT NULL,
  duration INTEGER NOT NULL,
  run_date TEXT,
  run_time TEXT,
  avg_pace TEXT,
  avg_heart_rate INTEGER,
  max_heart_rate INTEGER,
  calories INTEGER,
  cadence INTEGER,
  elevation REAL,
  elevation_gain REAL,
  elevation_loss REAL,
  difficulty TEXT,
  start_lat REAL,
  start_lng REAL,
  gps_track JSONB,
  heart_rate_data JSONB,
  pace_data JSONB,
  weather_data JSONB,
  ai_insights TEXT,
  ai_coaching_notes JSONB,
  ai_coach_enabled BOOLEAN,
  target_time INTEGER,
  completed_at TIMESTAMP DEFAULT NOW()
);

-- Run Analyses (AI post-run insights)
CREATE TABLE run_analyses (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR NOT NULL UNIQUE REFERENCES runs(id),
  highlights JSONB,
  struggles JSONB,
  personal_bests JSONB,
  demographic_comparison TEXT,
  coaching_tips JSONB,
  overall_assessment TEXT,
  weather_impact TEXT,
  warm_up_analysis TEXT,
  goal_progress TEXT,
  target_time_analysis TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI Coaching Logs
CREATE TABLE ai_coaching_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  session_key TEXT,
  run_id VARCHAR REFERENCES runs(id),
  event_type TEXT NOT NULL,
  elapsed_seconds INTEGER,
  distance_km REAL,
  current_pace TEXT,
  heart_rate INTEGER,
  cadence INTEGER,
  terrain JSONB,
  weather JSONB,
  prompt TEXT,
  response JSONB,
  response_text TEXT,
  topic TEXT,
  model TEXT,
  token_count INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Run Weakness Events
CREATE TABLE run_weakness_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id),
  start_distance_km REAL NOT NULL,
  end_distance_km REAL NOT NULL,
  duration_seconds INTEGER NOT NULL,
  avg_pace_before REAL NOT NULL,
  avg_pace_during REAL NOT NULL,
  drop_percent REAL NOT NULL,
  cause_tag TEXT,
  cause_note TEXT,
  coach_response_given TEXT,
  user_comment TEXT,
  is_irrelevant BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMP,
  detected_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Goals
CREATE TABLE goals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  priority INTEGER DEFAULT 1,
  target_date TIMESTAMP,
  distance_target TEXT,
  time_target_seconds INTEGER,
  health_target TEXT,
  target_weight_kg REAL,
  starting_weight_kg REAL,
  weekly_run_target INTEGER,
  monthly_distance_target REAL,
  event_name TEXT,
  event_location TEXT,
  notes TEXT,
  progress_percent INTEGER DEFAULT 0,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Live Run Sessions
CREATE TABLE live_run_sessions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT,
  user_id VARCHAR NOT NULL REFERENCES users(id),
  route_id VARCHAR REFERENCES routes(id),
  is_active BOOLEAN DEFAULT true,
  current_lat REAL,
  current_lng REAL,
  current_pace TEXT,
  current_heart_rate INTEGER,
  elapsed_time INTEGER DEFAULT 0,
  distance_covered REAL DEFAULT 0,
  difficulty TEXT,
  cadence INTEGER,
  gps_track JSONB,
  km_splits JSONB,
  shared_with_friends BOOLEAN DEFAULT false,
  started_at TIMESTAMP DEFAULT NOW(),
  last_synced_at TIMESTAMP DEFAULT NOW()
);

-- Friends
CREATE TABLE friends (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  friend_id VARCHAR NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Friend Requests
CREATE TABLE friend_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id VARCHAR NOT NULL REFERENCES users(id),
  addressee_id VARCHAR NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP
);

-- Push Subscriptions
CREATE TABLE push_subscriptions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  device_id TEXT,
  device_name TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

-- Notification Preferences
CREATE TABLE notification_preferences (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id),
  friend_request BOOLEAN DEFAULT true,
  friend_accepted BOOLEAN DEFAULT true,
  group_run_invite BOOLEAN DEFAULT true,
  group_run_starting BOOLEAN DEFAULT true,
  live_run_invite BOOLEAN DEFAULT true,
  live_observer_joined BOOLEAN DEFAULT true,
  run_completed BOOLEAN DEFAULT false,
  weekly_progress BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Coupon Codes
CREATE TABLE coupon_codes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  max_redemptions INTEGER,
  current_redemptions INTEGER DEFAULT 0,
  requires_payment BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User Coupons
CREATE TABLE user_coupons (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  coupon_id VARCHAR NOT NULL REFERENCES coupon_codes(id),
  redeemed_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'active'
);

-- Group Runs
CREATE TABLE group_runs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id VARCHAR NOT NULL REFERENCES users(id),
  route_id VARCHAR REFERENCES routes(id),
  mode TEXT NOT NULL DEFAULT 'route',
  title TEXT,
  description TEXT,
  target_distance REAL,
  target_pace TEXT,
  invite_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  planned_start_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Group Run Participants
CREATE TABLE group_run_participants (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  group_run_id VARCHAR NOT NULL REFERENCES group_runs(id),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'participant',
  invitation_status TEXT NOT NULL DEFAULT 'pending',
  run_id VARCHAR REFERENCES runs(id),
  invite_expires_at TIMESTAMP,
  accepted_at TIMESTAMP,
  declined_at TIMESTAMP,
  ready_to_start BOOLEAN DEFAULT false,
  joined_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Garmin Data
CREATE TABLE garmin_data (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  run_id VARCHAR REFERENCES runs(id),
  activity_id TEXT,
  heart_rate_zones JSONB,
  vo2_max REAL,
  training_effect REAL,
  recovery_time INTEGER,
  stress_level INTEGER,
  body_battery INTEGER,
  raw_data JSONB,
  synced_at TIMESTAMP DEFAULT NOW()
);

-- Route Ratings
CREATE TABLE route_ratings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  run_id VARCHAR REFERENCES runs(id),
  rating INTEGER NOT NULL,
  template_name TEXT,
  backtrack_ratio REAL,
  route_distance REAL,
  start_lat REAL,
  start_lng REAL,
  polyline_hash TEXT,
  feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI Coach Content (admin-managed)
CREATE TABLE ai_coach_description (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ai_coach_instructions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ai_coach_knowledge (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ai_coach_faq (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE pre_registrations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 3. API ENDPOINT CATALOG

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create user account |
| POST | `/api/auth/login` | Login with email/password |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:id` | Get user profile |
| PATCH | `/api/users/:id` | Update user profile |
| GET | `/api/users/search?q=` | Search users |

### Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/routes` | Create route |
| GET | `/api/routes` | Get all routes |
| GET | `/api/routes/:id` | Get single route |
| GET | `/api/routes/recent` | Get recent routes |
| GET | `/api/routes/favorites` | Get favorites |
| POST | `/api/routes/:id/favorite` | Toggle favorite |
| POST | `/api/routes/:id/start` | Mark started |
| POST | `/api/routes/generate-options` | AI generate options |
| POST | `/api/routes/generate` | Generate single route |

### Runs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/runs` | Save completed run |
| GET | `/api/runs/:id` | Get run details |
| PATCH | `/api/runs/:id` | Update run |
| DELETE | `/api/runs/:id` | Delete run |
| GET | `/api/users/:userId/runs` | Get user's runs |
| POST | `/api/runs/:id/to-route` | Convert run to route |
| GET | `/api/runs/:id/analysis` | Get AI analysis |
| POST | `/api/runs/:id/analysis` | Generate AI analysis |
| GET | `/api/runs/:id/coaching-logs` | Get coaching logs |

### Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | Get all events |
| GET | `/api/events/grouped` | Get grouped by country |
| GET | `/api/events/:id` | Get single event |
| POST | `/api/events/from-run/:runId` | Create from run |

### Live Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/live-sessions` | Create session |
| GET | `/api/live-sessions/:id` | Get session |
| PATCH | `/api/live-sessions/:id` | Update session |
| PUT | `/api/live-sessions/sync` | Sync session data |
| POST | `/api/live-sessions/end-by-key` | End session |
| POST | `/api/live-sessions/:id/invite-observer` | Invite friend |
| POST | `/api/live-sessions/:id/observer-joined` | Notify observer joined |

### AI Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/coaching` | Get coaching during run |
| POST | `/api/ai/run-summary` | Pre-run summary |
| POST | `/api/ai/tts` | Text-to-speech |
| POST | `/api/ai/analyze-cadence` | Analyze cadence |

### Goals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:userId/goals` | Get goals |
| POST | `/api/goals` | Create goal |
| PATCH | `/api/goals/:id` | Update goal |
| DELETE | `/api/goals/:id` | Delete goal |

### Friends
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:userId/friends` | Get friends |
| POST | `/api/friend-requests` | Send request |
| POST | `/api/friend-requests/:id/accept` | Accept |
| POST | `/api/friend-requests/:id/decline` | Decline |

### Weather
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/weather/current?lat=&lng=` | Current weather |
| GET | `/api/weather/full?lat=&lng=` | Full weather data |

### Geocoding
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/geocode/reverse?lat=&lng=` | Reverse geocode |
| GET | `/api/places/autocomplete?input=` | Places search |

---

## 4. AI COACHING SYSTEM

### Phase-Based Coaching

Coaching statements are organized by run phase. Each phase has specific messaging appropriate to that stage of the run.

```typescript
type CoachingPhase = 'early' | 'mid' | 'late' | 'final' | 'generic';

interface PhaseThresholds {
  early: { maxKm: 2, maxPercent: 10 };      // First 2km OR first 10%
  mid: { minKm: 3, maxKm: 5, minPercent: 40, maxPercent: 50 };  // 3-5km OR 40-50%
  late: { minKm: 7, minPercent: 75, maxPercent: 90 };  // 7km+ OR 75-90%
  final: { minPercent: 90 };  // Last 10%
}

function determinePhase(distanceKm: number, totalDistanceKm: number | null): CoachingPhase {
  const percentComplete = totalDistanceKm ? (distanceKm / totalDistanceKm) * 100 : null;
  
  if (percentComplete !== null) {
    if (percentComplete >= 90) return 'final';
    if (percentComplete >= 75) return 'late';
    if (percentComplete >= 40 && percentComplete <= 50) return 'mid';
    if (percentComplete <= 10) return 'early';
    return 'generic';
  }
  
  // No total distance known (free run)
  if (distanceKm <= 2) return 'early';
  if (distanceKm >= 3 && distanceKm <= 5) return 'mid';
  return 'generic';  // Don't use late/final without knowing total
}
```

### Coaching Statements by Phase

```typescript
const COACHING_STATEMENTS = [
  // EARLY PHASE (warm-up, settling in)
  { id: 'early_1', text: "Keep your posture tall and proud, imagine a string gently lifting the top of your head.", phase: 'early', category: 'form' },
  { id: 'early_2', text: "Settle into a steady, rhythmic breathing pattern that feels sustainable.", phase: 'early', category: 'breathing' },
  { id: 'early_3', text: "Start easy and let your body warm up naturally. The best runs build momentum.", phase: 'early', category: 'pacing' },
  { id: 'early_4', text: "Relax your shoulders and let them drop away from your ears.", phase: 'early', category: 'form' },
  { id: 'early_5', text: "Find your rhythm. These first kilometers are about settling into a sustainable pace.", phase: 'early', category: 'pacing' },
  { id: 'early_6', text: "Keep your hands soft, stretch your fingers and release the tension.", phase: 'early', category: 'form' },
  { id: 'early_7', text: "Great start! Focus on smooth, relaxed movements as you warm up.", phase: 'early', category: 'motivation' },
  { id: 'early_8', text: "Keep your eyes on the horizon, not your feet.", phase: 'early', category: 'form' },

  // MID PHASE (maintaining effort, form check)
  { id: 'mid_1', text: "Lightly engage your core to keep your torso stable as your legs and arms move.", phase: 'mid', category: 'form' },
  { id: 'mid_2', text: "You're in the groove now. Stay relaxed and maintain your rhythm.", phase: 'mid', category: 'motivation' },
  { id: 'mid_3', text: "Think quick and elastic, lifting the foot up and through instead of pushing long and hard.", phase: 'mid', category: 'form' },
  { id: 'mid_4', text: "Keep your arms relaxed and swinging naturally with your stride.", phase: 'mid', category: 'form' },
  { id: 'mid_5', text: "Let your foot land roughly under your body instead of reaching out in front.", phase: 'mid', category: 'form' },
  { id: 'mid_6', text: "Run with quiet confidence. Efficient, relaxed form is your biggest advantage today.", phase: 'mid', category: 'mental' },
  { id: 'mid_7', text: "You're building a strong foundation. This is where consistency pays off.", phase: 'mid', category: 'motivation' },
  { id: 'mid_8', text: "Check in with your breathing. Keep it controlled and rhythmic.", phase: 'mid', category: 'breathing' },

  // LATE PHASE (mental strength, pushing through fatigue)
  { id: 'late_1', text: "Stay tall through your hips, avoid collapsing or bending at the waist as you tire.", phase: 'late', category: 'form' },
  { id: 'late_2', text: "If you're starting to tire, take a deep breath and reset your rhythm.", phase: 'late', category: 'breathing' },
  { id: 'late_3', text: "Pain fades, pride lasts. Push through this stretch and keep your head up.", phase: 'late', category: 'motivation' },
  { id: 'late_4', text: "Your body is capable of more than your mind believes. Trust your training.", phase: 'late', category: 'mental' },
  { id: 'late_5', text: "You've come this far. Maintain your form and keep moving forward.", phase: 'late', category: 'motivation' },
  { id: 'late_6', text: "When it gets tough, focus on the next 100 meters, not the whole distance.", phase: 'late', category: 'mental' },
  { id: 'late_7', text: "This is where champions are made. Embrace the challenge.", phase: 'late', category: 'motivation' },
  { id: 'late_8', text: "Relax your face and jaw. Tension there wastes precious energy.", phase: 'late', category: 'form' },

  // FINAL PHASE (finishing strong)
  { id: 'final_1', text: "You're almost there! Give it everything you have left.", phase: 'final', category: 'motivation' },
  { id: 'final_2', text: "The finish line is calling. Dig deep and finish strong!", phase: 'final', category: 'motivation' },
  { id: 'final_3', text: "Last push! Every step now is a step closer to victory.", phase: 'final', category: 'motivation' },
  { id: 'final_4', text: "Empty the tank. Leave nothing behind on this final stretch.", phase: 'final', category: 'motivation' },
  { id: 'final_5', text: "You've earned this finish. Sprint home if you can!", phase: 'final', category: 'motivation' },
  { id: 'final_6', text: "The end is in sight. This is your moment to shine!", phase: 'final', category: 'motivation' },

  // GENERIC (any time)
  { id: 'generic_1', text: "Remember to smile! It helps you relax and enjoy the run.", phase: 'generic', category: 'mental' },
  { id: 'generic_2', text: "You're stronger with every stride. Stay smooth, stay strong.", phase: 'generic', category: 'motivation' },
  { id: 'generic_3', text: "Focus on form. Tall posture, light feet, and controlled breathing.", phase: 'generic', category: 'form' },
  { id: 'generic_4', text: "Your body can do this. Trust it and let your mind follow.", phase: 'generic', category: 'mental' },
  { id: 'generic_5', text: "One step at a time. That's how every great journey is conquered.", phase: 'generic', category: 'motivation' },
];

// MAX 3 uses per statement per run
const MAX_STATEMENT_USES = 3;
```

### Elite Coaching Tips (by Category)

```typescript
const ELITE_COACHING_TIPS = {
  "posture_alignment": [
    "Keep your posture tall and proud; imagine a string gently lifting the top of your head.",
    "Run with your ears, shoulders, hips, and ankles roughly in one line.",
    "Stay tall through your hips; avoid collapsing or bending at the waist as you tire.",
    "Lean very slightly forward from the ankles, not from the hips, letting gravity help you move.",
    "Keep your chin level and your neck relaxed; avoid letting your head drop forward.",
    "Think 'run tall' — elongate your spine and lift your chest slightly for better breathing."
  ],
  "arms_upper_body": [
    "Relax your shoulders and let them drop away from your ears.",
    "Keep your arms close to your sides with a gentle bend at the elbows.",
    "Let your arms swing forward and back, not across your body.",
    "Keep your hands soft, as if gently holding something you don't want to crush.",
    "When tension builds, briefly shake out your hands and arms, then settle back into rhythm.",
    "Your arms drive your legs — pump them actively to help maintain pace on tough sections."
  ],
  "breathing_relaxation": [
    "Breathe from your belly, letting the abdomen expand rather than lifting the chest.",
    "Settle into a steady, rhythmic breathing pattern that feels sustainable.",
    "Use your exhale to release tension from your shoulders and face.",
    "Let your breath guide your effort — calm, controlled breathing supports smooth running.",
    "If you feel stressed, take a deeper, slower breath and gently reset your rhythm.",
    "Match your breathing to your stride — try a 3:2 or 2:2 inhale-exhale pattern for rhythm."
  ],
  "stride_foot_strike": [
    "Aim for smooth, light steps that land softly on the ground.",
    "Let your foot land roughly under your body instead of reaching out in front.",
    "Think 'quick and elastic,' lifting the foot up and through instead of pushing long and hard.",
    "Focus on gliding forward — avoid bounding or overstriding.",
    "Use the ground to push you forward, not upward; channel your force into forward motion.",
    "Aim for around 180 steps per minute — quicker turnover reduces impact and improves efficiency."
  ],
  "core_hips_mindset": [
    "Lightly engage your core to keep your torso stable as your legs and arms move.",
    "Let the movement start from your hips, driving you calmly forward.",
    "When you tire, come back to basics: tall posture, relaxed shoulders, smooth steps.",
    "Stay present in this section of the run — one controlled stride at a time.",
    "Run with quiet confidence; efficient, relaxed form is your biggest advantage today.",
    "Visualize strong, controlled strides — your mind guides your body through the tough moments."
  ]
};

// Category selection based on run context
function selectCoachingCategory(paceChange, progressPercent, terrain) {
  if (paceChange === 'slower') return 'breathing_relaxation';
  if (terrain?.currentGrade > 3) return 'core_hips_mindset';
  if (terrain?.currentGrade < -3) return 'stride_foot_strike';
  if (progressPercent < 20) return 'posture_alignment';
  if (progressPercent < 70) return Math.random() > 0.5 ? 'arms_upper_body' : 'stride_foot_strike';
  return 'core_hips_mindset';
}
```

### Coaching API Request Format

**POST** `/api/ai/coaching`

```typescript
interface CoachingRequest {
  // Core run metrics
  currentPace: string;           // "6:15" format
  targetPace: string;            // "6:00" based on difficulty
  elapsedTime: number;           // seconds
  distanceCovered: number;       // km
  totalDistance: number;         // km target
  difficulty: string;            // "beginner" | "moderate" | "expert"
  
  // User profile
  userFitnessLevel?: string;
  userName?: string;
  userAge?: number;
  userWeight?: string;
  userHeight?: string;
  userGender?: string;
  desiredFitnessLevel?: string;
  coachName?: string;
  
  // User's spoken question (for Talk to Coach)
  userMessage?: string;
  
  // Coach preferences
  coachPreferences?: string;
  coachTone?: 'energetic' | 'motivational' | 'instructive' | 'factual' | 'abrupt';
  
  // Terrain data
  terrain?: {
    currentAltitude?: number;
    currentGrade?: number;
    previousGrade?: number;
    upcomingTerrain?: {
      distanceAhead: number;
      grade: number;
      elevationChange: number;
      description: string;
    };
    totalElevationGain?: number;
    totalElevationLoss?: number;
  };
  
  // Context for variety
  recentCoachingTopics?: string[];
  paceChange?: 'faster' | 'slower' | 'steady';
  currentKm?: number;
  progressPercent?: number;
  milestones?: string[];
  kmSplitTimes?: number[];
  
  // Weather
  weather?: {
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    condition: string;
    uvIndex: number;
    precipitationProbability: number;
  };
  
  // Goals
  goals?: Array<{
    type: string;
    title: string;
    targetDate?: string;
    distanceTarget?: string;
    timeTargetSeconds?: number;
    progressPercent?: number;
  }>;
  
  // Target time tracking
  targetTimeSeconds?: number;
  
  // Exercise type
  exerciseType?: 'running' | 'walking';
  
  // Session tracking
  userId?: string;
  sessionKey: string;
}

interface CoachingResponse {
  message: string;
  encouragement: string;
  paceAdvice: string;
  breathingTip?: string;
  topic?: string;
}
```

### Coaching Triggers

```typescript
// 1. PERIODIC COACHING (every 60-120 seconds during active run)
const COACHING_INTERVAL = 120; // seconds

// 2. KILOMETER MILESTONE
// Announce when each km is completed with pace info

// 3. TERRAIN TRIGGERS
const SIGNIFICANT_UPHILL_GRADE = 5;   // 5%+ grade
const SIGNIFICANT_DOWNHILL_GRADE = -5;
// Trigger when:
// - Approaching hill (within 200m, grade >= 3%)
// - On steep grade (>= 5%)
// - At hill crest (grade drops from 5%+ to <2%)

// 4. PACE DROP DETECTION (Weakness Detection)
const PACE_DROP_THRESHOLD = 0.75; // 75% slower than baseline = 1.75x pace
const MIN_WEAKNESS_DURATION = 30; // seconds

// 5. USER QUESTION (Talk to Coach)
// Triggered by voice input - always responds immediately
```

---

## 5. NAVIGATION SYSTEM

### Turn Instruction Format

Turn instructions come from Google Directions API and are stored in the route.

```typescript
interface TurnInstruction {
  instruction: string;      // "Turn left onto Bronte Place"
  maneuver: string;         // "turn-left", "turn-right", "straight", etc.
  distance: number;         // Distance in meters to this turn
  duration: number;         // Duration in seconds
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}
```

### Navigation Announcement Logic

```typescript
// Skip 'straight' maneuvers - only announce actual turns
if (maneuver === 'straight') continue;

const distanceToTurn = calculateDistance(currentPosition, turnPoint);

// Distance-based announcements
if (distanceToTurn <= 200 && distanceToTurn > 100) {
  // Far warning
  speak(`In ${Math.round(distanceToTurn)} meters, ${instruction}`);
} else if (distanceToTurn <= 100 && distanceToTurn > 30) {
  // Close warning
  speak(`In ${Math.round(distanceToTurn)} meters, ${instruction}`);
} else if (distanceToTurn <= 30 && distanceToTurn > 5) {
  // Immediate
  speak(instruction.replace('Turn', 'Turn now'));
}

// Minimum 30 seconds between navigation announcements
const NAVIGATION_COOLDOWN = 30000; // ms
```

### Off-Route Detection

```typescript
const OFF_ROUTE_THRESHOLD = 50; // meters

// Check distance to nearest route point
if (distanceToNearestRoutePoint > OFF_ROUTE_THRESHOLD) {
  // Fetch street name via reverse geocode
  const streetName = await getStreetName(nearestRoutePoint.lat, nearestRoutePoint.lng);
  
  const instruction = streetName 
    ? `You're ${distMeters} meters off route. Head towards ${streetName} to get back on track.`
    : `You're ${distMeters} meters off route. Check your map to get back on track.`;
  
  speak(instruction);
}
```

---

## 6. ROUTE MAP DISPLAY

### Polyline Styling

```typescript
// Color by difficulty level
const lineColor = 
  difficulty === "expert" ? "#ef4444" :    // Red
  difficulty === "moderate" ? "#eab308" :   // Yellow
  "#22c55e";                                // Green (beginner)

// Polyline options
{
  color: lineColor,
  weight: 4,
  opacity: 0.8,
  dashArray: difficulty === "expert" ? "10,5" : undefined,
  className: "animate-pulse"  // Subtle animation
}
```

### Start/End Markers

```typescript
// START marker - always cyan
{
  radius: 8,
  fillColor: "#06b6d4",
  color: "#06b6d4",
  weight: 3,
  opacity: 1,
  fillOpacity: 1,
  popup: "Start"
}

// END marker - matches route difficulty color
{
  radius: 8,
  fillColor: lineColor,  // Same as polyline
  color: lineColor,
  weight: 3,
  opacity: 1,
  fillOpacity: 1,
  popup: "Finish"
}
```

### Map Legend

```
┌─────────────────────────┐
│  ● Start (cyan #06b6d4) │
│  ● Finish (route color) │
└─────────────────────────┘
```

### Polyline Decoding

```typescript
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}
```

---

## 7. LIVE RUN SESSION FEATURES

### Pre-Run Summary

Before starting, call the API to generate a briefing:

**POST** `/api/ai/run-summary`

```typescript
{
  routeName: string;
  targetDistance: number;
  targetTimeSeconds?: number;
  difficulty: string;
  elevationGain?: number;
  elevationLoss?: number;
  weather?: { temperature, humidity, windSpeed, conditions };
  coachName?: string;
  userName?: string;
  includeAiConfig: boolean;
  firstTurnInstruction?: {
    instruction: string;
    maneuver: string;
    distance: number;
  };
}
```

### Run Session State

```typescript
interface RunSessionState {
  // Core metrics
  distance: number;       // km
  time: number;           // seconds
  pace: number;           // seconds per km
  cadence: number;        // steps per minute
  
  // GPS
  currentPosition: { lat: number; lng: number };
  gpsTrack: Array<{ lat: number; lng: number; timestamp: number }>;
  
  // Status
  active: boolean;        // Currently running
  paused: boolean;        // Paused state
  gpsStatus: 'searching' | 'active' | 'lost';
  
  // Coaching
  aiCoachEnabled: boolean;
  audioEnabled: boolean;
  
  // Splits
  kmSplits: Array<{ km: number; time: number; pace: string }>;
  lastKmAnnounced: number;
  
  // Target time
  targetTimeSeconds?: number;
}
```

### Kilometer Milestone Announcements

```typescript
// When distance crosses a new km threshold
if (Math.floor(currentDistance) > lastKmAnnounced) {
  const kmCompleted = Math.floor(currentDistance);
  const splitPace = calculatePaceForKm(kmCompleted);
  
  let announcement = `Kilometer ${kmCompleted} complete.`;
  announcement += ` Pace: ${formatPace(splitPace)}.`;
  
  // Add motivation based on pace change
  if (splitPace < previousSplitPace - 5) {
    announcement += " Great improvement! You're speeding up.";
  } else if (splitPace > previousSplitPace + 10) {
    announcement += " You've slowed down. Find your rhythm.";
  }
  
  // Add cadence if available
  if (cadence > 0) {
    announcement += ` Cadence: ${cadence} steps per minute.`;
  }
  
  speak(announcement);
  lastKmAnnounced = kmCompleted;
}
```

---

## 8. TALK TO COACH FEATURE

### Voice Input Implementation

```typescript
const startListening = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showError("Voice input not supported");
    return;
  }
  
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  
  recognition.onstart = () => {
    setIsListening(true);
    pauseCurrentAudio();
    cancelSpeechSynthesis();
  };
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcript.trim()) {
      showToast(`Asking coach: "${transcript.substring(0, 40)}..."`);
      sendToCoach(transcript);
    }
  };
  
  recognition.onerror = (event) => {
    setIsListening(false);
    if (event.error === 'not-allowed') {
      showError("Microphone access denied");
    }
  };
  
  recognition.onend = () => {
    setIsListening(false);
  };
  
  recognition.start();
};
```

### Processing Coach Response

```typescript
const handleCoachResponse = (response) => {
  let coachMessage = response.message || '';
  
  if (response.paceAdvice && response.paceAdvice !== response.message) {
    coachMessage += ' ' + response.paceAdvice;
  }
  if (response.breathingTip) {
    coachMessage += ' ' + response.breathingTip;
  }
  if (response.encouragement && response.encouragement !== response.message) {
    coachMessage += ' ' + response.encouragement;
  }
  
  if (coachMessage.trim()) {
    // Force speech for user questions (bypass cooldowns)
    speak(coachMessage.trim(), { force: true, domain: 'coach' });
    setLastCoachMessage(response.message);
    
    // Log for post-run review
    saveCoachingLog({
      eventType: 'user_question',
      topic: response.topic,
      responseText: coachMessage.trim(),
      prompt: userQuestion,
    });
  }
};
```

### UI Button States

```typescript
// Idle state
<Button className="bg-purple-500/20 text-purple-400">
  <MessageCircle />
</Button>

// Listening state
<Button className="bg-red-500 text-white animate-pulse">
  <MessageCircle />
</Button>
```

---

## 9. LIVE SESSION SHARING

### Create/Sync Session

**PUT** `/api/live-sessions/sync`

```typescript
{
  sessionKey: string;      // Local session ID
  userId: string;
  distanceKm: number;
  elapsedSeconds: number;
  currentPace: string;
  cadence?: number;
  difficulty: string;
  gpsTrack: Array<{ lat, lng, timestamp }>;
  kmSplits: Array<{ km, time, pace }>;
  routeId?: string;
}
```

### Invite Friend to Watch

**POST** `/api/live-sessions/:sessionId/invite-observer`

```typescript
{
  runnerId: string;
  friendId: string;
  friendName: string;
}
// Sends push notification to friend
```

### Friend Joins (Observer)

**POST** `/api/live-sessions/:sessionId/observer-joined`

```typescript
{
  observerId: string;
  observerName: string;
}
// Notifies runner that friend is watching
```

### Sync Loop

```typescript
// During active run, sync every 5-10 seconds
useEffect(() => {
  if (!active || !isSharing) return;
  
  const syncInterval = setInterval(async () => {
    await fetch('/api/live-sessions/sync', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionKey: sessionId,
        userId: userId,
        distanceKm: distance,
        elapsedSeconds: time,
        currentPace: formatPace(pace),
        gpsTrack: positions,
        kmSplits: splits,
      }),
    });
  }, 5000);
  
  return () => clearInterval(syncInterval);
}, [active, isSharing]);
```

### End Session

**POST** `/api/live-sessions/end-by-key`

```typescript
{
  sessionKey: string;
  userId: string;
}
```

---

## 10. TERRAIN & ELEVATION ANALYSIS

### Data Structures

```typescript
interface ElevationPoint {
  lat: number;
  lng: number;
  elevation: number;
  distance: number;    // meters from start
  grade: number;       // percentage
}

interface TerrainData {
  currentAltitude?: number;
  currentGrade?: number;
  upcomingTerrain?: {
    distanceAhead: number;
    grade: number;
    elevationChange: number;
    description: string;
  };
  totalElevationGain?: number;
  totalElevationLoss?: number;
}
```

### Grade Descriptions

```typescript
function getGradeDescription(grade: number): string {
  if (grade >= 8) return "steep hill ahead";
  if (grade >= 5) return "moderate hill ahead";
  if (grade >= 2) return "gentle incline ahead";
  if (grade <= -8) return "steep descent ahead";
  if (grade <= -5) return "moderate downhill ahead";
  if (grade <= -2) return "gentle descent ahead";
  return "flat terrain ahead";
}
```

### Terrain Coaching Triggers

```typescript
type TerrainEvent = 'uphill' | 'downhill' | 'hill_crest' | null;

function shouldTriggerTerrainCoaching(
  terrain: TerrainData,
  lastUphillTime: number,
  lastDownhillTime: number,
  lastHillCrestTime: number,
  previousGrade: number | null,
  minIntervalMs: number = 30000
): TerrainEvent {
  const now = Date.now();
  
  // Hill crest detection (was climbing, now flat/descending)
  if (previousGrade !== null && previousGrade >= 5 && (terrain.currentGrade ?? 0) < 2) {
    if (now - lastHillCrestTime >= minIntervalMs) {
      return 'hill_crest';
    }
  }
  
  // Upcoming terrain warning (within 200m, >= 3% grade)
  if (terrain.upcomingTerrain && Math.abs(terrain.upcomingTerrain.grade) >= 5) {
    const direction = terrain.upcomingTerrain.grade > 0 ? 'uphill' : 'downhill';
    const lastTime = direction === 'uphill' ? lastUphillTime : lastDownhillTime;
    if (now - lastTime >= minIntervalMs) {
      return direction;
    }
  }
  
  // Current steep grade (>= 6%)
  if (terrain.currentGrade !== undefined && Math.abs(terrain.currentGrade) >= 6) {
    const direction = terrain.currentGrade > 0 ? 'uphill' : 'downhill';
    const lastTime = direction === 'uphill' ? lastUphillTime : lastDownhillTime;
    if (now - lastTime >= minIntervalMs) {
      return direction;
    }
  }
  
  return null;
}
```

### Hill Coaching Guidelines

```
UPHILL:
- Warn 100-200m ahead
- Suggest shorter strides
- Lean forward slightly
- Maintain cadence over speed
- Conserve energy

DOWNHILL:
- Control pace, don't overspeed
- Quick, light steps
- Don't overstride
- Use gravity efficiently

HILL CREST:
- Acknowledge effort
- Celebrate reaching top
- Guide recovery pace
```

---

## 11. COACH SETTINGS & PREFERENCES

### Settings Types

```typescript
type CoachGender = 'male' | 'female';
type CoachAccent = 'british' | 'australian' | 'american' | 'irish' | 'scottish' | 'newzealand';
type CoachTone = 'energetic' | 'motivational' | 'instructive' | 'factual' | 'abrupt';

interface AiCoachSettings {
  gender: CoachGender;
  accent: CoachAccent;
  tone: CoachTone;
}
```

### Default Settings

```typescript
const defaultSettings: AiCoachSettings = {
  gender: 'male',
  accent: 'british',
  tone: 'energetic',
};
```

### Tone Descriptions

```typescript
const toneDescriptions = {
  energetic: 'High energy, upbeat encouragement',
  motivational: 'Inspiring and supportive coaching',
  instructive: 'Clear, detailed guidance and tips',
  factual: 'Straightforward stats and information',
  abrupt: 'Short, direct commands',
};
```

### TTS Voice Mapping

```typescript
type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'ash' | 'coral';

const voiceMap = {
  british: { male: 'fable', female: 'nova' },
  australian: { male: 'echo', female: 'shimmer' },
  american: { male: 'onyx', female: 'alloy' },
  irish: { male: 'ash', female: 'coral' },
  scottish: { male: 'echo', female: 'sage' },
  newzealand: { male: 'onyx', female: 'shimmer' },
};

function getTTSVoice(settings: AiCoachSettings): TTSVoice {
  return voiceMap[settings.accent][settings.gender];
}
```

---

## 12. SESSION PERSISTENCE

### Active Run Session Interface

```typescript
interface ActiveRunSession {
  id: string;
  startTimestamp: number;
  elapsedSeconds: number;
  pausedDurationMs?: number;
  distanceKm: number;
  cadence: number;
  routeId: string;
  routeName: string;
  routePolyline: string;
  routeWaypoints: Array<{ lat: number; lng: number }>;
  startLat: number;
  startLng: number;
  targetDistance: string;
  levelId: string;
  targetTimeSeconds: number;
  exerciseType?: 'running' | 'walking';
  eventId?: string;
  audioEnabled: boolean;
  aiCoachEnabled: boolean;
  kmSplits: number[];
  lastKmAnnounced: number;
  status: 'active' | 'paused' | 'completed';
  gpsTrackBackup?: Array<{ lat: number; lng: number; timestamp?: number }>;
  weatherData?: any;
  paceData?: Array<{ km: number; pace: string; paceSeconds: number; cumulativeTime: number }>;
  lastDbSyncAt?: number;
  failedSyncAttempts?: number;
}
```

### Persistence Logic

```typescript
const STORAGE_KEY = 'activeRunSession';
const MAX_AGE_HOURS = 12;

// Save every 5 seconds during active run
function saveActiveRunSession(session: ActiveRunSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

// Load on app launch
function loadActiveRunSession(): ActiveRunSession | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  
  const session = JSON.parse(stored);
  
  // Check if session is too old
  const ageHours = (Date.now() - session.startTimestamp) / (1000 * 60 * 60);
  if (ageHours > MAX_AGE_HOURS) {
    clearActiveRunSession();
    return null;
  }
  
  // Don't restore completed sessions
  if (session.status === 'completed') {
    clearActiveRunSession();
    return null;
  }
  
  return session;
}

// Clear after run completes
function clearActiveRunSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Check on app launch
function hasActiveRunSession(): boolean {
  return loadActiveRunSession() !== null;
}
```

### Resume Flow

```typescript
// On app launch
const savedSession = loadActiveRunSession();
if (savedSession) {
  showResumeDialog({
    distance: savedSession.distanceKm,
    time: savedSession.elapsedSeconds,
    routeName: savedSession.routeName,
    onResume: () => navigateToRunSession({ resume: true }),
    onDiscard: () => clearActiveRunSession(),
  });
}
```

---

## 13. BUSINESS LOGIC & CALCULATIONS

### Haversine Distance

```typescript
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
```

### Bearing Calculation

```typescript
function getBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const x = Math.sin(dLng) * Math.cos(lat2Rad);
  const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  
  let bearing = Math.atan2(x, y) * 180 / Math.PI;
  return (bearing + 360) % 360;
}
```

### Pace Formatting

```typescript
function formatPace(paceSecondsPerKm: number): string {
  const minutes = Math.floor(paceSecondsPerKm / 60);
  const seconds = Math.floor(paceSecondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function calculatePace(durationSeconds: number, distanceKm: number): number {
  return distanceKm > 0 ? durationSeconds / distanceKm : 0;
}
```

### Time Formatting

```typescript
function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
```

### Age Calculation

```typescript
function calculateAge(dateOfBirth: string | Date): number | undefined {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  if (isNaN(dob.getTime())) return undefined;
  
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  
  return age >= 0 && age < 150 ? age : undefined;
}
```

### Weakness Detection

```typescript
const PACE_DROP_THRESHOLD = 1.75; // 75% slower = 1.75x pace
const MIN_WEAKNESS_DURATION = 30; // seconds
const ROLLING_SAMPLES = 10; // Number of pace samples for median

function detectPaceDrop(
  recentPaces: number[],
  baselinePace: number
): boolean {
  if (recentPaces.length < ROLLING_SAMPLES) return false;
  
  // Calculate median of recent paces
  const sorted = [...recentPaces].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  
  // Check if significantly slower than baseline
  return median > baselinePace * PACE_DROP_THRESHOLD;
}
```

---

## 14. EXTERNAL API INTEGRATIONS

### Google Maps Platform

**APIs Required:**
- Directions API (turn-by-turn)
- Places API (location search)
- Geocoding API (address lookup)
- Elevation API (terrain data)

**Route Generation Flow:**
1. Get area info with Places API
2. Design waypoints with OpenAI
3. Generate route with Directions API
4. Get elevation profile with Elevation API
5. Parse turn instructions

### OpenAI

**Model:** `gpt-4o`
**Uses:**
- Coaching advice during run
- Pre-run summary
- Post-run analysis
- Route waypoint design
- Cadence analysis

---

## 15. SUBSCRIPTION & PAYMENT SYSTEM

### Entitlement Check

```typescript
function hasPremiumAccess(user: User): boolean {
  if (!user.entitlementType) return false;
  if (!user.entitlementExpiresAt) return true; // Lifetime access
  return new Date(user.entitlementExpiresAt) > new Date();
}
```

### Premium Features

- AI route generation
- AI voice coaching during runs
- Post-run AI analysis
- Talk to coach feature

### Entitlement Types

- `subscription` - Active Stripe subscription
- `one_time` - One-time payment
- `coupon` - Redeemed coupon code
- `trial` - Trial period

---

## 16. PUSH NOTIFICATIONS

### Notification Types

```typescript
const NOTIFICATION_TYPES = {
  friend_request: 'New friend request',
  friend_accepted: 'Friend request accepted',
  group_run_invite: 'Group run invitation',
  group_run_starting: 'Group run is starting',
  live_run_invite: 'Friend sharing live run',
  live_observer_joined: 'Friend watching your run',
};
```

### Notification Payloads

```typescript
// Live run invite
{
  type: 'live_run_invite',
  title: 'Friend Running Now!',
  body: `${runnerName} is running and wants to share their live location!`,
  data: { runnerId, sessionId }
}

// Observer joined
{
  type: 'live_observer_joined',
  title: 'Friend Watching Your Run',
  body: `${observerName} is now watching your live run!`,
  data: { observerId, sessionId }
}
```

---

## 17. AUTHENTICATION

### Password Hashing

```typescript
import bcrypt from 'bcryptjs';

// Register
const hashedPassword = await bcrypt.hash(password, 10);

// Login
const isValid = await bcrypt.compare(inputPassword, user.password);
```

### User Code Generation

```typescript
// 6-character alphanumeric unique code for friend discovery
function generateUserCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
```

---

## QUICK IMPLEMENTATION CHECKLIST

### Core Features
- [ ] User registration/login
- [ ] Route map with start/finish markers and legend
- [ ] GPS tracking during run
- [ ] Distance/time/pace calculations
- [ ] Km milestone announcements
- [ ] Session auto-save every 5 seconds
- [ ] Resume interrupted session

### Navigation
- [ ] Turn-by-turn instructions from route
- [ ] Street-to-street format (not just street name)
- [ ] Distance-based announcements (200m, 100m, 30m)
- [ ] Off-route detection and guidance

### AI Coaching
- [ ] Pre-run summary/briefing
- [ ] Periodic coaching (every 120 seconds)
- [ ] Phase-based coaching statements
- [ ] Terrain-aware coaching (hills)
- [ ] Pace drop detection and encouragement
- [ ] Talk to coach (voice input)
- [ ] Weather-aware coaching
- [ ] Goal-aware coaching

### Live Features
- [ ] Live session sync every 5 seconds
- [ ] Share with friends (invite observer)
- [ ] Observer view (watch friend's run)
- [ ] Push notifications for invites

### Post-Run
- [ ] Save completed run
- [ ] AI analysis with target time feedback
- [ ] Coaching log review
- [ ] Weakness event tracking

---

## END OF DOCUMENT

This document provides complete specifications for building a fully independent mobile app with feature parity to the web app. All business logic, API formats, and UI requirements are included.
