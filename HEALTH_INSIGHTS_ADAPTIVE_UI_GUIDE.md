# Health Insights - Adaptive UI for Partial Data Guide

## 🎯 Overview

**Problem**: Not all Garmin accounts provide every data metric. Some users have basic fitness trackers that only track steps and heart rate, while others have advanced watches that track sleep, stress, blood pressure, etc.

**Solution**: Adaptive UI that gracefully handles missing data and only displays what's available, ensuring a great experience for all users regardless of their device capabilities.

---

## 📱 Data Availability Architecture

### **API Response Format**

All endpoints now include an `availableMetrics` array that lists which metrics have data:

```typescript
// Example: User with basic Garmin Vivofit (minimal data)
{
  date: "2026-03-13",
  avgHeartRate: 72,
  sleepScore: null,  // Not available
  sleepDuration: null,  // Not available
  avgStressLevel: null,  // Not available
  bodyBatteryLevel: null,  // Not available
  avgBreathingRate: null,  // Not available
  skinTemperature: null,  // Not available
  vo2Max: null,  // Not available
  fitnessAge: null,  // Not available
  availableMetrics: ['heartRate']  // Only HR available
}

// Example: User with Garmin Fenix (advanced data)
{
  date: "2026-03-13",
  avgHeartRate: 72,
  sleepScore: 74,
  sleepDuration: 26400,
  avgStressLevel: 48,
  bodyBatteryLevel: 46,
  avgBreathingRate: 12.5,
  skinTemperature: 36.5,
  vo2Max: 46.0,
  fitnessAge: 21,
  availableMetrics: ['heartRate', 'sleep', 'stress', 'battery', 'breathing', 'temperature', 'vo2Max', 'fitnessAge']
}

// Example: User with no health data yet
{
  date: "2026-03-13",
  avgHeartRate: null,
  sleepScore: null,
  sleepDuration: null,
  avgStressLevel: null,
  bodyBatteryLevel: null,
  avgBreathingRate: null,
  skinTemperature: null,
  vo2Max: null,
  fitnessAge: null,
  availableMetrics: []  // No data available
}
```

---

## 🎨 Conditional Component Rendering

### **Example 1: Health Snapshot Card - Show Only Available Metrics**

```kotlin
@Composable
fun HealthSnapshotCard(snapshot: HealthSnapshot) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .padding(16.dp),
    shape = RoundedCornerShape(16.dp),
    backgroundColor = Color(0xFF1A1A1A),
  ) {
    Column(
      modifier = Modifier.padding(16.dp)
    ) {
      Text(
        "TODAY'S SNAPSHOT",
        style = TextStyle(
          fontSize = 16.sp,
          fontWeight = FontWeight.Bold,
          color = Color.White
        )
      )
      
      Spacer(modifier = Modifier.height(12.dp))
      
      // Only show Heart Rate if available
      if (snapshot.availableMetrics.contains("heartRate") && snapshot.avgHeartRate != null) {
        HealthMetricRow(
          icon = "❤️",
          label = "Avg HR",
          value = "${snapshot.avgHeartRate} bpm"
        )
      }
      
      // Only show Sleep if available
      if (snapshot.availableMetrics.contains("sleep") && snapshot.sleepScore != null) {
        val hours = (snapshot.sleepDuration ?: 0) / 3600
        HealthMetricRow(
          icon = "😴",
          label = "Sleep",
          value = "${hours}h (Score: ${snapshot.sleepScore})"
        )
      }
      
      // Only show Stress if available
      if (snapshot.availableMetrics.contains("stress") && snapshot.avgStressLevel != null) {
        HealthMetricRow(
          icon = "😰",
          label = "Stress",
          value = "${snapshot.avgStressLevel}/100",
          statusColor = getStressColor(snapshot.avgStressLevel)
        )
      }
      
      // Only show Battery if available
      if (snapshot.availableMetrics.contains("battery") && snapshot.bodyBatteryLevel != null) {
        HealthMetricRow(
          icon = "🔋",
          label = "Battery",
          value = "${snapshot.bodyBatteryLevel}/100",
          statusColor = getBatteryColor(snapshot.bodyBatteryLevel)
        )
      }
      
      // Only show Breathing if available
      if (snapshot.availableMetrics.contains("breathing") && snapshot.avgBreathingRate != null) {
        HealthMetricRow(
          icon = "🫁",
          label = "Breathing",
          value = "${snapshot.avgBreathingRate.toInt()} bpm"
        )
      }
      
      // Only show Temperature if available
      if (snapshot.availableMetrics.contains("temperature") && snapshot.skinTemperature != null) {
        HealthMetricRow(
          icon = "🌡️",
          label = "Temp",
          value = "${snapshot.skinTemperature}°C"
        )
      }
      
      // Show placeholder if no data
      if (snapshot.availableMetrics.isEmpty()) {
        NoDataPlaceholder("No health metrics available today. Try connecting a Garmin device or wait for first data sync.")
      }
    }
  }
}

@Composable
fun NoDataPlaceholder(message: String) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Icon(
      painter = painterResource(id = R.drawable.ic_no_data),
      contentDescription = "No data",
      modifier = Modifier.size(48.dp),
      tint = Color(0xFF666666)
    )
    Spacer(modifier = Modifier.height(16.dp))
    Text(
      message,
      textAlign = TextAlign.Center,
      color = Color(0xFF888888),
      fontSize = 14.sp
    )
  }
}
```

