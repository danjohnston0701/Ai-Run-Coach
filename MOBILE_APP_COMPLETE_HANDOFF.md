# AI Run Coach - Complete Mobile App Handoff Document

**Version:** 2.0  
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
18. [GPS Session Management](#18-gps-session-management)
19. [Speech Queue & Audio Management](#19-speech-queue--audio-management)
20. [Pause/Resume & Timer Management](#20-pauseresume--timer-management)
21. [Run Completion & Data Saving](#21-run-completion--data-saving)
22. [Cadence Detection & Analysis](#22-cadence-detection--analysis)
23. [Weather Integration](#23-weather-integration)
24. [Pre-Run Summary](#24-pre-run-summary)
25. [Post-Run AI Analysis](#25-post-run-ai-analysis)
26. [Weakness Detection](#26-weakness-detection)
27. [AI Route Generation](#27-ai-route-generation)
28. [Events System](#28-events-system)

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

### Critical Navigation Constants

```typescript
// Distance thresholds
const APPROACH_ANNOUNCE_DISTANCE = 90;  // meters - first warning
const AT_TURN_DISTANCE = 35;            // meters - "now" announcement
const OFF_ROUTE_THRESHOLD = 50;         // meters
const RECALIBRATION_FAR_THRESHOLD = 80; // meters - trigger waypoint recalibration
const PASSED_TURN_DELTA = 40;           // meters - how far past turn to auto-advance

// Waypoint protection
const MAX_WAYPOINTS_TO_SKIP = 5;        // Never skip more than 5 at once
const PROTECTED_FINAL_COUNT = 3;        // Protect last 3 waypoints until 60% done
const PROGRESS_THRESHOLD_FOR_FINAL = 60; // Percent - when to reduce protection to 1

// Turn grouping
const GROUP_DISTANCE_THRESHOLD = 150;   // meters - combine turns within this distance
const MAX_GROUPED_TURNS = 4;            // Max turns to announce together

// Direction validation
const MAX_BEARING_DIFF = 90;            // degrees - runner must be heading toward waypoint
```

### Instruction Filtering (What to Announce)

```typescript
// Only announce meaningful instructions
function isMeaningfulInstruction(candidate: TurnInstruction): boolean {
  const maneuver = (candidate.maneuver || '').toLowerCase();
  const instruction = (candidate.instruction || '').toLowerCase();
  
  // Accept if it has a turn maneuver OR the instruction mentions turning
  const isTurn = maneuver.includes('turn') || 
                maneuver.includes('left') || 
                maneuver.includes('right') ||
                instruction.includes('turn left') || 
                instruction.includes('turn right');
  
  // Accept roundabouts, merges, and other significant maneuvers
  const isSignificant = maneuver.includes('roundabout') ||
                       maneuver.includes('merge') ||
                       maneuver.includes('ramp') ||
                       instruction.includes('roundabout') ||
                       instruction.includes('enter') ||
                       instruction.includes('exit');
  
  // Skip trivial "straight" instructions with small distance
  const isSkippable = (maneuver === 'straight' || maneuver === '') && 
                     !instruction.includes('turn') && 
                     !instruction.includes('left') && 
                     !instruction.includes('right') &&
                     candidate.distance <= 10;
  
  return isTurn || isSignificant || !isSkippable;
}
```

### Waypoint Pointer Management

The system maintains a `currentTurnIndex` pointer that tracks which instruction is next.

```typescript
// State refs for turn tracking
let currentTurnIndex = 0;              // Current instruction pointer
let turnApproachAnnounced = false;     // Has 90m warning been given?
let turnAtAnnounced = false;           // Has "now" announcement been given?
let distanceAtTurnReach = 0;           // Distance (km) when we first reached the turn
let closestDistanceToTurn = 0;         // Closest we've been to current turn
let increasingDistanceSamples = 0;     // Count of GPS samples where distance increased
let lastDistanceToTurn = 0;            // Previous distance for comparison
```

### CRITICAL: Direction-Based Waypoint Validation

**RULE: Runner must be heading TOWARD a waypoint to skip to it.**

This prevents the end waypoint being picked up at the first corner when the runner is close to the start.

```typescript
function validateWaypointDirection(
  currentPosition: { lat: number; lng: number },
  candidateWaypoint: { lat: number; lng: number },
  recentPositions: Array<{ lat: number; lng: number }>
): boolean {
  // Need at least 3 positions to calculate direction
  if (recentPositions.length < 3) return true;
  
  // Calculate runner's bearing from recent movement
  const startPos = recentPositions[0];
  const endPos = recentPositions[recentPositions.length - 1];
  const runnerBearing = calculateBearing(startPos.lat, startPos.lng, endPos.lat, endPos.lng);
  
  // Calculate bearing from runner to candidate waypoint
  const waypointBearing = calculateBearing(
    currentPosition.lat, currentPosition.lng,
    candidateWaypoint.lat, candidateWaypoint.lng
  );
  
  // Calculate bearing difference
  let bearingDiff = Math.abs(runnerBearing - waypointBearing);
  if (bearingDiff > 180) bearingDiff = 360 - bearingDiff;
  
  // If running more than 90 degrees away from waypoint, REJECT
  return bearingDiff <= 90;
}
```

### CRITICAL: Protected Final Waypoints

**RULE: Don't allow jumping to last 3 instructions until 60%+ distance covered.**

This prevents premature finish detection when near the start of a loop route.

```typescript
function getMaxAllowedWaypointIndex(
  totalInstructions: number,
  distanceCoveredKm: number,
  targetDistanceKm: number
): number {
  const progressPercent = targetDistanceKm > 0 
    ? (distanceCoveredKm / targetDistanceKm) * 100 
    : 0;
  
  // Protect last 3 waypoints until 60% done, then only protect last 1
  const protectedFinalCount = progressPercent < 60 ? 3 : 1;
  
  return totalInstructions - protectedFinalCount;
}
```

### Dynamic Recalibration Algorithm

On every GPS update, check if we should skip to a later waypoint:

```typescript
function recalibrateTurnPointer(
  currentPosition: { lat: number; lng: number },
  storedInstructions: TurnInstruction[],
  currentIdx: number,
  distanceCoveredKm: number,
  targetDistanceKm: number,
  recentPositions: Array<{ lat: number; lng: number }>
): number {
  const currentTurn = storedInstructions[currentIdx];
  const distanceToCurrentTurn = haversineDistance(currentPosition, currentTurn) * 1000;
  
  // Only check recalibration if:
  // - We're far from current waypoint (> 80m)
  // - Distance keeps increasing for 2+ samples
  // - We're past the approach announcement and distance is growing
  const shouldCheck = distanceToCurrentTurn > 80 || 
    (increasingDistanceSamples >= 2 && distanceToCurrentTurn > 50);
  
  if (!shouldCheck) return currentIdx;
  
  const maxAllowedIdx = getMaxAllowedWaypointIndex(
    storedInstructions.length, distanceCoveredKm, targetDistanceKm
  );
  const maxScanIdx = Math.min(currentIdx + MAX_WAYPOINTS_TO_SKIP, maxAllowedIdx);
  
  let bestIdx = currentIdx;
  let bestDistance = distanceToCurrentTurn;
  
  for (let i = currentIdx + 1; i <= maxScanIdx; i++) {
    const candidate = storedInstructions[i];
    
    // Skip non-meaningful instructions
    if (!isMeaningfulInstruction(candidate)) continue;
    
    const distanceToCandidate = haversineDistance(currentPosition, candidate) * 1000;
    
    // CRITICAL: Validate direction
    if (!validateWaypointDirection(currentPosition, candidate, recentPositions)) {
      console.log(`[Nav] Skip idx ${i}: runner not heading toward waypoint`);
      continue;
    }
    
    // Use 25m hysteresis to prevent premature skipping
    if (distanceToCandidate < bestDistance - 25 && distanceToCandidate < 150) {
      bestIdx = i;
      bestDistance = distanceToCandidate;
    }
  }
  
  if (bestIdx > currentIdx) {
    console.log(`[Nav] RECALIBRATING: Jumping from idx ${currentIdx} to ${bestIdx}`);
    // Reset all announcement flags
  }
  
  return bestIdx;
}
```

### "Passed Turn" Detection

Detect when runner has physically passed a turn point:

```typescript
// Mark when we first reach the turn location (within 45m)
if (distanceToTurn <= 45 && distanceAtTurnReach === 0) {
  distanceAtTurnReach = distanceCoveredKm;
  closestDistanceToTurn = distanceToTurn;
}

// Track closest distance
if (distanceAtTurnReach > 0 && distanceToTurn < closestDistanceToTurn) {
  closestDistanceToTurn = distanceToTurn;
}

// Detect if runner has passed the turn
// Was within 45m, now 40m+ further away = passed
if (closestDistanceToTurn < 45 && distanceToTurn > closestDistanceToTurn + 40) {
  console.log(`[Nav] Passed turn: closest ${closestDistanceToTurn}m, now ${distanceToTurn}m`);
  currentTurnIndex++;
  // Reset all flags
}
```

### Auto-Advance Logic

Multiple conditions can trigger advancing to the next waypoint:

```typescript
let shouldAdvance = false;

// 1. Closer to next turn than current
if (nextTurn) {
  const distanceToNext = haversineDistance(currentPosition, nextTurn) * 1000;
  if (distanceToNext < distanceToTurn) {
    shouldAdvance = true;
  }
}

// 2. Traveled 25m since at-turn announcement
if (distanceAtTurnReach > 0) {
  const distanceTraveled = (distanceCoveredKm - distanceAtTurnReach) * 1000;
  if (distanceTraveled > 25) {
    shouldAdvance = true;
  }
}

// 3. Distance increasing for 3+ samples or exceeded 120m
if (distanceToTurn > lastDistanceToTurn + 5) {
  increasingDistanceSamples++;
  if (increasingDistanceSamples >= 3 || distanceToTurn > 120) {
    shouldAdvance = true;
  }
} else {
  increasingDistanceSamples = 0;
}
```

### Turn Grouping (Closely Spaced Turns)

Combine turns within 150m into a single announcement:

```typescript
// Look ahead for turns within 150m
const groupedTurns = [currentTurn];
let lastTurnInGroup = currentTurn;

for (let i = currentIdx + 1; i < storedInstructions.length; i++) {
  const candidate = storedInstructions[i];
  if (!isMeaningfulInstruction(candidate)) continue;
  
  const distFromLast = haversineDistance(lastTurnInGroup, candidate) * 1000;
  
  if (distFromLast <= 150) {
    groupedTurns.push(candidate);
    lastTurnInGroup = candidate;
  } else {
    break;
  }
  
  if (groupedTurns.length >= 4) break;
}

// Build combined announcement
// "Turn right, then in 80m turn left, then immediately right"
if (groupedTurns.length > 1) {
  const parts = groupedTurns.map((t, i) => {
    if (i === 0) return t.instruction;
    
    const dist = haversineDistance(groupedTurns[i-1], t) * 1000;
    const distText = dist < 50 ? 'immediately' : `in ${Math.round(dist)} meters`;
    return `then ${distText} ${t.instruction.toLowerCase().replace(/^(turn|bear) /, '')}`;
  });
  
  combinedInstruction = parts.join(', ');
}
```

### Announcement Timing

```typescript
// Approach warning: 35m < distance <= 90m
if (distanceToTurn <= 90 && distanceToTurn > 35 && !turnApproachAnnounced) {
  speak(`In ${Math.round(distanceToTurn)} meters, ${instruction}`);
  turnApproachAnnounced = true;
}

// At-turn announcement: distance <= 35m
if (distanceToTurn <= 35 && !turnAtAnnounced) {
  speak(instruction);
  turnAtAnnounced = true;
}
```

### Off-Route Detection

```typescript
const OFF_ROUTE_THRESHOLD = 50; // meters

if (distanceToNearestRoutePoint > OFF_ROUTE_THRESHOLD) {
  // Fetch street name via reverse geocode
  const streetName = await getStreetName(nearestRoutePoint.lat, nearestRoutePoint.lng);
  
  const instruction = streetName 
    ? `You're ${distMeters} meters off route. Head towards ${streetName} to get back on track.`
    : `You're ${distMeters} meters off route. Check your map to get back on track.`;
  
  speak(instruction);
}
```

### Navigation State Reset

When advancing to the next turn, reset all tracking state:

```typescript
function advanceToNextTurn() {
  currentTurnIndex++;
  turnApproachAnnounced = false;
  turnAtAnnounced = false;
  distanceAtTurnReach = 0;
  closestDistanceToTurn = 0;
  increasingDistanceSamples = 0;
  lastDistanceToTurn = 0;
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

## 18. GPS SESSION MANAGEMENT

> **Note:** Sections 18-28 use shared types and helpers defined in Section 13 (Business Logic & Calculations). Key dependencies include:
> - `Position` type: `{ lat: number; lng: number; timestamp?: number; altitude?: number }`
> - `haversineDistance(lat1, lng1, lat2, lng2)` - returns km
> - `getBearing(lat1, lng1, lat2, lng2)` - returns degrees
> - `formatPace(secondsPerKm)` - returns "M:SS" string
> - `formatTime(totalSeconds)` - returns "M:SS" or "H:MM:SS" string

### GPS Watchdog & Recovery

The GPS system requires robust recovery mechanisms for when signal is lost or becomes stale.

```typescript
// Refs for GPS monitoring
const lastGpsFixTimeRef = useRef<number>(Date.now());
const gpsTimeoutAttempts = useRef<number>(0);
const watchdogRecoveryAttempts = useRef<number>(0);
const lastRecoveryAttemptTimeRef = useRef<number>(0);
const [gpsRestartKey, setGpsRestartKey] = useState<number>(0); // Increment to force restart

// GPS Watchdog: runs every 10 seconds
useEffect(() => {
  const watchdogInterval = setInterval(() => {
    const timeSinceLastFix = Date.now() - lastGpsFixTimeRef.current;
    const timeSinceLastRecovery = Date.now() - lastRecoveryAttemptTimeRef.current;
    
    // Warn if no fix for 30 seconds
    if (timeSinceLastFix > 30000 && gpsStatus !== "error") {
      console.warn(`GPS Watchdog: No fix for ${timeSinceLastFix/1000}s`);
      
      // Severe stall - attempt recovery via watchPosition restart
      if (timeSinceLastFix > 60000 && timeSinceLastRecovery > 45000) {
        if (watchdogRecoveryAttempts.current < 5) {
          watchdogRecoveryAttempts.current++;
          lastRecoveryAttemptTimeRef.current = Date.now();
          setMessage(`Reconnecting GPS... (attempt ${watchdogRecoveryAttempts.current})`);
          setGpsRestartKey(prev => prev + 1); // Triggers GPS restart
        } else {
          setMessage("GPS signal lost - try moving to open area");
        }
      } else {
        setMessage("GPS signal weak - keep phone visible");
      }
    } else if (timeSinceLastFix < 10000 && gpsStatus === "active") {
      // GPS recovered
      if (watchdogRecoveryAttempts.current > 0) {
        watchdogRecoveryAttempts.current = 0;
      }
      setMessage("");
    }
  }, 10000);
  
  return () => clearInterval(watchdogInterval);
}, [gpsStatus]);
```

### GPS Accuracy & Distance Filtering

```typescript
// Window-based GPS filtering for accurate distance
interface WindowSegment {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number;
  deltaDist: number;
  bearing: number;
}

// Buffer for sliding window
const windowBufferRef = useRef<WindowSegment[]>([]);
const bufferedDistanceRef = useRef<number>(0);
const lastAcceptedPosRef = useRef<Position | null>(null);
const positionsRef = useRef<Position[]>([]);

// GPS position handler
const handlePosition = (position: GeolocationPosition) => {
  const accuracy = position.coords.accuracy;
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  
  // Update last fix time for watchdog
  lastGpsFixTimeRef.current = Date.now();
  
  // Initial lock requires <30m accuracy
  if (gpsStatus === "acquiring" && accuracy > 30) {
    setMessage(`Refining GPS signal... (${Math.round(accuracy)}m accuracy)`);
    return;
  }
  
  // Accept position after initial lock
  if (gpsStatus === "acquiring") {
    setGpsStatus("active");
    setMessage("GPS locked!");
    positionsRef.current = [{ lat, lng, timestamp: position.timestamp }];
    return;
  }
  
  // Distance calculation with spike filtering
  if (active && lastAcceptedPosRef.current) {
    const rawDelta = haversineDistance(
      lastAcceptedPosRef.current.lat,
      lastAcceptedPosRef.current.lng,
      lat, lng
    );
    
    const timeDeltaMs = position.timestamp - (lastAcceptedPosRef.current.timestamp || 0);
    const speedMps = timeDeltaMs > 0 ? (rawDelta * 1000) / (timeDeltaMs / 1000) : 0;
    
    // Reject impossible speeds (>12.5 m/s = 45 km/h)
    const maxSpeed = 12.5;
    if (speedMps > maxSpeed) {
      console.log(`GPS spike rejected: ${speedMps.toFixed(1)} m/s`);
      return;
    }
    
    // Add to window buffer
    windowBufferRef.current.push({
      lat, lng,
      timestamp: position.timestamp,
      accuracy,
      deltaDist: rawDelta,
      bearing: getBearing(lastAcceptedPosRef.current.lat, lastAcceptedPosRef.current.lng, lat, lng)
    });
    
    // Keep only last 10 segments
    if (windowBufferRef.current.length > 10) {
      windowBufferRef.current.shift();
    }
    
    // Accept segment if movement detected
    if (rawDelta >= 0.003) { // 3 meters minimum
      lastAcceptedPosRef.current = { lat, lng, timestamp: position.timestamp };
      lastMovementTimeRef.current = Date.now();
      setDistance(prev => prev + rawDelta);
      positionsRef.current.push({ lat, lng, timestamp: position.timestamp });
    }
  }
};
```

### Visibility Change Handling

```typescript
// Resume GPS when app becomes visible
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const timeSinceLastFix = Date.now() - lastGpsFixTimeRef.current;
      
      if (timeSinceLastFix > 10000 && gpsStatus === "active") {
        console.log(`Was hidden for ${timeSinceLastFix/1000}s, refreshing GPS`);
        setGpsRestartKey(prev => prev + 1);
      }
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [gpsStatus]);
```

### GPS Track Downsampling (for storage)

```typescript
function downsampleGpsTrack(
  track: Array<{ lat: number; lng: number; timestamp?: number }>,
  maxPoints: number
): Array<{ lat: number; lng: number; timestamp?: number }> {
  if (track.length <= maxPoints) return track;
  
  const step = track.length / maxPoints;
  const result: typeof track = [];
  
  // Always include first point
  result.push(track[0]);
  
  // Sample at intervals
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(track[Math.floor(i * step)]);
  }
  
  // Always include last point
  result.push(track[track.length - 1]);
  
  return result;
}
```

---

## 19. SPEECH QUEUE & AUDIO MANAGEMENT

### Speech Queue System

The speech system uses a FIFO queue to prevent overlapping announcements:

```typescript
const navSpeakQueueRef = useRef<string[]>([]);
const isNavSpeakingRef = useRef<boolean>(false);
const speechStartTimeRef = useRef<number>(0);
const navAudioCacheRef = useRef<Map<string, string>>(new Map()); // Cache audio URLs
const lastNavSpeakTimeRef = useRef<number>(0);

// Process queue items one at a time
const processNavQueue = async () => {
  if (isNavSpeakingRef.current || navSpeakQueueRef.current.length === 0) return;
  
  const text = navSpeakQueueRef.current.shift();
  if (!text) return;
  
  isNavSpeakingRef.current = true;
  speechStartTimeRef.current = Date.now();
  
  // Route to appropriate TTS system
  if (!aiCoachEnabled) {
    // Use device TTS
    speakWithDeviceTTS(text);
    isNavSpeakingRef.current = false;
    processNavQueue();
    return;
  }
  
  // Check audio cache first
  const cacheKey = text.toLowerCase().trim();
  const cachedUrl = navAudioCacheRef.current.get(cacheKey);
  
  if (cachedUrl) {
    await playAudio(cachedUrl);
    processNavQueue();
    return;
  }
  
  // Fetch AI TTS with timeout
  try {
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch('/api/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: getTTSVoice(coachSettings) }),
      signal: controller.signal
    });
    
    clearTimeout(fetchTimeout);
    
    if (!response.ok) throw new Error('TTS failed');
    
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    
    // Cache (limit 20 entries)
    if (navAudioCacheRef.current.size >= 20) {
      const firstKey = navAudioCacheRef.current.keys().next().value;
      if (firstKey) {
        URL.revokeObjectURL(navAudioCacheRef.current.get(firstKey)!);
        navAudioCacheRef.current.delete(firstKey);
      }
    }
    navAudioCacheRef.current.set(cacheKey, audioUrl);
    
    await playAudio(audioUrl);
  } catch (error) {
    console.error('TTS error, using fallback:', error);
    speakWithDeviceTTS(text);
    isNavSpeakingRef.current = false;
  }
  
  setTimeout(() => processNavQueue(), 100);
};
```

### Speech Domains

```typescript
type SpeechDomain = 'coach' | 'nav' | 'system';

// Domain behavior:
// - 'coach': AI coaching - blocked when aiCoachEnabled=false
// - 'nav': Navigation instructions - always allowed
// - 'system': Run control announcements - always allowed

const speak = (text: string, options: { force?: boolean; domain?: SpeechDomain } = {}) => {
  const { force = false, domain = 'coach' } = options;
  
  // Block coaching when AI coach disabled (unless forced)
  if (!force && domain === 'coach' && !aiCoachEnabled) {
    return;
  }
  
  // Block all speech when audio disabled (unless forced)
  if (!force && !audioEnabled) {
    return;
  }
  
  // Throttle: minimum 3 seconds between calls
  const now = Date.now();
  if (now - lastNavSpeakTimeRef.current < 3000 && !force) {
    return;
  }
  lastNavSpeakTimeRef.current = now;
  
  // Add to queue
  navSpeakQueueRef.current.push(text);
  processNavQueue();
};
```

### Speech Queue Watchdog

```typescript
// Recover if speech gets stuck for >45 seconds
useEffect(() => {
  if (!active) return;
  
  const speechWatchdog = setInterval(() => {
    if (isNavSpeakingRef.current && speechStartTimeRef.current > 0) {
      const stuckTime = Date.now() - speechStartTimeRef.current;
      if (stuckTime > 45000) {
        console.warn(`Speech stuck for ${stuckTime/1000}s - forcing recovery`);
        isNavSpeakingRef.current = false;
        speechStartTimeRef.current = 0;
        if (navSpeakQueueRef.current.length > 0) {
          setTimeout(() => processNavQueue(), 100);
        }
      }
    }
  }, 15000);
  
  return () => clearInterval(speechWatchdog);
}, [active]);
```

### Audio Playback with Timeout

```typescript
const playAudio = (audioUrl: string): Promise<void> => {
  return new Promise((resolve) => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    let resolved = false;
    
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      isNavSpeakingRef.current = false;
      resolve();
    };
    
    // Safety timeout - max 30 seconds per audio
    const timeout = setTimeout(cleanup, 30000);
    
    audio.onended = () => { clearTimeout(timeout); cleanup(); };
    audio.onerror = () => { clearTimeout(timeout); cleanup(); };
    audio.play().catch(() => { clearTimeout(timeout); cleanup(); });
  });
};
```

---

## 20. PAUSE/RESUME & TIMER MANAGEMENT

### Timestamp-Based Timer

Using wall-clock timestamps ensures accurate time tracking even when screen is off:

```typescript
const startTimestampRef = useRef<number>(Date.now());
const pausedDurationRef = useRef<number>(0);
const pauseStartTimeRef = useRef<number | null>(null);

// Timer effect - updates every second
useEffect(() => {
  if (!active) {
    // Track pause start
    if (pauseStartTimeRef.current === null && runStarted) {
      pauseStartTimeRef.current = Date.now();
    }
    return;
  }
  
  // Calculate paused duration when resuming
  if (pauseStartTimeRef.current !== null) {
    const pausedFor = Date.now() - pauseStartTimeRef.current;
    pausedDurationRef.current += pausedFor;
    console.log(`Resumed: was paused for ${pausedFor}ms`);
    pauseStartTimeRef.current = null;
  }
  
  // Timer interval
  const interval = setInterval(() => {
    const now = Date.now();
    const elapsedMs = now - startTimestampRef.current - pausedDurationRef.current;
    const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    setTime(elapsedSeconds);
  }, 1000);
  
  return () => clearInterval(interval);
}, [active, runStarted]);
```

### Pause Flow

```typescript
const handlePauseClick = () => {
  if (active) {
    setShowPauseConfirmation(true);
  } else {
    // Resume
    setActive(true);
    speak("Let's go! Run resumed.", { domain: 'system' });
  }
};

const confirmPause = () => {
  setShowPauseConfirmation(false);
  setActive(false);
  setRealtimePace(null);
  recentPaceSamplesRef.current = [];
  speak("Run paused. Take a breather.", { domain: 'system' });
};
```

### Start Run

```typescript
const handleStartRun = () => {
  // Reset timer tracking for fresh run
  startTimestampRef.current = Date.now();
  pausedDurationRef.current = 0;
  pauseStartTimeRef.current = null;
  recentPaceSamplesRef.current = [];
  halfKmAnnouncedRef.current = false;
  setRealtimePace(null);
  
  setRunStarted(true);
  setActive(true);
  speak("Let's go! Your run has started. Good luck!", { domain: 'system' });
};
```

---

## 21. RUN COMPLETION & DATA SAVING

### Save Run Data with Retry

```typescript
const saveRunData = async (): Promise<string> => {
  const now = new Date();
  const date = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  const localRunId = `run_${Date.now()}`;
  
  // Format km splits
  const formattedKmSplits = kmSplits.map((cumulativeTime, idx) => {
    const prevTime = idx > 0 ? kmSplits[idx - 1] : 0;
    const kmTime = cumulativeTime - prevTime;
    return {
      km: idx + 1,
      pace: formatPace(kmTime),
      paceSeconds: kmTime,
      cumulativeTime
    };
  });
  
  // Downsample GPS track for storage
  const gpsTrackData = downsampleGpsTrack(positionsRef.current, 1000);
  
  // Calculate average pace (seconds per km)
  const avgPaceSecondsPerKm = distance > 0 ? time / distance : 0;
  const avgPaceFormatted = formatPace(avgPaceSecondsPerKm);
  
  // Local storage data (always saved first)
  const localRunData = {
    id: localRunId,
    date,
    time: timeStr,
    distance,
    totalTime: time,
    avgPace: avgPaceFormatted,
    difficulty: metadata.levelId,
    lat: metadata.startLat,
    lng: metadata.startLng,
    routeName: metadata.routeName,
    routeId: metadata.routeId,
    eventId: metadata.eventId,
    gpsTrack: gpsTrackData,
    avgCadence: cadence,
    kmSplits: formattedKmSplits,
    targetDistance: metadata.targetDistance,
    elevationGain: routeData?.elevation?.gain || 0,
    elevationLoss: routeData?.elevation?.loss || 0,
    weatherData: runWeather,
    aiCoachEnabled,
    dbSynced: false,
    pendingSync: true,
    sessionKey: sessionIdRef.current,
    detectedWeaknesses
  };
  
  // Retry helper with exponential backoff
  const saveToDbWithRetry = async (data: any, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        if (response.ok) {
          return { success: true, savedRun: await response.json() };
        }
        
        // Don't retry 4xx errors
        if (response.status >= 400 && response.status < 500) {
          return { success: false, error: await response.text() };
        }
      } catch (err) {
        console.error(`Attempt ${attempt} failed:`, err);
      }
      
      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
      }
    }
    return { success: false, error: 'All attempts failed' };
  };
  
  // Try database save if logged in
  const userProfile = JSON.parse(localStorage.getItem("userProfile") || "{}");
  if (userProfile.id) {
    const dbRunData = {
      userId: userProfile.id,
      routeId: metadata.routeId || undefined,
      eventId: metadata.eventId || undefined,
      distance,
      duration: Math.floor(time),
      runDate: date,
      runTime: timeStr,
      avgPace: avgPaceFormatted, // Calculated earlier
      cadence: cadence > 0 ? cadence : undefined,
      elevationGain: routeData?.elevation?.gain,
      elevationLoss: routeData?.elevation?.loss,
      difficulty: metadata.levelId,
      startLat: metadata.startLat,
      startLng: metadata.startLng,
      gpsTrack: gpsTrackData,
      paceData: formattedKmSplits,
      weatherData: runWeather,
      sessionKey: sessionIdRef.current,
      aiCoachEnabled,
      targetTime: metadata.targetTimeSeconds > 0 ? metadata.targetTimeSeconds : undefined
    };
    
    const result = await saveToDbWithRetry(dbRunData);
    
    if (result.success && result.savedRun) {
      // Save weakness events
      if (detectedWeaknesses.length > 0) {
        await fetch(`/api/runs/${result.savedRun.id}/weakness-events/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: detectedWeaknesses })
        }).catch(console.error);
      }
      
      // Link coaching logs
      await fetch('/api/coaching-logs/link-to-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: sessionIdRef.current,
          runId: result.savedRun.id,
          userId: userProfile.id
        })
      }).catch(console.error);
      
      // Update local storage with DB ID
      const synced = { ...localRunData, id: result.savedRun.id, dbSynced: true, pendingSync: false };
      const runs = JSON.parse(localStorage.getItem("runHistory") || "[]");
      runs.push(synced);
      localStorage.setItem("runHistory", JSON.stringify(runs));
      
      return result.savedRun.id;
    } else {
      showToast("Run saved locally - will sync later", 'warning');
    }
  }
  
  // Fallback: local storage only
  const runs = JSON.parse(localStorage.getItem("runHistory") || "[]");
  runs.push(localRunData);
  localStorage.setItem("runHistory", JSON.stringify(runs));
  
  return localRunId;
};
```

### Confirm Stop Flow

```typescript
const confirmStop = async () => {
  setShowExitConfirmation(false);
  runStoppedRef.current = true;
  
  // Stop all audio
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.src = '';
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  
  // Clear session from local storage
  clearActiveRunSession();
  
  if (time > 0 && distance > 0) {
    const runId = await saveRunData();
    speak("Run complete! Great job!", { domain: 'system' });
    navigate(`/history/${runId}`);
  } else {
    navigate("/");
  }
};
```

---

## 22. CADENCE DETECTION & ANALYSIS

### DeviceMotion-Based Cadence

```typescript
// Permission states
type MotionPermission = "unknown" | "granted" | "denied" | "unavailable";

