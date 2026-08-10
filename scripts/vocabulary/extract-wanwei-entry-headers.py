#!/usr/bin/env python3
"""Extract numbered vocabulary header bands from the scanned Wanwei source.

The source pages use a pale-green full-width band for every vocabulary entry.
This script detects those bands, OCRs only the relevant pixels, and preserves
the raw evidence. It does not repair OCR text or manufacture missing entries.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image


ENTRY_PATTERN = re.compile(r"^\s*(\d{1,3})\s*[.,、]\s*([^/]+?)\s+(?=/)")


def green_score(pixel: tuple[int, int, int]) -> bool:
    red, green, blue = pixel
    return green > 150 and green - red > 8 and green - blue > 8


def find_header_bands(image: Image.Image) -> list[tuple[int, int]]:
    width, height = image.size
    scores: list[float] = []
    for y in range(height):
        samples = [image.getpixel((x, y)) for x in range(100, width - 80, 8)]
        scores.append(sum(green_score(pixel) for pixel in samples) / len(samples))

    spans: list[tuple[int, int]] = []
    start: int | None = None
    for y, score in enumerate(scores):
        if score > 0.25 and start is None:
            start = y
        if (score <= 0.25 or y == height - 1) and start is not None:
            end = y
            if (
                end - start >= 8
                and max(scores[start:end]) > 0.8
                and start > 50
                and end < height - 50
            ):
                spans.append((start, end))
            start = None
    return spans


def make_contact_sheet(image: Image.Image, spans: list[tuple[int, int]]) -> Image.Image:
    width, height = image.size
    crops = [
        image.crop((85, max(0, start - 18), width - 65, min(height, end + 20)))
        for start, end in spans
    ]
    gap = 20
    sheet = Image.new(
        "RGB",
        (max(crop.width for crop in crops), sum(crop.height for crop in crops) + gap * (len(crops) - 1)),
        "white",
    )
    y = 0
    for crop in crops:
        sheet.paste(crop, (0, y))
        y += crop.height + gap
    return sheet


def ocr_sheet(sheet: Image.Image, languages: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=".png") as source:
        sheet.save(source.name)
        completed = subprocess.run(
            ["tesseract", source.name, "stdout", "-l", languages, "--psm", "6"],
            check=True,
            capture_output=True,
            text=True,
        )
    return completed.stdout.strip()


def parse_candidates(raw_text: str) -> list[dict]:
    candidates: list[dict] = []
    current: list[str] = []
    for line in raw_text.splitlines():
        if re.match(r"^\s*\d{1,3}\s*[.,、]", line):
            if current:
                candidates.append(parse_candidate(" ".join(current)))
            current = [line.strip()]
        elif current and line.strip():
            current.append(line.strip())
    if current:
        candidates.append(parse_candidate(" ".join(current)))
    return candidates


def parse_candidate(raw: str) -> dict:
    match = ENTRY_PATTERN.search(raw)
    return {
        "entryNumber": int(match.group(1)) if match else None,
        "ocrHeadword": match.group(2).strip() if match else None,
        "raw": raw,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--images-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--first-pdf-page", type=int, default=18)
    parser.add_argument("--last-pdf-page", type=int, default=250)
    parser.add_argument("--languages", default="eng+chi_sim")
    args = parser.parse_args()

    pages: list[dict] = []
    for pdf_page in range(args.first_pdf_page, args.last_pdf_page + 1):
        image_path = args.images_dir / f"page-{pdf_page:03d}.jpg"
        if not image_path.exists():
            raise SystemExit(f"Missing rendered source page: {image_path}")
        image = Image.open(image_path).convert("RGB")
        spans = find_header_bands(image)
        if not spans:
            pages.append({"pdfPage": pdf_page, "printedPage": pdf_page - 17, "bands": [], "rawOcr": "", "candidates": []})
            continue
        raw_text = ocr_sheet(make_contact_sheet(image, spans), args.languages)
        pages.append({
            "pdfPage": pdf_page,
            "printedPage": pdf_page - 17,
            "bands": [{"top": start, "bottom": end} for start, end in spans],
            "rawOcr": raw_text,
            "candidates": parse_candidates(raw_text),
        })
        print(f"page {pdf_page}: {len(spans)} bands, {len(pages[-1]['candidates'])} numbered candidates")

    artifact = {
        "schemaVersion": "wanwei-entry-header-ocr-v1",
        "source": "万唯系列中考词汇一轮梳理.pdf",
        "pages": pages,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total_bands = sum(len(page["bands"]) for page in pages)
    total_candidates = sum(len(page["candidates"]) for page in pages)
    print(json.dumps({"pages": len(pages), "bands": total_bands, "numberedCandidates": total_candidates}))


if __name__ == "__main__":
    main()
