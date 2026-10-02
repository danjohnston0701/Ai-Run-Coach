#!/bin/bash
# Films one Connect IQ simulator take of the (:video) watch build, with the scripted run
# fast-forwarded by SKIP seconds at START (VIDEO_SKIP_SEC in RunView.mc is patched for the build
# and put back to 0 afterwards).
#   tools/watch-take.sh <name> <skip-sec> <seconds-to-film-after-START> [device]
# e.g.  watch-take.sh watch-start 0 15     code → prepare → GPS → START → first seconds
#       watch-take.sh watch-run   200 150  elapsed 3:20 → 5:50
#       watch-take.sh watch-finish 1590 40 26:30 → FINISHED
# Writes takes/<name>.mp4 (wall-clock timed, see watchcap.sh) and takes/<name>.events.log with
# wall-clock times of "recording started" and "START" so clips can be aligned by elapsed time.
set -u
NAME=$1; SKIP=$2; AFTER=$3; DEV=${4:-fr965}
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
SDK="$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-9.1.0-2026-03-09-6a872a80b"
APPDIR="$REPO/garmin-companion-app"
LOG="$HERE/takes/watch-console.log"
EV="$HERE/takes/$NAME.events.log"; : > "$EV"
ev() { echo "$(python3 -c 'import time;print(f"{time.time():.3f}")') $*" | tee -a "$EV"; }

sed -i '' "s/private const VIDEO_SKIP_SEC = [0-9]*;/private const VIDEO_SKIP_SEC = $SKIP;/" "$APPDIR/source/views/RunView.mc"
(cd "$APPDIR" && "$SDK/bin/monkeyc" -f monkey_video.jungle -d "$DEV" -o bin/AiRunCoach_video.prg -y developer_key.der -r 2>&1 | grep -E "ERROR|BUILD")
sed -i '' "s/private const VIDEO_SKIP_SEC = [0-9]*;/private const VIDEO_SKIP_SEC = 0;/" "$APPDIR/source/views/RunView.mc"

"$HERE/tools/watch-restart.sh" "$DEV" >/dev/null
"$HERE/tools/watchcap.sh" "$HERE/takes/$NAME.mp4" &
REC=$!
ev "rec start"
for i in $(seq 1 600); do grep -q "startRun() entry\|VIDEO: step 3" "$LOG" && break; sleep 0.25; done
ev "START (skip $SKIP)"
sleep "$AFTER"
kill -TERM $REC; wait $REC 2>/dev/null
ev "rec stop"