---

### **Example 2: Sleep & Recovery Section - Handle Missing Data**

```kotlin
@Composable
fun SleepRecoverySection(
  sleepDetails: SleepDetails?,
  recoveryStatus: RecoveryStatus?,
  modifier: Modifier = Modifier
) {
  Column(modifier = modifier) {
    // Sleep Card - only show if data is available
    if (sleepDetails?.available == true) {
      SleepQualityCard(sleepDetails)
    } else if (sleepDetails?.available == false) {
      // Show placeholder with helpful message
      SleepUnavailablePlaceholder(sleepDetails.message ?: "Sleep data not available")
    }
    
    Spacer(modifier = Modifier.height(12.dp))
    
    // Recovery Card - only show if HRV or Battery data exists
    if (recoveryStatus?.availableMetrics?.isNotEmpty() == true) {
      RecoveryStatusCard(recoveryStatus)
    } else {
      RecoveryUnavailablePlaceholder()
    }
  }
}

@Composable
fun SleepQualityCard(sleep: SleepDetails) {
  // Only show if available
  if (!sleep.available) return
  
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp),
    shape = RoundedCornerShape(16.dp),
    backgroundColor = Color(0xFF1A1A1A)
  ) {
    Column(modifier = Modifier.padding(16.dp)) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text("🛏️ LAST NIGHT", fontWeight = FontWeight.Bold, color = Color.White)
        if (sleep.score != null) {
          RatingBadge(sleep.score)
        }
      }
      
      Spacer(modifier = Modifier.height(12.dp))
      
      // Only show metrics that have data
      if (sleep.totalDuration != null) {
        SleepMetricRow("Duration", formatDuration(sleep.totalDuration))
      }
      
      if (sleep.qualityRatings != null) {
        Spacer(modifier = Modifier.height(12.dp))
        Text("Sleep Stages", fontSize = 12.sp, color = Color(0xFFB0B0B0))
        
        if (sleep.deepSleep != null && sleep.deepPercentage != null) {
          SleepStageBar(
            label = "Deep",
            percentage = sleep.deepPercentage,
            color = Color(0xFF4A6FA5),
            duration = formatDuration(sleep.deepSleep)
          )
        }
        
        if (sleep.lightSleep != null && sleep.lightPercentage != null) {
          SleepStageBar(
            label = "Light",
            percentage = sleep.lightPercentage,
            color = Color(0xFF7AA3E5),
            duration = formatDuration(sleep.lightSleep)
          )
        }
        
        if (sleep.remSleep != null && sleep.remPercentage != null) {
          SleepStageBar(
            label = "REM",
            percentage = sleep.remPercentage,
            color = Color(0xFFB5D6FF),
            duration = formatDuration(sleep.remSleep)
          )
        }
      }
    }
  }
}

@Composable
fun SleepUnavailablePlaceholder(message: String) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp),
    shape = RoundedCornerShape(16.dp),
    backgroundColor = Color(0xFF1A1A1A)
  ) {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Icon(
        painter = painterResource(id = R.drawable.ic_sleep),
        contentDescription = "Sleep",
        modifier = Modifier.size(32.dp),
        tint = Color(0xFF666666)
      )
      Spacer(modifier = Modifier.height(12.dp))
      Text(
        "🛏️ Sleep Tracking",
        fontWeight = FontWeight.Bold,
        color = Color.White,
        fontSize = 14.sp
      )
      Spacer(modifier = Modifier.height(8.dp))
      Text(
        message,
        textAlign = TextAlign.Center,
        color = Color(0xFF888888),
        fontSize = 12.sp
      )
    }
  }
}

@Composable
fun RecoveryStatusCard(recoveryStatus: RecoveryStatus) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp),
    shape = RoundedCornerShape(16.dp),
    backgroundColor = Color(0xFF1A1A1A)
  ) {
    Column(modifier = Modifier.padding(16.dp)) {
      Text("💪 RECOVERY STATUS", fontWeight = FontWeight.Bold, color = Color.White)
      
      Spacer(modifier = Modifier.height(12.dp))
      
      // Show HRV if available
      recoveryStatus.hrv?.let { hrv ->
        if (hrv.available == true) {
          Text("HRV (Heart Rate Variability):", fontSize = 12.sp, color = Color(0xFFB0B0B0))
          Text(
            "${hrv.lastNight} ms - ${hrv.status}",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White
          )
          Spacer(modifier = Modifier.height(12.dp))
        }
      }
      
      // Show Body Battery if available
      recoveryStatus.bodyBattery?.let { battery ->
        if (battery.available == true) {
          Text("Body Battery:", fontSize = 12.sp, color = Color(0xFFB0B0B0))
          Text(
            "${battery.current}/100 - ${battery.status}",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = getBatteryColor(battery.current ?: 50)
          )
          if (!battery.recommendation.isNullOrEmpty()) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
              battery.recommendation,
              fontSize = 12.sp,
              color = Color(0xFFDDDDDD),
              fontStyle = FontStyle.Italic
            )
          }
        }
      }
      
      // Show message if no recovery data
      if (recoveryStatus.availableMetrics.isEmpty()) {
        Text(
          "Recovery data not available on your device",
          fontSize = 12.sp,
          color = Color(0xFF888888)
        )
      }
    }
  }
}
```

