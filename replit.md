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

Key files:
- `server/aiRoutePlanner.ts`: Core AI route planning logic
- `server/routePlanner.ts`: Fallback geometric route generation
- Endpoint: `POST /api/routes/generate-options` (generates 9 routes: 3 easy, 3 moderate, 3 hard)

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
- **Run Insights**: Detailed post-run analysis with charts and AI feedback
- **Auth**: Login and pre-registration flows

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