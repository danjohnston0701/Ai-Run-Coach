# AI Run Coach

## Overview

AI Run Coach is a mobile-first web application that provides AI-powered running coaching, route mapping, and session tracking. The app helps runners plan routes based on difficulty level, receive real-time voice coaching during runs, and analyze their performance with detailed insights. Key features include target distance/time settings, GPS route mapping, live run sharing with friends, and integration with OpenAI for personalized coaching advice.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **Styling**: Tailwind CSS v4 with custom theme variables for dark mode design
- **UI Components**: shadcn/ui component library (New York style) with Radix UI primitives
- **State Management**: TanStack React Query for server state, localStorage for user profile persistence
- **Animations**: Framer Motion for smooth transitions and micro-interactions
- **Maps**: Leaflet for route visualization
- **Charts**: Recharts for run performance graphs
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Structure**: RESTful endpoints under `/api` prefix
- **Authentication**: Password hashing with bcryptjs, session-based auth planned
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **AI Integration**: OpenAI API for coaching advice and route generation

### AI-Powered Route Planning System
The route generation uses a hybrid AI approach:
1. **Area Data Collection**: Google Places API retrieves nearby parks, Google Elevation API samples terrain
2. **AI Waypoint Design**: OpenAI analyzes area data and designs optimal waypoints based on target distance, difficulty level (easy/moderate/hard), and terrain preferences
3. **Route Generation**: Google Directions API creates final walking routes from AI-designed waypoints
4. **Elevation Analysis**: Route elevation gain/loss is calculated and displayed on route cards
5. **Elevation Profiles**: Full elevation profile with lat/lng, elevation, distance, and grade stored for each route

Key files:
- `server/aiRoutePlanner.ts`: Core AI route planning logic with elevation profiling
- `server/routePlanner.ts`: Fallback geometric route generation
- Endpoint: `POST /api/routes/generate-options` (generates 9 routes: 3 easy, 3 moderate, 3 hard)

### Hill-Awareness Coaching System
Real-time terrain-aware coaching during runs:
1. **Elevation Tracking**: Routes store detailed elevation profiles with grade calculations for each segment
2. **Terrain Detection**: `client/src/lib/elevationTracker.ts` calculates current grade and upcoming terrain changes within 200m
3. **AI Integration**: Coaching endpoint receives terrain data (current altitude, grade, upcoming hills) and prioritizes hill guidance
4. **Knowledge Base**: Hill-specific coaching knowledge includes technique tips, pacing strategies, breathing advice, and mental approaches

Key data structure (ElevationPoint):
- `lat/lng`: GPS coordinates
- `elevation`: Altitude in meters
- `distance`: Cumulative distance from start
- `grade`: Slope percentage to next point (positive = uphill)

### Data Storage
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` - contains tables for users, pre-registrations, friends, routes, runs, live sessions, and Garmin data
- **Migrations**: Drizzle Kit with migrations output to `./migrations`
- **Client-side Storage**: localStorage for user profile and run history (interim solution)

### Session Persistence
The app supports resuming interrupted runs with the following architecture:
- **Active Session Storage**: `client/src/lib/activeRunSession.ts` provides save/load/clear functions using localStorage
- **Session Data**: Captures elapsed time, distance, cadence, splits, route data, audio settings, and run metadata
- **Auto-save**: RunSession saves state every 5 seconds during active runs
- **12-hour Expiration**: Sessions older than 12 hours are automatically cleared
- **Resume Flow**: Home page displays a resume banner when an active session exists, allowing users to continue where they left off
- **Metadata Tracking**: sessionMetadataRef in RunSession tracks route parameters (targetDistance, levelId, startLat/Lng, routeName, routeId) separately from real-time GPS tracking

### Key Design Patterns
- **Monorepo Structure**: Client code in `/client`, server in `/server`, shared types in `/shared`
- **Path Aliases**: `@/` for client src, `@shared/` for shared code, `@assets/` for attached assets
- **API Client**: Centralized fetch wrapper in `queryClient.ts` with error handling
- **Component Composition**: shadcn/ui pattern with composable, accessible components

### Pages and Features
- **Landing Page**: Marketing page with feature highlights for new users
- **Profile Setup**: Onboarding flow collecting fitness level, goals, coach name preference
- **Home**: Run configuration (distance slider, difficulty selection, time target)
- **Run Session**: Live run tracking with voice visualizer, map view, friend sharing
- **Run History**: List of completed runs with key metrics
- **Run Insights**: Detailed post-run analysis with real data display:
  - Auto-navigation from run completion to insights page
  - Real distance, time, pace, cadence from actual run data
  - Pace gradient map showing GPS track with color-coded pace (green=fast, red=slow)
  - Km splits section showing pace per kilometer with visual indicators
  - Conditional heart rate display (greyed out with message when no HR data available)
  - Elevation profile chart with real elevation gain data
  - Social sharing with branded images for Facebook/Instagram
- **Auth**: Login and pre-registration flows

### Social Media Sharing
Users can share run summaries to Facebook and Instagram with branded images:
- **Image Generator**: `client/src/lib/shareImageGenerator.ts` creates branded images using HTML Canvas
- **Supported Formats**: Post (1:1 square 1080x1080) and Story (9:16 vertical 1080x1920)
- **Image Content**: Route map visualization, distance, time, pace, difficulty badge, and AI Run Coach branding with logo
- **Sharing Options**: Facebook, Instagram, native device share (Web Share API), and direct download
- **Fallback**: Downloads image when Web Share API is unavailable (e.g., desktop browsers)

## External Dependencies

### Third-Party Services
- **OpenAI API**: Powers AI coaching advice, route waypoint design, and run performance analysis (requires `OPENAI_API_KEY`)
- **Google Maps API**: Provides Places API (parks/POIs), Directions API (walking routes), and Elevation API (terrain data) for route generation (requires `GOOGLE_MAPS_API_KEY`)
- **OpenStreetMap**: Tile provider for Leaflet maps (no API key required)

### Database
- **PostgreSQL**: Primary database (requires `DATABASE_URL` environment variable)
- **connect-pg-simple**: Session storage in PostgreSQL (configured but not fully implemented)

### Key NPM Packages
- **drizzle-orm / drizzle-kit**: Database ORM and migration tooling
- **openai**: Official OpenAI SDK for AI features
- **bcryptjs**: Password hashing
- **zod / drizzle-zod**: Schema validation and type generation
- **leaflet**: Interactive maps
- **recharts**: Data visualization
- **framer-motion**: Animations
- **sonner**: Toast notifications

### Development Tools
- **Vite**: Development server and build tool
- **tsx**: TypeScript execution for server
- **esbuild**: Server bundling for production
- **Replit plugins**: Dev banner, cartographer, runtime error overlay