---

### **Example 3: Health Metrics Grid - Dynamic Grid Layout**

```kotlin
@Composable
fun HealthMetricsGrid(metrics: HealthMetrics) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp)
  ) {
    Text(
      "HEALTH METRICS",
      fontSize = 16.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White,
      modifier = Modifier.padding(bottom = 12.dp)
    )
    
    // Create grid based on available metrics
    val availableCount = metrics.availableMetrics.size
    
    if (availableCount == 0) {
      Text(
        "No additional health metrics available",
        fontSize = 12.sp,
        color = Color(0xFF888888),
        modifier = Modifier.padding(16.dp)
      )
      return@Column
    }
    
    // Dynamic grid: 1 column if only 1-2 items, 2 columns for 3+
    val columnCount = if (availableCount <= 2) 1 else 2
    
    var itemsInRow = 0
    var currentRow: MutableList<@Composable () -> Unit> = mutableListOf()
    val rows: MutableList<List<@Composable () -> Unit>> = mutableListOf()
    
    // VO2 Max
    if (metrics.availableMetrics.contains("vo2Max") && metrics.vo2Max?.available == true) {
      val item = @Composable {
        metrics.vo2Max?.let {
          MetricCard(
            icon = "🫀",
            label = "VO2 MAX",
            value = "${it.value?.toInt()}",
            unit = "ml/kg/min",
            category = it.category,
            modifier = Modifier.weight(1f)
          )
        }
      }
      currentRow.add(item)
      itemsInRow++
      if (itemsInRow == columnCount) {
        rows.add(currentRow.toList())
        currentRow = mutableListOf()
        itemsInRow = 0
      }
    }
    
    // Fitness Age
    if (metrics.availableMetrics.contains("fitnessAge") && metrics.fitnessAge?.available == true) {
      val item = @Composable {
        metrics.fitnessAge?.let {
          MetricCard(
            icon = "🎂",
            label = "FITNESS AGE",
            value = "${it.value?.toInt()}",
            unit = "years",
            category = it.category,
            modifier = Modifier.weight(1f)
          )
        }
      }
      currentRow.add(item)
      itemsInRow++
      if (itemsInRow == columnCount) {
        rows.add(currentRow.toList())
        currentRow = mutableListOf()
        itemsInRow = 0
      }
    }
    
    // Blood Pressure
    if (metrics.availableMetrics.contains("bloodPressure") && metrics.bloodPressure?.available == true) {
      val item = @Composable {
        metrics.bloodPressure?.let {
          MetricCard(
            icon = "🩸",
            label = "BLOOD PRESSURE",
            value = "${it.systolic}/${it.diastolic}",
            unit = "mmHg",
            subtext = it.classification,
            modifier = Modifier.weight(1f)
          )
        }
      }
      currentRow.add(item)
      itemsInRow++
      if (itemsInRow == columnCount) {
        rows.add(currentRow.toList())
        currentRow = mutableListOf()
        itemsInRow = 0
      }
    }
    
    // SpO2
    if (metrics.availableMetrics.contains("spO2") && metrics.spO2?.available == true) {
      val item = @Composable {
        metrics.spO2?.let {
          MetricCard(
            icon = "🫁",
            label = "OXYGEN LEVEL",
            value = "${it.value}",
            unit = "%",
            category = it.status,
            modifier = Modifier.weight(1f)
          )
        }
      }
      currentRow.add(item)
      itemsInRow++
      if (itemsInRow == columnCount) {
        rows.add(currentRow.toList())
        currentRow = mutableListOf()
        itemsInRow = 0
      }
    }
    
    // Breathing Rate
    if (metrics.availableMetrics.contains("breathingRate") && metrics.breathingRate?.available == true) {
      val item = @Composable {
        metrics.breathingRate?.let {
          MetricCard(
            icon = "🫁",
            label = "BREATHING RATE",
            value = "${it.average?.toInt()}",
            unit = "bpm",
            subtext = "Range: ${it.min?.toInt()}-${it.max?.toInt()}",
            modifier = Modifier.weight(1f)
          )
        }
      }
      currentRow.add(item)
      itemsInRow++
      if (itemsInRow == columnCount) {
        rows.add(currentRow.toList())
        currentRow = mutableListOf()
        itemsInRow = 0
      }
    }
    
    // Skin Temperature
    if (metrics.availableMetrics.contains("skinTemperature") && metrics.skinTemperature?.available == true) {
      val item = @Composable {
        metrics.skinTemperature?.let {
          MetricCard(
            icon = "🌡️",
            label = "SKIN TEMP",
            value = "${it.value}",
            unit = "°C",
            subtext = it.trend,
            modifier = Modifier.weight(1f)
          )
        }
      }
      currentRow.add(item)
      itemsInRow++
      if (itemsInRow == columnCount) {
        rows.add(currentRow.toList())
        currentRow = mutableListOf()
        itemsInRow = 0
      }
    }
    
    // Add remaining items
    if (currentRow.isNotEmpty()) {
      rows.add(currentRow.toList())
    }
    
    // Render rows
    rows.forEach { row ->
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
      ) {
        row.forEach { item ->
          item()
        }
      }
    }
  }
}
```

