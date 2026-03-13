# Health Insights Tab - Frontend Implementation Guide

## 📱 Frontend Architecture

### **Tech Stack**
- **Framework**: Jetpack Compose (Android)
- **State Management**: ViewModel + Flow
- **API Client**: Retrofit + OkHttp
- **Charts**: MPAndroidChart or Compose Charts
- **Storage**: Room DB for local caching

---

## 🏗️ Component Structure

```
HealthInsightsScreen/
├── HealthInsightsViewModel
├── Composables/
│   ├── HealthSnapshotCard
│   ├── SleepRecoverySection
│   ├── DailyWellnessSection
│   ├── HealthMetricsGrid
│   ├── TrendChartsSection
│   ├── InsightsPanel
│   └── DetailSheets/
│       ├── SleepDetailSheet
│       ├── StressDetailSheet
│       ├── RecoveryDetailSheet
│       └── MetricsDetailSheet
├── Services/
│   └── HealthInsightsApiClient
└── Models/
    ├── HealthSnapshot
    ├── SleepDetails
    ├── RecoveryStatus
    ├── etc...
```

---

## 🔌 API Integration

### **Health Insights API Endpoints**

```kotlin
// Health Insights API Client
interface HealthInsightsApiClient {
  
  @GET("/api/health/today")
  suspend fun getTodaySnapshot(): HealthSnapshot
  
  @GET("/api/health/sleep")
  suspend fun getSleepDetails(@Query("date") date: String): SleepDetails
  
  @GET("/api/health/recovery")
  suspend fun getRecoveryStatus(): RecoveryStatus
  
  @GET("/api/health/daily")
  suspend fun getDailyWellness(@Query("date") date: String): DailyWellness
  
  @GET("/api/health/metrics")
  suspend fun getHealthMetrics(): HealthMetrics
  
  @GET("/api/health/insights")
  suspend fun getHealthInsights(): List<HealthInsight>
  
  @GET("/api/health/trends")
  suspend fun getTrendData(@Query("days") days: Int = 7): TrendData
}
```

---

## 🎨 Component Implementation Examples

### **1. Health Snapshot Card**

```kotlin
@Composable
fun HealthSnapshotCard(snapshot: HealthSnapshot) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .padding(16.dp),
    shape = RoundedCornerShape(16.dp),
    backgroundColor = Color(0xFF1A1A1A),
    elevation = 4.dp
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
      
      // Heart Rate
      HealthMetricRow(
        icon = "❤️",
        label = "Avg HR",
        value = "${snapshot.avgHeartRate} bpm"
      )
      
      // Sleep
      HealthMetricRow(
        icon = "😴",
        label = "Sleep",
        value = "${snapshot.sleepDuration / 3600}h (Score: ${snapshot.sleepScore})"
      )
      
      // Stress
      HealthMetricRow(
        icon = "😰",
        label = "Stress",
        value = "${snapshot.avgStressLevel}/100",
        statusColor = getStressColor(snapshot.avgStressLevel)
      )
      
      // Battery
      HealthMetricRow(
        icon = "🔋",
        label = "Battery",
        value = "${snapshot.bodyBatteryLevel}/100",
        statusColor = getBatteryColor(snapshot.bodyBatteryLevel)
      )
    }
  }
}

@Composable
fun HealthMetricRow(
  icon: String,
  label: String,
  value: String,
  statusColor: Color = Color(0xFF00D4FF)
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(vertical = 8.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.SpaceBetween
  ) {
    Row(
      verticalAlignment = Alignment.CenterVertically
    ) {
      Text(icon, fontSize = 20.sp)
      Spacer(modifier = Modifier.width(8.dp))
      Text(label, color = Color(0xFFB0B0B0))
    }
    Text(
      value,
      color = statusColor,
      fontWeight = FontWeight.SemiBold
    )
  }
}

fun getStressColor(stress: Int): Color = when {
  stress < 30 -> Color(0xFF00FF88)  // Green - Low
  stress < 50 -> Color(0xFFFFFF00)  // Yellow - Moderate
  else -> Color(0xFFFF5555)         // Red - High
}

fun getBatteryColor(battery: Int): Color = when {
  battery > 75 -> Color(0xFF00FF88)  // Green
  battery > 50 -> Color(0xFFFFFF00)  // Yellow
  else -> Color(0xFFFF5555)          // Red
}
```

