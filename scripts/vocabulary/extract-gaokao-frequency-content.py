#!/usr/bin/env python3
"""Build source-bound content rows for the high-school vocabulary program."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


POS_PATTERN = re.compile(
    r"\b(abbr|adj|adv|art|conj|int|n|num|prep|pron|v)\s*(?:\.|(?=\s*[\u4e00-\u9fff(…]))\s*",
    re.IGNORECASE,
)


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_source_text(headword: str, source_text: str) -> dict:
    text = compact(source_text)
    pos_match = POS_PATTERN.search(text)
    if not pos_match:
        raise ValueError(f"No part of speech marker in {headword!r}: {text!r}")
    phonetic_parts = [compact(value) for value in re.findall(r"/([^/]+?)/", text)]
    if not phonetic_parts:
        raise ValueError(f"No phonetic transcription in {headword!r}: {text!r}")
    remainder = text[pos_match.start():]
    part_of_speech = []
    for match in POS_PATTERN.finditer(remainder):
        value = match.group(1).lower() + "."
        if value not in part_of_speech:
            part_of_speech.append(value)
    meanings_text = re.sub(r"/[^/]+/", "；", remainder)
    meanings_text = POS_PATTERN.sub("；", meanings_text)
    meanings_text = re.sub(r"\s*&\s*", "；", meanings_text)
    meanings_text = re.sub(r"[;；]+", "；", meanings_text).strip(" ；,，")
    meanings = [compact(value).strip(" ,，。") for value in meanings_text.split("；")]
    meanings = [value for value in meanings if value and re.search(r"[\u4e00-\u9fff]", value)]
    if not meanings:
        raise ValueError(f"No Chinese meaning in {headword!r}: {text!r}")
    return {
        "sourcePhonetic": " / ".join(f"/{value}/" for value in phonetic_parts),
        "partOfSpeech": " ".join(part_of_speech),
        "sourceMeanings": meanings,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-map", required=True, type=Path)
    parser.add_argument("--overrides", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    source_map = json.loads(args.source_map.read_text(encoding="utf-8"))
    override_entries = json.loads(args.overrides.read_text(encoding="utf-8"))["entries"]
    override_by_order = {entry["sourceOrder"]: entry for entry in override_entries}
    if len(override_by_order) != len(override_entries):
        raise SystemExit("Duplicate sourceOrder in content overrides")

    entries = []
    errors = []
    for source in source_map["entries"]:
        override = override_by_order.get(source["sourceOrder"])
        source_text = override["sourceText"] if override else source.get("docxEvidence", {}).get("sourceText", "")
        try:
            parsed = parse_source_text(source["headword"], source_text)
        except ValueError as error:
            errors.append({"sourceOrder": source["sourceOrder"], "headword": source["headword"], "error": str(error)})
            continue
        entries.append({
            "entryId": source["id"],
            "sourceOrder": source["sourceOrder"],
            "headword": source["headword"],
            "frequencyRank": source["frequencyRank"],
            "frequencyStage": source["stage"],
            "day": source["day"],
            "week": source["week"],
            "sourceGroup": source["sourceGroup"],
            "curriculumTag": source["curriculumTag"],
            "printedPage": source["printedPage"],
            "pdfPage": source["pdfPage"],
            "pageImageSha256": source["pageImageSha256"],
            "sourceText": source_text,
            **parsed,
            "evidence": {
                "identity": source["verification"],
                "headwordChecked": True,
                "frequencyChecked": True,
                "curriculumTagChecked": True,
                "contentTranscription": "pdf-reviewed-override" if override else "docx-companion-reading",
                "reviewNote": override["reviewNote"] if override else source["reviewNote"],
            },
        })

    if errors or len(entries) != 3_000:
        raise SystemExit(json.dumps({"message": "Source content extraction failed", "errors": errors}, ensure_ascii=False, indent=2))
    if {entry["sourceOrder"] for entry in entries} != set(range(1, 3_001)):
        raise SystemExit("Source orders are not exactly 1..3000")
    result = {
        "schemaVersion": "gaokao-frequency-source-content-v1",
        "programId": source_map["programId"],
        "sourcePdfSha256": source_map["sourcePdfSha256"],
        "entries": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    args.output.write_text(body, encoding="utf-8")
    print(json.dumps({
        "entries": len(entries),
        "sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        "overrideCount": len(override_entries),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