---

### **Example 4: Trends Charts - Show Only Available Data**

```kotlin
@Composable
fun TrendChartsSection(trends: TrendData) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp)
  ) {
    Text(
      "7-DAY TRENDS",
      fontSize = 16.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White,
      modifier = Modifier.padding(bottom = 12.dp)
    )
    
    // Only show charts for data that exists
    var chartCount = 0
    
    // Sleep Trend - show if we have data
    if (trends.sleepDuration.isNotEmpty()) {
      TrendChart(
        title = "Sleep Duration",
        data = trends.sleepDuration,
        dates = trends.dates,
        unit = "hours",
        color = Color(0xFF7AA3E5)
      )
      chartCount++
      if (chartCount > 0) Spacer(modifier = Modifier.height(16.dp))
    }
    
    // Stress Trend - show if we have data
    if (trends.avgStress.isNotEmpty()) {
      TrendChart(
        title = "Average Stress",
        data = trends.avgStress,
        dates = trends.dates,
        unit = "level",
        color = Color(0xFFFF9900),
        maxValue = 100f
      )
      chartCount++
      if (chartCount > 0) Spacer(modifier = Modifier.height(16.dp))
    }
    
    // VO2 Max Trend - show if we have data
    if (trends.vo2Max.isNotEmpty()) {
      TrendChart(
        title = "VO2 Max",
        data = trends.vo2Max,
        dates = trends.dates,
        unit = "ml/kg/min",
        color = Color(0xFF00FF88)
      )
      chartCount++
      if (chartCount > 0) Spacer(modifier = Modifier.height(16.dp))
    }
    
    // Body Battery Trend - show if we have data
    if (trends.bodyBattery.isNotEmpty()) {
      TrendChart(
        title = "Body Battery",
        data = trends.bodyBattery,
        dates = trends.dates,
        unit = "level",
        color = Color(0xFF00D4FF),
        maxValue = 100f
      )
      chartCount++
    }
    
    // Show message if no trend data
    if (chartCount == 0) {
      Text(
        "Not enough data to show trends yet. Check back after more data is synced.",
        fontSize = 12.sp,
        color = Color(0xFF888888),
        modifier = Modifier.padding(16.dp)
      )
    }
  }
}
```

