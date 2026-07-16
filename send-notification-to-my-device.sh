#!/bin/bash

# Send Garmin watch app update notification to YOUR device only
# Usage: ./send-notification-to-my-device.sh [version] [releaseNote]

set -e

# Configuration
API_URL="https://airuncoach.live/api/admin/garmin-watch-app/send-to-device"
ADMIN_KEY="PUSH_NOTIFICATION_UPDATES"
FCM_TOKEN="fEDpanBlR3-MBskcqo1vtT:APA91bGHVExt3511gu_34tFSrN6tBHtuAj8HY_n4E1vV7q5DQkQrkKnY3aNAvgbhFm00LCxstR09mQKd_wVxS_jgBRauyNgBjDn8VEu5vx8_hVjznWM1Lho"

# Parse arguments with defaults
VERSION="${1:-2.4.1}"
RELEASE_NOTE="${2:-Updated app to include cadence metric and fixed minor bugs}"

echo "📱 Sending Garmin watch app update notification to your device..."
echo "   Version: $VERSION"
echo "   Release Note: $RELEASE_NOTE"
echo ""

# Send the notification
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"fcmToken\": \"$FCM_TOKEN\",
    \"version\": \"$VERSION\",
    \"releaseNote\": \"$RELEASE_NOTE\"
  }")

echo "Response:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