---

### **2. Sleep & Recovery Section**

```kotlin
@Composable
fun SleepRecoverySection(
  sleepDetails: SleepDetails?,
  recoveryStatus: RecoveryStatus?,
  modifier: Modifier = Modifier
) {
  Column(modifier = modifier) {
    // Sleep Quality Card
    if (sleepDetails != null) {
      SleepQualityCard(sleepDetails)
      Spacer(modifier = Modifier.height(12.dp))
    }
    
    // Recovery Status Card
    if (recoveryStatus != null) {
      RecoveryStatusCard(recoveryStatus)
    }
    
    // Sleep History Chart (7-day)
    Spacer(modifier = Modifier.height(16.dp))
    SleepHistoryChart()
  }
}

@Composable
fun SleepQualityCard(sleep: SleepDetails) {
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
        RatingBadge(sleep.score)
      }
      
      Spacer(modifier = Modifier.height(12.dp))
      
      // Duration
      SleepMetricRow("Duration", formatDuration(sleep.totalDuration))
      
      // Sleep Stages Breakdown
      Spacer(modifier = Modifier.height(12.dp))
      Text("Sleep Stages", fontSize = 12.sp, color = Color(0xFFB0B0B0))
      
      SleepStageBar(
        label = "Deep",
        percentage = sleep.deepPercentage,
        color = Color(0xFF4A6FA5),
        duration = formatDuration(sleep.deepSleep)
      )
      
      SleepStageBar(
        label = "Light",
        percentage = sleep.lightPercentage,
        color = Color(0xFF7AA3E5),
        duration = formatDuration(sleep.lightSleep)
      )
      
      SleepStageBar(
        label = "REM",
        percentage = sleep.remPercentage,
        color = Color(0xFFB5D6FF),
        duration = formatDuration(sleep.remSleep)
      )
      
      // Quality Ratings
      Spacer(modifier = Modifier.height(16.dp))
      QualityRatingsGrid(sleep.qualityRatings)
    }
  }
}

@Composable
fun SleepStageBar(
  label: String,
  percentage: Double,
  color: Color,
  duration: String
) {
  Column {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(vertical = 4.dp),
      horizontalArrangement = Arrangement.SpaceBetween
    ) {
      Text(label, fontSize = 12.sp, color = Color(0xFFB0B0B0))
      Text(duration, fontSize = 12.sp, color = Color.White)
    }
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .height(8.dp)
        .background(Color(0xFF333333), RoundedCornerShape(4.dp))
    ) {
      Box(
        modifier = Modifier
          .fillMaxHeight()
          .fillMaxWidth(percentage.toFloat() / 100f)
          .background(color, RoundedCornerShape(4.dp))
      )
    }
  }
}

@Composable
fun RatingBadge(score: Int) {
  val (color, label) = when {
    score >= 80 -> Color(0xFF00FF88) to "EXCELLENT"
    score >= 60 -> Color(0xFFFFFF00) to "GOOD"
    else -> Color(0xFFFF5555) to "FAIR"
  }
  
  Surface(
    modifier = Modifier
      .background(color.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
      .padding(8.dp),
    color = Color.Transparent
  ) {
    Text(
      "$score/100 - $label",
      color = color,
      fontSize = 12.sp,
      fontWeight = FontWeight.Bold
    )
  }
}
```

---

### **3. Health Metrics Grid**

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
    
    // Cardiovascular Health Row
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(bottom = 12.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      metrics.vo2Max?.let {
        MetricCard(
          icon = "🫀",
          label = "VO2 MAX",
          value = "${it.value.toInt()}",
          unit = "ml/kg/min",
          category = it.category,
          modifier = Modifier.weight(1f)
        )
      }
      
      metrics.fitnessAge?.let {
        MetricCard(
          icon = "🎂",
          label = "FITNESS AGE",
          value = "${it.value.toInt()}",
          unit = "years",
          category = it.category,
          modifier = Modifier.weight(1f)
        )
      }
    }
    
    // Blood Pressure & SpO2 Row
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(bottom = 12.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
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
    
    // Respiratory & Temperature Row
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      metrics.breathingRate?.let {
        MetricCard(
          icon = "🫁",
          label = "BREATHING RATE",
          value = "${it.average.toInt()}",
          unit = "bpm",
          subtext = "Range: ${it.min.toInt()}-${it.max.toInt()}",
          modifier = Modifier.weight(1f)
        )
      }
      
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
  }
}

