#!/bin/bash
# Cleanly restart the Connect IQ simulator and load the (:video) recording build.
#   tools/watch-restart.sh [device]      (default fr965; log → takes/watch-console.log)
# The simulator wedges easily (white screen, frozen VM) — a full restart is the reliable reset.
# Build first:  cd garmin-companion-app && monkeyc -f monkey_video.jungle -d fr965 \
#                 -o bin/AiRunCoach_video.prg -y developer_key.der -r
DEV=${1:-fr965}
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
SDK="$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-9.1.0-2026-03-09-6a872a80b"
LOG="$HERE/takes/watch-console.log"
mkdir -p "$HERE/takes"
pkill -f MonkeyDoDeux; pkill -f "bin/monkeydo"
PID=$(pgrep -f "ConnectIQ.app/Contents/MacOS/simulator")
if [ -n "$PID" ]; then kill $PID; for i in $(seq 1 10); do kill -0 $PID 2>/dev/null || break; sleep 1; done; kill -9 $PID 2>/dev/null; fi
sleep 2
("$SDK/bin/connectiq" >/dev/null 2>&1 &)
sleep 35
open -a "$SDK/bin/ConnectIQ.app"
cd "$REPO/garmin-companion-app"
("$SDK/bin/monkeydo" bin/AiRunCoach_video.prg "$DEV" > "$LOG" 2>&1 &)
for i in $(seq 1 60); do grep -q "AI Run Coach started" "$LOG" && break; sleep 1; done
grep -m1 "AI Run Coach started" "$LOG" || echo "WATCH APP DID NOT START"
