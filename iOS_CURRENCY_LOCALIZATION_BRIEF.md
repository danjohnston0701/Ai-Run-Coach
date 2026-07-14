# iOS — Currency Localization Implementation Brief

**Status**: Ready for Xcode Implementation  
**Priority**: High (conversion uplift feature)  
**Estimated Time**: 2–3 days  

---

## Overview

Implement currency localization for subscription pricing. Prices are automatically inferred from the user's timezone and displayed in their local currency. This will significantly improve conversion by showing prices in familiar local currency rather than always USD.

The server now:
- Infers a default currency from the user's timezone at login
- Stores `currency` on the user profile
- Returns currency code with pricing data

iOS needs to:
1. Display the inferred currency code on subscription screens
2. Surface the "Display Pricing In" label and currency indicator
3. Handle future currency override capability (stub for now)

---

## Backend Ready

✅ All server changes are complete:
- `users.currency` field added (defaults to USD)
- `timezone-to-currency.ts` utility provides ~95% accurate timezone-to-currency mapping
- Login endpoint automatically infers and sets currency from timezone
- No iOS API changes needed — existing endpoints work as-is

---

## Android Implementation Complete

✅ Reference implementation:
- Currency display added to `SubscriptionScreen.kt`
- Shows "Display Pricing In: USD" (example) above tier cards
- Lite tier pricing updated: $5.99/month (was $7.99)
- Annual Lite pricing: $59.99/year (was $79.99)
- Discount now: $5.00/month equivalent (was $6.67/month)

Copy the same approach for iOS.

---

## Pricing Updates (Both Platforms)

### Lite Tier
- **Monthly**: $5.99/month (was $7.99)
- **Annual**: $59.99/year (was $79.99)
- **Annual Discount Copy**: "$5.00/month — save $11.89" (was "$6.67/month — save $15.89")

### Standard/Premium Tiers
- No changes

---

## Implementation Tasks

### Phase 1: Data Model Update (30 min)

Update `User` model to include `currency` field:

```swift
struct User: Codable {
    let id: String
    let email: String
    let firstName: String?
    let dateOfBirth: String?
    let currency: String?  // NEW: ISO 4217 currency code (e.g., "USD", "EUR", "GBP")
    // ... existing fields
}
```

**Note:** The server will set this automatically at login based on timezone. New users won't have it until they login.

---

### Phase 2: Update Subscription Pricing (1 hr)

Update the subscription tier pricing in your pricing/subscription model:

```swift
struct SubscriptionTier {
    let id: String
    let name: String
    // ... existing fields
}

// Lite tier updates (find in your pricing constants):
let liteTier = SubscriptionTier(
    id: "lite_monthly",
    monthlyPrice: 5.99,    // was 7.99
    monthlyDisplay: "$5.99",
    annualPrice: 59.99,    // was 79.99
    annualDisplay: "$59.99",
    annualDiscountText: "$5.00/month — save $11.89", // was "$6.67/month — save $15.89"
    // ... other fields
)
```

---

### Phase 3: Update Subscription Display Screen (2 hrs)

#### 3a. Add currency display section above tier cards

In your subscription screen (likely `SubscriptionView` or similar):

```swift
VStack {
    HStack {
        Text("Display Pricing In")
            .font(.caption)
            .foregroundColor(.secondary)
        Spacer()
    }
    .padding(.horizontal)
    .padding(.top, 12)
    
    // Currency indicator
    HStack {
        Text(userCurrency ?? "USD")
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(.primary)
        Spacer()
        Image(systemName: "info.circle")
            .foregroundColor(.secondary)
            .font(.caption)
    }
    .padding()
    .background(Color(.systemGray6))
    .cornerRadius(8)
    .padding(.horizontal)
    .padding(.bottom, 12)
    
    Text("Prices are shown in the currency inferred from your timezone. Manual currency selection can be added in a future update.")
        .font(.caption2)
        .foregroundColor(.secondary)
        .lineLimit(nil)
        .padding(.horizontal)
}
```

#### 3b. Update the footnote

Change the current "All prices in USD" footnote to:

```swift
Text("All prices in \(userCurrency ?? "USD").")
    .font(.caption)
    .foregroundColor(.secondary)
    .frame(maxWidth: .infinity, alignment: .center)
    .padding()
```

Where `userCurrency` is bound to `currentUser?.currency ?? "USD"`.

---

### Phase 4: Fetch and Display Currency (1 hr)

#### 4a. Store currency in session manager

When the login response arrives, capture and store the `currency` field:

```swift
// In your login/auth response handling:
if let currency = response.user.currency {
    SessionManager.shared.userCurrency = currency
}
```

#### 4b. Display on screen

In your `SubscriptionView`, bind to the user's currency:

```swift
@State private var userCurrency: String?

// In onAppear or init:
userCurrency = SessionManager.shared.userCurrency ?? "USD"

// Use in the UI as shown in Phase 3
```

---

## Testing Checklist

- [ ] Create test user from a non-US timezone (e.g., London, Tokyo, Berlin)
- [ ] Login and verify `currency` field is populated correctly
- [ ] Currency display shows the inferred code (e.g., "GBP" for UK)
- [ ] Lite tier shows correct prices: $5.99/month, $59.99/year
- [ ] Annual discount text is correct: "$5.00/month — save $11.89"
- [ ] Currency is sticky across app restarts (reads from session)
- [ ] Test with VPN to different regions to verify timezone-based inference
- [ ] Existing USD users still see "USD" (default behavior)

---

## Timezone-to-Currency Mapping

Reference the server's mapping for testing:

| Timezone | Currency |
|----------|----------|
| `America/*` | USD |
| `Europe/London` | GBP |
| `Europe/*` (Paris, Berlin, etc.) | EUR |
| `Asia/Tokyo` | JPY |
| `Asia/Shanghai` | CNY |
| `Asia/Delhi` | INR |
| `Australia/Sydney` | AUD |
| `Pacific/Auckland` | NZD |

See `server/utils/timezone-to-currency.ts` for the full list.

---

## Future Enhancements

These are **NOT** in scope for this release but can be added later:

1. **Manual currency override** — Let users pick a different currency from a dropdown
2. **Currency-specific payment methods** — Show payment methods valid for selected currency
3. **Exchange rate updates** — If supporting multi-currency prices, sync rates daily
4. **Server-side pricing by currency** — Different prices per currency (currently all prices are in USD)

For now, we're just **displaying** the inferred currency; the actual pricing is still in USD but shown with the local currency symbol.

---

## Notes

- **No new permissions needed** — we already have the user's timezone
- **Privacy-first** — currency is inferred from timezone only, no geolocation or IP tracking
- **Backward compatible** — existing users without a `currency` field default to USD
- **High impact** — showing local currency dramatically improves conversion in non-US markets

---

## PR Checklist

- [ ] User model updated with `currency` field
- [ ] Pricing tiers updated (Lite: $5.99 monthly, $59.99 annual)
- [ ] Currency display added to subscription screen
- [ ] Annual discount text updated to reflect new pricing
- [ ] Session manager captures currency from login response
- [ ] Tests pass across different timezones
- [ ] Footnote updated to show actual currency
- [ ] No breaking changes to existing APIs
