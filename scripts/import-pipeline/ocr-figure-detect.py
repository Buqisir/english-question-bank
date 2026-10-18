#!/usr/bin/env python3
"""Local Ovis image proposals. Invoke through asr-slot.py, never alongside ASR.

ocr-figure-detect.py --pages pages.json --output fast/figure-candidates.json
pages.json is a list of {pageKey, imagePath}, or an OCR trace with pages.
--parse reads model output on stdin without loading MLX (for parser checks).
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import sys
import time

REVISION = "054cd8227b518710c83d4faa53d030a8fa695a6c"
MODEL = f"OvisOCR2@{REVISION}"
INSTRUCTION = '\nExtract all readable content from the image in natural human reading order and output the result as a single Markdown document. For charts or images, represent them using an HTML image tag: <img src="images/bbox_{left}_{top}_{right}_{bottom}.jpg" />, where left, top, right, bottom are bounding box coordinates scaled to [0, 1000). Format formulas as LaTeX. Format tables as HTML: <table>...</table>. Transcribe all other text as standard Markdown. Preserve the original text without translation or paraphrasing.'
PROMPT_SHA = hashlib.sha256(INSTRUCTION.encode()).hexdigest()


def parse_output(text):
    boxes = set()
    invalid = 0
    for tag in re.findall(r"<img\b[^>]*>", text, flags=re.I):
        match = re.search(r'\bsrc\s*=\s*["\']images/bbox_(\d+)_(\d+)_(\d+)_(\d+)\.jpg["\']', tag, flags=re.I)
        if not match:
            invalid += 1
            continue
        left, top, right, bottom = map(int, match.groups())
        if not (0 <= left < right < 1000 and 0 <= top < bottom < 1000):
            invalid += 1
            continue
        boxes.add((left, top, right, bottom))
    return {
        "hasTable": bool(re.search(r"<table\b", text, flags=re.I)),
        "candidates": [{"bbox": [v / 1000 for v in box], "category": "image"}
                       for box in sorted(boxes, key=lambda b: (b[1], b[0], b[3], b[2]))],
        "invalidBboxes": invalid,
    }


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_name(f"{file.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(file)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages")
    parser.add_argument("--output")
    parser.add_argument("--parse", action="store_true")
    args = parser.parse_args()
    if args.parse:
        print(json.dumps(parse_output(sys.stdin.read())))
        return
    if not args.pages or not args.output:
        parser.error("--pages and --output are required")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    source = json.loads(Path(args.pages).read_text())
    pages = source["pages"] if isinstance(source, dict) else source
    cache = Path(os.environ.get("EQB_OVIS_FIGURE_CACHE_DIR", Path.home() / ".cache/eqbank/ovis-figure-v1"))
    output = Path(args.output)
    report = {"model": MODEL, "promptSha256": PROMPT_SHA, "pages": []}
    runtime = None
    started = time.monotonic()
    for page in pages:
        page_started = time.monotonic()
        key = page.get("pageKey", page.get("key"))
        record = {"pageKey": key, "imageSha256": None, "status": "failed",
                  "hasTable": False, "candidates": []}
        try:
            image = Path(page["imagePath"])
            digest = hashlib.sha256(image.read_bytes()).hexdigest()
            record["imageSha256"] = digest
            cache_key = hashlib.sha256(f"{digest}:{REVISION}:{PROMPT_SHA}".encode()).hexdigest()
            cached = cache / f"{cache_key}.json"
            parsed = None
            if cached.exists():
                try:
                    entry = json.loads(cached.read_text())
                    if (entry["imageSha256"], entry["model"], entry["promptSha256"]) == (digest, MODEL, PROMPT_SHA):
                        parsed = entry["parsed"]
                        if parsed.get("invalidBboxes"):
                            parsed = None
                except (ValueError, KeyError, TypeError):
                    pass
            record["cacheHit"] = parsed is not None
            if parsed is None:
                for attempt in range(2):
                    try:
                        if runtime is None:
                            import mlx.core as mx
                            from mlx_vlm import load, generate
                            from mlx_vlm.prompt_utils import apply_chat_template
                            mx.set_memory_limit(4 * 1024**3)
                            mx.set_cache_limit(128 * 1024**2)
                            model, processor = load(os.environ.get("EQB_OVIS_FIGURE_MODEL", str(
                                Path.home() / ".local/share/eqbank-ocr/models/ovisocr2-054cd822")))
                            prompt = apply_chat_template(processor, model.config, INSTRUCTION,
                                                         num_images=1, enable_thinking=False)
                            runtime = (mx, generate, model, processor, prompt)
                        mx, generate, model, processor, prompt = runtime
                        result = generate(model, processor, prompt, image=[str(image)],
                                          max_tokens=8192, temperature=0.0, verbose=False)
                        mx.synchronize()
                        parsed = parse_output(result.text)
                        if parsed["invalidBboxes"]:
                            raise ValueError(f"Malformed image tags: {parsed['invalidBboxes']}")
                        # A truncated transcript can hide images later on the page.
                        if getattr(result, "generation_tokens", 0) >= 8192:
                            raise ValueError("Ovis output reached token limit")
                        write_json(cached, {"imageSha256": digest, "model": MODEL,
                                           "promptSha256": PROMPT_SHA, "parsed": parsed})
                        break
                    except Exception:
                        if attempt:
                            raise
            record.update(parsed)
            record["status"] = "ok"
            record["candidates"] = [
                {"candidateId": f"{key}-c{index}", **candidate}
                for index, candidate in enumerate(parsed["candidates"], 1)]
        except Exception as error:
            record["error"] = str(error)
        record["seconds"] = round(time.monotonic() - page_started, 3)
        report["pages"].append(record)
        report["seconds"] = round(time.monotonic() - started, 3)
        report["rssPeakBytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        if runtime:
            report["mlxPeakBytes"] = runtime[0].get_peak_memory()
        # Atomic progressive snapshots allow compile to report partial detection.
        write_json(output, report)
        print(json.dumps(record, ensure_ascii=False), flush=True)
    if not pages:
        write_json(output, report)


if __name__ == "__main__":
    main()
