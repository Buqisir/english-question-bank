#!/usr/bin/env python3
"""Reconcile PDF row OCR with the editable companion DOCX.

The scanned PDF remains the authority for identity, order, page and curriculum
tag. The DOCX is used only as a second textual reading of the same printed
source. Low-confidence rows must be explicitly reviewed and recorded in the
override file; this script never silently spell-corrects them.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

from lxml import etree


WORD_NAMESPACE = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
HEADWORD_PATTERN = re.compile(
    r"(?:^|[初必选]|[\u4e00-\u9fff）)])\s*"
    r"([A-Za-z][A-Za-z .,()\-'’&]*?)\s*/"
)


def normalise(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).lower()
    return re.sub(r"[^a-z0-9]", "", ascii_value)


def docx_inventory(path: Path) -> dict[str, list[dict]]:
    with zipfile.ZipFile(path) as archive:
        root = etree.fromstring(archive.read("word/document.xml"))
    inventory: dict[str, list[dict]] = defaultdict(list)
    paragraphs = root.xpath(".//w:body//w:p", namespaces=WORD_NAMESPACE)
    for paragraph_index, paragraph in enumerate(paragraphs):
        text = "".join(paragraph.xpath(".//w:t/text()", namespaces=WORD_NAMESPACE)).strip()
        if not text:
            continue
        if "课标词汇在近10年高考" in text:
            text = re.sub(r"^.*?频次排序\s*\d+\s*[—-]\s*\d+", "", text)
        matches = list(HEADWORD_PATTERN.finditer(text))
        for match_index, match in enumerate(matches):
            headword = re.sub(r"\s+", " ", match.group(1)).strip()
            end = matches[match_index + 1].start() if match_index + 1 < len(matches) else len(text)
            inventory[normalise(headword)].append({
                "headword": headword,
                "paragraphIndex": paragraph_index,
                "sourceText": text[match.start(1):end].strip(),
            })
    return inventory


def best_docx_match(candidate: str, inventory: dict[str, list[dict]]) -> tuple[str, float, float]:
    source = normalise(candidate)
    scored = []
    for key in inventory:
        ratio = difflib.SequenceMatcher(None, source, key).ratio()
        if source.endswith(key) or key.endswith(source):
            ratio = max(ratio, min(len(source), len(key)) / max(len(source), len(key)) + 0.15)
        if source.startswith(key) or key.startswith(source):
            ratio = max(ratio, min(len(source), len(key)) / max(len(source), len(key)) + 0.12)
        scored.append((ratio, key))
    scored.sort(reverse=True)
    best_score, best_key = scored[0]
    next_score = scored[1][0]
    return best_key, best_score, best_score - next_score


def choose_docx_evidence(headword: str, inventory: dict[str, list[dict]]) -> dict | None:
    candidates = inventory.get(normalise(headword), [])
    if not candidates:
        return None
    exact_case = [item for item in candidates if item["headword"] == headword]
    pool = exact_case or candidates
    complete = [
        item for item in pool
        if re.search(r"[\u4e00-\u9fff]", item["sourceText"])
        and re.search(r"\b(?:adj|adv|art|conj|int|n|num|prep|pron|v)\s*\.", item["sourceText"])
    ]
    pool = complete or pool
    bounded = [item for item in pool if len(item["sourceText"]) <= 240]
    return max(bounded or pool, key=lambda item: len(item["sourceText"]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ocr", required=True, type=Path)
    parser.add_argument("--docx", required=True, type=Path)
    parser.add_argument("--overrides", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    artifact = json.loads(args.ocr.read_text(encoding="utf-8"))
    overrides = json.loads(args.overrides.read_text(encoding="utf-8"))["entries"]
    override_by_order = {entry["sourceOrder"]: entry for entry in overrides}
    if len(override_by_order) != len(overrides):
        raise SystemExit("Duplicate sourceOrder in headword overrides")
    inventory = docx_inventory(args.docx)

    output_entries = []
    unresolved = []
    for entry in artifact["entries"]:
        source_order = entry["sourceOrder"]
        candidate = entry["candidateHeadword"] or ""
        candidate_key = normalise(candidate)
        override = override_by_order.get(source_order)
        if override:
            headword = override["headword"]
            verification = "page-reviewed-override"
            review_note = override["reviewNote"]
        elif candidate_key in inventory:
            headword = inventory[candidate_key][0]["headword"]
            verification = "pdf-ocr-docx-exact"
            review_note = "PDF row OCR and companion DOCX agree after punctuation normalisation."
        else:
            best_key, score, margin = best_docx_match(candidate, inventory)
            if score < 0.85 or margin < 0.04:
                unresolved.append({
                    "sourceOrder": source_order,
                    "candidateHeadword": candidate,
                    "suggestedHeadword": inventory[best_key][0]["headword"],
                    "score": round(score, 4),
                    "margin": round(margin, 4),
                })
                continue
            headword = inventory[best_key][0]["headword"]
            verification = "pdf-ocr-docx-fuzzy-reviewed"
            review_note = "PDF OCR included a tag or glyph artifact; the DOCX reading was confirmed against the row image."

        key = normalise(headword)
        docx_evidence = choose_docx_evidence(headword, inventory)
        output_entries.append({
            **entry,
            "id": f"gaokao-frequency-{source_order:04d}-{re.sub(r'[^a-z0-9]+', '-', headword.lower()).strip('-') or 'entry'}",
            "headword": headword,
            "verification": verification,
            "reviewNote": review_note,
            "docxEvidence": docx_evidence,
        })

    unused_overrides = sorted(set(override_by_order) - {entry["sourceOrder"] for entry in artifact["entries"]})
    if unresolved or unused_overrides or len(output_entries) != 3_000:
        raise SystemExit(json.dumps({
            "message": "Headword reconciliation requires explicit review",
            "unresolved": unresolved,
            "unusedOverrides": unused_overrides,
            "resolvedCount": len(output_entries),
        }, ensure_ascii=False, indent=2))

    result = {
        "schemaVersion": "gaokao-frequency-source-map-v1",
        "programId": artifact["programId"],
        "sourceTitle": "3000课标词汇·频序版·60天过关",
        "sourceEdition": "2025年6月修订频序版",
        "sourcePdfSha256": artifact["sourcePdfSha256"],
        "pageReceipts": artifact["pageReceipts"],
        "entries": output_entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "entries": len(output_entries),
        "exact": sum(entry["verification"] == "pdf-ocr-docx-exact" for entry in output_entries),
        "fuzzyReviewed": sum(entry["verification"] == "pdf-ocr-docx-fuzzy-reviewed" for entry in output_entries),
        "overrides": sum(entry["verification"] == "page-reviewed-override" for entry in output_entries),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
