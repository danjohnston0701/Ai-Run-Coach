# Email Verification Process - iOS Implementation Brief

## Overview
This document outlines the email verification flow and UI screens for the iOS platform, based on the Android implementation. The process is required for new user registration to ensure email validity before completing the onboarding.

---

## Process Flow

### 1. Registration → Email Verification Screen
After a user successfully registers with name, email, and password, they are navigated to the **Email Verification Screen** where they must enter a 6-digit OTP sent to their email.

### 2. User Actions on Email Verification Screen
- **Enter OTP**: User taps input boxes and enters 6 digits
- **Auto-submit**: When all 6 digits are entered, auto-submit to verify
- **Verify Email**: Manual "Verify Email" button available if needed
- **Resend Code**: Available after 60-second cooldown
- **Change Email**: User can correct email address if verification code was sent to wrong email

### 3. Verification Success
Upon successful verification:
- Auth token is saved locally
- User ID is saved locally  
- User data is cached locally
- User is marked as needing profile setup (`needsProfileSetup = true`)
- User is marked as needing coach setup (`needsCoachSetup = true`)
- Navigation proceeds to next onboarding step

---

## API Endpoints

### 1. Verify Email (POST)
**Endpoint**: `/verify-email`

**Request Body**:
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Success Response**:
```json
{
  "token": "jwt_auth_token_here",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "user@example.com",
    ...
  }
}
```

**Error Response**:
```json
{
  "error": "Invalid code"
}
```

---

### 2. Resend Verification Email (POST)
**Endpoint**: `/resend-verification`

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Success Response**:
```json
{
  "ok": true
}
```

---

### 3. Update Verification Email (POST)
**Endpoint**: `/update-verification-email`

**Request Body**:
```json
{
  "currentEmail": "wrong@example.com",
  "newEmail": "correct@example.com"
}
```

**Success Response**:
```json
{
  "ok": true,
  "email": "correct@example.com"
}
```

**Error Response**:
```json
{
  "ok": false,
  "error": "Email already exists"
}
```

---

## Screen Design: Email Verification Screen

### Layout Structure
```
┌─────────────────────────────────┐
│ Back Button                     │
├─────────────────────────────────┤
│                                 │
│         [EMAIL ICON]            │  (80x80 box with rounded corners)
│                                 │
│   Check your email              │  (H1 Bold heading)
│                                 │
│   We sent a 6-digit verification│
│   code to                       │
│   user@example.com              │  (Highlighted in primary color)
│                                 │
│   Wrong email? Change it        │  (Clickable link)
│                                 │
├─────────────────────────────────┤
│   [_] [_] [_] [_] [_] [_]       │  (OTP digit boxes)
│                                 │
│   [Error message if applicable] │
│   [Loading spinner if needed]   │
│                                 │
│   ┌─────────────────────────┐   │
│   │   Verify Email          │   │  (Primary button)
│   └─────────────────────────┘   │
│                                 │
│   Didn't receive a code?        │
│   Resend in 60s / Resend        │  (Countdown or clickable)
│                                 │
│   The code expires after 24h.   │  (Caption text)
│                                 │
└─────────────────────────────────┘
```

### Components

#### Header
- **Back Button**: Returns to login screen (clears verification state)
- **Title**: Empty (just navigation)
- **Background**: Root background color

#### Main Content
- **Email Icon**: 80x80 rounded box with primary color background (12% opacity), emoji "✉️" inside
- **Heading**: "Check your email" (H1, bold)
- **Description**: Two-line text explaining the code was sent to [email]
- **Email Address**: Displayed in primary color (bold)

#### Change Email Link
- **Text**: "Wrong email? Change it"
- **Action**: Opens modal dialog to update email
- **Appears as**: Row with secondary text + primary clickable text

#### OTP Input
- **Hidden text field**: Accepts numeric input only (0-9)
- **Visible OTP boxes**: 6 boxes in a row
  - Each box is 48x48dp with rounded corners (10dp)
  - **Empty box**: Secondary background color, 1dp border
  - **Focused box** (next to enter): 2dp primary border with cursor indicator "|"
  - **Filled box**: 8% primary background, 0.4 opacity primary border, digit displayed
- **Input behavior**: Max 6 digits, auto-submit when complete
- **Focus**: Automatically focuses on screen load

#### Validation & Loading
- **Error message**: Displayed below OTP boxes in error color
- **Loading spinner**: Circular progress indicator (28x28) below error area

#### Verify Button
- **Text**: "Verify Email" (H4, bold)
- **Width**: Full width
- **Height**: 54dp
- **Enabled state**: OTP is 6 digits and not loading
- **Disabled state**: Reduced opacity
- **Action**: Submits OTP to verify endpoint

#### Resend Section
- **Layout**: "Didn't receive a code?" + Action text
- **Cooldown active**: Shows "Resend in 60s"
- **Cooldown inactive**: Shows clickable "Resend" text
- **Action**: Resends code and resets 60-second cooldown
- **Note**: OTP input clears on resend

#### Footer
- **Caption**: "The code expires after 24 hours."
- **Styling**: Muted color, smaller font

---

## Modal Dialog: Change Email Address

### Layout
```
┌────────────────────────────────┐
│  Change Email Address          │  (H3 Bold)
│                                │
│  Enter the correct email.      │
│  We'll send a new code.        │  (Body secondary)
│                                │
│  [___________________]         │  (Email input field)
│                                │
│  [Error message if any]        │
│                                │
│  [Cancel]    [Update]          │  (Button row)
└────────────────────────────────┘
```

