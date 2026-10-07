#!/usr/bin/env python3
"""Tiny adb UI driver (Maestro's driver kept timing out on the emulator).

  ui.py dump                 list visible texts / content-descs with their centres
  ui.py tap <regex> [n]      tap the n-th (default 0) node whose text or content-desc matches
  ui.py wait <regex> [secs]  wait until a node matches (exit 1 on timeout)
  ui.py type <text>          type text into the focused field
"""
import os, re, subprocess, sys, time

ADB = [os.path.expanduser("~/Library/Android/sdk/platform-tools/adb")] + (["-s", os.environ["PHONE"]] if os.environ.get("PHONE") else [])
NODE = re.compile(r'<node [^>]*?text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')


def nodes():
    xml = ""
    for _ in range(4):  # uiautomator dump intermittently returns nothing on a busy emulator
        xml = subprocess.run(ADB + ["exec-out", "uiautomator", "dump", "/dev/tty"], capture_output=True, text=True).stdout
        if "<node" in xml:
            break
        time.sleep(1)
    out = []
    for t, d, x1, y1, x2, y2 in NODE.findall(xml):
        label = t or d
        if label:
            out.append((label, (int(x1) + int(x2)) // 2, (int(y1) + int(y2)) // 2))
    return out


def find(pattern):
    rx = re.compile(pattern, re.I | re.S)
    return [n for n in nodes() if rx.search(n[0])]


cmd = sys.argv[1]
if cmd == "dump":
    for label, x, y in nodes():
        print(f"{x:5d},{y:5d}  {label[:90]!r}")
elif cmd == "tap":
    idx = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    m = find(sys.argv[2])
    if len(m) <= idx:
        sys.exit(f"no match for {sys.argv[2]!r}")
    _, x, y = m[idx]
    subprocess.run(ADB + ["shell", "input", "tap", str(x), str(y)])
elif cmd == "wait":
    deadline = time.time() + (float(sys.argv[3]) if len(sys.argv) > 3 else 30)
    while time.time() < deadline:
        if find(sys.argv[2]):
            sys.exit(0)
        time.sleep(1)
    sys.exit(f"timed out waiting for {sys.argv[2]!r}")
elif cmd == "type":
    subprocess.run(ADB + ["shell", "input", "text", sys.argv[2].replace(" ", "%s").replace("!", "\\!")])