@Composable
fun MetricCard(
  icon: String,
  label: String,
  value: String,
  unit: String,
  category: String? = null,
  subtext: String? = null,
  modifier: Modifier = Modifier
) {
  Card(
    modifier = modifier
      .aspectRatio(1f)
      .background(Color(0xFF1A1A1A), RoundedCornerShape(12.dp)),
    shape = RoundedCornerShape(12.dp),
    backgroundColor = Color(0xFF1A1A1A),
    elevation = 2.dp
  ) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(12.dp),
      verticalArrangement = Arrangement.SpaceBetween
    ) {
      Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
        modifier = Modifier.fillMaxWidth()
      ) {
        Text(icon, fontSize = 20.sp)
      }
      
      Column {
        Text(label, fontSize = 10.sp, color = Color(0xFF888888))
        Text(value, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text(unit, fontSize = 10.sp, color = Color(0xFF00D4FF))
        
        if (category != null) {
          Text(
            category,
            fontSize = 9.sp,
            color = getCategoryColor(category),
            fontWeight = FontWeight.SemiBold
          )
        }
        
        if (subtext != null) {
          Text(subtext, fontSize = 9.sp, color = Color(0xFF888888))
        }
      }
    }
  }
}

fun getCategoryColor(category: String): Color = when {
  category.contains("EXCELLENT") -> Color(0xFF00FF88)
  category.contains("GOOD") -> Color(0xFFFFFF00)
  category.contains("STABLE") -> Color(0xFF00D4FF)
  category.contains("ELEVATED") -> Color(0xFFFF9900)
  category.contains("LOW") || category.contains("BELOW") -> Color(0xFFFF5555)
  else -> Color(0xFFB0B0B0)
}
```

---

### **4. Trends Chart**

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
    
    // Sleep Duration Trend
    TrendChart(
      title = "Sleep Duration",
      data = trends.sleepDuration,
      dates = trends.dates,
      unit = "hours",
      color = Color(0xFF7AA3E5)
    )
    
    Spacer(modifier = Modifier.height(16.dp))
    
    // Stress Trend
    TrendChart(
      title = "Average Stress",
      data = trends.avgStress,
      dates = trends.dates,
      unit = "level",
      color = Color(0xFFFF9900),
      maxValue = 100f
    )
    
    Spacer(modifier = Modifier.height(16.dp))
    
    // VO2 Max Trend
    if (trends.vo2Max.isNotEmpty()) {
      TrendChart(
        title = "VO2 Max",
        data = trends.vo2Max,
        dates = trends.dates,
        unit = "ml/kg/min",
        color = Color(0xFF00FF88)
      )
    }
  }
}

@Composable
fun TrendChart(
  title: String,
  data: List<Double>,
  dates: List<String>,
  unit: String,
  color: Color,
  maxValue: Float? = null
) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .height(200.dp),
    shape = RoundedCornerShape(12.dp),
    backgroundColor = Color(0xFF1A1A1A)
  ) {
    Column(modifier = Modifier.padding(16.dp)) {
      Text(title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
      Spacer(modifier = Modifier.height(12.dp))
      
      // In a real app, integrate MPAndroidChart or Compose Charts here
      SimpleLineChart(
        data = data,
        color = color,
        modifier = Modifier
          .fillMaxWidth()
          .height(120.dp)
      )
      
      // Date range
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(top = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
      ) {
        Text(dates.firstOrNull() ?: "", fontSize = 10.sp, color = Color(0xFF888888))
        Text(dates.lastOrNull() ?: "", fontSize = 10.sp, color = Color(0xFF888888))
      }
    }
  }
}

@Composable
fun SimpleLineChart(
  data: List<Double>,
  color: Color,
  modifier: Modifier = Modifier
) {
  // Use MPAndroidChart or Compose Charts library
  // This is a placeholder showing structure
  Canvas(modifier = modifier) {
    if (data.isEmpty()) return@Canvas
    
    val width = size.width
    val height = size.height
    val maxValue = data.maxOrNull() ?: 0.0
    
    for (i in 0 until data.size - 1) {
      val x1 = (i / (data.size - 1).toFloat()) * width
      val y1 = height - (data[i] / maxValue.toFloat()) * height
      val x2 = ((i + 1) / (data.size - 1).toFloat()) * width
      val y2 = height - (data[i + 1] / maxValue.toFloat()) * height
      
      drawLine(
        color = color,
        start = Offset(x1, y1.toFloat()),
        end = Offset(x2, y2.toFloat()),
        strokeWidth = 2f
      )
    }
  }
}
```