const requestMotionPermission = async () => {
  if (!('DeviceMotionEvent' in window)) {
    setMotionPermission("unavailable");
    return;
  }
  
  // iOS requires explicit permission request
  if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
    try {
      const response = await (DeviceMotionEvent as any).requestPermission();
      setMotionPermission(response === 'granted' ? "granted" : "denied");
    } catch (err) {
      setMotionPermission("denied");
    }
  } else {
    // Android/other - permission implicit
    setMotionPermission("granted");
  }
};

// Step detection
const stepTimestampsRef = useRef<number[]>([]);
const lastAccelRef = useRef<number>(0);

useEffect(() => {
  if (!active || motionPermission !== "granted") return;
  
  const handleMotion = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity;
    if (!acc || acc.z === null) return;
    
    const magnitude = Math.sqrt(
      (acc.x || 0) ** 2 + 
      (acc.y || 0) ** 2 + 
      (acc.z || 0) ** 2
    );
    
    const threshold = 12;
    const minTimeBetweenSteps = 200; // ms
    const now = Date.now();
    
    // Detect step on threshold crossing (rising edge)
    if (magnitude > threshold && lastAccelRef.current <= threshold) {
      const lastStep = stepTimestampsRef.current[stepTimestampsRef.current.length - 1] || 0;
      
      if (now - lastStep > minTimeBetweenSteps) {
        stepTimestampsRef.current.push(now);
        
        // Keep only last 30 steps
        if (stepTimestampsRef.current.length > 30) {
          stepTimestampsRef.current = stepTimestampsRef.current.slice(-30);
        }
        
        // Calculate cadence from 15-second window
        const recentSteps = stepTimestampsRef.current.filter(t => now - t < 15000);
        if (recentSteps.length >= 3) {
          const timeSpan = (recentSteps[recentSteps.length - 1] - recentSteps[0]) / 1000 / 60;
          if (timeSpan > 0) {
            const stepsPerMinute = Math.round((recentSteps.length - 1) / timeSpan);
            setCadence(stepsPerMinute);
          }
        }
      }
    }
    
    lastAccelRef.current = magnitude;
  };
  
  window.addEventListener('devicemotion', handleMotion);
  return () => window.removeEventListener('devicemotion', handleMotion);
}, [active, motionPermission]);
```

### AI Cadence Analysis API

**POST** `/api/ai/analyze-cadence`

```typescript
// Request
{
  heightCm: number;
  paceMinPerKm: number;
  cadenceSpm: number;
  distanceKm: number;
  userFitnessLevel?: string;
  userAge?: number;
}

