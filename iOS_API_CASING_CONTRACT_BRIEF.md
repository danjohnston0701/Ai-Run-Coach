# API Field-Casing Contract

Every route in `server/routes.ts` (18,188 lines, 278 `app.*` registrations) plus the `routes-*.ts` sub-routers (`routes-achievements.ts`, `routes-adaptation.ts`, `routes-my-data.ts`, `routes-samsung-companion.ts`, `routes-session-coaching.ts`), with exact request/response field names as written in code.

Compiled after the iOS `currentPace` vs `current_pace` bug caused `/api/coaching/pace-update` and `/api/coaching/cadence-coaching` to 500 silently for an entire run (root cause: iOS sent `current_pace`, the backend read `req.body.currentPace` with no snake_case fallback and no validation — see the two crash sites already fixed in `server/ai-service.ts`).

**Casing key:** `camelCase` = consistent · `mixed` = casing inconsistency within the route · `snake_case` = third-party/fixed format, not app-controlled · `n/a` = no JSON body (binary/HTML)

## Recommendation

**Standardize on camelCase everywhere.** It already matches Android's DTOs, the `shared/schema.ts` Zod types, and ~93% of existing routes. This is a boundary-only convention — Drizzle/Postgres columns stay snake_case; only the HTTP request/response layer is affected.

Add lightweight per-route validation (even a plain `if (!field) return 400`, or a Zod schema) so a wrong-cased or missing field **fails loudly in dev** instead of silently falling back — that loud failure is exactly what surfaced the original bug.

Fix the `mixed` routes below first, prioritized by risk: the real-time coaching family (crashes are live and silent to the user), then `/api/live-sessions/:sessionId` and `/api/observe/:code` (stray `observer_count`), then `/api/googlePlayPricing`.

---

## ⚠ High risk — the real-time coaching family

This is the exact class of bug that caused the iOS silent-coaching failure. Every route below forwards the **raw `req.body`** straight into an AI-service function with no schema validation. Only `userId` has an explicit snake_case fallback (`req.body.userId ?? req.body.user_id`) — every other field (`currentPace`, `targetPace`, `splitPace`, `currentHR`, etc.) has none. If a client sends the wrong case for any of these, the field arrives as `undefined`, and several of these functions call `.split(':')` on it directly — a 500, and silence for the runner mid-session.

| Route | Confirmed / at-risk field | Status |
|---|---|---|
| `POST /api/coaching/pace-update` | `currentPace` | Confirmed crash (this incident) |
| `POST /api/coaching/cadence-coaching` | `currentPace` | Confirmed crash (this incident) |
| `POST /api/coaching/struggle-coaching` | `currentPace`, `targetPace` | Same unguarded pattern — not yet observed to crash |
| `POST /api/coaching/elevation-coaching` | `currentGrade`, `currentPace` | Same unguarded pattern — not yet observed to crash |
| `POST /api/coaching/elite-coaching` | `currentPace`, `targetPace` | Same unguarded pattern — not yet observed to crash |
| `POST /api/coaching/phase-coaching` | `currentPace`, `targetPace` | Same unguarded pattern — not yet observed to crash |
| `POST /api/coaching/interval-coaching` | `currentPace`, `targetPace` | Same unguarded pattern — not yet observed to crash |
| `POST /api/coaching/hr-coaching` | `currentHR`, `avgHR`, `maxHR` | Different field family, same no-validation risk |
| `POST /api/coaching/session-trigger-live` | whole payload forwarded raw | Same no-validation risk |

**A working precedent already exists:** `POST /api/runs` and `PUT /api/runs/:id/struggle-points` already accept both naming styles (e.g. `distance_meters`/`distance`, `start_time`/`startTime`, `external_id`/`externalId`). Whoever fixes the coaching family can copy that pattern rather than invent a new one.

**Two smaller stray-casing bugs found along the way:**
- `GET /api/live-sessions/:sessionId` and `GET /api/observe/:code` leak a raw `observer_count` into otherwise all-camelCase responses.
- `GET /api/googlePlayPricing` mixes `updated_at`/`default_usd` in with camelCase siblings.

**Unrelated finding, worth a look:** the `/api/group-runs/*` family and a few `/api/friends/*` routes appear to be **registered twice** in `routes.ts` under different param names (`:id` vs `:groupRunId`). Express only reaches the first match, so the second registration of each is dead code — confirm with `grep -n "group-runs"` / `grep -n "friends/:userId"` before touching either version.

---

## Auth
Registration, login, password reset.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `POST /api/auth/register` | email, password, name, timezone, country | requiresVerification, user, email, message | camelCase |
| `POST /api/auth/verify-email` | email, otp | user, token | camelCase |
| `POST /api/auth/resend-verification` | email | ok, message | camelCase |
| `POST /api/auth/update-verification-email` | currentEmail, newEmail | ok, email | camelCase |
| `POST /api/auth/login` | email, password, timezone, country | user, token (or requiresVerification, email, error) | camelCase |
| `POST /api/auth/forgot-password` | email | ok | camelCase |
| `GET /api/auth/verify-reset-token` | query: token | ok | camelCase |
| `POST /api/auth/reset-password` | token, password | ok | camelCase |
| `POST /api/auth/change-password` | currentPassword, newPassword, confirmPassword | ok | camelCase |
| `GET /api/auth/garmin` | query: app_redirect, history_days | authUrl, state | mixed |
| `GET /api/auth/garmin/callback` | query: code, state, error | HTML redirect (no JSON) | n/a |

