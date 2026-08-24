#!/usr/bin/env python3

"""Generate a two-candidate hello pilot from a natural teacher cue followed by Google voice anchors."""

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
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-teacher-first-hello-v27"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-teacher-first-hello-v27"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
V21_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/manifest.json"
V24_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-natural-cadence-v24/manifest.json"
V26_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-openvoice-v26/manifest.json"
V26_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-openvoice-v26/owner-qa-summary-v26.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-teacher-first-hello-v27"
ENTRY_ID = "gaokao-frequency-1887-hello"

CANDIDATES = {
    "A27": {
        "seed": 27000,
        "temperature": 0.20,
        "topK": 20,
        "topP": 0.86,
        "anchorLabel": "A21",
        "teacherLabel": "A26",
        "arrangement": "teacher_then_google",
    },
    "B27": {
        "seed": 37000,
        "temperature": 0.28,
        "topK": 28,
        "topP": 0.90,
        "anchorLabel": "B21",
        "teacherLabel": "B26",
        "arrangement": "google_teacher_google",
    },
}
MIN_ACTIVE_RATIO = 0.84
MAX_ACTIVE_RATIO = 1.16
GOOGLE_ANCHOR_SECONDS = 5.8


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V24 = load_module("eqb_google_voice_qwen_v24_for_v27", "scripts/vocabulary/generate-google-voice-qwen-natural-cadence-v24.py")
V21 = V24.V21
V12 = V24.V12
REPAIR = V24.REPAIR


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=MODEL_DEFAULT)
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_manifest(payload: dict[str, Any]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    partial = MANIFEST_PATH.with_suffix(".json.partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(MANIFEST_PATH)


def build_references(v21: dict[str, Any], v26: dict[str, Any]) -> dict[str, dict[str, Any]]:
    reference_root = OUTPUT_ROOT / "references"
    reference_root.mkdir(parents=True, exist_ok=True)
    v21_entries = {(entry["entryId"], entry["candidateLabel"]): entry for entry in v21["entries"]}
    v26_sources = {
        entry["candidateLabel"]: entry
        for entry in v26["entries"]
        if entry["entryId"] == ENTRY_ID
    }
    if set(v26_sources) != {"A26", "B26"}:
        raise ValueError("V27 requires both unconverted V26 hello teacher sources")

    receipts: dict[str, dict[str, Any]] = {}
    for label, config in CANDIDATES.items():
        anchor_entry = v21_entries[(ENTRY_ID, config["anchorLabel"])]
        anchor_receipt = v21["references"][anchor_entry["referenceId"]]
        teacher_entry = v26_sources[config["teacherLabel"]]
        teacher_path = ROOT / teacher_entry["sourcePath"]
        if V12.sha256_file(teacher_path) != teacher_entry["sourceSha256"]:
            raise ValueError(f"V27 teacher hash mismatch: {teacher_path}")
        teacher_samples, teacher_rate = audio_read(teacher_path, dtype="float32", sample_rate=24000, nchannels=1)
        if teacher_rate != 24000:
            raise ValueError("V27 teacher sample-rate mismatch")
        teacher_chunk = np.asarray(teacher_samples, dtype=np.float32).reshape(-1)

        google_chunks = []
        google_words = []
        google_seconds = 0.0
        for anchor in anchor_receipt["entries"]:
            source_path = ROOT / anchor["path"]
            if V12.sha256_file(source_path) != anchor["sha256"]:
                raise ValueError(f"V27 Google anchor hash mismatch: {source_path}")
            samples, sample_rate = audio_read(source_path, dtype="float32", sample_rate=24000, nchannels=1)
            if sample_rate != 24000:
                raise ValueError("V27 Google anchor sample-rate mismatch")
            chunk = np.asarray(samples, dtype=np.float32).reshape(-1)
            google_chunks.append(chunk)
            google_words.append(anchor["headword"])
            google_seconds += chunk.size / sample_rate
            if google_seconds >= GOOGLE_ANCHOR_SECONDS:
                break
        if google_seconds < GOOGLE_ANCHOR_SECONDS:
            raise ValueError("V27 did not collect enough Google voice anchors")

        if config["arrangement"] == "teacher_then_google":
            chunks = [teacher_chunk, *google_chunks]
            reference_words = ["hello", *google_words]
        else:
            split = max(1, len(google_chunks) // 2)
            chunks = [*google_chunks[:split], teacher_chunk, *google_chunks[split:]]
            reference_words = [*google_words[:split], "hello", *google_words[split:]]
        joined = np.concatenate(chunks)
        output_path = reference_root / f"{ENTRY_ID}--{label.lower()}.wav"
        audio_write(output_path, joined, 24000, format="wav")
        receipts[label] = {
            "path": str(output_path.relative_to(ROOT)),
            "sha256": V12.sha256_file(output_path),
            "sampleRate": 24000,
            "channels": 1,
            "durationSeconds": round(joined.size / 24000, 6),
            "referenceText": ". ".join(reference_words) + ".",
            "arrangement": config["arrangement"],
            "teacherPath": teacher_entry["sourcePath"],
            "teacherSha256": teacher_entry["sourceSha256"],
            "teacherInstruction": teacher_entry["voiceDesignInstruction"],
            "googleWords": google_words,
            "googleSeconds": round(google_seconds, 6),
            "voice": anchor_receipt["voice"],
        }
    return receipts


def main() -> None:
    args = parse_args()
    v21 = read_json(V21_MANIFEST_PATH)
    v24 = read_json(V24_MANIFEST_PATH)
    v26 = read_json(V26_MANIFEST_PATH)
    v26_qa = read_json(V26_QA_PATH)
    if v26_qa.get("counts") != {"total": 3, "usable": 0, "failed": 3}:
        raise ValueError("V27 requires the complete V26 Owner rejection")
    if v26.get("status") != "private_local_candidates_pending_owner_qa" or len(v26.get("entries", [])) != 6:
        raise ValueError("V27 requires the complete V26 source receipts")
    if v21.get("schemaVersion") != V21.SCHEMA:
        raise ValueError("V27 requires the V21 same-voice Google anchors")

    base = next((entry for entry in v24["entries"] if entry["entryId"] == ENTRY_ID), None)
    if not base:
        raise ValueError("V27 is missing hello base metadata")
    google = V21.build_google_metrics()[(ENTRY_ID, "american")]
    google_active = google["durationSeconds"] - google["leadingSilenceSeconds"] - google["trailingSilenceSeconds"]
    model_receipt = V12.validate_model(args.model)
    references = build_references(v21, v26)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)

    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 1,
            "plannedCandidates": 2,
            "strategy": "use an unconverted natural Qwen VoiceDesign hello only as a pronunciation cue, then place several seconds of the original 3000-word Google female voice after or around it; Qwen Base performs the sole final generation; no voice conversion, time stretching, or stress gain processing",
            "v26OwnerQa": str(V26_QA_PATH.relative_to(ROOT)),
            "preservedUsable": [
                {"entryId": "gaokao-frequency-2956-equator", "accent": "american", "candidateLabel": "A21"},
                {"entryId": "gaokao-frequency-2952-domain", "accent": "american", "candidateLabel": "C22"},
                {"entryId": "gaokao-frequency-2823-dolphin", "accent": "american", "candidateLabel": "A24"},
            ],
            "candidateConfigs": CANDIDATES,
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
            "references": references,
            "entries": entries,
            "failures": failures,
        }

    write_manifest(payload("generation_in_progress"))
    print("Loading Qwen Base for two hello-only V27 candidates", flush=True)
    model = load_model(model_path=str(args.model))
    loaded_references = {
        label: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for label, receipt in references.items()
    }
    seed_offsets = (0, 1, 2, 100, 101, 102, 200, 201)
    with tempfile.TemporaryDirectory(prefix="eqb-qwen-teacher-first-v27-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for label, config in CANDIDATES.items():
            reference = references[label]
            last_error: Exception | None = None
            for generation_attempt, seed_offset in enumerate(seed_offsets):
                generation_seed = config["seed"] + seed_offset
                mx.random.seed(generation_seed)
                results = list(model.generate(
                    text="hello.",
                    ref_audio=loaded_references[label],
                    ref_text=reference["referenceText"],
                    temperature=config["temperature"],
                    lang_code="English",
                    max_tokens=180,
                    top_k=config["topK"],
                    top_p=config["topP"],
                    repetition_penalty=1.5,
                    stream=False,
                    verbose=False,
                ))
                if len(results) != 1:
                    last_error = RuntimeError(f"Unexpected Qwen V27 result count: {len(results)}")
                    continue
                try:
                    protected, extraction = V24.protect_with_google_envelope(results[0].audio, results[0].sample_rate, google)
                    active_ratio = extraction["directActiveSeconds"] / google_active
                    if not MIN_ACTIVE_RATIO <= active_ratio <= MAX_ACTIVE_RATIO:
                        raise ValueError(f"V27 active duration ratio out of range: {active_ratio:.3f}")
                    signal = V12.validate_candidate_signal(protected, results[0].sample_rate)
                    filename = f"{ENTRY_ID}--american--{label.lower()}.mp3"
                    wav_path = temporary_root / filename.replace(".mp3", ".wav")
                    scratch_path = OUTPUT_ROOT / filename
                    public_path = PUBLIC_ROOT / filename
                    audio_write(wav_path, protected, results[0].sample_rate, format="wav")
                    REPAIR.encode_mp3(wav_path, scratch_path)
                    metrics = V24.measure_google_envelope(scratch_path)
                    if abs(metrics["durationSeconds"] - google["durationSeconds"]) > 0.15:
                        raise ValueError("V27 total duration drift")
                    if abs(metrics["leadingSilenceSeconds"] - google["leadingSilenceSeconds"]) > 0.05:
                        raise ValueError("V27 leading envelope drift")
                    if abs(metrics["trailingSilenceSeconds"] - google["trailingSilenceSeconds"]) > 0.05:
                        raise ValueError("V27 trailing envelope drift")
                    public_path.write_bytes(scratch_path.read_bytes())
                    entries.append({
                        **base,
                        "candidateLabel": label,
                        "generationSeed": generation_seed,
                        "generationAttempt": generation_attempt,
                        "generationPrompt": "hello.",
                        "generationStrategy": "teacher-cue-before-google-voice-final-qwen-base-generation",
                        "referencePath": reference["path"],
                        "referenceSha256": reference["sha256"],
                        "referenceText": reference["referenceText"],
                        "referenceArrangement": reference["arrangement"],
                        "teacherPath": reference["teacherPath"],
                        "teacherSha256": reference["teacherSha256"],
                        "googleReferenceWords": reference["googleWords"],
                        "googleReferenceSeconds": reference["googleSeconds"],
                        "activeToGoogleRatio": round(active_ratio, 6),
                        "path": filename,
                        "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-teacher-first-hello-v27/{filename}",
                        "bytes": scratch_path.stat().st_size,
                        "sha256": V12.sha256_file(scratch_path),
                        **extraction,
                        **signal,
                        **metrics,
                    })
                    last_error = None
                    break
                except ValueError as error:
                    last_error = error
            if last_error is not None:
                failures.append({"entryId": ENTRY_ID, "headword": "hello", "candidateLabel": label, "error": str(last_error)})
                result = "failed"
            else:
                result = "generated"
            write_manifest(payload("generation_in_progress"))
            print(f"{len(entries) + len(failures)}/2 {result}: hello {label}", flush=True)
            mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
