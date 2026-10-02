#!/bin/bash
# Records the raw takes for the Apple Watch + iPhone video into ../takes/.
#
#   tools/record-take.sh devices   iPhone only: Profile → Connected Devices → Apple Watch card
#   tools/record-take.sh main      Both, continuously: watch "Prepare on your iPhone" gate; phone
#                                  Run Without Route → Prepare for Watch → Waiting for Watch;
#                                  watch START (Darwin notification) → full real-time 5 km run
#                                  (~27 min) → watch auto-pauses at 5 km → STOP → DONE; phone
#                                  hands over to the synced run's summary.
#   tools/record-take.sh summary   iPhone only: the saved run's Run Insights tabs + AI review.
#
# Needs: the paired simulators below (simctl pair), the iOS debug build installed on the phone
# and its watch app on the watch (WatchVideoDemoMode.swift / VideoDemoMode in the iOS repo),
# Maestro, ffmpeg. Both recordings are simctl framebuffer captures.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TAKES="$HERE/takes"; FLOWS="$HERE/tools/flows"; mkdir -p "$TAKES"
PHONE=A51070DA-94AD-4BB6-9CC6-A35CD96D9735       # iPhone 17 Pro, iOS 26.2 (signed in)
WATCH=86AEC8D1-0C1E-42BE-A672-18DC223C5774       # "AW Video 46mm", Series 11, watchOS 26.4
BID=live.airuncoach.Ai-Run-Coach
WBID=live.airuncoach.Ai-Run-Coach.watchkitapp
APP=~/Library/Caches/arc-video-dd/Build/Products/Debug-iphonesimulator/"Ai Run Coach.app"
MAESTRO=~/.maestro/bin/maestro
STAMP=$(date +%H%M%S)
EVENTS="$TAKES/events-$1-$STAMP.log"
WLOG="$TAKES/watch-console-$STAMP.log"

ev() { echo "$(python3 -c 'import time;print(f"{time.time():.3f}")') $*" | tee -a "$EVENTS"; }

rec() {   # $1 = device, $2 = out file; sets REC_PID
    xcrun simctl io "$1" recordVideo --codec h264 --force "$2" >/dev/null 2>&1 &
    REC_PID=$!; sleep 2; ev "rec start $2"
}

launch_phone() {
    xcrun simctl status_bar $PHONE override --time "9:41" --batteryState charged --batteryLevel 100 \
        --cellularMode active --cellularBars 4 --wifiBars 3 --dataNetwork wifi
    xcrun simctl location $PHONE set -37.8037304,175.2787541
    (xcrun simctl launch --terminate-running-process --console-pty $PHONE $BID \
        > "$TAKES/phone-console-$STAMP.log" 2>&1 &)
    sleep 12
}

launch_watch() {   # extra args
    # A fresh install clears any run still queued for sync from an earlier take.
    xcrun simctl terminate $WATCH $WBID 2>/dev/null
    xcrun simctl uninstall $WATCH $WBID
    xcrun simctl install $WATCH "$APP/Watch/Ai Run Coach Watch App.app"
    (xcrun simctl launch --console-pty $WATCH $WBID -ARCVideoDemo "$@" > "$WLOG" 2>&1 &)
    sleep 8
}

flow() { ev "flow $1 begin"; $MAESTRO --device $PHONE test "$FLOWS/$1" 2>&1 | grep -E "FAILED|not found"; ev "flow $1 end"; }
# Like flow, but the take is aborted (no START fired, so no run is recorded) if it fails.
flow_or_abort() {
    ev "flow $1 begin"
    if $MAESTRO --device $PHONE test "$FLOWS/$1" > "$TAKES/maestro-$1-$STAMP.log" 2>&1; then ev "flow $1 end"
    else ev "ABORT: flow $1 failed (see maestro-$1-$STAMP.log)"; kill -INT $W $P 2>/dev/null; exit 1; fi
}

wait_log() {   # $1 = file, $2 = pattern, $3 = timeout s
    for i in $(seq 1 $(( $3 * 4 ))); do grep -q "$2" "$1" 2>/dev/null && return 0; sleep 0.25; done
    ev "TIMEOUT waiting for '$2'"; return 1
}

caffeinate -dimsu -w $$ &

case "$1" in
devices)
    launch_phone
    rec $PHONE "$TAKES/phone-devices-$STAMP.mp4"; P=$REC_PID
    flow devices.yaml
    sleep 2; kill -INT $P; wait $P 2>/dev/null
    ;;
main)
    launch_watch
    # The phone only offers "Prepare for Watch" once WatchConnectivity reports the freshly
    # reinstalled watch app; launched too soon it shows the plain "PREPARE RUN" and the take aborts.
    sleep 30
    launch_phone
    sleep 15
    rec $WATCH "$TAKES/watch-main-$STAMP.mp4"; W=$REC_PID
    rec $PHONE "$TAKES/phone-main-$STAMP.mp4"; P=$REC_PID
    sleep 5; ev "hold: watch prepare gate"
    flow_or_abort prepare.yaml
    sleep 6
    xcrun simctl spawn $WATCH notifyutil -p live.airuncoach.videodemo.start
    "$HERE/tools/phone-gps.sh" $PHONE >/dev/null
    ev "START (watch tap)"
    wait_log "$WLOG" "5 km — pausing" 2400 && ev "watch paused at 5 km"
    sleep 5
    xcrun simctl spawn $WATCH notifyutil -p live.airuncoach.videodemo.end
    ev "STOP (watch tap)"
    sleep 75
    xcrun simctl location $PHONE clear
    kill -INT $W $P; wait $W $P 2>/dev/null
    ;;
summary)
    rec $PHONE "$TAKES/phone-summary-$STAMP.mp4"; P=$REC_PID
    flow summary.yaml
    sleep 2; kill -INT $P; wait $P 2>/dev/null
    ;;
*) echo "usage: $0 devices|main|summary"; exit 1 ;;
esac
ev "done"
