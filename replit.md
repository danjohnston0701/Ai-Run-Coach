# AI Run Coach

## Overview

AI Run Coach is an Android fitness tracking app with AI-powered real-time coaching, GPS run tracking, intelligent route generation, and Garmin wearable integration. The project consists of two main components:

1. **Android App** (Kotlin/Jetpack Compose) — the mobile client located in this repository
2. **Node.js/Express Backend** — located at a separate path (`/Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android`) and deployed to production via Replit → Google Cloud Run at `https://airuncoach.live`

The backend also serves a React web frontend. The project uses PostgreSQL (hosted on Neon.com) for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Android App (Client)

- **Language:** Kotlin
- **UI Framework:** Jetpack Compose
- **Architecture Pattern:** MVVM (ViewModels + UI Screens)
- **Dependency Injection:** Hilt
- **Networking:** Retrofit + OkHttp with Gson for JSON parsing
- **Local Storage:** SharedPreferences (used as cache; server is source of truth)
- **Key Packages:**
  - `ui/screens/` — Compose screens (MapMyRunSetupScreen, RouteSelectionScreen, FriendsScreen, GoalsScreen, etc.)
  - `viewmodel/` — ViewModels managing state and API calls
  - `network/` — Retrofit API service definitions and models
  - `domain/model/` — Domain data models (RunSession, Goal, etc.)
  - `data/` — Configuration files (GarminConfig, etc.)
  - `service/` — Background services (RunTrackingService for GPS tracking)

- **Navigation:** Single `MainScreen.kt` with Jetpack Navigation; the unified entry point for run setup is `MapMyRunSetupScreen.kt` (the old `RunSetupScreen.kt` was deleted and must never be restored)
- **API Base URL:** Configured in `RetrofitClient.kt` — uses `https://airuncoach.live` for production, `http://10.0.2.2:3000` for emulator debug
- **Maps:** Google Maps SDK for route display with polyline rendering
- **Audio:** OpenAI TTS (base64 MP3 from backend) with Android TTS fallback for AI coaching during runs
- **Speech Input:** Android SpeechRecognizer for "Talk to Coach" feature

### Backend (Server)

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Location:** Separate repository/directory (`Ai-Run-Coach-IOS-and-Android`)
- **Deployment:** Replit → Google Cloud Run
- **Production URL:** `https://airuncoach.live`
- **Build:** `npm run server:build` outputs to `server_dist/index.js`
- **Key Files:**
  - `server/routes.ts` — All API endpoint definitions
  - `server/intelligent-route-generation.ts` — GraphHopper-powered circular route generation
  - `server/ai-service.ts` — OpenAI integration for coaching and TTS
  - `shared/schema.ts` — Shared database schema definitions

### API Structure

The backend exposes RESTful endpoints. Key endpoint groups:

| Category | Endpoints | Notes |
|----------|-----------|-------|
| Auth | `POST /api/auth/login`, `/register` | JWT-based authentication |
| Users | `GET/PUT /api/users/:id`, coach-settings, profile-picture | Profile management |
| Runs | `POST /api/runs/upload`, `GET /api/users/:userId/runs` | Run data CRUD |
| Goals | `GET /api/goals/user/:userId`, `POST /api/goals`, `DELETE /api/goals/:id` | Goal tracking |
| Routes | `POST /api/routes/generate-intelligent` | GraphHopper circular route generation |
| Coaching | `POST /api/coaching/pace-update`, `/struggle-coaching`, `/talk-to-coach`, etc. | AI coaching with TTS audio |
| Friends | `GET /api/users/:userId/friends`, `POST /api/users/:userId/friends` | Social features |
| Events | `GET /api/events/grouped` | Organized races/parkruns |
| Garmin | `GET /api/auth/garmin`, `/api/garmin/wellness/sync` | OAuth + data sync |

**Important endpoint naming:** The Android app endpoint paths must exactly match the backend. Several mismatches were fixed (e.g., `/api/goals/{userId}` → `/api/goals/user/{userId}`, `/api/runs/user/{userId}` → `/api/users/{userId}/runs`). Always verify against `server/routes.ts`.