// Response
{
  idealCadenceMin: number;
  idealCadenceMax: number;
  strideAssessment: "overstriding" | "understriding" | "optimal";
  shortAdvice: string;      // 1 sentence
  coachingAdvice: string;   // Full coaching tip
}
```

---

## 23. WEATHER INTEGRATION

### Fetch Weather on GPS Lock

```typescript
// In handlePosition when GPS first locks:
if (gpsStatus === "acquiring") {
  setGpsStatus("active");
  
  // Fetch weather
  fetch(`/api/weather/current?lat=${lat}&lng=${lng}`)
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (data?.current) {
        setRunWeather(data.current);
      }
    })
    .catch(console.error);
}
```

### Weather Data Structure

```typescript
interface RunWeather {
  temperature: number;       // Celsius
  feelsLike: number;
  humidity: number;          // Percentage
  windSpeed: number;         // km/h
  windDirection: string;     // "NE", "SW", etc.
  condition: string;         // "Sunny", "Cloudy", etc.
  uvIndex: number;
  precipitationProbability: number;
}
```

### Weather API Endpoint

**GET** `/api/weather/current?lat={lat}&lng={lng}`

Uses Google Maps Platform Weather API internally. Response:

```typescript
{
  current: {
    temperature: 22,
    feelsLike: 24,
    humidity: 65,
    windSpeed: 12,
    windDirection: "NE",
    condition: "Partly Cloudy",
    uvIndex: 4,
    precipitationProbability: 10
  }
}
```

### Weather in Coaching Context

Weather is included in AI coaching requests:

```typescript
const coachingRequest = {
  // ... other fields
  weather: runWeather ? {
    temperature: runWeather.temperature,
    humidity: runWeather.humidity,
    windSpeed: runWeather.windSpeed,
    conditions: runWeather.condition
  } : undefined
};
```

---

## 24. PRE-RUN SUMMARY

### Generation Trigger

Pre-run summary is generated when GPS locks (before user starts running):

```typescript
useEffect(() => {
  if (gpsStatus !== "active" || !currentPosition || initialAnnouncementMadeRef.current) return;
  if (isResuming) {
    initialAnnouncementMadeRef.current = true;
    speak("Welcome back! Resuming your run.", { domain: 'system' });
    return;
  }
  
  initialAnnouncementMadeRef.current = true;
  generateAndSpeakSummary();
}, [gpsStatus, currentPosition, isResuming]);
```

### Summary API Request

**POST** `/api/ai/run-summary`

```typescript
// Request
{
  routeName: string;
  targetDistance: number;
  targetTimeSeconds?: number;
  difficulty: string;
  elevationGain?: number;
  elevationLoss?: number;
  elevationProfile?: ElevationPoint[];
  terrainType?: string;
  weather?: {
    temperature: number;
    humidity: number;
    windSpeed: number;
    conditions: string;
  };
  coachName?: string;
  userName?: string;
  includeAiConfig?: boolean;
  firstTurnInstruction?: {
    instruction: string;
    maneuver: string;
    distance: number;
  };
}

