# iOS — Credential Manager & Localized Pricing Implementation Brief

**Status**: Ready for Xcode Implementation  
**Priority**: High (credential manager = UX win, pricing = conversion optimization)  
**Estimated Time**: 3-4 hours  
**iOS Minimum**: iOS 15+  
**Dependencies**: None (uses native iOS frameworks)

---

## Overview

Implement two features that dramatically improve user experience:

1. **Credential Manager** — Save/autofill login credentials via iCloud Keychain, Face ID, or Touch ID
2. **Localized Pricing** — Display subscription prices in the user's inferred currency (NZD, GBP, EUR, etc.) instead of always showing USD

---

## Part 1: Credential Manager (iCloud Keychain)

### What This Does

After successful login, iOS shows a native prompt: **"Would you like to save your password in iCloud Keychain?"**
- User can tap **"Save Password"** → credentials stored securely
- On next login, password field shows autofill suggestion
- One tap to fill email + password automatically

Works seamlessly with:
- iCloud Keychain (all iOS devices)
- Safari autofill (across web + app)
- Face ID / Touch ID unlock

### Implementation

#### Step 1: Add Keychain Helper

Create new file: `Utils/KeychainHelper.swift`

```swift
import Foundation
import Security

class KeychainHelper {
    static let shared = KeychainHelper()
    private let service = "live.airuncoach.airuncoach"
    private let account = "login"
    
    /// Save credentials to Keychain after successful login
    func saveCredentials(email: String, password: String) {
        let credentials = "\(email):\(password)"
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: credentials.data(using: .utf8) ?? Data()
        ]
        
        // Delete if exists
        SecItemDelete(query as CFDictionary)
        
        // Add new
        SecItemAdd(query as CFDictionary, nil)
        print("✅ Credentials saved to Keychain")
    }
    
    /// Retrieve saved credentials from Keychain
    func retrieveCredentials() -> (email: String, password: String)? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let data = result as? Data,
              let credentials = String(data: data, encoding: .utf8) else {
            return nil
        }
        
        let parts = credentials.split(separator: ":", maxSplits: 1)
        guard parts.count == 2 else { return nil }
        
        return (email: String(parts[0]), password: String(parts[1]))
    }
    
    /// Delete saved credentials (called on logout)
    func deleteCredentials() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        print("✅ Credentials deleted from Keychain")
    }
}
```

#### Step 2: Update LoginViewModel

In your login success handler, after authentication succeeds:

```swift
// After successful login API call
if let user = loginResponse.user, let password = enteredPassword {
    // Save to Keychain
    KeychainHelper.shared.saveCredentials(email: user.email, password: password)
    
    // Continue with navigation
    navigateToNextScreen()
}
```

#### Step 3: Pre-fill Login Form on Load

In your LoginView `onAppear`:

```swift
struct LoginView: View {
    @State var email = ""
    @State var password = ""
    
    var body: some View {
        VStack {
            TextField("Email", text: $email)
            SecureField("Password", text: $password)
            Button("Sign In") { /* login */ }
        }
        .onAppear {
            // Try to pre-fill from Keychain
            if let saved = KeychainHelper.shared.retrieveCredentials() {
                email = saved.email
                password = saved.password
                print("✅ Pre-filled credentials from Keychain")
            }
        }
    }
}
```

#### Step 4: Clear on Logout

When user logs out:

```swift
func logout() {
    KeychainHelper.shared.deleteCredentials()
    sessionManager.clearSession()
    navigateToLogin()
}
```

---

## Part 2: Localized Pricing

### What This Does

User's timezone is captured at login. Inferred currency is sent in the login response.

**Before:**
```
Lite: $5.99/month
Standard: $12.99/month
```

**After (for NZ user):**
```
Lite: NZD 9.99/month
Standard: NZD 24.99/month
```

### Implementation

#### Step 1: Update LoginResponse Model

Add `currency` field to your login response model:

```swift
struct LoginResponse: Codable {
    let user: User
    let token: String
    let currency: String?  // NEW: ISO 4217 code (e.g., "NZD", "GBP", "EUR")
}

extension User: Codable {
    // Existing fields...
    var currency: String?  // NEW: ISO 4217 currency code
}
```

