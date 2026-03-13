# Pre-Commit Checklist - Garmin Integration & Health Insights

## ✅ What's Ready to Commit

### **Backend Code Changes** ✅
- [x] Modified: `server/routes.ts` - New health insights endpoints + permissions endpoints + enhanced webhooks
- [x] Modified: `server/scheduler.ts` - Added webhook processor scheduling
- [x] Modified: `shared/schema.ts` - Added optional fields, new tables
- [x] New: `server/activity-merge-service.ts` - Smart activity merging logic
- [x] New: `server/health-insights-service.ts` - Health data aggregation service
- [x] New: `server/garmin-permissions-service.ts` - Permissions management service
- [x] New: `server/webhook-processor.ts` - Webhook failure queue processor

### **Frontend Code Changes** ✅
- [x] New: `android/app/src/main/kotlin/com/airuncoach/ui/settings/GarminPermissionsScreen.kt` - Complete permissions UI

### **Documentation** ✅
- [x] DATABASE_MIGRATION_GUIDE.md - Updated with new endpoints
- [x] 25+ comprehensive documentation files created
- [x] All implementation guides, quick starts, and references

---

## 📋 Database Updates Required (CRITICAL)

### **Run These SQL Migrations in Neon BEFORE committing:**

**Migration Set 1: Health Insights & Core Data**
```sql
-- File: GARMIN_DATABASE_MIGRATIONS.sql
-- Run in Neon Dashboard → SQL Editor
```

**Contents:**
- ✓ Extend `garmin_wellness_metrics` with 50+ new columns
- ✓ Create `activity_merge_log` table
- ✓ Create `garmin_activity_samples` table  
- ✓ Create `garmin_epochs_raw` table
- ✓ Create `garmin_epochs_aggregate` table
- ✓ Create `garmin_health_snapshots` table
- ✓ Create `garmin_move_iq` table
- ✓ Create `garmin_blood_pressure` table
- ✓ Create `garmin_skin_temperature` table
- ✓ Create `webhook_failure_queue` table
- ✓ Create `wellness_daily_summary` view
- ✓ Create 15+ performance indexes

**Migration Set 2: Permissions Management**
```sql
-- File: GARMIN_PERMISSIONS_MIGRATIONS.sql
-- Run in Neon Dashboard → SQL Editor
```

**Contents:**
- ✓ Add `updated_at` column to `connected_devices`
- ✓ Add `grantedScopes` column to `connected_devices`
- ✓ Create performance indexes
- ✓ Create optional `garmin_permission_changes` audit table

---

## 🔄 Steps to Complete Before Commit

### **Step 1: Neon Database Updates** (Required)
```bash
# Option A: Use Neon Dashboard
1. Go to https://console.neon.tech
2. Click "SQL Editor"
3. Copy/paste contents from: GARMIN_DATABASE_MIGRATIONS.sql
4. Click "Execute" and wait for completion
5. Repeat for: GARMIN_PERMISSIONS_MIGRATIONS.sql
6. Verify no errors

# Option B: Use Neon CLI
neon sql -c "your_connection_string" < GARMIN_DATABASE_MIGRATIONS.sql
neon sql -c "your_connection_string" < GARMIN_PERMISSIONS_MIGRATIONS.sql
```

### **Step 2: Verify Backend Type Compatibility** (Optional but Recommended)
```bash
# Check for any TypeScript errors
npm run build

# Run linter
npm run lint

# Run type check
npm run type-check
```

### **Step 3: Verify All New Endpoints Work** (Optional but Recommended)
```bash
# Test health insights endpoints
curl http://localhost:3000/api/health/today \
  -H "Authorization: Bearer test_token"

curl http://localhost:3000/api/health/metrics \
  -H "Authorization: Bearer test_token"

# Test permissions endpoints
curl http://localhost:3000/api/garmin/permissions \
  -H "Authorization: Bearer test_token"
```

### **Step 4: Update Replit Backend Environment** (If using Replit)
```bash
# Make sure environment variables are set:
- GARMIN_CONSUMER_KEY
- GARMIN_CONSUMER_SECRET
- DATABASE_URL
- APP_URL

# Redeploy to ensure new code is live:
replit.com → Run button → Deploy
```

### **Step 5: Verify Webhook Endpoints Are Accessible** (Important)
```bash
# Test that Garmin can reach your webhook endpoints
# From external (not localhost), test:

curl -X POST https://airuncoach.live/api/garmin/webhooks/activities \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Should return HTTP 200

curl -X POST https://airuncoach.live/api/garmin/webhooks/permissions \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Should return HTTP 200
```

---

## 📝 Files to Commit

### **Code Files to Add**
```bash
git add server/activity-merge-service.ts
git add server/health-insights-service.ts
git add server/garmin-permissions-service.ts
git add server/webhook-processor.ts
git add android/app/src/main/kotlin/com/airuncoach/ui/settings/GarminPermissionsScreen.kt
```

