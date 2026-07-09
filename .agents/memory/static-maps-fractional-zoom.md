---
name: Static Maps fractional zoom trick
description: How the share image gets a tight route fit despite Google Static Maps only accepting integer zoom
---
Google Static Maps only accepts integer zoom, which left share-image route maps zoomed way out (route floating in a huge area).

**The trick:** compute the fractional zoom that fits the track, then request the tile at `zInt = floor(zoomFrac)` with a proportionally SMALLER pixel size (`sW = covW * 2^(zInt - zoomFrac)`), so the tile covers exactly the fractional-zoom world area. Upscale to the display region afterwards.

**Why:** the alternative (fetch big tile, centre-crop, upscale) blows up map labels/POI icons ~2x and crops off Google's baked-in attribution. The smaller-tile approach keeps labels near native size and preserves attribution.

**How to apply:** the Mercator SVG route overlay must use the FRACTIONAL zoom in `2^zoom * 256` and logical dims `reqW = sW / k` (floats are fine). Derive tile height from width (`sH = round(sW * regionH/regionW)`) so the overlay's single pixRatio holds on both axes. Also: use default Google styling (no style params) to match the Android app's summary map look; tile cap is 640px per dim (scale=2 doubles pixels, not coverage).
