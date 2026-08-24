#!/usr/bin/env python3
"""Anchor the scanned Gaokao vocabulary rows to their coloured source bullets.

OCR is evidence assistance only. The coloured bullet supplies row identity and
the curriculum tag; Apple Vision and Tesseract provide independent readings
that downstream review must reconcile against the rendered source page.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import subprocess
import tempfile
from collections import defaultdict
from pathlib import Path

from PIL import Image


PROGRAM_ID = "gaokao-curriculum-3000-frequency-v1"
SOURCE_SHA256 = "c170bac21049be80115c22974cd029f10921dad675653131e5754681485cb4bb"


def is_tag_colour(pixel: tuple[int, int, int]) -> bool:
    red, green, blue = pixel
    return max(pixel) - min(pixel) > 55 and max(pixel) > 120 and min(pixel) < 205


def find_bullets(image: Image.Image, x0: int, x1: int) -> list[dict]:
    pixels = image.load()
    active: set[tuple[int, int]] = set()
    for y in range(image.height):
        for x in range(x0, x1):
            if is_tag_colour(pixels[x, y]):
                active.add((x, y))

    components: list[dict] = []
    while active:
        seed = active.pop()
        stack = [seed]
        points = [seed]
        while stack:
            x, y = stack.pop()
            for neighbour in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbour in active:
                    active.remove(neighbour)
                    stack.append(neighbour)
                    points.append(neighbour)
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        width = max(xs) - min(xs) + 1
        height = max(ys) - min(ys) + 1
        if not (45 <= width <= 60 and 45 <= height <= 72 and 1_100 <= len(points) <= 2_700):
            continue
        colours = [pixels[x, y] for x, y in points]
        average = tuple(sum(pixel[channel] for pixel in colours) / len(colours) for channel in range(3))
        red, green, blue = average
        if blue > red + 70 and green > red + 70:
            tag = "initial"
        elif red > green + 55 and blue < red - 25:
            tag = "elective"
        else:
            tag = "required"
        components.append({
            "x": min(xs),
            "y": min(ys),
            "width": width,
            "height": height,
            "centerY": (min(ys) + max(ys)) / 2,
            "curriculumTag": tag,
            "averageColour": [round(value) for value in average],
        })
    return sorted(components, key=lambda item: item["centerY"])


def read_tesseract_lines(path: Path) -> list[dict]:
    grouped: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    with path.open(encoding="utf-8") as source:
        for row in csv.DictReader(source, delimiter="\t"):
            text = row.get("text", "").strip()
            if row.get("level") != "5" or not text:
                continue
            grouped[(row["block_num"], row["par_num"], row["line_num"])].append({
                "text": text,
                "left": int(row["left"]),
                "top": int(row["top"]),
                "width": int(row["width"]),
                "height": int(row["height"]),
                "confidence": float(row["conf"]),
            })
    lines = []
    for words in grouped.values():
        words.sort(key=lambda word: word["left"])
        left = min(word["left"] for word in words)
        top = min(word["top"] for word in words)
        right = max(word["left"] + word["width"] for word in words)
        bottom = max(word["top"] + word["height"] for word in words)
        lines.append({
            "text": " ".join(word["text"] for word in words),
            "left": left,
            "top": top,
            "right": right,
            "bottom": bottom,
            "centerY": (top + bottom) / 2,
            "confidence": round(sum(word["confidence"] for word in words) / len(words), 2),
        })
    return lines


def best_tesseract_line(lines: list[dict], bullet: dict, column: int, page_width: int) -> dict | None:
    column_left = 0 if column == 1 else page_width // 2
    column_right = page_width // 2 if column == 1 else page_width
    candidates = [
        line for line in lines
        if column_left <= line["left"] < column_right
        and line["right"] > bullet["x"] + bullet["width"]
        and abs(line["centerY"] - bullet["centerY"]) <= 65
    ]
    return min(candidates, key=lambda line: abs(line["centerY"] - bullet["centerY"]), default=None)


def best_vision_line(lines: list[dict], bullet: dict, column: int, page_height: int) -> dict | None:
    candidates = []
    for line in lines:
        if line["column"] != column:
            continue
        center_y = page_height * (1 - (line["y"] + line["height"] / 2))
        if abs(center_y - bullet["centerY"]) <= 65:
            candidates.append((abs(center_y - bullet["centerY"]), line))
    return min(candidates, key=lambda item: item[0], default=(None, None))[1]


def clean_headword(raw: str) -> str | None:
    if "/" not in raw:
        return None
    prefix = raw.split("/", 1)[0]
    prefix = re.sub(r"^[^A-Za-z]+", "", prefix).strip()
    prefix = re.sub(r"\s+", " ", prefix)
    return prefix or None


def ocr_row_fallback(image: Image.Image, bullet: dict, column: int) -> str:
    column_right = image.width // 2 - 20 if column == 1 else image.width - 70
    top = max(0, round(bullet["centerY"] - 43))
    bottom = min(image.height, round(bullet["centerY"] + 43))
    crop = image.crop((bullet["x"] + bullet["width"] + 8, top, column_right, bottom))
    with tempfile.NamedTemporaryFile(suffix=".png") as source:
        crop.save(source.name)
        completed = subprocess.run(
            ["tesseract", source.name, "stdout", "-l", "eng+chi_sim", "--psm", "7"],
            check=True,
            capture_output=True,
            text=True,
        )
    return completed.stdout.strip()


def stage_for_order(order: int) -> str:
    if order <= 1_080:
        return "high_frequency"
    if order <= 2_000:
        return "mid_frequency"
    return "low_frequency"


def day_for_order(order: int) -> int:
    if order <= 1_080:
        return (order - 1) // 60 + 1
    if order <= 2_000:
        return (order - 1_080 - 1) // 40 + 19
    return (order - 2_000 - 1) // 50 + 42


def group_for_order(order: int) -> int:
    if order <= 1_080:
        return (order - 1) // 30 + 1
    if order <= 2_000:
        return (order - 1_080 - 1) // 20 + 37
    return (order - 2_000 - 1) // 10 + 83


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--images-dir", required=True, type=Path)
    parser.add_argument("--vision-jsonl", required=True, type=Path)
    parser.add_argument("--tesseract-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    vision_by_file: dict[str, list[dict]] = defaultdict(list)
    for line in args.vision_jsonl.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        vision_by_file[record["file"]].append(record)

    entries = []
    page_receipts = []
    for pdf_page in range(2, 55):
        file_name = f"page-{pdf_page:02d}.jpg"
        image_path = args.images_dir / file_name
        image = Image.open(image_path).convert("RGB")
        page_sha256 = hashlib.sha256(image_path.read_bytes()).hexdigest()
        tesseract_lines = read_tesseract_lines(args.tesseract_dir / f"page-{pdf_page:02d}.tsv")
        page_bullets = []
        for column, (x0, x1) in enumerate((
            (round(image.width * 0.060), round(image.width * 0.125)),
            (round(image.width * 0.485), round(image.width * 0.560)),
        ), start=1):
            for bullet in find_bullets(image, x0, x1):
                bullet["column"] = column
                page_bullets.append(bullet)
        page_bullets.sort(key=lambda bullet: (bullet["column"], bullet["centerY"]))
        page_receipts.append({"pdfPage": pdf_page, "pageImageSha256": page_sha256, "entryCount": len(page_bullets)})
        for bullet in page_bullets:
            source_order = len(entries) + 1
            tesseract_line = best_tesseract_line(tesseract_lines, bullet, bullet["column"], image.width)
            vision_line = best_vision_line(vision_by_file[file_name], bullet, bullet["column"], image.height)
            tesseract_text = tesseract_line["text"] if tesseract_line else ""
            vision_text = vision_line["text"] if vision_line else ""
            fallback_text = ""
            if not (clean_headword(vision_text) or clean_headword(tesseract_text)):
                fallback_text = ocr_row_fallback(image, bullet, bullet["column"])
            entries.append({
                "sourceOrder": source_order,
                "frequencyRank": source_order,
                "stage": stage_for_order(source_order),
                "day": day_for_order(source_order),
                "week": (day_for_order(source_order) - 1) // 5 + 1,
                "sourceGroup": group_for_order(source_order),
                "curriculumTag": bullet["curriculumTag"],
                "pdfPage": pdf_page,
                "printedPage": pdf_page - 1,
                "column": bullet["column"],
                "rowBox": {key: bullet[key] for key in ("x", "y", "width", "height")},
                "pageImageSha256": page_sha256,
                "ocr": {
                    "vision": vision_text,
                    "visionConfidence": vision_line["confidence"] if vision_line else None,
                    "tesseract": tesseract_text,
                    "tesseractConfidence": tesseract_line["confidence"] if tesseract_line else None,
                    "rowFallback": fallback_text,
                },
                "candidateHeadword": clean_headword(vision_text) or clean_headword(tesseract_text) or clean_headword(fallback_text),
                "verification": "ocr-anchored-pending-page-review",
            })

    if len(entries) != 3_000:
        raise SystemExit(f"Expected exactly 3000 coloured entry bullets, found {len(entries)}")
    artifact = {
        "schemaVersion": "gaokao-frequency-source-ocr-v1",
        "programId": PROGRAM_ID,
        "sourcePdfSha256": SOURCE_SHA256,
        "pageReceipts": page_receipts,
        "entries": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "entries": len(entries),
        "initial": sum(entry["curriculumTag"] == "initial" for entry in entries),
        "required": sum(entry["curriculumTag"] == "required" for entry in entries),
        "elective": sum(entry["curriculumTag"] == "elective" for entry in entries),
        "missingHeadword": sum(not entry["candidateHeadword"] for entry in entries),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
