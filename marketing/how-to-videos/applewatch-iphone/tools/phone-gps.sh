#!/bin/bash
# Moves the iPhone simulator along the Lake Rotoroa loop at the demo run's average speed, so the
# phone's live run screen gets real location updates while it mirrors the watch (its distance
# then follows the watch's — see the watch-distance priority in RunSessionViewModel).
#   tools/phone-gps.sh <iphone udid>      (stop with: xcrun simctl location <udid> clear)
# Waypoints go in on stdin: simctl reads a negative latitude argument as an option.
HERE="$(cd "$(dirname "$0")" && pwd)"
xcrun simctl location "$1" start --speed=3.12 --interval=1 - < "$HERE/phone-route.txt"
