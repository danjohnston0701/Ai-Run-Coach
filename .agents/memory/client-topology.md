---
name: Client topology
description: How to tell which of the three clients a bug/log belongs to
---
This repo contains three clients sharing one backend:
- Express backend (server/) + React web frontend (client/src/) — deployed to https://airuncoach.live
- Android app (app/src/main/java/live/airuncoach/airuncoach/) — Kotlin/Compose, the primary thing users test

**How to tell where a production log came from:** grep the endpoint path in BOTH `client/src` and `app/src`. Endpoints like `race-predictions`, `personal-bests`, `analysis` exist ONLY in the Android `ApiService.kt`, not the web — so those logs are the Android app, not the website.

**Why this matters:** A "Share Run Video" 401 bug was chased in the React web frontend for 4 rounds before realizing the user was on Android. Some Android screens (RunVideoScreen.kt) are WebViews that load React pages (/run-video/:runId) but do NOT share the web's localStorage/auth — the native side must inject the token.
