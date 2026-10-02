# Cuts the Forerunner 965 skin out of a Connect IQ simulator window capture for the edit:
# white window background → transparent (edge colours un-mixed from white), the Amp Yellow
# strap → graphite, and a transparent hole over the display so the live watch video shows
# through it. Run with a venv that has pillow/numpy/scipy:
#   python tools/make-watch-skin.py takes/<frame>.png edit/public/watch/skin.png
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
H, W, _ = im.shape
mn = im.min(axis=2); mx = im.max(axis=2)

# Background = light, unsaturated pixels connected to the frame border (+ title/status bars).
light = (mn > 150) & (mx - mn < 30)
light[:32, :] = True; light[H - 34:, :] = True
lab, _ = ndimage.label(light)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
# Soft alpha on the 2 px rim around the watch from how white the pixel is.
rim = ndimage.binary_dilation(~bg, iterations=2) & bg | (ndimage.binary_dilation(bg, iterations=2) & ~bg)
alpha = np.where(bg, 0.0, 1.0)
wa = np.clip((255 - mn) / 110.0, 0, 1)
alpha = np.where(rim, np.minimum(np.maximum(alpha, wa), 1.0) * np.where(bg, wa, 1.0), alpha)
alpha[:32, :] = 0; alpha[H - 34:, :] = 0
# Un-mix white from semi-transparent edge pixels.
a3 = np.clip(alpha, 1e-3, 1)[..., None]
rgb = np.clip((im - (1 - a3) * 255) / a3, 0, 255)

# Strap: saturated yellow → dark graphite, keeping its texture.
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
yellow = (r > 45) & (g > 45) & ((r + g) / 2 - b > 22) & (np.abs(r - g) < 70)
lum = 0.3 * r + 0.59 * g + 0.11 * b
gray = np.stack([lum * 0.22 + 6, lum * 0.22 + 8, lum * 0.22 + 11], axis=-1)
rgb = np.where(yellow[..., None], gray, rgb)

# Display hole (Forerunner 965: 454 px round display, 1:1 in the simulator at this window size).
cx, cy, rad = 341.0, 486.0, 224.0
yy, xx = np.mgrid[0:H, 0:W]
d = np.hypot(xx - cx, yy - cy)
alpha = alpha * np.clip(d - rad, 0, 1)

outim = np.dstack([rgb, alpha * 255]).astype(np.uint8)
Image.fromarray(outim, "RGBA").save(out)
json.dump({"w": W, "h": H, "cx": cx, "cy": cy, "r": rad}, open(out.replace(".png", ".json"), "w"))
print("ok", W, H)
