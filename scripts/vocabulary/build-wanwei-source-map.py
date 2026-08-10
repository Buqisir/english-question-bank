#!/usr/bin/env python3
"""Build the reviewed Wanwei stage/Day/source-order map.

The alphabetical index establishes printed pages. Reviewed heading evidence and
explicit page overrides are applied by align-wanwei-index-to-official.py first.
This step converts that page evidence into the source book's 60 Day groups and
stable source order; it does not create teaching content.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path


DAY_STARTS = {
    1: 1, 2: 5, 3: 9, 4: 13, 5: 17, 6: 22, 7: 26, 8: 30, 9: 34, 10: 39,
    11: 44, 12: 48, 13: 52, 14: 56, 15: 59, 16: 64, 17: 68, 18: 73, 19: 77, 20: 81,
    21: 86, 22: 90, 23: 94, 24: 98, 25: 101, 26: 106, 27: 110, 28: 114, 29: 117, 30: 121,
    31: 126, 32: 131, 33: 134, 34: 137, 35: 140, 36: 145, 37: 149, 38: 152, 39: 156, 40: 160,
    41: 165, 42: 170, 43: 175, 44: 180, 45: 185,
    46: 190, 47: 194, 48: 197, 49: 201, 50: 204, 51: 208, 52: 210, 53: 214, 54: 217, 55: 220,
    56: 223, 57: 226, 58: 228, 59: 230, 60: 232,
}

STAGE_RANK = {"core": 0, "basic": 1, "recognition": 2}
ADVERTISED_WORD_COUNTS = {"core": 477, "basic": 764, "recognition": 359}
EXPECTED_ENTRY_COUNTS = {"core": 476, "basic": 766, "recognition": 358}
SOURCE_TITLE = "万唯系列中考词汇一轮梳理"
SOURCE_EDITION = "第8版（2025年5月印刷）"
GOLDEN_FIRST_30 = [
    "a / an", "about", "accept", "achieve", "across", "active", "advice", "afford", "afraid",
    "against", "agree", "all", "allow", "alone", "along", "angry", "another", "answer",
    "appear", "around", "arrive", "as", "ask", "at", "attend", "attention", "avoid", "away",
    "back", "bad",
]


def day_for_page(printed_page: int) -> int:
    candidates = [day for day, start in DAY_STARTS.items() if start <= printed_page]
    if not candidates:
        raise ValueError(f"Printed page {printed_page} precedes Day 1")
    return max(candidates)


def slug(value: str) -> str:
    return re.sub(r"[^a-z]", "-", value.lower())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--alignment", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    alignment = json.loads(args.alignment.read_text(encoding="utf-8"))
    entries = alignment["entries"]
    if len(entries) != 1600 or any(entry.get("printedPage") is None for entry in entries):
        raise SystemExit("Alignment must contain exactly 1,600 resolved entries")

    counts = Counter(entry["stage"] for entry in entries)
    if dict(counts) != EXPECTED_ENTRY_COUNTS:
        raise SystemExit(f"Stage counts are not reviewed totals: {dict(counts)}")

    sorted_entries = sorted(
        entries,
        key=lambda entry: (
            STAGE_RANK[entry["stage"]],
            entry["printedPage"],
            entry["oracleOrder"],
        ),
    )
    per_day_index: Counter[int] = Counter()
    output_entries = []
    for source_order, entry in enumerate(sorted_entries, start=1):
        day = day_for_page(entry["printedPage"])
        expected_stage = "core" if day <= 45 else "basic" if day <= 55 else "recognition"
        if entry["stage"] != expected_stage:
            raise SystemExit(
                f"Stage/Day disagreement for {entry['label']}: {entry['stage']} / Day {day}"
            )
        per_day_index[day] += 1
        output_entries.append({
            "id": f"wanwei-{entry['stage']}-{source_order:04d}-{slug(entry['label'])}",
            "headword": entry["label"],
            "matchKey": entry["matchKey"],
            "stage": entry["stage"],
            "day": day,
            "week": (day - 1) // 5 + 1,
            "indexInDay": per_day_index[day],
            "sourceOrder": source_order,
            "printedPage": entry["printedPage"],
            "officialOracleOrder": entry["oracleOrder"],
            "verification": "page-checked" if entry.get("reviewedPageOverride") else "index-and-heading-reviewed",
        })

    observed_canary = [entry["headword"] for entry in output_entries[:30]]
    if observed_canary != GOLDEN_FIRST_30:
        raise SystemExit(
            "Source ordering disagrees with the page-checked 30-word canary: "
            f"{observed_canary}"
        )

    groups = []
    for day in range(1, 61):
        day_entries = [entry for entry in output_entries if entry["day"] == day]
        if not day_entries:
            raise SystemExit(f"Day {day} has no vocabulary entries")
        stage = day_entries[0]["stage"]
        groups.append({
            "id": f"wanwei-{stage}-day-{day:02d}",
            "stage": stage,
            "week": (day - 1) // 5 + 1,
            "groupNumber": day,
            "sourceLabel": f"Day {day}",
            "startOrder": day_entries[0]["sourceOrder"],
            "endOrder": day_entries[-1]["sourceOrder"],
            "entryCount": len(day_entries),
            "startPrintedPage": DAY_STARTS[day],
        })

    artifact = {
        "schemaVersion": "wanwei-round-one-source-map-v1",
        "programId": "wanwei-round-one-v1",
        "sourceTitle": SOURCE_TITLE,
        "sourceEdition": SOURCE_EDITION,
        "advertisedWordCounts": {**ADVERTISED_WORD_COUNTS, "total": 1600},
        "entryCounts": {**EXPECTED_ENTRY_COUNTS, "total": len(output_entries)},
        "groups": groups,
        "entries": output_entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"entryCounts": artifact["entryCounts"], "groups": len(groups)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