---

## 📱 Empty State Screens

### **No Data Available**

```kotlin
@Composable
fun HealthInsightsEmptyState() {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(Color(0xFF0F0F0F))
      .padding(24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Icon(
      painter = painterResource(id = R.drawable.ic_health),
      contentDescription = "Health",
      modifier = Modifier.size(64.dp),
      tint = Color(0xFF666666)
    )
    
    Spacer(modifier = Modifier.height(24.dp))
    
    Text(
      "No Health Data Yet",
      fontSize = 18.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White
    )
    
    Spacer(modifier = Modifier.height(12.dp))
    
    Text(
      "Connect a Garmin device to start tracking your health metrics including sleep, stress, and heart rate.",
      textAlign = TextAlign.Center,
      color = Color(0xFF888888),
      fontSize = 14.sp
    )
    
    Spacer(modifier = Modifier.height(32.dp))
    
    Button(
      onClick = { /* Navigate to settings */ },
      modifier = Modifier
        .fillMaxWidth()
        .height(44.dp),
      colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFF00D4FF))
    ) {
      Text("Connect Device", color = Color(0xFF000000), fontWeight = FontWeight.SemiBold)
    }
  }
}
```

---

## 🎯 Responsive Design Rules

### **Metric Visibility Rules**

```kotlin
// A metric should only be shown if:
// 1. It exists in the availableMetrics list
// 2. Its value is not null/undefined
// 3. It has meaningful data (not zero or default placeholder)

fun shouldShowMetric(
  metricName: String,
  availableMetrics: List<String>,
  value: Number?
): Boolean {
  return availableMetrics.contains(metricName) && 
         value != null && 
         (value as? Double)?.let { it != 0.0 } ?: true
}
```

### **Row Layout Rules**

```kotlin
// Adaptive grid based on data count:
// 0 items: Empty state
// 1 item: Single column, full width
// 2 items: 1x2 grid
// 3-4 items: 2x2 grid
// 5+ items: 2+ columns dynamic wrap

fun calculateColumnCount(itemCount: Int): Int {
  return when {
    itemCount <= 2 -> 1
    itemCount <= 4 -> 2
    else -> 3
  }
}
```

---

## ✅ Best Practices

1. **Always check `availableMetrics`** before rendering a metric
2. **Use null coalescing** (`?:`) to provide fallbacks
3. **Show placeholders** with helpful messages when data is unavailable
4. **Don't pad with zeros** - use actual data only
5. **Dynamically size grids** based on item count
6. **Test with minimal data** to ensure graceful degradation
7. **Provide helpful onboarding** explaining what data is available

---

## 🧪 Testing Scenarios

### **Test Case 1: User with minimal device (Vivofit)**
```
Available: [heartRate]
Show: Only HR metric, hide sleep/stress/battery
Expect: Single card with just HR
```

### **Test Case 2: User with intermediate device (Vivo Active)**
```
Available: [heartRate, sleep, battery]
Show: Snapshot (HR, Sleep, Battery), Sleep section, Recovery
Hide: Stress, VO2Max, Breathing, Temperature
Expect: Focused dashboard with 3 metrics
```

### **Test Case 3: User with advanced device (Fenix)**
```
Available: All metrics
Show: Complete dashboard
Expect: Full featured experience
```

### **Test Case 4: New user**
```
Available: []
Show: Empty state screen
Expect: Onboarding to connect device
```

---

## 🚀 Implementation Checklist

- [ ] Update all data models to include `availableMetrics` array
- [ ] Add null checks before rendering each metric
- [ ] Create placeholder/empty state components
- [ ] Implement dynamic grid layout for metrics
- [ ] Test with different data combinations
- [ ] Add helpful messages for missing data
- [ ] Create onboarding flow for new users
- [ ] Test trend charts with sparse data
- [ ] Verify graceful degradation with minimal data
- [ ] Document supported device types and their metrics

---

This adaptive approach ensures your Health Insights tab provides an excellent experience for every user, regardless of their Garmin device capabilities! 🎯
