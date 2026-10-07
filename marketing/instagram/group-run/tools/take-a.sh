#!/bin/bash
# Take A — Group Runs list → detail → Start My Run → setup → Prepare for Watch → watch START →
# first ~60 s of the run. Assumes: app open & signed in on the LOCAL demo server, VideoDemoMode
# enabled (simulated Garmin), crew.cjs running, group reset (reset.cjs).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TK="$HERE/takes"; mkdir -p "$TK"
A=~/Library/Android/sdk/platform-tools/adb
T="$HERE/tools/ui.py"
P=live.airuncoach.airuncoach
ev() { echo "$(date +%s.%N | cut -c1-14) $*" | tee -a "$TK/events-a.log"; }

$A shell input keyevent 3; sleep 2
$A shell am start -n $P/.MainActivity >/dev/null
$T wait "^Profile$" 120 || { ev "ABORT app not up"; exit 1; }
sleep 3
$A shell am broadcast -p $P -a live.airuncoach.videodemo.ENABLE >/dev/null; ev "demo ENABLE"
sleep 4
$T tap "^Profile$"; sleep 3
$T tap "^Group Runs$" 1
$T wait "Sunday Social" 90 || { ev "ABORT no list"; exit 1; }
sleep 2
$A emu screenrecord start --time-limit 600 "$TK/takeA.webm" >/dev/null; ev "rec start"
sleep 2
$T tap "Sunday Social"; ev "tap card"
$T wait "Start My Run|Start Group Run" 90 || { ev "ABORT no detail"; exit 1; }
sleep 3
$A shell input swipe 540 1700 540 900 1500; sleep 3
$A shell input swipe 540 900 540 1700 1200; sleep 2
$T tap "^Start My Run$|^Start Group Run$"; ev "tap start"
$T wait "Prepare for Watch|PREPARE RUN" 90 || { ev "ABORT no setup"; exit 1; }
sleep 3
$T tap "Prepare for Watch"; ev "tap prepare for watch"
$T wait "Waiting for|GROUP RUN" 90 || { ev "ABORT no standby"; exit 1; }
sleep 6
$A shell am broadcast -p $P -a live.airuncoach.videodemo.START >/dev/null; ev "watch START"
date +%s > "$TK/run-start.t"
sleep 70
$A emu screenrecord stop >/dev/null; ev "rec stop"
