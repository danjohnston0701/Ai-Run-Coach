#!/bin/bash

# ============================================================================
# AI Run Coach - Automated IQ File Build Script
# ============================================================================
# This script builds the new IQ file with the updated running icon
#
# Prerequisites:
#   1. Garmin SDK installed and in PATH
#   2. Developer key: garmin-companion-app/developer_key.der
#   3. Source files in garmin-companion-app/source/
#   4. New icon: garmin-companion-app/resources/drawables/launcher_icon.png
#
# Usage:
#   chmod +x build-iq-automated.sh
#   ./build-iq-automated.sh
# ============================================================================

set -e  # Exit on any error

echo "🏗️  AI Run Coach - IQ File Builder"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCH_DIR="$PROJECT_ROOT/garmin-companion-app"
BIN_DIR="$WATCH_DIR/bin"
MANIFEST="$WATCH_DIR/manifest.xml"
DEVELOPER_KEY="$WATCH_DIR/developer_key.der"
MONKEY_JUNGLE="$WATCH_DIR/monkey.jungle"
OUTPUT_FILE="$BIN_DIR/AiRunCoach.iq"

echo "📁 Project Root: $PROJECT_ROOT"
echo "📁 Watch App Dir: $WATCH_DIR"
echo ""

# ============================================================================
# STEP 1: Verify Garmin SDK Installation
# ============================================================================
echo "🔍 Step 1: Checking Garmin SDK..."

if ! command -v monkeyc &> /dev/null; then
    echo -e "${RED}✗ ERROR: monkeyc not found!${NC}"
    echo ""
    echo "The Garmin Connect IQ SDK is not installed or not in PATH."
    echo ""
    echo "📥 Installation Steps:"
    echo "  1. Visit: https://developer.garmin.com/connect-iq/sdk/"
    echo "  2. Download the macOS SDK"
    echo "  3. Run the installer"
    echo "  4. Add to PATH in ~/.zshrc:"
    echo "     export PATH=\"/Applications/ConnectIQ SDK/bin:\$PATH\""
    echo "  5. Reload shell:"
    echo "     source ~/.zshrc"
    echo "  6. Verify installation:"
    echo "     monkeyc -v"
    echo ""
    exit 1
fi

SDK_VERSION=$(monkeyc -v 2>&1 | head -1)
echo -e "${GREEN}✓ Found: $SDK_VERSION${NC}"
echo ""

# ============================================================================
# STEP 2: Verify Project Files
# ============================================================================
echo "🔍 Step 2: Verifying project files..."

FILES_OK=true

if [ ! -f "$MANIFEST" ]; then
    echo -e "${RED}✗ Missing: manifest.xml${NC}"
    FILES_OK=false
else
    echo -e "${GREEN}✓ Found: manifest.xml${NC}"
fi

if [ ! -f "$DEVELOPER_KEY" ]; then
    echo -e "${RED}✗ Missing: developer_key.der${NC}"
    FILES_OK=false
else
    echo -e "${GREEN}✓ Found: developer_key.der${NC}"
fi

if [ ! -f "$MONKEY_JUNGLE" ]; then
    echo -e "${RED}✗ Missing: monkey.jungle${NC}"
    FILES_OK=false
else
    echo -e "${GREEN}✓ Found: monkey.jungle${NC}"
fi

ICON_FILE="$WATCH_DIR/resources/drawables/launcher_icon.png"
if [ ! -f "$ICON_FILE" ]; then
    echo -e "${RED}✗ Missing: launcher_icon.png${NC}"
    FILES_OK=false
else
    echo -e "${GREEN}✓ Found: launcher_icon.png (new running icon)${NC}"
fi

if [ "$FILES_OK" = false ]; then
    echo ""
    echo -e "${RED}✗ Missing required files!${NC}"
    exit 1
fi

echo ""

# ============================================================================
# STEP 3: Clean Old Build
# ============================================================================
echo "🧹 Step 3: Cleaning old build..."

if [ -f "$OUTPUT_FILE" ]; then
    rm -f "$OUTPUT_FILE"
    echo -e "${GREEN}✓ Removed old IQ file${NC}"
