# iOS Forgot Password Feature Brief

## Overview
Implement a "Forgot Password" flow that allows users to securely reset their password via email. The user receives a password reset link, clicks it to verify their email, and sets a new password.

## User Flow

```
Login Screen
    ↓ (tap "Forgot Password?")
Forgot Password Email Input Screen
    ↓ (enter email, tap "Send Reset Link")
Success Message
    ↓ (user checks email, clicks reset link)
Reset Password Screen (web/email link opens this)
    ↓ (enter new password, confirm it)
Success + Redirect to Login
    ↓ (user logs in with new password)
Dashboard
```

## Backend Endpoints

### 1. POST `/api/auth/forgot-password`
**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "message": "Password reset email sent successfully"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Email is required"
}
```

**Response (404 Not Found):**
```json
{
  "error": "No user found with this email"
}
```

**Behavior:**
- Validates the email format
- Checks if a user exists with that email
- Generates a secure reset token (JWT with 1-hour expiry)
- Sends an email with a password reset link containing the token
- Returns success even if email doesn't exist (prevents email enumeration attacks)
- Email subject: "Reset Your AI Run Coach Password"
- Email body contains:
  - User's name
  - Reset link: `https://airuncoach.live/reset-password?token={JWT}`
  - Link expires in 1 hour
  - Warning about not sharing the link

### 2. POST `/api/auth/reset-password`
**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "newPassword": "NewSecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "message": "Password reset successfully",
  "email": "user@example.com"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid or expired reset token"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Password must be at least 8 characters"
}
```

**Behavior:**
- Validates the reset token (JWT signature, expiry)
- Validates the new password (minimum 8 characters, not empty)
- Hashes the new password with bcrypt
- Updates the user's password in the database
- Returns the user's email for confirmation
- Token is one-time use (invalidated after use)

## iOS Implementation

### Screens

#### 1. Forgot Password Email Input Screen
**Purpose:** Allow user to enter their email and request a password reset.

**UI Elements:**
- TopAppBar with "Forgot Password" title and back button
- Email input field with placeholder "Enter your email"
- Email validation (shows error if invalid format)
- "Send Reset Link" button (disabled until valid email entered)
- "Back to Login" link at bottom

**Behavior:**
- Validates email format in real-time
- Shows loading state while API call in progress
- Displays error message if email not found or network error
- Shows success message: "Check your email for a reset link (expires in 1 hour)"
- Auto-dismiss success message and return to login after 3 seconds

**State Variables:**
```swift
@State var email = ""
@State var isLoading = false
@State var error: String? = nil
@State var showSuccess = false
```

#### 2. Reset Password Screen (Web/Deep Link)
**Purpose:** Allow user to set a new password after clicking email link.

**URL Scheme:**
```
airuncoach://reset-password?token={JWT}
airuncoach.live/reset-password?token={JWT}
```

**UI Elements:**
- TopAppBar with "Reset Password" title
- New password input field with show/hide toggle
- Confirm password input field with show/hide toggle
- Password strength indicator (weak/medium/strong)
- "Update Password" button (disabled until passwords match and meet requirements)
- Error message display
- Success screen with "Return to Login" button

**Validation Rules:**
- Password must be at least 8 characters
- Passwords must match
- Password strength: 
  - Weak: < 10 characters
  - Medium: 10-14 characters, mixed case OR numbers/symbols
  - Strong: 15+ characters OR (12+ with mixed case + numbers/symbols)

**Behavior:**
- Extract token from URL/deep link
- If token missing/invalid: show error "Invalid or expired reset link"
- If token expired: show error "Reset link has expired. Request a new one."
- Show loading state during password update
- On success: display "Password updated successfully" and countdown to login redirect
- Redirect to login screen after 3 seconds
- On failure: show error message and allow retry

**State Variables:**
```swift
@State var newPassword = ""
@State var confirmPassword = ""
@State var token = ""
@State var isLoading = false
@State var error: String? = nil
@State var showSuccess = false
@State var passwordStrength: PasswordStrength = .weak
```

### ViewModel (Swift)

#### ForgotPasswordViewModel
```swift
class ForgotPasswordViewModel: ObservableObject {
    @Published var email = ""
    @Published var isLoading = false
    @Published var error: String? = nil
    @Published var showSuccess = false
    
    private let apiService: APIService
    
    func sendResetLink() {
        guard !email.isEmpty else {
            error = "Email is required"
            return
        }
        
        guard isValidEmail(email) else {
            error = "Please enter a valid email"
            return
        }
        
        isLoading = true
        error = nil
        
        Task {
            do {
                let response = try await apiService.forgotPassword(email: email)
                isLoading = false
                showSuccess = true
                // Auto-dismiss after 3 seconds
                try await Task.sleep(nanoseconds: 3_000_000_000)
                showSuccess = false
            } catch {
                isLoading = false
                self.error = error.localizedDescription
            }
        }
    }
    
    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
        return NSPredicate(format: "SELF MATCHES %@", emailRegex).evaluate(with: email)
    }
}

enum PasswordStrength {
    case weak
    case medium
    case strong
}

