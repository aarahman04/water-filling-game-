"""Run with: python docs/check-assets.py (standard library only)."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent
svg_files = sorted((root / "assets").glob("*.svg"))
assert len(svg_files) == 9
for file in svg_files:
    tree = ET.parse(file)
    svg = tree.getroot()
    assert svg.tag == "{http://www.w3.org/2000/svg}svg", file
    assert svg.get("viewBox"), file
    ids = [node.get("id") for node in svg.iter() if node.get("id")]
    assert len(ids) == len(set(ids)), f"Duplicate ID in {file.name}"
    for ref in re.findall(r"url\(#([^)]+)\)", file.read_text(encoding="utf-8")):
        assert ref in ids, f"Missing gradient {ref} in {file.name}"

sheet = (root / "index.html").read_text(encoding="utf-8")
for ref in re.findall(r'(?:src|href)="([^"]+)"', sheet):
    if not ref.startswith(("#", "http")):
        assert (root / ref).is_file(), ref
for ref in re.findall(r"url\('([^']+)'\)", sheet):
    assert (root / ref).is_file(), ref

tokens = (root / "tokens.css").read_text(encoding="utf-8")
defined = set(re.findall(r"(--[\w-]+)\s*:", tokens + sheet))
used = set(re.findall(r"var\((--[\w-]+)", tokens + sheet))
assert used <= defined, f"Missing tokens: {used - defined}"

def luminance(color):
    rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb]
    return sum(v * w for v, w in zip(linear, (.2126, .7152, .0722)))

for name, fg, bg in (
    ("primary button", "#182C37", "#F3DFB3"),
    ("main on raised", "#F2F6F5", "#203E4D"),
    ("secondary on room", "#B8CBD3", "#213E50"),
    ("muted on room", "#9DB4C0", "#213E50"),
):
    values = sorted((luminance(fg), luminance(bg)))
    ratio = (values[1] + .05) / (values[0] + .05)
    assert ratio >= 4.5, (name, ratio)
    print(f"{name}: {ratio:.2f}:1")

targets = [.48, .62, .40, .70, .55, .66, .44, .74, .52, .60,
           .46, .72, .57, .64, .42, .69, .54, .76, .59, .68]
for level, center in enumerate(targets, 1):
    band = .1 - .003 * (level - 1)
    rate = .105 + .0075 * (level - 1)
    assert 0 < center - band / 2 < center + band / 2 < 1
    if level in (2, 18, 20):
        print(f"Level {level}: {320 * band:.2f}px band; {1000 * band / rate:.0f}ms window")

print(f"PASS: {len(svg_files)} SVGs, sheet references, CSS token references, contrast pairs, 20 target bounds.")
