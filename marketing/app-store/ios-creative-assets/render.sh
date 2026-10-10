#!/bin/bash
# Renders assets.html variants at Apple's exact sizes. ./render.sh [--guides]
# Output: out/*.png (RGB, no alpha — App Store Connect rejects transparency).
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
G=""; OUT=out; [ "${1:-}" = "--guides" ] && { G="&guides=1"; OUT=out-guides; }
mkdir -p "$OUT"
shoot() {  # id width height filename
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=$2,$3 --allow-file-access-from-files --virtual-time-budget=3000 \
    --screenshot="$PWD/$OUT/tmp.png" "file://$PWD/assets.html?a=$1$G" >/dev/null 2>&1
  ffmpeg -y -loglevel error -i "$OUT/tmp.png" -pix_fmt rgb24 "$OUT/$4"; rm -f "$OUT/tmp.png"
  echo "$4 $(sips -g pixelWidth -g pixelHeight "$OUT/$4" | awk '/pixel/{printf "%s ", $2}')"
}
shoot header        3840 1646 product-page-header-3840x1646.png
shoot header-groups 3840 1646 product-page-header-group-runs-3840x1646.png
shoot search        3840 2560 search-results-3840x2560.png
shoot universal     5244 2950 universal-5244x2950.png
for i in 1 2 3 4; do
  shoot duo-outer-$i 1398 2034 iphone-duo-outer-$i-1398x2034.png
  shoot duo-inner-$i 2007 2853 iphone-duo-inner-$i-2007x2853.png
done
for i in 1 2 3 4; do
  shoot iphone-69-$i 1320 2868 iphone-6.9-$i-1320x2868.png
  shoot iphone-63-$i 1206 2622 iphone-6.3-$i-1206x2622.png
done
