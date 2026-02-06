# AI Run Coach

## Overview
AI Run Coach is a mobile-first web application designed to empower runners with personalized AI-powered coaching, intelligent route planning, and comprehensive performance tracking. The platform's core purpose is to enhance the running experience by offering dynamic route generation based on difficulty and terrain, real-time voice coaching during runs, and in-depth post-run analysis. The project aims to provide a competitive edge in the fitness technology market by leveraging advanced AI for a highly personalized and adaptive coaching experience, ultimately helping users achieve their fitness goals and improve their running performance.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Principles
The application follows a monorepo structure with `/client` for the frontend, `/server` for the backend, and `/shared` for common types and utilities. Path aliases (`@/`, `@shared/`, `@assets/`) are used for organized imports. A centralized API client handles requests and error management. Components are designed with a focus on composition and accessibility.

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **Styling**: Tailwind CSS v4 with custom dark mode theme, complemented by shadcn/ui (New York style) and Radix UI primitives.
- **State Management**: TanStack React Query for server state, localStorage for client-side persistence.
- **Visuals**: Framer Motion for animations, Leaflet for maps, Recharts for data visualization.
- **Build**: Vite.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ESM modules).
- **API**: RESTful endpoints under `/api`.
- **Authentication**: bcryptjs for password hashing; session-based auth is planned.
- **Database ORM**: Drizzle ORM with PostgreSQL dialect.
- **AI Integration**: OpenAI API for coaching and route generation.

### AI-Powered Systems
- **AI-Powered Route Planning**: Generates routes using a hybrid AI approach. It collects area data (Google Places, Google Elevation), designs optimal waypoints with OpenAI based on user preferences (distance, difficulty, terrain), and then uses Google Directions API to create the final route. Elevation profiles are analyzed and stored.
- **Hill-Awareness Coaching**: Provides real-time, terrain-aware coaching by tracking elevation profiles and proactively triggering advice for significant hills (5%+ grade) using OpenAI.
- **Weather-Aware Coaching**: Integrates with Google Maps Platform Weather API to fetch current and forecasted weather conditions. This data informs AI coaching advice, providing relevant guidance based on temperature, humidity, wind, UV, and precipitation.
- **AI Coach Toggle**: Users can enable/disable the AI Coach. When disabled, no data is sent to OpenAI, and navigation audio defaults to the device's built-in text-to-speech.
- **Phase-Based Coaching**: Coaching statements are organized by run phase (early/mid/late/final/generic) in `shared/coachingStatements.ts`. Each statement is only used in its appropriate phase (e.g., "if you're starting to tire" only in late phase, "warm up" only in early phase). Same statement can't be used more than 3 times per run. Phases are determined by both absolute distance (2km, 3-5km, 7km+) and percentage of total distance (10%, 40-50%, 75-90%, last 10%).

### Data Management
- **Primary Storage**: PostgreSQL database for user accounts, coach settings, completed runs, routes, and favorites.
- **Local Storage**: Used for temporary session data (active run, GPS cache, UI preferences) and as an offline fallback for runs and settings.
- **Hybrid Storage Pattern**: Implements a `dbSynced` flag and automatic migration of unsynced local data to the database upon login or app load.
- **Session Persistence**: Active run sessions are auto-saved every 5 seconds to local storage with a 12-hour expiration, allowing users to resume interrupted runs.

### User Interface & Features
- **Pages**: Landing Page, Profile Setup (onboarding), Home (run configuration), Run Session (live tracking), Run History, Run Insights (detailed post-run analysis), Events (browse public events by country), Authentication (Login, Pre-registration).
- **Run Insights**: Displays real-time data, pace gradient maps, km splits, conditional heart rate, and elevation profiles. Features Garmin-style expandable performance charts (pace, heart rate, elevation, cadence) with time/distance toggle and brand color styling.
- **AI Run Analysis**: Post-run feature that generates comprehensive AI coaching insights including highlights, struggles, personal bests, demographic comparison, and actionable tips. Analysis is cached in the database for instant retrieval on return visits.
- **Social Sharing**: Generates branded images for Facebook/Instagram sharing with run summaries (map, distance, time, pace, difficulty, branding) using HTML Canvas.
- **Events System**: Public events organized by country (parkruns, marathons, 5Ks, etc.) that users can browse and run. Admins can create events from completed runs. Event runs are tracked with eventId to link user runs to specific events.

## External Dependencies

### Third-Party Services
- **OpenAI API**: For AI coaching, route waypoint design, and performance analysis.
- **Google Maps Platform**: Includes Places API, Directions API, and Elevation API for route generation and weather.
- **OpenStreetMap**: Map tile provider for Leaflet.
### Database
- **PostgreSQL**: Primary data store.

### Key NPM Packages
- **drizzle-orm / drizzle-kit**: ORM and migration.
- **openai**: OpenAI SDK.
- **bcryptjs**: Password hashing.
- **zod / drizzle-zod**: Schema validation.
- **leaflet**: Maps.
- **recharts**: Charts.
- **framer-motion**: Animations.
- **sonner**: Notifications.