### Database

- **Provider:** Neon.com (managed PostgreSQL)
- **ORM/Schema:** Drizzle ORM (defined in `shared/schema.ts`)
- **Key Tables:** `users`, `runs`, `goals`, `friendships`, `group_runs`, `events`, `daily_fitness`, `connected_devices`
- **Connection:** Via `DATABASE_URL` environment variable

### Authentication

- **Method:** JWT (JSON Web Tokens)
- **Flow:** Login/Register → receive JWT → include as `Authorization: Bearer <token>` header
- **Backend Middleware:** `authMiddleware` on protected routes
- **Android:** Token stored in SharedPreferences, attached by Retrofit interceptor
- **401 Handling:** Auto-clears invalid token and prompts re-login

### AI Coaching System

- **LLM:** OpenAI GPT-4o-mini for generating coaching messages
- **TTS:** OpenAI TTS API for voice output (6 voices mapped to coach gender/accent settings)
- **Triggers:** Periodic, km milestones, terrain changes, pace drops, user voice input
- **Audio Delivery:** Base64-encoded MP3 returned in API responses, decoded and played on Android

### Route Generation

- **API:** GraphHopper Round Trip API (free tier, "foot" profile only — never use "hike")
- **Polyline:** Encoded using `@mapbox/polyline` library (Google Polyline format, compatible with Android's `PolyUtil.decode()`)
- **Flow:** User sets distance/preferences → backend generates 3 circular routes → Android displays on Google Maps

### Garmin Integration

- **Watch App:** Garmin Connect IQ companion app (Monkey C language) in `garmin-companion-app/`
- **Auth:** OAuth 1.0a via backend bridge pattern (Garmin requires HTTPS callbacks)
- **Data:** Real-time HR streaming, post-run wellness sync (Body Battery, Sleep, HRV)
- **Build:** Connect IQ SDK 8.4.0, built via `build-watch-app.sh`

### Key Design Decisions

1. **Server as source of truth:** All user data lives in PostgreSQL. Android caches in SharedPreferences for offline/performance but always defers to server data.
2. **Single unified setup screen:** `MapMyRunSetupScreen.kt` handles all run configuration. The old `RunSetupScreen.kt` was intentionally deleted and must never be recreated.
3. **Backend bridge for OAuth:** Garmin OAuth uses the backend (`https://airuncoach.live/garmin/callback`) as the callback URL since Garmin requires HTTPS, then redirects to the app via deep link.
4. **Base64 for media:** Profile pictures and TTS audio are transferred as base64-encoded JSON (not multipart) for simplicity.

## External Dependencies

### Third-Party Services

| Service | Purpose | Config |
|---------|---------|--------|
| **OpenAI** (GPT-4o-mini + TTS) | AI coaching text generation and voice synthesis | `OPENAI_API_KEY` env var |
| **GraphHopper** | Circular running route generation | `GRAPHHOPPER_API_KEY` env var; free tier, "foot" profile only |
| **Google Maps SDK** | Map display in Android app | API key in Android manifest |
| **Neon.com PostgreSQL** | Primary database | `DATABASE_URL` env var |
| **Garmin Connect API** | OAuth, wellness data sync | `GARMIN_CONSUMER_KEY`, `GARMIN_CONSUMER_SECRET` env vars |
| **Replit** | Backend hosting and deployment to Google Cloud Run | 12 environment variables configured in Replit Secrets |

### Android Dependencies

- Jetpack Compose (UI)
- Retrofit + OkHttp (networking)
- Gson (JSON parsing)
- Hilt (dependency injection)
- Google Maps SDK (maps)
- Google Play Services Location (GPS)
- Android SpeechRecognizer (voice input)
- Android MediaPlayer (audio playback)

### Backend Dependencies

- Express.js (HTTP server)
- Drizzle ORM (database)
- `@mapbox/polyline` (polyline encoding)
- OpenAI SDK (AI + TTS)
- JWT (authentication)
- `node-fetch` or similar (GraphHopper API calls)