### Components
- **Title**: "Change Email Address" (H3, bold)
- **Description**: "Enter the correct email address. We'll send a new verification code."
- **Input Field**: 
  - Outlined text field
  - Placeholder: "you@example.com"
  - Keyboard type: Email
  - Validation: Valid email format AND different from current email
- **Error Display**: Shows API error messages in error color
- **Buttons**:
  - **Cancel**: Secondary button, disabled while loading
  - **Update**: Primary button, only enabled if new email is valid and not loading
  - **Loading state**: Shows spinner inside button during submission

### State Management
- **Dialog shows**: When user clicks "Change it" link
- **Dialog closes**: On successful update or cancel
- **On success**: 
  - Email is updated in verification screen
  - OTP input is cleared
  - Resend cooldown resets to 60 seconds
  - Dialog closes automatically

---

## State Management

### Verification State (via ViewModel/StateManager)
```
- requiresEmailVerification: Boolean  // Flag when user needs to verify email
- pendingVerificationEmail: String    // Email awaiting verification
- isLoading: Boolean                  // API call in progress
- error: String?                      // Verification error
- changeEmailError: String?           // Change email dialog error
- changeEmailSuccess: Boolean         // Flag for successful email change
- isLoginSuccessful: Boolean          // Navigation trigger after verification
```

### Local State (UI-level)
```
- otp: String                         // Current OTP input (0-6 digits)
- resendCooldown: Int                 // Countdown timer (0-60 seconds)
- showChangeEmailDialog: Boolean      // Modal visibility
```

---

## User Flow Diagram

```
Registration Screen
        ↓
  [User Registers]
        ↓
Email Verification Screen
        ↓
   [Enter OTP]
        ↓
    [Auto-submit or Manual Verify]
        ↓
    ├─→ Success: Save token/user data → Profile Setup
    │
    └─→ Error: Show error message → Retry
        ↓
   [If wrong email] → Change Email Dialog
        ↓
   [Enter new email] → API updates email
        ↓
   [OTP clears, cooldown resets] → Continue verification
```

---

## Error Handling

### Common Errors

| Error | Cause | User Action |
|-------|-------|-------------|
| "Invalid code" | Wrong OTP entered | Clear and re-enter correct code |
| "Code expired" | 24+ hours passed | Click "Resend" to get new code |
| "Email already exists" | Email address already in system | Use different email |
| "Failed to resend" | Server issue | Retry after a moment |
| "Verification failed" | Network or server issue | Retry verification |

### Error Display
- Errors appear in red text below OTP input area
- All errors are clearable (disappear on new attempt)
- "Resend" button becomes available after cooldown

---

## Implementation Notes

### Keyboard Handling
- Numeric keyboard displayed for OTP input
- Email keyboard displayed for change email dialog
- First input field auto-focuses on screen load

### Accessibility
- Text inputs have proper labels and placeholders
- Error messages are clearly displayed
- Loading states are indicated with spinner
- Back button has content description

### Network Requests
- All endpoints should include auth headers where required
- Retry logic recommended for transient failures
- Timeout: Recommend 10-30 second timeout per request
- Error parsing: Handle both JSON error responses and network errors

### Data Persistence
- **Auth token**: Store securely (Keychain on iOS)
- **User ID**: Store in app preferences
- **User data**: Cache in app storage
- **Email**: Update in-memory state immediately after API success

### Navigation
- **Success**: Navigate to profile setup screen
- **Back button**: Return to login/registration
- **State reset**: Clear verification state when leaving via back button

---

## Testing Checklist

- [ ] OTP input accepts only digits 0-9
- [ ] OTP input limited to 6 characters
- [ ] Auto-submit triggers when 6 digits entered
- [ ] Verify button manual submission works
- [ ] Invalid OTP shows error message
- [ ] Valid OTP completes verification
- [ ] Resend button starts 60-second cooldown
- [ ] Cooldown timer counts down correctly
- [ ] Change email dialog opens/closes properly
- [ ] Email validation prevents invalid formats
- [ ] Email validation prevents same email
- [ ] Change email successfully updates displayed email
- [ ] Back button clears state and navigates back
- [ ] Error messages clear on new attempt
- [ ] Loading states display during API calls
- [ ] All buttons disabled appropriately during loading
- [ ] Network errors handled gracefully
- [ ] Auth token saved after successful verification

---

## Styling References

### Colors (from Android theme)
- **Primary**: Primary accent color (used for buttons, links, highlights)
- **Text Primary**: Main text color
- **Text Secondary**: Subtitle/supporting text
- **Text Muted**: Disabled/muted text
- **Background Root**: Screen background
- **Background Secondary**: Secondary surfaces (modals, cards)
- **Error**: Error message color
- **Button Text**: Text color on buttons

### Typography
- **H1**: Heading size for main title
- **H3**: Heading size for dialog title
- **H4**: Heading size for button text
- **Body**: Standard body text
- **Caption**: Small helper/footer text

### Spacing
- **xs/sm/md/lg/xl/xxl/xxxl**: Progressive spacing units (see design system)
- Use consistent spacing throughout

### Border Radius
- **Input fields**: 10-12dp radius
- **Buttons**: 16dp radius
- **Dialogs**: 20dp radius
- **Icon boxes**: 24dp radius

---

## Additional Resources

- See `EmailVerificationScreen.kt` in Android for UI implementation reference
- See `LoginViewModel.kt` for state management and API integration logic
- See `AuthRequest.kt` for request/response model definitions
