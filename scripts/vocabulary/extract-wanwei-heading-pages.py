#!/usr/bin/env python3
"""Resolve Wanwei printed pages from strong numbered-heading OCR evidence."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--official", required=True, type=Path)
    parser.add_argument("--ocr-text-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    token_index: dict[str, list[tuple[int, bool, bool]]] = defaultdict(list)
    for path in sorted(args.ocr_text_dir.glob("page-*.txt")):
        match = re.search(r"page-(\d+)", path.stem)
        if not match:
            continue
        pdf_page = int(match.group(1))
        if not 18 <= pdf_page <= 250:
            continue
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            lowered = line.lower()
            tokens = set(re.findall(r"[a-z]+(?:-[a-z]+)?", lowered))
            numbered_heading = bool(re.match(r"^\s*\d{1,3}[.,，、]\s*", line))
            has_pronunciation = "/" in line
            for token in tokens:
                token_index[token].append((pdf_page - 17, numbered_heading, has_pronunciation))

    official = json.loads(args.official.read_text(encoding="utf-8"))["entries"]
    resolved = []
    ambiguous = []
    for entry in official:
        label = re.sub(r"\s*\(.*", "", entry["label"])
        keys = [re.sub(r"[^A-Za-z-]", "", form).lower() for form in label.split("/")]
        pages = Counter()
        for key in filter(None, keys):
            for printed_page, numbered_heading, has_pronunciation in token_index.get(key, []):
                if numbered_heading and has_pronunciation:
                    pages[printed_page] += 1
        if len(pages) == 1:
            printed_page = next(iter(pages))
            resolved.append({
                "oracleOrder": entry["oracleOrder"],
                "label": entry["label"],
                "printedPage": printed_page,
                "evidence": "numbered-heading-with-pronunciation",
            })
        elif pages:
            ambiguous.append({
                "oracleOrder": entry["oracleOrder"],
                "label": entry["label"],
                "candidatePages": dict(sorted(pages.items())),
            })

    artifact = {
        "schemaVersion": "wanwei-heading-page-evidence-v1",
        "resolvedCount": len(resolved),
        "ambiguousCount": len(ambiguous),
        "resolved": resolved,
        "ambiguous": ambiguous,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"resolved": len(resolved), "ambiguous": len(ambiguous)}))


if __name__ == "__main__":
    main()
