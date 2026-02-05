#!/bin/bash
# Launch Garmin Connect IQ Simulator with AI Run Coach app
# Usage: ./launch-garmin-simulator.sh

echo "🚀 Launching Garmin Connect IQ Simulator..."
echo ""

# Path to Connect IQ SDK
CIQ_SDK="/Users/danieljohnston/Library/Application Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-8.4.0-2025-12-03-5122605dc"

# Check if simulator is already running
if pgrep -f "ConnectIQ.app" > /dev/null; then
    echo "✅ Simulator already running"
else
    echo "🔄 Starting simulator..."
    "$CIQ_SDK/bin/connectiq" &
    sleep 3
fi

echo "📱 Loading Fenix 7 device..."
echo "📦 Loading AI Run Coach app..."
echo ""

# Navigate to companion app directory
cd "$(dirname "$0")/garmin-companion-app"

# Load the app on Fenix 7 simulator
"$CIQ_SDK/bin/monkeydo" bin/AiRunCoach.prg fenix7 &

echo ""
echo "✨ Done! Check the simulator window."
echo ""
echo "Simulator controls:"
echo "  - Center button (or Enter): Start run / Select"
echo "  - Back button (or Esc): Pause / Back"
echo "  - Menu button (or M): Show menu"
echo "  - Arrow keys: Navigate up/down"
echo ""
echo "To close simulator: Close the window or press Ctrl+C here"
