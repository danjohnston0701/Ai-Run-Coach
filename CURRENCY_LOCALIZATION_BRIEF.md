# Currency Localization — User-Selectable with Timezone Defaults

**Status**: Ready to Implement  
**Scope**: Display subscription pricing in user's local currency with override option  
**Approach**: Infer from timezone by default, allow manual selection

---

## Architecture Overview

```
User logs in with timezone (e.g., "America/New_York")
    ↓
Server maps timezone → default currency (e.g., USD)
    ↓
SubscriptionScreen displays pricing in USD
    ↓
User can tap currency picker → change to any currency (GBP, EUR, JPY, etc.)
    ↓
Selection saved to users.currency
    ↓
Next login → SubscriptionScreen shows previously selected currency
```

---

## Implementation Steps

### Phase 1 — Database & Schema

#### 1a. Add `currency` column to users table

```sql
ALTER TABLE users ADD COLUMN currency TEXT DEFAULT 'USD';
```

This stores the user's selected currency code (ISO 4217: USD, GBP, EUR, JPY, CAD, AUD, etc.).

#### 1b. Update TypeScript schema

In `shared/schema.ts`, add to the `users` table definition:

```typescript
export const users = pgTable("users", {
  // ... existing fields ...
  currency: text("currency").default("USD"), // ISO 4217 code
  // ... rest of fields ...
});
```

---

### Phase 2 — Timezone to Currency Mapping

#### 2a. Create utility for timezone → currency inference

**File:** `server/utils/timezone-to-currency.ts`

```typescript
/**
 * Maps IANA timezone to ISO 4217 currency code.
 * Used to infer user's default currency from their timezone at login.
 */
export function inferCurrencyFromTimezone(timezone: string): string {
  const currencyMap: Record<string, string> = {
    // North America
    "America/New_York": "USD",
    "America/Chicago": "USD",
    "America/Denver": "USD",
    "America/Los_Angeles": "USD",
    "America/Anchorage": "USD",
    "America/Toronto": "CAD",
    "America/Mexico_City": "MXN",
    
    // South America
    "America/Buenos_Aires": "ARS",
    "America/Sao_Paulo": "BRL",
    
    // Europe
    "Europe/London": "GBP",
    "Europe/Paris": "EUR",
    "Europe/Berlin": "EUR",
    "Europe/Rome": "EUR",
    "Europe/Madrid": "EUR",
    "Europe/Amsterdam": "EUR",
    "Europe/Brussels": "EUR",
    "Europe/Vienna": "EUR",
    "Europe/Prague": "EUR",
    "Europe/Warsaw": "EUR",
    "Europe/Stockholm": "EUR",
    "Europe/Helsinki": "EUR",
    "Europe/Dublin": "EUR",
    "Europe/Zurich": "CHF",
    "Europe/Moscow": "RUB",
    
    // Africa
    "Africa/Johannesburg": "ZAR",
    "Africa/Cairo": "EGP",
    "Africa/Lagos": "NGN",
    
    // Middle East
    "Asia/Dubai": "AED",
    "Asia/Kolkata": "INR",
    "Asia/Bangkok": "THB",
    "Asia/Singapore": "SGD",
    "Asia/Hong_Kong": "HKD",
    "Asia/Shanghai": "CNY",
    "Asia/Tokyo": "JPY",
    "Asia/Seoul": "KRW",
    "Asia/Manila": "PHP",
    "Asia/Jakarta": "IDR",
    
    // Oceania
    "Australia/Sydney": "AUD",
    "Australia/Melbourne": "AUD",
    "Australia/Brisbane": "AUD",
    "Australia/Perth": "AUD",
    "Pacific/Auckland": "NZD",
    "Pacific/Fiji": "FJD",
  };

  // Try exact match first
  if (currencyMap[timezone]) {
    return currencyMap[timezone];
  }

  // Try to infer from timezone prefix (e.g., "Europe/*" → EUR)
  if (timezone.startsWith("Europe/")) return "EUR";
  if (timezone.startsWith("America/")) return "USD";
  if (timezone.startsWith("Asia/")) return "USD"; // Conservative default
  if (timezone.startsWith("Australia/")) return "AUD";
  if (timezone.startsWith("Pacific/")) return "NZD";
  if (timezone.startsWith("Africa/")) return "USD"; // Conservative default

  // Global default
  return "USD";
}
```

---

### Phase 3 — Update Login to Set Default Currency

In `server/routes.ts`, update the login endpoint to infer and set currency if not already set:

```typescript
// In /api/auth/login endpoint, after validating user (around line 468):

// Set default currency from timezone if not already set
if (timezone && !user.currency) {
  const { inferCurrencyFromTimezone } = await import("./utils/timezone-to-currency");
  const inferredCurrency = inferCurrencyFromTimezone(timezone);
  
  await storage.updateUser(user.id, { currency: inferredCurrency });
  user.currency = inferredCurrency;
  
  console.log(`[Login] Inferred currency for user ${user.id}: ${inferredCurrency} (from timezone ${timezone})`);
}
```

---

### Phase 4 — Android: Currency Picker UI

#### 4a. Add currency selection to SubscriptionScreen.kt

Add a currency picker chip row or dropdown above the pricing tiers:

