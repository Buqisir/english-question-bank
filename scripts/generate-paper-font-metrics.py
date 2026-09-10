#!/usr/bin/env python3
"""Reproduce live option advances. Requires fonttools==4.59.2; no system fonts.

Run from the repository root; --check compares without writing.
CSS disables kerning/ligatures (shared/papersurface/fontRendering.css).
"""
import hashlib
import json
from pathlib import Path
import sys
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
bundle = root / "app/public/fonts/paper"
primary_path = bundle / "termes/texgyretermes-regular.otf"
fallback_path = bundle / "source-han-serif/SourceHanSerifCN-Regular.otf"

def advances(path):
    font = TTFont(path)
    units = font["head"].unitsPerEm
    return {chr(code): font["hmtx"][glyph][0] * 1000 / units
            for code, glyph in font.getBestCmap().items()}

primary = advances(primary_path)
fallback = advances(fallback_path)
fallback_characters = "".join(sorted(set(fallback) - set(primary)))

def digest(path):
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()

metrics = {
    "artifactId": "termes-source-han-metrics-v1",
    "version": "1",
    "fontFaceId": "EQB Termes",
    "fontFileSha256": digest(primary_path),
    "fontVersion": "2.609",
    "fallbacks": [{"fontFaceId": "EQB Source Han Serif",
                   "characters": fallback_characters,
                   "fontFileSha256": digest(fallback_path),
                   "fontVersion": "2.003"}],
    "unitsPerEm": 1000,
    "glyphAdvanceUnits": dict(sorted((fallback | primary).items())),
    "kerningAdjustmentUnits": {},
}
output = root / "shared/papersurface/termes-source-han-metrics-v1.json"
text = json.dumps(metrics, ensure_ascii=True, indent=2) + "\n"
if "--check" in sys.argv:
    assert output.read_text() == text, "Bundled font metrics drift"
    print("PASS: option metrics reproduce from the bundled font bytes")
else:
    output.write_text(text)
