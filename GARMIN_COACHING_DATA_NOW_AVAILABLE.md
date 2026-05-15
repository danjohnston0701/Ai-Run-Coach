# 🏃 Garmin Advanced Metrics Now Available for AI Coaching

## What Changed

All captured Garmin watch sensor data is now being sent to OpenAI's coaching endpoints in **real-time during the run**. Previously, only basic metrics (HR, pace, cadence) were used for coaching. Now the AI has **26+ additional data points** for nuanced, personalized feedback.

---

## 📊 New Data Flowing to OpenAI's Elite Coaching API

### **Running Dynamics** (Fenix 6+/FR945+ and newer)
- **Ground Contact Time (GCT)** — ms per foot strike
  - Normal: 200-300ms
  - Lower is typically more efficient in distance running
  - **Coaching insight**: "Your GCT is 245ms — great rhythm for this pace"

- **Ground Contact Balance** — left/right symmetry %
  - 50% = perfect symmetry
  - Imbalance >5% suggests muscle fatigue or injury risk
  - **Coaching insight**: "Your balance is shifting right (48%/52%) — left leg tiring?"

- **Vertical Oscillation (VO)** — cm torso bounce per stride
  - Efficient: 6-8cm
  - >10cm = wasted energy
  - **Coaching insight**: "Reduce VO to 7.5cm — focus on posture to conserve energy"

- **Vertical Ratio (VR)** — oscillation as % of stride
  - Efficient: 8-10%
  - Lower ratio = more horizontal power, less bouncing
  - **Coaching insight**: "VR is 9.2% — you're pushing forward, not up"

- **Stride Length** — meters per stride
  - Varies by pace (6-7ft at easy, 5ft at faster paces)
  - Too long = overstriding (braking), too short = wasted effort
  - **Coaching insight**: "Your stride lengthened to 1.25m — dial it back by 3% at this pace"

### **Power & Breathing** (Fenix 7/FR965 series, some FR245+)
- **Running Power** — watts expended
  - Varies: 200-400W typical, 500W+ at high intensity
  - Same power at faster pace = improved efficiency
  - **Coaching insight**: "You ran the last km at the same power but 10s faster — excellent economy!"

- **Respiration Rate** — breaths per minute
  - Easy: 30-35 bpm
  - Tempo: 40-50 bpm
  - VO2 Max: 50-65 bpm
  - **Coaching insight**: "RR jumped to 58 — you're at lactate threshold, dial back pace"

### **Training Effect & Recovery** (Garmin firmware)
- **Aerobic Training Effect** — 0-5 scale
  - 2.0-3.0 = easy run benefits
  - 3.0-4.0 = tempo/threshold workout
  - 4.0-5.0 = high intensity
  - **Coaching insight**: "You're hitting 3.8 ATE — this is a solid threshold session"

- **Anaerobic Training Effect** — 0-5 scale
  - Measures HIIT / sprint benefits
  - Builds lactate tolerance and power
  - **Coaching insight**: "Your hill repeats are building anaerobic capacity (2.1 ATE)"

- **Recovery Time Minutes** — when fully recovered
  - Personalized to the runner, updated real-time
  - **Coaching insight**: "You'll be recovered in 28 minutes — take a 5-min walk cool-down"

- **VO2 Max Estimate** — ml/kg/min
  - Garmin's estimate improves with each run
  - Typical range: 35-65+ depending on fitness
  - **Coaching insight**: "Your VO2 Max improved to 52.3 — that's +0.6 from last week!"

### **Performance Ratios** (Calculated by app)
- **Power-to-Pace Ratio** — watts per km/h
  - Lower = more efficient (better running economy)
  - Improves with training and better form
  - Thresholds:
    - <3.5 W/km/h → "Efficient"
    - 3.5-5.0 → "Moderate"
    - >5.0 → "Taxing"
  - **Coaching insight**: "You're 12% more efficient today (3.2 W/km/h) — great form!"

- **Heart Rate Zone** — 1-5 calculated from current HR
  - Zone 1 (Zone 2): Recovery/easy
  - Zone 3: Aerobic base
  - Zone 4: Threshold
  - Zone 5: VO2 Max / anaerobic
  - **Coaching insight**: "You're drifting into Zone 5 — Zone 3 pace for easy run day"

---

## 🎯 Possible AI Coaching Insights

