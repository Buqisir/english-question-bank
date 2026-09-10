#!/usr/bin/env python3
"""Read-only source measurements; does not select or modify renderer values.

Requires Pillow, numpy and PyMuPDF. Run from the repository root.
JPEG coordinates remain pixels, never physical page measurements.
"""
import hashlib
import json
from pathlib import Path

import pymupdf
import numpy as np
from PIL import Image


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bands(mask):
    rows = np.flatnonzero(mask)
    result = []
    for row in rows:
        if not result or row > result[-1][1] + 1:
            result.append([int(row), int(row)])
        else:
            result[-1][1] = int(row)
    return result


result = {
    "method": {
        "jpeg": "Grayscale <=100; at least 6 dark pixels per row within x=70..794. Inclusive ink bands, not typographic baselines. Watermark/edge contamination must be visually checked.",
        "pdf": "PyMuPDF native span origins and font sizes in PDF points; physical page numbers include the separate cover. Never use JPEG dimensions to scale PDF coordinates.",
        "status": "observations only; not a new rendering contract",
    },
    "golden": [],
    "pdf": {},
}
probes = {
    "page-01-cover-listening": {
        "title": [350, 100, 515, 150],
        "notices_label": [65, 250, 180, 275],
        "q1_A_label": [90, 900, 120, 925],
        "q1_B_label": [325, 900, 353, 925],
        "q1_C_label": [560, 900, 590, 925],
    },
    "page-02-listening": {
        "q4_A_label": [95, 52, 125, 76],
        "q4_B_label": [95, 82, 125, 106],
        "q4_C_label": [95, 113, 125, 137],
        "q6_A_label": [95, 512, 125, 537],
        "q6_B_label": [327, 512, 353, 537],
        "q6_C_label": [565, 512, 592, 537],
    },
    "page-03-reading-a-start": {
        "q17_A_label": [95, 460, 125, 484],
        "q17_B_label": [327, 460, 353, 484],
        "q17_C_label": [565, 460, 592, 484],
    },
}
for name in ["page-01-cover-listening", "page-02-listening", "page-03-reading-a-start"]:
    path = Path(f"docs/product/exam-paper-format-reference/images/{name}.jpeg")
    image = Image.open(path).convert("L")
    pixels = np.asarray(image)
    anchors = {}
    for label, crop in probes[name].items():
        x0, y0, x1, y1 = crop
        ys, xs = np.where(pixels[y0:y1, x0:x1] <= 100)
        anchors[label] = {"probeBoxPx": crop, "inkBoxInclusivePx": [
            int(xs.min()) + x0, int(ys.min()) + y0,
            int(xs.max()) + x0, int(ys.max()) + y0]}
    result["golden"].append({
        "file": str(path), "sha256": digest(path), "sizePx": list(image.size),
        "inkBandsYInclusive": bands((pixels[:, 70:795] <= 100).sum(axis=1) >= 6),
        "anchors": anchors,
    })

path = Path("scripts/import-pipeline/papers/paper-2026-i/source/paper.pdf")
document = pymupdf.open(path)
result["pdf"] = {"file": str(path), "sha256": digest(path), "physicalPageCount": len(document), "pages": []}
for index in [1, 2, 3]:
    page = document[index]
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = line["spans"]
            text = "".join(span["text"] for span in spans).strip()
            if not text:
                continue
            if index == 3 and spans[0]["origin"][1] > 130:
                continue  # Only the listening-to-reading boundary, not Reading A.
            lines.append({
                "anchor": text[:48],
                "spans": [{"anchor": span["text"][:32],
                           "originPt": [round(n, 4) for n in span["origin"]],
                           "fontSizePt": round(span["size"], 4),
                           "font": span["font"]} for span in spans],
            })
    result["pdf"]["pages"].append({"physicalPage": index + 1,
        "sizePt": [round(page.rect.width, 4), round(page.rect.height, 4)], "lines": lines})
print(json.dumps(result, ensure_ascii=False, indent=2))