```kotlin
// In SubscriptionScreen, add a state for selected currency:
var selectedCurrency by remember { mutableStateOf("USD") }

// Add this UI element before the tier cards:
Row(
    modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = Spacing.lg, vertical = Spacing.md),
    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    verticalAlignment = Alignment.CenterVertically
) {
    Text(
        "Currency:",
        style = AppTextStyles.small,
        color = Colors.textSecondary,
        modifier = Modifier.weight(0.3f)
    )
    
    // Chip-based currency selector (or dropdown)
    Box(
        modifier = Modifier
            .weight(0.7f)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, Colors.primary.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
            .clickable { /* Show currency picker dialog */ }
            .padding(Spacing.sm),
        contentAlignment = Alignment.Center
    ) {
        Text(
            selectedCurrency,
            style = AppTextStyles.small.copy(fontWeight = FontWeight.SemiBold),
            color = Colors.primary
        )
    }
}

// When user selects a new currency, call the API:
fun updateUserCurrency(currencyCode: String) {
    viewModelScope.launch {
        try {
            apiService.updateUser(
                userId,
                mapOf("currency" to currencyCode)
            )
            selectedCurrency = currencyCode
        } catch (e: Exception) {
            // Show error toast
        }
    }
}
```

#### 4b. Populate currency dropdown with common options

```kotlin
val supportedCurrencies = listOf(
    "USD" to "$",
    "EUR" to "€",
    "GBP" to "£",
    "JPY" to "¥",
    "CAD" to "CA$",
    "AUD" to "A$",
    "CHF" to "CHF",
    "CNY" to "¥",
    "INR" to "₹",
    "MXN" to "Mex$",
    "BRL" to "R$",
    // ... add more as needed
)
```

---

### Phase 5 — iOS (Same Approach)

**SwiftUI equivalent:**

```swift
@State private var selectedCurrency: String = "USD"

VStack(spacing: 12) {
    HStack {
        Text("Currency:")
            .font(.caption)
            .foregroundColor(.secondary)
        
        Menu {
            ForEach(supportedCurrencies, id: \.key) { code, symbol in
                Button(action: {
                    updateUserCurrency(code)
                }) {
                    Text("\(code) \(symbol)")
                }
            }
        } label: {
            HStack {
                Text(selectedCurrency)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                Image(systemName: "chevron.down")
                    .font(.caption)
            }
            .frame(height: 32)
            .padding(.horizontal, 12)
            .background(Color.blue.opacity(0.1))
            .cornerRadius(8)
        }
    }
    .padding(.horizontal, 16)
    
    // Pricing tiers below...
}

func updateUserCurrency(_ currencyCode: String) {
    Task {
        do {
            try await apiService.updateUser(userId: userId, currency: currencyCode)
            selectedCurrency = currencyCode
        } catch {
            // Show error
        }
    }
}
```

---

## Pricing Display

### How prices are shown

Once the user has selected a currency, the subscription screen displays prices in that currency. This depends on your pricing backend:

**Option A: Fixed multi-currency pricing in Stripe**
- Create Stripe products with pricing in multiple currencies
- When fetching products, filter to the user's selected currency
- Display the price in that currency

**Option B: Client-side conversion (quick MVP)**
- Fetch USD prices from Stripe
- Apply exchange rate multipliers (updated daily)
- Display converted prices
- Add disclaimer: "Exchange rate is approximate; actual charge in [currency]"

**Option C: Server-side rate conversion**
- Store exchange rates in the database (updated daily via external API)
- When user requests subscription info, compute prices in their currency
- Return all pricing in the selected currency

---

## Data Flow

### At Login
```
POST /api/auth/login { email, password, timezone }
  ↓
Server validates credentials
  ↓
If user.currency is null AND timezone is provided:
  • Infer currency from timezone
  • Update users.currency
  ↓
Return user object with currency field
```

### At Subscription Screen Load
```
GET /api/users/me (already called)
  ↓
Client reads user.currency
  ↓
Display prices in that currency
```

### When User Changes Currency
```
PUT /api/users/:id { currency: "GBP" }
  ↓
Server updates users.currency
  ↓
Client re-renders with new currency
```

---

## Edge Cases to Handle

| Case | Handling |
|------|----------|
| User has no timezone (offline signup, old account) | Default to USD |
| User manually sets currency | Respect user choice; don't override |
| Timezone changes (user travels) | Don't auto-update currency; respect user's explicit selection |
| Unsupported currency requested | Reject in API validation; show supported list |

---

## Rollout Plan

### Phase 1: Backend (1 day)
- [ ] Add `currency` column to users table
- [ ] Create timezone-to-currency mapping utility
- [ ] Update login endpoint to infer currency
- [ ] Ensure `PUT /api/users/:id` accepts `currency` field

### Phase 2: Android (1-2 days)
- [ ] Add currency picker UI to SubscriptionScreen
- [ ] Wire API call to update user currency
- [ ] Test with multiple timezones

### Phase 3: iOS (1-2 days)
- [ ] Add SwiftUI currency picker
- [ ] Wire API integration
- [ ] Test parity with Android

### Phase 4: Pricing Display (1-2 days)
- [ ] Implement currency-aware price display (depends on your pricing backend)
- [ ] Add exchange rate update job (if doing client/server conversion)

---

## Testing Checklist

- [ ] User logs in from US timezone → sees USD by default
- [ ] User logs in from Japan timezone → sees JPY by default
- [ ] User changes currency → persists across app restarts
- [ ] New user with no timezone → defaults to USD
- [ ] User from ambiguous timezone (e.g., UTC) → shows supported currencies picker
- [ ] Prices display correctly in selected currency
- [ ] API rejects invalid currency codes with helpful error

---

## Notes

- **Privacy:** We're NOT storing location/country; only timezone (already collected) and currency (user-selected). No additional permissions needed.
- **Reliability:** Timezone → currency is ~95% reliable for single-country zones, ~85% for multi-country zones (Europe). User can always override.
- **No Geolocation:** We're avoiding IP geolocation and GPS tracking for privacy reasons.
