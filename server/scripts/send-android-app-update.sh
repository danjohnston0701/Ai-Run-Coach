#!/bin/bash

# ════════════════════════════════════════════════════════════════════════════
# Android App Update Broadcast Script
# 
# Usage:
#   export ADMIN_TOKEN="your-secret-token"
#   ./server/scripts/send-android-app-update.sh 1.4.3 "Critical Update" "Please update to fix login issues"
#
#   Or with optional flags:
#   ./server/scripts/send-android-app-update.sh 1.4.3 "Update Available" "New features added" --dry-run
#   ./server/scripts/send-android-app-update.sh 1.4.3 "Update Available" "New features added" --server https://custom.server.com
#
# Environment variables:
#   ADMIN_TOKEN     - Required. Your admin API key (same as ADMIN_API_KEY on server)
#   API_SERVER      - Optional. Defaults to https://airuncoach.live
#
# ════════════════════════════════════════════════════════════════════════════

set -e

# Parse arguments
VERSION="${1:-}"
TITLE="${2:-}"
RELEASE_NOTE="${3:-}"
DRY_RUN=false
API_SERVER="${API_SERVER:-https://airuncoach.live}"

# Check for optional flags
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      ;;
    --server)
      # Next argument is the server URL
      shift
      API_SERVER="$1"
      ;;
  esac
done

# Validate required arguments
if [[ -z "$VERSION" ]]; then
  echo "❌ Error: VERSION is required"
  echo ""
  echo "Usage: $0 <version> <title> <release-note> [--dry-run] [--server <url>]"
  echo ""
  echo "Examples:"
  echo "  export ADMIN_TOKEN=\"secret-key-here\""
  echo "  $0 1.4.3 \"Critical Update\" \"Please update to fix login issues\""
  echo "  $0 1.4.3 \"Update Available\" \"New features added\" --dry-run"
  echo ""
  exit 1
fi

if [[ -z "$TITLE" ]]; then
  echo "❌ Error: TITLE is required"
  echo ""
  echo "Usage: $0 <version> <title> <release-note> [--dry-run] [--server <url>]"
  exit 1
fi

if [[ -z "$RELEASE_NOTE" ]]; then
  echo "❌ Error: RELEASE_NOTE is required"
  echo ""
  echo "Usage: $0 <version> <title> <release-note> [--dry-run] [--server <url>]"
  exit 1
fi

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "❌ Error: ADMIN_TOKEN environment variable is required"
  echo ""
  echo "Set it with:"
  echo "  export ADMIN_TOKEN=\"your-secret-token-from-server\""
  echo ""
  exit 1
fi

# Prepare the request body
REQUEST_BODY=$(cat <<EOF
{
  "version": "$VERSION",
  "title": "$TITLE",
  "releaseNote": "$RELEASE_NOTE",
  "dryRun": $DRY_RUN
}
EOF
)

# Display what we're about to do
echo "📱 Android App Update Broadcast"
echo "────────────────────────────────────────────────"
echo "Server:       $API_SERVER"
echo "Version:      $VERSION"
echo "Title:        $TITLE"
echo "Release Note: $RELEASE_NOTE"
echo "Dry Run:      $DRY_RUN"
echo "────────────────────────────────────────────────"
echo ""

if [[ "$DRY_RUN" == true ]]; then
  echo "🔍 DRY RUN - Checking target user count..."
else
  echo "🚀 Broadcasting update to all Android users..."
fi

echo ""

# Send the request
RESPONSE=$(curl -s -X POST "$API_SERVER/api/admin/app-update/broadcast" \
  -H "X-Admin-Key: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY")

# Check if the request was successful
if echo "$RESPONSE" | grep -q "\"success\":true"; then
  echo "✅ Broadcast successful!"
  echo ""
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  echo ""
  
  # Parse the response for summary
  TARGETED=$(echo "$RESPONSE" | jq -r '.targeted' 2>/dev/null || echo "unknown")
  PUSH_SENT=$(echo "$RESPONSE" | jq -r '.pushSent' 2>/dev/null || echo "unknown")
  IN_APP=$(echo "$RESPONSE" | jq -r '.inAppSent' 2>/dev/null || echo "unknown")
  
  echo "📊 Summary:"
  echo "  • Targeted Users: $TARGETED"
  echo "  • Push Notifications Sent: $PUSH_SENT"
  echo "  • In-App Messages Sent: $IN_APP"
  echo ""
  exit 0
elif echo "$RESPONSE" | grep -q "\"dryRun\":true"; then
  echo "✅ Dry run complete - here's what would be targeted:"
  echo ""
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  echo ""
  
  TARGETED=$(echo "$RESPONSE" | jq -r '.targeted' 2>/dev/null || echo "unknown")
  WITH_FCM=$(echo "$RESPONSE" | jq -r '.withFcmToken' 2>/dev/null || echo "unknown")
  WITHOUT_FCM=$(echo "$RESPONSE" | jq -r '.withoutFcmToken' 2>/dev/null || echo "unknown")
  
  echo "📊 Target Summary:"
  echo "  • Total Users: $TARGETED"
  echo "  • With FCM Token (will receive push): $WITH_FCM"
  echo "  • Without FCM Token (in-app only): $WITHOUT_FCM"
  echo ""
  echo "To actually send the broadcast, run:"
  echo "  export ADMIN_TOKEN=\"$ADMIN_TOKEN\""
  echo "  $0 $VERSION \"$TITLE\" \"$RELEASE_NOTE\""
  echo ""
  exit 0
else
  echo "❌ Broadcast failed!"
  echo ""
  echo "Response:"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  echo ""
  
  # Try to extract error message
  ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error' 2>/dev/null)
  if [[ -n "$ERROR_MSG" ]]; then
    echo "Error: $ERROR_MSG"
  fi
  
  exit 1
fi
