#!/bin/bash
# Take B — last minutes of the run (Priya finishes first → "1 finished") → the watch hits 5 km
# and the phone opens the Run Summary → Group Run tab, which fills in live as Sam, Jordan and
# Mia finish → AI group debrief. Also grabs stills for the carousel.
#   take-b.sh <T0 epoch seconds of watch START> <crew.log>
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TK="$HERE/takes"; mkdir -p "$TK"
A=~/Library/Android/sdk/platform-tools/adb
T="$HERE/tools/ui.py"
T0=$1; CREW_LOG=$2
ev() { echo "$(date +%s) +$(( $(date +%s) - T0 ))s $*" | tee -a "$TK/events-b.log"; }
until_t() { while [ "$(date +%s)" -lt "$1" ]; do sleep 1; done; }
shot() { $A exec-out screencap -p > "$TK/still-$1.png"; ev "still $1"; }
status_bar() {
  $A shell settings put global sysui_demo_allowed 1
  local D="$A shell am broadcast -a com.android.systemui.demo"
  $D -e command enter >/dev/null; $D -e command clock -e hhmm 0741 >/dev/null
  $D -e command battery -e level 100 -e plugged false >/dev/null
  $D -e command network -e wifi show -e level 4 -e mobile show -e level 4 -e datatype none >/dev/null
  $D -e command notifications -e visible false >/dev/null
}

until_t $(( T0 + 1380 )); status_bar
until_t $(( T0 + 1420 ))
$A emu screenrecord start --time-limit 1200 "$TK/takeB.webm" >/dev/null; ev "rec start"
until_t $(( T0 + 1530 )); shot run-1-finished          # Priya home at +1501, panel polls every 10 s
$T wait "Ai Insights|Group Run|Personal Best" 300 && ev "summary open" || ev "WARN no summary"
sleep 3
# First 5K on a fresh account → "New Personal Best!" popup (real feature) — dismiss it.
$T tap "Nice one" && ev "dismissed PB popup"
sleep 2
$A shell input tap 450 274; ev "tap Group Run tab"     # tab bar: Ai Insights | Group Run | …
sleep 8; shot results-partial
until grep -q "Mia finished" "$CREW_LOG"; do sleep 2; done; ev "Mia finished (server)"
sleep 25; shot results-all
$T tap "Get AI Group Debrief"; ev "tap debrief"
$T wait "Finished #" 90 && ev "debrief shown"
sleep 6; shot debrief
sleep 4
$A emu screenrecord stop >/dev/null; ev "rec stop"
