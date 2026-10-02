# Contact sheet of a recording, labelled with timestamps, for picking in/out points.
#   python tools/contact.py <video> <out.png> [start=0] [end=duration] [step=2] [cols=12] [thumbw=150]
import sys, subprocess, tempfile, os, glob
from PIL import Image, ImageDraw
v, out = sys.argv[1], sys.argv[2]
a = [float(x) for x in sys.argv[3:]] + [None] * 5
start = a[0] or 0.0
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", v]))
end = a[1] or dur
step = a[2] or 2.0
cols = int(a[3] or 12)
tw = int(a[4] or 150)
d = tempfile.mkdtemp()
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-to", str(end), "-i", v,
                "-vf", f"fps=1/{step},scale={tw}:-2", f"{d}/f_%04d.png"], check=True)
fs = sorted(glob.glob(f"{d}/f_*.png"))
ims = [Image.open(f) for f in fs]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * h), "black")
for i, im in enumerate(ims):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im, (x, y))
    dr = ImageDraw.Draw(sheet)
    t = start + i * step
    dr.rectangle((x, y, x + 52, y + 14), fill="black")
    dr.text((x + 2, y + 1), f"{t:.1f}", fill="yellow")
sheet.save(out)
print(len(ims), "frames", sheet.size)
