#!/bin/bash
# Starts Alex's group run on the emulator (no recording — take A already covers the start), then
# launches crew.cjs anchored to the watch START and schedules take B.
#   take-run.sh <seed.json>
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TK="$HERE/takes"; mkdir -p "$TK"
A=~/Library/Android/sdk/platform-tools/adb
T="$HERE/tools/ui.py"
P=live.airuncoach.airuncoach
SEED=$1
ev() { echo "$(date +%s) $*" | tee -a "$TK/events-run.log"; }
$A shell input keyevent 3; sleep 2
$A shell am start -n $P/.MainActivity >/dev/null
$T wait "^Profile$" 120 || { ev "ABORT app not up"; exit 1; }
sleep 3
$A shell am broadcast -p $P -a live.airuncoach.videodemo.ENABLE >/dev/null; ev "demo ENABLE"
sleep 4
$T tap "^Profile$"; sleep 3
$T tap "^Group Runs$" 1
$T wait "Sunday Social" 90 || { ev "ABORT no list"; exit 1; }
$T tap "Sunday Social"
$T wait "Start My Run|Start Group Run" 90 || { ev "ABORT no detail"; exit 1; }
sleep 2
if $T tap "^Start Group Run$"; then ev "organiser started group"; $T wait "Start My Run" 60; sleep 2; fi
$T tap "^Start My Run$"; ev "tap Start My Run"
$T wait "Prepare for Watch" 90 || { ev "ABORT no setup"; exit 1; }
sleep 2
$T tap "Prepare for Watch"
$T wait "Waiting for" 90 || { ev "ABORT no standby"; exit 1; }
sleep 4
$A shell am broadcast -p $P -a live.airuncoach.videodemo.START >/dev/null
T0=$(date +%s); ev "watch START $T0"
T0="${T0}000" node "$HERE/tools/crew.cjs" "$SEED" > "$TK/crew.log" 2>&1 &
"$HERE/tools/take-b.sh" "$T0" "$TK/crew.log"
