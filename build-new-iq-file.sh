#!/bin/bash

# ============================================================================
# AI Run Coach - Build New IQ File for Garmin Connect IQ Store
# ============================================================================
# This script builds a production-ready .iq file for Garmin Store submission
# 
# Usage:
#   bash build-new-iq-file.sh              # Build with current version
#   bash build-new-iq-file.sh 3.1.9        # Build with specific version
#
# Requirements:
#   - Garmin Connect IQ SDK installed
#   - Developer key (developer_key.der)
#   - Monkey C compiler in PATH
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/garmin-companion-app"
MANIFEST="$APP_DIR/manifest.xml"
DEVELOPER_KEY="$APP_DIR/developer_key.der"
OUTPUT_FILE="$APP_DIR/bin/AiRunCoach.iq"

# ────────────────────────────────────────────────────────────────────────────
# 1. VERIFY PREREQUISITES
# ───────────────────────────��────────────────────────────────────────────────

echo "🔍 Verifying prerequisites..."

# Auto-detect the latest Garmin Connect IQ SDK from the standard macOS location.
# This mirrors the approach in run_fr55_simulator.sh so the script works without
# requiring the user to manually add the SDK to their PATH.
SDK=$(ls -d "$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks/"*/ 2>/dev/null | sort -V | tail -1)
if [ -n "$SDK" ]; then
    export PATH="$SDK/bin:$PATH"
    echo "✅ SDK auto-detected: $SDK"
fi

# Check if monkeyc is now resolvable
if ! command -v monkeyc &> /dev/null; then
    echo "❌ ERROR: Garmin SDK not found!"
    echo ""
    echo "Install Garmin Connect IQ SDK from:"
    echo "   https://developer.garmin.com/connect-iq/sdk/"
    echo ""
    echo "The SDK installer places it in:"
    echo "   ~/Library/Application Support/Garmin/ConnectIQ/Sdks/"
    exit 1
fi

echo "✅ Garmin SDK found: $(monkeyc -v)"

# Check if manifest exists
if [ ! -f "$MANIFEST" ]; then
    echo "❌ ERROR: manifest.xml not found at $MANIFEST"
    exit 1
fi

echo "✅ Manifest found: $MANIFEST"

# Check if developer key exists
if [ ! -f "$DEVELOPER_KEY" ]; then
    echo "❌ ERROR: developer_key.der not found at $DEVELOPER_KEY"
    exit 1
fi

echo "✅ Developer key found: $DEVELOPER_KEY"

# ────────────────────────────────────────────────────────────────────────────
# 2. GET CURRENT VERSION
# ──────────────────────────────────────────────────────────────────���─────────

# Extract the app version from the <iq:application> line only.
# Using grep + sed (not grep -P) so it works on macOS's BSD grep.
CURRENT_VERSION=$(grep 'iq:application' "$MANIFEST" | grep -oE 'version="[^"]+"' | sed 's/version="//;s/"//')
echo "📌 Current version in manifest: $CURRENT_VERSION"

# Allow override via command line argument
if [ -n "$1" ]; then
    NEW_VERSION="$1"
    echo "📝 Using override version: $NEW_VERSION"

    # Update ONLY the <iq:application ... version="x.y.z"> attribute.
    # The outer <iq:manifest version="3"> is the XML schema version (must stay
    # as the integer "3") and must NOT be changed — hence the iq:application
    # anchor in the pattern.
    sed -i.bak 's/\(iq:application[^>]*version="\)[^"]*/\1'"$NEW_VERSION"'/' "$MANIFEST"
    rm -f "$MANIFEST.bak"
    echo "✅ Updated manifest to version $NEW_VERSION"
else
    NEW_VERSION="$CURRENT_VERSION"
fi

# ────────────────────────────────────────────────────────────────────────────
# 3. CLEAN PREVIOUS BUILD
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "🧹 Cleaning previous build..."
rm -f "$OUTPUT_FILE"
echo "✅ Cleaned"

# ────────────────────────────────────────────────────────────────────────────
# 4. BUILD IQ FILE
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "🏗️  Building IQ file for 24 Garmin devices..."
echo "   Devices: Fenix, Forerunner, VivoActive, Venu series"
echo ""

cd "$APP_DIR"

if monkeyc \
    -o "$OUTPUT_FILE" \
    -f monkey.jungle \
    -y developer_key.der \
    -e \
    -r; then
    
    echo ""
    echo "✨ BUILD SUCCESSFUL! ✨"
    
    # ────────────────────────────────────────────────────────────────────────
    # 5. VERIFY OUTPUT
    # ────────────────────────────────────────────────────────────────────────
    
    if [ -f "$OUTPUT_FILE" ]; then
        SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
        FILE_TYPE=$(file "$OUTPUT_FILE")
        
        echo ""
        echo "📦 Output File:"
        echo "   Path: $OUTPUT_FILE"
        echo "   Size: $SIZE"
        echo "   Type: $FILE_TYPE"
        echo ""
        
        # Verify it's a 7-zip file
        if echo "$FILE_TYPE" | grep -q "7-zip"; then
            echo "✅ File format is correct (7-zip archive)"
        else
            echo "⚠️  WARNING: File type might be incorrect"
            echo "   Expected: 7-zip archive data"
            echo "   Got: $FILE_TYPE"
        fi
        
        # Show file preview
        echo ""
        echo "📋 Archive Contents (preview):"
        unzip -l "$OUTPUT_FILE" 2>/dev/null | head -20 || echo "   (Could not read archive)"
        
        # ────────────────────────────────────────────────────────────────────
        # 6. NEXT STEPS
        # ──────────────────────��─────────────────────────────────────────────
        
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📤 NEXT STEPS: Upload to Garmin Store"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "1. Go to Garmin Developer Portal:"
        echo "   https://apps.garmin.com/developer/dashboard"
        echo ""
        echo "2. Find 'AI Run Coach' and click 'Edit'"
        echo ""
        echo "3. Click 'New Version' → 'Upload Binary'"
        echo ""
        echo "4. Select this file:"
        echo "   $OUTPUT_FILE"
        echo ""
        echo "5. Add release notes and submit for review"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "✅ Your IQ file is ready!"
        echo ""
        
    else
        echo "❌ ERROR: Output file was not created"
        exit 1
    fi
else
    echo ""
    echo "❌ BUILD FAILED"
    echo "Check the error messages above for details"
    exit 1
fi
