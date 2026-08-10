#!/usr/bin/env python3
"""Merge independent OCR passes for the Wanwei alphabetical vocabulary index.

The source PDF is scanned and has no text layer. This script deliberately keeps
raw OCR evidence and uncertainty diagnostics instead of filling gaps to reach a
target count. It expects the temporary TSV directories produced during the
document OCR pass and writes a reviewable JSON artifact.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import OrderedDict
from pathlib import Path


PAGE_PATTERN = re.compile(r"(?<![A-Za-z0-9])([1-9][0-9]{0,2})(?![A-Za-z0-9])")
LETTER_PATTERN = re.compile(r"[A-Za-z]")


def read_lines(path: Path) -> list[dict]:
    grouped: OrderedDict[tuple[str, str, str], list[dict]] = OrderedDict()
    with path.open(encoding="utf-8", errors="ignore") as stream:
        # Tesseract emits raw quote glyphs in the final text field (for
        # example `"bad`). TSV has no CSV quoting contract, so QUOTE_MINIMAL
        # would swallow subsequent physical rows into that field.
        for row in csv.DictReader(stream, delimiter="\t", quoting=csv.QUOTE_NONE):
            if row.get("level") != "5" or not row.get("text", "").strip():
                continue
            key = (row["block_num"], row["par_num"], row["line_num"])
            grouped.setdefault(key, []).append(row)

    lines = []
    for words in grouped.values():
        left = min(int(word["left"]) for word in words)
        top = min(int(word["top"]) for word in words)
        right = max(int(word["left"]) + int(word["width"]) for word in words)
        bottom = max(int(word["top"]) + int(word["height"]) for word in words)
        lines.append({
            "text": " ".join(word["text"] for word in words).strip(),
            "left": left,
            "top": top,
            "right": right,
            "bottom": bottom,
            "centerY": (top + bottom) / 2,
        })
    return sorted(lines, key=lambda line: (line["top"], line["left"]))


def valid_pages(text: str) -> list[tuple[int, re.Match[str]]]:
    return [
        (int(match.group(1)), match)
        for match in PAGE_PATTERN.finditer(text)
        if 1 <= int(match.group(1)) <= 233
    ]


def clean_headword(raw: str) -> str:
    value = raw.strip().replace("|", " ")
    value = re.sub(r"^[^A-Za-z]+", "", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip(" .,:;[]{}")


def is_section_heading(text: str) -> bool:
    value = re.sub(r"[^A-Za-z]", "", text)
    return len(value) == 1 and value.isupper()


def join_pending_text(lines: list[dict], final_match: re.Match[str]) -> str:
    parts = [line["text"] for line in lines[:-1]]
    parts.append(lines[-1]["text"][:final_match.start()])
    value = " ".join(part.strip() for part in parts if part.strip())
    value = re.sub(r"-\s+", "", value)
    return value


def extract_crop(full_tsv: Path, digit_tsv: Path, word_tsv: Path | None = None) -> tuple[list[dict], list[dict]]:
    lines = read_lines(full_tsv)
    word_lines = read_lines(word_tsv) if word_tsv else []
    digit_lines = []
    for line in read_lines(digit_tsv):
        pages = valid_pages(line["text"])
        if not pages or line["left"] < 50:
            continue
        page, _ = pages[-1]
        digit_lines.append({**line, "page": page})

    records: list[dict] = []
    unmatched: list[dict] = []
    used_digit_indexes: set[int] = set()

    pending: list[dict] = []

    def finish_with_digit(evidence: str) -> bool:
        if not pending:
            return False
        center_y = pending[-1]["centerY"]
        nearby = [
            (abs(candidate["centerY"] - center_y), index, candidate)
            for index, candidate in enumerate(digit_lines)
            if index not in used_digit_indexes and abs(candidate["centerY"] - center_y) <= 28
        ]
        if not nearby:
            return False
        _, digit_index, candidate = min(nearby, key=lambda item: (item[0], -item[2]["left"]))
        used_digit_indexes.add(digit_index)
        raw_headword = " ".join(line["text"] for line in pending)
        headword = clean_headword(re.sub(r"-\s+", "", raw_headword))
        if headword:
            records.append({
                "headword": headword,
                "printedPage": candidate["page"],
                "evidence": evidence,
                "raw": raw_headword,
                "top": pending[0]["top"],
                "endCenterY": pending[-1]["centerY"],
                "lineIndex": pending[0]["lineIndex"],
            })
        pending.clear()
        return True

    for line_index, line in enumerate(lines):
        line = {**line, "lineIndex": line_index}
        if is_section_heading(line["text"]):
            continue
        if pending and line["left"] < 55:
            if not finish_with_digit("digit-psm11-before-next-row"):
                unmatched.append({
                    "headword": clean_headword(" ".join(item["text"] for item in pending)),
                    "raw": " ".join(item["text"] for item in pending),
                    "top": pending[0]["top"],
                    "lineIndex": pending[0]["lineIndex"],
                })
                pending.clear()
        if not LETTER_PATTERN.search(line["text"]) and not pending:
            continue
        pending.append(line)
        pages = valid_pages(line["text"])
        if not pages:
            continue
        page, match = pages[-1]
        # The general OCR pass occasionally drops a leading digit (117 ->
        # 17, 126 -> 26).  A digit-only pass is intentionally run over the
        # same crop, so prefer its rightmost number on the same baseline.
        nearby_digits = [
            (abs(candidate["centerY"] - line["centerY"]), index, candidate)
            for index, candidate in enumerate(digit_lines)
            if index not in used_digit_indexes
            and abs(candidate["centerY"] - line["centerY"]) <= 28
        ]
        used_digit_confirmation = False
        if nearby_digits:
            _, digit_index, digit_candidate = min(
                nearby_digits,
                key=lambda item: (item[0], -item[2]["left"]),
            )
            digit_page = digit_candidate["page"]
            # Only repair a dropped leading digit.  The digit-only pass can
            # itself lose a leading digit, so it must never shorten or replace
            # an otherwise unrelated value from the general pass.
            if digit_page == page or (
                len(str(digit_page)) > len(str(page))
                and str(digit_page).endswith(str(page))
            ):
                page = digit_page
                used_digit_indexes.add(digit_index)
                used_digit_confirmation = True
        raw_headword = join_pending_text(pending, match)
        headword = clean_headword(raw_headword)
        if headword:
            records.append({
                "headword": headword,
                "printedPage": page,
                "evidence": "digit-psm11-confirmed" if used_digit_confirmation else "full-psm6-coalesced",
                "raw": " ".join(item["text"] for item in pending),
                "top": pending[0]["top"],
                "endCenterY": pending[-1]["centerY"],
                "lineIndex": pending[0]["lineIndex"],
            })
        pending.clear()

    if pending and not finish_with_digit("digit-psm11-end-of-crop"):
        unmatched.append({
            "headword": clean_headword(" ".join(item["text"] for item in pending)),
            "raw": " ".join(item["text"] for item in pending),
            "top": pending[0]["top"],
            "lineIndex": pending[0]["lineIndex"],
        })

    for candidate in digit_lines:
        if any(abs(record.get("endCenterY", record["top"]) - candidate["centerY"]) <= 24 for record in records):
            continue
        nearby_lines = [
            line for line in [*lines, *word_lines]
            if LETTER_PATTERN.search(line["text"])
            and line["left"] < 300
            and abs(line["centerY"] - candidate["centerY"]) <= 30
        ]
        if not nearby_lines:
            continue
        line = min(nearby_lines, key=lambda item: abs(item["centerY"] - candidate["centerY"]))
        headword = clean_headword(re.sub(r"\s+[0-9]{1,3}\s*$", "", line["text"]))
        if not headword or is_section_heading(headword):
            continue
        records.append({
            "headword": headword,
            "printedPage": candidate["page"],
            "evidence": "digit-psm11-recovery",
            "raw": line["text"],
            "top": line["top"],
            "endCenterY": line["centerY"],
            "lineIndex": lines.index(line) if line in lines else -1,
        })

    records.sort(key=lambda record: (record["top"], record["lineIndex"]))

    return records, unmatched


def stage_for_page(page: int) -> str:
    if page <= 189:
        return "core"
    if page <= 222:
        return "basic"
    return "recognition"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--full-tsv-dir", required=True, type=Path)
    parser.add_argument("--digit-tsv-dir", required=True, type=Path)
    parser.add_argument("--word-tsv-dir", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    all_records = []
    diagnostics = []
    for full_tsv in sorted(args.full_tsv_dir.glob("p*.tsv")):
        digit_tsv = args.digit_tsv_dir / full_tsv.name
        if not digit_tsv.exists():
            raise SystemExit(f"Missing digit OCR evidence: {digit_tsv}")
        word_tsv = args.word_tsv_dir / full_tsv.name if args.word_tsv_dir else None
        if word_tsv is not None and not word_tsv.exists():
            raise SystemExit(f"Missing word OCR evidence: {word_tsv}")
        records, unmatched = extract_crop(full_tsv, digit_tsv, word_tsv)
        page_match = re.search(r"p(\d+)-c(\d+)", full_tsv.stem)
        source_page = int(page_match.group(1)) if page_match else None
        column = int(page_match.group(2)) if page_match else None
        for record in records:
            record.update({"indexPdfPage": source_page, "indexColumn": column})
            record["stage"] = stage_for_page(record["printedPage"])
            all_records.append(record)
        if unmatched:
            diagnostics.append({
                "indexPdfPage": source_page,
                "indexColumn": column,
                "unmatched": unmatched,
            })

    stage_counts = {
        stage: sum(record["stage"] == stage for record in all_records)
        for stage in ("core", "basic", "recognition")
    }
    artifact = {
        "schemaVersion": "wanwei-index-ocr-v1",
        "source": "万唯系列中考词汇一轮梳理.pdf",
        "expectedCounts": {"core": 477, "basic": 764, "recognition": 359, "total": 1600},
        "observedCounts": {**stage_counts, "total": len(all_records)},
        "entries": all_records,
        "diagnostics": diagnostics,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(artifact["observedCounts"], ensure_ascii=False))
    print(f"diagnostic crops: {len(diagnostics)}")


if __name__ == "__main__":
    main()
