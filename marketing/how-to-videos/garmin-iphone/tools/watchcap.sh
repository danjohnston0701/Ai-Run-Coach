#!/bin/bash
# Films the Connect IQ simulator window into an mp4 until sent SIGTERM (a backgrounded job
# ignores SIGINT, so stop it with `kill -TERM`).
#   tools/watchcap.sh out.mp4
# Uses `screencapture -l<window id>`, which grabs the window's own contents even when other
# windows cover it (screen-region capture films whatever is on top — e.g. a video call).
# ~6 frames/s with wall-clock timestamps, resampled to 30 fps; the watch face updates at 1 Hz.
OUT="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
WID=$(swift "$HERE/winlist.swift" 2>/dev/null | awk '/Connect IQ/{print $1}' | head -1)
[ -z "$WID" ] && { echo "Connect IQ window not found" >&2; exit 1; }
TMP=$(mktemp -d)
FIFO="$TMP/frames"; mkfifo "$FIFO"
ffmpeg -v error -y -f image2pipe -use_wallclock_as_timestamps 1 -c:v png -i "$FIFO" \
    -vf "crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0" -fps_mode cfr -r 30 -c:v libx264 -preset veryfast -crf 14 -pix_fmt yuv420p "$OUT" &
FF=$!
exec 3>"$FIFO"
RUN=1; trap 'RUN=0' INT TERM
while [ $RUN = 1 ]; do
    screencapture -x -o -l"$WID" -t png "$TMP/f.png" && cat "$TMP/f.png" >&3
done
exec 3>&-
wait $FF
rm -rf "$TMP"