## Users & Profile
Account, coach settings, search, injuries.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/users/me` | — | user fields + injuries | camelCase |
| `GET /api/users/:id` | — | user fields | camelCase |
| `GET /api/users/search` | query: q, query | array: id, name, profilePic, userCode, shortUserId, friendRequestStatus, friendRequestId | camelCase |
| `POST /api/users/me/fcm-token` | fcmToken | success | camelCase |
| `POST /api/notifications/register-device` | deviceToken, platform, fcmToken | success, platform | camelCase |
| `PUT /api/users/:id` | arbitrary spread (dob special-cased) | user fields (password excluded) | camelCase |
| `DELETE /api/users/:id` | — | 204 No Content | camelCase |
| `POST /api/users/:id/profile-picture` | imageData | user fields | camelCase |
| `PUT /api/users/:id/coach-settings` | coachName, coachGender, coachAccent, coachTone, coachPaceEnabled, coachNavigationEnabled, coachElevationEnabled, coachHeartRateEnabled, coachCadenceStrideEnabled, coachKmSplitsEnabled, coachStruggleEnabled, coachMotivationalEnabled, coachHalfKmCheckInEnabled, coachKmSplitIntervalKm | full user object | camelCase |
| `GET /api/invite/:userId` | — | id, name, profilePic, inviteUrl | camelCase |
| `GET /api/user/injuries` | — | active, chronic, healed, all | camelCase |
| `POST /api/user/injuries` | bodyPart, injurySide, status, severity, notes, injuryDate, estimatedRecoveryWeeks, isProstheticOrAFO, prostheticType | same + recoveryDate, createdAt, updatedAt, id | camelCase |
| `PUT /api/user/injuries/:injuryId` | arbitrary spread | updated injury object | camelCase |
| `DELETE /api/user/injuries/:injuryId` | — | message | camelCase |

## Friends & Requests
Search, add, accept/decline.

> ⚠ `GET /api/friends/:userId`, `POST /api/friends/:userId/add`, and `DELETE /api/friends/:userId/:friendId` are each registered **twice** in routes.ts with slightly different response shapes — the second registration of each is dead code (see note above).

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/users/:userId/friends` | — | array: id, name, profilePic, userCode, shortUserId | camelCase |
| `GET /api/friend-requests/:userId` | — | v, sent[], received[] (each: id, requesterId, addresseeId, status, message, createdAt, addresseeName, addresseeProfilePic, requesterName, requesterProfilePic) | camelCase |
| `GET /api/friends/:userId` | query: status | array: id, name, email, profilePic, userCode (+ fitnessLevel, distanceScale in duplicate) | camelCase |
| `POST /api/friends/:userId/add` | message (or friendId in duplicate) | friend request object (or id, name, email, profilePicUrl, subscriptionTier, friendshipStatus, friendsSince in duplicate) | camelCase |
| `DELETE /api/friends/:userId/:friendId` | — | success (or 204 in duplicate) | camelCase |
| `GET /api/friends` | query: userId | array: id, name, email, profilePic, userCode | camelCase |
| `POST /api/friend-requests` | addresseeId, message | friend request object | camelCase |
| `GET /api/friend-requests/:userId/debug` | — | total, requests | camelCase |
| `POST /api/friend-requests/:id/withdraw` | — | success | camelCase |
| `POST /api/friend-requests/:id/accept` | — | success | camelCase |
| `POST /api/friend-requests/:id/decline` | — | success | camelCase |

## Runs
Core CRUD, analysis, race predictions.

