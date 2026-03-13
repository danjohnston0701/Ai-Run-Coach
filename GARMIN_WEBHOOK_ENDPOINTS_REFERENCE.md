# Garmin Webhook Endpoints - Quick Reference

## 🔌 **All Webhook Endpoints**

Your server receives webhooks at:
```
POST https://@airuncoach.live/api/garmin/webhooks/{type}
```

### **Activity Webhooks**

| Endpoint | When Fires | Primary Use | Response Time |
|----------|-----------|------------|---|
| `POST /api/garmin/webhooks/activities` | After user completes activity | Create run record | Immediate |
| `POST /api/garmin/webhooks/activity-details` | 30-60 sec after activity ends | Add GPS samples & splits | Immediate |
| `POST /api/garmin/webhooks/move-iq` | 1-2 min after activity ends | Add activity classification | Immediate |

### **Health Webhooks**

| Endpoint | When Fires | Primary Use | Response Time |
|----------|-----------|------------|---|
| `POST /api/garmin/webhooks/dailies` | Once per day (~4 AM) | Daily wellness summary | Immediate |
| `POST /api/garmin/webhooks/hrv` | Once per day (~6 AM) | Sleep HRV & recovery | Immediate |
| `POST /api/garmin/webhooks/blood-pressure` | When measurement taken | Blood pressure reading | Immediate |
| `POST /api/garmin/webhooks/health-snapshot` | Multiple times per day | Real-time metrics | Immediate |
| `POST /api/garmin/webhooks/pulse-ox` | Periodic measurements | SpO2 readings | Immediate |
| `POST /api/garmin/webhooks/respiration` | Multiple times per day | Breathing rate | Immediate |
| `POST /api/garmin/webhooks/skin-temperature` | Periodic readings | Body temperature | Immediate |
| `POST /api/garmin/webhooks/epochs` | After activities | Minute-by-minute data | Immediate |

---

## 📊 **Webhook Data Frequency**

### **Daily**
- Dailies: 1 per day
- HRV: 1 per day
- Skin Temperature: Variable (many readings)

### **Per Activity**
- Activities: 1 per activity
- Activity-Details: 1 per activity (delayed 30-60 sec)
- MoveIQ: 1 per activity (delayed 1-2 min)
- Epochs: ~96 per day (1 per minute)
- Health Snapshots: Multiple per activity

### **On Demand**
- Blood Pressure: When user measures
- Pulse-Ox: When user measures
- Respiration: Periodic throughout day

---

## 🔄 **Typical Webhook Sequence**

### **When User Completes a Run**

```
T+0s:    ACTIVITIES webhook → Creates run record
T+30s:   ACTIVITY-DETAILS webhook → Adds GPS & samples
T+60s:   EPOCHS webhook → Adds minute-by-minute data
T+120s:  MOVEIQ webhook → Adds activity classification
```

### **Daily Sequence**

```
T+0:00   User wakes up
T+4:00   DAILIES webhook → Daily summary
T+6:00   HRV webhook → Sleep recovery data
T+...    User goes about day
T+...    HEALTH-SNAPSHOT webhooks (multiple)
T+...    BLOOD-PRESSURE webhooks (if measured)
T+...    PULSE-OX webhooks (if measured)
T+...    RESPIRATION webhooks (periodic)
T+...    SKIN-TEMPERATURE webhooks (periodic)
T+23:00  Final data syncs before sleep
```

---

## ✅ **All Payloads Match Your Actual Data**

Each webhook handler has been **specifically tested and enhanced** for your actual Garmin data format:

- ✅ Activities - Activity summaries with full metrics
- ✅ Activity-Details - Time series samples & splits
- ✅ MoveIQ - Activity sub-types array
- ✅ Dailies - 50+ wellness fields
- ✅ Epochs - Minute-by-minute classifications
- ✅ HRV - Sleep HRV time series
- ✅ Blood Pressure - Systolic/diastolic + health classification
- ✅ Health Snapshots - Real-time multi-metric data
- ✅ Pulse-Ox - SpO2 time series with on-demand flag
- ✅ Respiration - Breathing rate time series
- ✅ Skin Temperature - Temperature readings with trend

---

## 🛡️ **Reliability Guarantees**

### **What Happens When a Webhook is Received**

1. ✅ HTTP 200 returned to Garmin **immediately** (non-blocking)
2. ✅ Data processed asynchronously
3. ✅ If processing fails → Auto-queued for retry
4. ✅ Retries happen every 10 minutes (up to 3 attempts)
5. ✅ All data persisted or queued (never lost)

### **Admin Monitoring Endpoints**

```
GET  /api/garmin/webhooks/queue/stats     # Queue statistics
GET  /api/garmin/webhooks/queue/items     # List failed webhooks
POST /api/garmin/webhooks/queue/retry/:id # Manual retry
POST /api/garmin/webhooks/queue/process   # Force process now
```

---

## 📊 **Storage Locations**

| Data Type | Primary Table | Secondary Tables |
|-----------|---------------|------------------|
| Activities | `garmin_activities` | `runs` (linked) |
| Activity samples | `garmin_activities.samples` | N/A |
| MoveIQ | `garmin_move_iq` | `garmin_activities` |
| Blood Pressure | `garmin_blood_pressure` | N/A |
| Dailies | `garmin_wellness_metrics` | N/A |
| Epochs (raw) | `garmin_epochs_raw` | Auto-deleted 7d |
| Epochs (agg) | `garmin_epochs_aggregate` | Forever |
| HRV | `garmin_wellness_metrics` | N/A |
| Health Snapshots | `garmin_health_snapshots` | Auto-deleted 30d |
| Pulse-Ox | `garmin_wellness_metrics` | N/A |
| Respiration | `garmin_wellness_metrics` | N/A |
| Skin Temperature | `garmin_skin_temperature` | Auto-deleted 90d |

---

## 🔐 **User Mapping Strategies**

### **Primary (Preferred)**
```
payload.userAccessToken → Find user in database
```

### **Secondary (Activities)**
```
payload.summaryId + date → Match to user's recent activities
```

### **Fallback (Graceful)**
```
Cannot map → Queue for retry later
```

---

## 🚀 **Production Deployment Checklist**

- [ ] All webhooks registered in Garmin Connect
- [ ] Test devices connected and syncing
- [ ] Monitor webhook failure queue for 24 hours
- [ ] Verify all 11 endpoint types receiving data
- [ ] Check database tables populating correctly
- [ ] Verify user mapping working for your accounts
- [ ] Test manual retry endpoints
- [ ] Monitor error logs for issues
- [ ] Set up automated alerts for queue size
- [ ] Document any custom fields/extensions

---

## 💬 **Example Requests to Test**

### **Test Activities Webhook**
```bash
curl -X POST https://your-domain.com/api/garmin/webhooks/activities \
  -H "Content-Type: application/json" \
  -d '{
    "activityId": 123,
    "activityName": "Morning Run",
    "activityType": "RUNNING",
    "startTimeInSeconds": 1234567890,
    "durationInSeconds": 1800,
    "distanceInMeters": 5000,
    "averageHeartRateInBeatsPerMinute": 145
  }'
```

### **Test Blood Pressure Webhook**
```bash
curl -X POST https://your-domain.com/api/garmin/webhooks/blood-pressure \
  -H "Content-Type: application/json" \
  -d '{
    "summaryId": "bp123",
    "systolic": 124,
    "diastolic": 65,
    "pulse": 61,
    "measurementTimeInSeconds": 1234567890
  }'
```

---

**All endpoints are production-ready and waiting for data!** ✨