#### Step 2: Store Currency in SessionManager

Update SessionManager to persist currency:

```swift
class SessionManager {
    private let defaults = UserDefaults.standard
    
    func saveCurrency(_ currency: String) {
        defaults.set(currency, forKey: "user_currency")
    }
    
    func getCurrency() -> String {
        defaults.string(forKey: "user_currency") ?? "USD"
    }
    
    func clearSession() {
        defaults.removeObject(forKey: "user_currency")
        // ... clear other session data
    }
}
```

#### Step 3: Capture Currency from Login Response

In your login handler:

```swift
// After successful login
let currency = loginResponse.currency ?? "USD"
sessionManager.saveCurrency(currency)
```

#### Step 4: Create Pricing Response Model

```swift
struct GooglePlayPricingResponse: Codable {
    let source: String // "Google Play Store"
    let updatedAt: String
    
    let lite_tier_monthly: PricingTierData
    let lite_tier_annual: PricingTierData
    let standard_tier_monthly: PricingTierData
    let standard_tier_annual: PricingTierData
}

struct PricingTierData: Codable {
    let tier: String
    let period: String
    let by_currency: [String: Double]  // e.g., ["NZD": 9.99, "USD": 5.99, "EUR": 5.49]
}
```

#### Step 5: Add Pricing Endpoint to APIService

```swift
protocol APIServiceProtocol {
    // Existing methods...
    
    /// Fetch localized pricing for all subscription tiers
    func getGooglePlayPricing() async throws -> GooglePlayPricingResponse
}

extension APIService: APIServiceProtocol {
    func getGooglePlayPricing() async throws -> GooglePlayPricingResponse {
        return try await request(endpoint: "/api/googlePlayPricing")
    }
}
```

#### Step 6: Update SubscriptionViewModel

Add pricing data and currency handling:

```swift
@MainActor
class SubscriptionViewModel: ObservableObject {
    @Published var pricingData: GooglePlayPricingResponse?
    @Published var userCurrency: String = "USD"
    @Published var isLoadingPricing = false
    
    private let apiService: APIService
    private let sessionManager: SessionManager
    
    init(apiService: APIService, sessionManager: SessionManager) {
        self.apiService = apiService
        self.sessionManager = sessionManager
        self.userCurrency = sessionManager.getCurrency()
    }
    
    func loadPricing() {
        Task {
            isLoadingPricing = true
            do {
                pricingData = try await apiService.getGooglePlayPricing()
                print("✅ Pricing loaded for \(userCurrency)")
            } catch {
                print("❌ Failed to load pricing: \(error)")
            }
            isLoadingPricing = false
        }
    }
}
```

#### Step 7: Create Localized Price Display Helper

```swift
extension GooglePlayPricingResponse {
    /// Get the localized price for a tier in the user's currency
    func price(for tier: SubscriptionTier, in currency: String) -> String {
        let tierData: PricingTierData?
        
        switch tier {
        case .liteMontly:
            tierData = lite_tier_monthly
        case .liteAnnual:
            tierData = lite_tier_annual
        case .standardMonthly:
            tierData = standard_tier_monthly
        case .standardAnnual:
            tierData = standard_tier_annual
        }
        
        guard let tierData = tierData,
              let priceValue = tierData.by_currency[currency] else {
            return "N/A"
        }
        
        // Format with currency symbol
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        
        return formatter.string(from: NSNumber(value: priceValue)) ?? "\(priceValue) \(currency)"
    }
}

enum SubscriptionTier {
    case liteMontly
    case liteAnnual
    case standardMonthly
    case standardAnnual
}
```

#### Step 8: Update SubscriptionView

