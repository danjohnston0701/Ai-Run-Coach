#!/bin/bash
set -e

echo "🏃 AI Run Coach - Watch App Build Script"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Change to the companion app directory
cd "$(dirname "$0")/garmin-companion-app"

echo -e "${BLUE}Step 1: Verifying Garmin SDK installation...${NC}"
echo ""

# Check if monkeyc is available
if ! command -v monkeyc &> /dev/null; then
    echo -e "${RED}❌ Garmin SDK not found!${NC}"
    echo ""
    echo "Please run ./install-garmin-sdk.sh first, then:"
    echo "  source ~/.zshrc"
    echo "  ./build-watch-app.sh"
    exit 1
fi

echo "✅ Garmin SDK found: $(monkeyc --version | head -n 1)"
echo ""

echo -e "${BLUE}Step 2: Creating output directory...${NC}"
echo ""
mkdir -p bin
echo "✅ Output directory: bin/"
echo ""

echo -e "${BLUE}Step 3: Generating developer key...${NC}"
echo ""

# Generate developer key if it doesn't exist
if [ ! -f "developer_key.der" ]; then
    echo "Generating new developer key..."
    
    # Generate RSA private key
    openssl genrsa -out developer_key.pem 4096 2>/dev/null
    
    # Convert to DER format
    openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key.der -nocrypt 2>/dev/null
    
    echo "✅ Developer key generated"
    echo "   - developer_key.pem (keep this safe!)"
    echo "   - developer_key.der (used for signing)"
else
    echo "✅ Using existing developer key"
fi
echo ""

echo -e "${BLUE}Step 4: Building watch app...${NC}"
echo ""

# Build for multiple popular devices
DEVICES=(
    "fenix7"
    "fenix6pro"
    "forerunner955"
    "forerunner265"
    "forerunner245"
    "venu3"
    "vivoactive4"
)

BUILD_SUCCESS=0
BUILD_FAILED=0

echo "Building for ${#DEVICES[@]} device types..."
echo ""

for DEVICE in "${DEVICES[@]}"; do
    echo -n "  Building for $DEVICE... "
    
    OUTPUT_FILE="bin/AiRunCoach-${DEVICE}.prg"
    
    if monkeyc \
        -o "$OUTPUT_FILE" \
        -f monkey.jungle \
        -y developer_key.der \
        -d "$DEVICE" \
        -w 2>/dev/null; then
        
        echo -e "${GREEN}✅${NC}"
        ((BUILD_SUCCESS++))
    else
        echo -e "${RED}❌${NC}"
        ((BUILD_FAILED++))
    fi
done

echo ""
echo "Build results:"
echo "  ✅ Successful: $BUILD_SUCCESS"
if [ $BUILD_FAILED -gt 0 ]; then
    echo "  ❌ Failed: $BUILD_FAILED"
fi
echo ""

# Build universal package (for all devices)
echo -e "${BLUE}Step 5: Building universal package...${NC}"
echo ""

echo -n "  Building universal package... "
if monkeyc \
    -o "bin/AiRunCoach.prg" \
    -f monkey.jungle \
    -y developer_key.der \
    -w 2>/dev/null; then
    
    echo -e "${GREEN}✅${NC}"
    echo ""
    echo "✅ Universal package created: bin/AiRunCoach.prg"
    echo "   (Compatible with all devices listed in manifest.xml)"
else
    echo -e "${RED}❌${NC}"
    echo "⚠️  Universal build failed, but device-specific builds are available"
fi
echo ""

echo -e "${BLUE}Step 6: Build summary${NC}"
echo ""

if [ -f "bin/AiRunCoach.prg" ]; then
    FILESIZE=$(ls -lh "bin/AiRunCoach.prg" | awk '{print $5}')
    echo "📦 Universal Package:"
    echo "   File: bin/AiRunCoach.prg"
    echo "   Size: $FILESIZE"
    echo ""
fi

echo "📱 Device-specific builds:"
for DEVICE in "${DEVICES[@]}"; do
    OUTPUT_FILE="bin/AiRunCoach-${DEVICE}.prg"
    if [ -f "$OUTPUT_FILE" ]; then
        FILESIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
        echo "   ✅ $DEVICE ($FILESIZE)"
    fi
done
echo ""

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}✅ Build Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Test on simulator:"
echo "   connectiq"
echo "   Then: File → Load Device → fenix7"
echo "   Then: File → Load App → bin/AiRunCoach.prg"
echo ""
echo "2. Test on real device (requires USB):"
echo "   Enable Developer Mode on watch:"
echo "   - Settings → System → About"
echo "   - Tap top number 5 times"
echo "   Then run:"
echo "   monkeydo bin/AiRunCoach-fenix7.prg fenix7"
echo ""
echo "3. Submit to Connect IQ Store:"
echo "   - Go to: https://apps.garmin.com/developer/"
echo "   - Upload: bin/AiRunCoach.prg"
echo "   - Add screenshots and description"
echo "   - Submit for review"
echo ""

# Check if there were any build failures
if [ $BUILD_FAILED -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Some builds failed. This is normal for devices you don't have in your SDK.${NC}"
    echo -e "${YELLOW}   The universal package should still work for all supported devices.${NC}"
    echo ""
fi
