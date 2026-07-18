#!/bin/bash

# AiRunCoach Google Play Store Release Build Script
# This script automates the process of building a release APK and AAB for Google Play Store

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_OUTPUT_DIR="$PROJECT_DIR/app/build/outputs"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AiRunCoach Release Build Script${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Function to print section headers
section() {
    echo -e "${YELLOW}▶ $1${NC}"
}

# Function to print success messages
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error messages
error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

# Check if local.properties exists
section "Checking Prerequisites"
if [ ! -f "$PROJECT_DIR/local.properties" ]; then
    error "local.properties not found. Please set up your signing credentials first."
fi
success "local.properties found"

# Verify KEYSTORE_PATH is set
KEYSTORE_PATH=$(grep "KEYSTORE_PATH" "$PROJECT_DIR/local.properties" | cut -d'=' -f2)
if [ -z "$KEYSTORE_PATH" ] || [ ! -f "$KEYSTORE_PATH" ]; then
    error "Keystore not found at: $KEYSTORE_PATH"
fi
success "Keystore verified at: $KEYSTORE_PATH"

# Read current version from build.gradle.kts
section "Reading Current Version"
VERSION_CODE=$(grep -m 1 "versionCode = " "$PROJECT_DIR/app/build.gradle.kts" | grep -o '[0-9]*' | head -1)
VERSION_NAME=$(grep -m 1 "versionName = " "$PROJECT_DIR/app/build.gradle.kts" | grep -oP '"\K[^"]+')
echo -e "  Version Code: ${BLUE}$VERSION_CODE${NC}"
echo -e "  Version Name: ${BLUE}$VERSION_NAME${NC}"

# Confirm build
echo -e "\n${YELLOW}Build Options:${NC}"
echo "1. Build AAB only (recommended for Play Store)"
echo "2. Build APK only"
echo "3. Build both AAB and APK"
echo "4. Exit"
echo ""
read -p "Choose option (1-4): " BUILD_OPTION

case $BUILD_OPTION in
    1)
        BUILD_TYPE="bundle"
        ;;
    2)
        BUILD_TYPE="apk"
        ;;
    3)
        BUILD_TYPE="both"
        ;;
    4)
        echo -e "${YELLOW}Build cancelled.${NC}"
        exit 0
        ;;
    *)
        error "Invalid option. Please choose 1-4."
        ;;
esac

# Clean build
section "Cleaning Previous Builds"
./gradlew clean || error "Clean failed"
success "Build cache cleared"

# Build AAB
if [ "$BUILD_TYPE" = "bundle" ] || [ "$BUILD_TYPE" = "both" ]; then
    section "Building Android App Bundle (AAB)"
    ./gradlew bundleRelease || error "AAB build failed"
    
    AAB_FILE="$BUILD_OUTPUT_DIR/bundle/release/app-release.aab"
    if [ -f "$AAB_FILE" ]; then
        AAB_SIZE=$(du -h "$AAB_FILE" | cut -f1)
        success "AAB build completed: $AAB_SIZE"
        echo -e "  Location: ${BLUE}$AAB_FILE${NC}"
    else
        error "AAB file not found at expected location"
    fi
fi

# Build APK
if [ "$BUILD_TYPE" = "apk" ] || [ "$BUILD_TYPE" = "both" ]; then
    section "Building Release APK"
    ./gradlew assembleRelease || error "APK build failed"
    
    APK_FILE="$BUILD_OUTPUT_DIR/apk/release/app-release.apk"
    if [ -f "$APK_FILE" ]; then
        APK_SIZE=$(du -h "$APK_FILE" | cut -f1)
        success "APK build completed: $APK_SIZE"
        echo -e "  Location: ${BLUE}$APK_FILE${NC}"
    else
        error "APK file not found at expected location"
    fi
fi

# Verify signing
section "Verifying Code Signing"
if [ "$BUILD_TYPE" = "apk" ] || [ "$BUILD_TYPE" = "both" ]; then
    if jarsigner -verify -verbose "$APK_FILE" > /dev/null 2>&1; then
        success "APK signature verified"
    else
        error "APK signature verification failed"
    fi
fi

# Generate checksums
section "Generating Checksums"
if [ "$BUILD_TYPE" = "bundle" ] || [ "$BUILD_TYPE" = "both" ]; then
    AAB_CHECKSUM=$(shasum -a 256 "$AAB_FILE" | awk '{print $1}')
    echo -e "  AAB SHA-256: ${BLUE}$AAB_CHECKSUM${NC}"
    echo "$AAB_CHECKSUM  app-release.aab" > "$PROJECT_DIR/checksums.txt"
fi

if [ "$BUILD_TYPE" = "apk" ] || [ "$BUILD_TYPE" = "both" ]; then
    APK_CHECKSUM=$(shasum -a 256 "$APK_FILE" | awk '{print $1}')
    echo -e "  APK SHA-256: ${BLUE}$APK_CHECKSUM${NC}"
    echo "$APK_CHECKSUM  app-release.apk" >> "$PROJECT_DIR/checksums.txt"
fi
success "Checksums saved to checksums.txt"

# Final summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Build Completed Successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Test the build on an Android device:"
if [ "$BUILD_TYPE" = "apk" ] || [ "$BUILD_TYPE" = "both" ]; then
    echo -e "   ${BLUE}adb install -r $APK_FILE${NC}"
fi
if [ "$BUILD_TYPE" = "bundle" ] || [ "$BUILD_TYPE" = "both" ]; then
    echo -e "   Or upload AAB to Google Play Console"
fi
echo ""
echo "2. Review release notes and metadata in Play Console"
echo "3. Create a new release and upload the build"
echo "4. Start a staged rollout (5% → 25% → 100%)"
echo ""
echo -e "${BLUE}Build artifacts:${NC}"
if [ "$BUILD_TYPE" = "bundle" ] || [ "$BUILD_TYPE" = "both" ]; then
    echo "  AAB: $AAB_FILE"
fi
if [ "$BUILD_TYPE" = "apk" ] || [ "$BUILD_TYPE" = "both" ]; then
    echo "  APK: $APK_FILE"
fi
echo ""