---

### **5. AI Insights Panel**

```kotlin
@Composable
fun InsightsPanel(insights: List<HealthInsight>) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp)
  ) {
    Text(
      "🤖 HEALTH INSIGHTS",
      fontSize = 16.sp,
      fontWeight = FontWeight.Bold,
      color = Color.White,
      modifier = Modifier.padding(bottom = 12.dp)
    )
    
    insights.take(3).forEach { insight ->
      InsightCard(insight)
      Spacer(modifier = Modifier.height(12.dp))
    }
  }
}

@Composable
fun InsightCard(insight: HealthInsight) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .clip(RoundedCornerShape(12.dp))
      .background(getInsightBackgroundColor(insight.category)),
    shape = RoundedCornerShape(12.dp),
    backgroundColor = getInsightBackgroundColor(insight.category),
    elevation = 2.dp
  ) {
    Column(modifier = Modifier.padding(12.dp)) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
      ) {
        Text(
          "💡 ${insight.title}",
          fontSize = 13.sp,
          fontWeight = FontWeight.Bold,
          color = Color.White,
          modifier = Modifier.weight(1f)
        )
        if (insight.priority == 1) {
          Surface(
            modifier = Modifier
              .background(Color(0xFFFF5555), RoundedCornerShape(4.dp))
              .padding(4.dp),
            color = Color(0xFFFF5555)
          ) {
            Text("!", fontSize = 10.sp, color = Color.White)
          }
        }
      }
      
      Text(
        insight.description,
        fontSize = 12.sp,
        color = Color(0xFFE0E0E0),
        modifier = Modifier
          .padding(top = 8.dp)
          .fillMaxWidth()
      )
      
      if (insight.actionable && insight.action != null) {
        Button(
          onClick = { /* Handle action */ },
          modifier = Modifier
            .padding(top = 8.dp)
            .height(32.dp),
          colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFF00D4FF))
        ) {
          Text(insight.action, fontSize = 11.sp, color = Color(0xFF000000))
        }
      }
    }
  }
}

fun getInsightBackgroundColor(category: String): Color = when (category) {
  "recovery" -> Color(0xFF1A2A3A)
  "cardiovascular" -> Color(0xFF3A1A1A)
  "breathing" -> Color(0xFF1A2A3A)
  "pregnancy" -> Color(0xFF2A1A3A)
  else -> Color(0xFF1A1A1A)
}
```

---

## 📱 ViewModel Implementation