```swift
struct SubscriptionView: View {
    @StateObject var viewModel: SubscriptionViewModel
    
    var body: some View {
        VStack {
            // Currency indicator
            HStack {
                Text("Prices shown in")
                Text(viewModel.userCurrency)
                    .fontWeight(.bold)
                Text("· inferred from your timezone")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(8)
            
            // Lite Tier
            if let pricing = viewModel.pricingData {
                VStack(alignment: .leading) {
                    Text("Lite")
                        .font(.headline)
                    
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Monthly")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(pricing.price(for: .liteMontly, in: viewModel.userCurrency))
                                .font(.title2)
                                .fontWeight(.bold)
                        }
                        
                        Spacer()
                        
                        VStack(alignment: .leading) {
                            Text("Annual")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(pricing.price(for: .liteAnnual, in: viewModel.userCurrency))
                                .font(.title2)
                                .fontWeight(.bold)
                        }
                    }
                }
                .padding()
                .border(Color.blue, width: 2)
                .cornerRadius(8)
                
                // Standard Tier (same pattern)
                VStack(alignment: .leading) {
                    Text("Standard")
                        .font(.headline)
                    
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Monthly")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(pricing.price(for: .standardMonthly, in: viewModel.userCurrency))
                                .font(.title2)
                                .fontWeight(.bold)
                        }
                        
                        Spacer()
                        
                        VStack(alignment: .leading) {
                            Text("Annual")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(pricing.price(for: .standardAnnual, in: viewModel.userCurrency))
                                .font(.title2)
                                .fontWeight(.bold)
                        }
                    }
                }
                .padding()
                .border(Color.green, width: 2)
                .cornerRadius(8)
            }
            
            Spacer()
        }
        .onAppear {
            viewModel.loadPricing()
        }
    }
}
```

---

## Testing Checklist

- [ ] **Credential Manager:**
  - [ ] Login successfully → see "Save Password?" prompt
  - [ ] Tap "Save Password" → closes and navigates normally
  - [ ] Close and reopen app → open login screen
  - [ ] Tap email field → autofill suggestion appears
  - [ ] Tap suggestion → both email + password pre-fill
  - [ ] Logout → credentials cleared

- [ ] **Localized Pricing:**
  - [ ] Login as NZ user (timezone = Pacific/Auckland)
  - [ ] Subscription screen appears
  - [ ] Currency indicator shows "NZD"
  - [ ] Prices show: Lite Monthly ~NZD 9.99, Standard Monthly ~NZD 24.99
  - [ ] Login as US user (timezone = America/New_York)
  - [ ] Currency indicator shows "USD"
  - [ ] Prices show: Lite Monthly $5.99, Standard Monthly $12.99
  - [ ] Prices are fetched from `/api/googlePlayPricing` (check network tab)

---

## API Endpoint Reference

**Server provides**: `GET /api/googlePlayPricing`

Response structure:
```json
{
  "source": "Google Play Store",
  "updated_at": "2026-07-14T19:00:00Z",
  "lite_tier_monthly": {
    "tier": "Lite",
    "period": "monthly",
    "by_currency": {
      "USD": 5.99,
      "NZD": 9.99,
      "GBP": 4.99,
      "EUR": 5.49,
      ... // 50+ currencies
    }
  },
  "lite_tier_annual": { ... },
  "standard_tier_monthly": { ... },
  "standard_tier_annual": { ... }
}
```

---

## Future: iOS-Specific Pricing Endpoint

Once ready, create `GET /api/applePricing` with same structure but using App Store pricing (which may differ slightly due to regional VAT, Apple's fees, etc.).

For now, both Android and iOS can use `/api/googlePlayPricing` — it contains the correct prices for both platforms.

---

## Notes

- **Keychain is device-specific** — saved credentials don't sync to other devices. That's intentional (security).
- **iCloud Keychain sync** is automatic for users with iCloud enabled — if they sign into a new device with their Apple ID, passwords may appear automatically.
- **No network call needed for credential retrieval** — Keychain is local storage, very fast.
- **Currency is timezone-inferred** on server at login — no extra API call needed, just use the value from the login response.

---

## Files to Create/Modify

**Create:**
- `Utils/KeychainHelper.swift`

**Modify:**
- `Models/LoginResponse.swift` — add `currency` field
- `Models/User.swift` — add `currency` property
- `Managers/SessionManager.swift` — add `saveCurrency()` / `getCurrency()` / `clearCurrency()`
- `Services/APIService.swift` — add `getGooglePlayPricing()` endpoint
- `ViewModels/SubscriptionViewModel.swift` — add pricing + currency state
- `Views/SubscriptionView.swift` — display localized prices
- `Views/LoginView.swift` — pre-fill from Keychain, save after login

---

All server-side code is live. No iOS API changes needed — just wire these Swift models and views! 🚀
