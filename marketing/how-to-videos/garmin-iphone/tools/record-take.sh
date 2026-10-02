#!/bin/bash
# Records the raw takes for the Garmin + iPhone video into takes/.
#
#   tools/record-take.sh pairing   iPhone: Profile → Connected Devices → pair with code (unpaired mode)
#                                  + watch: pairing code screen → linked → "Prepare on Phone" (~70 s)
#   tools/record-take.sh watch-pairing   just the watch half of "pairing"
#   tools/record-take.sh main      Both, continuously: phone Prepare for Watch → Waiting for Watch;
#                                  watch prepared → GPS → START (fires the phone's START at the same
#                                  moment) → full 5 km run (~27 min) → FINISHED. Stops recording
#                                  when the watch finishes; the Run Summary is recorded separately.
#
# Needs: the (:video) watch build (see watch-restart.sh), the iOS debug build installed in the
# simulator (VideoDemoMode.swift), Maestro, ffmpeg. Both recorders capture their own window /
# framebuffer, so other windows on top don't matter (watchcap.sh — not screen-region capture,
# which once filmed a Teams call sitting over the watch).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TAKES="$HERE/takes"; FLOWS="$HERE/tools/flows"; mkdir -p "$TAKES"
UDID=A51070DA-94AD-4BB6-9CC6-A35CD96D9735
BID=live.airuncoach.Ai-Run-Coach
MAESTRO=~/.maestro/bin/maestro
WLOG="$TAKES/watch-console.log"
STAMP=$(date +%H%M%S)
EVENTS="$TAKES/events-$1-$STAMP.log"

ev() { echo "$(python3 -c 'import time;print(f"{time.time():.3f}")') $*" | tee -a "$EVENTS"; }

start_watch_rec() {   # $1 = output file
    "$HERE/tools/watchcap.sh" "$1" &
    WREC=$!
    ev "watch-rec start $1"
}
stop_watch_rec() { kill -TERM $WREC 2>/dev/null; wait $WREC 2>/dev/null; ev "watch-rec stop"; }

start_phone_rec() {
    xcrun simctl io $UDID recordVideo --codec h264 --force "$1" >/dev/null 2>&1 &
    PREC=$!; sleep 2; ev "phone-rec start $1"
}
stop_phone_rec() { kill -INT $PREC 2>/dev/null; wait $PREC 2>/dev/null; ev "phone-rec stop"; }

launch_app() {   # extra launch args
    xcrun simctl status_bar $UDID override --time "9:41" --batteryState charged --batteryLevel 100 \
        --cellularMode active --cellularBars 4 --wifiBars 3 --dataNetwork wifi
    xcrun simctl location $UDID set -37.8037304,175.2787541
    (xcrun simctl launch --terminate-running-process --console-pty $UDID $BID -ARCVideoDemo "$@" \
        > "$TAKES/app-console-$STAMP.log" 2>&1 &)
    sleep 10
}

flow() { ev "flow $1 begin"; $MAESTRO --device $UDID test "$FLOWS/$1" 2>&1 | grep -E "FAILED|not found" ; ev "flow $1 end"; }

wait_watch() {   # $1 = log pattern, $2 = timeout s
    for i in $(seq 1 $(( $2 * 4 ))); do grep -q "$1" "$WLOG" 2>/dev/null && return 0; sleep 0.25; done
    ev "TIMEOUT waiting for '$1'"; return 1
}

caffeinate -dimsu -w $$ &

case "$1" in
pairing|watch-pairing)
    "$HERE/tools/watch-restart.sh" >/dev/null
    start_watch_rec "$TAKES/watch-pairing-$STAMP.mp4"
    wait_watch "pairing code displayed" 60 && ev "watch code shown"
    wait_watch "VIDEO: step 1" 60 && ev "watch linked"
    sleep 20; stop_watch_rec
    [ "$1" = watch-pairing ] && { ev "done"; exit 0; }
    launch_app -ARCVideoDemoUnpaired
    start_phone_rec "$TAKES/phone-pairing-$STAMP.mp4"
    flow pair-1-to-code-sheet.yaml
    flow pair-2-type-code.yaml
    sleep 2; stop_phone_rec
    ;;
main)
    launch_app
    "$HERE/tools/watch-restart.sh" >/dev/null
    start_watch_rec "$TAKES/watch-main-$STAMP.mp4"
    start_phone_rec "$TAKES/phone-main-$STAMP.mp4"
    wait_watch "pairing code displayed" 60 && ev "watch code shown"
    wait_watch "VIDEO: step 0" 60 && ev "watch linked (prepare on phone)"
    flow prepare.yaml
    wait_watch "VIDEO: step 1" 60 && ev "watch got preparedRun"
    wait_watch "startRun() entry" 120
    xcrun simctl spawn $UDID notifyutil -p live.airuncoach.videodemo.start
    ev "START (watch + phone)"
    wait_watch "VIDEO: finished" 2400 && ev "watch finished"
    sleep 25
    stop_watch_rec; stop_phone_rec
    ;;
*) echo "usage: $0 pairing|main"; exit 1 ;;
esac
ev "done"
