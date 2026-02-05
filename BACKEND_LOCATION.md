# Backend Server Location

**IMPORTANT: Read this before making any backend-related changes!**

---

## 📍 Backend Server Location

The **Node.js/Express backend server** for this Android app is located at:

```
/Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
```

This is a **SEPARATE PROJECT** from the Android Studio project.

---

## 🚀 Starting the Backend Server

### Development Mode (Port 3000)
```bash
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
npm run server:dev
```

### Production Mode
```bash
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
npm run server:prod
```

---

## 🔗 API Configuration

The Android app connects to the backend via:

**File:** `app/src/main/java/live/airuncoach/airuncoach/network/RetrofitClient.kt`

**Debug builds (local development):**
- **Emulator:** `http://10.0.2.2:3000` (maps to Mac's localhost:3000)
- **Physical Device:** `http://<YOUR_MAC_IP>:3000` (e.g., `http://192.168.1.100:3000`)

**Release builds (production):**
- `https://airuncoach.live`

**Toggle:** Set `useLocalBackend = true` in `RetrofitClient.kt` to use local server.

---

## 📂 Backend Project Structure

```
Ai-Run-Coach-IOS-and-Android/
├── server/               # Backend TypeScript source code
│   └── index.ts         # Main server entry point
├── server_dist/         # Compiled JavaScript (production)
├── client/              # Expo React Native app (iOS/Android)
├── migrations/          # Database migrations
├── package.json         # Node.js dependencies
├── .env                 # Environment variables (DATABASE_URL, etc.)
└── tsconfig.json        # TypeScript config
```

---

## 🗄️ Database

**Type:** PostgreSQL (Neon.com)  
**Connection:** Configured in `.env` file  
**Schema:** See `DATABASE_SCHEMA.sql` in the Android project root

---

## 🛠️ Common Server Commands

```bash
# Install dependencies
npm install

# Start dev server with hot reload
npm run server:dev

# Build server for production
npm run server:build

# Run production server
npm run server:prod

# Database migrations
npm run db:push
```

---

## ⚠️ Troubleshooting

### Server not running?
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill process on port 3000 if needed
kill -9 $(lsof -t -i:3000)

# Restart server
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
npm run server:dev
```

### Android app can't connect?
1. ✅ Verify server is running on port 3000
2. ✅ Check `useLocalBackend = true` in `RetrofitClient.kt`
3. ✅ Emulator should use `http://10.0.2.2:3000`
4. ✅ Physical device needs your Mac's local IP address

---

## 📋 Backend API Endpoints

See `ApiService.kt` for all available endpoints:
- `/api/auth/login` - User authentication
- `/api/auth/register` - User registration
- `/api/users/{id}` - User profile
- `/api/goals` - Goals management
- `/api/runs` - Run tracking
- `/api/coaching/*` - AI coaching features
- `/api/routes/generate-ai-routes` - Route generation
- And many more...

---

## 🔐 Environment Variables

The backend requires a `.env` file with:
```
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
GOOGLE_MAPS_API_KEY=...
JWT_SECRET=...
NODE_ENV=development
PORT=3000
```

---

## 📝 For Future AI Assistants

When the user mentions:
- "The server isn't running"
- "Backend errors"
- "Can't connect to API"
- "Database issues"

**The backend is located at:**
```
/Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
```

**Not in this Android Studio project directory!**

---

**Last Updated:** January 29, 2026
