#!/bin/bash
# Renders carousel.html variants to 1080x1350 PNGs (Instagram 4:5 carousel).
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for v in 1 2 3 4 5 6; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1080,1350 --allow-file-access-from-files \
    --screenshot="$PWD/slide-$v.png" "file://$PWD/carousel.html?v=$v" >/dev/null 2>&1
done
sips -g pixelWidth -g pixelHeight slide-*.png | grep -v '^/' | paste - -
