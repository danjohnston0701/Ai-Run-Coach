#!/bin/bash

# Backend Endpoint Test Script
# Tests if the production backend is properly serving API endpoints

echo "🔍 Testing AI Run Coach Backend Endpoints..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

BACKEND_URL="https://airuncoach.live"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local endpoint=$1
    local expected_code=$2
    local description=$3
    
    echo -n "Testing: $description... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}|%{content_type}" "$BACKEND_URL$endpoint" 2>&1)
    status_code=$(echo $response | cut -d'|' -f1)
    content_type=$(echo $response | cut -d'|' -f2)
    
    if [ "$status_code" = "$expected_code" ]; then
        # Check if it's returning JSON (not HTML)
        if [[ $content_type == *"application/json"* ]] || [[ $content_type == *"json"* ]]; then
            echo -e "${GREEN}✅ PASS${NC} (HTTP $status_code, Content-Type: $content_type)"
            return 0
        elif [[ $content_type == *"text/html"* ]]; then
            echo -e "${RED}❌ FAIL${NC} (HTTP $status_code, but returning HTML instead of JSON!)"
            return 1
        else
            echo -e "${YELLOW}⚠️  WARN${NC} (HTTP $status_code, Content-Type: $content_type)"
            return 2
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (Expected HTTP $expected_code, got HTTP $status_code)"
        return 1
    fi
}

# Track results
PASSED=0
FAILED=0
WARNINGS=0

echo "🏥 Testing Core API Endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test endpoints
test_endpoint "/api/goals/test-user-id" "401" "Goals Endpoint (should require auth: 401)"
result=$?
[ $result -eq 0 ] && ((PASSED++))
[ $result -eq 1 ] && ((FAILED++))
[ $result -eq 2 ] && ((WARNINGS++))

test_endpoint "/api/runs/user/test-user-id" "401" "Runs Endpoint (should require auth: 401)"
result=$?
[ $result -eq 0 ] && ((PASSED++))
[ $result -eq 1 ] && ((FAILED++))
[ $result -eq 2 ] && ((WARNINGS++))

test_endpoint "/api/auth/login" "400" "Login Endpoint (should accept requests: 400 for missing body)"
result=$?
[ $result -eq 0 ] && ((PASSED++))
[ $result -eq 1 ] && ((FAILED++))
[ $result -eq 2 ] && ((WARNINGS++))

test_endpoint "/api/auth/register" "400" "Register Endpoint (should accept requests: 400 for missing body)"
result=$?
[ $result -eq 0 ] && ((PASSED++))
[ $result -eq 1 ] && ((FAILED++))
[ $result -eq 2 ] && ((WARNINGS++))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Results:"
echo -e "  ${GREEN}Passed:${NC} $PASSED"
echo -e "  ${RED}Failed:${NC} $FAILED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}🚨 BACKEND ISSUES DETECTED${NC}"
    echo ""
    echo "Common problems:"
    echo "  1. Backend not deployed or outdated"
    echo "  2. API endpoints missing from production"
    echo "  3. Server returning HTML instead of JSON"
    echo ""
    echo "📖 See PRODUCTION_BACKEND_FIX.md for detailed troubleshooting steps"
    echo ""
    exit 1
else
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "Backend appears to be properly configured."
    echo "Note: 401 responses are expected for auth-protected endpoints."
    echo ""
    exit 0
fi
