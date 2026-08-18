#!/usr/bin/env python3

"""Draw four private Qwen candidates for each of the five unresolved V21 words."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
from typing import Any

import mlx.core as mx
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio


ROOT = Path(__file__).resolve().parents[2]
MODEL_DEFAULT = Path("/Users/huangxuewei/.cache/eqbank/models/qwen3-tts-base-6bit")
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-seed-draw-v22"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-seed-draw-v22"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
V21_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/manifest.json"
V21_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/owner-qa-summary-v21.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-seed-draw-v22"

UNRESOLVED_IDS = {
    "gaokao-frequency-2081-violin",
    "gaokao-frequency-1887-hello",
    "gaokao-frequency-2396-ballet",
    "gaokao-frequency-2823-dolphin",
    "gaokao-frequency-2952-domain",
}

CANDIDATE_CONFIGS = {
    "C22": {"seed": 22000, "temperature": 0.22, "topK": 20, "topP": 0.85, "referenceLabel": "A21", "punctuation": "."},
    "D22": {"seed": 32000, "temperature": 0.30, "topK": 30, "topP": 0.90, "referenceLabel": "B21", "punctuation": "."},
    "E22": {"seed": 42000, "temperature": 0.38, "topK": 40, "topP": 0.92, "referenceLabel": "A21", "punctuation": "!"},
    "F22": {"seed": 52000, "temperature": 0.48, "topK": 50, "topP": 0.95, "referenceLabel": "B21", "punctuation": "!"},
}


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V21 = load_module("eqb_google_voice_qwen_v21_seed_draw", "scripts/vocabulary/generate-google-voice-qwen-phonetic-anchor-v21.py")
V18 = V21.V18
V12 = V21.V12
REPAIR = V21.REPAIR


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=MODEL_DEFAULT)
    parser.add_argument("--replace", action="store_true")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_manifest(payload: dict[str, Any]) -> None:
    partial = MANIFEST_PATH.with_suffix(".json.partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(MANIFEST_PATH)


def main() -> None:
    args = parse_args()
    v21 = read_json(V21_MANIFEST_PATH)
    v21_qa = read_json(V21_QA_PATH)
    if (
        v21.get("schemaVersion") != V21.SCHEMA
        or len(v21.get("entries", [])) != 12
        or v21.get("failures")
        or v21.get("formalAssetsChanged") is not False
    ):
        raise ValueError("V22 requires the complete private V21 candidate set")

    qa_by_id = {entry["entryId"]: entry for entry in v21_qa["entries"]}
    if qa_by_id["gaokao-frequency-2956-equator"]["verdict"] != "a21_usable":
        raise ValueError("V22 must preserve the Owner-approved equator A21 candidate")
    if {entry_id for entry_id, entry in qa_by_id.items() if entry["verdict"] == "both_fail"} != UNRESOLVED_IDS:
        raise ValueError("V22 must draw only the exact five unresolved V21 words")

    v21_by_key = {
        (entry["entryId"], entry["candidateLabel"]): entry
        for entry in v21["entries"]
    }
    google_metrics = V21.build_google_metrics()
    model_receipt = V12.validate_model(args.model)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)

    expected: list[dict[str, Any]] = []
    ordered_ids = [
        "gaokao-frequency-2081-violin",
        "gaokao-frequency-1887-hello",
        "gaokao-frequency-2396-ballet",
        "gaokao-frequency-2823-dolphin",
        "gaokao-frequency-2952-domain",
    ]
    for case_index, entry_id in enumerate(ordered_ids):
        base = v21_by_key[(entry_id, "A21")]
        google = google_metrics[(entry_id, "american")]
        google_active = google["durationSeconds"] - google["leadingSilenceSeconds"] - google["trailingSilenceSeconds"]
        for label, config in CANDIDATE_CONFIGS.items():
            reference_entry = v21_by_key[(entry_id, config["referenceLabel"])]
            expected.append({
                **base,
                "candidateLabel": label,
                "seed": config["seed"] + case_index * 37,
                "temperature": config["temperature"],
                "topK": config["topK"],
                "topP": config["topP"],
                "generationStrategy": "bounded-canonical-seed-draw",
                "generationPrompt": f"{base['audioText'].strip().rstrip('.!?')}{config['punctuation']}",
                "referenceId": reference_entry["referenceId"],
                "referenceLabel": config["referenceLabel"],
                "googleReferenceActiveSeconds": round(google_active, 6),
                "v21OwnerNote": qa_by_id[entry_id]["note"],
            })

    if len(expected) != 20:
        raise ValueError("V22 must contain exactly twenty planned candidates")

    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    if MANIFEST_PATH.exists() and not args.replace:
        existing = read_json(MANIFEST_PATH)
        if existing.get("schemaVersion") != SCHEMA:
            raise ValueError(f"Cannot resume a different V22 schema: {MANIFEST_PATH}")
        expected_by_key = {(entry["entryId"], entry["candidateLabel"]): entry for entry in expected}
        for record in existing.get("entries", []):
            key = (record["entryId"], record["candidateLabel"])
            current = expected_by_key.get(key)
            if not current or record.get("seed") != current["seed"]:
                continue
            scratch_path = OUTPUT_ROOT / record["path"]
            public_path = ROOT / "app/public" / record["publicPath"].lstrip("/")
            if not scratch_path.exists() or not public_path.exists():
                raise FileNotFoundError(f"Checkpointed V22 candidate is missing: {key}")
            if V12.sha256_file(scratch_path) != record["sha256"] or V12.sha256_file(public_path) != record["sha256"]:
                raise ValueError(f"Checkpointed V22 candidate hash mismatch: {key}")
            entries.append({**current, **record})

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 5,
            "plannedCandidates": 20,
            "strategy": "preserve equator A21; draw four bounded samples for each of the five remaining canonical words using the existing same-voice tailored Google references",
            "v21OwnerQa": str(V21_QA_PATH.relative_to(ROOT)),
            "preservedV21Usable": [{"entryId": "gaokao-frequency-2956-equator", "accent": "american", "candidateLabel": "A21"}],
            "candidateConfigs": CANDIDATE_CONFIGS,
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
            "entries": entries,
            "failures": failures,
        }

    attempted = {(entry["entryId"], entry["candidateLabel"]) for entry in entries}
    if len(attempted) == len(expected):
        write_manifest(payload("private_local_candidates_pending_owner_qa"))
        print(json.dumps({"manifest": str(MANIFEST_PATH), "resumed": True, "candidates": len(entries), "failures": 0}, ensure_ascii=False))
        return

    references = v21["references"]
    needed_reference_ids = {entry["referenceId"] for entry in expected}
    loaded_references = {}
    print(f"Loading Qwen Base for {len(expected) - len(attempted)} remaining of 20 V22 draws", flush=True)
    model = load_model(model_path=str(args.model))
    for reference_id in needed_reference_ids:
        receipt = references[reference_id]
        loaded_references[reference_id] = load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)

    write_manifest(payload("generation_in_progress"))
    seed_offsets = (0, 1, 2, 100, 101, 102)
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-v22-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for case in expected:
            key = (case["entryId"], case["candidateLabel"])
            if key in attempted:
                continue
            reference = references[case["referenceId"]]
            last_error: Exception | None = None
            for generation_attempt, seed_offset in enumerate(seed_offsets):
                generation_seed = case["seed"] + seed_offset
                mx.random.seed(generation_seed)
                results = list(model.generate(
                    case["generationPrompt"],
                    ref_audio=loaded_references[case["referenceId"]],
                    ref_text=reference["referenceText"],
                    temperature=case["temperature"],
                    lang_code="English",
                    max_tokens=180,
                    top_k=case["topK"],
                    top_p=case["topP"],
                    repetition_penalty=1.4,
                    stream=False,
                    verbose=False,
                ))
                if len(results) != 1:
                    last_error = RuntimeError(f"Unexpected Qwen V22 result count: {len(results)}")
                    continue
                try:
                    protected, extraction = V18.protect_whole_utterance(results[0].audio, results[0].sample_rate)
                    active_ratio = extraction["directActiveSeconds"] / case["googleReferenceActiveSeconds"]
                    if not V21.MIN_ACTIVE_TO_GOOGLE_RATIO <= active_ratio <= V21.MAX_ACTIVE_TO_GOOGLE_RATIO:
                        raise ValueError(f"V22 bare-word active duration ratio out of range: {active_ratio:.3f}")
                    signal = V12.validate_candidate_signal(protected, results[0].sample_rate)
                    filename = f"{case['entryId']}--american--{case['candidateLabel'].lower()}.mp3"
                    wav_path = temporary_root / filename.replace(".mp3", ".wav")
                    scratch_path = OUTPUT_ROOT / filename
                    public_path = PUBLIC_ROOT / filename
                    audio_write(wav_path, protected, results[0].sample_rate, format="wav")
                    REPAIR.encode_mp3(wav_path, scratch_path)
                    public_path.write_bytes(scratch_path.read_bytes())
                    entries.append({
                        **case,
                        "generationAttempt": generation_attempt,
                        "generationSeed": generation_seed,
                        "activeToGoogleRatio": round(active_ratio, 6),
                        "voiceReference": reference["voice"],
                        "referenceSha256": reference["sha256"],
                        "referenceText": reference["referenceText"],
                        "path": filename,
                        "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-seed-draw-v22/{filename}",
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
            print(f"{len(attempted)}/20 {result_label}: {case['headword']} {case['candidateLabel']} (ok={len(entries)}, failed={len(failures)})", flush=True)
            mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