### **Form & Efficiency**
- "Your GCT is 240ms and VO is 7.2cm — textbook efficient running form. Maintain this."
- "GCT jumped to 285ms (stride length +1.1m) — watch for overstriding on downhills"
- "VR is high at 11.2% — focus on core engagement to reduce wasted vertical motion"

### **Breathing & Intensity**
- "RR is 48 bpm at this pace — easy aerobic zone, feel free to talk"
- "RR is 58 bpm and your HR is Zone 4.2 — you're at threshold. Good session!"
- "RR spiked to 62 on that hill — normal, but dial back if targeting Zone 3"

### **Power & Durability**
- "You maintained 285W power while pace picked up — excellent efficiency gains"
- "Power is creeping down (320W → 310W) but pace stayed same — watch for form breakdown late in run"
- "ATE is 4.2 — this is a legitimate threshold workout, follow with easy day tomorrow"

### **Recovery & Pacing**
- "Recovery time is 32 minutes, down from 45 yesterday — solid adaptation!"
- "Your estimated VO2 Max is 51.8 ml/kg/min, up 0.7 from last week — keep the consistency"
- "The AI projects you'll recover in 26 minutes — good recovery plan for this run"

### **HR-to-Pace Mismatches**
- "You're at Zone 3 HR but only running at Zone 2 pace — you're getting more aerobic benefit than intended"
- "Your power jumped but HR stayed stable — you're getting stronger; time to push pace"

---

## ��� Data Flow

```
Garmin Watch
    ↓
Activity.Info (every tick)
    ↓
RunView.mc (9 new variables)
    ↓
PhoneLink.sendRunData() + DataStreamer.sendData()
    ↓
RunTrackingService (accumulates + averages)
    ↓
buildBaseEliteRequest() [NEW - all metrics included]
    ↓
OpenAI Elite Coaching Endpoint
    ↓
Real-time coaching audio/feedback during the run
```

---

## 📋 Implementation Details

### **Updated Request Objects**
- `EliteCoachingRequest` now includes all running dynamics, power, respiration, and training effect fields
- `buildBaseEliteRequest()` populates all metrics from accumulated watch data
- Efficiency metrics calculated on the fly (power-to-pace ratio, running efficiency classification)

### **Data Handling**
- All fields are **nullable** — devices that don't support a metric get null (gracefully ignored by OpenAI)
- Real-time averages calculated from streaming watch frames
- Latest values for recovery time, training effects (updated by firmware)

### **Watch Compatibility**
| Data Point | Supported Devices |
|---|---|
| GCT, Balance, VO, VR, Stride | Fenix 6+, FR945, FR245M+, FR955, Fenix 7, Epix |
| Running Power | Fenix 7, FR965, Fenix 8 (with power app) |
| Respiration Rate | Fenix 7, Fenix 7X, FR965 |
| Training Effect, VO2 Max | Most Garmin watches (firmware-calculated) |

---

## 🚀 Next Steps

### **Backend (OpenAI Side)**
The Elite Coaching endpoint now receives these new fields. Examples of how to use them:

```json
{
  "coachingType": "technique_form",
  "groundContactTime": 245.5,
  "verticalOscillation": 7.2,
  "strideLength": 1.18,
  "runningPower": 312,
  "respirationRate": 42.5,
  "runningEfficiency": "efficient",
  "powerToPaceRatio": 3.1
}
```

The backend can now craft insights like:
- Technique improvements ("Your form is optimal, GCT is perfect for your pace")
- Breathing cues ("Respiration rising — time to back off, you're working too hard")
- Power coaching ("Same power as yesterday but 5s/km faster — you're adapting well!")

### **UI Enhancements**
Could display during run:
- Real-time running efficiency indicator
- Form metrics (GCT, VO, stride) as a dashboard
- Recovery countdown ("Recovering in 24 minutes...")
- Power curve graph post-run

---

## 📈 Coaching Possibilities

With this data, the AI can now:

1. **Real-time Form Coaching** — detect stride/posture issues live
2. **Breathing Cues** — match breathing rhythm to effort level
3. **Efficiency Tracking** — power/pace ratios showing day-to-day improvement
4. **Fatigue Detection** — GCT/balance shifts indicating muscle fatigue
5. **Recovery Guidance** — actual recovery time (not generic 48h rule)
6. **VO2 Max Progression** — celebrate fitness gains as they happen
7. **Pacing Intelligence** — "You're running at Zone 4 HR on an easy day" alerts
8. **Threshold Training** — automated detection of actual threshold intensity via ATE

All previously impossible without this rich sensor data.