```kotlin
class HealthInsightsViewModel(
  private val healthApiClient: HealthInsightsApiClient
) : ViewModel() {
  
  private val _snapshot = MutableStateFlow<HealthSnapshot?>(null)
  val snapshot = _snapshot.asStateFlow()
  
  private val _sleepDetails = MutableStateFlow<SleepDetails?>(null)
  val sleepDetails = _sleepDetails.asStateFlow()
  
  private val _recovery = MutableStateFlow<RecoveryStatus?>(null)
  val recovery = _recovery.asStateFlow()
  
  private val _metrics = MutableStateFlow<HealthMetrics?>(null)
  val metrics = _metrics.asStateFlow()
  
  private val _insights = MutableStateFlow<List<HealthInsight>>(emptyList())
  val insights = _insights.asStateFlow()
  
  private val _trends = MutableStateFlow<TrendData?>(null)
  val trends = _trends.asStateFlow()
  
  private val _isLoading = MutableStateFlow(false)
  val isLoading = _isLoading.asStateFlow()
  
  fun loadAllHealthData() = viewModelScope.launch {
    _isLoading.value = true
    try {
      _snapshot.value = healthApiClient.getTodaySnapshot()
      _sleepDetails.value = healthApiClient.getSleepDetails("")
      _recovery.value = healthApiClient.getRecoveryStatus()
      _metrics.value = healthApiClient.getHealthMetrics()
      _insights.value = healthApiClient.getHealthInsights()
      _trends.value = healthApiClient.getTrendData()
    } catch (e: Exception) {
      // Handle error
      Log.e("HealthInsights", "Error loading data", e)
    } finally {
      _isLoading.value = false
    }
  }
}
```

---

## 🎨 Screen Integration

```kotlin
@Composable
fun HealthInsightsScreen(viewModel: HealthInsightsViewModel) {
  val snapshot by viewModel.snapshot.collectAsState()
  val sleepDetails by viewModel.sleepDetails.collectAsState()
  val recovery by viewModel.recovery.collectAsState()
  val dailyWellness by viewModel.dailyWellness.collectAsState()
  val metrics by viewModel.metrics.collectAsState()
  val insights by viewModel.insights.collectAsState()
  val trends by viewModel.trends.collectAsState()
  val isLoading by viewModel.isLoading.collectAsState()
  
  LaunchedEffect(Unit) {
    viewModel.loadAllHealthData()
  }
  
  if (isLoading) {
    Box(
      modifier = Modifier.fillMaxSize(),
      contentAlignment = Alignment.Center
    ) {
      CircularProgressIndicator(color = Color(0xFF00D4FF))
    }
  } else {
    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .background(Color(0xFF0F0F0F)),
      contentPadding = PaddingValues(vertical = 16.dp)
    ) {
      item {
        if (snapshot != null) {
          HealthSnapshotCard(snapshot!!)
        }
      }
      
      item {
        if (sleepDetails != null || recovery != null) {
          SleepRecoverySection(sleepDetails, recovery)
        }
      }
      
      item {
        if (dailyWellness != null) {
          DailyWellnessSection(dailyWellness!!)
        }
      }
      
      item {
        if (metrics != null) {
          HealthMetricsGrid(metrics!!)
        }
      }
      
      item {
        if (trends != null) {
          TrendChartsSection(trends!!)
        }
      }
      
      item {
        if (insights.isNotEmpty()) {
          InsightsPanel(insights)
        }
      }
      
      item {
        Spacer(modifier = Modifier.height(32.dp))
      }
    }
  }
}
```

---

## 📲 Data Models

All models should match the backend response types:

```kotlin
// HealthSnapshot.kt
data class HealthSnapshot(
  val date: String,
  val avgHeartRate: Int,
  val sleepScore: Int,
  val sleepDuration: Long,
  val avgStressLevel: Int,
  val bodyBatteryLevel: Int,
  val avgBreathingRate: Double,
  val skinTemperature: Double,
  val vo2Max: Double?,
  val fitnessAge: Int?
)

// SleepDetails.kt
data class SleepDetails(
  val date: String,
  val totalDuration: Long,
  val score: Int,
  val deepSleep: Long,
  val lightSleep: Long,
  val remSleep: Long,
  val awakeTime: Long,
  val deepPercentage: Double,
  val lightPercentage: Double,
  val remPercentage: Double,
  val napCount: Int,
  val totalNapDuration: Long,
  val qualityRatings: QualityRatings
)

// RecoveryStatus.kt
data class RecoveryStatus(
  val hrv: HRVData,
  val bodyBattery: BatteryData
)

data class HRVData(
  val lastNight: Int,
  val status: String,
  val trend: String
)

data class BatteryData(
  val current: Int,
  val status: String,
  val trend: String,
  val recommendation: String
)

// Similar for other models...
```

---

This guide provides everything needed to build a beautiful, functional Health Insights tab that leverages all Garmin wellness data!