class ResetPasswordViewModel: ObservableObject {
    @Published var newPassword = ""
    @Published var confirmPassword = ""
    @Published var isLoading = false
    @Published var error: String? = nil
    @Published var showSuccess = false
    @Published var passwordStrength: PasswordStrength = .weak
    
    private let apiService: APIService
    private let token: String
    
    init(token: String, apiService: APIService) {
        self.token = token
        self.apiService = apiService
    }
    
    func updatePassword() {
        guard !newPassword.isEmpty else {
            error = "Password is required"
            return
        }
        
        guard newPassword.count >= 8 else {
            error = "Password must be at least 8 characters"
            return
        }
        
        guard newPassword == confirmPassword else {
            error = "Passwords do not match"
            return
        }
        
        isLoading = true
        error = nil
        
        Task {
            do {
                let response = try await apiService.resetPassword(
                    token: token,
                    newPassword: newPassword
                )
                isLoading = false
                showSuccess = true
                // Auto-dismiss after 3 seconds
                try await Task.sleep(nanoseconds: 3_000_000_000)
                // Navigate to login (handled by parent)
            } catch {
                isLoading = false
                self.error = error.localizedDescription
            }
        }
    }
    
    func updatePasswordStrength() {
        if newPassword.isEmpty {
            passwordStrength = .weak
        } else if newPassword.count < 10 {
            passwordStrength = .weak
        } else if newPassword.count >= 15 || 
                  (newPassword.count >= 12 && hasMixedCaseAndSymbols()) {
            passwordStrength = .strong
        } else {
            passwordStrength = .medium
        }
    }
    
    private func hasMixedCaseAndSymbols() -> Bool {
        let hasUppercase = newPassword.contains { $0.isUppercase }
        let hasLowercase = newPassword.contains { $0.isLowercase }
        let hasNumbers = newPassword.contains { $0.isNumber }
        let hasSymbols = newPassword.contains { !$0.isLetter && !$0.isNumber }
        
        return (hasUppercase && hasLowercase) && (hasNumbers || hasSymbols)
    }
}
```

### API Methods

```swift
extension APIService {
    func forgotPassword(email: String) async throws -> ForgotPasswordResponse {
        let request = ForgotPasswordRequest(email: email)
        return try await post("/api/auth/forgot-password", body: request)
    }
    
    func resetPassword(token: String, newPassword: String) async throws -> ResetPasswordResponse {
        let request = ResetPasswordRequest(token: token, newPassword: newPassword)
        return try await post("/api/auth/reset-password", body: request)
    }
}
```

### Models

```swift
struct ForgotPasswordRequest: Codable {
    let email: String
}

struct ForgotPasswordResponse: Codable {
    let ok: Bool?
    let message: String?
    let error: String?
}

struct ResetPasswordRequest: Codable {
    let token: String
    let newPassword: String
}

struct ResetPasswordResponse: Codable {
    let ok: Bool?
    let email: String?
    let message: String?
    let error: String?
}
```

## Security Considerations

1. **Token Expiry:** Reset tokens expire after 1 hour
2. **One-Time Use:** Tokens are invalidated after successful password reset
3. **Email Verification:** Confirms user's email ownership before allowing password change
4. **Password Hashing:** All passwords hashed with bcrypt (cost factor 10+)
5. **Error Messages:** Generic messages to prevent email enumeration
6. **HTTPS Only:** All endpoints use HTTPS
7. **No Token in URL Logs:** Consider using POST instead of GET with token in URL
8. **Rate Limiting:** Implement rate limiting on forgot-password endpoint (e.g., 3 requests per email per hour)

## Error Handling

| Scenario | Error Message | Action |
|----------|---------------|--------|
| Email not found | "Email not found" (generic: "Check your email for reset link") | Show message, don't hint that email doesn't exist |
| Invalid token | "Invalid or expired reset link" | Show error, provide "Request new link" button |
| Token expired | "Reset link has expired (expires in 1 hour)" | Show error, link back to forgot password screen |
| Password too weak | "Password must be at least 8 characters" | Show error, keep form open |
| Passwords don't match | "Passwords do not match" | Show error, keep form open |
| Network error | "Failed to send reset link. Please try again." | Show error, allow retry |

## Testing Checklist

- [ ] Valid email receives reset link
- [ ] Reset link opens reset password screen
- [ ] Invalid/expired token shows error
- [ ] Password validation works (minimum 8 chars, match confirmation)
- [ ] Password strength indicator updates in real-time
- [ ] Successful reset redirects to login
- [ ] User can log in with new password
- [ ] Old password no longer works
- [ ] Pressing back on reset screen shows confirmation dialog
- [ ] Network errors are handled gracefully
- [ ] Loading states display correctly
- [ ] Success messages auto-dismiss
- [ ] Email validation prevents invalid formats
- [ ] Rate limiting is enforced on backend

## Notes

- This feature mirrors the Android implementation for consistency
- Consider adding biometric support to skip password entry on login after reset
- May want to add "Remember me" option after password reset for convenience
- Consider implementing a security question as additional verification step
- Email recovery codes as backup could be valuable feature for future