// Response
{
  summary: string;  // AI-generated summary (2-3 sentences)
}
```

### Summary Content Includes

- Route name and distance
- Difficulty assessment
- Elevation preview (if notable hills)
- Weather conditions (if extreme)
- First turn direction
- Target pace context (if target time set)
- Ends with "Tap Start Run when you're ready"

---

## 25. POST-RUN AI ANALYSIS

### Analysis Request

**POST** `/api/ai/run-analysis`

```typescript
{
  runId: string;
  userId: string;
  distance: number;
  duration: number;
  avgPace: string;
  paceData: Array<{ km: number; pace: string; paceSeconds: number }>;
  elevationGain?: number;
  elevationLoss?: number;
  weather?: RunWeather;
  targetTime?: number;          // CRITICAL: for target time analysis
  userProfile: {
    age?: number;
    gender?: string;
    fitnessLevel?: string;
    weight?: string;
  };
  goals?: Array<{ type: string; title: string }>;
}
```

### Analysis Response

```typescript
{
  highlights: string[];           // Best moments (e.g., "Strong finish - last km was fastest")
  struggles: string[];            // Challenges (e.g., "Pace dropped 25% in km 4")
  personalBests: string[];        // New records if any
  demographicComparison: string;  // How they compare to peers
  coachingTips: string[];         // Actionable improvements
  overallAssessment: string;      // Summary paragraph
  weatherImpact?: string;         // How weather affected performance
  warmUpAnalysis?: string;        // First km analysis
  goalProgress?: string;          // Progress toward goals
  targetTimeAnalysis?: string;    // CRITICAL: Analysis vs target time
}
```

### Target Time Analysis Examples

```
// Beat target
"Congratulations! You beat your target time of 30:00 by 1:23! This shows excellent pacing discipline."

