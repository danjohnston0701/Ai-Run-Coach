#!/bin/bash
# Run the Android app (on an emulator) against the Garmin Connect IQ Simulator
# with NO real watch hardware, using Garmin's officially-documented TETHERED
# connection mode: the phone app talks to the desktop simulator over
# `adb forward tcp:7381 tcp:7381` instead of real BLE. adb forward works
# identically against an emulator or a real USB-connected phone — it's just
# an ADB target — so this is what makes a no-hardware Android+Garmin dev loop
# possible.
#
# Usage:
#   ./launch-garmin-simulator-tethered.sh [device] [avd]
#     device  Garmin device id from garmin-companion-app/manifest.xml (default: vivoactive4)
#     avd     Android emulator AVD name (default: first AVD found, or set below)
#
# What this does NOT do: simulate real BLE flakiness (dropped/redelivered
# messages, corrupted payloads). The tethered channel is reliable by
# construction, so it validates app LOGIC, not radio-flakiness bugs.
set -e

cd "$(dirname "$0")"

DEVICE="${1:-vivoactive4}"
AVD="${2:-}"

# ── Resolve Android SDK ──────────────────────────────────────────────────────
ANDROID_SDK="$(grep '^sdk.dir=' local.properties 2>/dev/null | cut -d= -f2-)"
if [ -z "$ANDROID_SDK" ]; then
  echo "❌ Could not read sdk.dir from local.properties"
  exit 1
fi
ADB="$ANDROID_SDK/platform-tools/adb"
EMULATOR="$ANDROID_SDK/emulator/emulator"
if [ ! -x "$ADB" ] || [ ! -x "$EMULATOR" ]; then
  echo "❌ adb or emulator binary not found under $ANDROID_SDK"
  exit 1
fi

if [ -z "$AVD" ]; then
  # Prefer a phone-shaped AVD (skip anything with "Wear" in the name)
  AVD="$("$EMULATOR" -list-avds | grep -vi wear | head -1)"
  if [ -z "$AVD" ]; then
    echo "❌ No non-Wear AVD found. Create one in Android Studio's Device Manager first."
    exit 1
  fi
fi

# ── Resolve Connect IQ SDK (latest installed) ────────────────────────────────
CIQ_BASE="$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks"
CIQ_SDK="$(ls -d "$CIQ_BASE"/connectiq-sdk-mac-* 2>/dev/null | sort -V | tail -1)"
if [ -z "$CIQ_SDK" ]; then
  echo "❌ No Connect IQ SDK found under $CIQ_BASE"
  exit 1
fi

echo "📱 Android SDK:    $ANDROID_SDK"
echo "⌚ Connect IQ SDK: $CIQ_SDK"
echo "🎯 Device: $DEVICE   AVD: $AVD"
echo ""

# ── 1. Ensure an emulator is running ─────────────────────────────────────────
if ! "$ADB" devices | grep -q "^emulator-.*device$"; then
  echo "🔄 No emulator running — starting $AVD (this can take a minute)..."
  "$EMULATOR" -avd "$AVD" >/dev/null 2>&1 &
  "$ADB" wait-for-device
  echo "⏳ Waiting for boot to complete..."
  until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    sleep 2
  done
fi
echo "✅ Emulator ready"
echo ""

# ── 2. Build + install the debug APK with the tethered flag enabled ─────────
echo "🔨 Building + installing debug APK (tethered Garmin simulator enabled)..."
./gradlew installDebug -PtetheredGarminSim=true

# ── 3. Forward the Connect IQ tethered port ──────────────────────────────────
"$ADB" forward tcp:7381 tcp:7381
echo "🔌 adb forward tcp:7381 tcp:7381 established"
echo ""

# ── 4. Build the watch app for the simulator ─────────────────────────────────
# -r (release monkeyc mode) is required here even though this isn't a store
# upload: RunView.mc's (:debug)/(:release) split means a non-release build
# picks the (:debug) preview-seed-data shortcut, which skips the real
# auth/GPS/BT-command code path we actually want to exercise over TETHERED.
cd garmin-companion-app
mkdir -p bin
rm -f "bin/AiRunCoach_tethered_${DEVICE}.prg"
"$CIQ_SDK/bin/monkeyc" \
  -o "bin/AiRunCoach_tethered_${DEVICE}.prg" \
  -f monkey.jungle \
  -y developer_key.der \
  -d "$DEVICE" \
  -r
echo "✅ Watch app built: garmin-companion-app/bin/AiRunCoach_tethered_${DEVICE}.prg"
echo ""

# ── 5. Launch the Connect IQ Simulator and load the app ──────────────────────
if ! pgrep -f "ConnectIQ.app" > /dev/null; then
  echo "🚀 Starting Connect IQ Simulator..."
  "$CIQ_SDK/bin/connectiq" &
  sleep 5
fi
echo "📦 Loading AiRunCoach onto simulated $DEVICE..."
"$CIQ_SDK/bin/monkeydo" "bin/AiRunCoach_tethered_${DEVICE}.prg" "$DEVICE" &
cd ..

cat <<EOF

✨ Setup complete.

Next steps (manual, on your Mac):
  1. Open the AiRunCoach app on the emulator ($AVD) as normal. GarminWatchManager
     is now running in TETHERED mode — it should discover the simulator over
     the forwarded port the same way it would discover a real paired watch.
  2. In the Connect IQ Simulator window, drive activity data:
       - Its built-in sensor/GPS panel (or a .fit file) feeds location/HR/cadence.
       - The on-screen device buttons send real Start/Pause/Stop/Resume commands
         through the same code path GarminWatchManager.kt handles for a real
         watch — this is what lets you replicate the pause/dropped-stop class
         of bug without a physical Garmin device.
  3. Watch phone-side logs live:
       $ADB logcat -s RunTrackingService:* GarminWatchManager:* AiRunCoachFCM:*

Known limitation: this channel is reliable by construction — it will NOT
reproduce real-BLE flakiness (dropped/redelivered messages, corrupted
payloads). Use it to validate app logic; still confirm flaky-radio fixes on
a real watch.

To tear down: close the Connect IQ Simulator and the emulator, then run
  $ADB forward --remove tcp:7381
EOF