else
    echo -e "${YELLOW}ℹ️  No old IQ file found${NC}"
fi

echo ""

# ============================================================================
# STEP 4: Build IQ File
# ============================================================================
echo "🔨 Step 4: Compiling..."
echo "   Output: $OUTPUT_FILE"
echo "   Devices: 55 Garmin watch models"
echo "   Mode: Release (-r flag)"
echo "   Format: Packaged IQ (-e flag)"
echo ""

cd "$WATCH_DIR"

# Build with all flags
monkeyc \
  -o "$OUTPUT_FILE" \
  -f "$MONKEY_JUNGLE" \
  -y "$DEVELOPER_KEY" \
  -e \
  -r \
  2>&1 | tee /tmp/monkeyc_build.log

BUILD_RESULT=${PIPESTATUS[0]}

if [ $BUILD_RESULT -ne 0 ]; then
    echo ""
    echo -e "${RED}✗ BUILD FAILED!${NC}"
    echo ""
    echo "Check the output above for errors."
    echo "Full log: /tmp/monkeyc_build.log"
    exit 1
fi

echo ""

# ============================================================================
# STEP 5: Verify Output
# ============================================================================
echo "📊 Step 5: Verifying output..."

if [ ! -f "$OUTPUT_FILE" ]; then
    echo -e "${RED}✗ ERROR: Output file not created!${NC}"
    exit 1
fi

# Check file size
SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
SIZE_BYTES=$(ls -l "$OUTPUT_FILE" | awk '{print $5}')

echo -e "${GREEN}✓ File created: $OUTPUT_FILE${NC}"
echo "  Size: $SIZE ($SIZE_BYTES bytes)"

# Check file type
FILE_TYPE=$(file "$OUTPUT_FILE" | grep -o "7-zip\|Zip\|data" || echo "unknown")
if [[ "$FILE_TYPE" == "7-zip" ]]; then
    echo -e "${GREEN}✓ File type: 7-zip archive (correct)${NC}"
else
    echo -e "${YELLOW}⚠️  File type: $FILE_TYPE (expected 7-zip)${NC}"
fi

# Verify minimum size (should be at least 500 KB)
if [ "$SIZE_BYTES" -lt 500000 ]; then
    echo -e "${YELLOW}⚠️  File size seems small (< 500 KB)${NC}"
    echo "   This might indicate a build problem."
else
    echo -e "${GREEN}✓ File size is reasonable${NC}"
fi

echo ""

# ============================================================================
# STEP 6: Display Success Message
# ============================================================================
echo "✨ BUILD SUCCESSFUL! ✨"
echo ""
echo "📦 Your new IQ file is ready:"
echo "   $OUTPUT_FILE"
echo ""
echo "📋 What's included:"
echo "   ✓ New running icon (teal background, white stick figure)"
echo "   ✓ All Garmin watch models (55 devices)"
echo "   ✓ Latest source code"
echo "   ✓ Signed with your developer key"
echo "   ✓ Optimized for release"
echo ""

# ============================================================================
# STEP 7: Next Steps
# ============================================================================
echo "🚀 Next Steps:"
echo ""
echo "1️⃣  Test on your Garmin watch (optional):"
echo "   monkeydo $OUTPUT_FILE fenix7"
echo ""
echo "2️⃣  Upload to Garmin Store:"
echo "   • Go to: https://apps.garmin.com/en-US/developer/"
echo "   • Find: AI Run Coach"
echo "   • Click: Update App"
echo "   • Upload: $OUTPUT_FILE"
echo "   • Add release notes"
echo "   • Submit for review"
echo ""
echo "3️⃣  Optional - Bump version first:"
echo "   Edit: garmin-companion-app/manifest.xml"
echo "   Change: version=\"2.1.0\" → version=\"2.2.0\""
echo "   Then rebuild this script"
echo ""
echo "📖 More info:"
echo "   • Build log: /tmp/monkeyc_build.log"
echo "   • Manifest: $MANIFEST"
echo "   • Icon file: $ICON_FILE"
echo ""
echo "✅ All done!"
echo ""
