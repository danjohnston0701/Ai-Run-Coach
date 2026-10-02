#!/bin/bash
# Records the raw phone takes for the Garmin + Android video into ../takes/. The watch footage
# is reused from the Garmin + iPhone takes (same (:video) watch build, same deterministic run).
#
#   tools/record-take.sh devices   Profile → Connected Devices → Garmin card → Get Watch App
#   tools/record-take.sh main      Run Without Route → Prepare for Watch → Waiting for Watch →
#                                  watch START (adb broadcast) → real-time 5 km run (~27 min),
#                                  filmed in three windows: the start, elapsed 3:20–7:50 (the
#                                  1 km coaching message), and 26:00 → watch finish → Run Summary.
#   tools/record-take.sh finish    the whole run again, filming only 26:00 → finish → Run Summary,
#                                  then the summary screens (re-take of the end).
#   tools/record-take.sh summary   the saved run's summary screens.
#
# Needs: the Medium_Phone_API_36.1 emulator signed in, the debug APK (VideoDemoMode.kt), Maestro.
# Recording is the emulator console's own screenrecord (VP9 .webm, 1080×2400).
set -u
export PATH=$PATH:~/Library/Android/sdk/platform-tools
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TAKES="$HERE/takes"; FLOWS="$HERE/tools/flows"; mkdir -p "$TAKES"
PKG=live.airuncoach.airuncoach
DEV=emulator-5554
MAESTRO=~/.maestro/bin/maestro
STAMP=$(date +%H%M%S)
EVENTS="$TAKES/events-$1-$STAMP.log"

ev() { echo "$(python3 -c 'import time;print(f"{time.time():.3f}")') $*" | tee -a "$EVENTS"; }
now() { python3 -c 'import time;print(int(time.time()))'; }
rec_start() { adb emu screenrecord start --time-limit 1800 "$TAKES/$1-$STAMP.webm" >/dev/null; ev "rec start $1"; }
rec_stop() { adb emu screenrecord stop >/dev/null; sleep 2; ev "rec stop"; }
demo() { adb shell am broadcast -p $PKG -a live.airuncoach.videodemo.$1 >/dev/null; ev "demo $1"; }
flow() { ev "flow $1 begin"; $MAESTRO --device $DEV test "$FLOWS/$1" 2>&1 | grep -E "FAILED|not found"; ev "flow $1 end"; }
# Like flow, but the take is aborted (no START fired, so no run is recorded) if it fails.
flow_or_abort() {
    ev "flow $1 begin"
    if $MAESTRO --device $DEV test "$FLOWS/$1" > "$TAKES/maestro-$1-$STAMP.log" 2>&1; then ev "flow $1 end"
    else ev "ABORT: flow $1 failed (see maestro-$1-$STAMP.log)"; adb emu screenrecord stop >/dev/null 2>&1; exit 1; fi
}
until_t() { while [ "$(now)" -lt "$1" ]; do sleep 1; done; }

status_bar() {   # System UI demo mode: 9:41, full battery/signal, no notifications (matches the iPhone takes)
    adb shell settings put global sysui_demo_allowed 1
    local D="adb shell am broadcast -a com.android.systemui.demo"
    $D -e command enter >/dev/null
    $D -e command clock -e hhmm 0941 >/dev/null
    $D -e command battery -e level 100 -e plugged false >/dev/null
    $D -e command network -e wifi show -e level 4 -e mobile hide >/dev/null
    $D -e command notifications -e visible false >/dev/null
}

launch_app() {
    adb shell svc power stayon true
    # Pre-exempt from battery optimisation, or the app asks mid-run ("Let app always run in
    # background?") and the dialog covers the finish.
    adb shell dumpsys deviceidle whitelist +$PKG >/dev/null
    status_bar
    adb emu geo fix 175.2787541 -37.8037304 >/dev/null
    adb shell am force-stop $PKG
    adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    sleep 20
    # A busy emulator can raise "isn't responding" on first launch after an install — wait it out.
    $MAESTRO --device $DEV test "$FLOWS/dismiss-anr.yaml" >/dev/null 2>&1
    demo ENABLE
    sleep 3
}

caffeinate -dimsu -w $$ &

case "$1" in
devices)
    launch_app
    rec_start phone-devices
    flow devices.yaml
    sleep 1; rec_stop
    ;;
main)
    launch_app
    rec_start phone-start
    flow_or_abort prepare.yaml
    sleep 6
    demo START; T0=$(now)
    sleep 50; rec_stop
    until_t $((T0 + 200)); rec_start phone-mid
    until_t $((T0 + 470)); rec_stop
    until_t $((T0 + 1560)); rec_start phone-end
    until_t $((T0 + 1720)); rec_stop
    ;;
finish)
    # Re-take of just the end: same run, only the last window filmed, then the summary.
    launch_app
    flow_or_abort prepare.yaml
    sleep 6
    demo START; T0=$(now)
    until_t $((T0 + 1560)); rec_start phone-end
    until_t $((T0 + 1680)); rec_stop
    rec_start phone-summary
    flow summary.yaml
    sleep 1; rec_stop
    ;;
summary)
    rec_start phone-summary
    flow summary.yaml
    sleep 1; rec_stop
    ;;
*) echo "usage: $0 devices|main|finish|summary"; exit 1 ;;
esac
ev "done"
