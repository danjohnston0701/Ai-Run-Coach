#!/bin/bash

# Push Notifications Testing Script
# Usage: ./test-push-notifications.sh <server-url> <user-email> [title] [body]
#
# Examples:
#   ./test-push-notifications.sh https://airuncoach.replit.dev user@example.com "Test" "Test message"
#   ./test-push-notifications.sh http://localhost:3000 user@example.com

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Arguments
SERVER_URL="${1:-}"
USER_EMAIL="${2:-}"
TITLE="${3:-Test Notification}"
BODY="${4:-If you see this, push notifications are working! 🎉}"

# Validate inputs
if [[ -z "$SERVER_URL" || -z "$USER_EMAIL" ]]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo ""
    echo "Usage: ./test-push-notifications.sh <server-url> <user-email> [title] [body]"
    echo ""
    echo "Examples:"
    echo "  ./test-push-notifications.sh https://airuncoach.replit.dev user@example.com"
    echo "  ./test-push-notifications.sh http://localhost:3000 user@example.com \"Custom Title\" \"Custom Body\""
    exit 1
fi

echo -e "${BLUE}=== AI Run Coach Push Notifications Test ===${NC}"
echo ""
echo "Server URL: $SERVER_URL"
echo "User Email: $USER_EMAIL"
echo "Title: $TITLE"
echo "Body: $BODY"
echo ""

# Step 1: Check server connectivity
echo -e "${YELLOW}Step 1: Checking server connectivity...${NC}"
if ! curl -s -f -m 5 "${SERVER_URL}/health" > /dev/null 2>&1; then
    echo -e "${RED}❌ Server is not responding. Check:${NC}"
    echo "   - Server URL is correct: $SERVER_URL"
    echo "   - Server is running"
    echo "   - You have internet connection"
    exit 1
fi
echo -e "${GREEN}✅ Server is responding${NC}"
echo ""

# Step 2: Send test notification
echo -e "${YELLOW}Step 2: Sending test push notification...${NC}"
RESPONSE=$(curl -s -X POST "${SERVER_URL}/api/test/push-notification" \
  -H "Content-Type: application/json" \
  -d "{
    \"userEmail\": \"${USER_EMAIL}\",
    \"title\": \"${TITLE}\",
    \"body\": \"${BODY}\"
  }")

echo ""
echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Parse response
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Push notification sent successfully!${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Check your Android device for the notification"
    echo "  2. If notification doesn't appear within 10 seconds:"
    echo "     - Check device is unlocked"
    echo "     - Check Settings → Apps → AI Run Coach → Notifications is ON"
    echo "     - Check device is not in Do Not Disturb mode"
    echo ""
    echo -e "${YELLOW}Debugging info:${NC}"
    echo "$RESPONSE" | jq '.tokenPreview' 2>/dev/null || echo "Token preview not available"
    exit 0
elif echo "$RESPONSE" | grep -q '"hasToken":false'; then
    echo -e "${RED}❌ User has no FCM token registered${NC}"
    echo ""
    echo -e "${YELLOW}Fix:${NC}"
    echo "  1. Open AI Run Coach on your Android device"
    echo "  2. Log in (or re-login if already logged in)"
    echo "  3. Grant POST_NOTIFICATIONS permission when prompted"
    echo "  4. Wait 2 seconds for token to upload"
    echo "  5. Try this test again"
    exit 1
elif echo "$RESPONSE" | grep -q '"success":false'; then
    echo -e "${RED}❌ Push notification failed to send${NC}"
    echo ""
    echo -e "${YELLOW}Debugging:${NC}"
    echo "  - Check server logs for Firebase errors"
    echo "  - Verify FIREBASE_SERVICE_ACCOUNT_JSON is set on Replit"
    echo "  - Run: adb logcat | grep -i firebase"
    exit 1
elif echo "$RESPONSE" | grep -q 'User not found'; then
    echo -e "${RED}❌ User not found in database${NC}"
    echo ""
    echo -e "${YELLOW}Check:${NC}"
    echo "  - Email is correct: $USER_EMAIL"
    echo "  - User has logged in to the app at least once"
    echo "  - Database connection is working"
    exit 1
else
    echo -e "${RED}❌ Unexpected response${NC}"
    echo ""
    echo "Full response:"
    echo "$RESPONSE"
    exit 1
fi
