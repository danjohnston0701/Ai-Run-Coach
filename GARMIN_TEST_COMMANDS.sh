#!/bin/bash
# Garmin OAuth Testing Commands
# Use these commands to test your Garmin OAuth setup

# ============================================================================
# 1. CHECK IF ENVIRONMENT VARIABLES ARE SET
# ============================================================================
echo "🔍 Checking Garmin environment variables..."
echo ""
echo "GARMIN_CONSUMER_KEY is set: $([ -z "$GARMIN_CONSUMER_KEY" ] && echo '❌ NO' || echo '✅ YES')"
echo "GARMIN_CONSUMER_SECRET is set: $([ -z "$GARMIN_CONSUMER_SECRET" ] && echo '❌ NO' || echo '✅ YES')"
echo ""
if [ -z "$GARMIN_CONSUMER_KEY" ] || [ -z "$GARMIN_CONSUMER_SECRET" ]; then
  echo "❌ Garmin credentials not set!"
  echo "   Please add these to your Replit Secrets or .env file:"
  echo "   - GARMIN_CONSUMER_KEY"
  echo "   - GARMIN_CONSUMER_SECRET"
  echo ""
  echo "   See GARMIN_OAUTH_SETUP.md for detailed instructions."
  exit 1
fi

# ============================================================================
# 2. CHECK CREDENTIAL FORMAT
# ============================================================================
echo "📋 Checking credential format..."
KEY_LEN=${#GARMIN_CONSUMER_KEY}
SECRET_LEN=${#GARMIN_CONSUMER_SECRET}

echo "Consumer Key length: $KEY_LEN characters"
echo "Consumer Secret length: $SECRET_LEN characters"
echo ""

if [ $KEY_LEN -lt 10 ]; then
  echo "⚠️  WARNING: Consumer Key seems too short (expected 16+ chars)"
fi

if [ $SECRET_LEN -lt 10 ]; then
  echo "⚠️  WARNING: Consumer Secret seems too short (expected 20+ chars)"
fi

# ============================================================================
# 3. TEST OAUTH ENDPOINT
# ============================================================================
echo ""
echo "🧪 Testing Garmin OAuth endpoint..."
echo "   (Replace YOUR_SERVER_URL with your actual server URL)"
echo ""

SERVER_URL="${1:-http://localhost:3000}"

echo "Making request to: $SERVER_URL/api/auth/garmin/start"
echo ""

curl -X POST "$SERVER_URL/api/auth/garmin/start" \
  -H "Content-Type: application/json" \
  -d '{
    "redirectUri": "'$SERVER_URL'/api/auth/garmin/callback",
    "appRedirect": "airuncoach://connected-devices"
  }' \
  -w "\n\n📊 HTTP Status: %{http_code}\n" \
  -v

echo ""
echo "============================================================"
echo "If you see 'Request token failed: 401 — Invalid signature'"
echo "then check:"
echo "  1. GARMIN_CONSUMER_KEY and GARMIN_CONSUMER_SECRET are correct"
echo "  2. No whitespace in the credentials"
echo "  3. Callback URL is registered correctly in Garmin Portal"
echo "============================================================"