### **Modified Files to Add**
```bash
git add server/routes.ts
git add server/scheduler.ts
git add shared/schema.ts
git add DATABASE_MIGRATION_GUIDE.md
```

### **Documentation to Add** (Choose which ones)
```bash
# Core documentation (highly recommended)
git add GARMIN_PERMISSIONS_MANAGEMENT_GUIDE.md
git add HEALTH_INSIGHTS_IMPLEMENTATION_SUMMARY.md
git add GARMIN_COMPLETE_INTEGRATION_MASTER_SUMMARY.md

# Quick reference (recommended)
git add GARMIN_PERMISSIONS_QUICK_START.md
git add GARMIN_INTEGRATION_QUICK_REFERENCE.md
git add HEALTH_INSIGHTS_QUICK_START.md

# Detailed implementation guides (optional)
git add GARMIN_*.md
git add HEALTH_INSIGHTS_*.md
```

### **SQL Migration Files to Add**
```bash
git add GARMIN_DATABASE_MIGRATIONS.sql
git add GARMIN_PERMISSIONS_MIGRATIONS.sql
```

### **Do NOT Commit**
```bash
# Android build artifacts
.kotlin/metadata/

# Pod specs
shared/shared.podspec

# Build outputs
build/
dist/
.gradle/
```

---

## 🧪 Testing Before Commit

### **Unit Tests** (If applicable)
```bash
npm test
# All tests should pass
```

### **Integration Tests**
```bash
# Test that new services can be imported
npm run build
```

### **Manual Testing**
- [ ] Health Insights endpoints return valid JSON
- [ ] Permissions endpoints return valid JSON
- [ ] Webhook endpoints accept POST requests
- [ ] No console errors in server logs

---

## 🚀 Commit Message Template

```
feat: Add Garmin Permissions Management & Health Insights Tab

**Summary:**
- Implement comprehensive Garmin permissions management system
  - Users can view and manage data access permissions from app
  - Garmin permissions webhook now receives and processes changes
  - Database tracks granted OAuth scopes
  
- Add Health Insights service for wellness data
  - Aggregates 12+ health metrics (sleep, stress, HR, BP, etc)
  - Adaptive UI shows only available data for user's device
  - 7 new REST API endpoints
  
- Add intelligent activity merging
  - Prevents duplicates when Garmin and app record same run
  - Fuzzy matching with 100-point confidence scoring
  - Auto-enriches runs with Garmin metrics
  
**Database Changes:**
- Extended garmin_wellness_metrics with 50+ new fields
- New tables: activity_merge_log, epochs_raw, epochs_aggregate, health_snapshots, move_iq, blood_pressure, skin_temperature, webhook_failure_queue
- Enhanced connected_devices with grantedScopes tracking
- Created performance indexes and wellness_daily_summary view

**Backend Changes:**
- New services: health-insights-service, garmin-permissions-service, activity-merge-service, webhook-processor
- Enhanced permissions webhook handler
- 7 new REST API endpoints for health & permissions
- Scheduled webhook failure processor

**Frontend Changes:**
- New GarminPermissionsScreen composable
- Manage Permissions button in Connected Apps
- ViewModel with Hilt injection

**Breaking Changes:** None - all changes are additive

**Migration Required:**
Run: GARMIN_DATABASE_MIGRATIONS.sql
Run: GARMIN_PERMISSIONS_MIGRATIONS.sql

🤖 Generated with [Firebender](https://firebender.com)
Co-Authored-By: Firebender <help@firebender.com>
```

---

## ✅ Final Pre-Commit Verification

Before running `git commit`:

- [ ] Database migrations run successfully in Neon
- [ ] No TypeScript/linting errors: `npm run lint`
- [ ] Build completes successfully: `npm run build`
- [ ] Health insights endpoints accessible
- [ ] Permissions endpoints accessible
- [ ] Webhook endpoints return HTTP 200
- [ ] All new files added to git
- [ ] Commit message is clear and descriptive
- [ ] No build artifacts included in commit

---

## 🎯 Summary

**Required Actions:**
1. **Run SQL migrations in Neon** (CRITICAL - database schema changes)
2. **Verify endpoints accessible** from outside (localhost)
3. **Test basic functionality** locally
4. **Run build check** to catch any errors

**Optional Actions:**
1. Run full test suite
2. Deploy to staging environment
3. Test with real Garmin data

**Then Ready to Commit!** ✅

---

## 📞 Troubleshooting

**If migrations fail:**
- Check Neon connection is active
- Verify user has database modification privileges
- Run migrations one at a time to isolate errors

**If endpoints unreachable:**
- Check server is running
- Verify routes are exported correctly
- Check environment variables are set

**If build fails:**
- Run `npm install` to ensure dependencies
- Check TypeScript types are correct
- Verify all imports are present

---

You're almost there! Once you run the migrations and verify everything works, you're ready to commit! 🚀
