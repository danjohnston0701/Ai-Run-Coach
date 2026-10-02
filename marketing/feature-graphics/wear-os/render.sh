#!/bin/bash
# Renders feature.html variants to 1024x500 PNGs (Google Play feature graphic).
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for v in 1 2 3; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1024,500 --allow-file-access-from-files \
    --screenshot="$PWD/feature-$v.png" "file://$PWD/feature.html?v=$v" >/dev/null 2>&1
done
sips -g pixelWidth -g pixelHeight feature-*.png | grep -v '^/' | paste - - 