> `POST /api/runs` and `PUT /api/runs/:id/struggle-points` already accept both naming conventions — a working precedent for the coaching family (see above).

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/runs/user/:userId` | query: limit, offset | array of run objects: startTime, endTime, duration, distance, averageSpeed, maxSpeed, averagePace, calories, cadence, heartRate, routePoints, kmSplits, heartRateData, paceData, strugglePoints, aiCoachingNotes, userComments, name, difficulty, phase, weatherAtStart/End, elevation fields, terrainType, sessionType, targetDistance/Time, workoutType, plus Garmin dynamics fields | camelCase |
| `GET /api/users/:userId/runs` | query: limit, offset | same shape as above | camelCase |
| `GET /api/users/:userId/run-history-stats` | query: targetDistanceKm | runsAnalysed, avgPaceSecondsPerKm, avgPaceFormatted, bestPaceFormatted, avgDistanceKm, avgCadence, avgHeartRate, consistencyTrend, lastRunPaceFormatted, lastRunDate, totalRunsAllTime | camelCase |
| `GET /api/users/:userId/weather-impact` | — | weatherImpact fields + dateRangeUsed, runsAnalyzed | camelCase |
| `GET /api/runs/:id/race-predictions` | — | sourceRunId, sourceDistanceKm, sourceDurationSeconds, sourcePace, predictions[], disclaimer | camelCase |
| `GET /api/runs/:id` | — | full run object (same shape as list) | camelCase |
| `GET /api/runs/:id/download-fit` | — | binary file | n/a |
| `POST /api/runs` | **dual-key:** distance/distance_meters, startTime/start_time/started_at, externalId/external_id, externalSource/external_source, plus ~60 camelCase-only fields (duration, tss, cadence, kmSplits, gpsTrack, heartRateData, workoutType, timeInZone1-5, groundContactTimeData, ...) | full run object | mixed |
| `POST /api/runs/recognize-route` | latitude, longitude, timestamp, intendedDistanceKm | matched, confidence, confidenceLabel, knownRoute, routeIntelligence, confidenceBreakdown | camelCase |
| `GET /api/runs/known-routes` | — | array of route objects | camelCase |
| `PATCH /api/runs/:id/rename` | name | run object | camelCase |
| `PATCH /api/runs/:id/coaching-notes` | aiCoachingNotes | run object | camelCase |
| `PUT /api/runs/:id/struggle-points` | **dual-key:** userComments/user_comments, strugglePoints/struggle_points | run object | mixed |
| `POST /api/runs/sync-progress` | runId + arbitrary spread | run object | camelCase |
| `GET /api/runs/:id/analysis` | — | analysis object or null | camelCase |
| `POST /api/runs/:id/analysis` | arbitrary spread | analysis object | camelCase |
| `POST /api/runs/:id/comprehensive-analysis` | garminDataSummary, userProfile | success, analysis, hasGarminData, hasWellnessData, cached | camelCase |
| `POST /api/runs/:id/freeform-analysis` | question | success, analysis | camelCase |
| `DELETE /api/runs/:id` | — | success, message | camelCase |
| `POST /api/runs/:id/share-link` | — | shareToken, shareUrl, deepLink | camelCase |
| `POST /api/runs/:runId/publish-strava` | (disabled) | error, message, status | camelCase |
| `POST /api/runs/:runId/enrich-with-garmin-data` | — | success, message, run, garminActivity | camelCase |
| `POST /api/runs/:id/ai-insights` | arbitrary spread | opaque (delegates to generateRunSummary) | camelCase |
| `GET /api/runs/:id/device-data` | — | array (raw) | n/a |

## Planned Routes
Route generation, navigation, ratings.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/routes/user/:userId` | — | array of route objects | camelCase |
| `GET /api/routes/:id` | — | route object | camelCase |
| `POST /api/routes` | arbitrary spread | route object | camelCase |
| `POST /api/routes/generate-options` | startLat, startLng, distance, difficulty, activityType, terrainPreference, avoidHills, sampleSize, returnTopN | routes[]: id, name, distance, estimatedTime, elevationGain/Loss, maxGradientPercent/Degrees, difficulty, polyline, waypoints, turnInstructions, circuitQuality | camelCase |
| `POST /api/routes/generate-intelligent` | latitude, longitude, distanceKm, startLat, startLng, distance, targetDistance, preferTrails, avoidHills | success, routes[] | camelCase |
| `POST /api/routes/generate-ai` | startLat, startLng, distance, activityType | routes[] | camelCase |
| `POST /api/routes/generate-template` | startLat, startLng, distance, activityType | routes[] | camelCase |
| `GET /api/routes/:id/ratings` | — | array of ratings | camelCase |
| `POST /api/routes/:id/ratings` | arbitrary spread | rating object | camelCase |

## Goals

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/goals/:userId` | — | array: id, userId, type, title, description, notes, targetDate, eventName, eventLocation, distanceTarget, timeTargetSeconds, healthTarget, weeklyRunTarget, targetWeightKg, startingWeightKg, injury*, currentProgress, isActive, isCompleted, relatedRunSessionIds | camelCase |
| `POST /api/goals` | type, title, description, notes, targetDate, eventName, eventLocation, distanceTarget, timeTargetSeconds, healthTarget, weeklyRunTarget, targetWeightKg, startingWeightKg, injuryBodyPart, injuryDate, injurySeverity, injuryNotes, injurySide | goal object (same fields + id, userId, currentProgress, isActive, isCompleted) | camelCase |
| `PUT /api/goals/:id` | same fields + isCompleted, completedAt, isActive, currentProgress, relatedRunSessionIds | goal object | camelCase |
| `DELETE /api/goals/:id` | — | 204 No Content | camelCase |

## Notifications
Feed, read state, preferences.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/events/grouped` | — | object grouped by country | camelCase |
| `GET /api/notifications` | query: userId | array of notifications | camelCase |
| `PUT /api/notifications/:id/read` | — | success | camelCase |
| `PUT /api/notifications/mark-all-read` | — | success | camelCase |
| `DELETE /api/notifications/:id` | — | success | camelCase |
| `GET /api/notification-preferences/:userId` | — | preferences object or {} | camelCase |
| `PUT /api/notification-preferences/:userId` | arbitrary spread | preferences object | camelCase |

## Live Sessions (Solo Sharing)
Spectator links for a single active run.

> ⚠ Two responses leak a raw snake_case field, `observer_count`, into an otherwise all-camelCase payload — a small, easy fix.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `POST /api/live-sessions` | runnerName | id, success, inviteCode | camelCase |
| `GET /api/live-sessions/:sessionId` | — | session fields + routePolyline, **observer_count** | mixed |
| `GET /api/users/:userId/live-session` | — | session object or null | camelCase |
| `PUT /api/live-sessions/sync` | sessionId, currentLat, currentLng, gpsPoint, ... | session fields + routePolyline | camelCase |
| `POST /api/live-sessions/end-by-key` | sessionKey | success | camelCase |
| `POST /api/live-sessions/:sessionId/invite-observer` | friendId, email | success, type, pushSent, emailSent, invitationToken, inviteCode | camelCase |
| `POST /api/observer-invitations/validate` | token | success, sessionId, runnerId, runnerName, hasStarted, status | camelCase |
| `POST /api/live-sessions/:sessionId/invite-participant` | participantId | success, pushSent | camelCase |
| `GET /api/observe/:code` | — | sessionData (nested **observer_count**), isExpired, inviteCode | mixed |
| `POST /api/live-session/cue` | sessionId, cue | success, queued | camelCase |
| `GET /api/live-session/cue` | query: sessionId | cue, delivered | camelCase |
| `GET /api/live-session/metrics` | query: sessionId | active, sessionId, session, metrics, pendingCue | camelCase |

