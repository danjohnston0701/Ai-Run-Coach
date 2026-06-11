# Subscription Integration Examples

Copy-paste examples for integrating subscriptions into your AiRunCoach app.

---

## 1. Navigation Setup

### In Your Main Navigation File

```kotlin
import androidx.navigation.compose.composable
import live.airuncoach.airuncoach.ui.screens.SubscriptionScreen

// Add this to your NavHost composable
composable("subscription_screen") {
    SubscriptionScreen(
        onBackClick = { navController.popBackStack() }
    )
}
```

---

## 2. Add Button to DashboardScreen

### Quick Addition

```kotlin
// In DashboardScreen.kt, add this button somewhere visible
Button(
    onClick = { navController.navigate("subscription_screen") },
    modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp),
    colors = ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.primary
    )
) {
    Text("🚀 Unlock Premium Features")
}
```

### Styled Premium Button

```kotlin
Surface(
    modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp)
        .background(
            brush = Brush.linearGradient(
                colors = listOf(
                    Color(0xFFFF6B6B),
                    Color(0xFFFFD93D)
                )
            ),
            shape = RoundedCornerShape(12.dp)
        )
        .clickable { navController.navigate("subscription_screen") },
    shape = RoundedCornerShape(12.dp)
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "✨ Go Premium - Unlock AI Coaching",
            fontWeight = FontWeight.Bold,
            color = Color.White,
            fontSize = 16.sp
        )
    }
}
```

---

## 3. Feature Gate Example - Limit Free Users

### In Your Coaching ViewModel

```kotlin
@HiltViewModel
class CoachingSessionViewModel @Inject constructor(
    private val subscriptionViewModel: SubscriptionViewModel,
    private val apiService: ApiService
) : ViewModel() {
    
    suspend fun startCoachingSession(): Result<CoachingSession> {
        // Check if user exceeded free tier limit
        val userSessions = getUserSessionCount()
        
        if (userSessions >= 3 && !subscriptionViewModel.isPremiumUser()) {
            return Result.failure(
                Exception("Free tier limited to 3 sessions. Upgrade to Premium!")
            )
        }
        
        // Proceed with coaching session
        return apiService.startCoachingSession()
    }
}
```

### Display Upgrade Prompt When Limit Reached

```kotlin
@Composable
fun CoachingScreen(
    viewModel: CoachingSessionViewModel = hiltViewModel(),
    subscriptionViewModel: SubscriptionViewModel = hiltViewModel(),
    navController: NavController
) {
    var limitReached by remember { mutableStateOf(false) }
    
    if (limitReached && !subscriptionViewModel.isPremiumUser()) {
        // Show upgrade dialog
        AlertDialog(
            onDismissRequest = { limitReached = false },
            title = { Text("Free Tier Limit Reached") },
            text = { 
                Text(
                    "You've used 3 free coaching sessions. " +
                    "Upgrade to Premium for unlimited sessions!"
                )
            },
            confirmButton = {
                Button(
                    onClick = { navController.navigate("subscription_screen") }
                ) {
                    Text("Upgrade Now")
                }
            },
            dismissButton = {
                Button(onClick = { limitReached = false }) {
                    Text("Not Now")
                }
            }
        )
    } else {
        // Normal coaching screen
        CoachingContent()
    }
}
```

---

## 4. Conditional Feature Display

### Hide Advanced Features Behind Premium

```kotlin
@Composable
fun AnalyticsScreen(
    subscriptionViewModel: SubscriptionViewModel = hiltViewModel(),
    navController: NavController
) {
    val isPremium = subscriptionViewModel.isPremiumUser()
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Free features - always show
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("📈 Basic Stats", fontWeight = FontWeight.Bold)
                Text("Total runs: ${getUserRunCount()}")
                Text("Total distance: ${getTotalDistance()} km")
            }
        }
        
        // Premium features - show or lock
        if (isPremium) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("⭐ Advanced Analytics", fontWeight = FontWeight.Bold)
                    Text("Pace trends: Improving 5% this month")
                    Text("Heart rate zones: Perfect form detected!")
                    Text("Injury risk: Low - keep it up!")
                }
            }
        } else {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("🔒 Advanced Analytics", fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Unlock AI-powered pace trends, heart rate analysis, and injury prevention tips",
                        textAlign = TextAlign.Center,
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = { navController.navigate("subscription_screen") },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Upgrade to Premium")
                    }
                }
            }
        }
    }
}
```

