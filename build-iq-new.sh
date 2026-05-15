#!/bin/bash

# Build a BRAND NEW IQ file — never overwrites bin/AiRunCoach.iq
# Output: bin/AiRunCoach_new.iq

set -e

echo "🏗️  Building Brand New IQ File..."
echo "   Output: garmin-companion-app/bin/AiRunCoach_new.iq"
echo "   (Existing bin/AiRunCoach.iq is NOT touched)"
echo ""

cd garmin-companion-app

# Step 1: Locate monkeyc (checks PATH first, then known SDK location)
SDK_DEFAULT="$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks"
MONKEYC=""

if command -v monkeyc &> /dev/null; then
    MONKEYC="monkeyc"
else
    # Find the current SDK from Garmin's config
    CFG="$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg"
    if [ -f "$CFG" ]; then
        SDK_PATH=$(cat "$CFG")
        if [ -x "$SDK_PATH/bin/monkeyc" ]; then
            MONKEYC="$SDK_PATH/bin/monkeyc"
        fi
    fi
fi

if [ -z "$MONKEYC" ]; then
    echo "❌ ERROR: monkeyc not found!"
    echo ""
    echo "Install the Garmin Connect IQ SDK:"
    echo "  1. Download: https://developer.garmin.com/connect-iq/sdk/"
    echo "  2. Run the installer"
    echo "  3. Add to PATH:"
    echo "       export PATH=\"\$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks/<version>/bin:\$PATH\""
    echo "  4. Reload shell:  source ~/.zshrc"
    echo ""
    echo "See BUILD_IQ_FILE_INSTRUCTIONS.md for full details."
    exit 1
fi

echo "🔍 Checking Garmin SDK..."
VERSION=$("$MONKEYC" -v 2>&1 | head -1)
echo "✓ Found: $VERSION"
echo "   Binary: $MONKEYC"
echo ""

# Step 2: Build to new output file
echo "🔨 Compiling..."
echo ""

"$MONKEYC" \
  -o bin/AiRunCoach_new.iq \
  -f monkey.jungle \
  -y developer_key.der \
  -e \
  -r \
  2>&1 | tail -20

echo ""
echo "✓ Compilation done!"
echo ""

# Step 3: Verify output
echo "📊 Verifying output..."
if [ ! -f bin/AiRunCoach_new.iq ]; then
    echo "❌ ERROR: bin/AiRunCoach_new.iq was not created!"
    exit 1
fi

SIZE=$(ls -lh bin/AiRunCoach_new.iq | awk '{print $5}')
TYPE=$(file bin/AiRunCoach_new.iq | grep -o "7-zip\|data\|unknown")

echo "   File: bin/AiRunCoach_new.iq"
echo "   Size: $SIZE"
echo "   Type: $TYPE"
echo ""

# Step 4: Compare with existing file (if present)
if [ -f bin/AiRunCoach.iq ]; then
    OLD_SIZE=$(ls -lh bin/AiRunCoach.iq | awk '{print $5}')
    echo "📁 Existing file: bin/AiRunCoach.iq ($OLD_SIZE) — untouched"
    echo ""
fi

if [[ "$TYPE" == "7-zip" ]]; then
    echo "✅ SUCCESS — new IQ file is ready!"
    echo ""
    echo "🚀 Next steps:"
    echo "   • Review the new file before deploying"
    echo "   • To replace the main file:  cp bin/AiRunCoach_new.iq bin/AiRunCoach.iq"
    echo "   • Or upload AiRunCoach_new.iq directly to:"
    echo "     https://apps.garmin.com/en-US/developer/"
    echo ""
else
    echo "⚠️  WARNING: unexpected file type ($TYPE, $SIZE)"
    echo "   Expected: 7-zip, ~1 MB"
    echo "   Run manually to see full error output:"
    echo ""
    echo "   cd garmin-companion-app"
    echo "   monkeyc -o bin/AiRunCoach_new.iq -f monkey.jungle -y developer_key.der -e -r 2>&1"
    exit 1
fi

echo "✨ Done! New IQ file built without touching the original."
