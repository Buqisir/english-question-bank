#!/usr/bin/env python3

"""Generate private bare-word Qwen repairs for the 11 unresolved V17 accent cases."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
from typing import Any

import mlx.core as mx
import numpy as np
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio


ROOT = Path(__file__).resolve().parents[2]
MODEL_DEFAULT = Path("/Users/huangxuewei/.cache/eqbank/models/qwen3-tts-base-6bit")
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-bare-word-v18"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-bare-word-v18"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
V17_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-ipa-aligned-v17/manifest.json"
V17_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-ipa-aligned-v17/owner-qa-summary-v17.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-bare-word-v18"
CANDIDATE_CONFIGS = {
    "D18": {"seed": 18000, "temperature": 0.30, "targetField": "canonicalText", "strategy": "bare-canonical-word"},
    "R18": {"seed": 28000, "temperature": 0.35, "targetField": "bareRepairText", "strategy": "bare-ipa-respelling"},
}
RESPELLING_OVERRIDES = {
    ("gaokao-frequency-2081-violin", "american"): "vie-uh-LIN",
    ("gaokao-frequency-2823-dolphin", "american"): "DAHL-fin",
}
REPAIR_TEXT_OVERRIDES = {
    ("gaokao-frequency-2081-violin", "american"): "violin",
    ("gaokao-frequency-1887-hello", "american"): "hello",
    ("gaokao-frequency-1887-hello", "british"): "hello",
    ("gaokao-frequency-2684-era", "american"): "eera",
    ("gaokao-frequency-2956-equator", "american"): "equator",
}
MIN_ACTIVE_TO_GOOGLE_RATIO = 0.45
MAX_ACTIVE_TO_GOOGLE_RATIO = 1.80
USABLE_V17_VERDICTS = {"c17_usable", "p17_usable"}


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V17 = load_module("eqb_google_voice_qwen_v17", "scripts/vocabulary/generate-google-voice-qwen-ipa-aligned-v17.py")
V12 = V17.V12
REPAIR = V17.REPAIR


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


def build_google_reference_metrics() -> dict[tuple[str, str], dict[str, Any]]:
    references: dict[tuple[str, str], dict[str, Any]] = {}
    for accent in ("american", "british"):
        manifest = read_json(ROOT / f".scratch/gaokao-audio-repair-v2/{accent}-manifest.json")
        for entry in manifest["entries"]:
            references[(entry["entryId"], accent)] = entry
    return references


def build_cases() -> tuple[dict[str, Any], ...]:
    v17_manifest = read_json(V17_MANIFEST_PATH)
    v17_qa = read_json(V17_QA_PATH)
    prior_by_key: dict[tuple[str, str], dict[str, dict[str, Any]]] = {}
    for entry in v17_manifest["entries"]:
        key = (entry["entryId"], entry["accent"])
        prior_by_key.setdefault(key, {})[entry["candidateLabel"]] = entry
    qa_by_key = {
        (entry["entryId"], entry["accent"]): entry
        for entry in v17_qa["entries"]
    }
    repair_keys = {
        key for key, entry in qa_by_key.items()
        if entry["verdict"] not in USABLE_V17_VERDICTS
    }
    preserved_keys = set(qa_by_key) - repair_keys
    if len(repair_keys) != 11 or len(preserved_keys) != 3:
        raise ValueError("Expected exactly 11 V18 repairs and 3 preserved V17 usable cases")
    cases: list[dict[str, Any]] = []
    ordered_entries = sorted(
        (entries["C17"] for key, entries in prior_by_key.items() if key in repair_keys),
        key=lambda entry: entry["caseIndex"],
    )
    for case_index, prior in enumerate(ordered_entries):
        key = (prior["entryId"], prior["accent"])
        pair = prior_by_key[key]
        if set(pair) != {"C17", "P17"}:
            raise ValueError(f"Missing V17 C17/P17 pair: {key}")
        qa_entry = qa_by_key[key]
        bare_respelling = RESPELLING_OVERRIDES.get(key, prior["stressSpelling"])
        cases.append({
            **prior,
            "caseIndex": case_index,
            "v17OwnerVerdict": qa_entry["verdict"],
            "v17OwnerNote": qa_entry["note"],
            "priorC17PublicPath": pair["C17"]["publicPath"],
            "priorP17PublicPath": pair["P17"]["publicPath"],
            "bareRespelling": bare_respelling,
            "bareRepairText": REPAIR_TEXT_OVERRIDES.get(key, bare_respelling),
        })
    keys = {(case["entryId"], case["accent"]) for case in cases}
    if len(cases) != 11 or len(keys) != 11 or keys != repair_keys:
        raise ValueError("V18 cases must match the exact unresolved V17 repair queue")
    return tuple(cases)


def protect_whole_utterance(audio: Any, sample_rate: int) -> tuple[np.ndarray, dict[str, Any]]:
    samples = np.asarray(audio, dtype=np.float32).reshape(-1)
    window = max(1, round(sample_rate * REPAIR.TARGET_EDGE_FRAME_SECONDS))
    padding = (-samples.size) % window
    frames = np.pad(samples, (0, padding)).reshape(-1, window)
    frame_rms = np.sqrt(np.mean(frames ** 2, axis=1))
    active = np.flatnonzero(frame_rms >= REPAIR.TARGET_EDGE_THRESHOLD)
    if active.size == 0:
        raise ValueError("bare-word utterance is silent")
    active_start = active[0] * window
    active_end = min(samples.size, (active[-1] + 1) * window)
    active_seconds = (active_end - active_start) / sample_rate
    safety = round(REPAIR.TARGET_ACTIVE_SAFETY_SECONDS * sample_rate)
    safe_start = max(0, active_start - safety)
    safe_end = min(samples.size, active_end + safety)
    trimmed = samples[safe_start:safe_end]
    protected = np.pad(
        trimmed,
        (
            round(REPAIR.LEADING_ZERO_SECONDS * sample_rate),
            round(REPAIR.TRAILING_ZERO_SECONDS * sample_rate),
        ),
    )
    return protected, {
        "extractionStrategy": "whole-utterance-active-trim",
        "rawUtteranceDurationSeconds": round(samples.size / sample_rate, 6),
        "rawActiveStartSeconds": round(active_start / sample_rate, 6),
        "rawActiveEndSeconds": round(active_end / sample_rate, 6),
        "directActiveSeconds": round(active_seconds, 6),
        "activeSafetySeconds": REPAIR.TARGET_ACTIVE_SAFETY_SECONDS,
    }


def main() -> None:
    args = parse_args()
    cases = build_cases()
    google_metrics = build_google_reference_metrics()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    model_receipt = V12.validate_model(args.model)
    references = V12.build_references(OUTPUT_ROOT)
    expected: dict[tuple[str, str, str], dict[str, Any]] = {}
    for case in cases:
        google = google_metrics[(case["entryId"], case["accent"])]
        google_active_seconds = (
            google["durationSeconds"]
            - google["leadingSilenceSeconds"]
            - google["trailingSilenceSeconds"]
        )
        for label, config in CANDIDATE_CONFIGS.items():
            target = case[config["targetField"]].strip().rstrip(".!?")
            expected[(case["entryId"], case["accent"], label)] = {
                **case,
                "candidateLabel": label,
                "seed": config["seed"] + case["caseIndex"] * 17,
                "temperature": config["temperature"],
                "targetField": config["targetField"],
                "generationStrategy": config["strategy"],
                "generatedTargetText": target,
                "generationPrompt": f"{target}.",
                "googleReferenceActiveSeconds": round(google_active_seconds, 6),
            }

    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    if MANIFEST_PATH.exists() and not args.replace:
        existing = read_json(MANIFEST_PATH)
        if existing.get("schemaVersion") != SCHEMA:
            raise ValueError(f"Cannot resume a different V18 schema: {MANIFEST_PATH}")
        for collection_name, destination in (("entries", entries), ("failures", failures)):
            for record in existing.get(collection_name, []):
                key = (record["entryId"], record["accent"], record["candidateLabel"])
                expected_record = expected.get(key)
                if not expected_record or record.get("seed") != expected_record["seed"] or record.get("generationStrategy") != expected_record["generationStrategy"]:
                    continue
                destination.append({**expected_record, **record})
        if args.retry_failures:
            failures = []
        for entry in entries:
            scratch_path = OUTPUT_ROOT / entry["path"]
            public_path = ROOT / "app/public" / entry["publicPath"].lstrip("/")
            if not scratch_path.exists() or not public_path.exists():
                raise FileNotFoundError(f"Checkpointed V18 candidate is missing: {entry['entryId']} {entry['accent']} {entry['candidateLabel']}")
            if V12.sha256_file(scratch_path) != entry["sha256"] or V12.sha256_file(public_path) != entry["sha256"]:
                raise ValueError(f"Checkpointed V18 candidate hash mismatch: {entry['entryId']} {entry['accent']} {entry['candidateLabel']}")

    v17_qa = read_json(V17_QA_PATH)
    preserved = [
        entry for entry in v17_qa["entries"]
        if entry["verdict"] in USABLE_V17_VERDICTS
    ]

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 11,
            "plannedCandidates": 22,
            "strategy": "generate only the bare canonical word or IPA-aligned respelling; protect the whole utterance active edges without cue-sentence isolation",
            "v17OwnerQa": str(V17_QA_PATH.relative_to(ROOT)),
            "preservedV17Usable": preserved,
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
    print(f"Loading Qwen Base for {len(expected) - len(attempted)} remaining of 22 V18 candidates", flush=True)
    model = load_model(model_path=str(args.model))
    loaded_references = {
        accent: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for accent, receipt in references.items()
    }
    seed_offsets = (0, 1, 2, 100, 101, 102, 200, 201)
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-v18-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for key, case in expected.items():
            if key in attempted:
                continue
            label = case["candidateLabel"]
            accent = case["accent"]
            last_error: Exception | None = None
            for generation_attempt, seed_offset in enumerate(seed_offsets):
                mx.random.seed(case["seed"] + seed_offset)
                results = list(model.generate(
                    case["generationPrompt"],
                    ref_audio=loaded_references[accent],
                    ref_text=references[accent]["referenceText"],
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
                    last_error = RuntimeError(f"Unexpected Qwen V18 result count: {len(results)}")
                    continue
                try:
                    protected, extraction_receipt = protect_whole_utterance(results[0].audio, results[0].sample_rate)
                    active_ratio = (
                        extraction_receipt["directActiveSeconds"]
                        / case["googleReferenceActiveSeconds"]
                    )
                    if not MIN_ACTIVE_TO_GOOGLE_RATIO <= active_ratio <= MAX_ACTIVE_TO_GOOGLE_RATIO:
                        raise ValueError(f"bare-word active duration ratio out of range: {active_ratio:.3f}")
                    signal_receipt = V12.validate_candidate_signal(protected, results[0].sample_rate)
                    filename = f"{case['entryId']}--{accent}--{label.lower()}.mp3"
                    wav_path = temporary_root / filename.replace(".mp3", ".wav")
                    scratch_path = OUTPUT_ROOT / filename
                    public_path = PUBLIC_ROOT / filename
                    audio_write(wav_path, protected, results[0].sample_rate, format="wav")
                    REPAIR.encode_mp3(wav_path, scratch_path)
                    public_path.write_bytes(scratch_path.read_bytes())
                    edge_metrics = REPAIR.audio_metrics(scratch_path)
                    probe_metrics = V12.QWEN_AUDIO.probe_audio(scratch_path)
                    entries.append({
                        **case,
                        "generationAttempt": generation_attempt,
                        "activeToGoogleRatio": round(active_ratio, 6),
                        "voiceReference": references[accent]["voice"],
                        "referenceSha256": references[accent]["sha256"],
                        "path": filename,
                        "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-bare-word-v18/{filename}",
                        "bytes": scratch_path.stat().st_size,
                        "sha256": V12.sha256_file(scratch_path),
                        **extraction_receipt,
                        **signal_receipt,
                        **edge_metrics,
                        **probe_metrics,
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
            print(
                f"{len(attempted)}/22 {result_label}: {case['headword']} {accent} {label} "
                f"(ok={len(entries)}, failed={len(failures)})",
                flush=True,
            )
            mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
