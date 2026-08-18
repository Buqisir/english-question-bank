#!/usr/bin/env python3

"""Generate six private Qwen repairs from per-word, same-voice Google phonetic anchors."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
from typing import Any

import mlx.core as mx
import numpy as np
from mlx_audio.audio_io import read as audio_read
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio


ROOT = Path(__file__).resolve().parents[2]
MODEL_DEFAULT = Path("/Users/huangxuewei/.cache/eqbank/models/qwen3-tts-base-6bit")
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-phonetic-anchor-v21"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-phonetic-anchor-v21"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
V17_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-ipa-aligned-v17/manifest.json"
V18_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-bare-word-v18/owner-qa-summary-v18.json"
V20_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-exact-crop-v20/owner-qa-summary-v20.json"
GOOGLE_MANIFEST_PATH = ROOT / "data/vocabulary/gaokao-frequency-full-american-audio-manifest-v1.json"
REPAIR_PLAN_PATH = ROOT / "data/vocabulary/gaokao-frequency-full-audio-repair-plan-v1.json"
GOOGLE_AUDIO_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-us-c-v1"
SCHEMA = "gaokao-frequency-google-voice-qwen-phonetic-anchor-v21"
VOICE = "en-US-Neural2-C"
MIN_ACTIVE_TO_GOOGLE_RATIO = 0.45
MAX_ACTIVE_TO_GOOGLE_RATIO = 1.80

CASE_ANCHORS = {
    ("gaokao-frequency-2081-violin", "american"): (
        "science", "begin", "win", "science", "begin", "win", "science", "begin", "win", "begin",
    ),
    ("gaokao-frequency-1887-hello", "american"): (
        "below", "ago", "low", "show", "below", "ago", "low", "show", "below", "ago",
    ),
    ("gaokao-frequency-2396-ballet", "american"): (
        "delay", "away", "today", "delay", "away", "today", "delay", "away", "today", "delay",
    ),
    ("gaokao-frequency-2823-dolphin", "american"): (
        "dollar", "finish", "finger", "dollar", "finish", "finger", "dollar", "finish", "dollar", "finish",
    ),
    ("gaokao-frequency-2952-domain", "american"): (
        "explain", "train", "main", "rain", "explain", "train", "main", "rain", "explain", "train",
    ),
    ("gaokao-frequency-2956-equator", "american"): (
        "effect", "question", "later", "equal", "effect", "question", "later", "equal", "effect", "later",
    ),
}

CANDIDATE_CONFIGS = {
    "A21": {"seed": 21000, "temperature": 0.28, "referenceOrder": "forward"},
    "B21": {"seed": 31000, "temperature": 0.34, "referenceOrder": "reverse"},
}


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V18 = load_module("eqb_google_voice_qwen_v18_anchor", "scripts/vocabulary/generate-google-voice-qwen-bare-word-v18.py")
V12 = V18.V12
REPAIR = V18.REPAIR


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=MODEL_DEFAULT)
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--retry-failures", action="store_true")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_manifest(payload: dict[str, Any]) -> None:
    partial = MANIFEST_PATH.with_suffix(".json.partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(MANIFEST_PATH)


def build_cases() -> tuple[dict[str, Any], ...]:
    v17_manifest = read_json(V17_MANIFEST_PATH)
    v18_qa = read_json(V18_QA_PATH)
    v20_qa = read_json(V20_QA_PATH)
    prior_by_key = {
        (entry["entryId"], entry["accent"]): entry
        for entry in v17_manifest["entries"]
        if entry["candidateLabel"] == "C17"
    }
    qa_by_key = {
        (entry["entryId"], entry["accent"]): entry
        for entry in v18_qa["entries"]
    }
    v20_by_key = {
        (entry["entryId"], entry["accent"]): entry
        for entry in v20_qa["entries"]
    }
    if v20_by_key[("gaokao-frequency-2739-ad-a-d", "british")]["verdict"] != "ready":
        raise ValueError("V21 requires the V20 AD case to be resolved")
    if v20_by_key[("gaokao-frequency-2956-equator", "american")]["verdict"] != "missing":
        raise ValueError("V21 requires the V20 equator full-source rejection")
    cases = []
    for case_index, key in enumerate(CASE_ANCHORS):
        prior = prior_by_key.get(key)
        qa_entry = qa_by_key.get(key)
        if not prior or not qa_entry or qa_entry["verdict"] in {"d18_usable", "r18_usable"}:
            raise ValueError(f"V21 key is not an unresolved V18 case: {key}")
        cases.append({
            **prior,
            "caseIndex": case_index,
            "v18OwnerVerdict": qa_entry["verdict"],
            "v18OwnerNote": qa_entry["note"],
        })
    if len(cases) != 6 or {(case["entryId"], case["accent"]) for case in cases} != set(CASE_ANCHORS):
        raise ValueError("V21 must cover the exact six unresolved American cases")
    return tuple(cases)


def build_google_metrics() -> dict[tuple[str, str], dict[str, Any]]:
    manifest = read_json(ROOT / ".scratch/gaokao-audio-repair-v2/american-manifest.json")
    return {(entry["entryId"], "american"): entry for entry in manifest["entries"]}


def build_references(cases: tuple[dict[str, Any], ...]) -> dict[str, dict[str, Any]]:
    google_manifest = read_json(GOOGLE_MANIFEST_PATH)
    if google_manifest.get("voice") != VOICE or len(google_manifest.get("entries", [])) != 3000:
        raise ValueError("Unexpected American Google full-audio manifest")
    google_by_word = {entry["headword"]: entry for entry in google_manifest["entries"]}
    rejected_ids = {entry["entryId"] for entry in read_json(REPAIR_PLAN_PATH)["entries"]}
    reference_root = OUTPUT_ROOT / "references"
    reference_root.mkdir(parents=True, exist_ok=True)
    receipts: dict[str, dict[str, Any]] = {}
    for case in cases:
        key = (case["entryId"], case["accent"])
        base_words = CASE_ANCHORS[key]
        for label, config in CANDIDATE_CONFIGS.items():
            words = base_words if config["referenceOrder"] == "forward" else tuple(reversed(base_words))
            chunks = []
            selected = []
            for word in words:
                anchor = google_by_word.get(word)
                if not anchor or anchor["entryId"] in rejected_ids:
                    raise ValueError(f"V21 anchor is missing or belongs to the 117 rejected Google words: {word}")
                source_path = GOOGLE_AUDIO_ROOT / anchor["path"]
                if V12.sha256_file(source_path) != anchor["sha256"]:
                    raise ValueError(f"V21 anchor hash mismatch: {source_path}")
                samples, sample_rate = audio_read(source_path, dtype="float32", sample_rate=24000, nchannels=1)
                if sample_rate != 24000:
                    raise ValueError(f"V21 anchor sample-rate mismatch: {source_path}")
                chunks.append(np.asarray(samples, dtype=np.float32).reshape(-1))
                selected.append({
                    "entryId": anchor["entryId"],
                    "headword": word,
                    "path": str(source_path.relative_to(ROOT)),
                    "sha256": anchor["sha256"],
                    "durationSeconds": anchor["durationSeconds"],
                })
            joined = np.concatenate(chunks)
            reference_id = f"{case['entryId']}--{label.lower()}"
            output_path = reference_root / f"{reference_id}.wav"
            audio_write(output_path, joined, 24000, format="wav")
            duration_seconds = joined.size / 24000
            if not 7.5 <= duration_seconds <= 12:
                raise ValueError(f"Unexpected V21 tailored reference duration: {reference_id} {duration_seconds}")
            receipts[reference_id] = {
                "voice": VOICE,
                "order": config["referenceOrder"],
                "path": str(output_path.relative_to(ROOT)),
                "sha256": V12.sha256_file(output_path),
                "sampleRate": 24000,
                "channels": 1,
                "durationSeconds": round(duration_seconds, 6),
                "referenceText": ". ".join(words) + ".",
                "entries": selected,
            }
    if len(receipts) != 12:
        raise ValueError("Expected twelve per-candidate V21 tailored references")
    return receipts


def main() -> None:
    args = parse_args()
    cases = build_cases()
    google_metrics = build_google_metrics()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    model_receipt = V12.validate_model(args.model)
    references = build_references(cases)
    expected: dict[tuple[str, str, str], dict[str, Any]] = {}
    for case in cases:
        google = google_metrics[(case["entryId"], case["accent"])]
        google_active = google["durationSeconds"] - google["leadingSilenceSeconds"] - google["trailingSilenceSeconds"]
        for label, config in CANDIDATE_CONFIGS.items():
            reference_id = f"{case['entryId']}--{label.lower()}"
            expected[(case["entryId"], case["accent"], label)] = {
                **case,
                "candidateLabel": label,
                "seed": config["seed"] + case["caseIndex"] * 17,
                "temperature": config["temperature"],
                "generationStrategy": "same-voice-target-phonetic-anchor-bare-word",
                "generationPrompt": f"{case['audioText'].strip().rstrip('.!?')}.",
                "referenceId": reference_id,
                "googleReferenceActiveSeconds": round(google_active, 6),
            }

    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    if MANIFEST_PATH.exists() and not args.replace:
        existing = read_json(MANIFEST_PATH)
        if existing.get("schemaVersion") != SCHEMA:
            raise ValueError(f"Cannot resume a different V21 schema: {MANIFEST_PATH}")
        for collection_name, destination in (("entries", entries), ("failures", failures)):
            for record in existing.get(collection_name, []):
                key = (record["entryId"], record["accent"], record["candidateLabel"])
                expected_record = expected.get(key)
                if not expected_record or record.get("seed") != expected_record["seed"] or record.get("referenceId") != expected_record["referenceId"]:
                    continue
                destination.append({**expected_record, **record})
        if args.retry_failures:
            failures = []
        for entry in entries:
            scratch_path = OUTPUT_ROOT / entry["path"]
            public_path = ROOT / "app/public" / entry["publicPath"].lstrip("/")
            if not scratch_path.exists() or not public_path.exists():
                raise FileNotFoundError(f"Checkpointed V21 candidate is missing: {entry['entryId']} {entry['candidateLabel']}")
            if V12.sha256_file(scratch_path) != entry["sha256"] or V12.sha256_file(public_path) != entry["sha256"]:
                raise ValueError(f"Checkpointed V21 candidate hash mismatch: {entry['entryId']} {entry['candidateLabel']}")

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 6,
            "plannedCandidates": 12,
            "strategy": "for each unresolved word, build an 8-second same-voice Google reference only from unflagged phonetic and stress anchors; generate the canonical word alone; A21/B21 vary anchor order, seed, and temperature",
            "v18OwnerQa": str(V18_QA_PATH.relative_to(ROOT)),
            "v20OwnerQa": str(V20_QA_PATH.relative_to(ROOT)),
            "candidateConfigs": CANDIDATE_CONFIGS,
            "durationGate": {
                "minimumActiveToGoogleRatio": MIN_ACTIVE_TO_GOOGLE_RATIO,
                "maximumActiveToGoogleRatio": MAX_ACTIVE_TO_GOOGLE_RATIO,
            },
            "edgeProtection": {
                "activeSafetySeconds": REPAIR.TARGET_ACTIVE_SAFETY_SECONDS,
                "leadingZeroSeconds": REPAIR.LEADING_ZERO_SECONDS,
                "trailingZeroSeconds": REPAIR.TRAILING_ZERO_SECONDS,
            },
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
            "references": references,
            "entries": entries,
            "failures": failures,
        }

    attempted = {
        (entry["entryId"], entry["accent"], entry["candidateLabel"]) for entry in entries
    } | {
        (entry["entryId"], entry["accent"], entry["candidateLabel"]) for entry in failures
    }
    if len(attempted) == len(expected):
        status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
        write_manifest(payload(status))
        print(json.dumps({"manifest": str(MANIFEST_PATH), "resumed": True, "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))
        return

    write_manifest(payload("generation_in_progress"))
    print(f"Loading Qwen Base for {len(expected) - len(attempted)} remaining of 12 V21 candidates", flush=True)
    model = load_model(model_path=str(args.model))
    loaded_references = {
        reference_id: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for reference_id, receipt in references.items()
    }
    seed_offsets = (0, 1, 2, 100, 101, 102)
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-v21-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for key, case in expected.items():
            if key in attempted:
                continue
            label = case["candidateLabel"]
            reference = references[case["referenceId"]]
            last_error: Exception | None = None
            for generation_attempt, seed_offset in enumerate(seed_offsets):
                mx.random.seed(case["seed"] + seed_offset)
                results = list(model.generate(
                    case["generationPrompt"],
                    ref_audio=loaded_references[case["referenceId"]],
                    ref_text=reference["referenceText"],
                    temperature=case["temperature"],
                    lang_code="English",
                    max_tokens=180,
                    top_k=30,
                    top_p=0.9,
                    repetition_penalty=1.4,
                    stream=False,
                    verbose=False,
                ))
                if len(results) != 1:
                    last_error = RuntimeError(f"Unexpected Qwen V21 result count: {len(results)}")
                    continue
                try:
                    protected, extraction = V18.protect_whole_utterance(results[0].audio, results[0].sample_rate)
                    active_ratio = extraction["directActiveSeconds"] / case["googleReferenceActiveSeconds"]
                    if not MIN_ACTIVE_TO_GOOGLE_RATIO <= active_ratio <= MAX_ACTIVE_TO_GOOGLE_RATIO:
                        raise ValueError(f"V21 bare-word active duration ratio out of range: {active_ratio:.3f}")
                    signal = V12.validate_candidate_signal(protected, results[0].sample_rate)
                    filename = f"{case['entryId']}--american--{label.lower()}.mp3"
                    wav_path = temporary_root / filename.replace(".mp3", ".wav")
                    scratch_path = OUTPUT_ROOT / filename
                    public_path = PUBLIC_ROOT / filename
                    audio_write(wav_path, protected, results[0].sample_rate, format="wav")
                    REPAIR.encode_mp3(wav_path, scratch_path)
                    public_path.write_bytes(scratch_path.read_bytes())
                    entries.append({
                        **case,
                        "generationAttempt": generation_attempt,
                        "generationSeed": case["seed"] + seed_offset,
                        "activeToGoogleRatio": round(active_ratio, 6),
                        "voiceReference": reference["voice"],
                        "referenceSha256": reference["sha256"],
                        "referenceText": reference["referenceText"],
                        "anchorWords": [entry["headword"] for entry in reference["entries"]],
                        "path": filename,
                        "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-phonetic-anchor-v21/{filename}",
                        "bytes": scratch_path.stat().st_size,
                        "sha256": V12.sha256_file(scratch_path),
                        **extraction,
                        **signal,
                        **REPAIR.audio_metrics(scratch_path),
                        **V12.QWEN_AUDIO.probe_audio(scratch_path),
                    })
                    last_error = None
                    break
                except ValueError as error:
                    last_error = error
            if last_error is not None:
                failures.append({**case, "error": str(last_error)})
                result_label = "failed"
            else:
                result_label = "generated"
            attempted.add(key)
            write_manifest(payload("generation_in_progress"))
            print(f"{len(attempted)}/12 {result_label}: {case['headword']} american {label} (ok={len(entries)}, failed={len(failures)})", flush=True)
            mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
