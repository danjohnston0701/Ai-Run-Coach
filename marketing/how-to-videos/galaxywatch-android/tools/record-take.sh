#!/bin/bash
# Records the raw takes for the Galaxy Watch + Android video into ../takes/. Both devices are
# emulators driven by adb: the phone app's VideoDemoMode.kt (fake linked Galaxy Watch7) and the
# Wear app's WearVideoDemoMode.kt (scripted screens + the shared deterministic 5 km run), so the
# watch and phone footage match second for second.
#
#   tools/record-take.sh devices   phone: Profile → Connected Devices → Samsung card → Get Watch App
#   tools/record-take.sh main      watch pairing → prepare-on-phone; phone Run Without Route →
#                                  Prepare for Watch → Waiting for Watch; watch GPS → ready → START
#                                  (both devices at once) → real-time 5 km (~27 min), filmed in three
#                                  windows (start, elapsed 3:20–7:50, 26:00 → finish), then the
#                                  phone's Run Summary screens.
#   tools/record-take.sh finish    watch only: 26:20 → bottom button → Finish Run → Yes → FINISHED
#   tools/record-take.sh solo      watch only: no phone → Continue without coaching → GPS → START
#
# Needs: Medium_Phone_API_36.1 (signed in) and Wear_OS_Large_Round emulators running, the debug
# APKs of app/ and wear/ installed, Maestro. Recording is each emulator console's own screenrecord
# (VP9 .webm; phone 1080×2400, watch 454×454).
set -u
export PATH=$PATH:~/Library/Android/sdk/platform-tools
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TAKES="$HERE/takes"; FLOWS="$HERE/tools/flows"; mkdir -p "$TAKES"
PKG=live.airuncoach.airuncoach
WPKG=airuncoach.live.samsung_watch_app
PHONE=${PHONE:-emulator-5556}
WATCH=${WATCH:-emulator-5554}
MAESTRO=~/.maestro/bin/maestro
STAMP=$(date +%H%M%S)
EVENTS="$TAKES/events-$1-$STAMP.log"

ev() { echo "$(python3 -c 'import time;print(f"{time.time():.3f}")') $*" | tee -a "$EVENTS"; }
now() { python3 -c 'import time;print(int(time.time()))'; }
rec_start() { adb -s "$1" emu screenrecord start --time-limit 1800 "$TAKES/$2-$STAMP.webm" >/dev/null; ev "rec start $2"; }
rec_stop() { adb -s "$1" emu screenrecord stop >/dev/null; ev "rec stop $1"; }
demo() { adb -s $PHONE shell am broadcast -p $PKG -a live.airuncoach.videodemo.$1 ${2:-} >/dev/null; ev "phone demo $1"; }
wdemo() { adb -s $WATCH shell am broadcast -p $WPKG -a live.airuncoach.wear.videodemo.$1 ${2:-} >/dev/null; ev "watch demo $1 ${2:-}"; }
wtap() { adb -s $WATCH shell input tap "$1" "$2"; ev "watch tap $3"; }
flow() { ev "flow $1 begin"; $MAESTRO --device $PHONE test "$FLOWS/$1" 2>&1 | grep -E "FAILED|not found"; ev "flow $1 end"; }
flow_or_abort() {
    ev "flow $1 begin"
    if $MAESTRO --device $PHONE test "$FLOWS/$1" > "$TAKES/maestro-$1-$STAMP.log" 2>&1; then ev "flow $1 end"
    else ev "ABORT: flow $1 failed (see maestro-$1-$STAMP.log)"; rec_stop $PHONE; rec_stop $WATCH; exit 1; fi
}
until_t() { while [ "$(now)" -lt "$1" ]; do sleep 1; done; }