// Missed target
"You finished 2:15 behind your 30:00 target. The data shows pace dropped significantly in km 4-5, likely due to the hill. Consider more conservative early pacing next time."

// Close to target
"Just 32 seconds off your 30:00 target! Your pacing was very consistent - a strong performance."
```

### Storage & Caching

Analysis is stored in `run_analyses` table and retrieved instantly on return visits:

```typescript
// Check for existing analysis first
const existing = await db.query.runAnalyses.findFirst({
  where: eq(runAnalyses.runId, runId)
});

if (existing) {
  return existing; // Return cached analysis
}

// Generate new analysis
const analysis = await generateAnalysis(runData);
await db.insert(runAnalyses).values({ runId, ...analysis });
return analysis;
```

---

## 26. WEAKNESS DETECTION

### Weakness Event Interface

```typescript
interface WeaknessEvent {
  startDistanceKm: number;
  endDistanceKm: number;
  durationSeconds: number;
  avgPaceBefore: number;       // seconds/km
  avgPaceDuring: number;       // seconds/km
  dropPercent: number;         // How much slower
  coachResponseGiven?: string; // What coach said
}
```

### Detection Algorithm

```typescript
const PACE_DROP_THRESHOLD = 0.20;    // 20% slower triggers weakness
const MIN_WEAKNESS_DURATION = 30;     // Minimum 30 seconds
const ROLLING_WINDOW_SIZE = 10;       // Pace samples for median

