#!/usr/bin/env python3
"""Extract the five-column Wanwei index from full-page Tesseract TSV.

The source alternates left/right page geometry. Parsing full-page coordinates
avoids the clipped even-page crops used by the first OCR pass. A digit-only
pass is used as independent page-number evidence when it has a nearby match.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path


ODD_BANDS = ((.075, .245), (.255, .425), (.435, .615), (.615, .790), (.790, .960))
EVEN_BANDS = ((.040, .215), (.215, .400), (.395, .585), (.575, .755), (.755, .930))
ODD_DIGIT_LANES = ((.199, .244), (.371, .422), (.547, .600), (.725, .778), (.903, .958))
EVEN_DIGIT_LANES = ((.157, .210), (.333, .389), (.507, .565), (.684, .743), (.862, .921))


def read_words(path: Path) -> tuple[int, list[dict]]:
    width = 0
    words = []
    with path.open(encoding="utf-8", errors="ignore") as stream:
        for row in csv.DictReader(stream, delimiter="\t", quoting=csv.QUOTE_NONE):
            if row.get("level") == "1":
                width = int(row["width"])
            if row.get("level") == "5" and row.get("text", "").strip():
                words.append(row)
    if not width:
        raise ValueError(f"Missing page dimensions in {path}")
    return width, words


def numeric_value(text: str) -> int | None:
    digits = re.sub(r"[^0-9]", "", text)
    if not digits or len(digits) > 3:
        return None
    value = int(digits)
    return value if 1 <= value <= 233 else None


def clean_headword(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    return value.strip(" .,:;[]{}")


def digit_candidates(path: Path, lanes: tuple[tuple[float, float], ...]) -> dict[int, list[dict]]:
    width, words = read_words(path)
    result = defaultdict(list)
    for column, (left_ratio, right_ratio) in enumerate(lanes, start=1):
        left = left_ratio * width
        right = right_ratio * width
        for word in words:
            value = numeric_value(word["text"])
            x = int(word["left"])
            top = int(word["top"])
            if value is None or not left <= x < right or not 600 < top < 3450:
                continue
            result[column].append({"page": value, "top": top, "confidence": float(word["conf"])})
    return result


def extract_page(word_tsv: Path, digit_tsv: Path) -> list[dict]:
    page_match = re.search(r"(\d+)", word_tsv.stem)
    if not page_match:
        raise ValueError(f"Cannot determine PDF page from {word_tsv}")
    index_pdf_page = int(page_match.group(1))
    width, words = read_words(word_tsv)
    bands = ODD_BANDS if index_pdf_page % 2 else EVEN_BANDS
    lanes = ODD_DIGIT_LANES if index_pdf_page % 2 else EVEN_DIGIT_LANES
    independent_digits = digit_candidates(digit_tsv, lanes)
    records = []

    for column, (left_ratio, right_ratio) in enumerate(bands, start=1):
        left = left_ratio * width
        right = right_ratio * width
        column_words = [
            word for word in words
            if left <= int(word["left"]) < right and int(word["top"]) > 600
        ]
        grouped = defaultdict(list)
        for word in column_words:
            grouped[(word["block_num"], word["par_num"], word["line_num"])].append(word)
        lines = []
        for line_words in grouped.values():
            line_words.sort(key=lambda word: int(word["left"]))
            lines.append((min(int(word["top"]) for word in line_words), line_words))
        lines.sort(key=lambda item: item[0])

        pending = None
        for top, line_words in lines:
            minimum_x = min(int(word["left"]) for word in line_words)
            page_tokens = [
                (int(word["left"]), numeric_value(word["text"]))
                for word in line_words
                if numeric_value(word["text"]) is not None
                and int(word["left"]) > left + .55 * (right - left)
            ]
            printed_page = max(page_tokens)[1] if page_tokens else None
            page_xs = {x for x, _ in page_tokens}
            content = clean_headword(" ".join(
                word["text"] for word in line_words if int(word["left"]) not in page_xs
            ))
            starts_entry = minimum_x < left + .35 * (right - left)

            if starts_entry:
                if pending:
                    records.append(pending)
                pending = {
                    "headword": content,
                    "printedPage": printed_page,
                    "indexPdfPage": index_pdf_page,
                    "indexColumn": column,
                    "top": top,
                    "evidence": "full-page-psm4",
                }
                if printed_page is not None:
                    records.append(pending)
                    pending = None
            elif pending:
                pending["headword"] = clean_headword(f"{pending['headword']} {content}")
                if printed_page is not None:
                    pending["printedPage"] = printed_page
                    records.append(pending)
                    pending = None
        if pending:
            records.append(pending)

        for record in (entry for entry in records if entry["indexPdfPage"] == index_pdf_page and entry["indexColumn"] == column):
            nearby = sorted(
                independent_digits[column],
                key=lambda candidate: abs(candidate["top"] - record["top"]),
            )
            if nearby and abs(nearby[0]["top"] - record["top"]) <= 45:
                digit_page = nearby[0]["page"]
                if record["printedPage"] is None:
                    record["printedPage"] = digit_page
                    record["evidence"] = "digit-psm11-recovery"
                elif record["printedPage"] == digit_page:
                    record["evidence"] = "full-page-psm4+digit-psm11"
                elif len(str(digit_page)) > len(str(record["printedPage"])):
                    record["printedPage"] = digit_page
                    record["evidence"] = "digit-psm11-longer-recovery"
                else:
                    record["digitCandidatePage"] = digit_page
                    record["evidence"] = "full-page-psm4-digit-disagreement"

    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--word-tsv-dir", required=True, type=Path)
    parser.add_argument("--digit-tsv-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    records = []
    for word_tsv in sorted(args.word_tsv_dir.glob("page-*.tsv")):
        digit_tsv = args.digit_tsv_dir / word_tsv.name
        if not digit_tsv.exists():
            raise SystemExit(f"Missing digit TSV: {digit_tsv}")
        records.extend(extract_page(word_tsv, digit_tsv))

    artifact = {
        "schemaVersion": "wanwei-index-full-tsv-v1",
        "source": "万唯系列中考词汇一轮梳理.pdf",
        "recordCount": len(records),
        "missingPrintedPageCount": sum(entry["printedPage"] is None for entry in records),
        "entries": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "records": artifact["recordCount"],
        "missingPrintedPage": artifact["missingPrintedPageCount"],
    }))


if __name__ == "__main__":
    main()
