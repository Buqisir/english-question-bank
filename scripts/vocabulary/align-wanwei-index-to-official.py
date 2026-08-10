#!/usr/bin/env python3
"""Align Wanwei index OCR rows to the reviewed 1,600-row spelling oracle.

Both sources are alphabetical. The alignment keeps the Wanwei printed-page
evidence and exposes unresolved rows; it never forces stage counts or invents a
page merely to satisfy the expected total.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import unicodedata
from pathlib import Path


REVIEWED_PAGE_OVERRIDES = {
    40: 191, 61: 7, 75: 191, 91: 11, 95: 223, 96: 12, 105: 13, 130: 192, 145: 17, 159: 193, 166: 193,
    170: 193, 249: 195, 279: 225,
    236: 224, 254: 225, 273: 225, 311: 32, 388: 226, 426: 198, 483: 52, 499: 200, 535: 227, 571: 202,
    525: 57, 532: 227, 539: 227, 551: 201, 559: 201, 605: 202, 633: 203, 642: 74, 645: 227, 650: 203,
    637: 73, 651: 203, 652: 203, 659: 75, 660: 227, 661: 203, 665: 77, 668: 228, 684: 204, 690: 204,
    716: 228, 750: 205, 790: 95, 823: 229, 894: 207, 913: 208, 928: 112, 980: 230,
    901: 207, 965: 209,
    982: 209, 989: 209, 996: 122, 997: 209, 1002: 230, 1031: 126, 1033: 210, 1034: 126, 1035: 210,
    1037: 127, 1038: 210, 1039: 127, 1063: 210, 1074: 211, 1109: 211, 1145: 141, 1183: 213,
    1152: 212, 1172: 213, 1184: 231, 1185: 213, 1226: 214, 1254: 152, 1259: 153,
    1265: 231, 1266: 215, 1291: 216, 1296: 156, 1335: 232,
    1349: 165, 1351: 217, 1354: 217, 1357: 217, 1358: 166, 1360: 166, 1361: 217, 1363: 217, 1367: 217,
    1369: 217, 1372: 167, 1373: 217, 1399: 218,
    1403: 218, 1427: 172, 1428: 232, 1430: 173, 1432: 233, 1437: 219,
    1471: 220, 1480: 233, 1485: 220, 1510: 181, 1536: 233, 1543: 221, 1573: 222, 1581: 222,
    1587: 222, 1598: 233,
    808: 205,
}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower()
    value = re.sub(r"\s*\((?:pl\.|ame|=).*", "", value)
    return re.sub(r"[^a-z]+", "", value)


def match_score(official: str, observed: str) -> float:
    official_key = normalize(official)
    observed_key = normalize(observed)
    if not official_key or not observed_key:
        return -3.0
    if official_key == observed_key:
        return 8.0
    if observed_key.endswith(official_key) and len(observed_key) - len(official_key) <= 4:
        return 7.0 - 0.3 * (len(observed_key) - len(official_key))
    if official_key.endswith(observed_key) and len(official_key) - len(observed_key) <= 3:
        return 5.5 - 0.4 * (len(official_key) - len(observed_key))
    if official_key in observed_key and len(observed_key) - len(official_key) <= 6:
        return 6.0 - 0.3 * (len(observed_key) - len(official_key))
    return 5.0 * difflib.SequenceMatcher(None, official_key, observed_key).ratio() - 1.5


def align(official: list[dict], observed: list[dict]) -> dict[int, tuple[int, float]]:
    official_count = len(official)
    observed_count = len(observed)
    previous = [-index for index in range(observed_count + 1)]
    backtrack: list[bytearray] = []

    for official_index in range(1, official_count + 1):
        current = [-1.2 * official_index] + [0.0] * observed_count
        row = bytearray(observed_count + 1)
        for observed_index in range(1, observed_count + 1):
            options = (
                previous[observed_index - 1] + match_score(
                    official[official_index - 1]["label"], observed[observed_index - 1]["headword"]
                ),
                previous[observed_index] - 1.2,
                current[observed_index - 1] - 1.0,
            )
            choice = max(range(3), key=options.__getitem__)
            current[observed_index] = options[choice]
            row[observed_index] = choice
        previous = current
        backtrack.append(row)

    official_index = official_count
    observed_index = observed_count
    matches: dict[int, tuple[int, float]] = {}
    while official_index > 0 or observed_index > 0:
        if official_index > 0 and observed_index > 0:
            choice = backtrack[official_index - 1][observed_index]
        elif official_index > 0:
            choice = 1
        else:
            choice = 2
        if choice == 0:
            score = match_score(
                official[official_index - 1]["label"], observed[observed_index - 1]["headword"]
            )
            matches[official_index - 1] = (observed_index - 1, score)
            official_index -= 1
            observed_index -= 1
        elif choice == 1:
            official_index -= 1
        else:
            observed_index -= 1
    return matches


def stage_for_page(page: int) -> str:
    if page <= 189:
        return "core"
    if page <= 222:
        return "basic"
    return "recognition"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--official", required=True, type=Path)
    parser.add_argument("--wanwei-index", required=True, type=Path)
    parser.add_argument("--heading-evidence", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    official = json.loads(args.official.read_text(encoding="utf-8"))["entries"]
    wanwei_artifact = json.loads(args.wanwei_index.read_text(encoding="utf-8"))
    observed = [entry for entry in wanwei_artifact["entries"] if len(entry["headword"]) <= 120]
    matches = align(official, observed)

    entries = []
    for index, oracle_entry in enumerate(official):
        match = matches.get(index)
        if match is None:
            entries.append({**oracle_entry, "printedPage": None, "stage": None, "alignment": None})
            continue
        observed_index, score = match
        evidence = observed[observed_index]
        printed_page = evidence.get("printedPage")
        entries.append({
            **oracle_entry,
            "printedPage": printed_page,
            "stage": stage_for_page(printed_page) if printed_page is not None else None,
            "alignment": {
                "score": round(score, 3),
                "ocrHeadword": evidence["headword"],
                "indexPdfPage": evidence["indexPdfPage"],
                "indexColumn": evidence["indexColumn"],
                "evidence": evidence["evidence"],
            },
        })

    for index, entry in enumerate(entries):
        if entry["printedPage"] is not None:
            continue
        previous = next((candidate for candidate in reversed(entries[:index]) if candidate["printedPage"] is not None), None)
        following = next((candidate for candidate in entries[index + 1:] if candidate["printedPage"] is not None), None)
        if previous and following and previous["printedPage"] == following["printedPage"]:
            entry["printedPage"] = previous["printedPage"]
            entry["stage"] = previous["stage"]
            entry["alignment"] = {"score": None, "evidence": "index-neighbour-page-consensus"}

    if args.heading_evidence:
        heading_evidence = json.loads(args.heading_evidence.read_text(encoding="utf-8"))
        for evidence in heading_evidence["resolved"]:
            entry = entries[evidence["oracleOrder"] - 1]
            entry["printedPage"] = evidence["printedPage"]
            entry["stage"] = stage_for_page(evidence["printedPage"])
            entry["headingEvidence"] = evidence["evidence"]

    for oracle_order, printed_page in REVIEWED_PAGE_OVERRIDES.items():
        entry = entries[oracle_order - 1]
        entry["printedPage"] = printed_page
        entry["stage"] = stage_for_page(printed_page)
        entry["reviewedPageOverride"] = True

    unresolved = [entry for entry in entries if entry["printedPage"] is None]
    stage_counts = {
        stage: sum(entry["stage"] == stage for entry in entries)
        for stage in ("core", "basic", "recognition")
    }
    artifact = {
        "schemaVersion": "wanwei-index-alignment-v1",
        "source": wanwei_artifact["source"],
        # The cover's 477 / 764 / 359 values count words, not card-sized
        # source rows.  The source's per-Day numbering yields 476 / 765 / 359
        # rows after grouped forms such as a/an remain one entry.
        "advertisedWordCounts": {"core": 477, "basic": 764, "recognition": 359, "total": 1600},
        "expectedEntryCounts": {"core": 476, "basic": 766, "recognition": 358, "total": 1600},
        "observedCounts": {**stage_counts, "resolved": 1600 - len(unresolved), "unresolved": len(unresolved)},
        "entries": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(artifact["observedCounts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
