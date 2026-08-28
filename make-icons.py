#!/usr/bin/env python3
"""Regenerates assets/icons/*.png for the PWA manifest.

There is no image library on this machine, and committing binaries nobody can
reproduce is how an icon set drifts from the palette it came from. So this
writes the PNGs directly — RGBA scanlines, zlib-deflated, wrapped in
IHDR/IDAT/IEND — from the same two colours the stylesheet uses.

Run it after changing --panel or --accent in assets/styles.css:

    python3 make-icons.py
"""
import zlib, struct, pathlib

BG = (14, 21, 32)        # --panel
AMBER = (240, 180, 95)   # --accent
SS = 3                   # supersampling factor for edges

def png(path, size, glyph_frac):
    n = size * SS
    cx = cy = n / 2
    # Play triangle, optically centred (its visual mass sits left of centre).
    h = n * glyph_frac
    w = h * 0.88
    x0 = cx - w / 2 + w * 0.08
    y0 = cy - h / 2
    def inside(x, y):
        # Barycentric-ish test against the three edges of the triangle.
        if x < x0 or x > x0 + w:
            return False
        t = (x - x0) / w
        half = (h / 2) * (1 - t)
        return abs(y - cy) <= half
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    if inside(px * SS + sx + 0.5, py * SS + sy + 0.5):
                        hits += 1
            a = hits / (SS * SS)
            r = round(BG[0] + (AMBER[0] - BG[0]) * a)
            g = round(BG[1] + (AMBER[1] - BG[1]) * a)
            b = round(BG[2] + (AMBER[2] - BG[2]) * a)
            row += bytes((r, g, b, 255))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(raw, 9))
    out += chunk(b"IEND", b"")
    pathlib.Path(path).write_bytes(out)
    print(path, size, "px", len(out), "bytes")

root = pathlib.Path(__file__).parent / "assets" / "icons"
root.mkdir(parents=True, exist_ok=True)
png(root / "icon-192.png", 192, 0.52)
png(root / "icon-512.png", 512, 0.52)
# Maskable: the glyph must survive a circular crop, so it sits inside the
# 80% safe zone.
png(root / "icon-maskable-512.png", 512, 0.38)
