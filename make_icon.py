"""
AI Run Coach — Garmin Launcher Icon
Technique: fat rotated ellipses per body segment + heavy Gaussian merge + threshold.
Produces a solid smooth athletic silhouette — no joint artifacts.
Colours: near-black background, teal→cyan gradient with glow.
"""
from PIL import Image, ImageDraw, ImageFilter
import math, numpy as np

RENDER = 1024
OUT    = 512

def s(v): return v * RENDER / 100

def oval(draw, cx, cy, rx, ry, angle_deg=0):
    """Draw a filled rotated ellipse as a polygon."""
    a = math.radians(angle_deg)
    pts = []
    for i in range(36):
        theta = 2 * math.pi * i / 36
        x = rx * math.cos(theta)
        y = ry * math.sin(theta)
        pts.append((
            cx + x * math.cos(a) - y * math.sin(a),
            cy + x * math.sin(a) + y * math.cos(a)
        ))
    draw.polygon(pts, fill=255)

# ── Runner mask ───────────────────────────────────────────────────────────────
fig = Image.new('L', (RENDER, RENDER), 0)
fd  = ImageDraw.Draw(fig)

# HEAD
oval(fd, s(62), s(11), s(10), s(11))

# TORSO — angled ~25° forward lean
oval(fd, s(55), s(37), s(8), s(22), angle_deg=-25)

# SHOULDER masses
oval(fd, s(60), s(24), s(9), s(7))    # lead shoulder
oval(fd, s(48), s(26), s(8), s(6))    # trail shoulder

# HIP mass
oval(fd, s(53), s(55), s(11), s(8))

# ── LEAD ARM (left, swings forward-right) ────────────────────────────────────
oval(fd, s(67), s(31), s(8), s(16), angle_deg=40)    # upper arm
oval(fd, s(77), s(20), s(7), s(14), angle_deg=15)    # forearm
oval(fd, s(73), s(37), s(8), s(8))                    # elbow joint

# ── TRAIL ARM (right, swings back-down) ──────────────────────────────────────
oval(fd, s(38), s(37), s(7), s(15), angle_deg=-30)   # upper arm
oval(fd, s(27), s(52), s(6), s(13), angle_deg=-15)   # forearm
oval(fd, s(35), s(42), s(7), s(7))                    # elbow joint

# ── LEAD LEG (left, forward stride) ──────────────────────────────────────────
oval(fd, s(62), s(63), s(11), s(18), angle_deg=20)   # thigh
oval(fd, s(74), s(80), s(9),  s(14), angle_deg=10)   # shin
oval(fd, s(84), s(91), s(12), s(6),  angle_deg=-10)  # foot
oval(fd, s(70), s(72), s(10), s(10))                  # knee joint

# ── TRAIL LEG (right, heel kicks back-up) ────────────────────────────────────
oval(fd, s(38), s(64), s(10), s(18), angle_deg=-30)  # thigh
oval(fd, s(24), s(60), s(8),  s(14), angle_deg=35)   # shin (kicked up)
oval(fd, s(14), s(52), s(7),  s(6))                   # heel
oval(fd, s(30), s(74), s(9),  s(9))                   # knee joint

# ── Merge: heavy blur → unified smooth silhouette ─────────────────────────────
blurred = fig.filter(ImageFilter.GaussianBlur(radius=22))
arr     = np.array(blurred, dtype=np.float32)
thresh  = (arr > (0.38 * 255)).astype(np.uint8) * 255
sil     = Image.fromarray(thresh, 'L')

glow_arr  = (arr > (0.06 * 255)).astype(np.float32) * 255
glow_mask = Image.fromarray(glow_arr.astype(np.uint8), 'L')
glow_base = Image.new('RGB', (RENDER, RENDER), (0, 0, 0))
glow_base.paste(Image.new('RGB', (RENDER, RENDER), (0, 160, 210)), mask=glow_mask)
glow_layer = glow_base.filter(ImageFilter.GaussianBlur(radius=40))

# ── Teal → bright cyan gradient ───────────────────────────────────────────────
grad = Image.new('RGB', (RENDER, RENDER))
gpx  = grad.load()
for y in range(RENDER):
    for x in range(RENDER):
        t = max(0.0, min(1.0, x / RENDER * 0.4 + (1 - y / RENDER) * 0.6))
        gpx[x, y] = (int(t * 5), int(100 + t * 107), int(115 + t * 140))

# ── Composite ─────────────────────────────────────────────────────────────────
canvas = Image.new('RGB', (RENDER, RENDER), (5, 7, 12))   # near-black
result = Image.blend(canvas, glow_layer, alpha=0.5)
result.paste(grad, mask=sil)

final = result.resize((OUT, OUT), Image.LANCZOS)
out   = '/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/garmin-companion-app/resources/drawables/launcher_icon.png'
final.save(out, 'PNG')

preview = result.resize((40, 40), Image.LANCZOS).resize((320, 320), Image.NEAREST)
preview.save('/tmp/icon_40px_preview.png')
print(f"Done → {out}")
