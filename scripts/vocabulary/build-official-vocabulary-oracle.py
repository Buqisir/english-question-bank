#!/usr/bin/env python3
"""Build the 1,600-row curriculum spelling oracle from reviewed OCR evidence.

The input is the page/column OCR JSON produced from pages 105-135 of the
official 2022 English curriculum standard. Corrections below are deliberately
page-addressed so a changed OCR result fails instead of silently applying a
repair to another row.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


SKIP_LINES = {"WS.", "lll", "1i7?", "Cc", "v", "Ww", "xX"}

CORRECTIONS = {
    (106, "R", "Al (= artificial intelligence)"): "AI (= artificial intelligence)",
    (106, "R", "air’"): "air",
    (108, "R", "—"): "boat",
    (109, "R", 'on"'): "cap",
    (109, "R", "_"): "car",
    (112, "L", 'ay"'): "cry",
    (112, "L", "Sieh?"): "dance",
    (113, "L", "a af"): "door",
    (116, "L", 'ae"'): "game",
    (116, "L", "i’"): "get",
    (116, "R", 'ween"'): "green",
    (116, "R", "god a"): "god",
    (116, "R", "grape * |"): "grape",
    (117, "L", "—_"): "happy",
    (117, "L", "have (hes) *"): "have",
    (117, "R", "—_"): "home",
    (118, "R", "in’"): "in",
    (119, "R", "knife (pil. knives)"): "knife (pl. knives)",
    (121, "L", "on"): "map",
    (123, "R", "gir’"): "pair",
    (123, "R", "wanes"): "paper",
    (125, "L", "policeman / policewoman (pl."): "policeman / policewoman (pl. policemen / policewomen)",
    (125, "L", "postman (p/. postmen)"): "postman (pl. postmen)",
    (126, "L", "wit"): "put",
    (128, "L", "—,"): "share",
    (129, "R", "eveni:*"): "speak",
    (130, "R", "wai*"): "sun",
    (130, "R", "—"): "sure",
    (130, "R", 'soon”'): "sweep",
    (131, "L", 'inn”'): "tea",
    (132, "R", "brsitn *"): "train",
    (132, "R", 'ree”'): "tree",
    (132, "L", "toy e"): "toy",
    (132, "R", 'tum”'): "turn",
    (132, "R", "waeiinei*"): "under",
    (133, "L", "a"): "up",
    (133, "R", "oe?"): "warm",
    (133, "R", "anit"): "wear",
    (134, "L", "iia"): "when",
    (135, "R", "—"): "zoo",
}


def clean_label(raw: str) -> str:
    value = raw.strip().replace("pi.", "pl.")
    value = re.sub(r"\s*[＊*“”\"~|]+\s*$", "", value)
    value = re.sub(r"\s*/\s*", " / ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def match_key(label: str) -> str:
    value = label.lower()
    value = re.sub(r"\s*\((?:pl\.|ame|=).*", "", value)
    value = value.replace(" / ", "/")
    return re.sub(r"[^a-z]+", " ", value).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ocr-json", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    source = json.loads(args.ocr_json.read_text(encoding="utf-8"))
    rows = []
    applied_corrections = set()
    for column in source:
        page = int(column["page"])
        side = column["side"]
        for raw in column["lines"]:
            if re.fullmatch(r"\d+", raw) or re.fullmatch(r"[A-Z]", raw) or raw in SKIP_LINES:
                continue
            if raw.startswith("policemen / policewomen"):
                continue
            correction_key = (page, side, raw)
            corrected = CORRECTIONS.get(correction_key, raw)
            if correction_key in CORRECTIONS:
                applied_corrections.add(correction_key)
            label = clean_label(corrected)
            rows.append({
                "oracleOrder": len(rows) + 1,
                "label": label,
                "matchKey": match_key(label),
                "officialPdfPage": page,
                "column": side,
                "rawOcr": raw,
                "correction": corrected if corrected != raw else None,
            })

    unapplied = sorted(set(CORRECTIONS) - applied_corrections)
    if unapplied:
        raise SystemExit(f"Reviewed OCR correction targets disappeared: {unapplied}")
    if len(rows) != 1600:
        raise SystemExit(f"Expected exactly 1600 curriculum rows, observed {len(rows)}")
    if any(not row["matchKey"] for row in rows):
        raise SystemExit("At least one curriculum row has no usable match key")

    artifact = {
        "schemaVersion": "official-2022-grade-three-vocabulary-oracle-v1",
        "sourceTitle": "义务教育英语课程标准（2022年版）",
        "purpose": "Spelling oracle only; Wanwei remains authoritative for stage, Day, order, meaning, and source page.",
        "count": len(rows),
        "entries": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"count": len(rows), "reviewedCorrections": len(applied_corrections)}))


if __name__ == "__main__":
    main()
