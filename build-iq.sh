#!/bin/bash

# Elite Watch UI Build Script
# Builds the new IQ file with all latest changes

set -e  # Exit on any error

echo "🏗️  Building Elite Watch UI IQ File..."
echo ""

cd garmin-companion-app

# Step 1: Clean old build
echo "📦 Cleaning old build..."
rm -f bin/AiRunCoach.iq
echo "✓ Cleaned"
echo ""

# Step 2: Verify SDK is installed
echo "🔍 Checking Garmin SDK installation..."
if ! command -v monkeyc &> /dev/null; then
    echo "❌ ERROR: monkeyc not found!"
    echo ""
    echo "The Garmin SDK is not installed."
    echo "See BUILD_IQ_FILE_INSTRUCTIONS.md for installation steps."
    echo ""
    echo "Quick install:"
    echo "  1. Download from: https://developer.garmin.com/connect-iq/sdk/"
    echo "  2. Run installer"
    echo "  3. Add to PATH: export PATH=\"/Applications/ConnectIQ SDK/bin:\$PATH\""
    echo "  4. Reload shell: source ~/.zshrc"
    echo ""
    exit 1
fi

VERSION=$(monkeyc -v 2>&1 | head -1)
echo "✓ Found: $VERSION"
echo ""

# Step 3: Build
echo "🔨 Compiling Elite Watch UI..."
echo "   Devices: 55 watch models"
echo "   Flags: -e (package-app) -r (release) -y (signed)"
echo ""

monkeyc \
  -o bin/AiRunCoach.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r \
  2>&1 | tail -10

echo ""
echo "✓ Build completed!"
echo ""

# Step 4: Verify output
echo "📊 Verifying output..."
if [ ! -f bin/AiRunCoach.iq ]; then
    echo "❌ ERROR: bin/AiRunCoach.iq not found!"
    exit 1
fi

SIZE=$(ls -lh bin/AiRunCoach.iq | awk '{print $5}')
TYPE=$(file bin/AiRunCoach.iq | grep -o "7-zip\|data\|unknown")

echo "   File: bin/AiRunCoach.iq"
echo "   Size: $SIZE"
echo "   Type: $TYPE"
echo ""

if [[ "$TYPE" == "7-zip" ]] && [[ "$SIZE" == *"M"* || "$SIZE" == *"K"* ]]; then
    echo "✅ SUCCESS! IQ file is ready to deploy"
    echo ""
    echo "🚀 Next steps:"
    echo "   1. Upload to: https://apps.garmin.com/en-US/developer/"
    echo "   2. Select 'Update App' or 'Submit New Version'"
    echo "   3. Upload bin/AiRunCoach.iq"
    echo "   4. Add release notes (see BUILD_IQ_FILE_INSTRUCTIONS.md)"
    echo "   5. Submit for review"
    echo ""
else
    echo "⚠️  WARNING: File type or size unexpected"
    echo "   Expected: 7-zip, ~1.0 MB"
    echo "   Got: $TYPE, $SIZE"
    echo ""
    echo "   Check BUILD_IQ_FILE_INSTRUCTIONS.md for troubleshooting"
    exit 1
fi

echo "✨ Elite Watch UI IQ file build complete!"
