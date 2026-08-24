#!/usr/bin/env python3

"""Generate private Qwen words from same-voice, target-matched phonetic teachers."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
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
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-matched-teacher-v23"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-matched-teacher-v23"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
TEACHER_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-phonetic-teacher-v23/manifest.json"
V22_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-seed-draw-v22/manifest.json"
V22_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-seed-draw-v22/owner-qa-summary-v22.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-matched-teacher-v23"

CANDIDATE_CONFIGS = {
    "A23": {"seed": 23000, "temperature": 0.26, "topK": 24, "topP": 0.88},
    "B23": {"seed": 33000, "temperature": 0.32, "topK": 32, "topP": 0.91},
}


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V21 = load_module("eqb_google_voice_qwen_v21_matched_teacher", "scripts/vocabulary/generate-google-voice-qwen-phonetic-anchor-v21.py")
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


def build_repeated_references(teachers: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    reference_root = OUTPUT_ROOT / "references"
    reference_root.mkdir(parents=True, exist_ok=True)
    receipts: dict[tuple[str, str], dict[str, Any]] = {}
    for teacher in teachers:
        source_path = ROOT / ".scratch/gaokao-google-phonetic-teacher-v23" / teacher["path"]
        if V12.sha256_file(source_path) != teacher["sha256"]:
            raise ValueError(f"V23 teacher hash mismatch: {source_path}")
        samples, sample_rate = audio_read(source_path, dtype="float32", sample_rate=24000, nchannels=1)
        if sample_rate != 24000:
            raise ValueError(f"V23 teacher sample-rate mismatch: {source_path}")
        chunk = np.asarray(samples, dtype=np.float32).reshape(-1)
        gap = np.zeros(round(0.10 * sample_rate), dtype=np.float32)
        repeat_count = max(5, math.ceil(8.0 / ((chunk.size + gap.size) / sample_rate)))
        joined = np.concatenate([part for _ in range(repeat_count) for part in (chunk, gap)])
        reference_text = ". ".join([teacher["headword"]] * repeat_count) + "."
        output_path = reference_root / f"{teacher['entryId']}--{teacher['candidateLabel'].lower()}.wav"
        audio_write(output_path, joined, sample_rate, format="wav")
        receipts[(teacher["entryId"], teacher["candidateLabel"])] = {
            "path": str(output_path.relative_to(ROOT)),
            "sha256": V12.sha256_file(output_path),
            "sampleRate": sample_rate,
            "channels": 1,
            "durationSeconds": round(joined.size / sample_rate, 6),
            "referenceText": reference_text,
            "repeatCount": repeat_count,
            "teacherPath": teacher["path"],
            "teacherSha256": teacher["sha256"],
            "teacherSsml": teacher["ssml"],
            "voice": teacher["voice"],
        }
    if len(receipts) != 8:
        raise ValueError("V23 requires eight repeated matched-target references")
    return receipts


def main() -> None:
    args = parse_args()
    teacher_manifest = read_json(TEACHER_MANIFEST_PATH)
    v22_manifest = read_json(V22_MANIFEST_PATH)
    v22_qa = read_json(V22_QA_PATH)
    if (
        teacher_manifest.get("schemaVersion") != "gaokao-frequency-google-phonetic-teacher-v23"
        or len(teacher_manifest.get("entries", [])) != 8
        or teacher_manifest.get("formalAssetsChanged") is not False
    ):
        raise ValueError("V23 requires eight private Google phonetic teachers")
    if len(v22_manifest.get("entries", [])) != 20 or v22_manifest.get("failures"):
        raise ValueError("V23 requires the complete V22 draw set")

    qa_by_id = {entry["entryId"]: entry for entry in v22_qa["entries"]}
    unresolved_ids = {entry_id for entry_id, entry in qa_by_id.items() if entry["verdict"] == "all_fail"}
    if len(unresolved_ids) != 4:
        raise ValueError("V23 requires exactly four unresolved V22 words")
    if qa_by_id["gaokao-frequency-2952-domain"]["verdict"] != "c22_usable":
        raise ValueError("V23 must preserve the Owner-approved domain C22 candidate")

    base_by_id = {}
    for entry in v22_manifest["entries"]:
        if entry["entryId"] in unresolved_ids and entry["entryId"] not in base_by_id:
            base_by_id[entry["entryId"]] = entry
    if set(base_by_id) != unresolved_ids:
        raise ValueError("V23 base metadata does not match the unresolved set")

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    model_receipt = V12.validate_model(args.model)
    references = build_repeated_references(teacher_manifest["entries"])
    google_metrics = V21.build_google_metrics()
    expected: list[dict[str, Any]] = []
    ordered_ids = [
        "gaokao-frequency-2081-violin",
        "gaokao-frequency-1887-hello",
        "gaokao-frequency-2396-ballet",
        "gaokao-frequency-2823-dolphin",
    ]
    for case_index, entry_id in enumerate(ordered_ids):
        base = base_by_id[entry_id]
        google = google_metrics[(entry_id, "american")]
        google_active = google["durationSeconds"] - google["leadingSilenceSeconds"] - google["trailingSilenceSeconds"]
        for label, config in CANDIDATE_CONFIGS.items():
            teacher_label = "B23" if entry_id == "gaokao-frequency-2081-violin" and label == "A23" else label
            reference = references[(entry_id, teacher_label)]
            expected.append({
                **base,
                "candidateLabel": label,
                "seed": config["seed"] + case_index * 41,
                "temperature": config["temperature"],
                "topK": config["topK"],
                "topP": config["topP"],
                "generationStrategy": "same-voice-matched-target-phonetic-teacher",
                "generationPrompt": f"{base['audioText'].strip().rstrip('.!?')}.",
                "teacherLabel": teacher_label,
                "referenceId": f"{entry_id}--{teacher_label.lower()}",
                "referencePath": reference["path"],
                "referenceSha256": reference["sha256"],
                "referenceText": reference["referenceText"],
                "googleReferenceActiveSeconds": round(google_active, 6),
                "v22OwnerNote": qa_by_id[entry_id]["note"],
            })
    if len(expected) != 8:
        raise ValueError("V23 must contain exactly eight planned candidates")

    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    if MANIFEST_PATH.exists() and not args.replace:
        existing = read_json(MANIFEST_PATH)
        if existing.get("schemaVersion") != SCHEMA:
            raise ValueError(f"Cannot resume a different V23 schema: {MANIFEST_PATH}")
        expected_by_key = {(entry["entryId"], entry["candidateLabel"]): entry for entry in expected}
        for record in existing.get("entries", []):
            key = (record["entryId"], record["candidateLabel"])
            current = expected_by_key.get(key)
            if not current or record.get("seed") != current["seed"] or record.get("referenceSha256") != current["referenceSha256"]:
                continue
            scratch_path = OUTPUT_ROOT / record["path"]
            public_path = ROOT / "app/public" / record["publicPath"].lstrip("/")
            if not scratch_path.exists() or not public_path.exists():
                raise FileNotFoundError(f"Checkpointed V23 candidate is missing: {key}")
            if V12.sha256_file(scratch_path) != record["sha256"] or V12.sha256_file(public_path) != record["sha256"]:
                raise ValueError(f"Checkpointed V23 candidate hash mismatch: {key}")
            entries.append({**current, **record})

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 4,
            "plannedCandidates": 8,
            "strategy": "preserve equator A21 and domain C22; clone from repeated same-voice Google teachers whose audio and ref_text both name the exact target word with explicit X-SAMPA segments and stress contrast",
            "v22OwnerQa": str(V22_QA_PATH.relative_to(ROOT)),
            "teacherManifest": str(TEACHER_MANIFEST_PATH.relative_to(ROOT)),
            "preservedUsable": [
                {"entryId": "gaokao-frequency-2956-equator", "accent": "american", "candidateLabel": "A21"},
                {"entryId": "gaokao-frequency-2952-domain", "accent": "american", "candidateLabel": "C22"},
            ],
            "candidateConfigs": CANDIDATE_CONFIGS,
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
            "references": {f"{entry_id}:{label}": receipt for (entry_id, label), receipt in references.items()},
            "entries": entries,
            "failures": failures,
        }

    attempted = {(entry["entryId"], entry["candidateLabel"]) for entry in entries}
    if len(attempted) == len(expected):
        write_manifest(payload("private_local_candidates_pending_owner_qa"))
        print(json.dumps({"manifest": str(MANIFEST_PATH), "resumed": True, "candidates": len(entries), "failures": 0}, ensure_ascii=False))
        return

    print(f"Loading Qwen Base for {len(expected) - len(attempted)} remaining of 8 V23 candidates", flush=True)
    model = load_model(model_path=str(args.model))
    loaded_references = {
        (entry_id, label): load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for (entry_id, label), receipt in references.items()
    }
    write_manifest(payload("generation_in_progress"))
    seed_offsets = (0, 1, 2, 100, 101, 102)
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-v23-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for case in expected:
            key = (case["entryId"], case["candidateLabel"])
            if key in attempted:
                continue
            reference_key = (case["entryId"], case["teacherLabel"])
            reference = references[reference_key]
            last_error: Exception | None = None
            for generation_attempt, seed_offset in enumerate(seed_offsets):
                generation_seed = case["seed"] + seed_offset
                mx.random.seed(generation_seed)
                results = list(model.generate(
                    case["generationPrompt"],
                    ref_audio=loaded_references[reference_key],
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
                    last_error = RuntimeError(f"Unexpected Qwen V23 result count: {len(results)}")
                    continue
                try:
                    protected, extraction = V18.protect_whole_utterance(results[0].audio, results[0].sample_rate)
                    active_ratio = extraction["directActiveSeconds"] / case["googleReferenceActiveSeconds"]
                    if not V21.MIN_ACTIVE_TO_GOOGLE_RATIO <= active_ratio <= V21.MAX_ACTIVE_TO_GOOGLE_RATIO:
                        raise ValueError(f"V23 bare-word active duration ratio out of range: {active_ratio:.3f}")
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
                        "teacherPath": reference["teacherPath"],
                        "teacherSha256": reference["teacherSha256"],
                        "teacherSsml": reference["teacherSsml"],
                        "path": filename,
                        "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-matched-teacher-v23/{filename}",
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
            print(f"{len(attempted)}/8 {result_label}: {case['headword']} {case['candidateLabel']} (ok={len(entries)}, failed={len(failures)})", flush=True)
            mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