// State refs
const rollingPaceWindowRef = useRef<Array<{
  distanceKm: number;
  timeSeconds: number;
  paceSecondsPerKm: number;
}>>([]);
const baselinePaceRef = useRef<number>(0);
const inSlowdownRef = useRef<boolean>(false);
const slowdownStartRef = useRef<{ distanceKm: number; timeSeconds: number; baselinePace: number } | null>(null);

// Calculate rolling pace median
function getMedianPace(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// On each GPS update with valid distance/time:
const currentPace = elapsedTime / distanceCovered;
rollingPaceWindowRef.current.push({ distanceKm: distance, timeSeconds: time, paceSecondsPerKm: currentPace });

if (rollingPaceWindowRef.current.length > ROLLING_WINDOW_SIZE) {
  rollingPaceWindowRef.current.shift();
}

// Establish baseline after 500m
if (distance > 0.5 && baselinePaceRef.current === 0) {
  baselinePaceRef.current = currentPace;
}

// Check for slowdown
if (baselinePaceRef.current > 0) {
  const recentPaces = rollingPaceWindowRef.current.map(s => s.paceSecondsPerKm);
  const medianPace = getMedianPace(recentPaces);
  const dropPercent = (medianPace - baselinePaceRef.current) / baselinePaceRef.current;
  
  if (dropPercent > PACE_DROP_THRESHOLD && !inSlowdownRef.current) {
    // Slowdown started
    inSlowdownRef.current = true;
    slowdownStartRef.current = { distanceKm: distance, timeSeconds: time, baselinePace: baselinePaceRef.current };
  } else if (dropPercent <= PACE_DROP_THRESHOLD * 0.5 && inSlowdownRef.current) {
    // Slowdown ended - record event if significant
    const start = slowdownStartRef.current!;
    const duration = time - start.timeSeconds;
    
    if (duration >= MIN_WEAKNESS_DURATION) {
      setDetectedWeaknesses(prev => [...prev, {
        startDistanceKm: start.distanceKm,
        endDistanceKm: distance,
        durationSeconds: Math.round(duration),
        avgPaceBefore: start.baselinePace,
        avgPaceDuring: medianPace,
        dropPercent: Math.round(dropPercent * 100)
      }]);
    }
    
    inSlowdownRef.current = false;
    slowdownStartRef.current = null;
  }
}
```

### Saving Weakness Events

Weakness events are saved to the database after run completion:

**POST** `/api/runs/:runId/weakness-events/bulk`

```typescript
{
  events: WeaknessEvent[]
}
```

---

## 27. AI ROUTE GENERATION

### Route Generation Flow

1. **Find nearby landmarks** using Google Places API
2. **Design waypoints** using OpenAI to create intelligent loops
3. **Get directions** using Google Directions API
4. **Get elevation profile** using Google Elevation API
5. **Parse turn instructions** from directions response

### Generate Multiple Routes

**POST** `/api/routes/generate`

```typescript
// Request
{
  startLat: number;
  startLng: number;
  targetDistance: number;         // km
  difficulty?: "easy" | "moderate" | "hard";
}

// Response
{
  success: true;
  routes: Array<{
    id: string;
    routeName: string;
    actualDistance: number;
    duration: number;              // seconds
    difficulty: "easy" | "moderate" | "hard";
    waypoints: Array<{ lat: number; lng: number }>;
    polyline: string;              // Encoded polyline
    turnInstructions: TurnInstruction[];
    elevation: {
      gain: number;
      loss: number;
      maxElevation: number;
      minElevation: number;
      profile: ElevationPoint[];
    };
    aiReasoning?: string;
  }>;
}
```

### Places API Search

```typescript
const RUNNING_PLACE_TYPES = ['park', 'natural_feature', 'campground', 'stadium', 'tourist_attraction'];

async function findNearbyTrailAnchors(lat: number, lng: number, radiusKm: number) {
  const places = [];
  const radiusMeters = Math.min(radiusKm * 1000, 50000);
  
  for (const placeType of RUNNING_PLACE_TYPES) {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&type=${placeType}&key=${GOOGLE_MAPS_API_KEY}`;
    const data = await fetch(url).then(r => r.json());
    
    if (data.status === 'OK' && data.results) {
      for (const result of data.results.slice(0, 5)) {
        places.push({
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          name: result.name,
          type: placeType
        });
      }
    }
  }
  
  // Also search keywords
  for (const keyword of ['walking trail', 'river walk', 'nature reserve']) {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=${encodeURIComponent(keyword)}&key=${GOOGLE_MAPS_API_KEY}`;
    const data = await fetch(url).then(r => r.json());
    // ... add results
  }
  
  return places;
}
```

### AI Waypoint Design Prompt

```typescript
const prompt = `You are a running route designer. Design 3 diverse running loop routes.

START LOCATION: ${startLat.toFixed(6)}, ${startLng.toFixed(6)}
TARGET DISTANCE: ${targetDistance}km
APPROXIMATE LOOP RADIUS: ${baseRadius}km

NEARBY POINTS OF INTEREST:
${placeDescriptions}

DESIGN RULES:
1. Each route must be a LOOP that returns to the start point
2. Prioritize trails, parks, river walks when available
3. Create 3 DIFFERENT routes going in different directions
4. Use 3-5 waypoints per route to create genuine loops
5. Place waypoints at actual landmarks or logical turning points
6. ALL coordinates must be within ${maxDistance}km of start

Return ONLY valid JSON:
{
  "routes": [
    {
      "routeName": "Descriptive Name",
      "description": "Brief description",
      "waypoints": [
        {"lat": 0.000000, "lng": 0.000000, "reason": "Why this waypoint"}
      ]
    }
  ]
}`;
```

---

## 28. EVENTS SYSTEM

### Event Types

```typescript
type EventType = 'parkrun' | 'marathon' | 'half_marathon' | '5k' | '10k' | 'fun_run' | 'trail' | 'custom';
```

### Schedule Types

```typescript
type ScheduleType = 'one_time' | 'recurring';

type RecurrencePattern = 
  | 'daily'
  | 'weekly'      // Uses dayOfWeek (0-6)
  | 'fortnightly' // Every 2 weeks
  | 'monthly';    // Uses dayOfMonth (1-31)
```

### Event Schema

```typescript
interface Event {
  id: string;
  name: string;
  country: string;
  city?: string;
  description?: string;
  eventType: EventType;
  routeId: string;           // Links to routes table
  createdByUserId: string;
  scheduleType: ScheduleType;
  specificDate?: Date;       // For one_time events
  recurrencePattern?: RecurrencePattern;
  dayOfWeek?: number;        // 0=Sunday, 6=Saturday
  dayOfMonth?: number;       // 1-31
  isActive: boolean;
}
```

### Browse Events by Country

**GET** `/api/events/by-country/:country`

```typescript
// Response
{
  events: Array<{
    id: string;
    name: string;
    city?: string;
    description?: string;
    eventType: string;
    route: {
      distance: number;
      difficulty: string;
      elevationGain?: number;
    };
    nextOccurrence?: string;  // ISO date of next event
    schedule: {
      type: string;
      pattern?: string;
      dayOfWeek?: number;
    };
  }>;
}
```

### Calculate Next Occurrence

```typescript
function getNextOccurrence(event: Event): Date | null {
  const now = new Date();
  
  if (event.scheduleType === 'one_time') {
    return event.specificDate && event.specificDate > now ? event.specificDate : null;
  }
  
  // Recurring events
  switch (event.recurrencePattern) {
    case 'daily':
      return new Date(now.setHours(8, 0, 0, 0)); // Next occurrence today at 8am
      
    case 'weekly':
      const daysUntil = (event.dayOfWeek! - now.getDay() + 7) % 7 || 7;
      const next = new Date(now);
      next.setDate(now.getDate() + daysUntil);
      next.setHours(9, 0, 0, 0); // Default 9am
      return next;
      
    case 'fortnightly':
      // Calculate based on first event date
      // ... logic based on event creation date
      
    case 'monthly':
      const nextMonth = new Date(now.getFullYear(), now.getMonth(), event.dayOfMonth!);
      if (nextMonth <= now) nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setHours(9, 0, 0, 0);
      return nextMonth;
      
    default:
      return null;
  }
}
```

### Start Event Run

Events are run like regular routes but with `eventId` tracked:

```typescript
// Navigate to run session with event context
navigate(`/run-session?routeId=${event.routeId}&eventId=${event.id}&distance=${route.distance}`);
```

The `eventId` is stored with the completed run to link participation.

### Create Event from Completed Run (Admin)

**POST** `/api/events`

```typescript
{
  name: string;
  country: string;
  city?: string;
  description?: string;
  eventType: EventType;
  sourceRunId: string;       // Create route from this run's GPS track
  scheduleType: ScheduleType;
  specificDate?: string;     // For one_time
  recurrencePattern?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
}
```

---

## QUICK IMPLEMENTATION CHECKLIST

### Core Features
- [ ] User registration/login with password hashing
- [ ] Route map with start/finish markers, legend, and polyline
- [ ] GPS tracking with accuracy filtering and spike rejection
- [ ] Distance/time/pace calculations (Haversine distance)
- [ ] Km milestone announcements with split times
- [ ] Session auto-save every 5 seconds to local storage
- [ ] Resume interrupted session (12-hour expiration)
- [ ] Pause/resume with timestamp-based timer tracking

### GPS Management
- [ ] GPS watchdog (10s interval, detect 30s stale)
- [ ] Recovery attempts (max 5, 45s cooldown)
- [ ] Visibility change handling (refresh on app resume)
- [ ] Track downsampling for storage (max 1000 points)
- [ ] Speed-based spike filtering (max 12.5 m/s)

### Speech & Audio
- [ ] Speech queue (FIFO, one-at-a-time)
- [ ] Domain-based routing (coach/nav/system)
- [ ] AI TTS with caching (20 entries max)
- [ ] Device TTS fallback
- [ ] Queue watchdog (45s stuck detection)
- [ ] 3-second throttling between announcements

### Navigation
- [ ] Turn-by-turn from Google Directions API
- [ ] Street-to-street format announcements
- [ ] Distance-based triggers (200m, 100m, 30m)
- [ ] Off-route detection (>100m threshold)
- [ ] Direction-based waypoint validation
- [ ] Protected final waypoints (60% rule)
- [ ] Turn grouping within 150m

### AI Coaching
- [ ] Pre-run summary with route/weather/terrain
- [ ] Periodic coaching (120s interval)
- [ ] Phase-based statements (early/mid/late/final)
- [ ] Terrain-aware hill coaching (5%+ grade triggers)
- [ ] Pace drop detection and encouragement
- [ ] Talk to coach (voice input with SpeechRecognition)
- [ ] Weather-aware coaching context
- [ ] Goal-aware coaching
- [ ] 0.50km pace summary with AI or fallback

### Cadence Detection
- [ ] DeviceMotion permission (iOS explicit request)
- [ ] Step detection (12g threshold, 200ms debounce)
- [ ] 15-second rolling window for SPM
- [ ] AI cadence analysis API integration

### Weather
- [ ] Fetch on GPS lock via weather API
- [ ] Store with run data
- [ ] Include in coaching context

### Run Completion
- [ ] Save with retry (3 attempts, exponential backoff)
- [ ] Local storage fallback with pendingSync flag
- [ ] Link coaching logs to run
- [ ] Save weakness events
- [ ] GPS track downsampling

### Weakness Detection
- [ ] Rolling pace median (10 samples)
- [ ] 20% drop threshold detection
- [ ] 30s minimum duration
- [ ] Record start/end distance and pace drop

### Route Generation
- [ ] Google Places API for landmarks
- [ ] OpenAI for intelligent waypoint design
- [ ] Google Directions API for turn-by-turn
- [ ] Google Elevation API for profiles
- [ ] Generate 3 diverse loop options

### Events System
- [ ] Event types (parkrun, marathon, 5k, etc.)
- [ ] Schedule types (one-time, recurring)
- [ ] Recurrence patterns (daily/weekly/fortnightly/monthly)
- [ ] Browse by country
- [ ] Calculate next occurrence
- [ ] Track eventId with completed runs

### Live Features
- [ ] Live session sync every 5 seconds
- [ ] Share with friends (invite observer)
- [ ] Observer view (watch friend's run)
- [ ] Push notifications for invites

### Post-Run Analysis
- [ ] AI analysis with highlights/struggles
- [ ] Target time achievement analysis (CRITICAL)
- [ ] Demographic comparison
- [ ] Personal bests detection
- [ ] Cache analysis in database
- [ ] Coaching log review

---

## END OF DOCUMENT

This document provides complete specifications for building a fully independent mobile app with feature parity to the web app. All business logic, API formats, UI requirements, and implementation details are included. Version 2.0 adds comprehensive coverage of GPS management, speech queuing, pause/resume timing, run completion flow, cadence detection, weather integration, pre-run summary, post-run analysis, weakness detection, AI route generation, and the events system.