## Group Runs
Scheduled multi-runner meetups.

> ⚠ The whole `/api/group-runs/*` family appears to be registered **twice** in routes.ts under two different param names (`:groupRunId` and `:id`) for the same path shapes — see note above.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/group-runs` | — | groupRuns, count, total | camelCase |
| `GET /api/group-runs/:id` | — | id, name, title, description, creatorId, hostUserId, creatorName, meetingPoint, meetingLat, meetingLng, distance, dateTime, plannedStartAt, maxParticipants, currentParticipants, isPublic, status, inviteToken, createdAt, isJoined, isOrganiser, myInvitationStatus, participants | camelCase |
| `POST /api/group-runs` | name, description, meetingPoint, meetingLat, meetingLng, distance, dateTime, maxParticipants, isPublic | (same shape as GET :id) | camelCase |
| `PUT /api/group-runs/:id` | same as POST | (same shape as GET :id) | camelCase |
| `POST /api/group-runs/:id/join` | — | message, groupRunId, userId | camelCase |
| `POST /api/group-runs/:id/invite` | userIds | invited, groupRunId | camelCase |
| `POST /api/group-runs/:id/respond` | response | (same shape as GET :id) | camelCase |
| `POST /api/group-runs/:id/ready` | — | (same shape as GET :id) | camelCase |
| `POST /api/group-runs/:id/start` | — | (same shape as GET :id) | camelCase |
| `POST /api/group-runs/:id/complete` | runId | (same shape as GET :id) | camelCase |
| `GET /api/group-runs/:id/results` | — | groupRunId, groupRunName, results[]: userId, userName, profilePic, runId, completedAt, isCurrentUser, stats{distance, duration, avgPace, avgHeartRate, calories} | camelCase |
| `GET /api/group-runs/by-run/:runId` | — | groupRunId, groupRunName | camelCase |
| `DELETE /api/group-runs/:id` | — | 204 No Content | camelCase |
| `DELETE /api/group-runs/:id/leave` | — | 204 No Content | camelCase |
| `POST /api/group-runs/:id/debrief` | — | debrief, rank, totalFinishers | camelCase |

## AI — Legacy Endpoints
`/api/ai/*` — older, simpler coaching calls.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `POST /api/ai/coach` | message, context | message | camelCase |
| `POST /api/ai/tts` | text, voice, coachAccent, coachGender | binary audio/mpeg | n/a |
| `POST /api/ai/coaching` | message, context | message | camelCase |
| `POST /api/ai/run-summary` | lat, lng, distance, elevationGain, elevationLoss, difficulty, activityType, targetTime, firstTurnInstruction | weatherSummary, terrainAnalysis, coachAdvice, targetPace, firstTurnInstruction, warnings, temperature, conditions, humidity, windSpeed, feelsLike | camelCase |
| `POST /api/ai/pre-run-summary` | route, weather | opaque (generatePreRunSummary) | camelCase |
| `POST /api/ai/elevation-coaching` | distance, targetDistance, elapsedTime, targetTime | message, isCompletion | camelCase |
| `POST /api/ai/pace-update` | distance, targetDistance, elapsedTime, targetTime | message, isCompletion | camelCase |
| `POST /api/ai/phase-coaching` | distance, targetDistance, elapsedTime, targetTime | message, isCompletion | camelCase |
| `POST /api/ai/struggle-coaching` | distance, targetDistance, elapsedTime, targetTime | message, isCompletion | camelCase |

## Coaching — Real-Time (High Risk)
`/api/coaching/*` — called mid-run; see the High Risk section above.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `POST /api/coaching/pre-run-briefing` | distance, elevationGain, elevationLoss, maxGradientDegrees, difficulty, hasRoute, activityType, targetTime, targetPace, weather, trainingPlanId, planGoalType, planWeekNumber, planTotalWeeks, workoutType, workoutIntensity, workoutDescription, runnerName | audio, format, voice, text, wellness, garminConnected | camelCase |
| `POST /api/tts/generate` | text, voice | audio, format, voice | camelCase |
| `POST /api/coaching/start-run-audio` | motivationalText | audio, format, text | camelCase |
| `POST /api/coaching/start-walk-audio` | motivationalText | audio, format, text | camelCase |
| `POST /api/coaching/batch-tts` | texts, accent, gender | audios[]: text, audio, format | camelCase |
| `POST /api/coaching/pre-run-briefing-audio` | distance, elevationGain, elevationLoss, maxGradientDegrees, difficulty, hasRoute, activityType, weather, targetPace, targetTime, wellness, turnInstructions, startLocation, trainingPlanId, workoutType, runnerName | briefing, intensityAdvice, warnings, readinessInsight, weatherAdvantage, audio, format, voice, text | camelCase |
| `POST /api/coaching/pre-walk-briefing-audio` | (same as pre-run-briefing-audio) | (same shape) | camelCase |
| **`POST /api/coaching/pace-update`** | userId/user_id (dual-key), currentGrade, distance, targetDistance, phase, coachGender, coachAccent, coachTone, coachName, **currentPace (no fallback)** + raw req.body forwarded | message, nextPace, audio, format | mixed |
| `POST /api/coaching/session-trigger-live` | userId/user_id (dual-key), coachGender, coachAccent, coachTone, coachName + raw spread | message, audio, format | mixed |
| `POST /api/coaching/struggle-coaching` | userId/user_id (dual-key), coachGender, coachAccent, coachTone, coachName, distance, targetDistance, phase | message, audio, format | mixed |
| **`POST /api/coaching/cadence-coaching`** | userId/user_id (dual-key), coachGender, coachAccent, coachTone, coachName + raw spread (**currentPace** no fallback) | message, audio, format | mixed |
| `POST /api/coaching/elevation-coaching` | userId/user_id (dual-key), coachGender, coachAccent, coachTone, coachName | message, audio, format | mixed |
| `POST /api/coaching/elite-coaching` | userId/user_id (dual-key), coachGender, coachAccent, coachTone, coachName | message, audio, format | mixed |
| `POST /api/coaching/phase-coaching` | userId/user_id (dual-key), coachGender, coachAccent, coachTone, coachName, distance, targetDistance, phase | message, nextPhase, audio, format | mixed |
| `POST /api/coaching/interval-coaching` | userId/user_id (dual-key), coachGender, coachAccent, coachTone, coachName | message, audio, format | mixed |
| `POST /api/coaching/talk-to-coach` | message, context{wellness, targetPace, distance, totalDistance, phase, coachTone, coachName, coachAccent}, coachAccent | message, audio, format | camelCase |
| `POST /api/coaching/hr-coaching` | userId/user_id (dual-key), currentHR, avgHR, maxHR, targetZone, elapsedMinutes, activityType, distance, targetDistance, phase, runnerAge, fitnessLevel, runnerName | message, audio, format | mixed |
| `POST /api/coaching/run-analysis` | runId, userPostRunComments, relevantStrugglePoints, coachName, coachTone, weather, averagePace, elevationGain, elevationLoss, terrainType, kmSplits, userProfile, coachAccent, distance, duration | executiveSummary, strengths, areasForImprovement, overallPerformanceScore, paceConsistencyScore, effortScore, mentalToughnessScore, + more (all camelCase) | camelCase |
| `POST /api/coaching/session-events` | runId, plannedWorkoutId, eventType, eventPhase, coachingMessage, coachingAudioUrl, userMetrics, toneUsed, userEngagement | success, message | camelCase |
| `GET /api/coaching/session-events/:runId` | — | runId, events, count | camelCase |

## Session Coaching (Plan-Based)
Pre-generated per-workout coaching plans (`routes-session-coaching.ts`).

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/workouts/:workoutId/session-instructions` | — | workoutId, preRunBrief, sessionStructure, coachingStyle, insightFilters, aiDeterminedTone, aiDeterminedIntensity, toneReasoning, generatedOnDemand? | camelCase |
| `POST /api/workouts/:workoutId/regenerate-session-instructions` | — | success, message, coachingStyle, tone, reasoning | camelCase |
| `POST /api/coaching/session-events` | runId, plannedWorkoutId, eventType, eventPhase, coachingMessage, coachingAudioUrl, userMetrics, toneUsed, userEngagement | success, message | camelCase |
| `GET /api/coaching/session-events/:runId` | — | runId, events, count | camelCase |
| `POST /api/workouts/:workoutId/prepare-coaching` | hasWatchConnected, sessionType | workoutId, plan, cueingStrategy, coachingTone, preRunBrief, whyThisSession, phasesCount, triggersCount | camelCase |
| `GET /api/workouts/:workoutId/coaching-plan` | — | workoutId, plan | camelCase |

## Weather & Geocoding
Some routes proxy third-party APIs verbatim.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/weather/current` | query: lat, lng | temp, feelsLike, humidity, windSpeed, windDirection, condition, weatherCode | camelCase |
| `GET /api/weather/full` | query: lat, lng | raw Open-Meteo passthrough (e.g. temperature_2m) — third-party format, not app-controlled | snake_case |
| `GET /api/weather` | query: lat, lng | temp, feelsLike, humidity, windSpeed, windDirection, condition, weatherCode | camelCase |
| `GET /api/geocode/reverse` | query: lat, lng | raw proxy passthrough | n/a |

## Subscriptions & Billing

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `POST /api/subscriptions/verify-purchase` | purchaseToken, productId, packageName | success, tier, billingPeriod, subscriptionStatus, expiresAt, user | camelCase |
| `GET /api/subscriptions/status` | — | tier, status, entitlementType, expiresAt, trialExpiresAt, trialExpired | camelCase |
| `POST /api/apple/server-notifications` | signedPayload | success | camelCase |
| `GET /api/usage/current` | — | opaque (getUsageWithLimits) | camelCase |
| `GET /api/features/:featureName/available` | — | isAvailable, remaining, limit, used, renewalDate, isUnlimited, message, grantedBy | camelCase |
| `POST /api/promo-codes/redeem` | code | opaque (redeemPromoCode) | camelCase |
| `GET /api/promo-codes/active-grants` | — | grants | camelCase |
| `GET /api/app/version-check` | — | android{...}, garmin{...}, ios{...} (each: latestVersion, minVersion, storeUrl, releaseNote) | camelCase |

## Connected Devices
Generic third-party wearable sync (non-Garmin).

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/connected-devices` | — | array (raw) | n/a |
| `POST /api/connected-devices` | deviceType, deviceName, deviceId | device object | camelCase |
| `DELETE /api/connected-devices/:deviceId` | — | success | camelCase |
| `POST /api/device-data/sync` | runId, deviceType, heartRateZones, vo2Max, trainingEffect, recoveryTime, stressLevel, bodyBattery, caloriesBurned, rawData | deviceData object | camelCase |

## Garmin Integration
OAuth, sync, wellness — the webhook rows are Garmin's own fixed schema, not under app control.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `POST /api/garmin/sync` | — | success, activitiesFound, activities | camelCase |
| `GET /api/garmin/status` | — | connected, hasAccessToken, lastSyncAt, deviceInfo | camelCase |
| `GET /api/garmin/health-summary` | — | dailySummary, heartRateData, stressData, lastSyncAt | camelCase |
| `POST /api/garmin/import-activity` | activityId | success, run, activity | camelCase |
| `POST /api/runs/:runId/enrich-with-garmin-data` | — | success, message, run, garminActivity | camelCase |
| `POST /api/garmin/wellness/sync` | date | success, wellness | camelCase |
| `GET /api/garmin/wellness` | query: date, days | metrics, latest, currentReadiness | camelCase |
| `GET /api/garmin/readiness` | — | garminConnected, today, weeklyContext | camelCase |
| `GET /api/garmin/permissions` | — | opaque (getCurrentPermissions) | unknown |
| `POST /api/garmin/reauthorize` | — | authUrl | camelCase |
| `POST /api/garmin/disconnect` | — | success, message | camelCase |
| `POST /api/garmin/ping` | — | status, timestamp, service | camelCase |
| `GET /api/garmin/user-permissions/:garminUserId` | — | userId, permissions, status, connectedAt, lastSync | camelCase |
| `POST /api/garmin/upload-run` | runId | success, message, garminActivityId, alreadyUploaded | camelCase |
| `POST /api/garmin/webhook(s)/activities` | Garmin fixed schema: activityId, distanceInMeters, durationInSeconds, averageHeartRateInBeatsPerMinute, averagePaceInMinutesPerKilometer, ... (~30 fields) | success | camelCase |
| `POST /api/garmin/webhook(s)/activity-details` | summary.activityId, samples, laps, splits | success | camelCase |
| `POST /api/garmin/webhook(s)/sleeps` | Garmin fixed schema (~15 sleep fields) | success | camelCase |
| `POST /api/garmin/webhook(s)/stress` | Garmin fixed schema | success | camelCase |
| `POST /api/garmin/webhook(s)/hrv` | Garmin fixed schema | success | camelCase |
| `POST /api/garmin/webhook(s)/dailies` | Garmin fixed schema (~50 fields: steps, bodyBattery*, stressLevel*, floors*) | success | camelCase |
| `POST /api/garmin/webhook(s)/body-compositions` | Garmin fixed schema | success | camelCase |
| `POST /api/garmin/webhook(s)/pulse-ox` | Garmin fixed schema | success | camelCase |
| `POST /api/garmin/webhook(s)/respiration` | Garmin fixed schema | success | camelCase |
| `GET/POST /api/garmin/webhook(s)/deregistrations` | userAccessToken | success | camelCase |
| `GET /api/garmin/webhooks/queue/stats` | — | success, data, timestamp | camelCase |
| `GET /api/garmin/webhooks/queue/items` | — | success, data, count | camelCase |
| `POST /api/garmin/webhooks/queue/retry/:webhookId` | — | success, message | camelCase |
| `POST /api/garmin/webhooks/queue/process` | — | success, data, message | camelCase |
| `POST /api/garmin/webhook-test` | activities | success, message, eventIds | camelCase |
| `GET /api/garmin/webhook-stats` | query: days, limit | success, stats, recentEvents | camelCase |
| `GET /api/garmin/new-activities` | query: since, limit | success, activities, count, hasMore | camelCase |

## Garmin Companion (Watch App)
Connect IQ watch — not the iOS/Android phone app.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `POST /api/garmin-companion/auth` | email, password, deviceId, deviceModel | success, token, user{id, email, name, coachName, coachTone} | camelCase |
| `POST /api/garmin-companion/refresh-watch-token` | deviceId, deviceModel | token, expiresIn | camelCase |
| `POST /api/garmin-companion/session/start` | sessionId, deviceId, deviceModel, activityType, plannedWorkoutId | success, session, message | camelCase |
| `POST /api/garmin-companion/session/link` | sessionId, runId | success, session | camelCase |
| `POST /api/garmin-companion/data` | sessionId, timestamp, heartRate, heartRateZone, latitude, longitude, altitude, speed, pace, cadence, strideLength, groundContactTime, groundContactBalance, verticalOscillation, verticalRatio, power, temperature, activityType, isMoving, isPaused, cumulativeDistance, cumulativeAscent, cumulativeDescent, elapsedTime | success, id, coaching | camelCase |
| `POST /api/garmin-companion/data/batch` | sessionId, dataPoints[] (same shape as above) | success, count | camelCase |
| `POST /api/garmin-companion/session/status` | sessionId, status | success, session | camelCase |
| `POST /api/garmin-companion/session/end` | sessionId, summary, kmSplits, sessionType | success, session, summary, runId | camelCase |
| `POST /api/garmin-companion/session/:sessionId/upload-batch` | points, distanceM, durationSec, totalAscent, sessionType | success, runId, points, gpsPoints, splits | camelCase |
| `GET /api/garmin-companion/session/:sessionId/data` | query: since | dataPoints, count | camelCase |
| `GET /api/garmin-companion/session/:sessionId/latest` | — | latest, session | camelCase |
| `GET /api/garmin-companion/sessions/active` | — | sessions | camelCase |

## Samsung Companion (Watch App)
Tizen watch — not the iOS/Android phone app.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `POST /api/samsung-companion/auth` | — | sessionId, authToken, runnerName, timestamp | camelCase |
| `POST /api/samsung-companion/session/start` | — | sessionId, success, timestamp | camelCase |
| `POST /api/samsung-companion/data` | sessionId, timestamp, metrics{heartRate, heartRateZone, distance, pace, cadence, elapsedTime, latitude, longitude, altitude} | success, received | camelCase |
| `POST /api/samsung-companion/session/end` | sessionId | success, stats{distance, time, avgHeartRate, maxHeartRate, metricsCount} | camelCase |
| `GET /api/samsung-companion/status` | — | connected, activeSessions, sessions[] | camelCase |
| `POST /api/samsung-companion/coaching-cue` | sessionId, cue, audioUrl | success, sent, timestamp | camelCase |

## Training Plans

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `POST /api/training-plans/generate` | goalType, targetDistance, targetTime, targetDate, durationWeeks, experienceLevel, daysPerWeek, firstSessionStart, regularSessions, injuries, goalId, userTimezone, isPreEventPlan, age, gender, height, weight | planId, message | camelCase |
| `GET /api/training-plans/:userId` | query: status | array of plans + totalWorkouts, completedWorkouts | camelCase |
| `GET /api/training-plans/details/:planId` | — | plan, weeks[], performanceBaseline{...} | camelCase |
| `PUT /api/training-plans/:planId/regenerate` | injuries[{bodyPart, status, notes, injuryDate}] | success, message, workoutsRegenerated, weeksAffected, completedWorkoutsPreserved | camelCase |
| `POST /api/training-plans/:planId/next-block` | — | message, status, fullyGenerated | camelCase |
| `GET /api/training-plans/:planId/block-status` | — | planId, totalWeeks, generatedThroughWeek, isRolling, isFullyGenerated, nextBlockAt, nextBlockMessage, nextBlockReady | camelCase |
| `POST /api/training-plans/:planId/adapt` | reason | success, message | camelCase |
| `POST /api/training-plans/complete-workout` | workoutId, runId | success, message | camelCase |
| `GET /api/training-plans/:planId/today` | query: timezone | workout, isToday, isOverdue | camelCase |
| `GET /api/training-plans/:planId/progress` | — | planId, currentWeek, totalWeeks, goalType, completedWorkouts, totalWorkouts, overallCompletion, weeks[] | camelCase |
| `GET /api/training-plans/:planId/adaptations` | — | planId, count, adaptations[] | camelCase |
| `PUT /api/training-plans/workouts/:workoutId/complete` | runId | success, workoutId, isCompleted, planProgress{completedWorkouts, totalWorkouts, overallCompletion} | camelCase |
| `PUT /api/training-plans/workouts/:workoutId/skip` | — | success | camelCase |
| `PUT /api/training-plans/:planId/reschedule-sessions` | weekNumber, updates[{workoutId, dayOfWeek, scheduledDate}] | success, message | camelCase |
| `PATCH /api/training-plans/:planId/status` | status | success | camelCase |
| `PUT /api/training-plans/:planId/status` | status | (empty, 200) | camelCase |
| `DELETE /api/training-plans/:planId` | — | success, planId, message | camelCase |
| `POST /api/training-plans/adaptations/:adaptationId/accept` | — | success, message, workoutsUpdated | camelCase |
| `POST /api/training-plans/adaptations/:adaptationId/decline` | — | success, message | camelCase |
| `GET /api/training-plans/:planId/adaptations/pending` | — | adaptations, count | camelCase |

## Fitness Load (CTL/ATL/TSB)

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/fitness/current/:userId` | — | ctl, atl, tsb, status, message, recommendations | camelCase |
| `GET /api/fitness/trend/:userId` | query: startDate, endDate | startDate, endDate, dataPoints, trend[] | camelCase |
| `POST /api/fitness/recalculate/:userId` | — | success, message | camelCase |

## Strava

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/strava/connection-status` | — | connected, athleteName, athleteId, lastSync, tokenExpired, tokenRefreshError | camelCase |
| `GET /api/strava/activities` | — | count, activities[] | camelCase |

## Segments & Leaderboards

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/segments/nearby` | query: lat, lng, radius | array (raw DB rows) | camelCase |
| `GET /api/segments/:id/leaderboard` | query: timeframe | segmentId, timeframe, leaderboard[] | camelCase |
| `POST /api/segments/:id/star` | — | starred | camelCase |
| `POST /api/segments/create` | runId, startIndex, endIndex, name, description | segmentId, message | camelCase |
| `POST /api/segments/reprocess/:runId` | — | success, message | camelCase |
| `GET /api/segments/efforts/:userId` | — | array | camelCase |

## Heatmap

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/heatmap/:userId` | — | totalRuns, totalPoints, clusteredPoints, heatmap[{lat, lng, intensity}] | camelCase |

## Achievements

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `POST /api/achievements/initialize` | — | success, message | camelCase |
| `GET /api/achievements/:userId` | — | opaque (getUserAchievements) | camelCase |
| `GET /api/achievements` | — | array (raw DB rows) | camelCase |
| `POST /api/runs/:runId/achievements` | — | success, data{achievements, count} | camelCase |
| `GET /api/users/:userId/achievements` | — | success, data{achievementsCounts, totalRuns} | camelCase |

## Feed & Clubs
Social activity, clubs, challenges.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/feed` | query: limit, offset | array: id, userId, userName, userProfilePic, activityType, content, runId, goalId, achievementId, reactionCount, commentCount, createdAt | camelCase |
| `POST /api/feed/:activityId/react` | reactionType | success | camelCase |
| `POST /api/feed/:activityId/comment` | comment | raw inserted comment row | camelCase |
| `GET /api/feed/:activityId/comments` | — | array | camelCase |
| `GET /api/clubs` | query: search, city | array | camelCase |
| `POST /api/clubs/:clubId/join` | — | success, message | camelCase |
| `GET /api/challenges` | — | array | camelCase |
| `POST /api/challenges/:challengeId/join` | — | success, message | camelCase |

## Sharing

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /share/:token` | — | HTML (no JSON) | n/a |
| `GET /api/shared-run/:token` | — | runId, sharerId, sharerName, distanceKm, durationSeconds, avgPace, completedAt | camelCase |
| `GET /api/share/templates` | — | templates, stickers | camelCase |
| `POST /api/share/generate` | templateId, aspectRatio, stickers, runId, customBackground, backgroundOpacity, backgroundBlur, customStickers, ringLayout, customCaption | binary PNG | n/a |
| `POST /api/share/preview` | (same as generate) | image | n/a |

## Health / Wellness Snapshot
Wraps Garmin wellness data for the dashboard.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/health/today` | — | opaque (getTodaySnapshot) | camelCase |
| `GET /api/health/sleep` | query: date | opaque (getSleepDetails) | camelCase |
| `GET /api/health/recovery` | — | opaque (getRecoveryStatus) | camelCase |
| `GET /api/health/daily` | query: date | opaque (getDailyWellness) | camelCase |
| `GET /api/health/metrics` | — | opaque (getHealthMetrics) | camelCase |
| `GET /api/health/insights` | — | opaque (getHealthInsights) | camelCase |
| `GET /api/health/trends` | query: days | opaque (getTrendData) | camelCase |

## My Data (Personal Bests & Stats)
`routes-my-data.ts` — all responses wrapped in `{success, data}`.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/my-data/personal-bests` | — | success, data{personalBests} | camelCase |
| `GET /api/my-data/statistics` | query: days | success, data{...period stats} | camelCase |
| `GET /api/my-data/trends` | — | success, data{...trends} | camelCase |
| `GET /api/my-data/detailed-trends` | query: days | success, data{...trends} | camelCase |
| `GET /api/my-data/all-time-stats` | — | success, data{...all-time stats} | camelCase |
| `GET /api/my-data/coaching-summary` | query: days | success, data{...summary} | camelCase |
| `GET /api/my-data/runner-profile` | — | success, data{profile, updatedAt} | camelCase |
| `POST /api/my-data/refresh-runner-profile` | — | success, data{profile, updatedAt} | camelCase |
| `POST /api/my-data/reset-cache` | — | success, message | camelCase |
| `POST /api/my-data/admin/recompute-all` | — | success, total, ok, errors, errorDetails | camelCase |

## Admin
Cost dashboards, force-update broadcasts — not called by any mobile client.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /api/admin/verify` | — | isAdmin | camelCase |
| `GET /api/admin/costs/overview` | query: yearMonth | yearMonth, summary{...}, serviceBreakdown, operationBreakdown, infra, users{...}, pricing{...} | camelCase |
| `GET /api/admin/costs/users` | query: yearMonth | yearMonth, users[] | camelCase |
| `GET /api/admin/costs/timeline` | query: days | timeline, days | camelCase |
| `GET /api/admin/costs/infra` | query: yearMonth | yearMonth, replitCostUsd, neonCostUsd, otherCostUsd, notes | camelCase |
| `POST /api/admin/costs/infra` | yearMonth, replitCostUsd, neonCostUsd, otherCostUsd, notes | success | camelCase |
| `POST /api/admin/garmin-watch-app/broadcast-update` | version, releaseNote, dryRun, storeUrl, adminKey | dryRun/success, version, targeted, pushSent/withFcmToken, ... | camelCase |
| `POST /api/admin/android-app/broadcast-update` | version, title, releaseNote, dryRun, adminKey | (same shape as above) | camelCase |
| `POST /api/admin/garmin-watch-app/send-to-device` | fcmToken, version, releaseNote, storeUrl, adminKey | success, version, storeUrl, messageId, message | camelCase |
| `GET /api/admin/garmin-watch-app/users` | header/query: admin_key | total, withFcmToken, users | camelCase |
| `POST /api/admin/app-update/broadcast` | version, title, releaseNote, dryRun, adminKey | (same shape as broadcast-update) | camelCase |

## System & Misc
Version checks, support, dev/test endpoints.

| Route | Request fields | Response fields | Casing |
|---|---|---|---|
| `GET /.well-known/assetlinks.json` | — | relation, target{namespace, package_name, sha256_cert_fingerprints} — fixed Android App Links spec format | snake_case |
| `GET /api/version` | — | v, status | camelCase |
| `GET /api/googlePlayPricing` | — | source, **updated_at**, note, lite_monthly, lite_annual, ... (each: tier, period, **default_usd**, by_currency) | mixed |
| `POST /api/support/contact` | name, email, subject, message, screenshots[] | ok | camelCase |
| `POST /api/register-interest` | name, email, country, message | ok, id | camelCase |
| `POST /api/test/coaching-plan-reminder` | userEmail, workoutName, distance, intensity | success, message, result | camelCase |
| `POST /api/test/push-notification` | userEmail, title, body | success, message, userEmail, hasToken, tokenPreview | camelCase |
| `POST /api/push-subscriptions` | (unimplemented) | success | camelCase |
| `POST /api/coaching-logs/:sessionKey` | (unimplemented) | success | camelCase |

---

*Generated from a full read-through of `server/routes.ts` (18,188 lines, 278 `app.*` registrations) plus `routes-achievements.ts`, `routes-adaptation.ts`, `routes-my-data.ts`, `routes-samsung-companion.ts`, and `routes-session-coaching.ts`. Response shapes for routes that delegate to a service function (e.g. `buildGroupRunResponse()`) are annotated as such where the literal fields weren't visible at the route-registration call site.*