---

## 5. User Settings - Show Current Subscription

### In Settings Screen

```kotlin
@Composable
fun SettingsScreen(
    subscriptionViewModel: SubscriptionViewModel = hiltViewModel(),
    navController: NavController
) {
    val isPremium = subscriptionViewModel.isPremiumUser()
    val activeSubscriptionId = subscriptionViewModel.getActiveSubscriptionId()
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Settings", fontSize = 24.sp, fontWeight = FontWeight.Bold)
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Subscription status
        if (isPremium) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("✅ Premium Subscriber", fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Current plan: $activeSubscriptionId")
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Manage your subscription in Google Play Store settings",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
            }
        } else {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("No active subscription", fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = { navController.navigate("subscription_screen") },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Browse Plans")
                    }
                }
            }
        }
        
        // Other settings...
        Text("Account", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        // ... more settings items
    }
}
```

---

## 6. Check Premium Status Before Enabling Features

### In Your API Service

```kotlin
@HiltViewModel
class TrainingPlanViewModel @Inject constructor(
    private val apiService: ApiService,
    private val subscriptionViewModel: SubscriptionViewModel
) : ViewModel() {
    
    suspend fun generateAITrainingPlan(preferences: PlanPreferences): Result<TrainingPlan> {
        // Only allow advanced AI features for premium users
        if (!subscriptionViewModel.isPremiumUser()) {
            return Result.failure(
                Exception("AI Training Plans require Premium subscription")
            )
        }
        
        return try {
            val plan = apiService.generatePlan(preferences)
            Result.success(plan)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```

---

## 7. Show Feature Lock UI

### Reusable Premium Feature Card Component

```kotlin
@Composable
fun PremiumFeatureCard(
    title: String,
    description: String,
    icon: @Composable () -> Unit = {},
    isPremium: Boolean,
    onUpgradeClick: () -> Unit = {}
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isPremium)
                MaterialTheme.colorScheme.tertiaryContainer
            else
                MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        icon()
                        Text(
                            title,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        )
                        if (!isPremium) {
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("🔒", fontSize = 14.sp)
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        description,
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                }
            }
            
            if (!isPremium) {
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = onUpgradeClick,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Unlock with Premium")
                }
            }
        }
    }
}

// Usage:
PremiumFeatureCard(
    title = "AI Coach",
    description = "Get personalized coaching during your runs",
    isPremium = subscriptionViewModel.isPremiumUser(),
    onUpgradeClick = { navController.navigate("subscription_screen") }
)
```

---

## 8. Backend Purchase Validation Example

### In Your API Service

```kotlin
suspend fun validateSubscriptionPurchase(
    productId: String,
    purchaseToken: String
): Boolean {
    return try {
        val response = apiService.post(
            "/api/subscriptions/validate",
            body = mapOf(
                "productId" to productId,
                "purchaseToken" to purchaseToken
            )
        )
        response.isSuccessful
    } catch (e: Exception) {
        false
    }
}
```

### Call After Purchase

```kotlin
// In BillingManager or your app startup
subscriptionViewModel.userPurchases.collect { purchases ->
    purchases.forEach { purchase ->
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            // Validate with backend
            val isValid = validateSubscriptionPurchase(
                productId = purchase.products.first(),
                purchaseToken = purchase.purchaseToken
            )
            
            if (isValid) {
                // Grant access on your backend
                updateUserPremiumStatus(isPremium = true)
            }
        }
    }
}
```

---

## Quick Copy-Paste Checklist

- [ ] Added `SubscriptionScreen` to navigation
- [ ] Added "Go Premium" button to UI
- [ ] Wrapped premium features with `subscriptionViewModel.isPremiumUser()` checks
- [ ] Added upgrade prompts near feature gates
- [ ] Added subscription status to settings page
- [ ] Implemented backend purchase validation
- [ ] Tested with test account

You're ready to launch subscriptions! 🚀
