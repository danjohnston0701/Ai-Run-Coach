#!/bin/bash

# Run FR55 Simulator with Debug Mode
# This builds the app with :debug annotations enabled for simulator preview mode

cd "$(dirname "$0")/garmin-companion-app" || exit 1

# Find the latest Garmin Connect IQ SDK
SDK=$(ls -d "$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks/"*/ 2>/dev/null | sort -V | tail -1)

if [ -z "$SDK" ]; then
    echo "❌ Error: Garmin Connect IQ SDK not found!"
    echo "Please install it from: https://developer.garmin.com/connect-iq/sdk/"
    exit 1
fi

# Add SDK to PATH
export PATH="$SDK/bin:$PATH"

echo "Using SDK: $SDK"
echo ""
echo "🔨 Building for Forerunner 55 (with simulator preview mode)..."
echo ""

# Build with debug annotations for simulator preview
monkeyc -o bin/AiRunCoach_fr55_debug.prg -f monkey_debug.jungle -y developer_key.der -d fr55 -w

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "📱 Opening Connect IQ Simulator..."
    echo ""
    echo "⚠️  Once the simulator opens:"
    echo "   1. File → Load Device → Forerunner 55"
    echo "   2. File → Load App → garmin-companion-app/bin/AiRunCoach_fr55_debug.prg"
    echo "   3. The app will show with pre-seeded data for preview"
    echo ""
    
    sleep 1
    connectiq &
    
    echo "💡 Tip: To rebuild and reload, run this script again"
else
    echo ""
    echo "❌ Build failed!"
    exit 1
fi