status_bar() {   # System UI demo mode: 9:41, full battery/signal, no notifications
    adb -s $PHONE shell settings put global sysui_demo_allowed 1
    local D="adb -s $PHONE shell am broadcast -a com.android.systemui.demo"
    $D -e command enter >/dev/null
    $D -e command clock -e hhmm 0941 >/dev/null
    $D -e command battery -e level 100 -e plugged false >/dev/null
    $D -e command network -e wifi show -e level 4 -e mobile hide >/dev/null
    $D -e command notifications -e visible false >/dev/null
}

launch_phone() {
    adb -s $PHONE shell svc power stayon true
    adb -s $PHONE shell dumpsys deviceidle whitelist +$PKG >/dev/null
    status_bar
    adb -s $PHONE emu geo fix 175.2787541 -37.8037304 >/dev/null
    adb -s $PHONE shell am force-stop $PKG
    adb -s $PHONE shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    sleep 20
    $MAESTRO --device $PHONE test "$FLOWS/dismiss-anr.yaml" >/dev/null 2>&1
    demo ENABLE "--es watch samsung"
    sleep 3
}

launch_watch() {
    adb -s $WATCH shell svc power stayon true
    adb -s $WATCH shell am force-stop $WPKG
    adb -s $WATCH shell monkey -p $WPKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    sleep 8
    wdemo ENABLE
    sleep 2
}

# Watch screen tap targets (454×454).
CONTINUE_X=227; CONTINUE_Y=280     # prepare screen: Continue without coaching
FINISH_X=227;   FINISH_Y=338       # paused screen: FINISH RUN
YES_X=227;      YES_Y=215          # "Finish run?": YES

caffeinate -dimsu -w $$ &

case "$1" in
devices)
    launch_phone
    rec_start $PHONE phone-devices
    flow devices.yaml
    sleep 1; rec_stop $PHONE
    ;;
main)
    launch_watch
    launch_phone
    rec_start $WATCH watch-main
    sleep 4
    wdemo LINK                     # the phone app is open: it pushes its token, the watch links
    sleep 8
    rec_start $PHONE phone-start
    flow_or_abort prepare.yaml     # ends on "Waiting for Watch"
    wdemo PREPARE                  # the prepared session reaches the watch; GPS locks over ~8 s
    sleep 14
    demo START; wdemo START; T0=$(now)
    sleep 50; rec_stop $PHONE; rec_stop $WATCH
    until_t $((T0 + 200)); rec_start $PHONE phone-mid; rec_start $WATCH watch-mid
    until_t $((T0 + 470)); rec_stop $PHONE; rec_stop $WATCH
    until_t $((T0 + 1560)); rec_start $PHONE phone-end; rec_start $WATCH watch-end
    until_t $((T0 + 1680)); rec_stop $WATCH
    rec_stop $PHONE
    rec_start $PHONE phone-summary
    flow summary.yaml
    sleep 1; rec_stop $PHONE
    ;;
finish)
    launch_watch
    wdemo LINK; sleep 1; wdemo PREPARE; sleep 12
    # Pauses at elapsed ~26:39 / 4.997 km ("5.00"), the second before the shared run reaches
    # 5 km (where video mode would finish on its own) — so the FINISHED screen matches the phone.
    wdemo START "--ei skip 1585"
    sleep 2
    rec_start $WATCH watch-finish
    sleep 12
    adb -s $WATCH shell input keyevent KEYCODE_BACK; ev "watch BACK (pause)"
    sleep 3
    wtap $FINISH_X $FINISH_Y "finish run"
    sleep 2
    wtap $YES_X $YES_Y "yes"
    sleep 8
    rec_stop $WATCH
    ;;
solo)
    launch_watch
    rec_start $WATCH watch-solo
    wdemo LINK "--ez phone false"
    sleep 4
    wtap $CONTINUE_X $CONTINUE_Y "continue without coaching"
    wdemo GPS
    sleep 12
    wdemo START "--ei skip 900"
    sleep 10
    rec_stop $WATCH
    ;;
*) echo "usage: $0 devices|main|finish|solo"; exit 1 ;;
esac
ev "done"
